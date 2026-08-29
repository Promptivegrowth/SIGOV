'use client'

import Dexie, { type EntityTable } from 'dexie'
import { uuid } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Base de datos local (IndexedDB)
// Equivalente al SQLite prometido en la propuesta para la app nativa.
// Espejo de lectura + outbox de escritura.
// ═══════════════════════════════════════════════════════════════════════════

export type OutboxStatus = 'pendiente' | 'sincronizando' | 'sincronizado' | 'error'

export interface OutboxItem {
  client_id: string
  table: string
  op: 'insert' | 'update' | 'upsert'
  payload: Record<string, any>
  /** client_id del registro padre: no se envía hasta que el padre esté sincronizado */
  depends_on?: string | null
  status: OutboxStatus
  attempts: number
  next_attempt_at: number
  last_error?: string | null
  service_id?: string | null
  label: string
  created_at: number
  synced_at?: number | null
  server_id?: string | null
}

export interface LocalBlob {
  client_id: string
  bucket: string
  path: string
  blob: Blob
  content_type: string
  size: number
  uploaded: boolean
  created_at: number
}

export interface MetaRow {
  key: string
  value: any
  updated_at: number
}

/** Espejo local de datos del servidor (pull selectivo) */
export interface MirrorRow {
  id: string
  table: string
  service_id: string | null
  data: Record<string, any>
  updated_at: string
  pulled_at: number
}

class SigovDB extends Dexie {
  outbox!: EntityTable<OutboxItem, 'client_id'>
  blobs!: EntityTable<LocalBlob, 'client_id'>
  meta!: EntityTable<MetaRow, 'key'>
  mirror!: EntityTable<MirrorRow, 'id'>

  constructor() {
    super('sigov')
    this.version(1).stores({
      outbox: 'client_id, table, status, created_at, depends_on, service_id, next_attempt_at',
      blobs: 'client_id, uploaded, created_at',
      meta: 'key',
      mirror: 'id, table, service_id, updated_at, [table+service_id]',
    })
  }
}

export const db = new SigovDB()

// ─── Meta helpers ─────────────────────────────────────────────────────────
export async function getMeta<T = any>(key: string, fallback?: T): Promise<T | undefined> {
  const row = await db.meta.get(key)
  return (row?.value as T) ?? fallback
}

export async function setMeta(key: string, value: any) {
  await db.meta.put({ key, value, updated_at: Date.now() })
}

/** Identificador estable del dispositivo, sembrado en el primer uso */
export async function getDeviceId(): Promise<string> {
  let id = await getMeta<string>('device_id')
  if (!id) {
    id = `DEV-${uuid().slice(0, 8).toUpperCase()}`
    await setMeta('device_id', id)
  }
  return id
}

// ─── Outbox ───────────────────────────────────────────────────────────────
export async function enqueue(params: {
  table: string
  op?: OutboxItem['op']
  payload: Record<string, any>
  client_id?: string
  depends_on?: string | null
  service_id?: string | null
  label: string
}): Promise<string> {
  const client_id = params.client_id ?? uuid()
  await db.outbox.put({
    client_id,
    table: params.table,
    op: params.op ?? 'insert',
    payload: { ...params.payload, client_id },
    depends_on: params.depends_on ?? null,
    status: 'pendiente',
    attempts: 0,
    next_attempt_at: Date.now(),
    service_id: params.service_id ?? null,
    label: params.label,
    created_at: Date.now(),
  })
  return client_id
}

export async function enqueueBlob(params: {
  client_id: string
  bucket: string
  path: string
  blob: Blob
}) {
  await db.blobs.put({
    client_id: params.client_id,
    bucket: params.bucket,
    path: params.path,
    blob: params.blob,
    content_type: params.blob.type || 'image/webp',
    size: params.blob.size,
    uploaded: false,
    created_at: Date.now(),
  })
}

export async function outboxCounts() {
  const [pendiente, sincronizando, error, total] = await Promise.all([
    db.outbox.where('status').equals('pendiente').count(),
    db.outbox.where('status').equals('sincronizando').count(),
    db.outbox.where('status').equals('error').count(),
    db.outbox.count(),
  ])
  return { pendiente, sincronizando, error, total, sincronizado: total - pendiente - sincronizando - error }
}

/** Purga lo ya sincronizado hace más de N días (libera cuota del dispositivo) */
export async function purgeSynced(days = 7) {
  const cutoff = Date.now() - days * 86400000
  const done = await db.outbox
    .where('status')
    .equals('sincronizado')
    .filter((o) => (o.synced_at ?? o.created_at) < cutoff)
    .toArray()

  const ids = done.map((d) => d.client_id)
  await db.outbox.bulkDelete(ids)

  const blobs = await db.blobs.filter((b) => b.uploaded && b.created_at < cutoff).toArray()
  await db.blobs.bulkDelete(blobs.map((b) => b.client_id))

  return { outbox: ids.length, blobs: blobs.length }
}

// ─── Espejo local ─────────────────────────────────────────────────────────
export async function putMirror(table: string, rows: any[], serviceId: string | null) {
  if (!rows?.length) return 0
  const now = Date.now()
  await db.mirror.bulkPut(
    rows.map((r) => ({
      id: `${table}:${r.id}`,
      table,
      service_id: r.service_id ?? serviceId ?? null,
      data: r,
      updated_at: r.updated_at ?? r.created_at ?? new Date().toISOString(),
      pulled_at: now,
    }))
  )
  return rows.length
}

export async function getMirror<T = any>(table: string, serviceId?: string | null): Promise<T[]> {
  const rows = serviceId
    ? await db.mirror.where('[table+service_id]').equals([table, serviceId]).toArray()
    : await db.mirror.where('table').equals(table).toArray()
  return rows.map((r) => r.data as T)
}

export async function clearAllLocal() {
  await Promise.all([db.outbox.clear(), db.blobs.clear(), db.mirror.clear()])
}

/** Pide almacenamiento persistente para que el navegador no borre las evidencias */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota, pct: quota ? (usage / quota) * 100 : 0 }
}
