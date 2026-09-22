package pe.servicon.sigov.ui.charlas

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp

/**
 * La pizarra de firma.
 *
 * Se firma con el dedo sobre el celular, de pie y apoyado en el capó. El
 * trazo se guarda tal cual: es lo que el auditor mira para confirmar que la
 * persona estuvo, y por eso no se suaviza ni se corrige.
 */
@Composable
fun PizarraDeFirma(
    modifier: Modifier = Modifier,
    alCambiar: (hayTrazo: Boolean) -> Unit = {},
    control: ControlDeFirma,
) {
    val trazos = control.trazos
    var actual by remember { mutableStateOf<MutableList<Offset>?>(null) }
    // Leer la versión aquí hace que todo el bloque se recomponga al trazar:
    // si no, el texto guía se queda encima de la firma.
    val hayTrazo = control.version >= 0 && trazos.isNotEmpty()

    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(190.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { inicio ->
                            actual = mutableListOf(inicio)
                            trazos.add(actual!!)
                        },
                        onDrag = { cambio, _ ->
                            cambio.consume()
                            actual?.add(cambio.position)
                            control.version++
                            alCambiar(true)
                        },
                        onDragEnd = { actual = null },
                        onDragCancel = { actual = null },
                    )
                },
        ) {
            Canvas(Modifier.fillMaxSize()) {
                // La versión se lee AQUÍ DENTRO: los trazos son listas que
                // mutan en sitio, así que si el dibujo no observa un estado
                // propio, Compose no vuelve a pintarlo y la firma no aparece.
                @Suppress("UNUSED_EXPRESSION") control.version
                control.medida = size
                trazos.forEach { puntos ->
                    if (puntos.size < 2) return@forEach
                    val camino = Path().apply {
                        moveTo(puntos.first().x, puntos.first().y)
                        puntos.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                    drawPath(
                        camino,
                        color = Color(0xFF0F172A),
                        style = Stroke(width = 4.5f, cap = StrokeCap.Round, join = StrokeJoin.Round),
                    )
                }
            }

            if (!hayTrazo) {
                Text(
                    "Firma aquí con el dedo",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF94A3B8),
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        }

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(
                onClick = {
                    trazos.clear()
                    control.version++
                    alCambiar(false)
                },
            ) { Text("Borrar") }
        }
    }
}

/**
 * Lo que la pizarra dibuja y lo que sabe convertir a imagen.
 *
 * Vive fuera del composable para que el diálogo pueda pedir el mapa de bits
 * al guardar sin depender de que la pizarra siga en pantalla.
 */
class ControlDeFirma {
    val trazos = mutableListOf<MutableList<Offset>>()
    var version by mutableIntStateOf(0)
    var medida: androidx.compose.ui.geometry.Size = androidx.compose.ui.geometry.Size.Zero

    val hayTrazo: Boolean get() = trazos.any { it.size > 1 }

    fun limpiar() {
        trazos.clear()
        version++
    }

    /**
     * Convierte el trazo a PNG con fondo transparente, para que se pueda
     * poner encima del acta sin un recuadro blanco alrededor.
     */
    fun aMapaDeBits(ancho: Int = 900, alto: Int = 380): Bitmap? {
        if (!hayTrazo || medida.width <= 0f || medida.height <= 0f) return null

        val mapa = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888)
        val lienzo = android.graphics.Canvas(mapa)
        val pincel = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(0x0F, 0x17, 0x2A)
            style = android.graphics.Paint.Style.STROKE
            strokeWidth = ancho * 0.006f
            strokeCap = android.graphics.Paint.Cap.ROUND
            strokeJoin = android.graphics.Paint.Join.ROUND
        }

        val escalaX = ancho / medida.width
        val escalaY = alto / medida.height

        trazos.forEach { puntos ->
            if (puntos.size < 2) return@forEach
            val camino = android.graphics.Path().apply {
                moveTo(puntos.first().x * escalaX, puntos.first().y * escalaY)
                puntos.drop(1).forEach { lineTo(it.x * escalaX, it.y * escalaY) }
            }
            lienzo.drawPath(camino, pincel)
        }
        return mapa
    }
}

@Composable
fun recordarControlDeFirma(): ControlDeFirma = remember { ControlDeFirma() }
