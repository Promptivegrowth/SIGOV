package pe.servicon.sigov.datos

import android.graphics.Bitmap
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
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
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** El tipo de charla, que en auditoría se pide por separado. */
enum class TipoCharla(val valor: String, val etiqueta: String, val descripcion: String) {
    DIARIA("diaria", "Charla diaria", "Los cinco minutos antes de empezar"),
    INDUCCION("induccion", "Inducción", "Al ingresar a la obra"),
    CAPACITACION("capacitacion", "Capacitación", "Formación programada"),
    SIMULACRO("simulacro", "Simulacro", "Evacuación, derrame, primeros auxilios"),
}

/** Una charla dictada, con cuántos firmaron. */
@Serializable
data class Charla(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    val kind: String = "diaria",
    val topic: String,
    val content: String? = null,
    @SerialName("talk_date") val fecha: String,
    @SerialName("start_time") val hora: String? = null,
    @SerialName("duration_min") val minutos: Int? = null,
    val location: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("speaker_name") val expositor: String? = null,
    @SerialName("attendee_count") val asistentes: Int = 0,
    @SerialName("signed_count") val firmados: Int = 0,
) {
    val tipo: TipoCharla
        get() = TipoCharla.entries.firstOrNull { it.valor == kind } ?: TipoCharla.DIARIA
}

/** Quién integra la cuadrilla: son los que firman. */
@Serializable
data class MiembroDeCuadrilla(
    val id: String,
    @SerialName("crew_id") val cuadrillaId: String,
    @SerialName("full_name") val nombre: String,
    val dni: String? = null,
    val position: String? = null,
    @SerialName("is_active") val activo: Boolean = true,
)

/** La firma de un asistente, tal como se recoge en el celular. */
data class FirmaDeAsistente(
    val miembro: MiembroDeCuadrilla,
    val trazo: Bitmap,
)

/**
 * Charlas de seguridad.
 *
 * Una charla sin firmas no sirve como sustento: lo que el auditor pide es la
 * lista con el nombre, el DNI y el trazo de cada uno. Por eso la firma se
 * recoge en el momento, en el celular, y no en una hoja que después alguien
 * transcribe.
 */
@Singleton
class CharlaRepositorio @Inject constructor(
    @ApplicationContext private val contexto: Context,
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** Las charlas de la cuadrilla, de la más reciente a la más antigua. */
    suspend fun charlas(servicioId: String, cuadrillaId: String?): List<Charla> =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_safety_talks")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            cuadrillaId?.let { eq("crew_id", it) }
                        }
                        order("talk_date", Order.DESCENDING)
                        limit(100)
                    }
                    .decodeList<JsonObject>()
                espejar("safety_talks", servicioId, filas)
                filas.map { json.decodeFromString<Charla>(it.toString()) }
            }.getOrElse {
                catalogo.de("safety_talks", servicioId)
                    .mapNotNull { runCatching { json.decodeFromString<Charla>(it.datos) }.getOrNull() }
                    .sortedByDescending { it.fecha }
            }
        }

    /** Los integrantes de la cuadrilla, que son quienes firman. */
    suspend fun miembros(servicioId: String, cuadrillaId: String): List<MiembroDeCuadrilla> =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("crew_members")
                    .select {
                        filter { eq("crew_id", cuadrillaId); eq("is_active", true) }
                        order("full_name", Order.ASCENDING)
                    }
                    .decodeList<JsonObject>()
                espejar("crew_members", servicioId, filas)
                filas.map { json.decodeFromString<MiembroDeCuadrilla>(it.toString()) }
            }.getOrElse {
                catalogo.de("crew_members", servicioId)
                    .mapNotNull {
                        runCatching { json.decodeFromString<MiembroDeCuadrilla>(it.datos) }.getOrNull()
                    }
                    .filter { it.cuadrillaId == cuadrillaId && it.activo }
                    .sortedBy { it.nombre }
            }
        }

    /**
     * Registra la charla con sus firmas.
     *
     * La charla y cada asistencia viajan por separado; las asistencias
     * declaran que dependen de la charla, así que la cola no las sube hasta
     * que su cabecera exista. Cada trazo se guarda como PNG y se adjunta.
     */
    suspend fun registrar(
        servicioId: String,
        cuadrillaId: String?,
        tipo: TipoCharla,
        tema: String,
        contenido: String?,
        minutos: Int,
        lugar: String?,
        expositor: String?,
        firmas: List<FirmaDeAsistente>,
        punto: Punto?,
    ): String = withContext(Dispatchers.IO) {
        require(firmas.isNotEmpty()) { "La charla necesita al menos una firma." }

        val clientId = UUID.randomUUID().toString()
        val ahora = Peru.ahora()

        cola.encolar(
            tabla = "safety_talks",
            clientId = clientId,
            etiqueta = "${tipo.etiqueta} · $tema",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                cuadrillaId?.let { put("crew_id", it) }
                put("kind", tipo.valor)
                put("topic", tema)
                contenido?.takeIf { it.isNotBlank() }?.let { put("content", it) }
                put("talk_date", Peru.hoy().toString())
                put("start_time", "%02d:%02d".format(ahora.hour, ahora.minute))
                put("duration_min", minutos)
                lugar?.takeIf { it.isNotBlank() }?.let { put("location", it) }
                expositor?.takeIf { it.isNotBlank() }?.let { put("speaker_name", it) }
                punto?.let {
                    put("lat", it.latitud)
                    put("lng", it.longitud)
                }
                supabase.usuarioActual()?.let {
                    put("speaker_id", it)
                    put("created_by", it)
                }
            },
        )

        firmas.forEach { firma ->
            val asistenciaId = UUID.randomUUID().toString()
            val ruta = "$servicioId/charlas/${Peru.hoy()}/$asistenciaId.png"
            val archivo = guardarTrazo(asistenciaId, firma.trazo)

            cola.encolar(
                tabla = "talk_attendance",
                clientId = asistenciaId,
                dependeDe = clientId,
                etiqueta = "Firma · ${firma.miembro.nombre}",
                cuerpo = buildJsonObject {
                    put("service_id", servicioId)
                    put("crew_member_id", firma.miembro.id)
                    put("full_name", firma.miembro.nombre)
                    firma.miembro.dni?.let { put("dni", it) }
                    firma.miembro.position?.let { put("position", it) }
                    put("signature_path", ruta)
                    put("signed_at", DateTimeFormatterIso.format(ahora))
                },
            )

            cola.adjuntar(
                clientId = asistenciaId,
                bucket = "firmas",
                rutaDestino = ruta,
                archivoLocal = archivo,
                tipoMime = "image/png",
            )
        }
        clientId
    }

    /** El trazo se guarda en PNG: la transparencia hace que se vea sobre el acta. */
    private fun guardarTrazo(id: String, trazo: Bitmap): File {
        val carpeta = File(contexto.filesDir, "firmas").apply { mkdirs() }
        val archivo = File(carpeta, "$id.png")
        archivo.outputStream().use { trazo.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return archivo
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

private val DateTimeFormatterIso: java.time.format.DateTimeFormatter =
    java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME
