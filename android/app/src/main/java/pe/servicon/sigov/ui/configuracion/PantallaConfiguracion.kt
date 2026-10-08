package pe.servicon.sigov.ui.configuracion

import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.BuildConfig
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Configuracion
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Sello
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import javax.inject.Inject

data class EstadoConfiguracion(
    /** El sello que fija el contrato. */
    val delContrato: Sello = Sello(),
    /** El elegido en este teléfono; null si sigue el del contrato. */
    val delEquipo: Sello? = null,
) {
    val efectivo: Sello get() = (delEquipo ?: delContrato).conFechaYHora()
}

@HiltViewModel
class ConfiguracionViewModel @Inject constructor(
    private val configuracion: Configuracion,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoConfiguracion())
    val estado: StateFlow<EstadoConfiguracion> = _estado.asStateFlow()

    init {
        viewModelScope.launch {
            val servicio = runCatching { sesion.cuadrilla()?.servicioId }.getOrNull()
            val contrato = servicio?.let { runCatching { campo.ajustes(it).sello }.getOrNull() } ?: Sello()
            _estado.update { it.copy(delContrato = contrato) }
        }
        viewModelScope.launch {
            configuracion.sello.collectLatest { s -> _estado.update { it.copy(delEquipo = s) } }
        }
    }

    fun cambiar(transformar: (Sello) -> Sello) =
        configuracion.fijarSello(transformar(_estado.value.efectivo))

    fun volverAlContrato() = configuracion.volverAlContrato()
}

/**
 * Configuración del teléfono (Elvis: «una opción de configuraciones, como en
 * cualquier aplicativo… lo normal que voy a tener activado es fecha y hora,
 * pero los demás también que se tengan, solamente que estén deshabilitados»).
 */
@Composable
fun PantallaConfiguracion(
    vm: ConfiguracionViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val sello = estado.efectivo

    ArmazonDeApartado(
        titulo = "Configuración",
        seccion = "Este teléfono",
        alVolver = alVolver,
        ayuda = "Lo que aquí cambies vale para las fotos que tomes desde este teléfono.",
    ) { relleno ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(relleno)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("SELLO FOTOGRÁFICO", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(
                "Lo que se imprime sobre la foto. Las coordenadas, la hora real y la actividad se " +
                    "guardan siempre dentro del archivo y en SIGOV, aunque no se impriman.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            VistaPrevia(sello)

            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder(),
            ) {
                Column(Modifier.padding(vertical = 4.dp)) {
                    Opcion("Fecha", "Siempre se imprime", true, fija = true) {}
                    Opcion("Hora", "Siempre se imprime", true, fija = true) {}
                    HorizontalDivider()
                    Opcion("Coordenadas GPS", "Latitud y longitud", sello.geo) { si -> vm.cambiar { it.copy(geo = si, precision = si && it.precision) } }
                    Opcion("Precisión GPS", "El ± en metros", sello.precision, habilitada = sello.geo) { si -> vm.cambiar { it.copy(precision = si) } }
                    Opcion("Tramo", null, sello.tramo) { si -> vm.cambiar { it.copy(tramo = si) } }
                    Opcion("Progresiva", null, sello.progresiva) { si -> vm.cambiar { it.copy(progresiva = si) } }
                    Opcion("Actividad", null, sello.actividad) { si -> vm.cambiar { it.copy(actividad = si) } }
                    Opcion("PCI", "El código del PCI", sello.pci) { si -> vm.cambiar { it.copy(pci = si) } }
                    Opcion("Cuadrilla", null, sello.cuadrilla) { si -> vm.cambiar { it.copy(cuadrilla = si) } }
                    Opcion("Firma SIGOV", "«SERVICON · SIGOV»", sello.marca) { si -> vm.cambiar { it.copy(marca = si) } }
                }
            }

            if (estado.delEquipo != null) {
                OutlinedButton(onClick = vm::volverAlContrato, modifier = Modifier.fillMaxWidth()) {
                    Text("Volver a lo que fija el contrato")
                }
            } else {
                Text(
                    "Hoy sigues lo que fija el contrato.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                "La fecha y la hora se pueden editar antes de tomar la foto, desde la cámara.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(12.dp))
            Text(
                "SIGOV ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun Opcion(
    titulo: String,
    detalle: String?,
    activa: Boolean,
    fija: Boolean = false,
    habilitada: Boolean = true,
    alCambiar: (Boolean) -> Unit,
) {
    // Toda la fila se toca, no solo el interruptor: en obra se usa con guantes
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = activa, enabled = !fija && habilitada, role = Role.Switch, onValueChange = alCambiar)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                titulo,
                style = MaterialTheme.typography.bodyLarge,
                color = if (habilitada) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            detalle?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(
            checked = activa,
            onCheckedChange = null,
            enabled = !fija && habilitada,
            // Encendido fijo: verde apagado, no gris, para que no parezca apagado
            colors = SwitchDefaults.colors(
                checkedTrackColor = Marca.VerdeBandera,
                disabledCheckedTrackColor = Marca.VerdeBandera.copy(alpha = 0.45f),
                disabledCheckedThumbColor = Color.White,
                uncheckedTrackColor = Color(0xFFE9ECF1),
                uncheckedThumbColor = Color(0xFF7B828C),
                uncheckedBorderColor = Color(0xFFB4BAC3),
            ),
        )
    }
}

/** Cómo va a salir el sello: abajo a la derecha, como en la foto. */
@Composable
private fun VistaPrevia(sello: Sello) {
    val extras = listOfNotNull(
        "SERVICON · SIGOV".takeIf { sello.marca },
        "Cuadrilla 1".takeIf { sello.cuadrilla },
        listOfNotNull("PCI-2026-050".takeIf { sello.pci }, "Limpieza de alcantarillas".takeIf { sello.actividad })
            .joinToString(" · ").ifBlank { null },
        listOfNotNull("Dv. Ilo – Tacna".takeIf { sello.tramo }, "1190+350".takeIf { sello.progresiva })
            .joinToString(" · ").ifBlank { null },
        if (sello.geo) "-18.037895, -70.274088" + (if (sello.precision) "  ±8 m" else "") else null,
    )
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(4f / 3f)
            .background(Color(0xFF5B6B57), RoundedCornerShape(12.dp))
            .padding(12.dp),
    ) {
        Text(
            "Vista previa",
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.7f),
            modifier = Modifier.align(Alignment.TopStart),
        )
        Column(Modifier.align(Alignment.BottomEnd), horizontalAlignment = Alignment.End) {
            extras.forEach {
                Text(it, style = MaterialTheme.typography.labelMedium, color = Color.White)
            }
            Text(
                Peru.sello(Peru.ahora()),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}
