package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage

/**
 * Una imagen a pantalla completa con zoom (Elvis, video del 12/10: «debería
 * poder hacerse también un zoom, pero cuando vuelvo a presionar se
 * minimiza»). Tocarla ya no la cierra: se cierra con la X. Pellizcar
 * amplía, dos toques alternan entre completa y ampliada, arrastrar mueve, y
 * los botones − / + hacen lo mismo para quien trabaja con guantes.
 */
@Composable
fun VisorConZoom(modelo: Any?, descripcion: String?, alCerrar: () -> Unit) {
    var escala by remember { mutableFloatStateOf(1f) }
    var dx by remember { mutableFloatStateOf(0f) }
    var dy by remember { mutableFloatStateOf(0f) }

    fun reencuadrar(nueva: Float) {
        escala = nueva.coerceIn(1f, 6f)
        if (escala == 1f) { dx = 0f; dy = 0f }
    }

    Dialog(onDismissRequest = alCerrar, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AsyncImage(
                model = modelo,
                contentDescription = descripcion,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(scaleX = escala, scaleY = escala, translationX = dx, translationY = dy)
                    // Los toques primero: el pellizco consume los eventos
                    .pointerInput(Unit) {
                        detectTapGestures(onDoubleTap = { reencuadrar(if (escala > 1.05f) 1f else 2.5f) })
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, arrastre, acercamiento, _ ->
                            reencuadrar(escala * acercamiento)
                            if (escala > 1f) { dx += arrastre.x; dy += arrastre.y }
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
            ) { Icon(Icons.Outlined.Close, contentDescription = "Cerrar", tint = Color.White) }

            Surface(
                color = Color.Black.copy(alpha = 0.55f),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(12.dp),
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
        }
    }
}
