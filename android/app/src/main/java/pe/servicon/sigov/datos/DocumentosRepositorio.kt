package pe.servicon.sigov.datos

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.storage.storage
import kotlin.time.Duration.Companion.hours
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
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Un documento esperado del día, con lo que se sabe de él. */
@Serializable
data class DocumentoDelDia(
    @SerialName("crew_id") val cuadrillaId: String,
    val fecha: String,
    val tipo: String,
    @SerialName("vehicle_id") val vehiculoId: String? = null,
    val placa: String? = null,
    val titulo: String? = null,
    @SerialName("documento_id") val documentoId: String? = null,
    /** pendiente · cargado · pendiente_revision · conforme · observado · subsanado; borrador/enviado/validado en el reporte */
    val estado: String = "pendiente",
    val paginas: Int = 0,
    val observacion: String? = null,
    val digital: Boolean = false,
    /** Fotos tomadas en el teléfono que aún no llegan a la nube. */
    val porEnviar: Int = 0,
) {
    val clave: String get() = tipo + "|" + (vehiculoId ?: "") + "|" + (titulo ?: "")

    val nombre: String
        get() = when (tipo) {
            "reporte_diario" -> "Reporte diario"
            "ats" -> "ATS – Análisis de Trabajo Seguro"
            "charla" -> "Charla de 5 minutos"
            "checklist_vehicular" -> "Checklist vehicular" + (placa?.let { " · $it" } ?: "")
            "higiene" -> "Checklist de higiene"
            "inspeccion_equipos" -> "Inspección de equipos"
            else -> titulo ?: "Otro formato"
        }

    /** Lo que falta hacer hoy: va en rojo (Elvis: «si no has tomado la foto, que aparezca en rojo»). */
    val falta: Boolean get() = (estado == "pendiente" && porEnviar == 0) || estado == "observado"

    /** Se carga como foto del formato físico (el reporte y la higiene son digitales). */
    val esFoto: Boolean get() = tipo !in setOf("reporte_diario", "higiene")

    val estadoLegible: String
        get() = when {
            porEnviar > 0 && estado in setOf("pendiente", "cargado", "observado") ->
                if (porEnviar == 1) "1 foto por enviar" else "$porEnviar fotos por enviar"
            else -> when (estado) {
                "pendiente" -> "Pendiente"
                "cargado" -> "Registrado en la app"
                "pendiente_revision" -> "Pendiente de revisión SSOMA"
                "subsanado" -> "Subsanado · por revisar"
                "observado" -> "Observado"
                "conforme" -> "Conforme"
                "borrador" -> "En borrador"
                "enviado" -> "Enviado · por validar"
                "validado" -> "Validado"
                else -> estado
            }
        }
}

/**
 * Los documentos del día (OBS-53 a 60, reunión con Elvis 00:07–01:23).
 *
 * ATS, charla y checklist vehicular se llenan en papel y aquí se guarda su
 * foto, una o varias páginas. Cada foto sale con la cola, como todo: primero
 * el archivo y después el registro, para que la base nunca apunte a una foto
 * que no subió.
 */
