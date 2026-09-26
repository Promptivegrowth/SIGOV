/**
 * Referenciación lineal del contrato: de progresiva a punto y de punto a
 * progresiva, calibrada con los hitos kilométricos del MTC.
 *
 * La forma ingenua es repartir el kilometraje del tramo a lo largo de la
 * traza, como si avanzara parejo con la distancia recorrida. Donde hubo una
 * variante eso deja de ser cierto —el kilometraje se fijó sobre la vía
 * antigua y la traza es la actual—, y en Montalvo ese reparto dejaba
 * alcantarillas hasta 1,4 km antes de su progresiva. Con un hito por
 * kilómetro cada progresiva se interpola entre los dos hitos que la rodean,
 * y el error baja a lo que mide el propio hito.
 *
 * También sirve para juzgar una coordenada: se proyecta sobre la vía y se
 * ve a qué distancia cae y a qué progresiva corresponde. Una coordenada
 * puede estar dentro del contrato y aun así en el kilómetro equivocado, y
 * eso solo se ve comparándola con la vía.
 */

const R = 6371000
const rad = (d) => (d * Math.PI) / 180

/** El punto de la traza más cercano: a qué distancia y cuánto recorrido lleva. */
function proyectarEnTraza(t, lat, lng) {
  const Q = [lng * t.kx, lat * t.ky]
  let mejor = { d: Infinity, s: 0 }
  for (let i = 0; i < t.P.length - 1; i++) {
    const A = t.P[i]
    const B = t.P[i + 1]
    const dx = B[0] - A[0]
    const dy = B[1] - A[1]
    const L = dx * dx + dy * dy
    let u = L === 0 ? 0 : ((Q[0] - A[0]) * dx + (Q[1] - A[1]) * dy) / L
    u = Math.max(0, Math.min(1, u))
    const d = Math.hypot(Q[0] - (A[0] + u * dx), Q[1] - (A[1] + u * dy))
    if (d < mejor.d) mejor = { d, s: t.acum[i] + u * Math.sqrt(L) }
  }
  return mejor
}

/** Interpolación lineal por tramos sobre pares ordenados [x, y]. */
function interpolar(pares, x) {
  if (x <= pares[0][0]) {
    const [[x0, y0], [x1, y1]] = pares
    return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0 || 1)
  }
  for (let i = 1; i < pares.length; i++) {
    if (x <= pares[i][0]) {
      const [x0, y0] = pares[i - 1]
      const [x1, y1] = pares[i]
      return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0 || 1)
    }
  }
  const [x0, y0] = pares[pares.length - 2]
  const [x1, y1] = pares[pares.length - 1]
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0 || 1)
}

/**
 * Una traza lista para medir: en metros, con su recorrido acumulado y su
 * tabla de calibración progresiva ↔ recorrido.
 */
export function prepararTraza({ code, desde, hasta, puntos, hitos = [] }) {
  const lat0 = puntos[0][1]
  const kx = (Math.cos(rad(lat0)) * R * Math.PI) / 180
  const ky = (R * Math.PI) / 180
  const P = puntos.map(([lng, lat]) => [lng * kx, lat * ky])
  const acum = [0]
  for (let i = 1; i < P.length; i++) {
    acum.push(acum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
  }
  const t = { code, desde, hasta, P, acum, total: acum[acum.length - 1], kx, ky, puntos }

  // La calibración: los extremos oficiales del tramo y cada hito que cae
  // sobre la vía. Un hito a más de cien metros de la traza está en la otra
  // calzada o mal puesto, y se deja fuera; uno que rompe el orden también.
  const pares = [[desde, 0]]
  let descartados = 0
  for (const h of hitos) {
    const km = h.km * 1000
    if (km <= desde || km >= hasta) continue
    const p = proyectarEnTraza(t, h.lat, h.lng)
    if (p.d > 100) { descartados++; continue }
    const [ultKm, ultS] = pares[pares.length - 1]
    if (km <= ultKm || p.s <= ultS) { descartados++; continue }
    pares.push([km, p.s])
  }
  const [ultKm, ultS] = pares[pares.length - 1]
  if (hasta > ultKm && t.total > ultS) pares.push([hasta, t.total])

  t.progARecorrido = pares
  t.recorridoAProg = pares.map(([k, s]) => [s, k])
  t.hitosUsados = pares.length - 2
  t.hitosDescartados = descartados
  return t
}

/** Dónde cae un punto respecto de la vía: lejanía y progresiva calibrada. */
export function proyectar(t, lat, lng) {
  const p = proyectarEnTraza(t, lat, lng)
  return { distancia: p.d, progresiva: interpolar(t.recorridoAProg, p.s) }
}

/**
 * El punto de la vía que corresponde a una progresiva.
 *
 * Con `lado` se desplaza unos metros a la derecha o a la izquierda de la
 * vía, en el sentido del kilometraje, para que la señal de la derecha y la
 * de la izquierda del mismo kilómetro no queden una encima de la otra.
 */
export function puntoEn(t, progresiva, lado = null, separacion = 7) {
  const s = Math.max(0, Math.min(t.total, interpolar(t.progARecorrido, progresiva)))
  let i = 1
  while (i < t.acum.length - 1 && t.acum[i] < s) i++
  const a = t.acum[i - 1]
  const b = t.acum[i]
  const u = b === a ? 0 : (s - a) / (b - a)
  const [x1, y1] = t.P[i - 1]
  const [x2, y2] = t.P[i]
  let x = x1 + u * (x2 - x1)
  let y = y1 + u * (y2 - y1)

  if (lado === 'derecho' || lado === 'izquierdo') {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1
    // Normal a la derecha del sentido de avance: (dy, −dx).
    const nx = (y2 - y1) / L
    const ny = -(x2 - x1) / L
    const k = lado === 'derecho' ? separacion : -separacion
    x += nx * k
    y += ny * k
  }
  return { lat: y / t.ky, lng: x / t.kx }
}
