package pe.servicon.sigov.datos

import java.text.Normalizer
import java.util.Locale

private val TILDES = Regex("\\p{Mn}+")

/**
 * El texto como se busca, no como se escribe.
 *
 * En obra nadie escribe «Camaná» ni «Emulsión» con tilde: se teclea rápido,
 * con una mano y con guantes. Si la búsqueda exige el acento, el capataz no
 * encuentra nada y concluye que la aplicación no sirve.
 */
fun String.paraBuscar(): String =
    Normalizer.normalize(this, Normalizer.Form.NFD)
        .replace(TILDES, "")
        .lowercase(Locale("es", "PE"))
        .trim()

/** Si el texto contiene lo buscado, ignorando tildes y mayúsculas. */
fun String.contienePorBusqueda(buscado: String): Boolean =
    paraBuscar().contains(buscado.paraBuscar())
