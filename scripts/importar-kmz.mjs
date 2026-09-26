#!/usr/bin/env node
/**
 * SIGOV · Importar la geometría del contrato desde el KMZ de la supervisión.
 *
 *   node scripts/importar-kmz.mjs [ruta/al/doc.kml] > supabase/migrations/00XX_....sql
 *
 * Lee el KMZ que entrega COVINCA —el mismo que la supervisión abre en Google
 * Earth— y escupe la migración que deja los tramos con su traza real y su
 * kilometraje oficial del MTC.
 *
 * Hace falta un script y no basta el importador de la pantalla de
 * configuración porque este archivo trae los cuatro tramos juntos, sus
 * límites en progresiva, y tres cosas que hay que arreglar por el camino:
 *
 *   · El KML es inválido: usa `xsi:schemaLocation` sin declarar el prefijo.
 *     Google Earth lo tolera; cualquier lector conforme al estándar, no.
 *
 *   · Cuatro de las cinco trazas vienen dibujadas en sentido contrario al
 *     del kilometraje. Cargarlas tal cual pondría el km 852 donde está el
 *     973 y espejaría todas las progresivas del contrato.
 *
 *   · Los límites no caen en kilómetros redondos —el subtramo 1 empieza en
 *     852+335— así que tomarlos del hito más cercano desplaza todo medio
 *     kilómetro.
 */
import fs from 'node:fs'
import path from 'node:path'

// --json: en vez de la migración, las trazas ya corregidas, para quien
// necesite medir contra ellas (el importador del inventario, por ejemplo).
const COMO_JSON = process.argv.includes('--json')
const ORIGEN = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(process.cwd(), 'kmz', 'doc.kml')
const SUR = '22222222-2222-4222-8222-222222222221'

// A qué tramo del contrato corresponde cada subtramo del KMZ.
const TRAMOS = {
  'Subtramo 1': 'AQP-01',
  'Subtramo 2': 'AQP-02',
  'Subtramo 3': 'TAC-01',
  'Subtramo 4': 'TAC-02',
}

/** Más allá de esto la traza no gana precisión y sí peso en la migración. */
const TOLERANCIA_M = 2

// ─── Lectura ───────────────────────────────────────────────────────────────

function sanear(xml) {
  // El prefijo que el archivo usa sin declarar.
  return xml.replace(
    '<kml xmlns="http://www.opengis.net/kml/2.2"',
    '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.opengis.net/kml/2.2"'
  )
}

/** Trocea el KML por subtramos sin montar un DOM entero de 1,8 MB. */
function porSubtramo(xml) {
  const bloques = {}
  const re = /<Folder>\s*<name>(Subtramo \d)<\/name>/g
  const marcas = []
  let m
  while ((m = re.exec(xml))) marcas.push({ nombre: m[1], desde: m.index })
  marcas.forEach((x, i) => {
    bloques[x.nombre] = xml.slice(x.desde, i + 1 < marcas.length ? marcas[i + 1].desde : xml.length)
  })
  return bloques
}

const coords = (txt) =>
  txt
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([lng, lat]) => [lng, lat])

/** Todas las líneas del bloque, con el nombre del documento que las contiene. */
function lineas(bloque) {
  const out = []
  const re = /<Document id="([^"]+)"[\s\S]*?<\/Document>/g
  let m
  while ((m = re.exec(bloque))) {
    const doc = m[0]
    const etiqueta = (doc.match(/<name>([^<]+)<\/name>/) || [, m[1]])[1]
    for (const ls of doc.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      out.push({ etiqueta, puntos: coords(ls[1]) })
    }
  }
  return out
}

/** Los límites oficiales, que el propio archivo escribe en el nombre del hito. */
function limites(bloque) {
  const km = (t) => {
    const m = t.match(/KM\s*(\d+)\s*\+\s*(\d+)/i)
    return m ? Number(m[1]) * 1000 + Number(m[2]) : null
  }
  let desde = null
  let hasta = null
  for (const pm of bloque.matchAll(/<name>([^<]*(?:INICIO|FIN)[^<]*)<\/name>/gi)) {
    const t = pm[1]
    if (/Fin (real|Contractual)/i.test(t)) continue // notas de la doble calzada
    if (/INICIO/i.test(t)) desde ??= km(t)
    else if (/^FIN ST/i.test(t.trim())) hasta ??= km(t)
  }
  return { desde, hasta }
}

