package pe.servicon.sigov.datos

/**
 * Los lados de la vía (`road_side` en la base) y cómo se escriben en el
 * formato oficial. CD y CI son la calzada derecha e izquierda (Elvis, P8).
 * El mismo cuadro que `lib/lados.ts` en la web.
 */
object Lados {
    data class Lado(val valor: String, val codigo: String, val etiqueta: String)

    val todos = listOf(
        Lado("derecho", "LD", "LD · derecho"),
        Lado("izquierdo", "LI", "LI · izquierdo"),
        Lado("ambos", "LD/LI", "LD/LI · ambos lados"),
        Lado("eje", "EJE", "EJE · eje"),
        Lado("calzada_derecha", "CD", "CD · calzada derecha"),
        Lado("calzada_izquierda", "CI", "CI · calzada izquierda"),
    )

    /** «CD · calzada derecha»; lo que no se reconoce se muestra tal cual. */
    fun etiqueta(valor: String?): String? =
        valor?.takeIf { it.isNotBlank() }?.let { v -> todos.firstOrNull { it.valor == v }?.etiqueta ?: v }

    /** «CD»: como lo escribe la programación. */
    fun codigo(valor: String?): String? =
        valor?.takeIf { it.isNotBlank() }?.let { v -> todos.firstOrNull { it.valor == v }?.codigo ?: v }
}
