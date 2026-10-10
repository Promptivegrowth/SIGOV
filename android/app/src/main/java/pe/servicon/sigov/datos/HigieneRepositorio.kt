package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Los puntos de higiene del día.
 *
 * Parecen menores hasta que alguien se insola en el km 940 con 38 grados, y
 * entonces lo primero que piden es el registro de que se entregó bloqueador.
 */
enum class PuntoDeHigiene(val valor: String, val etiqueta: String, val detalle: String) {
    BLOQUEADOR("bloqueador", "Bloqueador solar", "Aplicado al inicio y renovado al mediodía"),
    HIDRATACION("hidratacion", "Hidratación", "Agua disponible para toda la cuadrilla"),
    LAVADO("lavado_manos", "Lavado de manos", "Antes de comer y al terminar"),
    DESINFECCION("desinfeccion_unidad", "Desinfección de la unidad", "Cabina y superficies de contacto"),
    ORDEN("orden_limpieza", "Orden y limpieza", "Zona de trabajo despejada al cerrar"),
}

/** La respuesta a un punto del checklist: Sí o No, con su porqué. */
data class RespuestaHigiene(
    val cumple: Boolean,
    val nota: String? = null,
    val personas: Int? = null,
    /** Guardada en el equipo y todavía sin subir. */
    val porEnviar: Boolean = false,
)

/** Cómo va la higiene de hoy en una cuadrilla. */
@Serializable
data class HigieneDelDia(
    @SerialName("crew_id") val cuadrillaId: String,
    @SerialName("crew_name") val cuadrilla: String,
    @SerialName("checked_on") val fecha: String,
    val bloqueador: Boolean = false,
    @SerialName("lavado_manos") val lavadoManos: Boolean = false,
    val hidratacion: Boolean = false,
    @SerialName("desinfeccion_unidad") val desinfeccion: Boolean = false,
    @SerialName("orden_limpieza") val orden: Boolean = false,
    val cumplidos: Int = 0,
    @SerialName("people_count") val personas: Int? = null,
) {
    fun cumple(punto: PuntoDeHigiene): Boolean = when (punto) {
        PuntoDeHigiene.BLOQUEADOR -> bloqueador
        PuntoDeHigiene.HIDRATACION -> hidratacion
        PuntoDeHigiene.LAVADO -> lavadoManos
        PuntoDeHigiene.DESINFECCION -> desinfeccion
        PuntoDeHigiene.ORDEN -> orden
    }
}

/**
 * Higiene diaria.
 *
 * Un registro por cuadrilla, punto y día. Si se marca dos veces el mismo día
 * la base lo resuelve sola con su restricción de unicidad, así que el capataz
 * puede corregirse sin dejar duplicados.
 */
