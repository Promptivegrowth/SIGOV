package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.ParteLocal
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
    suspend fun delParte(parte: ParteLocal): List<RecursoDelDia> = withContext(Dispatchers.IO) {
        val locales = colaDao.sinConfirmarDe(TABLA).mapNotNull { envio ->
            val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
            if (o["_parte"]?.jsonPrimitive?.content != parte.clientId) return@mapNotNull null
            deFila(envio.clientId, o, enviado = false)
        }
        val remotos = parte.idEnServidor?.let { id ->
            runCatching {
                supabase.postgrest.from(TABLA)
                    .select {
                        filter { eq("work_order_id", id); exact("deleted_at", null) }
                        order("created_at", Order.ASCENDING)
                    }
                    .decodeList<JsonObject>()
                    .map { deFila(it["client_id"]?.jsonPrimitive?.content ?: it["id"]?.jsonPrimitive?.content ?: "", it, enviado = true) }
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
    ) = withContext(Dispatchers.IO) {
        require(descripcion.isNotBlank()) { "Escribe qué equipo o recurso fue." }
        require(tipo == "equipo" || tipo == "otro")
        val clientId = UUID.randomUUID().toString()
        // Espera a su parte solo si el parte todavía está en la cola
        val parteEnCola = colaDao.porId(parte.clientId) != null
        cola.encolar(
            tabla = TABLA,
            clientId = clientId,
            dependeDe = if (parteEnCola) parte.clientId else null,
            etiqueta = (if (tipo == "equipo") "Equipo · " else "Recurso · ") + descripcion.trim(),
            cuerpo = buildJsonObject {
                put("service_id", parte.servicioId)
                if (!parteEnCola) parte.idEnServidor?.let { put("work_order_id", it) }
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
    suspend fun descartar(clientId: String) = cola.descartar(clientId)

    private fun deFila(clientId: String, o: JsonObject, enviado: Boolean) = RecursoDelDia(
        clientId = clientId,
        tipo = o["tipo"]?.jsonPrimitive?.content ?: "otro",
        codigo = o["codigo"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        descripcion = o["descripcion"]?.jsonPrimitive?.content ?: "",
        unidad = o["unidad"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        cantidad = o["cantidad"]?.jsonPrimitive?.content?.toDoubleOrNull(),
        observacion = o["observacion"]?.jsonPrimitive?.content?.takeIf { it != "null" },
        enviado = enviado,
    )

    companion object {
        const val TABLA = "parte_recursos"
    }
}
