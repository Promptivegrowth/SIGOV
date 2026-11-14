package pe.servicon.sigov.ui.evidencia

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.exifinterface.media.ExifInterface
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pe.servicon.sigov.datos.FotosDeGaleria
import pe.servicon.sigov.datos.Peru
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Importar una foto de la galería (OBS 2, CASOS 9 y 10): la tomó otro
 * celular, llegó por WhatsApp o hace falta para subsanar. Se ve antes de
 * guardarla y se pregunta si lleva el sello SIGOV: una foto que ya trae su
 * propio sello (fecha, hora, progresiva) no recibe un segundo encima.
 *
 * El archivo temporal queda anotado en [FotosDeGaleria] con su origen, la
 * decisión del sello y la fecha original del archivo; quien guarda la
 * evidencia lo lee de ahí.
 *
 * [extra] permite elegir algo más antes de guardar (la etapa en PCI).
 */
@Composable
fun BotonDeGaleria(
    destino: () -> File,
    alElegir: (File) -> Unit,
    modifier: Modifier = Modifier,
    extra: (@Composable () -> Unit)? = null,
) {
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    var elegida by remember { mutableStateOf<Uri?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val selector = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> elegida = uri }

    IconButton(
        onClick = { selector.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        modifier = modifier.background(Color.Black.copy(alpha = 0.55f), CircleShape),
    ) {
        Icon(Icons.Outlined.PhotoLibrary, contentDescription = "Importar de la galería", tint = Color.White)
    }

    val uri = elegida ?: return
    fun importar(sellar: Boolean) {
        elegida = null
        alcance.launch {
            runCatching { copiar(contexto, uri, destino()) }
                .onSuccess { (archivo, fecha) ->
                    FotosDeGaleria.anotar(archivo, FotosDeGaleria.Datos(sellar = sellar, fechaOriginal = fecha))
                    alElegir(archivo)
                }
                .onFailure { error = "No se pudo leer la foto elegida." }
        }
    }
    AlertDialog(
        onDismissRequest = { elegida = null },
        title = { Text("Importar foto") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AsyncImage(
                    model = uri, contentDescription = "Foto elegida", contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp)
                        .background(Color.Black.copy(alpha = 0.06f), RoundedCornerShape(10.dp)),
                )
                extra?.invoke()
                Text("¿Desea aplicar el sello SIGOV de fecha y hora a esta fotografía?", style = MaterialTheme.typography.bodyMedium)
                Text(
                    "Si ya trae fecha, hora o progresiva, consérvala sin sello para no poner uno encima del otro.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { TextButton(onClick = { importar(true) }) { Text("Sí, aplicar sello SIGOV") } },
        dismissButton = { TextButton(onClick = { importar(false) }) { Text("No, conservar original") } },
    )
}

/** Copia la foto elegida a un archivo propio y lee su fecha original (EXIF). */
private suspend fun copiar(contexto: Context, uri: Uri, archivo: File): Pair<File, java.time.Instant?> = withContext(Dispatchers.IO) {
    contexto.contentResolver.openInputStream(uri)!!.use { entrada -> archivo.outputStream().use { entrada.copyTo(it) } }
    val fecha = runCatching {
        val exif = ExifInterface(archivo)
        val texto = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL) ?: exif.getAttribute(ExifInterface.TAG_DATETIME)
        texto?.let { LocalDateTime.parse(it, DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss")).atZone(Peru.zona).toInstant() }
    }.getOrNull()
    archivo to fecha
}
