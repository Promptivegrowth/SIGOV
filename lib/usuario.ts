/**
 * Usuario o correo.
 *
 * SERVICON prefiere entregar usuarios y contraseñas definidos por ellos, sin
 * pedir un correo a cada capataz (Elvis, 11/11). La cuenta sigue siendo de
 * correo por dentro: «jramos» es «jramos@sigov.dev». Quien tiene correo
 * real lo sigue usando tal cual.
 *
 * La app de campo hace la misma cuenta en datos/Usuario.kt.
 */
export const DOMINIO_DE_USUARIOS = 'sigov.dev'

/** Lo que se escribió en «Usuario o correo», como correo de la cuenta. */
export function correoDeUsuario(entrada: string): string {
  const limpio = entrada.trim().toLowerCase()
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_DE_USUARIOS}`
}

/** Cómo se muestra la cuenta: el usuario solo, si es de SIGOV. */
export function usuarioDeCorreo(correo: string | null | undefined): string {
  if (!correo) return ''
  const sufijo = `@${DOMINIO_DE_USUARIOS}`
  return correo.toLowerCase().endsWith(sufijo) ? correo.slice(0, -sufijo.length) : correo
}

/** Un usuario sin correo: letras, números, punto, guion o guion bajo. */
export function usuarioValido(entrada: string): boolean {
  const limpio = entrada.trim()
  return limpio.includes('@')
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)
    : /^[a-z0-9._-]{3,40}$/i.test(limpio)
}

/**
 * El mínimo de la contraseña, el mismo que exige la autenticación de la
 * nube. SERVICON reparte claves provisionales de 6 (Jefe01, Super01…).
 */
export const CLAVE_MINIMA = 6
