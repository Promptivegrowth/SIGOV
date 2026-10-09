package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.github.jan.supabase.postgrest.rpc
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Un extintor, un botiquín, un kit antiderrame: algo que vence y se revisa. */
@Serializable
data class EquipoDeSeguridad(
    val id: String,
    @SerialName("service_id") val servicioId: String,
    val kind: String,
    val status: String = "operativo",
    val code: String,
    val description: String? = null,
    val brand: String? = null,
    val capacity: String? = null,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    val location: String? = null,
    @SerialName("expires_on") val vence: String? = null,
    @SerialName("next_check_on") val proximaRevision: String? = null,
    @SerialName("last_check_on") val ultimaRevision: String? = null,
    @SerialName("days_left") val diasParaVencer: Int? = null,
    val semaforo: String = "ok",
    @SerialName("alert_level") val aviso: String? = null,
    @SerialName("check_days_left") val diasParaRevision: Int? = null,
    @SerialName("check_semaforo") val semaforoRevision: String = "ok",
    @SerialName("observaciones_abiertas") val observaciones: Int = 0,
) {
    /** Cómo se llama en castellano, que es como lo pide el supervisor. */
    val tipo: String
        get() = when (kind) {
            "extintor" -> "Extintor"
            "botiquin" -> "Botiquín"
            "kit_antiderrame" -> "Kit antiderrame"
            "camilla" -> "Camilla"
            "lavaojos" -> "Lavaojos"
            "detector_gas" -> "Detector de gas"
            else -> "Equipo"
        }
}

/** Un vehículo de la flota, con sus papeles y su kilometraje. */
@Serializable
data class Vehiculo(
    val id: String,
    @SerialName("service_id") val servicioId: String,
    val kind: String,
    val status: String = "operativo",
    val plate: String,
    val code: String? = null,
    val brand: String? = null,
    val model: String? = null,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("driver_name") val conductor: String? = null,
    @SerialName("soat_expires_on") val soat: String? = null,
    @SerialName("inspection_expires_on") val revisionTecnica: String? = null,
    @SerialName("policy_expires_on") val poliza: String? = null,
    @SerialName("odometer_km") val kilometraje: Int? = null,
    @SerialName("next_service_km") val kmProximoServicio: Int? = null,
    @SerialName("km_to_service") val kmParaServicio: Int? = null,
    @SerialName("first_due") val primerVencimiento: String? = null,
    val semaforo: String = "ok",
    @SerialName("last_check_on") val ultimaRevision: String? = null,
    // La asignación vigente a la cuadrilla (OBS-70 a 74)
    @SerialName("model_year") val anio: Int? = null,
    @SerialName("next_service_on") val proximoServicioEl: String? = null,
    @SerialName("is_temporary") val temporal: Boolean = false,
    @SerialName("validation_status") val validacion: String = "validado",
    @SerialName("assignment_id") val asignacionId: String? = null,
    @SerialName("assignment_kind") val asignacion: String? = null,
    @SerialName("assignment_start_on") val asignadoDesde: String? = null,
    @SerialName("assignment_reason") val motivoAsignacion: String? = null,
    @SerialName("replaces_plate") val reemplazaA: String? = null,
    @SerialName("assignment_odometer_start") val kmInicialAsignacion: Int? = null,
) {
    val esReemplazo: Boolean get() = asignacion == "reemplazo"
    val esTitular: Boolean get() = asignacion == "titular"

    val estadoLegible: String
        get() = when (status) {
            "operativo" -> "Operativo"
            "taller" -> "En taller"
            "inoperativo" -> "Inoperativo"
            else -> status
        }

    val tipo: String
        get() = when (kind) {
            "camioneta" -> "Camioneta"
            "volquete" -> "Volquete"
            "cisterna" -> "Cisterna"
            "cargador" -> "Cargador frontal"
            "retroexcavadora" -> "Retroexcavadora"
            "rodillo" -> "Rodillo"
            "motoniveladora" -> "Motoniveladora"
            "moto" -> "Motocicleta"
            else -> "Vehículo"
        }

    /** Ya lo revisaron hoy: no hace falta volver a pedirlo. */
    fun revisadoHoy(hoy: String): Boolean = ultimaRevision == hoy
}

