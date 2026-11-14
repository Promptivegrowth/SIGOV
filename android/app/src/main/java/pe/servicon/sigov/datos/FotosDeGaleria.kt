package pe.servicon.sigov.datos

import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Las fotos traídas de la galería, mientras esperan a guardarse (OBS 2).
 *
 * Cada pantalla que fotografía entrega un archivo a quien guarda la
 * evidencia; la importada lleva además de dónde vino, si se sella y la
 * fecha original del archivo. Se anotan aquí por ruta y [tomar] las retira
 * al guardarlas: así ninguna pantalla cambia su forma de entregar la foto.
 */
object FotosDeGaleria {
    data class Datos(val sellar: Boolean, val fechaOriginal: Instant?)

    private val porRuta = ConcurrentHashMap<String, Datos>()

    fun anotar(archivo: File, datos: Datos) {
        porRuta[archivo.absolutePath] = datos
    }

    fun tomar(archivo: File): Datos? = porRuta.remove(archivo.absolutePath)
}
