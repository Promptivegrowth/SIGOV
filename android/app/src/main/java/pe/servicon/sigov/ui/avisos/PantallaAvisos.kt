package pe.servicon.sigov.ui.avisos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import pe.servicon.sigov.datos.Aviso
import pe.servicon.sigov.datos.AvisosRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.time.Instant
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class EstadoAvisos(val cargando: Boolean = true, val avisos: List<Aviso> = emptyList(), val error: String? = null)

@HiltViewModel
class AvisosViewModel @Inject constructor(private val repo: AvisosRepositorio) : ViewModel() {
    private val _estado = MutableStateFlow(EstadoAvisos())
    val estado: StateFlow<EstadoAvisos> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching { repo.recientes() }
                .onSuccess { l -> _estado.update { it.copy(cargando = false, avisos = l, error = null) } }
                .onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun abrir(aviso: Aviso) {
        viewModelScope.launch {
            runCatching { repo.marcarLeido(aviso) }
            _estado.update { e -> e.copy(avisos = e.avisos.map { if (it.id == aviso.id) it.copy(leido = Instant.now().toString()) else it }) }
        }
    }

    fun marcarTodos() {
        viewModelScope.launch {
            runCatching { repo.marcarTodos() }.onSuccess { cargar() }
        }
    }
}

/** Los avisos del usuario: lo nuevo arriba y en negrita. */
@Composable
fun PantallaAvisos(
    vm: AvisosViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alIr: (String) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val sinLeer = estado.avisos.count { it.leido == null }
    ArmazonDeApartado(
        titulo = "Avisos",
        seccion = if (sinLeer == 0) "Todo leído" else "$sinLeer sin leer",
        alVolver = alVolver,
        ayuda = "PCI por vencer o fuera de plazo y lo que observan el supervisor, COVINCA y SSOMA.",
        acciones = { if (sinLeer > 0) TextButton(onClick = vm::marcarTodos) { Text("Marcar todo") } },
    ) { relleno ->
        when {
            estado.cargando -> Box(Modifier.fillMaxSize().padding(relleno), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            estado.avisos.isEmpty() -> Box(Modifier.fillMaxSize().padding(relleno).padding(32.dp), contentAlignment = Alignment.Center) {
                Text(estado.error ?: "No tienes avisos.", style = MaterialTheme.typography.bodyLarge)
            }
            else -> LazyColumn(Modifier.fillMaxSize().padding(relleno), contentPadding = PaddingValues(vertical = 8.dp)) {
                items(estado.avisos, key = { it.id }) { a ->
                    val color = when (a.severity) {
                        "danger" -> Semaforo.Vencido
                        "warning" -> Marca.Naranja
                        else -> Marca.Azul
                    }
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { vm.abrir(a); a.destino?.let(alIr) }
                            .background(if (a.leido == null) color.copy(alpha = 0.05f) else Color.Transparent)
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.padding(top = 6.dp).size(10.dp).background(if (a.leido == null) color else Color.Transparent, CircleShape))
                        Column(Modifier.weight(1f)) {
                            Text(a.title, style = MaterialTheme.typography.bodyLarge, fontWeight = if (a.leido == null) FontWeight.SemiBold else FontWeight.Normal)
                            a.body?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text(
                                runCatching {
                                    java.time.OffsetDateTime.parse(a.creado.replace(" ", "T"))
                                        .atZoneSameInstant(Peru.zona).format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
                                }.getOrDefault(""),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}
