package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Un hallazgo de campo fuera del inventario (video de Elvis del 14/10). */
@Serializable
data class ObservacionDeCampo(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("section_id") val tramoId: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("section_numero") val tramoNumero: Int? = null,
    @SerialName("section_code") val tramoCodigo: String? = null,
    @SerialName("progresiva_m") val progresiva: Double? = null,
    val side: String? = null,
    val descripcion: String,
    val estado: String = "pendiente",
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("observado_on") val fecha: String? = null,
    @SerialName("created_by_name") val autor: String? = null,
    @SerialName("nota_atencion") val notaAtencion: String? = null,
    val fotos: List<String> = emptyList(),
    /** Guardada en el equipo y todavía sin subir. */
    val porEnviar: Boolean = false,
) {
    val estadoLegible: String
        get() = when (estado) {
            "programada" -> "Programada"
            "atendida" -> "Atendida"
            else -> "Pendiente"
        }

    val tramoCorto: String? get() = tramoNumero?.let { "Tramo $it" } ?: tramoCodigo ?: tramo
}

/**
 * El registro de observaciones de campo: lo que el jefe de cuadrilla o el
 * supervisor encuentran en la vía y no está en el inventario (un desmonte,
 * basura acumulada…), con su progresiva y de una a tres fotos. Funciona sin
 * señal: la observación y sus fotos salen con la cola, y la nube ubica el
 * punto sobre la vía por la progresiva.
 */
@Singleton
class ObservacionesRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
    private val evidencias: EvidenciaRepositorio,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    suspend fun lista(servicioId: String): List<ObservacionDeCampo> = withContext(Dispatchers.IO) {
        val remotas = runCatching {
            val filas = supabase.postgrest.from("v_observaciones_campo")
                .select {
                    filter { eq("service_id", servicioId) }
                    order("created_at", Order.DESCENDING)
                    limit(500)
                }
                .decodeList<JsonObject>()
            catalogo.guardar(filas.mapIndexed { i, f ->
                FilaCatalogo(tabla = "observaciones_campo", id = (f["id"]?.jsonPrimitive?.contentOrNull ?: i.toString()), servicioId = servicioId, datos = f.toString())
            })
            filas.map { json.decodeFromString<ObservacionDeCampo>(it.toString()) }
        }.getOrElse {
            catalogo.de("observaciones_campo", servicioId).mapNotNull {
                runCatching { json.decodeFromString<ObservacionDeCampo>(it.datos) }.getOrNull()
            }
        }
        // Las que aún esperan señal también se ven
        val subidas = remotas.mapNotNull { it.clientId }.toSet()
        val locales = colaDao.sinConfirmarDe(TABLA).mapNotNull { envio ->
            if (envio.clientId in subidas) return@mapNotNull null
            val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
            ObservacionDeCampo(
                id = envio.clientId,
                clientId = envio.clientId,
                tramoId = o["section_id"]?.jsonPrimitive?.contentOrNull,
                tramo = o["_tramo"]?.jsonPrimitive?.contentOrNull,
                tramoNumero = o["_tramo_numero"]?.jsonPrimitive?.contentOrNull?.toIntOrNull(),
                progresiva = o["progresiva_m"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
                side = o["side"]?.jsonPrimitive?.contentOrNull,
                descripcion = o["descripcion"]?.jsonPrimitive?.contentOrNull ?: "",
                fecha = o["observado_on"]?.jsonPrimitive?.contentOrNull,
                lat = o["lat"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
                lng = o["lng"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
                porEnviar = true,
            )
        }
        locales + remotas
    }

    /**
     * Registra la observación y sus fotos (una a tres). Las fotos esperan a
     * que la observación exista en la nube; ahí se les pega su id.
     */
    suspend fun registrar(
        servicioId: String,
        cuadrillaId: String?,
        cuadrilla: String?,
        tramo: Tramo?,
        progresiva: Double?,
        lado: String,
        descripcion: String,
        fotos: List<File>,
        sello: Sello,
        punto: Punto?,
    ) = withContext(Dispatchers.IO) {
        val clientId = UUID.randomUUID().toString()
        cola.encolar(
            tabla = TABLA,
            clientId = clientId,
            etiqueta = "Observación · " + descripcion.take(40),
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                cuadrillaId?.let { put("crew_id", it) }
                tramo?.let { put("section_id", it.id); put("_tramo", it.name); it.numero?.let { n -> put("_tramo_numero", n) } }
                progresiva?.let { put("progresiva_m", it) }
                put("side", lado)
                put("descripcion", descripcion)
                put("observado_on", Peru.hoy().toString())
                // Sin progresiva, el punto del GPS
                if (progresiva == null && punto != null) {
                    put("lat", punto.latitud)
                    put("lng", punto.longitud)
                }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
        // Un registro de mentira, solo para el sello: no se guarda ni se envía
        val registro = RegistroLocal(
            clientId = clientId,
            parteClientId = "",
            servicioId = servicioId,
            actividadId = "",
            actividadNombre = "Observación: " + descripcion.take(60),
            tramoId = tramo?.id,
            tramoNombre = tramo?.name,
            progresivaInicio = progresiva,
            progresivaFin = null,
            lado = lado,
            cantidad = 0.0,
            unidad = null,
            origen = "observacion",
        )
        fotos.forEach { f ->
            evidencias.guardar(
                registro = registro,
                original = f,
                fase = Fase.GENERAL,
                leyenda = descripcion.take(200),
                conMarcaDeAgua = true,
                sello = sello,
                cuadrilla = cuadrilla,
                observacion = clientId,
            )
        }
        clientId
    }

    companion object {
        const val TABLA = "observaciones_campo"
    }
}
