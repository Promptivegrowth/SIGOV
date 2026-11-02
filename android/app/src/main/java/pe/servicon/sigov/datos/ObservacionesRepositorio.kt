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
    @SerialName("created_by") val autorId: String? = null,
    @SerialName("created_by_name") val autor: String? = null,
    @SerialName("nota_atencion") val notaAtencion: String? = null,
    val fotos: List<String> = emptyList(),
    /** La llave de cada foto, en el orden de [fotos]: para quitar la que salió mal. */
    @SerialName("fotos_ids") val fotosIds: List<String> = emptyList(),
    // El tipo de actividad (Elvis, 26/10): primero la categoría, luego la partida
    @SerialName("activity_id") val actividadId: String? = null,
    @SerialName("activity_code") val actividadCodigo: String? = null,
    @SerialName("activity_name") val actividad: String? = null,
    @SerialName("activity_category") val categoria: String? = null,
    @SerialName("unit_symbol") val unidad: String? = null,
    /** El final del intervalo; null si es un punto. */
    @SerialName("progresiva_fin_m") val progresivaFin: Double? = null,
    val metrado: Double? = null,
    @SerialName("sector_code") val sector: String? = null,
    @SerialName("programada_on") val programadaPara: String? = null,
    /** Guardada en el equipo y todavía sin subir. */
    val porEnviar: Boolean = false,
    /** Las fotos que siguen en este teléfono, por llave: no gastan datos. */
    val fotosLocales: Map<String, String> = emptyMap(),
) {
    val estadoLegible: String
        get() = when (estado) {
            "programada" -> "Programada"
            "atendida" -> "Atendida"
            else -> "Pendiente"
        }

    val tramoCorto: String? get() = tramoNumero?.let { "Tramo $it" } ?: tramoCodigo ?: tramo

    /** «1130+221» o «1130+221 → 1130+400». */
    val progresivas: String? get() = Progresiva.rango(progresiva, progresivaFin?.takeIf { it != progresiva })

    val metradoTexto: String?
        get() = metrado?.let { Numeros.tres(it) + (unidad?.let { u -> " $u" } ?: "") }

    /** Cada foto con su llave y lo que se muestra: el archivo del teléfono si sigue ahí. */
    val galeria: List<Pair<String, Any>>
        get() = fotos.mapIndexed { i, ruta ->
            val llave = fotosIds.getOrNull(i) ?: ruta
            llave to (fotosLocales[llave]?.let { File(it) } ?: ruta)
        }
}

