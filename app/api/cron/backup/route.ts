import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Respaldo automático diario (Módulo 12).
 * Exporta las tablas operativas a JSON y las deposita en el bucket
 * privado `respaldos`, con registro en `backups_log`.
 */
const TABLES = [
  'organizations', 'services', 'service_members', 'profiles',
  'road_sections', 'activities_catalog', 'units', 'crews', 'crew_members',
  'weekly_plans', 'plan_items', 'plan_suspensions',
  'work_orders', 'work_entries', 'evidences',
  'pcis', 'pci_items',
  'asset_types', 'road_assets', 'asset_interventions',
  'safety_talks', 'talk_attendance', 'checklist_templates', 'checklist_responses',
  'ats_iperc', 'ats_signatures',
]

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-cron-secret')
  const authorized =
    (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) ||
    req.headers.get('user-agent')?.includes('vercel-cron')

  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dump: Record<string, any[]> = {}
  let rows = 0

  for (const t of TABLES) {
    const { data, error } = await admin.from(t as any).select('*').limit(50000)
    if (error) continue
    dump[t] = data ?? []
    rows += data?.length ?? 0
  }

  const payload = JSON.stringify(
    { generated_at: new Date().toISOString(), tables: TABLES.length, rows, data: dump },
    null,
    0
  )
  const blob = new Blob([payload], { type: 'application/json' })
  const path = `auto/${stamp}_sigov.json`

  const { error: upErr } = await admin.storage
    .from('respaldos')
    .upload(path, blob, { contentType: 'application/json', upsert: false })

  await admin.from('backups_log').insert({
    kind: 'automatico',
    storage_path: upErr ? null : path,
    size_bytes: blob.size,
    tables_count: TABLES.length,
    rows_count: rows,
    status: upErr ? 'error' : 'ok',
    message: upErr?.message ?? null,
  })

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    path,
    tables: TABLES.length,
    rows,
    size: blob.size,
    at: new Date().toISOString(),
  })
}