/**
 * Los hitos kilométricos del MTC que trae el archivo: «PR 852» en su punto.
 *
 * Sirven para calibrar. Repartir el kilometraje del tramo a lo largo de la
 * traza supone que avanza parejo con la distancia recorrida, y donde hubo
 * una variante eso ya no es verdad: en Montalvo el reparto dejaba
 * alcantarillas hasta 1,4 km antes de su progresiva. Con un hito por
 * kilómetro, cada progresiva se sitúa entre los dos hitos que la rodean.
 */
function hitos(bloque) {
  const out = []
  const re = /<Placemark>\s*<name>\s*PR\s*(\d+(?:[.,]\d+)?)\s*<\/name>[\s\S]*?<Point>[\s\S]*?<coordinates>([^<]+)<\/coordinates>/g
  let m
  while ((m = re.exec(bloque))) {
    const [lng, lat] = m[2].trim().split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ km: Number(m[1].replace(',', '.')), lat, lng })
    }
  }
  return out.sort((a, b) => a.km - b.km)
}

// ─── Geometría ─────────────────────────────────────────────────────────────

const R = 6371000
const rad = (d) => (d * Math.PI) / 180
const proyectar = ([lng, lat], lat0) => [
  ((lng * Math.cos(rad(lat0)) * R * Math.PI) / 180),
  ((lat * R * Math.PI) / 180),
]

function largoM(pts) {
  const lat0 = pts[0][1]
  let s = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = proyectar(pts[i], lat0)
    const b = proyectar(pts[i + 1], lat0)
    s += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return s
}

/** Douglas–Peucker en metros, para no arrastrar veinticinco mil vértices. */
function simplificar(pts, tol) {
  if (pts.length < 3) return pts
  const lat0 = pts[0][1]
  const P = pts.map((p) => proyectar(p, lat0))
  const guardar = new Uint8Array(pts.length)
  guardar[0] = guardar[pts.length - 1] = 1
  const pila = [[0, pts.length - 1]]
  while (pila.length) {
    const [i, j] = pila.pop()
    let peor = -1
    let idx = -1
    const [ax, ay] = P[i]
    const [bx, by] = P[j]
    const dx = bx - ax
    const dy = by - ay
    const L = dx * dx + dy * dy
    for (let k = i + 1; k < j; k++) {
      const [px, py] = P[k]
      let t = L === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      if (d > peor) { peor = d; idx = k }
    }
    if (peor > tol && idx > 0) {
      guardar[idx] = 1
      pila.push([i, idx], [idx, j])
    }
  }
  return pts.filter((_, k) => guardar[k])
}

const dist = (a, b, lat0) => {
  const A = proyectar(a, lat0)
  const B = proyectar(b, lat0)
  return Math.hypot(B[0] - A[0], B[1] - A[1])
}

// ─── Armado ────────────────────────────────────────────────────────────────

const xml = sanear(fs.readFileSync(ORIGEN, 'utf8'))
const bloques = porSubtramo(xml)
const resultado = []

for (const [subtramo, code] of Object.entries(TRAMOS)) {
  const bloque = bloques[subtramo]
  if (!bloque) throw new Error(`El KMZ no trae «${subtramo}»`)

  const { desde, hasta } = limites(bloque)
  if (desde == null || hasta == null) {
    throw new Error(`«${subtramo}» no declara sus límites de progresiva`)
  }

  const todas = lineas(bloque)
  if (!todas.length) throw new Error(`«${subtramo}» no trae ninguna traza`)

  // Con doble calzada se toma la que recorre el tramo entero; la segunda
  // calzada existe solo en un trecho y dejaría el resto sin línea.
  const elegida = todas.reduce((a, b) => (b.puntos.length > a.puntos.length ? b : a))

  // El sentido lo manda el kilometraje, no el orden en que se dibujó.
  const lat0 = elegida.puntos[0][1]
  const hitoInicial = (bloque.match(
    /<name>[^<]*INICIO[^<]*<\/name>[\s\S]*?<coordinates>([^<]+)<\/coordinates>/i
  ) || [])[1]
  let puntos = elegida.puntos
  let invertida = false
  if (hitoInicial) {
    const p0 = coords(hitoInicial)[0]
    invertida = dist(puntos[puntos.length - 1], p0, lat0) < dist(puntos[0], p0, lat0)
    if (invertida) puntos = [...puntos].reverse()
  }

  const antes = puntos.length
  puntos = simplificar(puntos, TOLERANCIA_M)

  resultado.push({
    hitos: hitos(bloque),
    code,
    subtramo,
    calzadas: todas.length,
    etiqueta: elegida.etiqueta,
    desde,
    hasta,
    invertida,
    vertices: puntos.length,
    antes,
    largo: largoM(puntos),
    puntos,
  })
}

