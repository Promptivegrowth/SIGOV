#!/usr/bin/env node
/**
 * SIGOV · Borra lo que dejan las pruebas de altas.
 *
 * Las pruebas escriben contra la base real, así que tienen que dejarla como
 * estaba. Las filas se borran por SQL; los archivos, por la API de Storage
 * (la base bloquea el borrado directo de `storage.objects` a propósito).
 *
 *   node scripts/limpiar-pruebas.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const C = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', reset: '\x1b[0m' }

// ─── 1) Filas ─────────────────────────────────────────────────────────────
const SQL = [
  `delete from public.ats_signatures where ats_id in (select id from public.ats_iperc where task like 'Prueba ATS %')`,
  `delete from public.ats_iperc where task like 'Prueba ATS %'`,
  `delete from public.checklist_responses where findings like 'Prueba %'`,
  `delete from public.evidences where storage_path like '%/checklists/%' and created_at > now() - interval '6 hours'`,
  `delete from public.asset_interventions where notes like 'Descolmatación de prueba %'`,
  `delete from public.road_assets where name like '%de prueba %'`,
  `delete from public.checklist_templates where code like 'TST-%'`,
  `delete from public.services where name like 'Contrato de prueba %'`,
  `delete from public.road_sections where name like 'Tramo de prueba %'`,
].join('; ')

execFileSync(process.execPath, ['scripts/sql.mjs', 'query', SQL], { stdio: 'pipe' })

// ─── 2) Archivos ──────────────────────────────────────────────────────────
/** Recorre un prefijo del bucket y devuelve las rutas completas que encuentra. */
async function listar(bucket, prefijo, profundidad = 0) {
  const { data, error } = await sb.storage.from(bucket).list(prefijo, { limit: 1000 })
  if (error || !data) return []
  const rutas = []
  for (const item of data) {
    const ruta = prefijo ? `${prefijo}/${item.name}` : item.name
    // Sin metadata es una carpeta: hay que bajar un nivel más
    if (!item.metadata && profundidad < 3) rutas.push(...(await listar(bucket, ruta, profundidad + 1)))
    else if (item.metadata) rutas.push(ruta)
  }
  return rutas
}

const { data: servicios } = await sb.from('services').select('id')
let borrados = 0

for (const s of servicios ?? []) {
  // Fotos de los checklists de prueba y firmas de los ATS de prueba
  for (const [bucket, carpeta] of [['evidencias', 'checklists'], ['firmas', 'checklists'], ['firmas', 'ats']]) {
    const rutas = await listar(bucket, `${s.id}/${carpeta}`)
    if (!rutas.length) continue
    const { error } = await sb.storage.from(bucket).remove(rutas)
    if (error) console.log(`  ${C.bad}✗${C.reset} ${bucket}/${carpeta}: ${error.message}`)
    else borrados += rutas.length
  }
}

console.log(`${C.ok}✓${C.reset} base limpia ${C.dim}· ${borrados} archivos de prueba eliminados${C.reset}`)
