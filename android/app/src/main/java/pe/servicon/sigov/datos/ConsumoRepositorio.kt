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
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Lo que la cuadrilla tiene de un insumo. */
@Serializable
data class StockDeCuadrilla(
    @SerialName("supply_id") val insumoId: String,
    @SerialName("supply_name") val nombre: String,
    @SerialName("supply_code") val codigo: String? = null,
    @SerialName("unit_symbol") val unidad: String? = null,
    val stock: Double = 0.0,
)

/** Un material usado en el día. */
data class Consumo(
    val clientId: String,
    val insumoId: String,
    val nombre: String,
    val unidad: String?,
    val cantidad: Double,
    val actividad: String?,
    val enviado: Boolean,
)

/**
 * El material que la cuadrilla usa en campo (Formato 8, «salidas»).
 *
 * El capataz lo anota en el reporte diario, con la actividad en que lo usó.
 * Como todo lo de campo, se guarda en el teléfono y sale con la cola.
 */
@Singleton
class ConsumoRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** Lo que hoy tiene la cuadrilla, con la última copia si no hay señal. */
    suspend fun stock(servicioId: String, cuadrillaId: String): List<StockDeCuadrilla> = withContext(Dispatchers.IO) {
        val tabla = "stock_cuadrilla:$cuadrillaId"
        runCatching {
            val filas = supabase.postgrest.from("v_stock_cuadrilla")
                .select {
                    filter { eq("service_id", servicioId); eq("crew_id", cuadrillaId) }
                    order("supply_name", Order.ASCENDING)
                }
                .decodeList<JsonObject>()
            catalogo.guardar(filas.mapIndexed { i, f -> FilaCatalogo(tabla = tabla, id = f["supply_id"]?.jsonPrimitive?.content ?: i.toString(), servicioId = servicioId, datos = f.toString()) })
            filas.map { json.decodeFromString<StockDeCuadrilla>(it.toString()) }
        }.getOrElse {
            catalogo.de(tabla, servicioId).mapNotNull { runCatching { json.decodeFromString<StockDeCuadrilla>(it.datos) }.getOrNull() }
        }
    }

    /** Lo usado ese día: lo que ya está en la nube y lo que espera señal. */
    suspend fun delDia(servicioId: String, cuadrillaId: String, fecha: LocalDate, registros: List<RegistroLocal>): List<Consumo> =
        withContext(Dispatchers.IO) {
            val nombres = registros.associate { it.clientId to it.actividadNombre }
            val locales = colaDao.sinConfirmarDe(TABLA).mapNotNull { envio ->
                val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
                if (o["crew_id"]?.jsonPrimitive?.content != cuadrillaId || o["occurred_on"]?.jsonPrimitive?.content != fecha.toString()) return@mapNotNull null
                Consumo(
                    clientId = envio.clientId,
                    insumoId = o["supply_id"]?.jsonPrimitive?.content ?: "",
                    nombre = o["_nombre"]?.jsonPrimitive?.content ?: "Material",
                    unidad = o["_unidad"]?.jsonPrimitive?.content,
                    cantidad = o["qty"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                    actividad = envio.dependeDe?.let { nombres[it] },
                    enviado = false,
                )
            }
            val remotos = runCatching {
                supabase.postgrest.from("v_kardex_cuadrilla")
                    .select {
                        filter {
                            eq("service_id", servicioId); eq("crew_id", cuadrillaId)
                            eq("occurred_on", fecha.toString()); eq("tipo", "consumo")
                        }
                    }
                    .decodeList<JsonObject>()
                    .map { o ->
                        Consumo(
                            clientId = o["id"]?.jsonPrimitive?.content ?: "",
                            insumoId = o["supply_id"]?.jsonPrimitive?.content ?: "",
                            nombre = o["supply_name"]?.jsonPrimitive?.content ?: "Material",
                            unidad = o["unit_symbol"]?.jsonPrimitive?.content,
                            cantidad = o["salida"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                            actividad = o["notes"]?.jsonPrimitive?.content,
                            enviado = true,
                        )
                    }
            }.getOrDefault(emptyList())
            locales + remotos
        }

    /**
     * Anota material usado. Si se dice en qué actividad, el consumo espera a
     * que esa actividad exista en la nube y queda amarrado a ella.
     */
    suspend fun registrar(
        servicioId: String,
        cuadrillaId: String,
        fecha: LocalDate,
        insumoId: String,
        nombre: String,
        unidad: String?,
        cantidad: Double,
        registro: RegistroLocal?,
        parteClientId: String?,
    ) {
        require(cantidad > 0) { "La cantidad tiene que ser mayor que cero." }
        val clientId = UUID.randomUUID().toString()
        // Se espera al padre solo si todavía está en la cola; si ya subió y la
        // cola lo olvidó, se amarra directo con su id de la nube
        val padre = registro?.clientId ?: parteClientId
        val padreEnCola = padre != null && colaDao.porId(padre) != null
        cola.encolar(
            tabla = TABLA,
            clientId = clientId,
            dependeDe = if (padreEnCola) padre else null,
            etiqueta = "Material usado · $nombre · ${Numeros.tres(cantidad)}",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                put("crew_id", cuadrillaId)
                put("supply_id", insumoId)
                put("tipo", "consumo")
                put("qty", cantidad)
                put("occurred_on", fecha.toString())
                if (!padreEnCola) registro?.idEnServidor?.let { put("work_entry_id", it) }
                registro?.let { put("notes", listOfNotNull(it.actividadNombre, Progresiva.rango(it.progresivaInicio, it.progresivaFin)).joinToString(" · ")) }
                // Solo para mostrarlo sin señal; la nube los ignora
                put("_nombre", nombre)
                unidad?.let { put("_unidad", it) }
            },
        )
    }

    /** Quita un material anotado por error, si todavía no salió del teléfono. */
    suspend fun descartar(clientId: String) = cola.descartar(clientId)

    companion object {
        const val TABLA = "movimientos_cuadrilla"
    }
}

/** Cifras con hasta tres decimales: 0,125 gal es habitual. */
object Numeros {
    fun tres(n: Double): String =
        if (n % 1.0 == 0.0) n.toLong().toString()
        else "%.3f".format(java.util.Locale.US, n).trimEnd('0').trimEnd('.')
}
