package pe.servicon.sigov.datos

import pe.servicon.sigov.datos.local.EstadoEnvio
import kotlinx.serialization.json.jsonObject
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
    @SerialName("activity_id") val actividadId: String? = null,
    @SerialName("pci_item_number") val pciItem: Int? = null,
    val side: String? = null,
    /** Si COVINCA la observó. */
    val revision: String? = null,
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
        /**
         * La fecha y hora que se imprimen, si el capataz las editó antes de
         * la toma (Elvis: el PCI vencía hoy y se terminó mañana temprano).
         * La hora real de la toma se guarda igual, aparte.
         */
        momentoDelSello: Instant? = null,
        /**
         * Foto de intervención sobre un elemento del inventario: el elemento
         * y su estado (ok u observado). No cuelga de ningún registro del
         * parte: va sola y la nube la engancha al elemento.
         */
        activo: Pair<String, String>? = null,
        /** Foto de una observación de campo: espera a que la observación suba. */
        observacion: String? = null,
    ): EvidenciaLocal = withContext(Dispatchers.IO) {
        val punto = ubicacion.actual()
        val tomadaEn = Instant.now()
        val delSello = momentoDelSello ?: tomadaEn

        val clientId = UUID.randomUUID().toString()
        val destino = File(carpeta(), clientId + ".webp")
        val sellar = conMarcaDeAgua && sello.activo

        // OBS-23: primero el original JPG 4080 × 3060 que pide COVINCA, ya
        // sellado; el WebP liviano sale de él, así el sello es el mismo en
        // los dos. Si el equipo no da para una imagen tan grande (memoria),
        // se sigue como antes: sin original, pero sin perder la foto.
        val archivoOriginal = File(carpeta(), "$clientId-original.jpg")
        val conOriginal = runCatching {
            // Una toma chica no se amplía a 4080: sería inventar detalle
            val medidaToma = medir(original)
            if (maxOf(medidaToma.outWidth, medidaToma.outHeight) < LADO_MINIMO_ORIGINAL) error("toma chica")
            val grande = leerEnderezada(original, LADO_ORIGINAL) ?: error("sin lectura")
            val maestro = aCuatroTercios(grande)
            if (maestro !== grande) grande.recycle()
            val selladoGrande = if (sellar) {
                imprimirSello(maestro, registro, punto, delSello, sello.conFechaYHora(), cuadrilla, pciCodigo)
            } else maestro
            archivoOriginal.outputStream().use { selladoGrande.compress(Bitmap.CompressFormat.JPEG, CALIDAD_ORIGINAL, it) }
            val liviano = reducir(selladoGrande, 1600)
            destino.outputStream().use { salida -> liviano.compress(formatoWebp(), 82, salida) }
            if (liviano !== selladoGrande) liviano.recycle()
            if (selladoGrande !== maestro) selladoGrande.recycle()
            maestro.recycle()
            true
        }.getOrElse { fallo ->
            if (fallo is OutOfMemoryError) System.gc()
            archivoOriginal.delete()
            false
        }

        if (!conOriginal) {
            val mapa = leerEnderezada(original)
                ?: error("No se pudo leer la fotografía. Vuelve a tomarla.")
            val sellada = if (sellar) {
                imprimirSello(mapa, registro, punto, delSello, sello.conFechaYHora(), cuadrilla, pciCodigo)
            } else {
                mapa
            }
            destino.outputStream().use { salida -> sellada.compress(formatoWebp(), 82, salida) }
            if (sellada !== mapa) sellada.recycle()
            mapa.recycle()
        }
        original.delete()

        // Lo que no se imprime viaja dentro del archivo: coordenadas, fecha
        // real y de qué trabajo es (OBS-18). Antes de la huella, para que la
        // huella cubra también estos datos.
        escribirMetadatos(destino, registro, punto, tomadaEn, delSello, fase, cuadrilla, pciCodigo)
        if (conOriginal) {
            escribirMetadatos(archivoOriginal, registro, punto, tomadaEn, delSello, fase, cuadrilla, pciCodigo)
        }

        val huella = MessageDigest.getInstance("SHA-256")
            .digest(destino.readBytes())
            .joinToString("") { "%02x".format(it) }

        val enLima = tomadaEn.atZone(Peru.zona)
        val ruta = registro.servicioId + "/" + enLima.year + "/" +
            "%02d".format(enLima.monthValue) + "/" + clientId + ".webp"

        val medidas = medir(destino)
        val evidencia = EvidenciaLocal(
            clientId = clientId,
            registroClientId = if (activo != null || observacion != null) null else registro.clientId,
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
            dependeDe = when {
                observacion != null -> observacion
                activo != null -> null
                else -> registro.clientId
            },
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
                activo?.let { (activoId, estado) ->
                    put("asset_id", activoId)
                    put("estado_activo", estado)
                }
                put("taken_at", DateTimeFormatter.ISO_INSTANT.format(tomadaEn.atOffset(ZoneOffset.UTC)))
                momentoDelSello?.let {
                    put("stamped_at", DateTimeFormatter.ISO_INSTANT.format(it.atOffset(ZoneOffset.UTC)))
                }
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

        if (conOriginal) encolarOriginal(clientId, registro.servicioId, tomadaEn, archivoOriginal)

        evidencia
    }

    /**
     * La foto de intervención de un elemento del inventario (boceto de Elvis
     * del 14/10): se sella como cualquier evidencia, con el nombre y la
     * progresiva del elemento, el comentario y el estado OK u Observado. No
     * reemplaza la foto base: se agrega al historial del elemento.
     */
    suspend fun guardarDeActivo(
        servicioId: String,
        activoId: String,
        nombre: String,
        tramoId: String?,
        tramo: String?,
        progresiva: Double?,
        lado: String?,
        original: File,
        estado: String,
        comentario: String?,
        cuadrilla: String?,
        sello: Sello,
    ): EvidenciaLocal {
        // Un registro de mentira, solo para el sello y los metadatos: no se
        // guarda ni se envía
        val registro = RegistroLocal(
            clientId = UUID.randomUUID().toString(),
            parteClientId = "",
            servicioId = servicioId,
            actividadId = "",
            actividadNombre = nombre,
            tramoId = tramoId,
            tramoNombre = tramo,
            progresivaInicio = progresiva,
            progresivaFin = null,
            lado = lado ?: "derecho",
            cantidad = 0.0,
            unidad = null,
            origen = "inventario",
        )
        return guardar(
            registro = registro,
            original = original,
            fase = Fase.GENERAL,
            leyenda = comentario,
            conMarcaDeAgua = true,
            sello = sello,
            cuadrilla = cuadrilla,
            activo = activoId to estado,
        )
    }

    /**
     * El original viaja aparte y después de la foto: primero sube el archivo
     * y luego se registra en la nube. Por omisión espera a tener Wi-Fi (son
     * unos 3 MB por foto); en Configuración se puede permitir con datos.
     */
    private suspend fun encolarOriginal(clientId: String, servicioId: String, tomadaEn: Instant, archivo: File) {
        val enLima = tomadaEn.atZone(Peru.zona)
        val ruta = servicioId + "/originales/" + enLima.year + "/" +
            "%02d".format(enLima.monthValue) + "/" + clientId + ".jpg"
        val medidas = medir(archivo)
        val huella = MessageDigest.getInstance("SHA-256")
            .digest(archivo.readBytes())
            .joinToString("") { "%02x".format(it) }
        val idOriginal = "$clientId-original"
        cola.encolar(
            tabla = TABLA_ORIGINAL,
            clientId = idOriginal,
            dependeDe = clientId,
            etiqueta = "Original de la foto · ${medidas.outWidth}×${medidas.outHeight}",
            cuerpo = buildJsonObject {
                put("p_client_id", clientId)
                put("p_path", ruta)
                put("p_width", medidas.outWidth)
                put("p_height", medidas.outHeight)
                put("p_bytes", archivo.length())
                put("p_sha256", huella)
            },
        )
        cola.adjuntar(
            clientId = idOriginal,
            bucket = "evidencias",
            rutaDestino = ruta,
            archivoLocal = archivo,
            tipoMime = "image/jpeg",
        )
    }

    /**
     * Elimina una foto mal tomada (OBS-21).
     *
     * Si todavía no salió del teléfono, basta con descartarla: nunca existió
     * para nadie más. Si ya está en la nube, se da de baja allá —se vuelve a
     * enviar con la misma llave y la fecha de baja— y queda en la auditoría.
     * La base no deja dar de baja la foto de un ítem PCI ya validado.
     */
    suspend fun eliminar(foto: EvidenciaLocal) = withContext(Dispatchers.IO) {
        val envio = cola.envio(foto.clientId)
        if (envio != null && envio.estado != EstadoEnvio.ENVIADO) {
            cola.descartar(foto.clientId)
        } else {
            // Ya en la nube: se pide a la base que la dé de baja; ella
            // comprueba que sea de quien la tomó y que nadie la validó
            cola.encolar(
                tabla = "rpc:dar_de_baja_evidencia",
                etiqueta = "Foto eliminada",
                cuerpo = buildJsonObject { put("p_client_id", foto.clientId) },
            )
        }
        // Su original, si todavía no salió, ya no tiene a qué foto pegarse
        val idOriginal = foto.clientId + "-original"
        cola.envio(idOriginal)?.takeIf { it.estado != EstadoEnvio.ENVIADO }?.let { cola.descartar(idOriginal) }
        runCatching { File(carpeta(), idOriginal + ".jpg").delete() }
        partes.borrarEvidencia(foto.clientId)
        runCatching { File(foto.rutaLocal).delete() }
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
                        // Las de la programación y las de sus PCI (no las del inventario)
                        isIn("origen", listOf("parte", "pci"))
                    }
                    order("taken_at", Order.DESCENDING)
                    limit(1000)
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

        // Y lo que ni siquiera ha subido todavía. Sin esto el capataz
        // fotografía sin señal, entra a «Fotos» y no encuentra su foto:
        // solo aparecería cuando el equipo recupere cobertura, que es
        // justo cuando ya dejó de mirarla.
        val yaListadas = fotos.mapNotNull { it.clientId }.toSet()
        val enCola = partes.evidenciasEnElEquipo(servicioId)
            .filter { it.clientId !in yaListadas }
            .filter { it.fecha == null || (it.fecha >= desde && it.fecha <= hasta) }
            .filter { fase == null || it.fase == fase }
            .map { local ->
                EvidenciaEnGaleria(
                    id = local.clientId,
                    clientId = local.clientId,
                    servicioId = local.servicioId,
                    phase = local.fase,
                    ruta = local.rutaDestino,
                    tomadaEn = Instant.ofEpochMilli(local.tomadaEn).toString(),
                    fecha = local.fecha,
                    actividad = local.actividad,
                    tramo = local.tramo,
                    progresiva = local.progresiva,
                    cuadrillaId = cuadrillaId,
                    pciCodigo = local.pciCodigo,
                    caption = local.leyenda,
                    lat = local.latitud.takeIf { it != 0.0 },
                    lng = local.longitud.takeIf { it != 0.0 },
                    precision = local.precision.toDouble().takeIf { it > 0 },
                    watermarked = local.conMarcaDeAgua,
                    // Sin sha256: la miniatura lo usa para marcar «sin subir»
                    sha256 = null,
                ).also { it.rutaLocal = local.rutaLocal }
            }

        val todas = (fotos + enCola).sortedByDescending { it.tomadaEn }

        val porFirmar = todas.filter { it.rutaLocal == null }.map { it.ruta }.distinct()
        if (porFirmar.isNotEmpty()) {
            runCatching {
                val firmadas = supabase.storage.from("evidencias")
                    .createSignedUrls(1.hours, porFirmar)
                    .associate { it.path to completar(it.signedURL) }
                todas.forEach { foto ->
                    if (foto.rutaLocal == null) foto.url = firmadas[foto.ruta]
                }
            }
        }
        todas
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
     * Imprime el sello sobre la foto, abajo a la derecha, como lo llevan hoy
     * las fotos de las cuadrillas (Elvis lo mostró en la reunión): fecha y
     * hora, y encima solo lo que se haya prendido en la configuración. Sin
     * franja que tape la foto: letras blancas con borde oscuro, que se leen
     * igual sobre asfalto que sobre cielo.
     */
    private fun imprimirSello(
        foto: Bitmap,
        registro: RegistroLocal,
        punto: Punto?,
        momento: Instant,
        sello: Sello,
        cuadrilla: String?,
        pciCodigo: String?,
    ): Bitmap {
        val lienzoMapa = foto.copy(Bitmap.Config.ARGB_8888, true) ?: return foto
        val lienzo = Canvas(lienzoMapa)
        val ancho = lienzoMapa.width
        val alto = lienzoMapa.height

        // El tamaño del texto va con la foto, no con el equipo
        val lado = minOf(ancho, alto).toFloat()
        val grande = (lado * 0.050f).coerceIn(22f, 240f)
        val chico = grande * 0.62f
        val margen = lado * 0.035f

        val cuando = momento.atZone(Peru.zona).toLocalDateTime()
        val lugar = listOfNotNull(
            registro.tramoNombre.takeIf { sello.tramo },
            Progresiva.rango(registro.progresivaInicio, registro.progresivaFin)
                .takeIf { sello.progresiva },
        ).joinToString(" · ")

        // De arriba abajo; la fecha y la hora cierran el bloque, al pie
        val extras = listOfNotNull(
            "SERVICON · SIGOV".takeIf { sello.marca },
            cuadrilla?.takeIf { sello.cuadrilla },
            listOfNotNull(
                pciCodigo?.takeIf { sello.pci },
                registro.actividadNombre.takeIf { sello.actividad },
            ).joinToString(" · ").ifBlank { null },
            lugar.ifBlank { null },
            if (!sello.geo) null else if (punto != null) {
                "%.6f, %.6f".format(java.util.Locale.US, punto.latitud, punto.longitud) +
                    (if (sello.precision) "  ±%.0f m".format(punto.precision) else "")
            } else {
                "Sin señal de GPS"
            },
        )
        val fechaHora = when {
            sello.fecha && sello.hora -> Peru.sello(cuando)
            sello.fecha -> Peru.selloFecha(cuando.toLocalDate())
            sello.hora -> "%02d:%02d".format(cuando.hour, cuando.minute)
            else -> null
        }

        fun pinceles(tam: Float, negrita: Boolean): Pair<Paint, Paint> {
            val letra = Typeface.create(Typeface.SANS_SERIF, if (negrita) Typeface.BOLD else Typeface.NORMAL)
            val borde = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = tam; typeface = letra; color = Color.argb(220, 0, 0, 0)
                style = Paint.Style.STROKE; strokeWidth = tam * 0.14f; strokeJoin = Paint.Join.ROUND
            }
            val relleno = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = tam; typeface = letra; color = Color.WHITE
                setShadowLayer(tam * 0.10f, 0f, tam * 0.04f, Color.argb(160, 0, 0, 0))
            }
            return borde to relleno
        }

        var y = alto - margen
        fun escribir(texto: String, tam: Float, negrita: Boolean) {
            val (borde, relleno) = pinceles(tam, negrita)
            val x = ancho - margen - relleno.measureText(texto)
            lienzo.drawText(texto, x, y, borde)
            lienzo.drawText(texto, x, y, relleno)
            y -= tam * 1.30f
        }

        fechaHora?.let { escribir(it, grande, true) }
        extras.asReversed().forEach { escribir(it, chico, false) }
        return lienzoMapa
    }

    /**
     * Los datos de la foto dentro del archivo (EXIF): coordenadas, fecha y
     * hora reales, la del sello si se editó, y de qué trabajo es. Así la
     * georreferenciación acompaña a la foto aunque no vaya impresa, y quien
     * la abra fuera de SIGOV la puede consultar.
     */
    private fun escribirMetadatos(
        archivo: File,
        registro: RegistroLocal,
        punto: Punto?,
        tomadaEn: Instant,
        delSello: Instant,
        fase: Fase,
        cuadrilla: String?,
        pciCodigo: String?,
    ) {
        runCatching {
            val exif = ExifInterface(archivo.absolutePath)
            val formato = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss")
            val real = tomadaEn.atZone(Peru.zona)
            exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, real.format(formato))
            exif.setAttribute(ExifInterface.TAG_OFFSET_TIME_ORIGINAL, "-05:00")
            exif.setAttribute(ExifInterface.TAG_DATETIME, delSello.atZone(Peru.zona).format(formato))
            exif.setAttribute(ExifInterface.TAG_OFFSET_TIME, "-05:00")
            punto?.let {
                exif.setLatLong(it.latitud, it.longitud)
                it.altitud?.let { alt -> exif.setAltitude(alt) }
                exif.setAttribute(ExifInterface.TAG_GPS_H_POSITIONING_ERROR, "%d/1".format(it.precision.toInt().coerceAtLeast(0)))
            }
            exif.setAttribute(ExifInterface.TAG_MAKE, Build.MANUFACTURER.take(60))
            exif.setAttribute(ExifInterface.TAG_MODEL, Build.MODEL.take(60))
            exif.setAttribute(ExifInterface.TAG_SOFTWARE, "SIGOV - Grupo Servicon")
            exif.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
            val medidas = medir(archivo)
            exif.setAttribute(ExifInterface.TAG_IMAGE_WIDTH, medidas.outWidth.toString())
            exif.setAttribute(ExifInterface.TAG_IMAGE_LENGTH, medidas.outHeight.toString())
            exif.setAttribute(
                ExifInterface.TAG_IMAGE_DESCRIPTION,
                // EXIF solo admite ASCII: sin tildes ni signos, o salen «?»
                enAscii(listOfNotNull(
                    registro.actividadNombre,
                    registro.tramoNombre,
                    Progresiva.rango(registro.progresivaInicio, registro.progresivaFin),
                    Lados.codigo(registro.lado)?.let { "lado $it" },
                    pciCodigo,
                    cuadrilla,
                    fase.etiqueta,
                    if (delSello != tomadaEn) "sello " + Peru.sello(delSello.atZone(Peru.zona).toLocalDateTime()) else null,
                ).joinToString(" | ")).take(500),
            )
            exif.saveAttributes()
        }
    }

    private fun enAscii(texto: String): String =
        java.text.Normalizer.normalize(texto, java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace('–', '-').replace('—', '-').replace('·', '-').replace("→", "a")
            .replace('ñ', 'n').replace('Ñ', 'N')
            .filter { it.code in 32..126 }

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

    /**
     * Lleva la toma a 4080 × 3060 (4:3, la medida de las fotos que COVINCA ya
     * acepta; ejemplos de Elvis del 13/10). Se recorta al centro si no es 4:3
     * y se escala en un solo paso. Las fotos son siempre horizontales.
     */
    private fun aCuatroTercios(foto: Bitmap): Bitmap {
        val horizontal = foto.width >= foto.height
        val (anchoMeta, altoMeta) = if (horizontal) 4080 to 3060 else 3060 to 4080
        val proporcion = anchoMeta.toFloat() / altoMeta
        var w = foto.width
        var h = (w / proporcion).toInt()
        if (h > foto.height) { h = foto.height; w = (h * proporcion).toInt() }
        val x = (foto.width - w) / 2
        val y = (foto.height - h) / 2
        if (w == anchoMeta && h == altoMeta && x == 0 && y == 0) return foto
        val escala = Matrix().apply { setScale(anchoMeta.toFloat() / w, altoMeta.toFloat() / h) }
        return Bitmap.createBitmap(foto, x, y, w, h, escala, true)
    }

    /** La misma imagen con [lado] px en su lado mayor (para el WebP liviano). */
    private fun reducir(foto: Bitmap, lado: Int): Bitmap {
        val mayor = maxOf(foto.width, foto.height)
        if (mayor <= lado) return foto
        val f = lado.toFloat() / mayor
        return Bitmap.createScaledBitmap(foto, (foto.width * f).toInt(), (foto.height * f).toInt(), true)
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

/** La acción de la cola que registra el original de una foto en la nube. */
const val TABLA_ORIGINAL = "rpc:fijar_original_evidencia"

/** El original se lee hasta este lado mayor antes de llevarlo a 4080 × 3060. */
private const val LADO_ORIGINAL = 4080

/** JPG de entrega: calidad alta sin llegar a pesar como un RAW. */
private const val CALIDAD_ORIGINAL = 88

/** Desde este lado mayor la toma sostiene un original 4080 × 3060. */
private const val LADO_MINIMO_ORIGINAL = 2400
