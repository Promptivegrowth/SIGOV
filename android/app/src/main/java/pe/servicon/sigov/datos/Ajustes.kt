package pe.servicon.sigov.datos

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Qué se imprime encima de la fotografía.
 *
 * Elvis (reunión del 05-10): «lo único que tiene que aparecer en la foto es
 * fecha y hora». Tramo, progresiva y PCI ya van en la pizarra física, y
 * repetirlos impresos ensucia la foto; la georreferenciación queda como dato
 * dentro del archivo. Por eso, por omisión, solo fecha y hora; lo demás
 * está disponible pero apagado. Fecha y hora no se apagan.
 *
 * Lo que se configura es lo que se **imprime**, no lo que se registra: las
 * coordenadas, la huella SHA-256 y la hora exacta se guardan siempre, en la
 * base y dentro del archivo, lleve sello o no.
 */
@Serializable
data class Sello(
    val activo: Boolean = true,
    val fecha: Boolean = true,
    val hora: Boolean = true,
    val geo: Boolean = false,
    val precision: Boolean = false,
    val progresiva: Boolean = false,
    val tramo: Boolean = false,
    val cuadrilla: Boolean = false,
    val actividad: Boolean = false,
    val pci: Boolean = false,
    val marca: Boolean = false,
) {
    /** Fecha y hora van siempre: es lo mínimo que pide COVINCA. */
    fun conFechaYHora(): Sello = copy(fecha = true, hora = true)

    /** Lo que se imprime además de la fecha y la hora, dicho en palabras. */
    val extras: List<String>
        get() = listOfNotNull(
            "coordenadas".takeIf { geo },
            "precisión GPS".takeIf { geo && precision },
            "tramo".takeIf { tramo },
            "progresiva".takeIf { progresiva },
            "actividad".takeIf { actividad },
            "PCI".takeIf { pci },
            "cuadrilla".takeIf { cuadrilla },
            "firma SIGOV".takeIf { marca },
        )
}

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
