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
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Un insumo del contrato, con lo que queda en almacén. */
@Serializable
data class Insumo(
    val id: String,
    @SerialName("service_id") val servicioId: String,
    val code: String,
    val name: String,
    val category: String? = null,
    @SerialName("unit_symbol") val unidad: String? = null,
    @SerialName("min_stock") val minimo: Double = 0.0,
    val stock: Double = 0.0,
    val committed: Double = 0.0,
) {
    /** Lo que de verdad se puede pedir: lo que hay menos lo comprometido. */
    val disponible: Double get() = stock - committed

    val escaso: Boolean get() = disponible <= minimo
}

/** Un pedido de la cuadrilla al almacén. */
@Serializable
data class Pedido(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    val code: String? = null,
    val status: String = "solicitado",
    @SerialName("needed_on") val paraCuando: String,
    val reason: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("activity_name") val actividad: String? = null,
    @SerialName("review_note") val respuesta: String? = null,
    @SerialName("item_count") val renglones: Int = 0,
    @SerialName("qty_requested") val pedido: Double = 0.0,
    @SerialName("qty_delivered") val entregado: Double = 0.0,
)

/** Un renglón del pedido: qué insumo y cuánto. */
/**
 * Un renglón del pedido.
 *
 * Casi siempre es un insumo del catálogo. Pero el catálogo se arma en la
 * oficina al empezar el contrato y en la vía siempre aparece algo que nadie
 * previó —un perno, una manguera, una lata de algo—. Cuando eso pasa, el
 * pedido no puede quedarse sin hacer: se escribe el nombre y la unidad, y
 * el residente decide desde la web si lo incorpora al maestro.
 */
data class RenglonPedido(
    val cantidad: Double,
    val insumo: Insumo? = null,
    /** Lo que se escribió, cuando no está en la lista. */
    val nombreEscrito: String? = null,
    val unidadId: String? = null,
    val unidad: String? = null,
) {
    val descripcion: String get() = insumo?.name ?: nombreEscrito.orEmpty()

    val simbolo: String? get() = insumo?.unidad ?: unidad
}

/**
 * Materiales e insumos.
 *
 * El capataz pide lo que necesita para la semana y ve qué queda en almacén
 * antes de pedir; el residente aprueba desde la web. Pedir sin saber el stock
 * es lo que hace que una cuadrilla se quede parada esperando emulsión que
 * nunca hubo.
 */
@Singleton
class MaterialRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** El catálogo con su stock. Si no hay señal, la última copia bajada. */
    suspend fun insumos(servicioId: String): List<Insumo> = withContext(Dispatchers.IO) {
        runCatching {
            val filas = supabase.postgrest.from("v_supplies")
                .select {
                    filter { eq("service_id", servicioId); eq("is_active", true) }
                    order("name", Order.ASCENDING)
                }
                .decodeList<JsonObject>()
            espejar("supplies", servicioId, filas)
            filas.map { json.decodeFromString<Insumo>(it.toString()) }
        }.getOrElse {
            catalogo.de("supplies", servicioId)
                .mapNotNull { runCatching { json.decodeFromString<Insumo>(it.datos) }.getOrNull() }
                .sortedBy { it.name }
        }
    }

    /** Los pedidos de la cuadrilla, del más reciente al más viejo. */
    suspend fun pedidos(servicioId: String, cuadrillaId: String?): List<Pedido> =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_supply_requests")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            cuadrillaId?.let { eq("crew_id", it) }
                        }
                        order("needed_on", Order.DESCENDING)
                        limit(100)
                    }
                    .decodeList<JsonObject>()
                espejar("supply_requests", servicioId, filas)
                filas.map { json.decodeFromString<Pedido>(it.toString()) }
            }.getOrElse {
                catalogo.de("supply_requests", servicioId)
                    .mapNotNull { runCatching { json.decodeFromString<Pedido>(it.datos) }.getOrNull() }
                    .filter { cuadrillaId == null || it.cuadrilla != null }
                    .sortedByDescending { it.paraCuando }
            }
        }

    /**
     * Los pedidos que el capataz ya armó y siguen esperando señal.
     *
     * Igual que en la caja: sin esto, en carretera el capataz pediría dos
     * veces lo mismo por no ver el primero.
     */
    suspend fun pedidosEnCola(yaEnLaNube: List<Pedido>): List<Pedido> = withContext(Dispatchers.IO) {
        val confirmados = yaEnLaNube.mapNotNull { it.clientId }.toSet()
        colaDao.sinConfirmarDe("supply_requests")
            .filter { it.clientId !in confirmados }
            .mapNotNull { envio ->
                runCatching {
                    val cuerpo = json.parseToJsonElement(envio.cuerpo) as JsonObject
                    fun texto(clave: String) =
                        cuerpo[clave]?.toString()?.trim('"')?.takeIf { it != "null" }
                    Pedido(
                        id = envio.clientId,
                        clientId = envio.clientId,
                        status = "en_cola",
                        paraCuando = texto("needed_on") ?: Peru.hoy().toString(),
                        reason = texto("reason"),
                        renglones = renglonesEnCola(envio.clientId),
                    )
                }.getOrNull()
            }
    }

    private suspend fun renglonesEnCola(pedidoClientId: String): Int =
        colaDao.sinConfirmarDe("supply_request_items").count { envio ->
            runCatching {
                val cuerpo = json.parseToJsonElement(envio.cuerpo) as JsonObject
                cuerpo["request_id"]?.toString()?.trim('"') == pedidoClientId
            }.getOrDefault(false)
        }

    /**
     * Arma el pedido y lo encola.
     *
     * El pedido y sus renglones viajan por separado, pero los renglones
     * declaran que dependen del pedido: la cola no los sube hasta que su
     * cabecera exista en la nube.
     */
    suspend fun pedir(
        servicioId: String,
        cuadrillaId: String?,
        paraCuando: String,
        motivo: String,
        renglones: List<RenglonPedido>,
    ): String = withContext(Dispatchers.IO) {
        require(renglones.isNotEmpty()) { "El pedido no tiene ningún insumo." }

        val clientId = UUID.randomUUID().toString()
        cola.encolar(
            tabla = "supply_requests",
            clientId = clientId,
            etiqueta = "Pedido de ${renglones.size} insumo(s)",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                cuadrillaId?.let { put("crew_id", it) }
                put("status", "solicitado")
                put("needed_on", paraCuando)
                put("reason", motivo)
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )

        renglones.forEach { renglon ->
            cola.encolar(
                tabla = "supply_request_items",
                dependeDe = clientId,
                etiqueta = "${renglon.descripcion} · ${renglon.cantidad}",
                cuerpo = buildJsonObject {
                    put("service_id", servicioId)
                    // Una forma o la otra, nunca las dos: la nube tiene esa
                    // misma regla escrita como restricción.
                    if (renglon.insumo != null) {
                        put("supply_id", renglon.insumo.id)
                    } else {
                        put("other_name", renglon.nombreEscrito?.trim().orEmpty())
                        renglon.unidadId?.let { put("other_unit_id", it) }
                    }
                    put("qty_requested", renglon.cantidad)
                },
            )
        }
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
