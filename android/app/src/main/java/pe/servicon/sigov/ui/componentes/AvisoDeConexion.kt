package pe.servicon.sigov.ui.componentes

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import pe.servicon.sigov.datos.Conexion
import pe.servicon.sigov.datos.sync.ColaRepositorio
import javax.inject.Inject

/** Lo que hay que decirle a quien está trabajando: si hay señal y qué falta enviar. */
data class EstadoDeEnlace(
    val hayRed: Boolean = true,
    val pendientes: Int = 0,
)

@HiltViewModel
class ConexionViewModel @Inject constructor(
    conexion: Conexion,
    cola: ColaRepositorio,
) : ViewModel() {

    val enlace: StateFlow<EstadoDeEnlace> =
        combine(conexion.hay, cola.pendientes) { red, pendientes ->
            EstadoDeEnlace(hayRed = red, pendientes = pendientes)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EstadoDeEnlace())
}

/**
 * La franja que avisa que se está trabajando sin señal.
 *
 * Elvis lo contó de campo: «se ha salido el aplicativo y no había
 * internet». Parte del problema era que la sesión se caía —eso se corrigió
 * en el repositorio de sesión—, pero la otra parte era que la aplicación no
 * decía nada. Sin señal, refrescar no traía nada nuevo y el supervisor no
 * tenía forma de distinguir «la vía no tiene cobertura» de «esto se colgó».
 *
 * Aparece sola cuando se cae la red y se va sola cuando vuelve. Mientras
 * está, dice lo único que importa: que puede seguir registrando y que lo
 * registrado se va a enviar cuando haya por dónde.
 */
@Composable
fun AvisoDeConexion(
    modifier: Modifier = Modifier,
    vm: ConexionViewModel = hiltViewModel(),
) {
    val enlace by vm.enlace.collectAsState()

    AnimatedVisibility(
        visible = !enlace.hayRed,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
    ) {
        Row(
            modifier
                .fillMaxWidth()
                .background(Ambar)
                .padding(horizontal = 14.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Outlined.CloudOff,
                contentDescription = null,
                tint = AmbarTinta,
                modifier = Modifier.size(15.dp),
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "Sin conexión",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = AmbarTinta,
                )
                Text(
                    if (enlace.pendientes > 0)
                        "Sigue registrando. Hay ${enlace.pendientes} por enviar; se van solos al volver la señal."
                    else
                        "Sigue registrando. Se envía solo al volver la señal.",
                    style = MaterialTheme.typography.labelSmall,
                    color = AmbarTinta.copy(alpha = 0.85f),
                )
            }
            if (enlace.pendientes > 0) {
                Icon(
                    Icons.Outlined.CloudUpload,
                    contentDescription = null,
                    tint = AmbarTinta.copy(alpha = 0.6f),
                    modifier = Modifier.size(15.dp),
                )
            }
        }
    }
}

// El ámbar de aviso: se ve sobre el blanco de la cabecera sin competir con
// el rojo del semáforo del inventario, que significa otra cosa distinta.
private val Ambar = Color(0xFFFEF3C7)
private val AmbarTinta = Color(0xFF92400E)
