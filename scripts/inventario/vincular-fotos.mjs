/**
 * SIGOV · Qué foto es de qué elemento.
 *
 * El Excel cita una foto por elemento y en la carpeta hay varias: la
 * alcantarilla que cita su entrada tiene también la salida y la
 * panorámica; el guardavía del peaje, una por calzada. Y a veces la foto
 * citada no existe con ese nombre porque la progresiva se digitó distinto
 * en el archivo y en la hoja —«1267+822» en una, «1267+842» en la otra—.
 *
 * Se vincula de lo más seguro a lo menos, y cada vínculo dice cómo se hizo:
 *
 *   cita      el Excel nombra la foto y el archivo existe tal cual
 *   cercana   el Excel nombra una foto que no existe, y hay una del mismo
 *             tipo, lado y vista a menos de 50 m de esa progresiva
 *   hermana   otra vista de una foto ya vinculada (_E → _P, _S)
 *   posición  foto que nadie cita, del mismo tipo y lado que un elemento a
 *             menos de 50 m
 *
 * Lo que no encaja por ningún camino no se pierde: sale como huérfana y se
 * sube como evidencia del tramo, con su progresiva, sin elemento.
 */

const TOLERANCIA_M = 50

/** A qué tipos de elemento puede pertenecer una foto según su prefijo. */
const TIPOS_DE = {
  ALC: ['ALC'],
  SV: ['SEV', 'HIT'],
  CALZ: ['CAL', 'BER', 'SEH'],
  BERM: ['BER'],
  ENC: ['PDL', 'GUA', 'BAR'],
  DREN: ['DRL'],
  MUR: ['MUR'],
  PTE: ['PUE'],
  TNL: ['TUN'],
  GIBA: ['RDV', 'SEH'],
  RESONADOR: ['RES'],
}

const VISTAS = new Set(['E', 'S', 'P', 'AR', 'AB', 'A', 'U'])
const LADOS = { D: 'derecho', I: 'izquierdo', C: 'eje' }
const CALZADAS = new Set(['UC', 'UD', 'CD', 'CI', 'CU'])

/**
 * Lo que dice el nombre de una foto: tipo, progresiva, lado, vista.
 * «ALC_1048+981_AB.jpg», «SV_1316+000cd_d.jpg», «924+891_Giba.JPG».
 */
export function leerNombre(nombre) {
  let base = String(nombre).replace(/\.(jpe?g|png|webp)$/i, '').trim()
  // «SV_904_+351_D»: se tolera un separador suelto a los lados del «+».
  const m = base.match(/^(?:([A-Za-z]+(?:-[A-Za-z]+)?)[_-])?(\d+)[\s_]*\+[\s_]*(\d+(?:[.,]\d+)?)(.*)$/)
  if (!m) return null
  let pref = (m[1] || '').toUpperCase()
  if (pref.startsWith('PTE') || pref.startsWith('PNT')) pref = 'PTE'
  const km = Number(m[2])
  let metros = Number(m[3].replace(',', '.'))
  let digitoDeMas = false
  // «1115+8411» o «1135+1039»: los metros no pasan de 999, sobra un dígito.
  // No se sabe cuál —el último o el primero—, así que se guardan las dos
  // lecturas y decide la que tenga un elemento cerca.
  let alternativas = []
  if (metros >= 1000) {
    digitoDeMas = true
    const txt = String(Math.trunc(metros))
    alternativas = [...new Set([Number(txt.slice(0, 3)), Number(txt.slice(1))])].map((x) => km * 1000 + x)
    metros = Number(txt.slice(0, 3))
  }
  const progresiva = km * 1000 + metros

  const tokens = m[4].split(/[_\-\s]+/).map((t) => t.toUpperCase()).filter(Boolean)
  let lado = null
  let vista = null
  let calzada = null
  for (let t of tokens) {
    // «000cd» deja «CD» pegado al número
    if (/^\d+[A-Z]+$/.test(t)) t = t.replace(/^\d+/, '')
    if (t === 'GIBA' || t === 'RESONADOR') { pref = t; continue }
    if (VISTAS.has(t)) { vista = t; continue }
    if (LADOS[t]) { lado = LADOS[t]; continue }
    if (CALZADAS.has(t)) { calzada = t; continue }
    const c = t.match(/^C(\d)([DI])?$/)
    if (c) { calzada = `C${c[1]}`; if (c[2]) lado = LADOS[c[2]]; continue }
  }
  return { pref, progresiva, alternativas, lado, vista, calzada, digitoDeMas }
}

