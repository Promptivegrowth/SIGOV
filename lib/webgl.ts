/**
 * Si este navegador puede dibujar mapas, y por qué no cuando no puede.
 *
 * MapLibre pinta con WebGL y, cuando no consigue el contexto, **lanza** en
 * su constructor en vez de devolver un mapa vacío. Esa excepción sube por
 * el árbol de React, y una excepción que nadie atrapa tumba la aplicación
 * entera: la plataforma se quedaba en blanco con «Application error: a
 * client-side exception has occurred». Un contrato de conservación vial no
 * puede quedarse sin panel porque un equipo no dibuje mapas.
 *
 * El motivo se guarda además del sí o el no. La primera versión de esto
 * daba por hecho que la causa era la casilla de aceleración por hardware
 * del navegador, y mandaba a activarla; la persona que lo reportó ya la
 * tenía activada, así que el aviso la mandaba a mirar donde no estaba el
 * problema. El navegador sí sabe la causa exacta —la dice en el evento
 * `webglcontextcreationerror`— y con enseñarla se acaba la adivinanza.
 */
type Diagnostico = { puede: boolean; motivo?: string }

let cache: Diagnostico | null = null

export function diagnosticarWebGL(): Diagnostico {
  if (cache) return cache
  if (typeof window === 'undefined') return { puede: false }

  let motivo: string | undefined

  try {
    const lienzo = document.createElement('canvas')

    // El navegador cuenta aquí por qué no pudo. Sin escucharlo, lo único
    // que queda es un null sin explicación.
    lienzo.addEventListener(
      'webglcontextcreationerror',
      (e) => { motivo = (e as WebGLContextEvent).statusMessage || motivo },
      { once: false }
    )

    // Los mismos atributos que pide MapLibre. Preguntar con los de por
    // defecto respondería por un contexto que luego el mapa no obtiene:
    // `high-performance` y `failIfMajorPerformanceCaveat` son justo los que
    // fallan en equipos donde la GPU no está disponible.
    const atributos: WebGLContextAttributes = {
      antialias: false,
      depth: true,
      stencil: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'high-performance',
    }

    const gl =
      lienzo.getContext('webgl2', atributos) ??
      lienzo.getContext('webgl', atributos) ??
      lienzo.getContext('experimental-webgl', atributos)

    if (gl) {
      // El contexto se suelta en cuanto se sabe la respuesta: el navegador
      // admite unos pocos a la vez y los mapas de verdad los necesitan.
      ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
      cache = { puede: true }
    } else {
      cache = { puede: false, motivo }
    }
  } catch (fallo) {
    cache = { puede: false, motivo: motivo ?? (fallo as Error)?.message }
  }

  return cache
}

/** Lo de siempre, cuando solo hace falta el sí o el no. */
export const hayWebGL = () => diagnosticarWebGL().puede

/**
 * Lo que se le dice a quien no puede ver el mapa.
 *
 * Sin afirmar cuál de las causas es la suya: la casilla del navegador es
 * solo una de ellas, y darla por segura hace perder el tiempo a quien ya
 * la tiene bien.
 */
export const SIN_WEBGL = {
  titulo: 'Este navegador no puede dibujar el mapa',
  detalle:
    'El mapa necesita que el navegador pueda usar la tarjeta gráfica, y aquí ' +
    'no está pudiendo. Suele ser una de tres: la aceleración por hardware ' +
    'desactivada —Configuración › Sistema, en Edge y en Chrome—, el ' +
    'controlador de vídeo desactualizado, o que el navegador la haya apagado ' +
    'solo tras un fallo y haga falta cerrarlo del todo y volver a abrirlo. ' +
    'En edge://gpu o chrome://gpu dice cuál es. El resto de la plataforma ' +
    'funciona con normalidad.',
} as const