/**
 * Los puntos del preoperacional.
 *
 * Son los que el conductor mira de verdad antes de arrancar, en el orden en
 * que se recorre el vehículo: primero lo que se ve de fuera, después lo de
 * adentro y al final lo que exige el contrato llevar a bordo.
 */
val PUNTOS_PREOPERACIONAL = listOf(
    "llantas" to "Llantas y aro de repuesto",
    "luces" to "Luces y direccionales",
    "frenos" to "Frenos y freno de mano",
    "espejos" to "Espejos y parabrisas",
    "fluidos" to "Aceite, refrigerante y combustible",
    "bocina" to "Bocina y alarma de retroceso",
    "cinturones" to "Cinturones de seguridad",
    "extintor" to "Extintor vigente",
    "botiquin" to "Botiquín completo",
    "conos" to "Conos y triángulos",
    "gata" to "Gata y llave de ruedas",
    "documentos" to "SOAT y tarjeta de propiedad",
)

/**
 * Equipos de seguridad.
 *
 * El capataz los tiene físicamente en la camioneta, así que es quien puede
 * revisarlos y quien primero se entera si falta algo. La inspección se
 * registra desde el celular y actualiza el equipo sola.
 */
@Singleton
class SsomaRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * Los equipos de la cuadrilla, más los que no tienen dueño asignado.
     *
     * Los del almacén y la oficina también se ven: si el capataz pasa por ahí
     * y nota un extintor vencido, tiene que poder decirlo.
     */
    suspend fun equipos(servicioId: String, cuadrillaId: String?): List<EquipoDeSeguridad> =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_safety_equipment")
                    .select {
                        filter { eq("service_id", servicioId) }
                        order("expires_on", Order.ASCENDING)
                        limit(300)
                    }
                    .decodeList<JsonObject>()
                espejar("safety_equipment", servicioId, filas)
                filas.map { json.decodeFromString<EquipoDeSeguridad>(it.toString()) }
            }.getOrElse {
                catalogo.de("safety_equipment", servicioId)
                    .mapNotNull {
                        runCatching { json.decodeFromString<EquipoDeSeguridad>(it.datos) }.getOrNull()
                    }
                    .sortedBy { it.vence ?: "9999-12-31" }
            }
        }

    /**
     * Registra una inspección.
     *
     * La foto no es obligatoria para inspeccionar —a veces solo se confirma
     * que el manómetro está en verde— pero cuando hay hallazgo se vuelve el
     * sustento de que se avisó a tiempo.
     */
    suspend fun inspeccionar(
        equipo: EquipoDeSeguridad,
        conforme: Boolean,
        hallazgo: String?,
        punto: Punto?,
    ): String = withContext(Dispatchers.IO) {
        val clientId = UUID.randomUUID().toString()
        cola.encolar(
            tabla = "safety_equipment_checks",
            clientId = clientId,
            etiqueta = "Revisión · ${equipo.tipo} ${equipo.code}",
            cuerpo = buildJsonObject {
                put("service_id", equipo.servicioId)
                put("equipment_id", equipo.id)
                put("checked_on", Peru.hoy().toString())
                put("conforme", conforme)
                hallazgo?.takeIf { it.isNotBlank() }?.let { put("findings", it) }
                punto?.let {
                    put("lat", it.latitud)
                    put("lng", it.longitud)
                }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
        clientId
    }

    // ─── Vehículos ────────────────────────────────────────────────────

    /** La flota del contrato, con lo que primero vence arriba. */
    suspend fun vehiculos(servicioId: String): List<Vehiculo> = withContext(Dispatchers.IO) {
        runCatching {
            val filas = supabase.postgrest.from("v_vehicles")
                .select {
                    filter { eq("service_id", servicioId) }
                    order("first_due", Order.ASCENDING)
                    limit(200)
                }
                .decodeList<JsonObject>()
            espejar("vehicles", servicioId, filas)
            filas.map { json.decodeFromString<Vehiculo>(it.toString()) }
        }.getOrElse {
            catalogo.de("vehicles", servicioId)
                .mapNotNull { runCatching { json.decodeFromString<Vehiculo>(it.datos) }.getOrNull() }
                .sortedBy { it.primerVencimiento ?: "9999-12-31" }
        }
    }

    /**
     * Registra el vehículo de reemplazo (OBS-71). Necesita señal: la base
     * cierra la asignación del titular, lo manda al taller y abre la nueva.
     */
    suspend fun registrarReemplazo(
        cuadrillaId: String, titular: Vehiculo, placa: String, tipo: String, marca: String?, modelo: String?,
        motivo: String, km: Int, observacion: String?,
    ) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc("registrar_reemplazo", buildJsonObject {
            put("p_crew", cuadrillaId)
            put("p_titular", titular.id)
            put("p_placa", placa)
            put("p_tipo", tipo)
            marca?.let { put("p_marca", it) }
            modelo?.let { put("p_modelo", it) }
            put("p_fecha", Peru.hoy().toString())
            put("p_motivo", motivo)
            put("p_km", km)
            observacion?.let { put("p_obs", it) }
        })
        Unit
    }

    /** Vuelve el titular: se cierra el reemplazo. */
    suspend fun devolverTitular(reemplazo: Vehiculo, km: Int?) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc("devolver_titular", buildJsonObject {
            put("p_asignacion", reemplazo.asignacionId ?: error("Ese vehículo no tiene asignación vigente."))
            put("p_fecha", Peru.hoy().toString())
            km?.let { put("p_km_reemplazo", it) }
        })
        Unit
    }

    /** Alta rápida de un vehículo temporal (OBS-72), pendiente de validación. */
    suspend fun altaTemporal(
        cuadrillaId: String, placa: String, tipo: String, marca: String?, modelo: String?, km: Int, observacion: String?,
    ) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc("alta_vehiculo_temporal", buildJsonObject {
            put("p_crew", cuadrillaId)
            put("p_placa", placa)
            put("p_tipo", tipo)
            marca?.let { put("p_marca", it) }
            modelo?.let { put("p_modelo", it) }
            put("p_km", km)
            observacion?.let { put("p_obs", it) }
        })
        Unit
    }

    /**
     * La revisión de antes de salir.
     *
     * Se guarda entera —punto por punto— y no solo el resultado: cuando hay
     * un accidente, lo que se pide es el detalle de qué se revisó ese día.
     */
    suspend fun revisarVehiculo(
        vehiculo: Vehiculo,
        puntos: Map<String, Boolean>,
        kilometraje: Int?,
        hallazgo: String?,
        punto: Punto?,
    ): String = withContext(Dispatchers.IO) {
        val conforme = puntos.values.all { it }
        val clientId = UUID.randomUUID().toString()

        cola.encolar(
            tabla = "vehicle_checks",
            clientId = clientId,
            etiqueta = "Preoperacional · ${vehiculo.plate}",
            cuerpo = buildJsonObject {
                put("service_id", vehiculo.servicioId)
                put("vehicle_id", vehiculo.id)
                vehiculo.cuadrillaId?.let { put("crew_id", it) }
                vehiculo.asignacionId?.let { put("assignment_id", it) }
                put("checked_on", Peru.hoy().toString())
                put("conforme", conforme)
                kilometraje?.let { put("odometer_km", it) }
                hallazgo?.takeIf { it.isNotBlank() }?.let { put("findings", it) }
                put("items", buildJsonObject { puntos.forEach { (k, v) -> put(k, v) } })
                punto?.let {
                    put("lat", it.latitud)
                    put("lng", it.longitud)
                }
                supabase.usuarioActual()?.let {
                    put("driver_id", it)
                    put("created_by", it)
                }
            },
        )
        clientId
    }

    private suspend fun espejar(tabla: String, servicioId: String, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(tabla = tabla, id = id, servicioId = servicioId, datos = fila.toString())
        }
        catalogo.guardar(vigentes)
        if (vigentes.isNotEmpty()) catalogo.borrarLosQueYaNoEstan(tabla, vigentes.map { it.id })
    }
}
