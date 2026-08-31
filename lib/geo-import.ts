/**
 * Lectura del trazo de un tramo desde los archivos que la supervisión ya usa:
 * KML y KMZ de Google Earth, GeoJSON de un SIG y GPX de un GPS de campo.
 *
 * Todo se resuelve en el navegador — el archivo nunca sale del equipo hasta
 * que el usuario confirma — y termina en un arreglo [[lng,lat], …] que la
 * función `set_section_geometry` convierte en LineString de PostGIS.
 */

export type Coord = [number, number]

export interface ParsedTrack {
  coords: Coord[]
  /** Cuántos puntos traía el archivo antes de simplificar */
  original: number
  /** Nombre de la capa o pista encontrada, si el archivo lo declara */
  layer?: string
  format: 'KML' | 'KMZ' | 'GeoJSON' | 'GPX'
}

/** Tope de puntos: más allá de esto el trazo no gana precisión y sí peso. */
const MAX_POINTS = 4000

export class GeoImportError extends Error {}

// ─── ZIP mínimo, solo lo necesario para abrir un KMZ ───────────────────────
// Un KMZ es un ZIP con un doc.kml adentro. En vez de sumar una librería de
// compresión usamos DecompressionStream, que ya viene en el navegador.
async function unzipFirstKml(buf: ArrayBuffer): Promise<string> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // El End of Central Directory está al final, después de un comentario opcional
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new GeoImportError('El archivo KMZ está dañado o incompleto.')

  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)

  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break
    const method = view.getUint16(ptr + 10, true)
    const compSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localOffset = view.getUint32(ptr + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))

    if (name.toLowerCase().endsWith('.kml')) {
      // Cabecera local: los tamaños de nombre y extra pueden diferir del central
      const lNameLen = view.getUint16(localOffset + 26, true)
      const lExtraLen = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + lNameLen + lExtraLen
      const data = bytes.subarray(start, start + compSize)

      if (method === 0) return new TextDecoder().decode(data)
      if (method !== 8) throw new GeoImportError('El KMZ usa una compresión no soportada.')
      if (typeof DecompressionStream === 'undefined') {
        throw new GeoImportError('Este navegador no puede abrir KMZ. Descomprímelo y sube el .kml.')
      }
      const ds = new DecompressionStream('deflate-raw')
      const stream = new Blob([data]).stream().pipeThrough(ds)
      return await new Response(stream).text()
    }
    ptr += 46 + nameLen + extraLen + commentLen
  }
  throw new GeoImportError('El KMZ no contiene ningún archivo .kml adentro.')
}

// ─── Parsers por formato ───────────────────────────────────────────────────
function parseCoordString(text: string): Coord[] {
  const out: Coord[] = []
  for (const tok of text.trim().split(/\s+/)) {
    const [lng, lat] = tok.split(',').map(Number)
    if (Number.isFinite(lng) && Number.isFinite(lat) &&
        Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      out.push([lng, lat])
    }
  }
  return out
}

function parseKml(xml: string): { coords: Coord[]; layer?: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new GeoImportError('El KML no se pudo leer: XML inválido.')

  const coords: Coord[] = []
  let layer: string | undefined

  // LineString es lo normal; gx:Track aparece cuando el trazo viene de un GPS
  const lines = Array.from(doc.getElementsByTagName('LineString'))
  for (const ln of lines) {
    const c = ln.getElementsByTagName('coordinates')[0]?.textContent
    if (c) {
      coords.push(...parseCoordString(c))
      if (!layer) {
        const pm = ln.closest('Placemark')
        layer = pm?.getElementsByTagName('name')[0]?.textContent ?? undefined
      }
    }
  }

  if (!coords.length) {
    // gx:Track guarda cada punto en su propio <gx:coord> con espacios
    const gx = Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === 'coord')
    for (const g of gx) {
      const [lng, lat] = (g.textContent ?? '').trim().split(/\s+/).map(Number)
      if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
    }
  }

  if (!coords.length) {
    // Último recurso: una ruta dibujada como sucesión de puntos
    const points = Array.from(doc.getElementsByTagName('Point'))
    for (const p of points) {
      const c = p.getElementsByTagName('coordinates')[0]?.textContent
      if (c) coords.push(...parseCoordString(c))
    }
  }

  return { coords, layer }
}

