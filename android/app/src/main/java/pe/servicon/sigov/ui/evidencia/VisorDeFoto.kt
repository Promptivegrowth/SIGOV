package pe.servicon.sigov.ui.evidencia

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import pe.servicon.sigov.datos.EvidenciaEnGaleria
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.ui.theme.Marca
import java.io.File

/**
 * La foto a pantalla completa, con zoom.
 *
 * En obra se revisa una foto para ver un detalle —una fisura, el número de un
 * poste, el sello— y sin acercar no se ve. Pellizcar amplía, dos toques
 * alternan entre completa y ampliada, y arrastrar mueve.
 */
@Composable
fun VisorDeFoto(foto: EvidenciaEnGaleria, alCerrar: () -> Unit) {
    var escala by remember { mutableFloatStateOf(1f) }
    var desplazamientoX by remember { mutableFloatStateOf(0f) }
    var desplazamientoY by remember { mutableFloatStateOf(0f) }

    fun reencuadrar(nueva: Float) {
        escala = nueva.coerceIn(1f, 6f)
        if (escala == 1f) {
            desplazamientoX = 0f
            desplazamientoY = 0f
        }
    }

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {

            AsyncImage(
                model = foto.rutaLocal?.let { File(it) } ?: foto.url,
                contentDescription = foto.actividad,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(
                        scaleX = escala,
                        scaleY = escala,
                        translationX = desplazamientoX,
                        translationY = desplazamientoY,
                    )
                    // El detector de toques va primero: el de pellizco consume
                    // los eventos y, detrás de él, el doble toque no llegaba.
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onDoubleTap = { reencuadrar(if (escala > 1.05f) 1f else 2.5f) },
                        )
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, arrastre, acercamiento, _ ->
                            reencuadrar(escala * acercamiento)
                            if (escala > 1f) {
                                desplazamientoX += arrastre.x
                                desplazamientoY += arrastre.y
                            }
                        }
                    },
            )

            IconButton(
                onClick = alCerrar,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(8.dp)
                    .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(24.dp)),
            ) {
                Icon(Icons.Outlined.Close, contentDescription = "Cerrar", tint = Color.White)
            }

            // Con guantes puestos el pellizco no siempre sale; los botones
            // hacen lo mismo y siempre responden.
            Surface(
                color = Color.Black.copy(alpha = 0.55f),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { reencuadrar(escala - 0.5f) }) {
                        Icon(Icons.Outlined.Remove, contentDescription = "Alejar", tint = Color.White)
                    }
                    Text(
                        "${(escala * 100).toInt()} %",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                        modifier = Modifier.widthIn(min = 56.dp),
                        textAlign = TextAlign.Center,
                    )
                    IconButton(onClick = { reencuadrar(escala + 0.5f) }) {
                        Icon(Icons.Outlined.Add, contentDescription = "Acercar", tint = Color.White)
                    }
                }
            }

            FichaDeLaFoto(
                foto = foto,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding(),
            )
        }
    }
}

/** El pie de la foto: lo que la vuelve sustento y no una imagen cualquiera. */
@Composable
private fun FichaDeLaFoto(foto: EvidenciaEnGaleria, modifier: Modifier = Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.62f))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            foto.actividad ?: "Evidencia",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
        )
        Text(
            detalleDe(foto).ifBlank { "Sin ubicación registrada" },
            style = MaterialTheme.typography.bodySmall,
            color = Color.White.copy(alpha = 0.8f),
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (foto.lat != null && foto.lng != null && foto.lat != 0.0) {
                Icon(
                    Icons.Outlined.GpsFixed,
                    contentDescription = null,
                    tint = Marca.Verde,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    "%.5f, %.5f".format(foto.lat, foto.lng) +
                        (foto.precision?.let { "  ±%.0f m".format(it) } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f),
                )
            } else {
                Text(
                    "Sin coordenadas",
                    style = MaterialTheme.typography.bodySmall,
                    color = Marca.Naranja,
                )
            }
        }

        Text(
            listOfNotNull(
                Fase.entries.firstOrNull { it.valor == foto.phase }?.etiqueta,
                foto.tomadaPor,
                foto.sha256?.take(12)?.let { "huella $it" },
            ).joinToString(" · "),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.55f),
        )
    }
}