@Singleton
class DocumentosRepositorio @Inject constructor(
    @ApplicationContext private val contexto: Context,
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val colaDao: ColaDao,
    private val cola: ColaRepositorio,
    private val ubicacion: Ubicacion,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * Los documentos de la cuadrilla para un día. Sin señal, los de la última
     * consulta; en ambos casos se suman las fotos que siguen en el teléfono.
     */
    suspend fun delDia(servicioId: String, cuadrillaId: String, fecha: LocalDate = Peru.hoy()): List<DocumentoDelDia> =
        withContext(Dispatchers.IO) {
            val tabla = "documentos_dia:" + cuadrillaId + ":" + fecha
            val remotos = runCatching {
                val filas = supabase.postgrest.rpc(
                    "documentos_del_dia_de",
                    buildJsonObject {
                        put("p_service_id", servicioId)
                        put("p_crew_id", cuadrillaId)
                        put("p_fecha", fecha.toString())
                    },
                ).decodeList<JsonObject>()
                catalogo.guardar(filas.mapIndexed { i, f ->
                    FilaCatalogo(tabla = tabla, id = i.toString(), servicioId = servicioId, datos = f.toString())
                })
                filas.map { json.decodeFromString<DocumentoDelDia>(it.toString()) }
            }.getOrElse {
                catalogo.de(tabla, servicioId).mapNotNull {
                    runCatching { json.decodeFromString<DocumentoDelDia>(it.datos) }.getOrNull()
                }
            }

            // Lo tomado en el teléfono y aún no enviado
            val locales = colaDao.sinConfirmarDe(TABLA_COLA).mapNotNull { envio ->
                runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull()
            }.filter {
                it["p_crew_id"]?.jsonPrimitive?.content == cuadrillaId &&
                    it["p_fecha"]?.jsonPrimitive?.content == fecha.toString()
            }
            fun clave(o: JsonObject) = (o["p_tipo"]?.jsonPrimitive?.content ?: "") + "|" +
                (o["p_vehicle_id"]?.jsonPrimitive?.content ?: "") + "|" + (o["p_titulo"]?.jsonPrimitive?.content ?: "")
            val porClave = locales.groupingBy(::clave).eachCount()

            remotos.map { d -> d.copy(porEnviar = porClave[d.clave] ?: 0) }
                .sortedBy { ORDEN.indexOf(it.tipo).let { i -> if (i < 0) 99 else i } }
        }

    /**
     * Guarda la foto de una página y la deja en la cola. Devuelve el
     * identificador de la página, por si hay que quitarla.
     */
    suspend fun cargarPagina(
        servicioId: String,
        cuadrillaId: String,
        fecha: LocalDate,
        tipo: String,
        original: File,
        vehiculoId: String? = null,
        titulo: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val punto = runCatching { ubicacion.actual() }.getOrNull()
        val tomadaEn = Instant.now()
        val mapa = leerEnderezada(original) ?: error("No se pudo leer la foto. Vuelve a tomarla.")

        val clientId = UUID.randomUUID().toString()
        val destino = File(carpeta(), "$clientId.webp")
        // Más resolución que una foto de obra: el formato tiene que leerse
        destino.outputStream().use { mapa.compress(formatoWebp(), 85, it) }
        val ancho = mapa.width
        val alto = mapa.height
        mapa.recycle()
        original.delete()

        val huella = MessageDigest.getInstance("SHA-256").digest(destino.readBytes())
            .joinToString("") { "%02x".format(it) }
        val enLima = tomadaEn.atZone(Peru.zona)
        val ruta = servicioId + "/ssoma/" + enLima.year + "/" + "%02d".format(enLima.monthValue) + "/" + clientId + ".webp"

        cola.encolar(
            tabla = TABLA_COLA,
            clientId = clientId,
            etiqueta = "Foto · " + DocumentoDelDia(cuadrillaId, fecha.toString(), tipo, vehiculoId, null, titulo).nombre,
            cuerpo = buildJsonObject {
                put("p_client_id", clientId)
                put("p_service_id", servicioId)
                put("p_crew_id", cuadrillaId)
                put("p_fecha", fecha.toString())
                put("p_tipo", tipo)
                put("p_storage_path", ruta)
                vehiculoId?.let { put("p_vehicle_id", it) }
                titulo?.takeIf { it.isNotBlank() }?.let { put("p_titulo", it) }
                punto?.let { put("p_lat", it.latitud); put("p_lng", it.longitud) }
                put("p_taken_at", DateTimeFormatter.ISO_INSTANT.format(tomadaEn.atOffset(ZoneOffset.UTC)))
                put("p_sha256", huella)
                put("p_width", ancho)
                put("p_height", alto)
                put("p_size_bytes", destino.length())
            },
        )
        cola.adjuntar(clientId = clientId, bucket = "documentos", rutaDestino = ruta, archivoLocal = destino)
        clientId
    }

    /** Las páginas ya en la nube de un documento, con su enlace para verlas. */
    suspend fun paginas(documentoId: String): List<PaginaDeDocumento> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.postgrest.from("documento_paginas")
                .select {
                    filter {
                        eq("documento_id", documentoId)
                        exact("deleted_at", null)
                    }
                    order("taken_at", io.github.jan.supabase.postgrest.query.Order.ASCENDING)
                }
                .decodeList<PaginaDeDocumento>()
        }.getOrDefault(emptyList())
    }

    /** Fotos del teléfono que aún no suben, para mostrarlas igual. */
    suspend fun paginasLocales(cuadrillaId: String, fecha: LocalDate, clave: String): List<File> =
        withContext(Dispatchers.IO) {
            colaDao.sinConfirmarDe(TABLA_COLA).mapNotNull { envio ->
                val o = runCatching { json.parseToJsonElement(envio.cuerpo) as JsonObject }.getOrNull() ?: return@mapNotNull null
                val k = (o["p_tipo"]?.jsonPrimitive?.content ?: "") + "|" + (o["p_vehicle_id"]?.jsonPrimitive?.content ?: "") +
                    "|" + (o["p_titulo"]?.jsonPrimitive?.content ?: "")
                if (o["p_crew_id"]?.jsonPrimitive?.content == cuadrillaId && o["p_fecha"]?.jsonPrimitive?.content == fecha.toString() && k == clave)
                    File(carpeta(), envio.clientId + ".webp").takeIf { it.exists() }
                else null
            }
        }

    /** Enlace temporal para ver una página en la nube. */
    suspend fun enlace(ruta: String): String? = withContext(Dispatchers.IO) {
        runCatching { supabase.storage.from("documentos").createSignedUrl(ruta, 1.hours) }.getOrNull()
    }

    /**
     * Quita una página mal tomada. Si no salió del teléfono, se descarta; si
     * ya subió, se da de baja en la nube (mientras nadie la haya dado por
     * conforme).
     */
    suspend fun quitarPagina(clientId: String) = withContext(Dispatchers.IO) {
        val envio = colaDao.porId(clientId)
        if (envio != null && envio.estado != pe.servicon.sigov.datos.local.EstadoEnvio.ENVIADO) {
            cola.descartar(clientId)
            File(carpeta(), "$clientId.webp").delete()
            return@withContext
        }
        cola.encolar(
            tabla = "rpc:quitar_pagina_documento",
            etiqueta = "Quitar foto de documento",
            cuerpo = buildJsonObject { put("p_client_id", clientId) },
        )
    }

    private fun leerEnderezada(archivo: File, lado: Int = 2200): Bitmap? {
        val medida = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
            BitmapFactory.decodeFile(archivo.absolutePath, this)
        }
        if (medida.outWidth <= 0) return null
        var escala = 1
        while (medida.outWidth / (escala * 2) >= lado || medida.outHeight / (escala * 2) >= lado) escala *= 2
        val mapa = BitmapFactory.decodeFile(archivo.absolutePath, BitmapFactory.Options().apply { inSampleSize = escala })
            ?: return null
        val giro = when (ExifInterface(archivo.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (giro == 0f) return mapa
        val girada = Bitmap.createBitmap(mapa, 0, 0, mapa.width, mapa.height, Matrix().apply { postRotate(giro) }, true)
        if (girada !== mapa) mapa.recycle()
        return girada
    }

    fun archivoTemporal(): File = File(carpeta(), "toma-" + System.currentTimeMillis() + ".jpg")

    private fun carpeta(): File = File(contexto.filesDir, "documentos").apply { mkdirs() }

    @Suppress("DEPRECATION")
    private fun formatoWebp(): Bitmap.CompressFormat =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY
        else Bitmap.CompressFormat.WEBP

    companion object {
        const val TABLA_COLA = "rpc:cargar_pagina_documento"
        private val ORDEN = listOf("reporte_diario", "ats", "charla", "checklist_vehicular", "higiene", "inspeccion_equipos", "otro")
    }
}

@Serializable
data class PaginaDeDocumento(
    val id: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("storage_path") val ruta: String,
    @SerialName("taken_at") val tomadaEn: String? = null,
)
