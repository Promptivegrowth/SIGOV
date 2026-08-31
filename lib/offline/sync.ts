'use client'

import { createClient } from '@/lib/supabase/client'
import {
  db, getDeviceId, putMirror, setMeta, getMeta, purgeSynced,
  type OutboxItem,
} from './db'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Motor de sincronización
//
//  PUSH  outbox → servidor, con:
//        · idempotencia por client_id (reintentar nunca duplica)
//        · orden garantizado por dependencias (la foto va tras su registro)
//        · backoff exponencial 2s → 5min
//  PULL  servidor → espejo local, selectivo por servicio/cuadrilla/semana
// ═══════════════════════════════════════════════════════════════════════════

const MAX_ATTEMPTS = 8
const BASE_BACKOFF = 2000
const MAX_BACKOFF = 300_000

export interface SyncResult {
  pushed: number
  pulled: number
  failed: number
  blobs: number
  durationMs: number
  error?: string
}

let running = false
const listeners = new Set<(state: SyncState) => void>()

export interface SyncState {
  running: boolean
  lastSyncAt: number | null
  lastResult: SyncResult | null
  online: boolean
}

let state: SyncState = {
  running: false,
  lastSyncAt: null,
  lastResult: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
}

export function subscribeSync(fn: (s: SyncState) => void) {
  listeners.add(fn)
  fn(state)
  return () => {
    listeners.delete(fn)
  }
}

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    emit({ online: true })
    void syncNow()
  })
  window.addEventListener('offline', () => emit({ online: false }))
}

/**
 * Qué columna del hijo apunta al padre, según la tabla de cada uno.
 * Cuando el padre recién nace en el servidor, aquí se le pega su id real.
 */
const PARENT_FK: Record<string, Record<string, string>> = {
  work_entries: { work_orders: 'work_order_id' },
  evidences: { work_entries: 'work_entry_id' },
  ats_signatures: { ats_iperc: 'ats_id' },
  checklist_responses: { work_orders: 'work_order_id' },
}

function backoff(attempts: number) {
  return Math.min(BASE_BACKOFF * 2 ** attempts, MAX_BACKOFF)
}

// ─── PUSH ─────────────────────────────────────────────────────────────────
async function pushOutbox(): Promise<{ pushed: number; failed: number; blobs: number }> {
  const sb = createClient()
  let pushed = 0
  let failed = 0
  let blobsUp = 0

  const now = Date.now()
  const queue = await db.outbox
    .where('status')
    .anyOf('pendiente', 'error')
    .filter((o) => o.next_attempt_at <= now && o.attempts < MAX_ATTEMPTS)
    .sortBy('created_at')

  // Índice de lo ya sincronizado, para resolver dependencias
  const syncedIds = new Set(
    (await db.outbox.where('status').equals('sincronizado').toArray()).map((o) => o.client_id)
  )

  for (const item of queue) {
    // El padre debe estar sincronizado antes que el hijo
    if (item.depends_on && !syncedIds.has(item.depends_on)) continue

    await db.outbox.update(item.client_id, { status: 'sincronizando' })

    try {
      // Si depende de un padre, resolvemos su id real en el servidor
      const payload = { ...item.payload }
      if (item.depends_on) {
        const parent = await db.outbox.get(item.depends_on)
        const fk = parent?.table ? PARENT_FK[item.table]?.[parent.table] : undefined
        if (parent?.server_id && fk) payload[fk] = parent.server_id
      }

      const { data, error } = await sb
        .from(item.table as any)
        .upsert(payload, { onConflict: 'client_id', ignoreDuplicates: false })
        .select('id')
        .single()

      if (error) throw error

      await db.outbox.update(item.client_id, {
        status: 'sincronizado',
        synced_at: Date.now(),
        server_id: (data as any)?.id ?? null,
        last_error: null,
      })
      syncedIds.add(item.client_id)
      pushed++

      // Subir el blob asociado (evidencia / firma)
      const blob = await db.blobs.get(item.client_id)
      if (blob && !blob.uploaded) {
        const { error: upErr } = await sb.storage
          .from(blob.bucket)
          .upload(blob.path, blob.blob, { contentType: blob.content_type, upsert: true })
        if (!upErr) {
          await db.blobs.update(blob.client_id, { uploaded: true })
          blobsUp++
        }
      }
    } catch (e: any) {
      const attempts = item.attempts + 1
      await db.outbox.update(item.client_id, {
        status: 'error',
        attempts,
        next_attempt_at: Date.now() + backoff(attempts),
        last_error: e?.message ?? String(e),
      })
      failed++
    }
  }

  return { pushed, failed, blobs: blobsUp }
}

// ─── PULL selectivo ───────────────────────────────────────────────────────
interface PullScope {
  serviceId: string
  crewId?: string | null
  role?: string
}

