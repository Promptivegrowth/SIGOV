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
    /** N.º de partida COVINCA: interno, para reportes y formatos (regla 1.3). */
    @SerialName("numero_covinca") val numeroCovinca: Int? = null,
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
    @SerialName("activity_code") val actividadCodigo: String? = null,
    @SerialName("activity_numero") val actividadNumero: Int? = null,
    /** Lado como lo escribe el supervisor: LI, LD, LD/LI, LD/EJE/LI… */
    val lado: String? = null,
    /** MR, PCI o E. */
    val origen: String? = null,
    @SerialName("pci_item_id") val pciItemId: String? = null,
    @SerialName("pci_item_number") val pciItemNumero: Int? = null,
    @SerialName("pci_item_pci_code") val pciItemCodigo: String? = null,
    @SerialName("supervisor_name") val supervisor: String? = null,
    @SerialName("sector_code") val sector: String? = null,
    @SerialName("prog_start_txt") val progresivaInicioTexto: String? = null,
    @SerialName("prog_end_txt") val progresivaFinTexto: String? = null,
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
    @SerialName("section_id") val tramoId: String? = null,
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
    @SerialName("fotos_durante") val fotosDurante: Int = 0,
    @SerialName("metrado_registrado") val metradoRegistrado: Double = 0.0,
    /** Lo que observó COVINCA, si lo devolvió. */
    val observacion: String? = null,
    @SerialName("activity_code") val actividadCodigo: String? = null,
    @SerialName("started_at") val atendidoDesde: String? = null,
    val notes: String? = null,
) {
    val estaPendiente: Boolean get() = status == "pendiente"
    val estaEnAtencion: Boolean get() = status == "en_atencion"
    val estaObservado: Boolean get() = status == "observado"
    /** Ya salió de la cuadrilla: espera a COVINCA o ya está conforme. */
    val estaLevantado: Boolean get() = status in setOf("levantado", "validado", "subsanado")
    val esperaValidacion: Boolean get() = status in setOf("levantado", "subsanado")
    val esConforme: Boolean get() = status == "validado"
    /** Lo que sigue en manos de la cuadrilla. */
    val estaAbierto: Boolean get() = status in setOf("pendiente", "en_atencion", "observado")

    /** Las tres fotos que pide COVINCA para un ítem: antes, durante y después. */
    val fotosCompletas: Boolean get() = fotosAntes > 0 && fotosDurante > 0 && fotosDespues > 0

    /**
     * Si se puede dar por levantado ahora mismo: con la foto del antes, la
     * del después y el metrado registrado (OBS-13). Lo mismo exige la base;
     * comprobarlo aquí evita que el capataz se entere del rechazo después.
     */
    val puedeLevantarse: Boolean
        get() = (!exigeEvidencia || (fotosAntes > 0 && fotosDespues > 0)) && metradoRegistrado > 0

    /** El estado dicho con palabras, como lo pide el consolidado (OBS-10). */
    val estadoLegible: String
        get() = when (status) {
            "pendiente" -> "Pendiente"
            "en_atencion" -> when {
                exigeEvidencia && (fotosAntes == 0 || fotosDespues == 0) -> "En ejecución · faltan fotos"
                metradoRegistrado <= 0 -> "En ejecución · falta el metrado"
                else -> "Pendiente de cierre"
            }
            "levantado" -> "Pendiente de validación COVINCA"
            "subsanado" -> "Subsanado · por validar"
            "observado" -> "Observado por COVINCA"
            "validado" -> "Conforme"
            else -> status
        }
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
    @SerialName("start_time") val horaInicio: String? = null,
    @SerialName("end_time") val horaFin: String? = null,
    val headcount: Int? = null,
    /** Lo que observó el supervisor, si lo devolvió. */
    @SerialName("review_notes") val observacion: String? = null,
)

/** Un PCI visto por la cuadrilla: cuántos ítems suyos tiene y cómo van. */
@Serializable
data class ResumenPci(
    @SerialName("pci_id") val pciId: String,
    val code: String,
    val title: String? = null,
    @SerialName("pci_status") val estado: String? = null,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    val items: Int = 0,
    val pendientes: Int = 0,
    @SerialName("en_atencion") val enAtencion: Int = 0,
    @SerialName("por_validar") val porValidar: Int = 0,
    val observados: Int = 0,
    val conformes: Int = 0,
    val vencidos: Int = 0,
    val urgentes: Int = 0,
    @SerialName("proximo_vencimiento") val proximoVencimiento: String? = null,
) {
    /** Lo que todavía depende de la cuadrilla. */
    val abiertos: Int get() = pendientes + enAtencion + observados
    val completado: Boolean get() = items > 0 && conformes == items
}

