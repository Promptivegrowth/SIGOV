package pe.servicon.sigov.datos

/**
 * Usuario o correo, como en la web (lib/usuario.ts).
 *
 * SERVICON entrega usuarios y contraseñas definidos por ellos, sin pedir un
 * correo a cada capataz (Elvis, 11/11). Por dentro la cuenta sigue siendo
 * de correo: «jramos» es «jramos@sigov.dev».
 */
object Usuario {
    const val DOMINIO = "sigov.dev"

    /** Lo que se escribió en «Usuario o correo», como correo de la cuenta. */
    fun correo(entrada: String): String {
        val limpio = entrada.trim().lowercase()
        return if ('@' in limpio) limpio else "$limpio@$DOMINIO"
    }
}
