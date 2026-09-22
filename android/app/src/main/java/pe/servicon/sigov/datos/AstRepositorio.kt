package pe.servicon.sigov.datos

import android.content.Context
import android.graphics.Bitmap
import dagger.hilt.android.qualifiers.ApplicationContext
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
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.io.File
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
private val selloIso: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME

/** De qué análisis se trata. */
enum class TipoAst(val valor: String, val etiqueta: String) {
    CUADRILLA("cuadrilla", "De la cuadrilla"),
    CONDUCTOR("conductor", "Del conductor"),
}

/**
 * Las cinco preguntas que se responden antes de mover un vehículo.
 *
 * Son siempre las mismas y en el mismo orden porque así se recuerdan: el
 * conductor las contesta de memoria mientras revisa la camioneta. El juicio
 * de si puede manejar lo hace el servidor, no esta pantalla; aquí solo se
 * anticipa para poder avisarle antes de que intente guardar.
 */
@Serializable
data class AptitudDelConductor(
    @SerialName("descanso_suficiente") val descansoSuficiente: Boolean = false,
    @SerialName("consumio_alcohol") val consumioAlcohol: Boolean = false,
    @SerialName("medicacion_que_afecta") val medicacionQueAfecta: Boolean = false,
    @SerialName("licencia_vigente") val licenciaVigente: Boolean = false,
    @SerialName("vehiculo_operativo") val vehiculoOperativo: Boolean = false,
    @SerialName("horas_de_sueno") val horasDeSueno: Int? = null,
    val observacion: String? = null,
) {
    val apto: Boolean
        get() = descansoSuficiente && !consumioAlcohol && !medicacionQueAfecta &&
            licenciaVigente && vehiculoOperativo

    /** Qué falta, dicho como se le diría a la persona. */
    val reparos: List<String>
        get() = listOfNotNull(
            "No declaraste haber descansado lo suficiente".takeIf { !descansoSuficiente },
            "Declaraste haber consumido alcohol".takeIf { consumioAlcohol },
            "Declaraste tomar medicación que afecta al manejo".takeIf { medicacionQueAfecta },
            "No declaraste tener la licencia vigente".takeIf { !licenciaVigente },
            "No declaraste el vehículo operativo".takeIf { !vehiculoOperativo },
        )
}

/** Un peligro identificado, con su control. */
@Serializable
data class Peligro(
    val peligro: String,
    val riesgo: String,
    val control: String,
)

/** Un AST ya registrado, como lo devuelve la nube. */
@Serializable
data class AstRegistrado(
    val id: String,
    val kind: String = "cuadrilla",
    @SerialName("doc_date") val fecha: String,
    val task: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    @SerialName("vehicle_plate") val placa: String? = null,
    @SerialName("driver_name") val conductor: String? = null,
    val apto: Boolean? = null,
    val firmas: Int = 0,
    @SerialName("max_risk") val riesgoMaximo: String? = null,
)

/**
 * El análisis de seguridad antes de empezar.
 *
 * Son dos documentos distintos con el mismo circuito: el de la cuadrilla,
 * que identifica peligros y lo firma cada trabajador, y el del conductor,
 * que responde cinco preguntas y lo firma uno solo.
 *
 * Como todo lo de campo, se escribe a la cola: la charla de seguridad se da
 * al pie de la camioneta, que es donde nunca hay señal.
 */
