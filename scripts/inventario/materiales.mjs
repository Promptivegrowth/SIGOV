#!/usr/bin/env node
/**
 * SIGOV · El maestro de materiales, desde la lista que entregó Servicon.
 *
 *   node scripts/inventario/materiales.mjs "<Lista de Materiales.pdf>" [--cargar]
 *
 * Sin --cargar dice lo que haría. La lista trae nombre y unidad, sin código
 * y sin categoría; aquí se le pone las dos.
 *
 * Lo que se corrige y lo que no:
 *   · Espacios de más y dos erratas evidentes —«NEW JERSER», «COLOR
 *     COLOR»— se corrigen y se dice.
 *   · El mismo material escrito dos veces, que solo difiere en una tilde,
 *     queda una vez.
 *   · Dos nombres que parecen el mismo material pero no son idénticos
 *     —«terminal cola de pez para barrera triple onda» y el mismo «de
 *     seguridad … H2W3»— se dejan los dos y se avisa: fusionarlos a ciegas
 *     puede hacer desaparecer uno que sí existe.
 *   · Los nombres quedan en mayúsculas, como vienen: es como los escribe
 *     el almacén y como los buscan los proveedores.
 *
 * El código es por categoría y correlativo dentro de ella (PIN-001,
 * SEN-001…), en orden alfabético. Se calcula aquí y no en la base porque
 * una inserción de muchas filas no ve sus propias filas: el disparador que
 * da el siguiente código les daría a todas el mismo. El disparador queda
 * para las altas de una en una.
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
const PDF = process.argv.slice(2).find((a) => !a.startsWith('--')) ||
  'C:/Users/LUIGI/Desktop/SIGOV INVENTARIO/Lista de Materiales (1).pdf'
const CARGAR = process.argv.includes('--cargar')

// ─── Leer la lista ─────────────────────────────────────────────────────────

const texto = execFileSync('python', ['-c', `
import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
print('\\n'.join((p.extract_text() or '') for p in r.pages))
`, PDF], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })

// Las unidades de la lista, con la del sistema a la que corresponden.
const UNIDAD = {
  UNI: 'UND', M3: 'M3', M2: 'M2', GAL: 'GAL', PK: 'PQT', BLS: 'BLS', BJ: 'BJ',
  KGR: 'KG', KG: 'KG', CY: 'CIL', JGO: 'JGO', SAC: 'SAC',
}

const avisos = []
const corregir = (n) => {
  let s = n.replace(/\s+/g, ' ').trim()
  const antes = s
  s = s.replace(/\bNEW JERSER\b/g, 'NEW JERSEY').replace(/\bCOLOR COLOR\b/g, 'COLOR')
  if (s !== antes) avisos.push(`errata corregida: «${antes}» → «${s}»`)
  return s
}

const crudos = []
for (const linea of texto.split('\n').map((l) => l.trim()).filter(Boolean)) {
  if (/^Materiales\s+Unidad$/i.test(linea)) continue
  const m = linea.match(/^(.*\S)\s+([A-Z0-9]{1,4})$/)
  if (!m || !UNIDAD[m[2]]) {
    avisos.push(`línea que no se entendió: «${linea}»`)
    continue
  }
  crudos.push({ nombre: corregir(m[1]), unidad: m[2] })
}

// ─── Duplicados ────────────────────────────────────────────────────────────

const clave = (s) => s.normalize('NFD').replace(/\p{Mn}+/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const unicos = new Map()
for (const c of crudos) {
  const k = clave(c.nombre)
  if (unicos.has(k)) {
    const prev = unicos.get(k)
    avisos.push(`duplicado fusionado: «${prev.nombre}» y «${c.nombre}» (${c.unidad})`)
    // Queda la forma bien escrita: «METÁLICO», no «METALICO».
    const tildes = (s) => (s.normalize('NFD').match(/\p{Mn}/gu) ?? []).length
    if (tildes(c.nombre) > tildes(prev.nombre)) prev.nombre = c.nombre
    continue
  }
  unicos.set(k, c)
}
const lista = [...unicos.values()]

// Parecidos que no se fusionan: uno contiene al otro palabra por palabra.
const palabras = (s) => new Set(clave(s).split(' '))
for (let i = 0; i < lista.length; i++) {
  for (let j = i + 1; j < lista.length; j++) {
    const a = palabras(lista[i].nombre)
    const b = palabras(lista[j].nombre)
    const [menor, mayor] = a.size <= b.size ? [a, b] : [b, a]
    // Solo cuando se diferencian en pocas palabras: «barrera triple onda» y
    // «terminal cola de pez para barrera triple onda» son cosas distintas.
    if (menor.size >= 5 && mayor.size - menor.size <= 3 &&
        [...menor].every((w) => mayor.has(w)) && lista[i].unidad === lista[j].unidad) {
      avisos.push(`posible duplicado, se dejan los dos: «${lista[i].nombre}» · «${lista[j].nombre}»`)
    }
  }
}

// ─── Categoría ─────────────────────────────────────────────────────────────
// El orden importa: la arandela del captafaro es ferretería, no
// señalización, aunque diga captafaro.

const REGLAS = [
  ['FER', /\b(PERNO|PERNOS|TUERCA|ARANDELA|PERNERIA)\b/],
  ['ADH', /\b(PEGAMENTO|SIKADUR|SIKAFLEX|SIKAGROUT|SIKAREP)\b/],
  // «Bolsa» sola no basta: la microesfera de vidrio viene «en bolsa x 25 kg»
  // y es señalización. La de limpieza es la bolsa de basura de 220 litros.
  ['LIM', /\b(DETERGENTE|DETERJET)\b|\bBOLSA DE \d+ LT\b/],
  ['ASF', /\b(EMULSION|DETACK)\b/],
  ['AGR', /\b(ARENA|CEMENTO|YESO)\b/],
  ['SEG', /\b(BARRERA|BARRERAS|GUARDAVIA|GUARDAVIAS|TERMINAL|TERMINALES)\b/],
  ['SEN', /\b(SENAL|SENALIZACION|PORTICO|LAMINA|CAPTAFARO|TACHA|TACHONES|DELINEADOR|KILOMETRICO|CHEVRONES|MICROESFERA)\b/],
  ['PIN', /\b(PINTURA|THINNER|DILUYENTE|DISOLVENTE|CATALIZADOR|ZINCROMATO|GALVAPOX|SPRAY|ZINC)\b/],
]
const CATEGORIA = {
  PIN: 'Pinturas y solventes', SEN: 'Señalización', SEG: 'Seguridad vial',
  ASF: 'Asfaltos y emulsiones', AGR: 'Agregados y cemento', FER: 'Ferretería y fijaciones',
  ADH: 'Adhesivos y aditivos', LIM: 'Limpieza', OTR: 'Otros',
}
for (const m of lista) {
  const k = clave(m.nombre)
  m.pref = REGLAS.find(([, re]) => re.test(k))?.[0] ?? 'OTR'
  if (m.pref === 'OTR') avisos.push(`sin categoría clara: «${m.nombre}»`)
}

// ─── Código ────────────────────────────────────────────────────────────────

lista.sort((a, b) => a.pref.localeCompare(b.pref) || a.nombre.localeCompare(b.nombre, 'es'))
const cuenta = {}
for (const m of lista) {
  cuenta[m.pref] = (cuenta[m.pref] ?? 0) + 1
  m.code = `${m.pref}-${String(cuenta[m.pref]).padStart(3, '0')}`
}

// ─── Resumen ───────────────────────────────────────────────────────────────

console.log(`Líneas leídas: ${crudos.length} · materiales: ${lista.length}`)
console.log('Por categoría:', Object.fromEntries(Object.entries(cuenta).map(([k, v]) => [`${k} ${CATEGORIA[k]}`, v])))
console.log('\nAvisos:')
for (const a of avisos) console.log('  ·', a)

if (!CARGAR) {
  console.log('\nMuestra:')
  for (const m of lista) console.log(`  ${m.code}  ${m.nombre}  [${UNIDAD[m.unidad]}]`)
  console.log('\n(sin --cargar no se escribió nada)')
  process.exit(0)
}

// ─── Cargar ────────────────────────────────────────────────────────────────

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: unidades, error: eU } = await sb.from('units').select('id, code')
if (eU) throw eU
const unidadId = Object.fromEntries(unidades.map((u) => [u.code, u.id]))

// Los de demostración: de baja, y con el código liberado. Un código no se
// reutiliza nunca —un pedido antiguo que diga PIN-014 tiene que seguir
// apuntando al mismo material—, pero estos son de prueba y ocupaban justo
// los primeros números: PIN-001, SEN-001, SEG-001. Con el prefijo DEMO- el
// maestro real empieza en 001 y los pedidos de prueba siguen resolviéndose,
// porque apuntan al material por su identificador, no por su código.
const { data: demo, error: eD } = await sb.from('supplies').select('id, code')
  .eq('service_id', SUR).not('code', 'like', 'DEMO-%')
  // Las notas vacías también: un nulo no cumple ni «empieza por» ni «no
  // empieza por», y los materiales de prueba no tienen notas.
  .or('notes.is.null,notes.not.like.Maestro de materiales%')
if (eD) throw eD
for (const d of demo) {
  const { error } = await sb.from('supplies').update({
    code: `DEMO-${d.code}`, is_active: false, deleted_at: new Date().toISOString(),
  }).eq('id', d.id)
  if (error) throw error
}
console.log(`\nDe baja ${demo.length} materiales de demostración (con el prefijo DEMO-).`)

const filas = lista.map((m) => ({
  service_id: SUR,
  code: m.code,
  name: m.nombre,
  category: CATEGORIA[m.pref],
  unit_id: unidadId[UNIDAD[m.unidad]],
  min_stock: 0,
  is_active: true,
  notes: 'Maestro de materiales · lista entregada por Servicon (2026-09)',
}))
const faltanU = filas.filter((f) => !f.unit_id)
if (faltanU.length) throw new Error(`Unidades sin correspondencia: ${faltanU.map((f) => f.name).join(', ')}`)

const { error: eI } = await sb.from('supplies').upsert(filas, { onConflict: 'service_id,code' })
if (eI) throw eI
console.log(`Cargados ${filas.length} materiales.`)
