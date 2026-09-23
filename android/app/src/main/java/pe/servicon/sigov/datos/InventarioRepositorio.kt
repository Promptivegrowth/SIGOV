package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.storage.storage
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
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.time.Duration.Companion.hours

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/** Un elemento del inventario, tal como lo dibuja el mapa. */
@Serializable
data class ElementoVial(
    val id: String,
    val code: String? = null,
    val name: String? = null,
    @SerialName("type_code") val tipoCodigo: String? = null,
    @SerialName("type_name") val tipo: String? = null,
    @SerialName("type_category") val categoria: String? = null,
    @SerialName("type_color") val color: String? = null,
    @SerialName("section_id") val tramoId: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("progresiva_m") val progresivaM: Double? = null,
    @SerialName("progresiva_txt") val progresiva: String? = null,
    val side: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val condition: String? = null,
    val semaforo: String? = null,
    @SerialName("dias_sin_intervenir") val diasSinIntervenir: Int? = null,
    @SerialName("ultima_intervencion") val ultimaIntervencion: String? = null,
    val intervenciones: Int = 0,
    val visitas: Int = 0,
    val fotos: Int = 0,
    @SerialName("foto_actual") val fotoActual: String? = null,
    @SerialName("foto_actual_fecha") val fotoActualFecha: String? = null,
    @SerialName("foto_anterior") val fotoAnterior: String? = null,
    @SerialName("foto_anterior_fecha") val fotoAnteriorFecha: String? = null,
    @SerialName("dias_entre_fotos") val diasEntreFotos: Int? = null,
)

/** Cuántos elementos hay de cada componente y cómo está su semáforo. */
@Serializable
data class ResumenDeTipo(
    @SerialName("type_code") val codigo: String,
    @SerialName("type_name") val nombre: String,
    val category: String? = null,
    val color: String? = null,
    val total: Int = 0,
    @SerialName("al_dia") val alDia: Int = 0,
    @SerialName("por_vencer") val porVencer: Int = 0,
    val critico: Int = 0,
    @SerialName("sin_intervenir") val sinIntervenir: Int = 0,
) {
    /** Lo que el supervisor tiene que ir a ver. */
    val porAtender: Int get() = critico + sinIntervenir
}

/** Una visita anterior al elemento. */
@Serializable
data class IntervencionDeActivo(
    val id: String,
    @SerialName("intervened_on") val fecha: String,
    val action: String? = null,
    val notes: String? = null,
)

/**
 * El inventario vial en el celular.
 *
 * El supervisor de tramo lo abre en carretera, donde muchas veces no hay
 * señal, así que lo descargado se guarda en la copia local y la pantalla
 * arranca con eso mientras intenta refrescar. Lo que no se puede guardar es
 * la cartografía de fondo: eso necesita conexión, y cuando no la hay el mapa
 * queda gris pero los puntos y sus fichas siguen ahí.
 */
@Singleton
class InventarioRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
) {

    /** Todos los elementos del contrato, con su semáforo y sus fotos. */
    suspend fun elementos(servicioId: String, refrescar: Boolean = true): List<ElementoVial> =
        withContext(Dispatchers.IO) {
            if (refrescar) {
                runCatching {
                    val filas = supabase.postgrest.from("v_inventario")
                        .select {
                            filter { eq("service_id", servicioId) }
                            order("progresiva_m", Order.ASCENDING)
                        }
                        .decodeList<JsonObject>()

                    catalogo.borrarTabla("inventario", servicioId)
                    catalogo.guardar(
                        filas.mapNotNull { f ->
                            val id = f["id"]?.toString()?.trim('"') ?: return@mapNotNull null
                            FilaCatalogo(
                                tabla = "inventario",
                                id = id,
                                servicioId = servicioId,
                                datos = f.toString(),
                            )
                        }
                    )
                }
            }

            catalogo.de("inventario", servicioId).mapNotNull {
                runCatching { json.decodeFromString<ElementoVial>(it.datos) }.getOrNull()
            }
        }

    /** El recuento por componente, para los filtros. */
    suspend fun resumen(servicioId: String, tramoId: String?): List<ResumenDeTipo> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.postgrest.rpc(
                    "inventario_resumen",
                    buildJsonObject {
                        put("p_service_id", servicioId)
                        tramoId?.let { put("p_section_id", it) }
                    },
                ).decodeList<ResumenDeTipo>()
            }.getOrDefault(emptyList())
        }

    /** Las visitas anteriores a un elemento. */
    suspend fun historial(activoId: String): List<IntervencionDeActivo> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.postgrest.from("asset_interventions")
                    .select(io.github.jan.supabase.postgrest.query.Columns.list(
                        "id", "intervened_on", "action", "notes"
                    )) {
                        filter { eq("asset_id", activoId) }
                        order("intervened_on", Order.DESCENDING)
                        limit(12)
                    }
                    .decodeList<IntervencionDeActivo>()
            }.getOrDefault(emptyList())
        }

    /**
     * La url firmada de una foto.
     *
     * Se pide de a una porque la ficha enseña dos y se abren de a poco; pedir
     * las de todo el inventario sería firmar miles de rutas para ver dos.
     */
    suspend fun urlDeFoto(ruta: String?): String? = withContext(Dispatchers.IO) {
        if (ruta.isNullOrBlank()) return@withContext null
        runCatching {
            supabase.storage.from("evidencias").createSignedUrl(ruta, 3.hours)
        }.getOrNull()
    }
}
