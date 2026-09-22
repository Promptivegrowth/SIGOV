package pe.servicon.sigov.datos

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.EvidenciaLocal
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.local.ParteDao
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.time.Duration.Companion.hours
import javax.inject.Inject
import javax.inject.Singleton

/** Una foto tal como se busca después: por día, tramo y actividad. */
@Serializable
data class EvidenciaEnGaleria(
    val id: String,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("service_id") val servicioId: String,
    val phase: String = "general",
    @SerialName("storage_path") val ruta: String,
    @SerialName("taken_at") val tomadaEn: String,
    @SerialName("work_date") val fecha: String? = null,
    @SerialName("activity_name") val actividad: String? = null,
    @SerialName("section_name") val tramo: String? = null,
    @SerialName("progresiva_m") val progresiva: Double? = null,
    @SerialName("crew_id") val cuadrillaId: String? = null,
    @SerialName("crew_name") val cuadrilla: String? = null,
    val origen: String = "parte",
    @SerialName("pci_code") val pciCodigo: String? = null,
    val caption: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("accuracy_m") val precision: Double? = null,
    val watermarked: Boolean = true,
    val sha256: String? = null,
    @SerialName("created_by_name") val tomadaPor: String? = null,
) {
    /** Si la foto sigue en el equipo se muestra de ahí: no gasta datos. */
    var rutaLocal: String? = null
    var url: String? = null
}

/** El momento de la obra que retrata la foto. */
enum class Fase(val valor: String, val etiqueta: String) {
    ANTES("antes", "Antes"),
    DURANTE("durante", "Durante"),
    DESPUES("despues", "Después"),
    GENERAL("general", "General"),
}

/**
 * La evidencia fotográfica.
 *
 * Una foto vale como sustento cuando se sabe cuándo, dónde y de qué trabajo
 * es. Por eso, al guardarla, se le imprime encima el sello —fecha de Perú,
 * coordenadas, progresiva y actividad— y se calcula su huella SHA-256: si
 * después alguien la retoca, la huella deja de coincidir y se nota.
 *
 * La marca de agua es opcional porque hay formatos que se entregan con la
 * foto limpia; aun cuando no se imprime, el dato queda igual en la base.
 */
