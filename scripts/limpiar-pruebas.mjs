#!/usr/bin/env node
/**
 * SIGOV · Borra lo que dejan las pruebas de altas.
 *
 * Las pruebas escriben contra la base real, así que tienen que dejarla como
 * estaba. Y con el mismo cuidado a la inversa: esta limpieza solo puede tocar
 * lo que las pruebas crearon. Por eso primero se averigua QUÉ documentos son
 * de prueba y después se borran sus archivos uno por uno — barrer la carpeta
 * `ats/` entera se llevó por delante, una vez, las firmas de la demo.
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

// ─── 1) Qué archivos hay que borrar, según lo que crearon las pruebas ─────
const porBorrar = { evidencias: [], firmas: [] }

// Fotos y firma de los checklists de prueba
const { data: chks } = await sb
  .from('checklist_responses')
  .select('id, answers, signature_path')
  .like('findings', 'Prueba %')

for (const c of chks ?? []) {
  for (const v of Object.values(c.answers ?? {})) {
    if (typeof v === 'string' && v.includes('/checklists/')) porBorrar.evidencias.push(v)
  }
  if (c.signature_path) porBorrar.firmas.push(c.signature_path)
}

// Fotos sueltas que el checklist encoló como evidencias
const { data: evs } = await sb
  .from('evidences')
  .select('storage_path')
  .like('storage_path', '%/checklists/%')
  .gt('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
for (const e of evs ?? []) porBorrar.evidencias.push(e.storage_path)

// Firmas de los ATS de prueba: solo las de esos ATS, no las de la carpeta
const { data: atsPrueba } = await sb
  .from('ats_iperc')
  .select('id, supervisor_signature_path, ats_signatures(signature_path)')
  .like('task', 'Prueba ATS %')

for (const a of atsPrueba ?? []) {
  if (a.supervisor_signature_path) porBorrar.firmas.push(a.supervisor_signature_path)
  for (const s of a.ats_signatures ?? []) {
    if (s.signature_path) porBorrar.firmas.push(s.signature_path)
  }
}

// ─── 2) Las filas ─────────────────────────────────────────────────────────
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

// ─── 3) Y sus archivos ────────────────────────────────────────────────────
let borrados = 0
for (const [bucket, rutas] of Object.entries(porBorrar)) {
  const unicas = [...new Set(rutas)]
  if (!unicas.length) continue
  const { error } = await sb.storage.from(bucket).remove(unicas)
  if (error) console.log(`  ${C.bad}✗${C.reset} ${bucket}: ${error.message}`)
  else borrados += unicas.length
}

console.log(`${C.ok}✓${C.reset} base limpia ${C.dim}· ${borrados} archivos de prueba eliminados${C.reset}`)
