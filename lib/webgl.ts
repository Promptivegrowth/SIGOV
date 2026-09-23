/**
 * Si este navegador puede dibujar mapas.
 *
 * MapLibre pinta con WebGL y, cuando no consigue el contexto, **lanza** en
 * su constructor en vez de devolver un mapa vacío. Esa excepción sube por
 * el árbol de React, y una excepción que nadie atrapa tumba la aplicación
 * entera: la plataforma se quedaba en blanco con «Application error: a
 * client-side exception has occurred». Pasó en un equipo con la
 * aceleración por hardware desactivada —`GL_VENDOR = Disabled`—, que es una
 * casilla que cualquiera puede desmarcar sin saber lo que apaga.
 *
 * Un contrato de conservación vial no puede quedarse sin panel porque un
 * equipo no dibuje mapas. Preguntando antes, el mapa se cambia por un aviso
 * y todo lo demás sigue funcionando.
 */
let soporte: boolean | null = null

export function hayWebGL(): boolean {
  if (soporte !== null) return soporte
  if (typeof window === 'undefined') return false

  try {
    const lienzo = document.createElement('canvas')
    const gl =
      lienzo.getContext('webgl2') ??
      lienzo.getContext('webgl') ??
      lienzo.getContext('experimental-webgl')

    soporte = !!gl
    // El contexto se suelta en cuanto se sabe la respuesta: el navegador
    // admite unos pocos a la vez y los mapas de verdad los necesitan.
    if (gl && 'getExtension' in gl) {
      ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    soporte = false
  }

  return soporte
}

/** Lo que se le dice a quien no puede ver el mapa. */
export const SIN_WEBGL = {
  titulo: 'Este navegador no puede dibujar el mapa',
  detalle:
    'El mapa necesita aceleración por hardware y aquí está desactivada. ' +
    'Actívala en la configuración del navegador —en Edge y Chrome, ' +
    'Configuración › Sistema › «Usar aceleración de hardware cuando esté ' +
    'disponible»— y vuelve a cargar la página. El resto de la plataforma ' +
    'funciona con normalidad.',
} as const
