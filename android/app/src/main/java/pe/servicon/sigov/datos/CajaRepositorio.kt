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
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** La caja chica de la cuadrilla, con su saldo ya calculado. */
@Serializable
data class Caja(
    val id: String,
    @SerialName("service_id") val servicioId: String,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("holder_name") val responsable: String? = null,
    val code: String,
    val name: String,
    val currency: String = "PEN",
    @SerialName("low_balance_threshold") val saldoMinimo: Double = 0.0,
    val balance: Double = 0.0,
    @SerialName("balance_approved") val saldoAprobado: Double = 0.0,
    @SerialName("pending_review") val porRevisar: Int = 0,
    val observed: Int = 0,
) {
    /** Cuando el saldo baja del piso hay que pedir depósito antes de quedarse seco. */
    val saldoBajo: Boolean get() = balance <= saldoMinimo
}

/** La caja con la procedencia de su saldo. */
data class CajaConSaldo(val caja: Caja, val fresca: Boolean)

/** Un movimiento de la caja: casi siempre un gasto con su comprobante. */
@Serializable
data class Movimiento(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    val kind: String,
    val status: String,
    val amount: Double,
    @SerialName("signed_amount") val importeConSigno: Double,
    @SerialName("occurred_on") val fecha: String,
    val category: String? = null,
    val description: String,
    val supplier: String? = null,
    @SerialName("receipt_kind") val comprobante: String = "boleta",
    @SerialName("receipt_number") val numeroComprobante: String? = null,
    @SerialName("storage_path") val rutaFoto: String? = null,
    @SerialName("review_note") val observacion: String? = null,
)

/**
 * Una solicitud de depósito y lo que respondió administración (OBS-41).
 *
 * `status` es el de la base, más dos propios del celular: «en_cola» (pedida
 * sin señal) y «corrigiendo» (corregida sin señal).
 */
@Serializable
data class PedidoDeDeposito(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("cash_box_id") val cajaId: String? = null,
    val status: String,
    val amount: Double,
    val reason: String,
    val priority: String = "normal",
    @SerialName("needed_by") val paraCuando: String? = null,
    @SerialName("approved_amount") val montoAprobado: Double? = null,
    @SerialName("resolution_note") val nota: String? = null,
    @SerialName("bank_reference") val operacion: String? = null,
    @SerialName("created_at") val creado: String = "",
    @SerialName("resolved_at") val respondido: String? = null,
) {
    val urgente: Boolean get() = priority == "urgente"
    /** Solo una observada se corrige: es lo que administración pidió. */
    val corregible: Boolean get() = status == "observado"
}

/** Los estados como los nombró Elvis; «depositado» es «Atendido». */
val ESTADOS_DE_DEPOSITO = mapOf(
    "en_cola" to "Esperando señal",
    "corrigiendo" to "Corrección por enviar",
    "solicitado" to "Solicitado",
    "en_evaluacion" to "En evaluación",
    "aprobado" to "Aprobado",
    "depositado" to "Atendido",
    "observado" to "Observado",
    "rechazado" to "Rechazado",
)

/** Los rubros con los que se clasifica un gasto de obra. */
val RUBROS_DE_GASTO = listOf(
    "Combustible",
    "Alimentación",
    "Peaje",
    "Repuestos y herramientas",
    "Materiales",
    "Movilidad",
    "Hospedaje",
    "Otros",
)

/** Los comprobantes que se aceptan, en el orden en que aparecen en obra. */
val COMPROBANTES = listOf(
    "boleta" to "Boleta",
    "factura" to "Factura",
    "recibo" to "Recibo",
    "ticket" to "Ticket",
    "planilla" to "Planilla",
    "sin_comprobante" to "Sin comprobante",
)

/**
 * La caja chica.
 *
 * Igual que el resto del trabajo de campo: se lee de la copia local y se
 * escribe a la cola. Un gasto anotado en la carretera no puede depender de
 * que haya señal, y la foto de la boleta viaja con él.
 */
