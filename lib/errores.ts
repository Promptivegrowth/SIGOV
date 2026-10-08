/**
 * Errores para personas (OBS-01).
 *
 * Lo que devuelve Supabase cuando algo falla está escrito para el
 * programador: «duplicate key value violates unique constraint
 * "ux_supplies_servicio_nombre"», «new row violates row-level security
 * policy for table…», el prefijo «SIGOV:» de nuestras propias funciones.
 * Enseñarlo tal cual confunde al usuario y, de paso, le cuenta cómo está
 * hecha la base por dentro. Aquí se traduce a una frase que se entienda.
 *
 * Criterio, en este orden:
 *  1. Nuestros mensajes de negocio (los que la base lanza con «SIGOV:» o los
 *     que el código escribe en castellano) ya están redactados para el
 *     usuario: se muestran sin el prefijo y con mayúscula.
 *  2. Los códigos conocidos de Postgres y de la API se cambian por una
 *     frase sencilla.
 *  3. Todo lo demás —y cualquier cosa que huela a SQL, a nombre de
 *     restricción o a dirección web— se sustituye por una frase genérica.
 *     Más vale un «no se pudo» honrado que un mensaje que nadie entiende.
 *
 * El detalle técnico no se pierde: quien llama sigue teniendo el error
 * original para la consola o el registro.
 */

const GENERICO = 'No se pudo completar la operación. Inténtalo de nuevo y, si se repite, avisa al administrador.'

const POR_CODIGO: Record<string, string> = {
  // Integridad
  '23505': 'Ya existe un registro con esos datos.',
  '23502': 'Falta completar un dato obligatorio.',
  '23514': 'Algún dato no cumple las reglas del sistema. Revisa los valores ingresados.',
  '23P01': 'Se cruza con otro registro que ya existe.',
  // Formato de los datos
  '22P02': 'Hay un dato con un formato que no es válido.',
  '22007': 'Hay una fecha con un formato que no es válido.',
  '22008': 'Hay una fecha fuera de rango.',
  '22003': 'Hay un número demasiado grande.',
  '22001': 'Hay un texto demasiado largo.',
  // Permisos y sesión
  '42501': 'No tienes permiso para hacer esto.',
  '28000': 'Tu sesión no es válida. Vuelve a iniciar sesión.',
  // Concurrencia y tiempo
  '40001': 'Otra persona estaba cambiando lo mismo. Inténtalo de nuevo.',
  '40P01': 'Otra persona estaba cambiando lo mismo. Inténtalo de nuevo.',
  '57014': 'La consulta tardó demasiado. Prueba con menos datos o inténtalo más tarde.',
  // API (PostgREST)
  PGRST116: 'No se encontró el registro: puede que ya no exista.',
  PGRST301: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  PGRST302: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  PGRST303: 'Tu sesión expiró. Vuelve a iniciar sesión.',
}

// Señales de que un texto no es para el usuario: SQL, nombres internos,
// direcciones, credenciales, trazas de JavaScript.
const TECNICO =
  /https?:|url:|headers:|bearer|apikey|jwt|token|violates|constraint|row-level|relation |column |function |syntax|schema|duplicate key|null value|foreign key|json|undefined|typeerror|referenceerror|stack|postgres|pgrst|supabase|sqlstate|\b[a-z]+_[a-z0-9_]+\b|"[^"]*"/i

// Mensajes en inglés de las librerías (autenticación, red, navegador).
const INGLES =
  /\b(the|is|was|not found|failed|invalid|cannot|could not|already|unable|request|denied|exceeded|missing|expected|must|should|with|for|of|and|to|than|does|exist|returned)\b/i

// Y, al revés, señales de castellano: palabras de enlace o tildes. Un texto
// sin ninguna no lo escribimos nosotros.
const CASTELLANO =
  /[áéíóúñ¿¡]|\b(de|del|la|las|el|los|que|en|no|se|por|un|una|al|es|con|para|ya|sin|lo|su|tu|hay|este|esta|falta|primero)\b/i

type ErrorLike = {
  message?: unknown
  code?: unknown
  status?: unknown
  error?: unknown
  error_description?: unknown
}

function conMayuscula(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.charAt(0).toLocaleUpperCase('es-PE') + t.slice(1)
}

