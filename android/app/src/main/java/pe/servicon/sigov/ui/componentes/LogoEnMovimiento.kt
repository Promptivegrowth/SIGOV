package pe.servicon.sigov.ui.componentes

import androidx.compose.animation.core.InfiniteTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.StartOffsetType
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.R

/**
 * El isotipo de Servicon, girando.
 *
 * Es la misma animación del panel web: el conjunto rota y cada una de las
 * tres figuras respira con un tercio de desfase, de modo que se lee un flujo
 * continuo y no tres cosas parpadeando. Las piezas son recortes del logotipo
 * oficial —separadas por color del mismo archivo que se entrega al cliente—,
 * así que al detenerse queda exactamente la marca.
 *
 * Se usa en el arranque de la aplicación y en cualquier espera larga: en
 * carretera, con mala señal, una pantalla quieta parece una aplicación
 * colgada.
 */
@Composable
fun LogoEnMovimiento(
    modifier: Modifier = Modifier,
    tamano: Dp = 96.dp,
) {
    val ciclo = rememberInfiniteTransition(label = "isotipo")

    val giro by ciclo.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "giro",
    )

    Box(modifier.size(tamano).rotate(giro)) {
        // El desfase es lo que crea el flujo: cada figura llega a su punto
        // más brillante un tercio de ciclo después que la anterior.
        Pieza(R.drawable.pieza_azul, ciclo, desfase = 0)
        Pieza(R.drawable.pieza_verde, ciclo, desfase = 600)
        Pieza(R.drawable.pieza_naranja, ciclo, desfase = 1200)
    }
}

private const val DURACION = 1800

@Composable
private fun Pieza(recurso: Int, ciclo: InfiniteTransition, desfase: Int) {
    val arranque = StartOffset(desfase, StartOffsetType.FastForward)

    // La opacidad no baja de 0.62: sobre el azul del arranque, una figura
    // más apagada que eso se vuelve turbia y el logotipo deja de leerse.
    val opacidad by ciclo.animateFloat(
        initialValue = 0.62f,
        targetValue = 0.62f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = DURACION
                0.62f at 0
                1f at 500
                0.78f at 1080
                0.62f at DURACION
            },
            initialStartOffset = arranque,
        ),
        label = "opacidad",
    )

    val escala by ciclo.animateFloat(
        initialValue = 0.95f,
        targetValue = 0.95f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = DURACION
                0.95f at 0
                1.04f at 500
                0.99f at 1080
                0.95f at DURACION
            },
            initialStartOffset = arranque,
        ),
        label = "escala",
    )

    Image(
        painter = painterResource(recurso),
        contentDescription = null,
        modifier = Modifier
            .fillMaxSize()
            .alpha(opacidad)
            .scale(escala),
    )
}
