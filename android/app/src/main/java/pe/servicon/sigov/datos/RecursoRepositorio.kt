package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.ParteLocal
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Un equipo u otro recurso (herramienta, EPC…) usado en el día. */
data class RecursoDelDia(
    val clientId: String,
    /** «equipo» u «otro» */
    val tipo: String,
    val codigo: String?,
    val descripcion: String,
    val unidad: String?,
    val cantidad: Double?,
    val observacion: String?,
    val enviado: Boolean,
    /** La actividad del parte en que se usó; sin ella, es del día. */
    val registroClientId: String? = null,
)

/**
 * Los equipos y los otros recursos del reporte diario (secciones IV y V del
 * FOR:001). Como todo lo de campo, se guardan en el teléfono y salen con la
 * cola, detrás de su parte.
 */
@Singleton
class RecursoRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /** Los del parte: lo que ya está en la nube y lo que espera señal. */
    suspend fun delParte(parte: ParteLocal, registros: List<RegistroLocal> = emptyList()): List<RecursoDelDia> = withContext(Dispatchers.IO) {
        // La actividad de cada equipo: en el teléfono por su llave, en la nube por su id
        val porServidor = actividadesPorId(supabase, colaDao, registros)
        val locales = colaDao.sinConfirmarDe(TABLA).mapNotNull { envio ->
            val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
            if (o["_parte"]?.jsonPrimitive?.content != parte.clientId) return@mapNotNull null
            deFila(envio.clientId, o, enviado = false, registroClientId = o["_registro"]?.jsonPrimitive?.contentOrNull)
        }
        // El id del parte en la nube: en la cola al enviarse, o por cuadrilla y fecha
        val idDelParte = parte.idEnServidor ?: colaDao.porId(parte.clientId)?.idEnServidor ?: runCatching {
            supabase.postgrest.from("work_orders")
                .select(io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                    filter {
                        eq("service_id", parte.servicioId)
                        parte.cuadrillaId?.let { eq("crew_id", it) }
                        eq("work_date", parte.fecha)
                        exact("deleted_at", null)
                    }
                    limit(1)
                }
                .decodeList<JsonObject>().firstOrNull()?.get("id")?.jsonPrimitive?.contentOrNull
        }.getOrNull()
        val remotos = idDelParte?.let { id ->
            runCatching {
                supabase.postgrest.from(TABLA)
                    .select {
                        filter { eq("work_order_id", id); exact("deleted_at", null) }
                        order("created_at", Order.ASCENDING)
                    }
                    .decodeList<JsonObject>()
                    .map {
                        deFila(
                            it["client_id"]?.jsonPrimitive?.contentOrNull ?: it["id"]?.jsonPrimitive?.contentOrNull ?: "", it, enviado = true,
                            registroClientId = it["work_entry_id"]?.jsonPrimitive?.contentOrNull?.let { id -> porServidor[id] },
                        )
                    }
            }.getOrDefault(emptyList())
        } ?: emptyList()
        // Lo que ya subió deja de figurar como pendiente
        val subidos = remotos.map { it.clientId }.toSet()
        locales.filter { it.clientId !in subidos } + remotos
    }

    suspend fun registrar(
        parte: ParteLocal,
        tipo: String,
        codigo: String?,
        descripcion: String,
        unidad: String?,
        cantidad: Double?,
        observacion: String?,
        registro: RegistroLocal? = null,
    ) = withContext(Dispatchers.IO) {
        require(descripcion.isNotBlank()) { "Escribe qué equipo o recurso fue." }
        require(tipo == "equipo" || tipo == "otro")
        val clientId = UUID.randomUUID().toString()
        // Espera a su actividad (o a su parte) solo si todavía está en la cola;
        // la nube toma el parte de la actividad
        val parteEnCola = colaDao.porId(parte.clientId) != null
        val registroEnCola = registro != null && colaDao.porId(registro.clientId) != null
        cola.encolar(
            tabla = TABLA,
            clientId = clientId,
            dependeDe = when {
                registroEnCola -> registro!!.clientId
                registro?.idEnServidor == null && parteEnCola -> parte.clientId
                else -> null
            },
            etiqueta = (if (tipo == "equipo") "Equipo · " else "Recurso · ") + descripcion.trim(),
            cuerpo = buildJsonObject {
                put("service_id", parte.servicioId)
                if (!parteEnCola) parte.idEnServidor?.let { put("work_order_id", it) }
                if (registro != null && !registroEnCola) registro.idEnServidor?.let { put("work_entry_id", it) }
                registro?.let { put("_registro", it.clientId) }
                put("tipo", tipo)
                codigo?.trim()?.takeIf { it.isNotEmpty() }?.let { put("codigo", it) }
                put("descripcion", descripcion.trim())
                unidad?.trim()?.takeIf { it.isNotEmpty() }?.let { put("unidad", it) }
                cantidad?.let { put("cantidad", it) }
                observacion?.trim()?.takeIf { it.isNotEmpty() }?.let { put("observacion", it) }
                // Solo para mostrarlo sin señal; la nube lo ignora
                put("_parte", parte.clientId)
            },
        )
    }

    /** Quita uno anotado por error, si todavía no salió del teléfono. */
    /**
     * Quita lo anotado por error. Si no salió del teléfono, se descarta; si
     * ya está en la nube, se le pide a la nube que lo dé de baja (Elvis, 22/10).
     */
    suspend fun descartar(clientId: String) {
        val envio = colaDao.porId(clientId)
        if (envio != null && envio.estado != pe.servicon.sigov.datos.local.EstadoEnvio.ENVIADO) cola.descartar(clientId)
        else cola.encolar(
            tabla = "rpc:quitar_del_parte",
            etiqueta = "Quitado del parte",
            cuerpo = buildJsonObject {
                put("p_tabla", "parte_recursos")
                put("p_client_id", clientId)
            },
        )
    }

    private fun deFila(clientId: String, o: JsonObject, enviado: Boolean, registroClientId: String? = null) = RecursoDelDia(
        clientId = clientId,
        tipo = o["tipo"]?.jsonPrimitive?.content ?: "otro",
        codigo = o["codigo"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        descripcion = o["descripcion"]?.jsonPrimitive?.content ?: "",
        unidad = o["unidad"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        cantidad = o["cantidad"]?.jsonPrimitive?.content?.toDoubleOrNull(),
        observacion = o["observacion"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        enviado = enviado,
        registroClientId = registroClientId,
    )

    companion object {
        const val TABLA = "parte_recursos"
    }
}