/**
 * El registro de observaciones de campo: lo que el jefe de cuadrilla o el
 * supervisor encuentran en la vía y no está en el inventario (un desmonte,
 * basura acumulada…), con su tipo de actividad, su progresiva o intervalo,
 * el metrado y de una a tres fotos. Funciona sin señal: la observación y sus
 * fotos salen con la cola, y la nube ubica el punto sobre la vía.
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
                FilaCatalogo(tabla = TABLA, id = (f["id"]?.jsonPrimitive?.contentOrNull ?: i.toString()), servicioId = servicioId, datos = f.toString())
            })
            filas.map { json.decodeFromString<ObservacionDeCampo>(it.toString()) }
        }.getOrElse {
            catalogo.de(TABLA, servicioId).mapNotNull {
                runCatching { json.decodeFromString<ObservacionDeCampo>(it.datos) }.getOrNull()
            }
        }
        // Lo que se quitó sin señal ya no se muestra, aunque la nube no se entere aún
        val quitadas = parametrosPendientes("rpc:quitar_observacion")
        val fotosQuitadas = parametrosPendientes("rpc:dar_de_baja_evidencia")
        val subidas = remotas.mapNotNull { it.clientId }.toSet()
        // Las que aún esperan señal también se ven
        val locales = colaDao.sinConfirmarDe(TABLA).mapNotNull { envio ->
            if (envio.clientId in subidas) return@mapNotNull null
            val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
            fun texto(k: String) = o[k]?.jsonPrimitive?.contentOrNull
            val fotos = fotosEnCola(envio.clientId)
            ObservacionDeCampo(
                id = envio.clientId,
                clientId = envio.clientId,
                tramoId = texto("section_id"),
                tramo = texto("_tramo"),
                tramoNumero = texto("_tramo_numero")?.toIntOrNull(),
                progresiva = texto("progresiva_m")?.toDoubleOrNull(),
                progresivaFin = texto("progresiva_fin_m")?.toDoubleOrNull(),
                side = texto("side"),
                descripcion = texto("descripcion") ?: "",
                fecha = texto("observado_on"),
                lat = texto("lat")?.toDoubleOrNull() ?: texto("_lat")?.toDoubleOrNull(),
                lng = texto("lng")?.toDoubleOrNull() ?: texto("_lng")?.toDoubleOrNull(),
                actividadId = texto("activity_id"),
                actividadCodigo = texto("_actividad_codigo"),
                actividad = texto("_actividad"),
                categoria = texto("_categoria"),
                unidad = texto("_unidad"),
                metrado = texto("metrado")?.toDoubleOrNull(),
                autorId = texto("created_by"),
                fotos = fotos.map { it.first },
                fotosIds = fotos.map { it.first },
                fotosLocales = fotos.toMap(),
                porEnviar = true,
            )
        }
        (locales + remotas)
            .filter { o -> o.id !in quitadas && (o.clientId == null || o.clientId !in quitadas) }
            .map { o ->
                if (o.porEnviar) return@map o
                // Las fotos tomadas en este teléfono se muestran desde aquí
                val conservadas = o.fotos.indices.filter { i -> o.fotosIds.getOrNull(i) !in fotosQuitadas }
                val ids = conservadas.mapNotNull { o.fotosIds.getOrNull(it) }
                // Y las que todavía suben: la observación llegó antes que sus fotos
                val subiendo = o.clientId?.let { fotosEnCola(it) }.orEmpty().filter { (id, _) -> id !in ids && id !in fotosQuitadas }
                o.copy(
                    fotos = conservadas.map { o.fotos[it] } + subiendo.map { it.first },
                    fotosIds = ids + subiendo.map { it.first },
                    fotosLocales = ids.mapNotNull { id -> evidencias.archivoLocal(id)?.let { id to it } }.toMap() + subiendo.toMap(),
                )
            }
    }

    /** Las fotos de una observación que todavía no sale: (llave, archivo). */
    private suspend fun fotosEnCola(observacion: String): List<Pair<String, String>> =
        colaDao.hijos(observacion)
            .filter { it.tabla == "evidences" }
            .mapNotNull { e -> evidencias.archivoLocal(e.clientId)?.let { e.clientId to it } }

    /** Los ids que esperan una acción en la cola (quitar algo sin señal). */
    private suspend fun parametrosPendientes(tabla: String): Set<String> =
        colaDao.sinConfirmarDe(tabla).flatMap { envio ->
            val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull()
            listOfNotNull(o?.get("p_client_id")?.jsonPrimitive?.contentOrNull, o?.get("p_id")?.jsonPrimitive?.contentOrNull)
        }.toSet()

    /**
     * Registra la observación y sus fotos (una a tres). Las fotos esperan a
     * que la observación exista en la nube; ahí se les pega su id.
     */
    suspend fun registrar(
        servicioId: String,
        cuadrillaId: String?,
        cuadrilla: String?,
        tramo: Tramo?,
        actividad: Actividad?,
        unidad: String?,
        progresiva: Double?,
        progresivaFin: Double?,
        metrado: Double?,
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
                actividad?.let {
                    put("activity_id", it.id)
                    put("_actividad", it.name)
                    put("_actividad_codigo", it.code)
                    it.category?.let { c -> put("_categoria", c) }
                }
                unidad?.let { put("_unidad", it) }
                progresiva?.let { put("progresiva_m", it) }
                progresivaFin?.let { put("progresiva_fin_m", it) }
                metrado?.let { put("metrado", it) }
                put("side", lado)
                put("descripcion", descripcion)
                put("observado_on", Peru.hoy().toString())
                // Sin progresiva, el punto del GPS; con ella lo ubica la nube,
                // pero mientras no sale se muestra donde está el teléfono
                if (punto != null) {
                    if (progresiva == null) { put("lat", punto.latitud); put("lng", punto.longitud) }
                    else { put("_lat", punto.latitud); put("_lng", punto.longitud) }
                }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
        // Un registro de mentira, solo para el sello: no se guarda ni se envía
        val registro = RegistroLocal(
            clientId = clientId,
            parteClientId = "",
            servicioId = servicioId,
            actividadId = actividad?.id ?: "",
            actividadNombre = "Observación: " + (actividad?.name ?: descripcion).take(60),
            tramoId = tramo?.id,
            tramoNombre = tramo?.name,
            progresivaInicio = progresiva,
            progresivaFin = progresivaFin,
            lado = lado,
            cantidad = metrado ?: 0.0,
            unidad = unidad,
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

    /**
     * Quita una observación registrada por error, con sus fotos (Elvis,
     * 26/10: «tal vez me he equivocado, no era ese punto»). La que no salió
     * del teléfono se descarta; la que ya está en la nube se quita por la
     * base, que comprueba quién puede hacerlo.
     */
    suspend fun quitar(o: ObservacionDeCampo) = withContext(Dispatchers.IO) {
        if (o.porEnviar) {
            colaDao.hijos(o.id).filter { it.tabla == "evidences" }.forEach { evidencias.eliminarPorClientId(it.clientId) }
            cola.descartar(o.id)
        } else {
            cola.encolar(
                tabla = "rpc:quitar_observacion",
                etiqueta = "Observación quitada · " + o.descripcion.take(30),
                cuerpo = buildJsonObject {
                    if (o.clientId != null) put("p_client_id", o.clientId) else put("p_id", o.id)
                },
            )
        }
    }

    /** Quita una foto de la observación (la pantalla deja siempre al menos una). */
    suspend fun quitarFoto(llave: String) = evidencias.eliminarPorClientId(llave)

    companion object {
        const val TABLA = "observaciones_campo"
    }
}
