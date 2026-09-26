#!/usr/bin/env node
/**
 * SIGOV · Leer el inventario vial oficial desde los Excel de COVINCA.
 *
 *   node scripts/inventario/leer-excel.mjs "<carpeta 1-Inventario Vial>" > inventario.json
 *
 * Devuelve un JSON con todos los elementos ya normalizados y, aparte, la
 * lista de incidencias: cada dato que venía mal en el Excel y qué se hizo
 * con él. Esa lista es para Servicon, para que corrija su maestro; aquí no
 * se esconde nada que se haya corregido.
 *
 * El formato es el del inventario anual del MTC: una hoja por tipo de
 * elemento, cabeceras numeradas «(1.3) PROG-UBICACIÓN». Leerlo fiable
 * exige desconfiar de casi todo lo que parece fijo:
 *
 *   · Los códigos de columna no son estables: la hoja de túneles del
 *     subtramo 2 trae una columna «SUBTRAMO» de más y corre toda la
 *     numeración. Las columnas se buscan por nombre.
 *
 *   · Las etiquetas de latitud y longitud vienen intercambiadas en la
 *     mitad de las hojas. Cuál es cuál lo dice el valor —la latitud del
 *     contrato va de −16 a −18,4 y la longitud de −70 a −73—, no la
 *     cabecera.
 *
 *   · A la derecha de los datos hay tablas de leyenda y enlaces a un
 *     servidor, pegadas en las mismas filas. Solo cuentan las columnas
 *     que tienen cabecera de dato.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CARPETA = process.argv[2] || 'C:/Users/LUIGI/Desktop/SIGOV INVENTARIO/1-Inventario Vial'

/**
 * Los Excel se abren con openpyxl, no con exceljs: el del subtramo 2 arrastra
 * formato hasta miles de filas y exceljs no termina de leerlo. El volcado
 * trae cada hoja como filas de valores; aquí se envuelve con la misma forma
 * de acceso —hoja, fila, celda— que usa el resto del lector.
 */
function abrirLibros(carpeta) {
  const volcador = path.join(path.dirname(fileURLToPath(import.meta.url)), 'volcar-excel.py')
  const crudo = execFileSync('python', [volcador, carpeta], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  const libros = JSON.parse(crudo)
  const conv = (v) => (v && typeof v === 'object' && 'fecha' in v ? v.fecha : v)
  const hoja = (name, filas) => ({
    name,
    getRow: (r) => ({
      getCell: (c) => ({ value: conv(filas[r - 1]?.[c - 1]) }),
      eachCell: (_o, fn) =>
        (filas[r - 1] ?? []).forEach((v, i) => { if (v != null && v !== '') fn({ value: conv(v) }, i + 1) }),
    }),
    eachRow: (_o, fn) =>
      filas.forEach((f, i) => {
        if (f.some((v) => v != null && v !== '')) fn({ getCell: (c) => ({ value: conv(f[c - 1]) }) }, i + 1)
      }),
  })
  return Object.fromEntries(
    Object.entries(libros).map(([archivo, hojas]) => [
      archivo,
      Object.entries(hojas).map(([nombre, filas]) => hoja(nombre, filas)),
    ])
  )
}

// ─── Los tramos del contrato, con sus límites oficiales ────────────────────

const TRAMOS = {
  '01': { code: 'AQP-01', desde: 852335, hasta: 973884 },
  '02': { code: 'AQP-02', desde: 988529, hasta: 1146763 },
  '03': { code: 'TAC-01', desde: 1184683, hasta: 1297993 },
  '04': { code: 'TAC-02', desde: 1300080, hasta: 1335600 },
  // La vía alterna tiene su propio kilometraje, no el de la Panamericana.
  '05': { code: 'VA-01', desde: 0, hasta: 1380 },
}

// Caja del contrato: fuera de esto una coordenada no es de aquí.
const LAT = [-18.5, -16.0]
const LNG = [-73.0, -69.9]

// ─── Utilidades ────────────────────────────────────────────────────────────

const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** El valor de una celda, venga como venga: fórmula, texto enriquecido, enlace. */
function valor(c) {
  const v = c?.value
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return v.text
    if ('error' in v) return null
  }
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' || /^#(VALUE|REF|N\/A|DIV\/0|NAME)!?$/i.test(t) ? null : t
  }
  return v
}

