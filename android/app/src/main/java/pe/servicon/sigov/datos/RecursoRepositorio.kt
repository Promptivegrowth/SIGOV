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

/** Un equipo u otro recurso (herramienta, EPP, EPC…) usado en el día. */
data class RecursoDelDia(
    val clientId: String,
    /** equipo · herramienta · epp · epc · material · otro */
    val tipo: String,
    val codigo: String?,
    val descripcion: String,
    val unidad: String?,
    val cantidad: Double?,
    val observacion: String?,
    val enviado: Boolean,
    /** La actividad del parte en que se usó; sin ella, es del día. */
    val registroClientId: String? = null,
    /** Horas de uso en la actividad (equipos y herramientas). */
    val horasUso: Double? = null,
    /** % de participación en la actividad (herramientas). */
    val participacionPct: Double? = null,
)

/** Cómo se nombra cada naturaleza de recurso. */
object TiposDeRecurso {
    val todos = listOf("equipo", "herramienta", "epp", "epc", "material", "otro")
    fun nombre(tipo: String) = when (tipo) {
        "equipo" -> "Equipo"; "herramienta" -> "Herramienta"; "epp" -> "EPP"; "epc" -> "EPC"
        "material" -> "Material"; else -> "Otro"
    }
    /** Lo que existe físicamente: no se suma entre actividades (OBS 3). */
    fun esFisico(tipo: String) = tipo in setOf("equipo", "herramienta", "epp", "epc")
}

/** Un recurso del día, consolidado entre las actividades en que se usó. */
data class RecursoConsolidado(
    val tipo: String,
    val codigo: String?,
    val descripcion: String,
    val unidad: String?,
    /** Física (la mayor) para equipos, herramientas y EPP/EPC; usada (suma) para lo demás. */
    val cantidad: Double?,
    /** Suma de las horas de uso. */
    val horas: Double?,
    val actividades: Int,
    /** Detalle por actividad, para la observación: «1.5 h + 2 h», «50 %». */
    val detalle: String?,
    val observacion: String?,
    val enviado: Boolean,
    val clientIds: List<String>,
)

/**
 * El consolidado del día (OBS 3, CASOS 16 y 17): el cemento de dos
 * actividades se suma (2 + 3 = 5 bolsas); la hidrolavadora usada en dos
 * actividades sigue siendo 1 und., con sus horas sumadas (2 h + 3 h = 5 h).
 */
fun consolidarRecursos(recursos: List<RecursoDelDia>): List<RecursoConsolidado> =
    recursos.groupBy { Triple(it.tipo, it.descripcion.trim().lowercase(), it.unidad?.trim()?.lowercase()) }.values.map { g ->
        val x = g.first()
        val cantidades = g.mapNotNull { it.cantidad }
        val horas = g.mapNotNull { it.horasUso }
        val pct = g.mapNotNull { it.participacionPct }
        val detalle = listOfNotNull(
            horas.takeIf { it.size > 1 }?.joinToString(" + ") { Numeros.tres(it) + " h" },
            pct.takeIf { it.isNotEmpty() }?.joinToString(" / ") { Numeros.tres(it) + " %" }?.let { "Participación $it" },
            "EPP/EPC por jornada".takeIf { x.tipo == "epp" || x.tipo == "epc" },
        ).joinToString(" · ").ifBlank { null }
        RecursoConsolidado(
            tipo = x.tipo, codigo = g.firstNotNullOfOrNull { it.codigo }, descripcion = x.descripcion.trim(), unidad = x.unidad,
            cantidad = cantidades.takeIf { it.isNotEmpty() }?.let { if (TiposDeRecurso.esFisico(x.tipo)) it.max() else it.sum() },
            horas = horas.takeIf { it.isNotEmpty() }?.sum(),
            actividades = g.size,
            detalle = detalle,
            observacion = g.mapNotNull { it.observacion?.trim()?.ifBlank { null } }.distinct().joinToString(" · ").ifBlank { null },
            enviado = g.all { it.enviado },
            clientIds = g.map { it.clientId },
        )
    }

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
        horasUso: Double? = null,
        participacionPct: Double? = null,
    ) = withContext(Dispatchers.IO) {
        require(descripcion.isNotBlank()) { "Escribe qué equipo o recurso fue." }
        require(tipo in TiposDeRecurso.todos)
        require(horasUso == null || horasUso in 0.0..24.0) { "Las horas de uso van de 0 a 24." }
        require(participacionPct == null || participacionPct in 0.0..100.0) { "La participación va de 0 a 100 %." }
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
            etiqueta = TiposDeRecurso.nombre(tipo) + " · " + descripcion.trim(),
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
                horasUso?.let { put("horas_uso", it) }
                participacionPct?.let { put("participacion_pct", it) }
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
        horasUso = o["horas_uso"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
        participacionPct = o["participacion_pct"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull(),
    )

    companion object {
        const val TABLA = "parte_recursos"
    }
}