async function pullMirror(scope: PullScope): Promise<number> {
  const sb = createClient()
  const { serviceId, crewId } = scope
  let total = 0

  const today = new Date()
  const weekAgo = new Date(today.getTime() - 10 * 86400000).toISOString().slice(0, 10)
  const weekAhead = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)

  // Catálogos: siempre completos (son pequeños y se usan offline)
  const catalogs: [string, any][] = [
    ['activities_catalog', sb.from('activities_catalog').select('*').eq('service_id', serviceId).is('deleted_at', null)],
    ['road_sections', sb.from('road_sections').select('id,service_id,code,name,route_code,prog_start_m,prog_end_m,surface,color,updated_at').eq('service_id', serviceId).is('deleted_at', null)],
    ['crews', sb.from('crews').select('*').eq('service_id', serviceId).is('deleted_at', null)],
    ['units', sb.from('units').select('*')],
    ['asset_types', sb.from('asset_types').select('*')],
  ]

  // Operación: solo la ventana relevante
  const operational: [string, any][] = [
    ['plan_items', sb.from('v_plan_items').select('*').eq('service_id', serviceId)
      .gte('scheduled_on', weekAgo).lte('scheduled_on', weekAhead)
      .order('scheduled_on')],
    ['pci_items', sb.from('v_pci_items').select('*').eq('service_id', serviceId)
      .in('status', ['pendiente', 'en_atencion'])
      .order('due_date').limit(500)],
    ['work_orders', sb.from('work_orders').select('*').eq('service_id', serviceId)
      .gte('work_date', weekAgo).is('deleted_at', null)],
    ['checklist_templates', sb.from('checklist_templates').select('*').eq('service_id', serviceId).eq('is_active', true)],
  ]

  const queries = [...catalogs, ...operational]
  const results = await Promise.allSettled(queries.map(([, q]) => q))

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const table = queries[i][0]
    if (r.status === 'fulfilled' && !r.value.error && r.value.data) {
      let rows = r.value.data as any[]
      // El jefe de cuadrilla solo necesita lo suyo
      if (crewId && (table === 'plan_items' || table === 'work_orders')) {
        rows = rows.filter((x) => !x.crew_id || x.crew_id === crewId)
      }
      total += await putMirror(table, rows, serviceId)
    }
  }

  await setMeta(`last_pull:${serviceId}`, Date.now())
  return total
}

// ─── Orquestador ──────────────────────────────────────────────────────────
export async function syncNow(scope?: PullScope): Promise<SyncResult> {
  if (running) return state.lastResult ?? { pushed: 0, pulled: 0, failed: 0, blobs: 0, durationMs: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { pushed: 0, pulled: 0, failed: 0, blobs: 0, durationMs: 0, error: 'offline' }
  }

  running = true
  emit({ running: true })
  const t0 = performance.now()

  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, blobs: 0, durationMs: 0 }

  try {
    const push = await pushOutbox()
    result.pushed = push.pushed
    result.failed = push.failed
    result.blobs = push.blobs

    const activeScope = scope ?? (await getMeta<PullScope>('sync_scope'))
    if (activeScope?.serviceId) {
      result.pulled = await pullMirror(activeScope)
      await setMeta('sync_scope', activeScope)
    }

    await purgeSynced(7)

    // Registrar la sesión de sincronización en el servidor (trazabilidad)
    if (activeScope?.serviceId && (result.pushed > 0 || result.pulled > 0)) {
      try {
        const sb = createClient()
        const { data: auth } = await sb.auth.getUser()
        if (auth.user) {
          await sb.from('sync_sessions').insert({
            profile_id: auth.user.id,
            service_id: activeScope.serviceId,
            device_id: await getDeviceId(),
            pushed_count: result.pushed,
            pulled_count: result.pulled,
            failed_count: result.failed,
            duration_ms: Math.round(performance.now() - t0),
            finished_at: new Date().toISOString(),
          })
        }
      } catch {
        /* la trazabilidad no debe romper la sincronización */
      }
    }
  } catch (e: any) {
    result.error = e?.message ?? String(e)
  } finally {
    result.durationMs = Math.round(performance.now() - t0)
    running = false
    emit({ running: false, lastSyncAt: Date.now(), lastResult: result })
  }

  return result
}

/** Reintenta manualmente los registros en error */
export async function retryFailed() {
  const failed = await db.outbox.where('status').equals('error').toArray()
  await db.outbox.bulkPut(
    failed.map((f) => ({ ...f, status: 'pendiente' as const, attempts: 0, next_attempt_at: Date.now() }))
  )
  return syncNow()
}

/** Registra la sincronización en segundo plano del Service Worker */
export async function registerBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg: any = await navigator.serviceWorker.ready
    if ('sync' in reg) {
      await reg.sync.register('sigov-sync')
      return true
    }
  } catch {
    /* iOS no lo soporta: se sincroniza en primer plano */
  }
  return false
}

let interval: ReturnType<typeof setInterval> | null = null

export function startAutoSync(scope: PullScope, everyMs = 90_000) {
  void setMeta('sync_scope', scope)
  if (interval) clearInterval(interval)
  void syncNow(scope)
  interval = setInterval(() => void syncNow(scope), everyMs)
  return () => {
    if (interval) clearInterval(interval)
    interval = null
  }
}
