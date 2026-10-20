package pe.servicon.sigov.datos

import java.time.LocalTime

/**
 * Lo que el reporte diario FOR:001 pide de cada actividad además del
 * metrado (formato de Elvis, 13/10): la hora de inicio y fin, la cantidad
 * de personas y la longitud, el ancho y el espesor de lo ejecutado.
 * Todo es opcional: lo que falte sale en blanco en el formato.
 */
data class DetalleFor001(
    val horaInicio: LocalTime? = null,
    val horaFin: LocalTime? = null,
    val personas: Int? = null,
    val longitud: Double? = null,
    val ancho: Double? = null,
    val espesor: Double? = null,
) {
    companion object {
        /**
         * «7:30», «07:30», «0730», «7» o «14.15» → la hora. Lo que no se
         * entiende devuelve null.
         */
        fun hora(texto: String): LocalTime? {
            val t = texto.trim().replace('.', ':').replace('h', ':')
            if (t.isEmpty()) return null
            val (h, m) = when {
                ':' in t -> t.split(':').let { it[0] to it.getOrElse(1) { "0" }.ifBlank { "0" } }
                t.length <= 2 -> t to "0"
                t.length in 3..4 -> t.dropLast(2) to t.takeLast(2)
                else -> return null
            }
            val hh = h.toIntOrNull() ?: return null
            val mm = m.toIntOrNull() ?: return null
            if (hh !in 0..23 || mm !in 0..59) return null
            return LocalTime.of(hh, mm)
        }

        /** Un número decimal positivo, con coma o punto; vacío es null. */
        fun numero(texto: String): Double? =
            texto.trim().replace(",", ".").takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.takeIf { it >= 0 }
    }
}