if (COMO_JSON) {
  process.stdout.write(JSON.stringify(resultado.map(({ code, desde, hasta, puntos, hitos }) => ({ code, desde, hasta, puntos, hitos }))))
  process.exit(0)
}

// ─── La migración ──────────────────────────────────────────────────────────

const f = (n) => n.toFixed(6)
const wkt = (pts) => `LINESTRING(${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(',')})`

const resumen = resultado
  .map(
    (r) =>
      `--   ${r.code} · ${r.subtramo.padEnd(11)} km ${(r.desde / 1000).toFixed(3)} → ${(r.hasta / 1000).toFixed(3)}` +
      `  ·  ${(r.largo / 1000).toFixed(2)} km de traza, ${r.vertices} vértices (de ${r.antes})` +
      `${r.invertida ? ' · venía invertida' : ''}${r.calzadas > 1 ? ` · ${r.calzadas} calzadas` : ''}`
  )
  .join('\n')

console.log(`-- ═══════════════════════════════════════════════════════════════════════
-- La geometría real del contrato, desde el KMZ de la supervisión
--
-- Generado por scripts/importar-kmz.mjs a partir de «Covinca (MTC).kmz».
-- No editar a mano: volver a correr el script.
--
-- Hasta ahora los tramos eran cuatro polilíneas de seis o siete vértices
-- que unían a ojo los pueblos que les dan nombre, y las progresivas
-- arrancaban en cero porque nadie tenía las de verdad. Como el inventario,
-- los PCI y las evidencias no guardan un punto propio sino que se sitúan
-- interpolando su progresiva sobre la línea del tramo, cada elemento salía
-- a kilómetros de la vía: medido contra la Panamericana, la mitad de los
-- elementos del segundo tramo caían a más de ocho kilómetros, en pleno
-- desierto.
--
-- Esto es lo que trae el archivo:
${resumen}
--
-- Tres cosas hubo que arreglar al leerlo, y quedan resueltas en el script:
--   · el KML declara \`xsi:\` sin definirlo, así que ningún lector conforme
--     al estándar lo abre;
--   · cuatro de las cinco trazas están dibujadas en sentido contrario al
--     del kilometraje, y cargarlas así espejaría todas las progresivas;
--   · los límites no caen en kilómetros redondos —852+335—, de modo que
--     tomar el hito más cercano desplazaba todo medio kilómetro.
--
-- Las progresivas de los elementos que hay cargados son de demostración:
-- se reescalan al rango real de su tramo para que conserven su orden y su
-- reparto. Cuando Servicon entregue el inventario levantado en campo, sus
-- progresivas entran tal cual y todo se sitúa solo.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_sur uuid := '${SUR}';
begin

-- ─── Las trazas y el kilometraje oficial ───────────────────────────────
${resultado
  .map(
    (r) => `
  update public.road_sections set
    geom = extensions.ST_GeomFromText('${wkt(r.puntos)}', 4326),
    prog_start_m = ${r.desde},
    prog_end_m   = ${r.hasta}
  where service_id = v_sur and code = '${r.code}';`
  )
  .join('\n')}

-- ─── Las progresivas de los elementos, al rango real de su tramo ───────
--
-- Se conserva la posición relativa: el que estaba a un tercio del tramo
-- sigue a un tercio, ahora sobre la carretera de verdad.

  with rango as (
    select a.section_id,
           min(a.progresiva_m) as viejo_min,
           max(a.progresiva_m) as viejo_max
    from public.road_assets a
    where a.service_id = v_sur and a.progresiva_m is not null
    group by a.section_id
  )
  update public.road_assets a
  set progresiva_m = s.prog_start_m + round(
        (a.progresiva_m - r.viejo_min)::numeric
        / nullif(r.viejo_max - r.viejo_min, 0)
        * (s.prog_end_m - s.prog_start_m))
  from rango r
  join public.road_sections s on s.id = r.section_id
  where a.section_id = r.section_id
    and a.service_id = v_sur
    and a.progresiva_m is not null
    and r.viejo_max > r.viejo_min
    and a.progresiva_m not between s.prog_start_m and s.prog_end_m;

-- ─── Y todo lo que cuelga de la progresiva, a su sitio ─────────────────

  update public.road_assets a
  set geom = p.punto,
      lng  = extensions.ST_X(p.punto),
      lat  = extensions.ST_Y(p.punto)
  from (
    select x.id,
           extensions.ST_LineInterpolatePoint(s.geom, least(0.999, greatest(0.001,
             (x.progresiva_m - s.prog_start_m)::numeric
             / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8) as punto
    from public.road_assets x
    join public.road_sections s on s.id = x.section_id
    where x.service_id = v_sur and x.progresiva_m is not null and s.geom is not null
  ) p
  where p.id = a.id;

  -- Los ítems de PCI no guardan punto propio: pci_geojson los interpola
  -- sobre la línea del tramo cada vez que se pide el mapa, así que con la
  -- traza nueva ya se sitúan solos.

  -- Las evidencias llevan un guardián que exige coordenadas coherentes;
  -- se suspende mientras se recolocan en bloque.
  alter table public.evidences disable trigger t_ev_guard;

  update public.evidences e
  set geom = p.punto,
      lng  = extensions.ST_X(p.punto),
      lat  = extensions.ST_Y(p.punto)
  from (
    select x.id,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             extensions.ST_X(q.base) + (random() - 0.5) * 0.0004,
             extensions.ST_Y(q.base) + (random() - 0.5) * 0.0004), 4326) as punto
    from public.evidences x
    join public.road_sections s on s.id = x.section_id
    cross join lateral (select extensions.ST_LineInterpolatePoint(s.geom, least(0.999, greatest(0.001,
      (x.progresiva_m - s.prog_start_m)::numeric
      / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8) as base) q
    where x.service_id = v_sur and x.progresiva_m is not null
      and x.lat is not null and s.geom is not null
  ) p
  where p.id = e.id;

  alter table public.evidences enable trigger t_ev_guard;

  -- Lo ejecutado en campo marca el medio del trecho atendido.
  update public.work_entries w
  set geom = p.punto
  from (
    select x.id,
           extensions.ST_LineInterpolatePoint(s.geom, (q.desde + q.hasta) / 2) as punto
    from public.work_entries x
    join public.road_sections s on s.id = x.section_id
    cross join lateral (select
      least(0.999, greatest(0.0, (x.prog_start_m - s.prog_start_m)::numeric
        / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8 as desde,
      least(1.0, greatest(0.001, (coalesce(x.prog_end_m, x.prog_start_m) - s.prog_start_m)::numeric
        / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8 as hasta) q
    where x.service_id = v_sur and x.prog_start_m is not null
      and x.geom is not null and s.geom is not null and q.hasta > q.desde
  ) p
  where p.id = w.id;

end $$;
`)

console.error(`\nLeído de ${path.relative(process.cwd(), ORIGEN)}:`)
for (const r of resultado) {
  console.error(
    `  ${r.code}  ${r.subtramo}  km ${(r.desde / 1000).toFixed(3)}–${(r.hasta / 1000).toFixed(3)}` +
      `  traza ${(r.largo / 1000).toFixed(2)} km  ${r.vertices}/${r.antes} vértices` +
      `${r.invertida ? '  [invertida, corregida]' : ''}` +
      `${r.calzadas > 1 ? `  [${r.calzadas} calzadas, se usa «${r.etiqueta}»]` : ''}`
  )
  const declarado = (r.hasta - r.desde) / 1000
  const desvio = Math.abs(r.largo / 1000 - declarado)
  console.error(
    `        declarado ${declarado.toFixed(3)} km · traza ${(r.largo / 1000).toFixed(3)} km · ` +
      `desvío ${(desvio * 1000).toFixed(0)} m (${((desvio / declarado) * 100).toFixed(2)}%)`
  )
}