const clave = (n) =>
  String(n).toLowerCase().replace(/\.(jpe?g|png|webp)$/, '').replace(/[\s]/g, '').replace(/-/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

/** Hermanas: misma foto de base, otra vista. */
const baseDe = (f) => `${f.carpeta}|${f.leido.pref}|${f.leido.progresiva}|${f.leido.lado ?? ''}|${f.leido.calzada ?? ''}`

const CARPETA_DE_TRAMO = {
  'SubTramo 1': 'AQP-01', 'SubTramo 2': 'AQP-02', 'SubTramo 3': 'TAC-01',
  'SubTramo 4': 'TAC-02', 'Obra Adicional': 'VA-01',
}

export function vincular(elementos, indice) {
  // Una entrada por archivo, con lo que dice su nombre.
  const archivos = indice.map((f) => ({ ...f, leido: leerNombre(f.nombre), tramo: CARPETA_DE_TRAMO[f.carpeta] }))
  const porClave = new Map()
  for (const f of archivos) {
    const k = clave(f.nombre)
    if (!porClave.has(k)) porClave.set(k, [])
    porClave.get(k).push(f)
  }
  const porBase = new Map()
  for (const f of archivos) {
    if (!f.leido) continue
    const k = baseDe(f)
    if (!porBase.has(k)) porBase.set(k, [])
    porBase.get(k).push(f)
  }

  /** Lo que se vincula: elemento → { sha → cómo }. */
  const vinculos = elementos.map(() => new Map())
  const usada = new Set()
  const poner = (i, f, como) => {
    if (!vinculos[i].has(f.sha256)) vinculos[i].set(f.sha256, { como, vista: f.leido?.vista ?? null, archivo: f.ruta })
    usada.add(f.ruta)
  }

  const citasSinFoto = []

  // Las fotos que algún elemento cita por su nombre exacto son de ese
  // elemento. No pueden entrar en otro por cercanía: el hito del km
  // 1229+000 cita una foto que no existe, y sin esta regla se quedaba con
  // la de la señal vecina del 1228+974, que es de otro.
  const citadasExactas = new Set()
  for (const e of elementos) {
    for (const c of e.fotos) {
      for (const f of porClave.get(clave(c.archivo)) ?? []) citadasExactas.add(f.ruta)
    }
  }
  const ladosCruzados = []

  // 1 y 2 · lo que el Excel cita
  elementos.forEach((e, i) => {
    for (const cita of e.fotos) {
      const k = clave(cita.archivo)
      let cand = porClave.get(k) ?? []
      // Si el nombre existe en varias carpetas, la del tramo del elemento.
      const mismas = cand.filter((f) => f.tramo === e.tramo)
      if (mismas.length) cand = mismas
      if (cand.length) {
        for (const f of cand) poner(i, f, 'cita')
        continue
      }
      // La foto citada no existe con ese nombre: la más cercana del mismo
      // tipo, lado y vista.
      const leida = leerNombre(cita.archivo)
      if (!leida) { citasSinFoto.push({ elemento: i, cita: cita.archivo }); continue }
      let mejor = null
      for (const f of archivos) {
        if (!f.leido || f.tramo !== e.tramo || f.leido.pref !== leida.pref) continue
        if (citadasExactas.has(f.ruta)) continue
        if ((f.leido.vista ?? null) !== (leida.vista ?? null)) continue
        if (leida.lado && f.leido.lado && f.leido.lado !== leida.lado) continue
        const d = Math.abs(f.leido.progresiva - leida.progresiva)
        if (d <= TOLERANCIA_M && (!mejor || d < mejor.d)) mejor = { f, d }
      }
      if (mejor) { poner(i, mejor.f, 'cercana'); continue }

      // El lado cruzado: la hoja dice derecha y solo existe la foto de la
      // izquierda, en la misma progresiva exacta. Es la foto de ese
      // elemento con el lado mal escrito en uno de los dos sitios —pasó con
      // la señal del km 1129+102—. Se acepta solo si nadie más la usa: si
      // existen las dos, son dos señales y la otra no está inventariada.
      const cruzada = archivos.filter(
        (f) => f.leido && f.tramo === e.tramo && f.leido.pref === leida.pref &&
          !citadasExactas.has(f.ruta) &&
          Math.abs(f.leido.progresiva - leida.progresiva) <= 2 &&
          (f.leido.vista ?? null) === (leida.vista ?? null) &&
          f.leido.lado && leida.lado && f.leido.lado !== leida.lado
      )
      const hermanaMismoLado = archivos.some(
        (f) => f.leido && f.tramo === e.tramo && f.leido.pref === leida.pref &&
          Math.abs(f.leido.progresiva - leida.progresiva) <= 2 && f.leido.lado === leida.lado
      )
      if (cruzada.length === 1 && !hermanaMismoLado) {
        poner(i, cruzada[0], 'lado cruzado')
        ladosCruzados.push({ elemento: i, cita: cita.archivo, foto: cruzada[0].ruta })
      } else {
        citasSinFoto.push({ elemento: i, cita: cita.archivo })
      }
    }
  })

  // 3 · las otras vistas de lo ya vinculado
  vinculos.forEach((m, i) => {
    for (const { archivo } of [...m.values()]) {
      const f = archivos.find((x) => x.ruta === archivo)
      if (!f?.leido) continue
      for (const h of porBase.get(baseDe(f)) ?? []) poner(i, h, 'hermana')
    }
  })

  // 4 · fotos que nadie cita, por tipo, lado y posición
  const porTramoTipo = new Map()
  elementos.forEach((e, i) => {
    const k = `${e.tramo}|${e.tipo}`
    if (!porTramoTipo.has(k)) porTramoTipo.set(k, [])
    porTramoTipo.get(k).push(i)
  })
  for (const f of archivos) {
    if (usada.has(f.ruta) || !f.leido || citadasExactas.has(f.ruta)) continue
    const tipos = TIPOS_DE[f.leido.pref] ?? []
    let mejor = null
    for (const tipo of tipos) {
      for (const i of porTramoTipo.get(`${f.tramo}|${tipo}`) ?? []) {
        const e = elementos[i]
        if (f.leido.lado && e.side && f.leido.lado !== e.side) continue
        const lecturas = f.leido.alternativas.length ? f.leido.alternativas : [f.leido.progresiva]
        const d = Math.min(...lecturas.map((p) => Math.abs(e.progresiva_m - p)))
        if (d <= TOLERANCIA_M && (!mejor || d < mejor.d)) mejor = { i, d }
      }
    }
    if (mejor) poner(mejor.i, f, 'posición')
  }

  const huerfanas = archivos.filter((f) => !usada.has(f.ruta))
  return { vinculos, huerfanas, citasSinFoto, ladosCruzados, archivos }
}