@Singleton
class AstRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    @ApplicationContext private val contexto: Context,
) {

    /** Los AST del día, para saber si ya se hizo. */
    suspend fun delDia(
        servicioId: String,
        cuadrillaId: String?,
        fecha: String = Peru.hoy().toString(),
    ): List<AstRegistrado> = withContext(Dispatchers.IO) {
        runCatching {
            val filas = supabase.postgrest.from("v_ats")
                .select {
                    filter {
                        eq("service_id", servicioId)
                        eq("doc_date", fecha)
                        cuadrillaId?.let { eq("crew_id", it) }
                    }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<JsonObject>()
            espejar(servicioId, filas)
            filas.map { json.decodeFromString<AstRegistrado>(it.toString()) }
        }.getOrElse {
            catalogo.de("ats", servicioId)
                .mapNotNull { runCatching { json.decodeFromString<AstRegistrado>(it.datos) }.getOrNull() }
                .filter { it.fecha == fecha }
        }
    }

    /**
     * El AST de la cuadrilla, con la firma de cada trabajador.
     *
     * Sin firmas no se registra: un análisis que nadie firmó no demuestra
     * que se haya hablado con el equipo, que es justo lo que pide el
     * auditor.
     */
    suspend fun registrarDeCuadrilla(
        servicioId: String,
        cuadrillaId: String?,
        tarea: String,
        lugar: String?,
        tramoId: String?,
        progresiva: Double?,
        peligros: List<Peligro>,
        epp: List<String>,
        riesgoMaximo: String,
        firmas: List<FirmaDeAsistente>,
        punto: Punto?,
    ): String = withContext(Dispatchers.IO) {
        require(tarea.isNotBlank()) { "Describe la tarea que se va a ejecutar." }
        require(peligros.isNotEmpty()) { "Anota al menos un peligro y su control." }
        require(firmas.isNotEmpty()) { "El AST necesita la firma de la cuadrilla." }

        val clientId = UUID.randomUUID().toString()
        val ahora = Peru.ahora()

        cola.encolar(
            tabla = "ats_iperc",
            clientId = clientId,
            etiqueta = "AST · ${tarea.take(40)}",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                put("kind", TipoAst.CUADRILLA.valor)
                cuadrillaId?.let { put("crew_id", it) }
                put("doc_date", Peru.hoy().toString())
                put("task", tarea.trim())
                lugar?.takeIf { it.isNotBlank() }?.let { put("location", it) }
                tramoId?.let { put("section_id", it) }
                progresiva?.let { put("prog_start_m", it) }
                put("max_risk", riesgoMaximo)
                putJsonArray("hazards") {
                    peligros.forEach { p ->
                        addJsonObject {
                            put("peligro", p.peligro)
                            put("riesgo", p.riesgo)
                            put("control", p.control)
                        }
                    }
                }
                putJsonArray("ppe") { epp.forEach { add(it) } }
                punto?.let { put("lat", it.latitud); put("lng", it.longitud) }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )

        firmarlo(clientId, servicioId, firmas, ahora)
        clientId
    }

    /**
     * El AST del conductor, antes de arrancar.
     *
     * No lleva matriz de riesgos: su valor está en las cinco preguntas, que
     * se responden siempre igual. La firma es una sola, la de quien maneja.
     */
    suspend fun registrarDeConductor(
        servicioId: String,
        cuadrillaId: String?,
        vehiculoId: String,
        placa: String,
        aptitud: AptitudDelConductor,
        firma: FirmaDeAsistente,
        punto: Punto?,
    ): String = withContext(Dispatchers.IO) {
        val clientId = UUID.randomUUID().toString()
        val ahora = Peru.ahora()

        cola.encolar(
            tabla = "ats_iperc",
            clientId = clientId,
            etiqueta = "AST de conductor · $placa",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                put("kind", TipoAst.CONDUCTOR.valor)
                cuadrillaId?.let { put("crew_id", it) }
                put("doc_date", Peru.hoy().toString())
                put("task", "Conducción de vehículo $placa")
                put("vehicle_id", vehiculoId)
                put("max_risk", if (aptitud.apto) "tolerable" else "importante")
                putJsonObject("fit_to_drive") {
                    put("descanso_suficiente", aptitud.descansoSuficiente)
                    put("consumio_alcohol", aptitud.consumioAlcohol)
                    put("medicacion_que_afecta", aptitud.medicacionQueAfecta)
                    put("licencia_vigente", aptitud.licenciaVigente)
                    put("vehiculo_operativo", aptitud.vehiculoOperativo)
                    aptitud.horasDeSueno?.let { put("horas_de_sueno", it) }
                    aptitud.observacion?.takeIf { it.isNotBlank() }?.let { put("observacion", it) }
                }
                punto?.let { put("lat", it.latitud); put("lng", it.longitud) }
                supabase.usuarioActual()?.let {
                    put("driver_id", it)
                    put("created_by", it)
                }
            },
        )

        firmarlo(clientId, servicioId, listOf(firma), ahora)
        clientId
    }

    /** Las firmas del documento: el trazo se guarda como PNG y se adjunta. */
    private suspend fun firmarlo(
        astId: String,
        servicioId: String,
        firmas: List<FirmaDeAsistente>,
        ahora: java.time.LocalDateTime,
    ) {
        firmas.forEach { firma ->
            val firmaId = UUID.randomUUID().toString()
            val ruta = "$servicioId/ats/${Peru.hoy()}/$firmaId.png"
            val archivo = guardarTrazo(firmaId, firma.trazo)

            cola.encolar(
                tabla = "ats_signatures",
                clientId = firmaId,
                // La firma espera a que su AST exista en la nube
                dependeDe = astId,
                etiqueta = "Firma AST · ${firma.miembro.nombre}",
                cuerpo = buildJsonObject {
                    put("full_name", firma.miembro.nombre)
                    firma.miembro.dni?.let { put("dni", it) }
                    put("signature_path", ruta)
                    put("signed_at", selloIso.format(ahora))
                },
            )

            cola.adjuntar(
                clientId = firmaId,
                bucket = "firmas",
                rutaDestino = ruta,
                archivoLocal = archivo,
                tipoMime = "image/png",
            )
        }
    }

    private suspend fun espejar(servicioId: String, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(tabla = "ats", id = id, servicioId = servicioId, datos = fila.toString())
        }
        if (vigentes.isNotEmpty()) catalogo.guardar(vigentes)
    }

    /** El trazo de la firma, como PNG en el equipo, listo para adjuntar. */
    private fun guardarTrazo(id: String, trazo: Bitmap): File {
        val carpeta = File(contexto.filesDir, "firmas").apply { mkdirs() }
        val archivo = File(carpeta, "$id.png")
        archivo.outputStream().use { trazo.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return archivo
    }
}
