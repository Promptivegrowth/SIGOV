package pe.servicon.sigov.datos

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Lo que la aplicación de campo necesita saber del contrato.
 *
 * Son las mismas tablas que usa la web administrativa; aquí solo se declaran
 * los campos que el capataz realmente usa, para no bajar de más por una red
 * que en carretera es cara y lenta.
 */

@Serializable
data class Actividad(
    val id: String,
    val code: String,
    val name: String,
    val category: String? = null,
    @SerialName("unit_id") val unidadId: String? = null,
    @SerialName("min_photos") val fotosMinimas: Int = 2,
    @SerialName("requires_photo") val exigeFoto: Boolean = true,
    val color: String? = null,
)

@Serializable
data class Tramo(
    val id: String,
    val code: String,
    val name: String,
    @SerialName("prog_start_m") val progresivaInicio: Double,
    @SerialName("prog_end_m") val progresivaFin: Double,
)

@Serializable
data class Unidad(
    val id: String,
    val code: String,
    val symbol: String,
)

/** Una actividad programada para la cuadrilla en una fecha. */
@Serializable
data class ItemProgramado(
    val id: String,
    @SerialName("service_id") val servicioId: String,
    @SerialName("activity_id") val actividadId: String? = null,
    @SerialName("activity_name") val actividad: String? = null,
    @SerialName("section_id") val tramoId: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("prog_start_m") val progresivaInicio: Double? = null,
    @SerialName("prog_end_m") val progresivaFin: Double? = null,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("scheduled_on") val fecha: String,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("target_qty") val meta: Double? = null,
    @SerialName("executed_qty") val ejecutado: Double? = null,
    @SerialName("progress_pct") val avance: Double? = null,
    @SerialName("unit_symbol") val unidad: String? = null,
    @SerialName("activity_color") val color: String? = null,
    val priority: Int? = null,
    val status: String = "programado",
    val notes: String? = null,
    @SerialName("pci_code") val pciOrigen: String? = null,
    // El ciclo de vida: qué se puede hacer con la partida ahora mismo
    @SerialName("started_at") val iniciadaEn: String? = null,
    @SerialName("finished_at") val cerradaEn: String? = null,
    @SerialName("validated_at") val validadaEn: String? = null,
    val impedimento: String? = null,
) {
    val estaPendiente: Boolean get() = status == "programado"
    val estaEnCurso: Boolean get() = status == "en_curso"
    val esperaValidacion: Boolean get() = status == "por_validar"
    val estaObservada: Boolean get() = status == "suspendido"
    val estaCerrada: Boolean get() = status in setOf("ejecutado", "cancelado", "reprogramado")
}

/** Un ítem de PCI asignado a la cuadrilla, con su plazo. */
@Serializable
data class ItemPci(
    val id: String,
    @SerialName("pci_id") val pciId: String,
    @SerialName("pci_code") val pciCodigo: String? = null,
    @SerialName("item_number") val numero: Int? = null,
    val description: String? = null,
    @SerialName("pci_title") val pciTitulo: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("prog_start_m") val progresiva: Double? = null,
    @SerialName("prog_end_m") val progresivaFin: Double? = null,
    val side: String? = null,
    @SerialName("activity_id") val actividadId: String? = null,
    @SerialName("activity_name") val actividad: String? = null,
    val quantity: Double? = null,
    @SerialName("unit_symbol") val unidad: String? = null,
    @SerialName("due_date") val vence: String? = null,
    @SerialName("days_left") val diasRestantes: Int? = null,
    val semaforo: String? = null,
    val status: String = "pendiente",
    @SerialName("assigned_crew_id") val cuadrillaId: String? = null,
    @SerialName("requires_evidence") val exigeEvidencia: Boolean = true,
    @SerialName("evidence_count") val fotos: Int = 0,
    @SerialName("fotos_antes") val fotosAntes: Int = 0,
    @SerialName("fotos_despues") val fotosDespues: Int = 0,
    @SerialName("started_at") val atendidoDesde: String? = null,
    val notes: String? = null,
) {
    val estaPendiente: Boolean get() = status == "pendiente"
    val estaEnAtencion: Boolean get() = status == "en_atencion"
    val estaLevantado: Boolean get() = status in setOf("levantado", "validado")

    /**
     * Si se puede dar por levantado ahora mismo.
     *
     * La foto del «después» es la que sustenta el levantamiento ante el
     * cliente. Comprobarlo aquí evita que el capataz guarde el equipo, se
     * vaya, y se entere del rechazo al día siguiente.
     */
    val puedeLevantarse: Boolean get() = !exigeEvidencia || fotosDespues > 0
}

/** El parte del día tal como lo devuelve la nube. */
@Serializable
data class ParteRemoto(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("service_id") val servicioId: String,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("work_date") val fecha: String,
    val status: String = "borrador",
    val weather: String? = null,
    val notes: String? = null,
)
