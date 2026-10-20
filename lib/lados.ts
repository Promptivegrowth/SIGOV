/**
 * Los lados de la vía (enum `road_side`), en un solo lugar.
 *
 * CD y CI son la calzada derecha e izquierda (Elvis, P8; el PCI 55 ya los
 * escribe «C.I.» o «Calzada»).
 */
export const LADOS = [
  { valor: 'derecho', codigo: 'LD', etiqueta: 'LD · derecho' },
  { valor: 'izquierdo', codigo: 'LI', etiqueta: 'LI · izquierdo' },
  { valor: 'ambos', codigo: 'LD/LI', etiqueta: 'LD/LI · ambos lados' },
  { valor: 'eje', codigo: 'EJE', etiqueta: 'EJE · eje' },
  { valor: 'calzada_derecha', codigo: 'CD', etiqueta: 'CD · calzada derecha' },
  { valor: 'calzada_izquierda', codigo: 'CI', etiqueta: 'CI · calzada izquierda' },
] as const

export type Lado = (typeof LADOS)[number]['valor']

/** `LD`, `LI`, `LD/LI`, `EJE`, `CD`, `CI`: como lo escribe la programación. */
export function codigoDeLado(side: string | null | undefined): string {
  return LADOS.find((l) => l.valor === side)?.codigo ?? side ?? ''
}

/** `CD · calzada derecha`, para mostrarlo. */
export function etiquetaDeLado(side: string | null | undefined): string {
  return LADOS.find((l) => l.valor === side)?.etiqueta ?? side ?? '—'
}

/**
 * Cómo puede venir escrito el lado en un Excel, ya normalizado (minúsculas,
 * sin espacios ni signos): «LD», «L.I.», «LD/LI», «Eje», «C.I.», «Calzada
 * derecha»…
 */
export const SINONIMOS_DE_LADO: ReadonlyArray<readonly [string, Lado]> = [
  ...LADOS.map((l) => [l.valor.replace(/_/g, ''), l.valor] as const),
  ['ld', 'derecho'], ['d', 'derecho'], ['der', 'derecho'], ['derecha', 'derecho'],
  ['li', 'izquierdo'], ['i', 'izquierdo'], ['izq', 'izquierdo'], ['izquierda', 'izquierdo'],
  ['cent', 'eje'], ['centro', 'eje'],
  ['ldli', 'ambos'], ['lild', 'ambos'], ['ldejeli', 'ambos'], ['e', 'eje'],
  ['cd', 'calzada_derecha'], ['ci', 'calzada_izquierda'],
  ['calzadader', 'calzada_derecha'], ['calzadaizq', 'calzada_izquierda'],
]

/**
 * El lado escrito dentro de un texto libre, como la «Observación» del
 * control del PCI 55: «L.D. MENSAJE SUCIO», «Calzada / C.I. (M/S)»,
 * «L.D. Y L.I.», «EJE.». Sin lado reconocible, null.
 */
export function ladoDesdeTexto(texto: string | null | undefined): Lado | null {
  if (!texto) return null
  const t = ' ' + texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/[^A-Z0-9]+/g, ' ') + ' '
  const hay = (palabra: string) => t.includes(' ' + palabra + ' ')
  const d = hay('LD')
  const i = hay('LI')
  if (d && i) return 'ambos'
  if (d) return 'derecho'
  if (i) return 'izquierdo'
  const cd = hay('CD')
  const ci = hay('CI')
  if (cd && ci) return 'ambos'
  if (cd) return 'calzada_derecha'
  if (ci) return 'calzada_izquierda'
  if (hay('EJE')) return 'eje'
  return null
}