@Singleton
class CajaRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val colaDao: ColaDao,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * La caja de la cuadrilla, y si el saldo viene del servidor o de la copia.
     *
     * Importa distinguirlo: el saldo lo calcula el servidor, así que una copia
     * guardada ayer puede no incluir los gastos de hoy. Cuando no es fresco,
     * la pantalla vuelve a sumar los movimientos en vez de creerle.
     */
    suspend fun miCaja(servicioId: String, cuadrillaId: String?): CajaConSaldo? =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_cash_boxes")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            eq("is_active", true)
                            cuadrillaId?.let { eq("crew_id", it) }
                        }
                    }
                    .decodeList<JsonObject>()
                guardarCopia("cash_boxes", servicioId, filas)
                filas.firstOrNull()
                    ?.let { CajaConSaldo(json.decodeFromString<Caja>(it.toString()), fresca = true) }
            }.getOrElse {
                catalogo.de("cash_boxes", servicioId)
                    .mapNotNull { runCatching { json.decodeFromString<Caja>(it.datos) }.getOrNull() }
                    .firstOrNull { cuadrillaId == null || it.cuadrillaId == cuadrillaId }
                    ?.let { CajaConSaldo(it, fresca = false) }
            }
        }

    /** Los últimos movimientos, para que el responsable cuadre su cuaderno. */
    suspend fun movimientos(cajaId: String, servicioId: String): List<Movimiento> =
        withContext(Dispatchers.IO) {
            runCatching {
                val filas = supabase.postgrest.from("v_cash_movements")
                    .select {
                        filter { eq("cash_box_id", cajaId) }
                        order("occurred_on", Order.DESCENDING)
                        limit(200)
                    }
                    .decodeList<JsonObject>()
                guardarCopia("cash_movements", servicioId, filas)
                filas.map { json.decodeFromString<Movimiento>(it.toString()) }
            }.getOrElse {
                catalogo.de("cash_movements", servicioId)
                    .mapNotNull { runCatching { json.decodeFromString<Movimiento>(it.datos) }.getOrNull() }
                    .sortedByDescending { it.fecha }
            }
        }

    /**
     * Lo que el capataz ya anotó pero todavía no llegó a la nube.
     *
     * El saldo que devuelve el servidor no los conoce, y sin esto el capataz
     * vería su saldo viejo toda la jornada mientras no haya señal: justo el
     * error que este módulo viene a eliminar.
     *
     * Se descartan los que ya aparecen en la lista bajada, porque en cuanto
     * el envío llega el servidor pasa a contarlos y se duplicaría el descuento.
     */
    suspend fun enCola(yaEnLaNube: List<Movimiento>): List<Movimiento> =
        withContext(Dispatchers.IO) {
            val confirmados = yaEnLaNube.mapNotNull { it.clientId }.toSet()
            colaDao.sinConfirmarDe("cash_movements")
                .filter { it.clientId !in confirmados }
                .mapNotNull { envio ->
                    runCatching {
                        val cuerpo = json.parseToJsonElement(envio.cuerpo) as JsonObject
                        fun texto(clave: String) =
                            cuerpo[clave]?.toString()?.trim('"')?.takeIf { it != "null" }
                        val importe = texto("amount")?.toDoubleOrNull() ?: return@runCatching null
                        Movimiento(
                            id = envio.clientId,
                            clientId = envio.clientId,
                            kind = texto("kind") ?: "gasto",
                            status = "en_cola",
                            amount = importe,
                            importeConSigno = -importe,
                            fecha = texto("occurred_on") ?: Peru.hoy().toString(),
                            category = texto("category"),
                            description = texto("description") ?: envio.etiqueta,
                            supplier = texto("supplier"),
                            comprobante = texto("receipt_kind") ?: "boleta",
                            numeroComprobante = texto("receipt_number"),
                            rutaFoto = texto("storage_path"),
                        )
                    }.getOrNull()
                }
        }

    /**
     * Anota un gasto y encola su comprobante.
     *
     * La foto de la boleta es parte del gasto, no un adjunto opcional: sin
     * ella administración no lo aprueba y el responsable termina poniéndolo
     * de su bolsillo.
     */
    suspend fun registrarGasto(
        caja: Caja,
        importe: Double,
        rubro: String,
        descripcion: String,
        proveedor: String?,
        rucProveedor: String?,
        tipoComprobante: String,
        numeroComprobante: String?,
        fotoComprobante: File?,
        fecha: String = Peru.hoy().toString(),
    ): String = withContext(Dispatchers.IO) {
        val clientId = UUID.randomUUID().toString()

        val ruta = fotoComprobante?.let {
            val enLima = Peru.hoy()
            "${caja.servicioId}/caja/${enLima.year}/" +
                "%02d".format(enLima.monthValue) + "/$clientId.jpg"
        }

        cola.encolar(
            tabla = "cash_movements",
            clientId = clientId,
            etiqueta = "Gasto · $rubro · S/ $importe",
            cuerpo = buildJsonObject {
                put("service_id", caja.servicioId)
                put("cash_box_id", caja.id)
                put("kind", "gasto")
                put("status", "registrado")
                put("amount", importe)
                put("occurred_on", fecha)
                put("category", rubro)
                put("description", descripcion)
                proveedor?.takeIf { it.isNotBlank() }?.let { put("supplier", it) }
                rucProveedor?.takeIf { it.isNotBlank() }?.let { put("supplier_ruc", it) }
                put("receipt_kind", tipoComprobante)
                numeroComprobante?.takeIf { it.isNotBlank() }?.let { put("receipt_number", it) }
                ruta?.let { put("storage_path", it) }
                caja.cuadrillaId?.let { put("crew_id", it) }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )

        if (fotoComprobante != null && ruta != null) {
            cola.adjuntar(
                clientId = clientId,
                bucket = "documentos",
                rutaDestino = ruta,
                archivoLocal = fotoComprobante,
                tipoMime = "image/jpeg",
            )
        }
        clientId
    }

    /**
     * Mis solicitudes de depósito: las de la nube, las que siguen en el
     * equipo y las correcciones que todavía no salieron.
     */
    suspend fun misSolicitudes(cajaId: String, servicioId: String): List<PedidoDeDeposito> =
        withContext(Dispatchers.IO) {
            val nube = runCatching {
                val filas = supabase.postgrest.from("deposit_requests")
                    .select {
                        filter {
                            eq("cash_box_id", cajaId)
                            exact("deleted_at", null)
                        }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList<JsonObject>()
                guardarCopia("deposit_requests", servicioId, filas)
                filas.map { json.decodeFromString<PedidoDeDeposito>(it.toString()) }
            }.getOrElse {
                catalogo.de("deposit_requests", servicioId)
                    .mapNotNull { runCatching { json.decodeFromString<PedidoDeDeposito>(it.datos) }.getOrNull() }
                    .filter { it.cajaId == cajaId }
                    .sortedByDescending { it.creado }
            }

            fun texto(cuerpo: JsonObject, clave: String) =
                cuerpo[clave]?.toString()?.trim('"')?.takeIf { it != "null" }

            // Pedidas sin señal: todavía no existen en la nube
            val confirmados = nube.mapNotNull { it.clientId }.toSet()
            val enCola = colaDao.sinConfirmarDe("deposit_requests")
                .filter { it.clientId !in confirmados }
                .mapNotNull { envio ->
                    runCatching {
                        val c = json.parseToJsonElement(envio.cuerpo) as JsonObject
                        if (texto(c, "cash_box_id") != cajaId) return@runCatching null
                        PedidoDeDeposito(
                            id = envio.clientId,
                            clientId = envio.clientId,
                            cajaId = cajaId,
                            status = "en_cola",
                            amount = texto(c, "amount")?.toDoubleOrNull() ?: return@runCatching null,
                            reason = texto(c, "reason") ?: envio.etiqueta,
                            priority = texto(c, "priority") ?: "normal",
                            paraCuando = texto(c, "needed_by"),
                            creado = java.time.Instant.ofEpochMilli(envio.creadoEn).toString(),
                        )
                    }.getOrNull()
                }

            // Corregidas sin señal: se muestran ya corregidas
            val correcciones = colaDao.sinConfirmarDe(TABLA_CORRECCION)
                .mapNotNull { envio ->
                    runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull()
                }
                .associateBy { texto(it, "p_id") }

            enCola + nube.map { p ->
                val c = correcciones[p.id] ?: return@map p
                p.copy(
                    status = "corrigiendo",
                    amount = texto(c, "p_monto")?.toDoubleOrNull() ?: p.amount,
                    reason = texto(c, "p_motivo") ?: p.reason,
                    priority = texto(c, "p_prioridad") ?: p.priority,
                )
            }
        }

    /** Corrige una solicitud observada. Viaja con la cola, como todo. */
    suspend fun corregirDeposito(
        pedido: PedidoDeDeposito,
        importe: Double,
        motivo: String,
        prioridad: String,
    ): String = withContext(Dispatchers.IO) {
        cola.encolar(
            tabla = TABLA_CORRECCION,
            etiqueta = "Corrección de depósito · S/ $importe",
            cuerpo = buildJsonObject {
                put("p_id", pedido.id)
                put("p_monto", importe)
                put("p_motivo", motivo)
                put("p_prioridad", prioridad)
            },
        )
    }

    /** Pide plata a administración. Queda con fecha y motivo, no por WhatsApp. */
    suspend fun pedirDeposito(
        caja: Caja,
        importe: Double,
        motivo: String,
        paraCuando: String?,
        prioridad: String = "normal",
    ): String = withContext(Dispatchers.IO) {
        cola.encolar(
            tabla = "deposit_requests",
            etiqueta = "Solicitud de depósito · S/ $importe",
            cuerpo = buildJsonObject {
                put("service_id", caja.servicioId)
                put("cash_box_id", caja.id)
                put("status", "solicitado")
                put("amount", importe)
                put("reason", motivo)
                put("priority", prioridad)
                paraCuando?.let { put("needed_by", it) }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
    }

    private companion object {
        const val TABLA_CORRECCION = "rpc:corregir_solicitud_deposito"
    }

    private suspend fun guardarCopia(tabla: String, servicioId: String, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(tabla = tabla, id = id, servicioId = servicioId, datos = fila.toString())
        }
        catalogo.guardar(vigentes)
        if (vigentes.isNotEmpty()) catalogo.borrarLosQueYaNoEstan(tabla, vigentes.map { it.id })
    }
}
