package pe.servicon.sigov.datos

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Qué se imprime encima de la fotografía.
 *
 * No todos los clientes aceptan el mismo formato: unos exigen coordenadas,
 * otros rechazan la foto si lleva texto encima, y el panel fotográfico de
 * OSITRAN pide el código del PCI a la vista. Antes esto estaba cableado en
 * el código y cambiarlo obligaba a publicar una versión nueva de la app.
 *
 * Lo que se configura es lo que se **imprime**, no lo que se registra: las
 * coordenadas, la huella SHA-256 y la hora exacta se guardan siempre, lleve
 * sello o no. Si no, el sello dejaría de valer como sustento.
 */
@Serializable
data class Sello(
    val activo: Boolean = true,
    val fecha: Boolean = true,
    val hora: Boolean = true,
    val geo: Boolean = true,
    val progresiva: Boolean = true,
    val tramo: Boolean = true,
    val cuadrilla: Boolean = false,
    val actividad: Boolean = true,
    val pci: Boolean = true,
    val marca: Boolean = true,
)

@Serializable
data class AjustesDeCaja(
    @SerialName("monto_minimo_comprobante") val montoMinimoComprobante: Double = 20.0,
)

@Serializable
data class AjustesDeAlertas(
    @SerialName("dias_aviso_vencimiento") val diasAvisoVencimiento: Int = 30,
    @SerialName("dias_aviso_pci") val diasAvisoPci: Int = 7,
)

/**
 * Los ajustes del contrato tal como los devuelve la nube.
 *
 * Se bajan con los catálogos y se guardan en el equipo: sellar una foto en
 * la quebrada no puede depender de que haya señal para preguntar cómo.
 */
@Serializable
data class AjustesDelServicio(
    val sello: Sello = Sello(),
    val caja: AjustesDeCaja = AjustesDeCaja(),
    val alertas: AjustesDeAlertas = AjustesDeAlertas(),
)