@Singleton
class HigieneRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    suspend fun deHoy(servicioId: String, cuadrillaId: String?): HigieneDelDia? =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_hygiene_today")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            cuadrillaId?.let { eq("crew_id", it) }
                        }
                    }
                    .decodeList<JsonObject>()
                guardarCopia(servicioId, filas)
                filas.firstOrNull()?.let { json.decodeFromString<HigieneDelDia>(it.toString()) }
            }.getOrElse {
                catalogo.de("hygiene_today", servicioId)
                    .mapNotNull {
                        runCatching { json.decodeFromString<HigieneDelDia>(it.datos) }.getOrNull()
                    }
                    .firstOrNull { cuadrillaId == null || it.cuadrillaId == cuadrillaId }
                    ?.takeIf { it.fecha == Peru.hoy().toString() }
            }
        }

    /** Lo marcado en el equipo y todavía sin subir, para no perderlo de vista. */
    suspend fun enCola(): Set<String> = withContext(Dispatchers.IO) {
        colaDao.sinConfirmarDe("hygiene_checks").mapNotNull { envio ->
            runCatching {
                val cuerpo = json.parseToJsonElement(envio.cuerpo) as JsonObject
                cuerpo["item"]?.toString()?.trim('"')
            }.getOrNull()
        }.toSet()
    }

    suspend fun marcar(
        servicioId: String,
        cuadrillaId: String?,
        punto: PuntoDeHigiene,
        personas: Int?,
        nota: String?,
        ubicacion: Punto?,
    ): String = withContext(Dispatchers.IO) {
        // El identificador se deriva de cuadrilla, día y punto: si el capataz
        // marca dos veces lo mismo —pasa cuando la copia local está vieja—,
        // sale el MISMO identificador y la nube lo resuelve como una sola
        // fila en vez de chocar contra la restricción de unicidad.
        val clientId = UUID.nameUUIDFromBytes(
            "$cuadrillaId|${Peru.hoy()}|${punto.valor}".toByteArray()
        ).toString()

        cola.encolar(
            tabla = "hygiene_checks",
            etiqueta = "Higiene · ${punto.etiqueta}",
            clientId = clientId,
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                cuadrillaId?.let { put("crew_id", it) }
                put("checked_on", Peru.hoy().toString())
                put("item", punto.valor)
                put("done", true)
                personas?.let { put("people_count", it) }
                nota?.takeIf { it.isNotBlank() }?.let { put("notes", it) }
                ubicacion?.let {
                    put("lat", it.latitud)
                    put("lng", it.longitud)
                }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
    }

    /**
     * Las respuestas de hoy, punto por punto (OBS-58): Sí, No o sin responder.
     * Lo guardado en el equipo y sin subir manda sobre la nube, porque es lo
     * último que contestó el capataz.
     */
    suspend fun respuestasDeHoy(servicioId: String, cuadrillaId: String): Map<String, RespuestaHigiene> =
        withContext(Dispatchers.IO) {
            val hoy = Peru.hoy().toString()
            val nube = runCatching {
                val filas = supabase.postgrest.from("hygiene_checks")
                    .select {
                        filter {
                            eq("crew_id", cuadrillaId)
                            eq("checked_on", hoy)
                            exact("deleted_at", null)
                        }
                    }
                    .decodeList<JsonObject>()
                catalogo.guardar(
                    filas.mapNotNull { f ->
                        val item = f["item"]?.toString()?.trim('"') ?: return@mapNotNull null
                        FilaCatalogo("hygiene_checks", "$cuadrillaId|$hoy|$item", servicioId, f.toString())
                    }
                )
                filas
            }.getOrElse {
                catalogo.de("hygiene_checks", servicioId)
                    .filter { it.id.startsWith("$cuadrillaId|$hoy|") }
                    .mapNotNull { runCatching { json.parseToJsonElement(it.datos) as JsonObject }.getOrNull() }
            }
            val enCola = colaDao.sinConfirmarDe("hygiene_checks").mapNotNull { envio ->
                runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull()
                    ?.takeIf { it["checked_on"]?.toString()?.trim('"') == hoy }
                    ?.let { it to true }
            }
            (nube.map { it to false } + enCola).mapNotNull { (f, local) ->
                val item = f["item"]?.toString()?.trim('"') ?: return@mapNotNull null
                item to RespuestaHigiene(
                    cumple = f["done"]?.toString() == "true",
                    nota = f["notes"]?.toString()?.trim('"')?.takeIf { it != "null" && it.isNotBlank() },
                    personas = f["people_count"]?.toString()?.toIntOrNull(),
                    porEnviar = local,
                )
            }.toMap()
        }

    /**
     * Guarda el checklist completo. Cada punto conserva su identificador del
     * día, así que volver a guardarlo corrige la respuesta en vez de duplicarla.
     */
    suspend fun guardarChecklist(
        servicioId: String,
        cuadrillaId: String,
        respuestas: Map<PuntoDeHigiene, Boolean>,
        notas: Map<PuntoDeHigiene, String>,
        personas: Int?,
        ubicacion: Punto?,
    ) = withContext(Dispatchers.IO) {
        respuestas.forEach { (punto, cumple) ->
            val clientId = UUID.nameUUIDFromBytes(
                "$cuadrillaId|${Peru.hoy()}|${punto.valor}".toByteArray()
            ).toString()
            cola.encolar(
                tabla = "hygiene_checks",
                etiqueta = "Higiene · ${punto.etiqueta} · ${if (cumple) "Sí" else "No"}",
                clientId = clientId,
                cuerpo = buildJsonObject {
                    put("service_id", servicioId)
                    put("crew_id", cuadrillaId)
                    put("checked_on", Peru.hoy().toString())
                    put("item", punto.valor)
                    put("done", cumple)
                    personas?.let { put("people_count", it) }
                    // El porqué solo vale para un «No»: al corregir a «Sí» se borra
                    put("notes", notas[punto]?.trim()?.takeIf { !cumple && it.isNotBlank() })
                    ubicacion?.let {
                        put("lat", it.latitud)
                        put("lng", it.longitud)
                    }
                    supabase.usuarioActual()?.let { put("created_by", it) }
                },
            )
        }
    }

    private suspend fun guardarCopia(servicioId: String, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["crew_id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(
                tabla = "hygiene_today",
                id = id,
                servicioId = servicioId,
                datos = fila.toString(),
            )
        }
        catalogo.guardar(vigentes)
    }
}
