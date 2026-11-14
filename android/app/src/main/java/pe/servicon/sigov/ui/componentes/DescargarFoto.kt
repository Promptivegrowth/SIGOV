package pe.servicon.sigov.ui.componentes

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL
import java.time.format.DateTimeFormatter

/**
 * Descargar la foto que se está viendo a la galería del teléfono
 * (Luigi, 14/11: «a veces se requiere», aparte de los paquetes y filtros).
 * Va a Imágenes/SIGOV, con el archivo tal como está en SIGOV (el sello
 * incluido). Desde Android 10 no pide permiso; antes, el de almacenamiento.
 */
@Composable
fun BotonDescargarFoto(modelo: Any?, modifier: Modifier = Modifier) {
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    var guardando by remember { mutableStateOf(false) }

    fun descargar() {
        val m = modelo ?: return
        guardando = true
        alcance.launch {
            val ok = runCatching { guardarEnGaleria(contexto, m) }.isSuccess
            guardando = false
            Toast.makeText(
                contexto,
                if (ok) "Foto guardada en la galería (Imágenes/SIGOV)" else "No se pudo guardar la foto. Revisa la señal e inténtalo de nuevo.",
                Toast.LENGTH_SHORT,
            ).show()
        }
    }
    val permiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
        if (concedido) descargar()
        else Toast.makeText(contexto, "Sin el permiso de almacenamiento no se puede guardar en la galería.", Toast.LENGTH_SHORT).show()
    }

    IconButton(
        onClick = {
            val falta = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(contexto, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
            if (falta) permiso.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE) else descargar()
        },
        enabled = modelo != null && !guardando,
        modifier = modifier.background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(24.dp)),
    ) {
        if (guardando) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Icon(Icons.Outlined.Download, contentDescription = "Descargar a la galería", tint = Color.White)
    }
}

/** Los bytes de la foto (archivo del teléfono, enlace de la nube o Uri) a la galería. */
private suspend fun guardarEnGaleria(contexto: Context, modelo: Any) = withContext(Dispatchers.IO) {
    val bytes = when (modelo) {
        is File -> modelo.readBytes()
        is Uri -> contexto.contentResolver.openInputStream(modelo)!!.use { it.readBytes() }
        is String -> if (modelo.startsWith("http")) URL(modelo).openStream().use { it.readBytes() } else File(modelo).readBytes()
        else -> error("formato no soportado")
    }
    val esJpg = bytes.size > 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte()
    val mime = if (esJpg) "image/jpeg" else "image/webp"
    val nombre = "SIGOV_" + pe.servicon.sigov.datos.Peru.ahora().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")) + if (esJpg) ".jpg" else ".webp"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val valores = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, nombre)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/SIGOV")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val resolver = contexto.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, valores) ?: error("sin destino")
        resolver.openOutputStream(uri)!!.use { it.write(bytes) }
        valores.clear()
        valores.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, valores, null, null)
    } else {
        @Suppress("DEPRECATION")
        val carpeta = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "SIGOV").apply { mkdirs() }
        val archivo = File(carpeta, nombre).apply { writeBytes(bytes) }
        android.media.MediaScannerConnection.scanFile(contexto, arrayOf(archivo.absolutePath), arrayOf(mime), null)
    }
}
