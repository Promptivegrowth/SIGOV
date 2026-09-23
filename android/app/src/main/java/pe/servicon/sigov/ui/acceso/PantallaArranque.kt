package pe.servicon.sigov.ui.acceso

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pe.servicon.sigov.ui.componentes.LogoEnMovimiento
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import pe.servicon.sigov.R
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.ui.theme.AzulOscuro
import pe.servicon.sigov.ui.theme.Marca
import javax.inject.Inject

@HiltViewModel
class ArranqueViewModel @Inject constructor(
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _hayQueEntrar = MutableStateFlow<Boolean?>(null)

    /** null mientras se averigua; true si ya hay sesión; false si hay que entrar. */
    val hayQueEntrar: StateFlow<Boolean?> = _hayQueEntrar.asStateFlow()

    init {
        viewModelScope.launch {
            _hayQueEntrar.value = runCatching { sesion.haySesion() }.getOrDefault(false)
        }
    }
}

/**
 * El arranque.
 *
 * Supabase recupera del equipo la sesión guardada, y eso toma un instante.
 * Sin esta espera la aplicación pedía la contraseña cada vez que se reiniciaba
 * el celular —justo lo que no se puede hacer en carretera, donde muchas veces
 * no hay señal para volver a entrar.
 */
@Composable
fun PantallaArranque(
    vm: ArranqueViewModel = hiltViewModel(),
    alEntrar: () -> Unit,
    alPedirAcceso: () -> Unit,
) {
    val hay by vm.hayQueEntrar.collectAsState()

    LaunchedEffect(hay) {
        when (hay) {
            true -> alEntrar()
            false -> alPedirAcceso()
            null -> Unit // todavía leyendo del equipo
        }
    }

    Surface(color = AzulOscuro) {
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LogoEnMovimiento(tamano = 116.dp)

            Spacer(Modifier.height(28.dp))
            Text(
                buildAnnotatedString {
                    append("SIGO")
                    withStyle(SpanStyle(color = Marca.Verde)) { append("V") }
                },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "GESTIÓN OPERATIVA VIAL",
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 3.sp,
                color = Color.White.copy(alpha = 0.45f),
            )

            Spacer(Modifier.height(34.dp))
            Text(
                "Preparando tu jornada…",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.55f),
            )
        }
    }
}