@Singleton
class EvidenciaRepositorio @Inject constructor(
    @ApplicationContext private val contexto: Context,
    private val supabase: SupabaseClient,
    private val partes: ParteDao,
    private val catalogo: CatalogoDao,
    private val cola: ColaRepositorio,
    private val ubicacion: Ubicacion,
) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun evidenciasDe(registroClientId: String) = partes.evidenciasDe(registroClientId)

    /** Dónde guarda la cámara la toma original, antes de sellarla. */
    fun archivoTemporal(): File =
        File(carpeta(), "toma-" + System.currentTimeMillis() + ".jpg")

    /**
     * Sella la toma y la deja lista para subir.
     *
     * Devuelve la evidencia ya guardada en el equipo: se ve al instante en el
     * parte, aunque el envío quede esperando señal.
     */
    suspend fun guardar(
        registro: RegistroLocal,
        original: File,
        fase: Fase,
        leyenda: String?,
        conMarcaDeAgua: Boolean,
        sello: Sello = Sello(),
        cuadrilla: String? = null,
        pciCodigo: String? = null,
    ): EvidenciaLocal = withContext(Dispatchers.IO) {
        val punto = ubicacion.actual()
        val tomadaEn = Instant.now()

        val mapa = leerEnderezada(original)
            ?: error("No se pudo leer la fotografía. Vuelve a tomarla.")
        val sellada = if (conMarcaDeAgua && sello.activo) {
            imprimirSello(mapa, registro, punto, tomadaEn, sello, cuadrilla, pciCodigo)
        } else {
            mapa
        }

        val clientId = UUID.randomUUID().toString()
        val destino = File(carpeta(), clientId + ".webp")
        destino.outputStream().use { salida -> sellada.compress(formatoWebp(), 82, salida) }
        if (sellada !== mapa) sellada.recycle()
        mapa.recycle()
        original.delete()

        val huella = MessageDigest.getInstance("SHA-256")
            .digest(destino.readBytes())
            .joinToString("") { "%02x".format(it) }

        val enLima = tomadaEn.atZone(Peru.zona)
        val ruta = registro.servicioId + "/" + enLima.year + "/" +
            "%02d".format(enLima.monthValue) + "/" + clientId + ".webp"

        val medidas = medir(destino)
        val evidencia = EvidenciaLocal(
            clientId = clientId,
            registroClientId = registro.clientId,
            servicioId = registro.servicioId,
            fase = fase.valor,
            rutaLocal = destino.absolutePath,
            rutaDestino = ruta,
            latitud = punto?.latitud ?: 0.0,
            longitud = punto?.longitud ?: 0.0,
            precision = punto?.precision ?: 0f,
            tomadaEn = tomadaEn.toEpochMilli(),
            sha256 = huella,
            conMarcaDeAgua = conMarcaDeAgua,
            progresiva = registro.progresivaInicio,
            leyenda = leyenda,
            ancho = medidas.outWidth,
            alto = medidas.outHeight,
            pesoBytes = destino.length(),
        )
        partes.guardarEvidencia(evidencia)

        cola.encolar(
            tabla = "evidences",
            clientId = clientId,
            // La foto espera a que su registro exista en la nube
            dependeDe = registro.clientId,
            etiqueta = "Foto · " + registro.actividadNombre,
            cuerpo = buildJsonObject {
                put("service_id", registro.servicioId)
                put("phase", fase.valor)
                put("storage_path", ruta)
                put("mime_type", "image/webp")
                put("size_bytes", evidencia.pesoBytes)
                put("width", evidencia.ancho)
                put("height", evidencia.alto)
                put("lat", punto?.latitud ?: 0.0)
                put("lng", punto?.longitud ?: 0.0)
                punto?.let { p ->
                    put("accuracy_m", p.precision.toDouble())
                    p.altitud?.let { put("altitude_m", it) }
                }
                registro.tramoId?.let { put("section_id", it) }
                registro.progresivaInicio?.let { put("progresiva_m", it) }
                // La foto de un levantamiento cuelga del ítem de PCI, no solo
                // del registro de campo: es ahí donde el cliente la busca y
                // donde se cuenta si falta la del «después».
                registro.pciItemId?.let { put("pci_item_id", it) }
                put("taken_at", DateTimeFormatter.ISO_INSTANT.format(tomadaEn.atOffset(ZoneOffset.UTC)))
                put("sha256", huella)
                put("watermarked", conMarcaDeAgua)
                put("device_model", (Build.MANUFACTURER + " " + Build.MODEL).take(90))
                leyenda?.takeIf { it.isNotBlank() }?.let { put("caption", it) }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )

        cola.adjuntar(
            clientId = clientId,
            bucket = "evidencias",
            rutaDestino = ruta,
            archivoLocal = destino,
            tipoMime = "image/webp",
        )

        evidencia
    }

    // ─── La galería ───────────────────────────────────────────────────────

    /**
     * Las fotos de la cuadrilla en un rango de fechas.
     *
     * Se prefiere el archivo que sigue en el equipo: mostrar la galería no
     * tiene por qué consumir el plan de datos del capataz. Solo lo que ya no
     * está en el teléfono se pide firmado a la nube.
     */
    suspend fun galeria(
        servicioId: String,
        cuadrillaId: String?,
        desde: String,
        hasta: String,
        fase: String? = null,
    ): List<EvidenciaEnGaleria> = withContext(Dispatchers.IO) {
        val fotos = runCatching {
            val filas = supabase.postgrest.from("v_evidences")
                .select {
                    filter {
                        eq("service_id", servicioId)
                        cuadrillaId?.let { eq("crew_id", it) }
                        gte("work_date", desde)
                        lte("work_date", hasta)
                        fase?.let { eq("phase", it) }
                    }
                    order("taken_at", Order.DESCENDING)
                    limit(500)
                }
                .decodeList<JsonObject>()
            espejarGaleria(servicioId, filas)
            filas.map { json.decodeFromString<EvidenciaEnGaleria>(it.toString()) }
        }.getOrElse {
            catalogo.de("evidencias_galeria", servicioId)
                .mapNotNull {
                    runCatching { json.decodeFromString<EvidenciaEnGaleria>(it.datos) }.getOrNull()
                }
                .filter { it.fecha == null || (it.fecha >= desde && it.fecha <= hasta) }
                .filter { cuadrillaId == null || it.cuadrillaId == cuadrillaId }
                .filter { fase == null || it.phase == fase }
                .sortedByDescending { it.tomadaEn }
        }

        // Lo que todavía está en el equipo se muestra desde ahí
        val enElEquipo = carpeta().listFiles()
            ?.associateBy { it.nameWithoutExtension }
            .orEmpty()
        fotos.forEach { foto ->
            foto.rutaLocal = foto.clientId?.let { enElEquipo[it]?.absolutePath }
        }

        val porFirmar = fotos.filter { it.rutaLocal == null }.map { it.ruta }.distinct()
        if (porFirmar.isNotEmpty()) {
            runCatching {
                val firmadas = supabase.storage.from("evidencias")
                    .createSignedUrls(1.hours, porFirmar)
                    .associate { it.path to completar(it.signedURL) }
                fotos.forEach { foto ->
                    if (foto.rutaLocal == null) foto.url = firmadas[foto.ruta]
                }
            }
        }
        fotos
    }

    /**
     * Supabase devuelve la url firmada como ruta relativa; el visor necesita
     * la dirección completa.
     */
    private fun completar(firmada: String): String =
        if (firmada.startsWith("http")) firmada
        else supabase.supabaseHttpUrl.trimEnd('/') + "/storage/v1/" + firmada.trimStart('/')

    private suspend fun espejarGaleria(servicioId: String, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(
                tabla = "evidencias_galeria",
                id = id,
                servicioId = servicioId,
                datos = fila.toString(),
            )
        }
        catalogo.guardar(vigentes)
        if (vigentes.isNotEmpty()) {
            catalogo.borrarLosQueYaNoEstan("evidencias_galeria", vigentes.map { it.id })
        }
    }

    // ─── El sello ─────────────────────────────────────────────────────────

    /**
     * Imprime el sello sobre la foto: una franja al pie, legible bajo el sol,
     * con lo que hace falta para sustentar la partida.
     */
    private fun imprimirSello(
        foto: Bitmap,
        registro: RegistroLocal,
        punto: Punto?,
        tomadaEn: Instant,
        sello: Sello,
        cuadrilla: String?,
        pciCodigo: String?,
    ): Bitmap {
        val lienzoMapa = foto.copy(Bitmap.Config.ARGB_8888, true) ?: return foto
        val lienzo = Canvas(lienzoMapa)
        val ancho = lienzoMapa.width
        val alto = lienzoMapa.height

        // El tamaño del texto va con la foto, no con el equipo
        val cuerpo = (ancho * 0.026f).coerceIn(18f, 60f)
        val margen = ancho * 0.028f
        val interlinea = cuerpo * 1.42f

        // Cada línea entra solo si el contrato la pide: hay clientes que
        // exigen la foto limpia y otros que la rechazan sin coordenadas.
        val cuando = tomadaEn.atZone(Peru.zona).toLocalDateTime()
        val lugar = listOfNotNull(
            registro.tramoNombre.takeIf { sello.tramo },
            Progresiva.rango(registro.progresivaInicio, registro.progresivaFin)
                .takeIf { sello.progresiva },
        ).joinToString(" · ")

        val lineas = listOfNotNull(
            when {
                sello.fecha && sello.hora -> Peru.sello(cuando)
                sello.fecha -> Peru.fechaLarga(cuando.toLocalDate())
                sello.hora -> "%02d:%02d".format(cuando.hour, cuando.minute)
                else -> null
            },
            if (!sello.geo) null else if (punto != null) {
                "%.6f, %.6f  ±%.0f m".format(punto.latitud, punto.longitud, punto.precision)
            } else {
                "Sin señal de GPS al momento de la toma"
            },
            lugar.ifBlank { null },
            listOfNotNull(
                pciCodigo?.takeIf { sello.pci },
                registro.actividadNombre.takeIf { sello.actividad },
            ).joinToString(" · ").ifBlank { null },
            cuadrilla?.takeIf { sello.cuadrilla },
        )

        // Sin nada que imprimir no se pinta la franja: taparía la foto para
        // no decir nada.
        if (lineas.isEmpty() && !sello.marca) return lienzoMapa

        val franja = interlinea * lineas.size + margen * 1.5f
        lienzo.drawRect(
            0f, alto - franja, ancho.toFloat(), alto.toFloat(),
            Paint().apply { color = Color.argb(168, 0, 0, 0) },
        )

        // Una banda verde de marca: identifica la foto de un vistazo
        lienzo.drawRect(
            0f, alto - franja, ancho * 0.012f, alto.toFloat(),
            Paint().apply { color = Color.rgb(0x6B, 0xB4, 0x3B) },
        )

        val texto = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = cuerpo
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            setShadowLayer(cuerpo * 0.18f, 0f, 1f, Color.argb(200, 0, 0, 0))
        }
        val destacado = Paint(texto).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }

        var y = alto - franja + margen + cuerpo
        lineas.forEachIndexed { i, linea ->
            lienzo.drawText(linea, margen, y, if (i == 0) destacado else texto)
            y += interlinea
        }

        // La firma de quien responde por la foto
        val marca = "SERVICON · SIGOV"
        if (sello.marca) lienzo.drawText(
            marca,
            ancho - margen - destacado.measureText(marca),
            alto - margen * 0.6f,
            Paint(destacado).apply { color = Color.rgb(0x6B, 0xB4, 0x3B) },
        )

        return lienzoMapa
    }

    // ─── Lectura del archivo ──────────────────────────────────────────────

    /**
     * Lee la toma girándola como se vio en pantalla y bajándola a un tamaño
     * razonable: 1600 px de lado mayor sustentan de sobra y no revientan el
     * plan de datos del capataz.
     */
    private fun leerEnderezada(archivo: File, lado: Int = 1600): Bitmap? {
        val medida = medir(archivo)
        if (medida.outWidth <= 0) return null

        var escala = 1
        while (medida.outWidth / (escala * 2) >= lado || medida.outHeight / (escala * 2) >= lado) {
            escala *= 2
        }

        val mapa = BitmapFactory.decodeFile(
            archivo.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = escala },
        ) ?: return null

        val giro = when (
            ExifInterface(archivo.absolutePath)
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        ) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (giro == 0f) return mapa

        val girada = Bitmap.createBitmap(
            mapa, 0, 0, mapa.width, mapa.height,
            Matrix().apply { postRotate(giro) }, true,
        )
        if (girada !== mapa) mapa.recycle()
        return girada
    }

    private fun carpeta(): File = File(contexto.filesDir, "evidencias").apply { mkdirs() }

    @Suppress("DEPRECATION")
    private fun formatoWebp(): Bitmap.CompressFormat =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY
        else Bitmap.CompressFormat.WEBP

    private fun medir(archivo: File) = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
        BitmapFactory.decodeFile(archivo.absolutePath, this)
    }
}
