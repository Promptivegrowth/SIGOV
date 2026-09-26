#!/usr/bin/env node
/**
 * SIGOV · Cargar el Inventario Vial Anual 2024 de COVINCA.
 *
 *   node scripts/inventario/cargar.mjs --simular        dice lo que haría
 *   node scripts/inventario/cargar.mjs --elementos      da de baja la demo y carga los elementos
 *   node scripts/inventario/cargar.mjs --fotos          sube las fotos y las vincula
 *
 * Lee lo que dejaron los pasos anteriores:
 *   inventario.json    los elementos, de leer-excel.mjs
 *   fotos-indice.json  las fotos, de indexar-fotos.py
 *   optimizadas/       las fotos ya en WebP, de optimizar-fotos.mjs
 *
 * Todo es repetible. Cada elemento lleva un identificador derivado de dónde
 * salió —archivo, hoja y fila— y cada foto el de su huella, así que si la
 * carga se corta o se vuelve a correr, lo que ya estaba se reconoce y no se
 * duplica.
 *
 * Dónde se pone cada elemento:
 *   · Con la coordenada del Excel si cae a menos de 60 m de la vía y a
 *     menos de 500 m de su progresiva. Es la medición de campo, y sabe si
 *     el elemento está a la derecha o a la izquierda.
 *   · Si no, sobre la traza oficial en su progresiva —calibrada con los
 *     hitos del MTC—, apartado unos metros hacia su lado. La coordenada
 *     original no se pierde: queda en el elemento con el motivo.
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { prepararTraza, proyectar, puntoEn } from './medir-ubicaciones.mjs'
import { vincular } from './vincular-fotos.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')

// ─── Entorno ───────────────────────────────────────────────────────────────

for (const l of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const TRABAJO = process.env.INVENTARIO_TRABAJO
if (!TRABAJO) {
  console.error('Falta INVENTARIO_TRABAJO: la carpeta con inventario.json, fotos-indice.json y optimizadas/')
  process.exit(1)
}

const SUR = '22222222-2222-4222-8222-222222222221'
const SIMULAR = process.argv.includes('--simular')
const FASE_ELEMENTOS = process.argv.includes('--elementos')
const FASE_FOTOS = process.argv.includes('--fotos')
const CARPETA_STORAGE = `${SUR}/inventario-2024`

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ─── Identificadores estables ──────────────────────────────────────────────

/** Un UUID que depende solo del texto: el mismo origen da siempre el mismo. */
function uuidDe(texto) {
  const h = crypto.createHash('sha256').update(`sigov-inventario-2024|${texto}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// ─── Lo que ya está preparado ──────────────────────────────────────────────

const leer = (f) => JSON.parse(fs.readFileSync(path.join(TRABAJO, f), 'utf8'))
const { elementos, incidencias } = leer('inventario.json')
const indice = leer('fotos-indice.json')
const optimizadas = leer('optimizadas/resultado.json')

const trazasCrudas = JSON.parse(
  execFileSync('node', [path.join(RAIZ, 'scripts', 'importar-kmz.mjs'), '--json'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
)
const trazas = Object.fromEntries(trazasCrudas.map((t) => [t.code, prepararTraza(t)]))

// ─── Nombres y códigos ─────────────────────────────────────────────────────

const NOMBRE_TIPO = {
  ALC: 'Alcantarilla', BAD: 'Badén', BER: 'Berma', CAL: 'Calzada', DRL: 'Drenaje longitudinal',
  GUA: 'Guardavía', PDL: 'Poste delineador', BAR: 'Barrera', PUE: 'Puente', SEH: 'Señalización horizontal',
  SEV: 'Señal', HIT: 'Hito kilométrico', TUN: 'Túnel', MUR: 'Muro', RDV: 'Reductor de velocidad',
  RES: 'Resonador',
}

const prog = (m) => {
  const km = Math.floor(m / 1000)
  const r = Math.round(m - km * 1000)
  return `${km}+${String(r).padStart(3, '0')}`
}
const LADO_CORTO = { derecho: 'der.', izquierdo: 'izq.', eje: 'eje', ambos: 'ambos' }

/** Un nombre que se entienda en la lista y en el mapa. */
function nombre(e) {
  const a = e.atributos
  const p = prog(e.progresiva_m)
  if ((e.tipo === 'PUE' || e.tipo === 'TUN') && a.observaciones && !/^\d/.test(a.observaciones)) {
    return `${a.observaciones} ${p}`
  }
  if (e.tipo === 'HIT') return `Hito km ${Math.round(e.progresiva_m / 1000)}`
  if (e.tipo === 'SEV' && a.clasificacion) return `Señal ${a.clasificacion.toLowerCase()} ${p}`
  if (e.tipo === 'SEH' && a.clasificacion) {
    return `${a.clasificacion.charAt(0)}${a.clasificacion.slice(1).toLowerCase()}${e.side ? ` ${LADO_CORTO[e.side]}` : ''} ${p}`
  }
  if (e.tipo === 'RDV' || e.tipo === 'RES') return `${NOMBRE_TIPO[e.tipo]} ${p}`
  return `${NOMBRE_TIPO[e.tipo]}${e.side ? ` ${LADO_CORTO[e.side]}` : ''} ${p}`
}

// ─── Dónde va cada elemento ────────────────────────────────────────────────

const LEJOS_M = 60
const DESVIO_M = 500

function ubicar(e) {
  const t = trazas[e.tramo]
  if (!t) {
    // La vía alterna no está en el KMZ: su única fuente es el Excel.
    return e.inicio ? { ...e.inicio, ubicacion: 'campo' } : null
  }
  if (e.inicio) {
    const p = proyectar(t, e.inicio.lat, e.inicio.lng)
    const desvio = Math.abs(p.progresiva - e.progresiva_m)
    if (p.distancia <= LEJOS_M && desvio <= DESVIO_M) return { ...e.inicio, ubicacion: 'campo' }
    const motivo = p.distancia > LEJOS_M && desvio > DESVIO_M
      ? `a ${Math.round(p.distancia)} m de la vía y en el km ${(p.progresiva / 1000).toFixed(3)}`
      : p.distancia > LEJOS_M
        ? `a ${Math.round(p.distancia)} m de la vía`
        : `en el km ${(p.progresiva / 1000).toFixed(3)}, no en el de su progresiva`
    return { ...puntoEn(t, e.progresiva_m, e.side), ubicacion: 'progresiva', coordenada_excel: e.inicio, motivo }
  }
  return { ...puntoEn(t, e.progresiva_m, e.side), ubicacion: 'progresiva', motivo: 'el Excel no trae coordenada' }
}

// ─── Las fotos de cada elemento ────────────────────────────────────────────

const { vinculos, huerfanas } = vincular(elementos, indice)
const porHuella = new Map()
for (const f of indice) if (!porHuella.has(f.sha256)) porHuella.set(f.sha256, f)

/** La última vez que se fotografió un elemento, si alguna foto lo dice. */
function ultimaFoto(i) {
  let max = null
  for (const sha of vinculos[i].keys()) {
    const t = porHuella.get(sha)?.tomada
    if (t && (!max || t > max)) max = t
  }
  return max ? max.slice(0, 10) : null
}

// ─── Preparar las filas ────────────────────────────────────────────────────

const { data: tramosDb, error: eTramos } = await sb
  .from('road_sections').select('id, code').eq('service_id', SUR).is('deleted_at', null)
if (eTramos) throw eTramos
const seccion = Object.fromEntries(tramosDb.map((t) => [t.code, t.id]))

const { data: tiposDb, error: eTipos } = await sb.from('asset_types').select('id, code')
if (eTipos) throw eTipos
const tipoId = Object.fromEntries(tiposDb.map((t) => [t.code, t.id]))

// El código, correlativo por tramo y tipo en orden de progresiva.
const orden = elementos.map((e, i) => i).sort((a, b) =>
  elementos[a].tramo.localeCompare(elementos[b].tramo) ||
  elementos[a].tipo.localeCompare(elementos[b].tipo) ||
  elementos[a].progresiva_m - elementos[b].progresiva_m ||
  a - b)
const codigo = new Array(elementos.length)
const cuenta = {}
for (const i of orden) {
  const e = elementos[i]
  const k = `${e.tramo}|${e.tipo}`
  cuenta[k] = (cuenta[k] ?? 0) + 1
  codigo[i] = `${e.tramo.replace('-', '')}-${e.tipo}-${String(cuenta[k]).padStart(4, '0')}`
}

const faltan = []
const filas = elementos.map((e, i) => {
  const u = ubicar(e)
  if (!seccion[e.tramo]) faltan.push(`tramo ${e.tramo}`)
  if (!tipoId[e.tipo]) faltan.push(`tipo ${e.tipo}`)
  const atributos = { ...e.atributos }
  delete atributos.origen
  atributos.ubicacion = u?.ubicacion ?? 'sin ubicar'
  if (u?.coordenada_excel) atributos.coordenada_excel = u.coordenada_excel
  if (u?.motivo) atributos.motivo_ubicacion = u.motivo
  if (e.fin) atributos.coordenada_final = e.fin
  const alta = atributos.fecha_alta
  return {
    client_id: uuidDe(e.atributos.origen),
    service_id: SUR,
    type_id: tipoId[e.tipo],
    code: codigo[i],
    name: nombre(e),
    section_id: seccion[e.tramo],
    progresiva_m: e.progresiva_m,
    progresiva_fin_m: e.progresiva_fin_m,
    // Las hojas de alcantarillas, calzada, puentes, túneles o reductores no
    // tienen columna de lado porque no la necesitan: cruzan o abarcan toda
    // la vía. «Ambos» lo dice; el valor por defecto de la columna, «derecho»,
    // sería falso.
    side: e.side ?? 'ambos',
    lat: u?.lat ?? null,
    lng: u?.lng ?? null,
    condition: e.condition ?? 'no_evaluado',
    install_year: alta ? Number(alta.slice(0, 4)) : null,
    last_inspected_on: ultimaFoto(i),
    attributes: atributos,
    notes: `Inventario Vial Anual 2024 · ${e.atributos.origen}`,
  }
})

if (faltan.length) {
  console.error('Faltan en la base:', [...new Set(faltan)])
  process.exit(1)
}

// ─── Resumen ───────────────────────────────────────────────────────────────

const porUbic = {}
for (const f of filas) porUbic[f.attributes.ubicacion] = (porUbic[f.attributes.ubicacion] ?? 0) + 1
const conFoto = vinculos.filter((m) => m.size).length
const conFecha = filas.filter((f) => f.last_inspected_on).length
console.log(`Elementos: ${filas.length}`)
console.log(`  ubicación:`, porUbic)
console.log(`  con foto: ${conFoto} · con fecha de la última foto: ${conFecha}`)
console.log(`Fotos distintas: ${porHuella.size} · vínculos: ${vinculos.reduce((a, m) => a + m.size, 0)} · huérfanas: ${new Set(huerfanas.map((f) => f.sha256)).size}`)
console.log(`Incidencias del Excel registradas: ${incidencias.length}`)

if (SIMULAR || (!FASE_ELEMENTOS && !FASE_FOTOS)) {
  if (process.argv.includes('--muestra')) {
    for (const t of ['ALC', 'PUE', 'TUN', 'SEV', 'HIT', 'SEH', 'GUA', 'MUR', 'RDV', 'CAL']) {
      const i = filas.findIndex((f, k) => elementos[k].tipo === t && (t !== 'SEH' || f.attributes.clasificacion))
      const f = filas[i]
      console.log(`\n${f.code}  «${f.name}»  lado=${f.side} estado=${f.condition} año=${f.install_year} última foto=${f.last_inspected_on}`)
      console.log(`   progresiva ${f.progresiva_m}${f.progresiva_fin_m ? ' → ' + f.progresiva_fin_m : ''}  ·  ${f.lat?.toFixed(6)}, ${f.lng?.toFixed(6)}  ·  fotos ${vinculos[i].size}`)
      console.log('   ', JSON.stringify(f.attributes))
    }
  }
  console.log('\n(simulación: no se escribió nada)')
  process.exit(0)
}

// ─── Ayudas de escritura ───────────────────────────────────────────────────

async function porLotes(items, tam, fn, rotulo) {
  for (let i = 0; i < items.length; i += tam) {
    await fn(items.slice(i, i + tam))
    process.stdout.write(`\r  ${rotulo}: ${Math.min(i + tam, items.length)}/${items.length}   `)
  }
  process.stdout.write('\n')
}

// ─── Fase 1 · los elementos ────────────────────────────────────────────────

if (FASE_ELEMENTOS) {
  // Los de demostración: baja lógica, reversible. Se reconocen porque no
  // salen del inventario: sus notas no dicen «Inventario Vial Anual 2024».
  //
  // Se da de baja con una sola actualización filtrada en la base, no
  // trayendo los ids: una consulta devuelve como mucho mil filas, y así se
  // quedaron 724 de demostración mezclados con el inventario la primera vez.
  // Las notas vacías también cuentan: en SQL un nulo no cumple ni «empieza
  // por» ni «no empieza por».
  const { count: bajas, error: eBaja } = await sb
    .from('road_assets')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('service_id', SUR)
    .is('deleted_at', null)
    .or('notes.is.null,notes.not.like.Inventario Vial Anual 2024%')
  if (eBaja) throw eBaja
  console.log(`
Dados de baja ${bajas} elementos de demostración.`)

  console.log(`Cargando ${filas.length} elementos del inventario…`)
  await porLotes(filas, 400, async (lote) => {
    const { error } = await sb.from('road_assets').upsert(lote, { onConflict: 'client_id' })
    if (error) throw error
  }, 'elementos')
}

// ─── Fase 2 · las fotos ────────────────────────────────────────────────────

if (FASE_FOTOS) {
  // Los elementos ya cargados, por su identificador de origen.
  const idPorClient = new Map()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('road_assets').select('id, client_id')
      .eq('service_id', SUR).like('notes', 'Inventario Vial Anual 2024%').is('deleted_at', null)
      // Sin un orden fijo, las páginas pueden solaparse o saltarse filas: la
      // primera vez se contaron 7.582 de 7.728.
      .order('id')
      .range(desde, desde + 999)
    if (error) throw error
    for (const r of data) idPorClient.set(r.client_id, r.id)
    if (data.length < 1000) break
  }
  const idDe = (i) => idPorClient.get(filas[i].client_id)
  if (idPorClient.size !== filas.length) {
    console.error(`Hay ${idPorClient.size} elementos cargados y se esperaban ${filas.length}. Correr antes --elementos.`)
    process.exit(1)
  }

  // Qué elementos tiene cada foto; el primero es el principal.
  const elementosDe = new Map()
  vinculos.forEach((m, i) => {
    for (const [sha, v] of m) {
      if (!elementosDe.has(sha)) elementosDe.set(sha, [])
      elementosDe.get(sha).push({ i, ...v })
    }
  })

  // 1 · al almacenamiento, lo que no esté ya
  // El listado del almacenamiento también tiene tope por página —la primera
  // vez devolvió 1.500 de 8.446 y se re-subió todo—: se pagina.
  const hay = new Set()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.storage.from('evidencias')
      .list(CARPETA_STORAGE, { limit: 1000, offset: desde, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    for (const o of data) hay.add(o.name)
    if (data.length < 1000) break
  }
  const subir = []
  for (const sha of porHuella.keys()) {
    if (!optimizadas[sha]) continue
    if (!hay.has(`${sha}.webp`)) subir.push({ sha, archivo: `${sha}.webp` })
    if (!hay.has(`${sha}_t.webp`)) subir.push({ sha, archivo: `${sha}_t.webp` })
  }
  console.log(`\nSubiendo ${subir.length} archivos (ya estaban ${hay.size})…`)
  let hechas = 0
  let i = 0
  const trabajador = async () => {
    while (i < subir.length) {
      const s = subir[i++]
      const cuerpo = fs.readFileSync(path.join(TRABAJO, 'optimizadas', s.archivo))
      for (let intento = 1; ; intento++) {
        const { error } = await sb.storage.from('evidencias')
          .upload(`${CARPETA_STORAGE}/${s.archivo}`, cuerpo, { contentType: 'image/webp', upsert: true })
        if (!error) break
        if (intento >= 4) throw new Error(`${s.archivo}: ${error.message}`)
        await new Promise((r) => setTimeout(r, 1500 * intento))
      }
      if (++hechas % 100 === 0) process.stdout.write(`\r  subidas: ${hechas}/${subir.length}   `)
    }
  }
  await Promise.all(Array.from({ length: 8 }, trabajador))
  process.stdout.write(`\r  subidas: ${hechas}/${subir.length}   \n`)

  // 2 · una evidencia por foto distinta
  //
  // La fecha de la foto es obligatoria —es parte del sello de una evidencia—
  // y 3.795 de las del inventario no la traen: las recortaron y perdieron
  // los metadatos. No se inventa. Se toma, por orden:
  //   · la que la cámara dejó escrita;
  //   · la de sus hermanas del mismo elemento, para que las tres vistas de
  //     una alcantarilla queden en la misma visita y la ficha no invente un
  //     antes y un después entre fotos de la misma inspección;
  //   · la de emisión de su tomo, que es lo más tarde que pudo tomarse. El
  //     pie de foto lo dice.
  // Fechas de emisión: las que llevan los PDF en sus metadatos.
  const EMISION_TOMO = {
    'SubTramo 1': '2025-10-06', 'SubTramo 2': '2025-09-30', 'SubTramo 3': '2025-09-30',
    'SubTramo 4': '2025-09-30', 'Obra Adicional': '2025-10-06',
  }
  const fechaDeHermanas = (sha) => {
    let max = null
    for (const d of elementosDe.get(sha) ?? []) {
      for (const otra of vinculos[d.i].keys()) {
        const t = porHuella.get(otra)?.tomada
        if (t && (!max || t > max)) max = t
      }
    }
    return max
  }
  const evidencias = []
  for (const [sha, f] of porHuella) {
    const o = optimizadas[sha]
    if (!o) continue
    const de = elementosDe.get(sha) ?? []
    const principal = de[0]
    const e = principal ? elementos[principal.i] : null
    const fila = principal ? filas[principal.i] : null
    // Las huérfanas: al tramo de su carpeta, en la progresiva de su nombre.
    const h = huerfanas.find((x) => x.sha256 === sha)
    const hermanas = f.tomada ? null : fechaDeHermanas(sha)
    const fechaFoto = f.tomada
      ? { valor: `${f.tomada}-05:00`, nota: '' }
      : hermanas
        ? { valor: `${hermanas}-05:00`, nota: ' · sin fecha propia: la de las otras fotos del elemento' }
        : { valor: `${EMISION_TOMO[f.carpeta]}T12:00:00-05:00`, nota: ` · sin fecha de toma: se registra la de emisión del tomo (${EMISION_TOMO[f.carpeta]})` }
    const tramoH = h?.tramo
    const progH = h?.leido?.progresiva ?? null
    evidencias.push({
      client_id: uuidDe(`foto|${sha}`),
      service_id: SUR,
      asset_id: principal ? idDe(principal.i) : null,
      phase: 'general',
      storage_path: `${CARPETA_STORAGE}/${sha}.webp`,
      thumb_path: `${CARPETA_STORAGE}/${sha}_t.webp`,
      mime_type: 'image/webp',
      size_bytes: o.bytes,
      width: o.ancho,
      height: o.alto,
      // Las huérfanas no tienen elemento del que tomar coordenadas: se ponen
      // en la vía, en la progresiva que dice su nombre y a su lado.
      lat: fila?.lat ?? (h && trazas[tramoH] ? puntoEn(trazas[tramoH], progH, h.leido?.lado).lat : null),
      lng: fila?.lng ?? (h && trazas[tramoH] ? puntoEn(trazas[tramoH], progH, h.leido?.lado).lng : null),
      section_id: fila?.section_id ?? seccion[tramoH] ?? null,
      progresiva_m: e?.progresiva_m ?? progH,
      taken_at: fechaFoto.valor,
      sha256: sha,
      watermarked: false,
      caption: `Inventario Vial 2024 · ${f.nombre}${de.length > 1 ? ` · ${de.length} elementos` : ''}${!de.length ? ' · sin elemento en el inventario' : ''}${fechaFoto.nota}`,
    })
  }
  console.log(`Registrando ${evidencias.length} evidencias…`)
  await porLotes(evidencias, 300, async (lote) => {
    const { error } = await sb.from('evidences').upsert(lote, { onConflict: 'client_id', ignoreDuplicates: true })
    if (error) throw error
  }, 'evidencias')

  // 3 · los vínculos foto → elemento
  const idEvidencia = new Map()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('evidences').select('id, sha256')
      .eq('service_id', SUR).like('storage_path', `${CARPETA_STORAGE}/%`)
      .order('id').range(desde, desde + 999)
    if (error) throw error
    for (const r of data) idEvidencia.set(r.sha256, r.id)
    if (data.length < 1000) break
  }
  const enlaces = []
  for (const [sha, de] of elementosDe) {
    const ev = idEvidencia.get(sha)
    if (!ev) continue
    const vistos = new Set()
    for (const d of de) {
      const asset = idDe(d.i)
      if (!asset || vistos.has(asset)) continue
      vistos.add(asset)
      enlaces.push({ evidence_id: ev, asset_id: asset, service_id: SUR, note: `inventario 2024 · ${d.como}${d.vista ? ` · vista ${d.vista}` : ''}` })
    }
  }
  // Se borran los del inventario y se vuelven a poner: así una segunda
  // corrida refleja la vinculación actual y no acumula la anterior.
  console.log(`Vinculando ${enlaces.length} pares foto → elemento…`)
  const evIds = [...idEvidencia.values()]
  await porLotes(evIds, 300, async (ids) => {
    const { error } = await sb.from('evidence_links').delete().in('evidence_id', ids).like('note', 'inventario 2024%')
    if (error) throw error
  }, 'limpieza')
  await porLotes(enlaces, 500, async (lote) => {
    const { error } = await sb.from('evidence_links').insert(lote)
    if (error) throw error
  }, 'vínculos')
}

console.log('\nListo.')