function coordsFromGeometry(geom: any, out: Coord[]) {
  if (!geom) return
  const push = (arr: any[]) => {
    for (const pt of arr) {
      const [lng, lat] = pt
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat])
    }
  }
  switch (geom.type) {
    case 'LineString': push(geom.coordinates); break
    case 'MultiLineString': geom.coordinates.forEach(push); break
    case 'Point': push([geom.coordinates]); break
    case 'MultiPoint': push(geom.coordinates); break
    case 'Polygon': push(geom.coordinates[0] ?? []); break
    case 'GeometryCollection': geom.geometries?.forEach((g: any) => coordsFromGeometry(g, out)); break
  }
}

function parseGeoJson(text: string): { coords: Coord[]; layer?: string } {
  let json: any
  try { json = JSON.parse(text) } catch { throw new GeoImportError('El GeoJSON no es un JSON válido.') }
  const coords: Coord[] = []
  let layer: string | undefined

  if (json.type === 'FeatureCollection') {
    for (const f of json.features ?? []) {
      coordsFromGeometry(f.geometry, coords)
      if (!layer) layer = f.properties?.name ?? f.properties?.Name
    }
  } else if (json.type === 'Feature') {
    coordsFromGeometry(json.geometry, coords)
    layer = json.properties?.name
  } else {
    coordsFromGeometry(json, coords)
  }
  return { coords, layer }
}

function parseGpx(xml: string): { coords: Coord[]; layer?: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new GeoImportError('El GPX no se pudo leer: XML inválido.')
  const coords: Coord[] = []
  const pts = [
    ...Array.from(doc.getElementsByTagName('trkpt')),
    ...Array.from(doc.getElementsByTagName('rtept')),
    ...Array.from(doc.getElementsByTagName('wpt')),
  ]
  for (const p of pts) {
    const lat = Number(p.getAttribute('lat'))
    const lng = Number(p.getAttribute('lon'))
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords.push([lng, lat])
  }
  const layer = doc.getElementsByTagName('name')[0]?.textContent ?? undefined
  return { coords, layer }
}

/** Deja como máximo MAX_POINTS puntos conservando siempre los extremos. */
function simplify(coords: Coord[]): Coord[] {
  if (coords.length <= MAX_POINTS) return coords
  const step = Math.ceil(coords.length / MAX_POINTS)
  const out = coords.filter((_, i) => i % step === 0)
  const last = coords[coords.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** Lee el archivo y devuelve el trazo listo para guardar. */
export async function parseGeoFile(file: File): Promise<ParsedTrack> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  let parsed: { coords: Coord[]; layer?: string }
  let format: ParsedTrack['format']

  if (ext === 'kmz') {
    parsed = parseKml(await unzipFirstKml(await file.arrayBuffer()))
    format = 'KMZ'
  } else if (ext === 'kml') {
    parsed = parseKml(await file.text())
    format = 'KML'
  } else if (ext === 'gpx') {
    parsed = parseGpx(await file.text())
    format = 'GPX'
  } else if (ext === 'geojson' || ext === 'json') {
    parsed = parseGeoJson(await file.text())
    format = 'GeoJSON'
  } else if (ext === 'shp' || ext === 'zip') {
    throw new GeoImportError(
      'Los shapefiles no se leen directamente. Expórtalo a KML o GeoJSON desde QGIS o Google Earth y vuelve a intentarlo.'
    )
  } else {
    throw new GeoImportError(`Formato .${ext} no soportado. Usa KML, KMZ, GeoJSON o GPX.`)
  }

  if (parsed.coords.length < 2) {
    throw new GeoImportError('El archivo no contiene una línea con al menos 2 puntos.')
  }

  return {
    coords: simplify(parsed.coords),
    original: parsed.coords.length,
    layer: parsed.layer ?? undefined,
    format,
  }
}

/** Longitud aproximada del trazo en metros (Haversine punto a punto). */
export function trackLength(coords: Coord[]): number {
  const R = 6371000
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]
    const [lng2, lat2] = coords[i]
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    total += 2 * R * Math.asin(Math.sqrt(a))
  }
  return total
}
