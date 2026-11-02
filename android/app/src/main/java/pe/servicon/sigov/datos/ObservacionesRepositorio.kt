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
    /** Las actividades del mismo sitio comparten punto (REV3-OBS-34). */
    @SerialName("punto_id") val puntoId: String? = null,
    /** El ID único legible: OBS-00001 (REV3-OBS-40). */
    val codigo: String? = null,
    /** A cuántos metros quedó el GPS del teléfono de la progresiva (REV3-OBS-37). */
    @SerialName("gps_distancia_m") val gpsDistancia: Int? = null,
    /** Guardada en el equipo y todavía sin subir. */
    val porEnviar: Boolean = false,
    /** Las fotos que siguen en este teléfono, por llave: no gastan datos. */
    val fotosLocales: Map<String, String> = emptyMap(),
) {
    val punto: String get() = puntoId ?: id

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
        // La cola se lee antes que la nube: si un envío sale justo entre las
        // dos lecturas, igual aparece (y si sale dos veces, se descarta por
        // su client_id). Al revés, la observación desaparecía hasta recargar.
        val enCola = colaDao.sinConfirmarDe(TABLA)
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
        val locales = enCola.mapNotNull { envio ->
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
                lat = texto("lat")?.toDoubleOrNull() ?: texto("_lat")?.toDoubleOrNull() ?: texto("gps_lat")?.toDoubleOrNull(),
                lng = texto("lng")?.toDoubleOrNull() ?: texto("_lng")?.toDoubleOrNull() ?: texto("gps_lng")?.toDoubleOrNull(),
                puntoId = texto("punto_id"),
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
        val todas = (locales + remotas)
            .filter { o -> o.id !in quitadas && (o.clientId == null || o.clientId !in quitadas) }
        // Las fotos que todavía suben, por punto: las comparten las actividades
        // del mismo sitio, y la observación puede llegar antes que sus fotos
        val enColaPorPunto = todas.groupBy { it.punto }.mapValues { (_, delPunto) ->
            delPunto.flatMap { o -> fotosEnCola(o.clientId ?: o.id) }.distinctBy { it.first }
        }
        todas.map { o ->
            val conservadas = o.fotos.indices.filter { i -> o.fotosIds.getOrNull(i) !in fotosQuitadas }
            val ids = conservadas.mapNotNull { o.fotosIds.getOrNull(it) }
            val subiendo = enColaPorPunto[o.punto].orEmpty().filter { (id, _) -> id !in ids && id !in fotosQuitadas }
            o.copy(
                fotos = conservadas.map { o.fotos[it] } + subiendo.map { it.first },
                fotosIds = ids + subiendo.map { it.first },
                // Las tomadas en este teléfono se muestran desde aquí
                fotosLocales = ids.mapNotNull { id -> (o.fotosLocales[id] ?: evidencias.archivoLocal(id))?.let { id to it } }.toMap() + subiendo.toMap(),
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

    /** Una actividad del punto: la partida, su unidad y su metrado. */
    data class ActividadDelPunto(val actividad: Actividad, val unidad: String?, val metrado: Double?, val lineal: Boolean)

    /**
     * Registra lo observado en un punto: una observación por actividad
     * (REV3-OBS-34: limpieza de señal, pintado y reparación en el mismo km),
     * todas con el mismo punto, y las fotos (una a tres) colgadas de la
     * primera. Las fotos esperan a que la observación exista en la nube.
     * El GPS real del teléfono se guarda siempre (REV3-OBS-37).
     */
    suspend fun registrar(
        servicioId: String,
        cuadrillaId: String?,
        cuadrilla: String?,
        tramo: Tramo?,
        actividades: List<ActividadDelPunto>,
        progresiva: Double?,
        progresivaFin: Double?,
        lado: String,
        descripcion: String,
        fotos: List<File>,
        sello: Sello,
        punto: Punto?,
        puntoId: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val elPunto = puntoId ?: UUID.randomUUID().toString()
        val ids = actividades.map { a ->
            val clientId = UUID.randomUUID().toString()
            // Lo puntual no lleva progresiva final (REV3-OBS-35)
            val fin = progresivaFin?.takeIf { a.lineal }
            cola.encolar(
                tabla = TABLA,
                clientId = clientId,
                // En Sincronización se reconoce qué es (REV3-OBS-14)
                etiqueta = listOfNotNull("Observación", a.actividad.code, progresiva?.let { "km " + Progresiva.rango(it, fin) },
                    a.metrado?.let { Numeros.tres(it) + (a.unidad?.let { u -> " $u" } ?: "") }).joinToString(" · "),
                cuerpo = buildJsonObject {
                    put("service_id", servicioId)
                    put("punto_id", elPunto)
                    cuadrillaId?.let { put("crew_id", it) }
                    tramo?.let { put("section_id", it.id); put("_tramo", it.name); it.numero?.let { n -> put("_tramo_numero", n) } }
                    put("activity_id", a.actividad.id)
                    put("_actividad", a.actividad.name)
                    put("_actividad_codigo", a.actividad.code)
                    a.actividad.category?.let { c -> put("_categoria", c) }
                    a.unidad?.let { put("_unidad", it) }
                    progresiva?.let { put("progresiva_m", it) }
                    fin?.let { put("progresiva_fin_m", it) }
                    a.metrado?.let { put("metrado", it) }
                    put("side", lado)
                    put("descripcion", descripcion)
                    put("observado_on", Peru.hoy().toString())
                    // Sin progresiva, el punto es el del GPS; con ella lo ubica la nube
                    if (punto != null) {
                        if (progresiva == null) { put("lat", punto.latitud); put("lng", punto.longitud) }
                        put("gps_lat", punto.latitud)
                        put("gps_lng", punto.longitud)
                        put("gps_precision_m", punto.precision.toDouble())
                    }
                    supabase.usuarioActual()?.let { put("created_by", it) }
                },
            )
            clientId
        }
        val primera = actividades.first()
        // Un registro de mentira, solo para el sello: no se guarda ni se envía
        val registro = RegistroLocal(
            clientId = ids.first(),
            parteClientId = "",
            servicioId = servicioId,
            actividadId = primera.actividad.id,
            actividadNombre = "Observación: " + actividades.joinToString(" + ") { it.actividad.name }.take(60),
            tramoId = tramo?.id,
            tramoNombre = tramo?.name,
            progresivaInicio = progresiva,
            progresivaFin = progresivaFin?.takeIf { primera.lineal },
            lado = lado,
            cantidad = primera.metrado ?: 0.0,
            unidad = primera.unidad,
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
                observacion = ids.first(),
            )
        }
        ids.first()
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