/** Primera línea del texto, sin el prefijo de nuestras funciones. */
function limpiar(s: string): string {
  return s.split('\n')[0].replace(/^\s*SIGOV\s*:?\s*/i, '').trim()
}

/**
 * Nuestras funciones a veces citan un estado tal como se guarda
 * («la partida ya está en_curso»): se lee mejor con espacios. Solo se usa
 * con mensajes que escribimos nosotros, nunca con los de Postgres, donde
 * lo que lleva guiones bajos son nombres internos.
 */
function sinGuionesBajos(s: string): string {
  return s.replace(/\b[a-záéíóúñ]+(?:_[a-záéíóúñ]+)+\b/g, (m) => m.replace(/_/g, ' '))
}

function esParaPersonas(s: string): boolean {
  return s.length > 0 && s.length <= 240 && !TECNICO.test(s) && !INGLES.test(s) && CASTELLANO.test(s)
}

/**
 * Texto para mostrar al usuario a partir de cualquier error: el de
 * Supabase (PostgREST, Auth, Storage), un `Error` del propio código, la
 * respuesta `{ error }` de una ruta de la API o un texto suelto.
 *
 * @param porDefecto frase para lo que no se reconozca; si se omite, una
 *   genérica. Conviene pasar algo concreto («No se pudo guardar el ATS»).
 */
export function mensajeAmigable(error: unknown, porDefecto: string = GENERICO): string {
  if (error == null || error === '') return porDefecto

  const e: ErrorLike = typeof error === 'string' ? { message: error } : (error as ErrorLike)
  const crudo = String(e.message ?? e.error_description ?? e.error ?? '')
  const codigo = typeof e.code === 'string' ? e.code : ''
  const texto = limpiar(crudo)

  // 1 · Mensaje de negocio de nuestras funciones: ya está redactado.
  // P0001 es el código por omisión de «raise exception»: también es nuestro.
  const propio = /^\s*SIGOV\s*:/i.test(crudo) || codigo === 'P0001'
  if (propio && esParaPersonas(sinGuionesBajos(texto))) return conMayuscula(sinGuionesBajos(texto))

  // Sin conexión: lo dice el navegador, en inglés y sin código.
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(crudo)) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  }
  // Sesión vencida o rechazada.
  if (/jwt expired|invalid jwt|refresh token|session.*(expired|missing)|not authenticated/i.test(crudo)
      || e.status === 401) {
    return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  }
  // Autenticación (Supabase Auth): los pocos mensajes que se ven a diario.
  if (/invalid login credentials/i.test(crudo)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(crudo)) return 'El correo de esta cuenta todavía no está confirmado.'
  if (/rate limit|too many requests/i.test(crudo) || e.status === 429) {
    return 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.'
  }

  // 2 · Códigos conocidos.
  if (codigo === '23503') {
    // La misma regla salta al borrar algo que otros usan y al guardar algo
    // que apunta a un registro que ya no existe: son consejos distintos.
    return /update or delete|delete on table/i.test(crudo)
      ? 'No se puede borrar: hay otros registros que dependen de este.'
      : 'Uno de los datos elegidos ya no existe. Recarga la página e inténtalo de nuevo.'
  }
  if (codigo === '42501' || /row-level security|permission denied/i.test(crudo)) {
    // Algunas reglas de la base lanzan 42501 con una explicación propia
    // («Solo el supervisor…»): esa sirve más que la genérica.
    return esParaPersonas(texto) ? conMayuscula(texto) : POR_CODIGO['42501']
  }
  // Un 23514 puede ser una regla nuestra con su explicación (sin prefijo).
  if (codigo === '23514' && esParaPersonas(texto)) return conMayuscula(texto)
  if (POR_CODIGO[codigo]) return POR_CODIGO[codigo]
  if (codigo.startsWith('PGRST')) return porDefecto
  if (/^(23|22)/.test(codigo)) return 'Algún dato no es válido. Revisa lo ingresado.'

  // 3 · Lo demás: si parece escrito para personas (un `Error` del propio
  // código, un aviso del GPS o de la cámara), se muestra; si no, genérico.
  return esParaPersonas(texto) ? conMayuscula(texto) : porDefecto
}
