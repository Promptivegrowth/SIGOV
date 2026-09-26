#!/usr/bin/env node
/**
 * SIGOV · Los tomos del Inventario Vial Anual 2024, al archivo del contrato.
 *
 *   node scripts/inventario/documentos.mjs "<carpeta SIGOV INVENTARIO>" [--cargar]
 *
 * Cada tomo —PDF y Excel por subtramo, y la obra adicional— queda en el
 * archivo con su tramo, su título, su fecha de emisión y etiquetas para
 * buscarlo. También la lista de materiales. La fecha es la que el propio
 * PDF lleva en sus metadatos: se emitieron entre el 30 de setiembre y el 6
 * de octubre de 2025. El Excel toma la de su PDF gemelo.
 *
 * Repetible: lo que ya está en el archivo con la misma ruta no se duplica.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const SUR = '22222222-2222-4222-8222-222222222221'
const BASE = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'C:/Users/LUIGI/Desktop/SIGOV INVENTARIO'
const CARGAR = process.argv.includes('--cargar')

/**
 * La ruta en el almacenamiento, en ASCII. Supabase rechaza la «í» de «Vía»
 * en la clave del archivo; el nombre original se conserva en file_name,
 * que es el que se ofrece al descargar.
 */
const rutaSegura = (archivo) => {
  const ext = path.extname(archivo).toLowerCase()
  const base = path.basename(archivo, path.extname(archivo))
    .normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base + ext
}

const TOMOS = {
  '01': { tramo: 'AQP-01', subtramo: 'Subtramo 1', km: '852+335 – 973+884' },
  '02': { tramo: 'AQP-02', subtramo: 'Subtramo 2', km: '988+529 – 1146+763' },
  '03': { tramo: 'TAC-01', subtramo: 'Subtramo 3', km: '1184+683 – 1297+993' },
  '04': { tramo: 'TAC-02', subtramo: 'Subtramo 4', km: '1300+080 – 1335+600' },
  '05': { tramo: 'VA-01', subtramo: 'Obra adicional', km: '0+000 – 1+380' },
}

/** La fecha de emisión que el PDF lleva escrita. */
function fechaPdf(archivo) {
  const s = execFileSync('python', ['-c', `
import sys
from pypdf import PdfReader
m = PdfReader(sys.argv[1]).metadata or {}
print(str(m.get('/CreationDate') or ''))
`, archivo], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).trim()
  const m = s.match(/D:(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { data: tramos, error: eT } = await sb.from('road_sections').select('id, code, name')
  .eq('service_id', SUR).is('deleted_at', null)
if (eT) throw eT
const tramo = Object.fromEntries(tramos.map((t) => [t.code, t]))

const docs = []
const carpeta = path.join(BASE, '1-Inventario Vial')
for (const archivo of fs.readdirSync(carpeta).sort()) {
  const t = TOMOS[archivo.slice(0, 2)]
  if (!t) continue
  const ruta = path.join(carpeta, archivo)
  const ext = path.extname(archivo).toLowerCase()
  const pdfGemelo = path.join(carpeta, archivo.replace(/\.xlsx$/i, '.pdf'))
  const fecha = fechaPdf(ext === '.pdf' ? ruta : pdfGemelo)
  const tr = tramo[t.tramo]
  docs.push({
    local: ruta,
    storage_path: `${SUR}/inventario-2024/${rutaSegura(archivo)}`,
    file_name: archivo,
    mime_type: ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: fs.statSync(ruta).size,
    kind: 'inventario',
    title: `Inventario Vial Anual 2024 · ${t.subtramo} · ${tr?.name ?? t.tramo}${ext === '.xlsx' ? ' (Excel)' : ''}`,
    description:
      `Km ${t.km}. ${ext === '.pdf' ? 'Tomo imprimible' : 'Hoja de cálculo original'} del inventario vial ` +
      `anual en formato MTC, entregado por COVINCA. Sus elementos están cargados en el inventario del sistema.`,
    doc_date: fecha,
    section_id: tr?.id ?? null,
    tags: ['inventario vial', '2024', 'COVINCA', t.subtramo.toLowerCase(), ext.slice(1)],
  })
}

const lista = path.join(BASE, 'Lista de Materiales (1).pdf')
if (fs.existsSync(lista)) {
  docs.push({
    local: lista,
    storage_path: `${SUR}/almacen/lista-de-materiales.pdf`,
    file_name: 'Lista de Materiales.pdf',
    mime_type: 'application/pdf',
    size_bytes: fs.statSync(lista).size,
    kind: 'otro',
    title: 'Lista de materiales del almacén',
    description: 'Lista entregada por Servicon. Es la fuente del maestro de materiales: cada uno está cargado con su código por categoría.',
    doc_date: fechaPdf(lista),
    section_id: null,
    tags: ['materiales', 'almacén', 'maestro'],
  })
}

for (const d of docs) console.log(`  ${d.doc_date ?? '—'}  ${d.kind.padEnd(10)}  ${(d.size_bytes / 2 ** 20).toFixed(2).padStart(5)} MB  ${d.title}`)
if (!CARGAR) {
  console.log('\n(sin --cargar no se escribió nada)')
  process.exit(0)
}

for (const d of docs) {
  const { error: eS } = await sb.storage.from('documentos')
    .upload(d.storage_path, fs.readFileSync(d.local), { contentType: d.mime_type, upsert: true })
  if (eS) throw new Error(`${d.file_name}: ${eS.message}`)

  const { local, ...fila } = d
  void local
  const { data: ya } = await sb.from('documents').select('id').eq('storage_path', d.storage_path).is('deleted_at', null)
  const { error } = ya?.length
    ? await sb.from('documents').update(fila).eq('id', ya[0].id)
    : await sb.from('documents').insert({ ...fila, service_id: SUR })
  if (error) throw new Error(`${d.file_name}: ${error.message}`)
}
console.log(`\nEn el archivo: ${docs.length} documentos.`)
