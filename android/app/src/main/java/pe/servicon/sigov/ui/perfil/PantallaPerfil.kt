package pe.servicon.sigov.ui.perfil

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.BuildConfig
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.sync.ColaRepositorio
import javax.inject.Inject
import pe.servicon.sigov.ui.componentes.AvisoInformativo
import pe.servicon.sigov.ui.componentes.CabeceraDeMarca
import pe.servicon.sigov.ui.componentes.EncabezadoDeApartado
import pe.servicon.sigov.ui.theme.Borde
import pe.servicon.sigov.ui.theme.Fondo
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

data class EstadoPerfil(
    val nombre: String = "",
    val correo: String = "",
    val rol: String = "",
    val puesto: String = "",
    val cuadrilla: String = "",
    val cuadrillaCodigo: String = "",
    val servicio: String = "",
    val pendientes: Int = 0,
    val error: String? = null,
)

/**
 * Quién está usando la aplicación.
 *
 * Es la cuarta sección de la barra inferior. Sirve para dos cosas muy
 * concretas: confirmar con qué usuario se está registrando —cuando en una
 * cuadrilla se pasan el celular, eso importa— y cerrar sesión.
 */
@HiltViewModel
class PerfilViewModel @Inject constructor(
    private val sesion: SesionRepositorio,
    colaEnvio: ColaRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoPerfil())
    val estado: StateFlow<EstadoPerfil> = _estado.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching {
                val perfil = sesion.perfil()
                val cuadrilla = sesion.cuadrilla()
                _estado.update {
                    it.copy(
                        nombre = perfil?.nombre.orEmpty(),
                        correo = perfil?.email.orEmpty(),
                        rol = perfil?.role.orEmpty(),
                        puesto = perfil?.position.orEmpty(),
                        cuadrilla = cuadrilla?.name.orEmpty(),
                        cuadrillaCodigo = cuadrilla?.code.orEmpty(),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
        }
        viewModelScope.launch {
            colaEnvio.pendientes.collect { cuantos ->
                _estado.update { it.copy(pendientes = cuantos) }
            }
        }
    }

    fun salir(alSalir: () -> Unit) {
        viewModelScope.launch {
            runCatching { sesion.salir() }
            alSalir()
        }
    }
}

@Composable
fun PantallaPerfil(
    vm: PerfilViewModel = hiltViewModel(),
    alSalir: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    var confirmando by remember { mutableStateOf(false) }

    Surface(color = Fondo, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            CabeceraDeMarca()
            EncabezadoDeApartado(titulo = "Perfil", seccion = "Tu cuenta en SIGOV")

            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // La tarjeta de identidad: quién registra
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Borde),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Box(
                            Modifier
                                .size(58.dp)
                                .clip(RoundedCornerShape(29.dp))
                                .background(Marca.Azul),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(30.dp),
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                estado.nombre.ifBlank { "Sin nombre" },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                estado.correo,
                                style = MaterialTheme.typography.bodySmall,
                                color = TintaSuave,
                            )
                        }
                    }
                }

                Dato(Icons.Outlined.Badge, "Puesto", estado.puesto.ifBlank { rolLegible(estado.rol) })
                Dato(
                    Icons.Outlined.Groups, "Cuadrilla",
                    listOfNotNull(
                        estado.cuadrillaCodigo.ifBlank { null },
                        estado.cuadrilla.ifBlank { null },
                    ).joinToString(" · ").ifBlank { "Sin cuadrilla asignada" },
                )
                Dato(
                    Icons.Outlined.CloudUpload, "Registros por enviar",
                    if (estado.pendientes == 0) "Todo sincronizado"
                    else "${estado.pendientes} esperando señal",
                )
                Dato(Icons.Outlined.Info, "Versión", BuildConfig.VERSION_NAME)

                AvisoInformativo(
                    "Si cierras sesión, lo que esté esperando señal se queda guardado " +
                        "en el equipo y se enviará cuando vuelvas a entrar."
                )

                OutlinedButton(
                    onClick = { confirmando = true },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Outlined.Logout, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Cerrar sesión")
                }

                estado.error?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }

    if (confirmando) {
        AlertDialog(
            onDismissRequest = { confirmando = false },
            title = { Text("¿Cerrar sesión?") },
            text = {
                Text(
                    if (estado.pendientes > 0) {
                        "Tienes ${estado.pendientes} registro" +
                            (if (estado.pendientes == 1) "" else "s") +
                            " esperando señal. No se pierden, pero no se enviarán " +
                            "hasta que vuelvas a entrar."
                    } else {
                        "Tendrás que escribir tu correo y contraseña para volver a entrar, " +
                            "y eso necesita señal."
                    }
                )
            },
            confirmButton = {
                Button(onClick = { confirmando = false; vm.salir(alSalir) }) {
                    Text("Cerrar sesión")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmando = false }) { Text("Seguir aquí") }
            },
        )
    }
}

@Composable
private fun Dato(icono: ImageVector, etiqueta: String, valor: String) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Borde),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icono, contentDescription = null, tint = Marca.Azul, modifier = Modifier.size(20.dp))
            // La etiqueta ocupa lo suyo y el valor se lleva el resto: al
            // revés, un valor largo partía la palabra de la etiqueta.
            Text(
                etiqueta,
                style = MaterialTheme.typography.bodyMedium,
                color = TintaSuave,
                maxLines = 1,
            )
            Text(
                valor,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** El rol tal como se nombra en obra, no como se guarda en la base. */
private fun rolLegible(rol: String): String = when (rol) {
    "jefe_cuadrilla" -> "Jefe de cuadrilla"
    "supervisor" -> "Supervisor de campo"
    "ing_seguridad" -> "Ingeniero de seguridad"
    "admin" -> "Administrador"
    "visor" -> "Visor"
    else -> rol.ifBlank { "—" }
}
