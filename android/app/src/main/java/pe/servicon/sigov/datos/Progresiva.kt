package pe.servicon.sigov.datos

import java.util.Locale

/**
 * La progresiva: el kilometraje con el que se ubica todo en la carretera.
 *
 * En obra se escribe y se dicta como `18+400`, que son 18 400 metros desde el
 * inicio de la vía. La base guarda metros; la pantalla muestra la forma de
 * obra. Esta conversión está en un solo sitio para que el formulario, el
 * parte y el sello de la foto digan exactamente lo mismo.
 */
object Progresiva {

    /** `18400.0` → `18+400`. */
    fun aTexto(metros: Double): String {
        val enteros = metros.toLong()
        val km = enteros / 1000
        val resto = (enteros % 1000).coerceAtLeast(0)
        return "$km+${String.format(Locale.US, "%03d", resto)}"
    }

    /** `18+400` → `18400.0`. Devuelve null si no se entiende. */
    fun aMetros(texto: String): Double? {
        val limpio = texto.trim()
        if (limpio.isBlank()) return null
        val partes = limpio.split("+")
        return runCatching {
            if (partes.size == 2) {
                partes[0].trim().toDouble() * 1000 + partes[1].trim().replace(",", ".").toDouble()
            } else {
                limpio.replace(",", ".").toDouble()
            }
        }.getOrNull()
    }

    /** `18+000 → 18+400`, o solo el inicio si no hay fin. */
    fun rango(inicio: Double?, fin: Double?): String? {
        if (inicio == null) return null
        return if (fin != null) "${aTexto(inicio)} → ${aTexto(fin)}" else aTexto(inicio)
    }
}