const num = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const enRango = (v, [a, b]) => v != null && v >= a && v <= b

// ─── Incidencias ───────────────────────────────────────────────────────────

const incidencias = []
const anotar = (ref, tipo, detalle, accion) => incidencias.push({ ...ref, tipo, detalle, accion })

// ─── Coordenadas ───────────────────────────────────────────────────────────

/**
 * Un par de coordenadas, sin fiarse de la etiqueta de la columna.
 *
 * Arregla lo que tiene arreglo evidente y lo apunta: el par cambiado de
 * sitio, la latitud escrita en positivo, la que perdió el punto decimal
 * (−1756000 por −17,56). Lo que no tiene arreglo evidente se descarta y
 * el elemento se ubicará por su progresiva.
 */
function coordenada(a, b, ref, cual) {
  let x = num(a)
  let y = num(b)
  if (x == null && y == null) return null
  if (x === 0 || y === 0) {
    anotar(ref, 'coordenada vacía', `${cual}: ${a}, ${b}`, 'se ubica por la progresiva')
    return null
  }

  const arreglar = (v, rango) => {
    if (v == null) return v
    if (enRango(v, rango)) return v
    if (enRango(-v, rango)) return -v // escrita en positivo
    // Sin el punto decimal: −1756302 es −17,56302. Se divide de diez en
    // diez y se acepta el primer valor que cae en el rango; parar antes
    // —al bajar de 180— dejaba −175,63, que no es nada.
    let w = v
    for (let i = 0; i < 9; i++) {
      w /= 10
      if (enRango(w, rango)) return w
      if (enRango(-w, rango)) return -w
      if (Math.abs(w) < 1) break
    }
    return v
  }

  // Cuál es la latitud lo decide el valor.
  let lat, lng
  const esLat = (v) => v != null && Math.abs(v) >= 15 && Math.abs(v) <= 19.5
  const esLng = (v) => v != null && Math.abs(v) >= 69 && Math.abs(v) <= 74
  if (esLat(x) || esLng(y)) { lat = x; lng = y }
  else if (esLat(y) || esLng(x)) { lat = y; lng = x }
  else { lat = x; lng = y }

  const lat0 = lat, lng0 = lng
  lat = arreglar(lat, LAT)
  lng = arreglar(lng, LNG)

  if (!enRango(lat, LAT) || !enRango(lng, LNG)) {
    anotar(ref, 'coordenada fuera del contrato', `${cual}: ${a}, ${b}`, 'se ubica por la progresiva')
    return null
  }
  if (lat !== lat0 || lng !== lng0) {
    anotar(ref, 'coordenada corregida', `${cual}: ${a}, ${b} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      'signo o punto decimal restituido')
  }
  return { lat, lng }
}

// ─── Progresivas ───────────────────────────────────────────────────────────

/**
 * Una progresiva, en metros, dentro del tramo al que pertenece la hoja.
 *
 * Si trae un dígito de más —10.320.000 donde iba 1.032.000— se prueba
 * quitándolo; si cae en otro tramo del contrato, se devuelve con ese tramo
 * para que el elemento vaya donde de verdad está.
 */
function progresiva(v, st, ref, cual) {
  const p = num(v)
  if (p == null) return null
  const t = TRAMOS[st]
  const holgura = 1500 // los límites del inventario no siempre caen exactos
  const dentro = (x, tr) => x >= tr.desde - holgura && x <= tr.hasta + holgura
  if (dentro(p, t)) return { m: p, st }

  for (const div of [10, 100]) {
    if (dentro(p / div, t)) {
      anotar(ref, 'progresiva con dígitos de más', `${cual}: ${p}`, `se lee ${p / div}`)
      return { m: p / div, st }
    }
  }
  for (const [otro, tr] of Object.entries(TRAMOS)) {
    if (otro !== st && otro !== '05' && dentro(p, tr)) {
      anotar(ref, 'progresiva de otro tramo', `${cual}: ${p} (hoja del subtramo ${st})`, `se asigna a ${tr.code}`)
      return { m: p, st: otro }
    }
  }
  anotar(ref, 'progresiva fuera de rango', `${cual}: ${p}`, cual === 'final' ? 'se descarta la final' : 'se descarta la fila')
  return null
}

/**
 * Lo más largo que puede medir un elemento, para juzgar su final.
 *
 * Depende del tipo: un guardavía continuo de siete kilómetros es normal en
 * la zona del Complejo Fronterizo, y un muro de siete kilómetros es un
 * error de digitación. Con un tope único o se rechazaban los guardavías o
 * se colaban los muros.
 */
const LARGO_MAX = { MUR: 2000, PUE: 2000, TUN: 2000, ALC: 2000, BAD: 2000, DRL: 3000, RDV: 2000, RES: 2000 }
const LARGO_MAX_LINEAL = 10000
const largoMax = (tipo) => LARGO_MAX[tipo] ?? LARGO_MAX_LINEAL

/**
 * La progresiva final de un elemento lineal, juzgada contra su inicial.
 *
 * Una final no tiene sentido por sí sola: tiene que caer cerca de donde
 * empieza el elemento. Si no cae, se prueba lo que suele haber pasado
 * —un dígito de más, o que al digitar se comieron los primeros («50902»
 * por «1050902»)— y se acepta solo si el resultado queda a un par de
 * kilómetros de la inicial. Si nada encaja, el elemento se queda sin final
 * antes que con una inventada.
 *
 * Una final menor que la inicial no es un error: hay guardavías que se
 * miden en sentido contrario al del kilometraje. Se guarda tal cual.
 */
function progresivaFinal(v, inicial, tipo, ref) {
  const p = num(v)
  if (p == null) return null
  const cerca = (x) => Math.abs(x - inicial) <= largoMax(tipo)

  if (cerca(p)) return p

  for (const div of [10, 100]) {
    if (cerca(p / div)) {
      anotar(ref, 'progresiva con dígitos de más', `final: ${p}`, `se lee ${p / div}`)
      return p / div
    }
  }

  // Los dígitos que faltan, tomados de la inicial.
  const ent = String(Math.trunc(Math.abs(p)))
  const base = String(Math.trunc(inicial))
  if (ent.length < base.length) {
    const cand = Number(base.slice(0, base.length - ent.length) + String(Math.abs(p)))
    if (cerca(cand)) {
      anotar(ref, 'progresiva final truncada', `final: ${p} (inicial ${inicial})`, `se lee ${cand}`)
      return cand
    }
  }

  // Un dígito de más o de menos en medio —«112048.8» por «1120048.8»,
  // «14128390» por «1128390»—. Se prueban todas las inserciones y
  // supresiones de un dígito y solo se acepta si una única queda a menos
  // de 500 m de la inicial: con dos candidatas no hay forma de saber cuál.
  const txt = String(Math.abs(p))
  const cand = new Set()
  for (let i = 0; i <= txt.length; i++) {
    for (const d of '0123456789') cand.add(txt.slice(0, i) + d + txt.slice(i))
    if (i < txt.length) cand.add(txt.slice(0, i) + txt.slice(i + 1))
  }
  const buenas = [...cand]
    .map(Number)
    .filter((x) => Number.isFinite(x) && Math.abs(x - inicial) <= 500)
  const unicas = [...new Set(buenas)]
  if (unicas.length === 1) {
    anotar(ref, 'progresiva final con un dígito cambiado', `final: ${p} (inicial ${inicial})`, `se lee ${unicas[0]}`)
    return unicas[0]
  }

  anotar(ref, 'progresiva final sin sentido', `final: ${p} (inicial ${inicial})`,
    unicas.length > 1 ? `se deja sin final: ${unicas.length} lecturas posibles` : 'se deja sin final')
  return null
}

// ─── Vocabulario ───────────────────────────────────────────────────────────

/** El lado, y la calzada cuando la vía es de doble calzada. */
function lado(v) {
  const s = sinTildes(v).replace(/\s/g, '')
  if (!s) return { side: null }
  const cal = s.match(/^c(\d)(d|i)?$/) || s.match(/^c(\d)(d|i)$/)
  if (cal) return { side: cal[2] === 'd' ? 'derecho' : cal[2] === 'i' ? 'izquierdo' : 'eje', calzada: `C${cal[1]}` }
  if (s === 'ci') return { side: 'izquierdo', calzada: 'CI' }
  if (s === 'cd') return { side: 'derecho', calzada: 'CD' }
  if (s === 'cu') return { side: 'ambos', calzada: 'CU' }
  if (s.startsWith('der') || s === 'd') return { side: 'derecho' }
  if (s.startsWith('izq') || s === 'i') return { side: 'izquierdo' }
  if (s.startsWith('eje') || s.startsWith('cen') || s === 'c') return { side: 'eje' }
  if (s.startsWith('amb')) return { side: 'ambos' }
  return { side: null, crudo: String(v) }
}

function conservacion(v) {
  const s = sinTildes(v)
  if (s.startsWith('buen')) return 'bueno'
  if (s.startsWith('regul')) return 'regular'
  if (s.startsWith('mal')) return 'malo'
  return null
}

function uso(v) {
  const s = sinTildes(v).replace(/\s/g, '')
  if (!s) return null
  if (s.includes('desuso')) return 'en_desuso'
  if (s.includes('uso')) return 'en_uso'
  return null
}

/** Las fechas llegan como fecha, como texto ISO, o con el mes en 15. */
function fecha(v, ref) {
  if (v == null) return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, d, mes, a] = m.map(Number)
    if (mes >= 1 && mes <= 12 && d >= 1 && d <= 31) {
      return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    anotar(ref, 'fecha imposible', s, 'se deja sin fecha de alta')
    return null
  }
  anotar(ref, 'fecha ilegible', s, 'se deja sin fecha de alta')
  return null
}

/**
 * El vocabulario de cada campo, en su forma correcta.
 *
 * El mismo valor llega escrito de cinco maneras: «Hito kilometrico»,
 * «Hito Kilometrico», «Hitokilometrico»; «Pintura de borde» y
 * «Pinturadeborde»; «Geobolsa» y «Geobolsas». Se comparan sin tildes, sin
 * espacios y en minúscula, y se devuelve una sola forma: las siglas del MTC
 * en mayúsculas —el formulario ofrece «MCA», no «Mca»— y el castellano como
 * se escribe, con sus tildes.
 */
const CANON = {
  clasificacion: {
    aca: 'ACA', mca: 'MCA', mpe: 'MPE', tca: 'TCA', tmc: 'TMC',
    barrera: 'Barrera', canal: 'Canal', bajadadeagua: 'Bajada de agua',
    guardavias: 'Guardavías', hitokilometrico: 'Hito kilométrico',
    postedelineadorcircular: 'Poste delineador circular',
    postedelineadortriangular: 'Poste delineador triangular',
    giba: 'Giba', marcaoletras: 'Marca o letras',
    pinturadeborde: 'Pintura de borde', pinturadeeje: 'Pintura de eje',
    tachadeborde: 'Tacha de borde', tachadeeje: 'Tacha de eje',
    tacha: 'Tachas', tachas: 'Tachas', tachones: 'Tachones',
    informativa: 'Informativa', preventiva: 'Preventiva', reglamentaria: 'Reglamentaria',
  },
  tipo_estructura: {
    concreto: 'Concreto', gavion: 'Gavión', geobolsa: 'Geobolsas', geobolsas: 'Geobolsas',
    geosintetico: 'Geosintético', mamposteria: 'Mampostería',
    giba: 'Giba', reductordevelocidad: 'Reductor de velocidad', resonador: 'Resonador',
  },
  tipo: { concreto: 'Concreto', mamposteria: 'Mampostería', tierra: 'Tierra' },
  material: { acero: 'Acero', concreto: 'Concreto', pvcconcreto: 'PVC concreto' },
  seccion: { noaplica: 'No aplica', rectangular: 'Rectangular', tipobaul: 'Tipo baúl', trapezoidal: 'Trapezoidal' },
  encauzamiento: {
    canales: 'Canales', murocabezal: 'Muro cabezal', quebrada: 'Quebrada', sinestructura: 'Sin estructura',
  },
}

/** La forma correcta de un valor de vocabulario; lo desconocido se anota. */
function canon(campo, v, ref) {
  if (v == null || String(v).trim() === '') return null
  const k = sinTildes(v).replace(/\s/g, '')
  const hit = CANON[campo]?.[k]
  if (hit) return hit
  const frase = String(v).trim().replace(/\s+/g, ' ')
  anotar(ref, 'valor no reconocido', `${campo} = «${frase}»`, 'se guarda tal cual')
  return frase.charAt(0).toUpperCase() + frase.slice(1).toLowerCase()
}

// ─── Qué es cada hoja ──────────────────────────────────────────────────────

/** El tipo de elemento de una fila, según la hoja y su clasificación. */
function tipoDe(hoja, fila) {
  const h = sinTildes(hoja)
  const clas = sinTildes(fila.clasificacion)
  const est = sinTildes(fila.tipo_estructura)
  if (h.startsWith('alcantarilla')) return 'ALC'
  if (h.startsWith('baden')) return 'BAD'
  if (h.startsWith('berma')) return 'BER'
  if (h.startsWith('calzada')) return 'CAL'
  if (h.startsWith('derecho de via')) return 'DDV'
  if (h.startsWith('drenaje')) return 'DRL'
  if (h.startsWith('encarrilamiento')) {
    if (clas.includes('guardavia')) return 'GUA'
    if (clas.includes('barrera')) return 'BAR'
    return 'PDL'
  }
  if (h.startsWith('puente')) return 'PUE'
  if (h.startsWith('senalizacion horizontal')) return 'SEH'
  if (h.startsWith('senalizacion vertical')) return clas.includes('hito') ? 'HIT' : 'SEV'
  if (h.startsWith('tunel')) return 'TUN'
  if (h.startsWith('muro')) return 'MUR'
  if (h.startsWith('otros')) {
    if (est.includes('resonador')) return 'RES'
    if (est.includes('reductor') || est.includes('giba')) return 'RDV'
    return 'OTR'
  }
  return null
}

// ─── Columnas por nombre ───────────────────────────────────────────────────

/**
 * Qué columna es cuál, por lo que dice la cabecera.
 *
 * Latitud y longitud se recogen como «coordenada inicial» y «final» sin
 * decidir aquí cuál es cuál: eso lo decide el valor de cada fila.
 */
function columnas(ws) {
  const cab = {}
  const fila1 = ws.getRow(1)
  // La cabecera de datos termina donde empiezan las leyendas.
  let ultima = 0
  fila1.eachCell({ includeEmpty: false }, (c, col) => {
    const t = sinTildes(valor(c))
    if (!t) return
    if (/^\d+ \d+ /.test(t) || /^(ruta|tramo|prog|ubicacion|pki|pkf|lado|clasif|tipo|foto|fecha|estado|ancho|largo|d1|d2|long|altura|ojos|diametro|seccion|material|observ|ficha|estructura|subtramo|otras)/.test(t)) {
      ultima = col
    }
  })

  const coords = []
  const fotos = []
  for (let col = 1; col <= ultima; col++) {
    const bruto = valor(ws.getRow(1).getCell(col))
    const t = sinTildes(bruto).replace(/^\d+ \d+ /, '')
    if (!t) continue
    const set = (k) => { if (cab[k] == null) cab[k] = col }
    if (t.startsWith('ruta')) set('ruta')
    else if (t.startsWith('tramo')) set('tramo')
    else if (t === 'subtramo') set('subtramo_raro')
    else if (/prog/.test(t) && /final/.test(t)) set('prog_fin')
    else if (/prog/.test(t)) set('prog_ini')
    else if (/(latitud|longitud)/.test(t)) coords.push({ col, final: /(pkf|final)/.test(t) })
    else if (t.startsWith('lado')) set('lado')
    else if (t.startsWith('clasif')) set('clasificacion')
    else if (t.startsWith('tipo de encauzamiento entrada')) set('encauz_entrada')
    else if (t.startsWith('tipo de encauzamiento salida')) set('encauz_salida')
    else if (t.startsWith('tipo de estructura')) set('tipo_estructura')
    else if (t.startsWith('tipo')) set('tipo')
    else if (t.startsWith('ojos')) set('ojos')
    else if (t.startsWith('diametro')) set('diametro')
    else if (t.startsWith('altura')) set('altura')
    else if (t.startsWith('ancho')) set('ancho')
    else if (t.startsWith('largo')) set('largo')
    else if (t === 'd1 m' || t === 'd1') set('largo')
    else if (t === 'd2 m' || t === 'd2') set('ancho')
    else if (t.startsWith('long total')) set('long_total')
    else if (t.startsWith('longitud')) set('longitud_m')
    else if (t.startsWith('seccion')) set('seccion')
    else if (t.startsWith('material')) set('material')
    else if (t.startsWith('estructura rodadura tipo')) set('rodadura')
    else if (t.startsWith('estructura rodadura espesor')) set('espesor_cm')
    else if (t.startsWith('ficha')) set('ficha')
    else if (t.startsWith('observ') || t.startsWith('otras observ')) set('observaciones')
    else if (t.startsWith('fecha')) set('fecha_alta')
    else if (t.startsWith('foto')) fotos.push({ col, vista: t.replace(/^foto\s*/, '') })
    else if (t.startsWith('estado de conservacion')) set('conservacion')
    else if (t.startsWith('estado de uso')) set('uso')
  }

  // Coordenadas: las dos primeras son el punto inicial, las dos siguientes
  // el final. Por posición, porque las etiquetas no son de fiar.
  const ini = coords.filter((c) => !c.final).map((c) => c.col)
  const fin = coords.filter((c) => c.final).map((c) => c.col)
  if (!fin.length && ini.length >= 4) { cab.c_ini = ini.slice(0, 2); cab.c_fin = ini.slice(2, 4) }
  else { cab.c_ini = ini.slice(0, 2); cab.c_fin = fin.slice(0, 2) }
  cab.fotos = fotos
  cab.ultima = ultima
  return cab
}

// ─── Lectura ───────────────────────────────────────────────────────────────

const elementos = []
const resumen = []

const libros = abrirLibros(CARPETA)
for (const archivo of Object.keys(libros).sort()) {
  const st = archivo.slice(0, 2)

  for (const ws of libros[archivo]) {
    const cab = columnas(ws)
    let leidas = 0
    let descartadas = 0
    if (cab.prog_ini == null) {
      resumen.push({ archivo, hoja: ws.name, filas: 0, nota: 'sin cabecera de progresiva' })
      continue
    }

    // Una hoja que es copia de otro subtramo —la plantilla arrastrada sin
    // limpiar— se detecta porque su TRAMO dice otro subtramo y sus
    // progresivas no son de este tramo.
    let ajenas = 0
    let propias = 0
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return
      const p = num(valor(row.getCell(cab.prog_ini)))
      if (p == null) return
      const t = TRAMOS[st]
      if (p >= t.desde - 1500 && p <= t.hasta + 1500) propias++
      else ajenas++
    })
    if (st === '05' && ajenas > 0 && propias === 0) {
      anotar({ archivo, hoja: ws.name }, 'hoja copiada de otro subtramo',
        `${ajenas} filas con progresivas de la Panamericana en la hoja de la vía alterna`,
        'se descarta la hoja entera: son los mismos elementos del subtramo 4')
      resumen.push({ archivo, hoja: ws.name, filas: 0, nota: `descartada: copia (${ajenas} filas)` })
      continue
    }

    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return
      const get = (k) => (cab[k] == null ? null : valor(row.getCell(cab[k])))
      const progIni = get('prog_ini')
      if (num(progIni) == null) return
      const ref = { archivo, hoja: ws.name, fila: r }

      // Una fila que no tiene más que la progresiva es un residuo de la
      // plantilla, no un elemento: sin ruta, sin coordenadas, sin foto y sin
      // estado no hay nada que inventariar. Pasó con un «puente» en el km
      // 1335+532 dentro de la hoja del subtramo 1.
      let conDato = 0
      for (let c = 1; c <= cab.ultima; c++) {
        const v = valor(row.getCell(c))
        if (v != null && v !== '') conDato++
      }
      if (conDato <= 1) {
        anotar(ref, 'fila sin datos', `solo la progresiva ${progIni}`, 'se descarta: no es un elemento')
        descartadas++
        return
      }

      const fila = {
        clasificacion: get('clasificacion'),
        tipo_estructura: get('tipo_estructura'),
      }
      const tipo = tipoDe(ws.name, fila)
      if (!tipo) { descartadas++; return }

      const pi = progresiva(progIni, st, ref, 'inicial')
      if (!pi) { descartadas++; return }
      const progFin = cab.prog_fin == null ? null : progresivaFinal(get('prog_fin'), pi.m, tipo, ref)

      // Una clasificación que en realidad es un nombre de foto pegado en la
      // columna equivocada se aparta, para no inventar un tipo de señal.
      let clas = fila.clasificacion
      if (clas && /\.(jpe?g|png)$/i.test(String(clas))) {
        anotar(ref, 'dato en la columna equivocada', `clasificación = «${clas}»`, 'se deja sin clasificación')
        clas = null
      }

      const cIni = cab.c_ini.length === 2
        ? coordenada(valor(row.getCell(cab.c_ini[0])), valor(row.getCell(cab.c_ini[1])), ref, 'inicial')
        : null
      const cFin = cab.c_fin.length === 2
        ? coordenada(valor(row.getCell(cab.c_fin[0])), valor(row.getCell(cab.c_fin[1])), ref, 'final')
        : null

      const fotos = cab.fotos
        .map(({ col, vista }) => ({ archivo: valor(row.getCell(col)), vista }))
        .filter((f) => f.archivo && /\.(jpe?g|png)$/i.test(String(f.archivo)))
        .map((f) => ({ archivo: String(f.archivo).trim(), vista: f.vista || null }))

      const l = lado(get('lado'))
      if (l.crudo) anotar(ref, 'lado desconocido', l.crudo, 'se deja sin lado')


      const atributos = {}
      const pon = (k, v) => { if (v != null && v !== '') atributos[k] = v }
      pon('clasificacion', canon('clasificacion', clas, ref))
      pon('tipo_estructura', canon('tipo_estructura', fila.tipo_estructura, ref))
      pon('tipo', canon('tipo', get('tipo'), ref))
      pon('material', canon('material', get('material'), ref))
      pon('ojos', num(get('ojos')))
      pon('diametro_m', num(get('diametro')))
      pon('altura_m', num(get('altura')))
      pon('ancho_m', num(get('ancho')))
      pon('largo_m', num(get('largo')))
      pon('longitud_m', num(get('long_total')) ?? num(get('longitud_m')))
      pon('seccion', canon('seccion', get('seccion'), ref))
      pon('encauzamiento_entrada', canon('encauzamiento', get('encauz_entrada'), ref))
      pon('encauzamiento_salida', canon('encauzamiento', get('encauz_salida'), ref))
      pon('rodadura', get('rodadura') ? String(get('rodadura')).trim().toUpperCase() : null)
      pon('espesor_cm', num(get('espesor_cm')))
      pon('ficha_tecnica', get('ficha'))
      pon('calzada', l.calzada)
      pon('uso', uso(get('uso')))
      pon('fecha_alta', fecha(get('fecha_alta'), ref))
      pon('observaciones', get('observaciones'))
      pon('inventario', 'Inventario anual 2024')
      pon('origen', `${archivo} · ${ws.name} · fila ${r}`)

      elementos.push({
        subtramo: pi.st,
        tramo: TRAMOS[pi.st].code,
        tipo,
        progresiva_m: pi.m,
        progresiva_fin_m: progFin,
        side: l.side,
        condition: conservacion(get('conservacion')),
        inicio: cIni,
        fin: cFin,
        fotos,
        atributos,
        _ref: ref,
      })
      leidas++
    })
    resumen.push({ archivo, hoja: ws.name, filas: leidas, descartadas })
  }
}

// ─── Salida ────────────────────────────────────────────────────────────────

process.stdout.write(JSON.stringify({ elementos, incidencias, resumen }, null, 1))

const porTipo = {}
for (const e of elementos) porTipo[`${e.tramo} ${e.tipo}`] = (porTipo[`${e.tramo} ${e.tipo}`] ?? 0) + 1
console.error(`\nElementos leídos: ${elementos.length}`)
console.error(`Incidencias: ${incidencias.length}`)
const porInc = {}
for (const i of incidencias) porInc[i.tipo] = (porInc[i.tipo] ?? 0) + 1
for (const [k, v] of Object.entries(porInc).sort((a, b) => b[1] - a[1])) console.error(`   ${String(v).padStart(4)}  ${k}`)
