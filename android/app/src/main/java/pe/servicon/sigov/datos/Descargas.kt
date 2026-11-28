package pe.servicon.sigov.datos

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/**
 * Los archivos que genera SIGOV (PDF, Excel, ZIP, fotos) quedan en la
 * carpeta pública Descargas/SIGOV, visible desde «Archivos» o «Descargas»
 * del teléfono, y se pueden abrir o compartir desde ahí (ronda 5, TR-05:
 * un «Listo» sin archivo accesible no permite entregar ni comprobar).
 */
object Descargas {
    const val CARPETA = "SIGOV"

    data class Guardado(val uri: Uri, val nombre: String, val ruta: String, val mime: String)

    fun mimeDe(nombre: String, sugerido: String? = null): String {
        if (!sugerido.isNullOrBlank() && sugerido != "application/octet-stream") return sugerido
        val ext = nombre.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "xls" -> "application/vnd.ms-excel"
            "csv" -> "text/csv"
            "pdf" -> "application/pdf"
            "zip" -> "application/zip"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        }
    }

    /** Nombre sin caracteres que Android no admite en un archivo. */
    fun nombreSeguro(nombre: String): String =
        nombre.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]"), "_").trim().ifBlank { "SIGOV_archivo" }.take(120)

    /** Copia [origen] a Descargas/SIGOV y devuelve dónde quedó. */
    fun guardar(ctx: Context, origen: File, nombre: String, mimeSugerido: String? = null): Guardado {
        val limpio = nombreSeguro(nombre)
        val mime = mimeDe(limpio, mimeSugerido)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = ctx.contentResolver
            val valores = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, limpio)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + CARPETA)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores)
                ?: error("Android no permitió crear el archivo en Descargas")
            resolver.openOutputStream(uri)!!.use { salida -> origen.inputStream().use { it.copyTo(salida) } }
            valores.clear()
            valores.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, valores, null, null)
            // El nombre final puede llevar « (1)» si ya existía uno igual
            val final = resolver.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            } ?: limpio
            Guardado(uri, final, "Descargas/$CARPETA/$final", mime)
        } else {
            @Suppress("DEPRECATION")
            val carpeta = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), CARPETA).apply { mkdirs() }
            var destino = File(carpeta, limpio)
            var n = 1
            while (destino.exists()) {
                destino = File(carpeta, limpio.substringBeforeLast('.') + " ($n)." + limpio.substringAfterLast('.', "bin")); n++
            }
            origen.copyTo(destino)
            MediaScannerConnection.scanFile(ctx, arrayOf(destino.absolutePath), arrayOf(mime), null)
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", destino)
            Guardado(uri, destino.name, "Descargas/$CARPETA/${destino.name}", mime)
        }
    }

    /** Abre el archivo con la app que tenga el teléfono; si no hay ninguna, ofrece compartirlo. */
    fun abrir(ctx: Context, uri: Uri, mime: String, titulo: String = "Abrir con") {
        val ver = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { ctx.startActivity(Intent.createChooser(ver, titulo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            .onFailure { compartir(ctx, uri, mime, titulo) }
    }

    fun compartir(ctx: Context, uri: Uri, mime: String, titulo: String = "Compartir") {
        val envio = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, titulo)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        ctx.startActivity(Intent.createChooser(envio, titulo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
