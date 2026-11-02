package pe.servicon.sigov.ui.avisos

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.FilterChip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
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
import kotlinx.coroutines.flow.first
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
class AvisosViewModel @Inject constructor(
    private val repo: AvisosRepositorio,
    private val cola: pe.servicon.sigov.datos.sync.ColaRepositorio,
    private val sesion: pe.servicon.sigov.datos.SesionRepositorio,
    private val ssoma: pe.servicon.sigov.datos.SsomaRepositorio,
) : ViewModel() {
    private val _estado = MutableStateFlow(EstadoAvisos())
    val estado: StateFlow<EstadoAvisos> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching { delTelefono() + repo.recientes() }
                .onSuccess { l -> _estado.update { it.copy(cargando = false, avisos = l, error = null) } }
                .onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    /**
     * Lo urgente que no viene de la base sino del teléfono (REV3-OBS-47):
     * registros que no logran sincronizarse y vehículos de la cuadrilla no
     * habilitados para circular.
     */
    private suspend fun delTelefono(): List<Aviso> {
        val ahora = java.time.OffsetDateTime.now().toString()
        val errores = runCatching { cola.conError.first() }.getOrDefault(0)
        val sync = if (errores > 0) listOf(
            Aviso(id = "local-sync", type = "error_sincronizacion", severity = "danger", prioridad = "urgente", categoria = "otros",
                title = "Error de sincronización · $errores registro${if (errores == 1) "" else "s"} sin enviar",
                body = "Entra a Sincronización para reintentar o ver qué falta.", creado = ahora, url = "sincronizacion"),
        ) else emptyList()
        val vehiculos = runCatching {
            val c = sesion.cuadrilla() ?: return@runCatching emptyList()
            ssoma.vehiculos(c.servicioId).filter { v -> v.cuadrillaId == c.id && !v.aptoParaCircular && v.status == "operativo" }
        }.getOrDefault(emptyList()).map { v ->
            Aviso(id = "local-veh-" + v.id, type = "vehiculo_no_habilitado", severity = "danger", prioridad = "urgente", categoria = "ssoma",
                title = "Vehículo ${v.plate} · ${v.habilitacion}",
                body = (v.documentosVencidos.map { "venció $it" } + v.documentosFaltantes.map { "falta $it" }).joinToString(", "),
                creado = ahora)
        }
        return sync + vehiculos
    }

    fun abrir(aviso: Aviso) {
        if (aviso.id.startsWith("local-")) return
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

/** Los filtros de la pantalla (REV3-OBS-48). */
private val FILTROS = listOf(
    "todas" to "Todas", "no_leidas" to "No leídas", "urgentes" to "Urgentes",
    "pci" to "PCI", "programacion" to "Programación", "ssoma" to "SSOMA", "reportes" to "Reportes",
)

/**
 * Los avisos del usuario: primero lo urgente (PCI nuevo, por vencer o
 * vencido, ítem observado, SSOMA observado, error de sincronización,
 * vehículo no habilitado) y después lo informativo; lo resuelto queda
 * abajo, como historial (REV3-OBS-46 a 48). Tocar uno abre su registro.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun PantallaAvisos(
    vm: AvisosViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alIr: (String) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    var filtro by rememberSaveable { mutableStateOf("todas") }
    val vivos = estado.avisos.filter { it.resuelta == null }
    val sinLeer = vivos.count { it.leido == null }
    val visibles = estado.avisos.filter { a ->
        when (filtro) {
            "no_leidas" -> a.leido == null && a.resuelta == null
            "urgentes" -> a.esUrgente && a.resuelta == null
            "todas" -> true
            else -> a.categoria == filtro
        }
    }
    val urgentes = visibles.filter { it.resuelta == null && it.esUrgente }
    val informativas = visibles.filter { it.resuelta == null && !it.esUrgente }
    val historial = visibles.filter { it.resuelta != null }
    ArmazonDeApartado(
        titulo = "Avisos",
        seccion = if (sinLeer == 0) "Todo leído" else "$sinLeer sin leer",
        alVolver = alVolver,
        ayuda = "Avisos importantes de tu cuadrilla: programación, PCI, reportes, SSOMA y pendientes.",
        acciones = { if (sinLeer > 0) TextButton(onClick = vm::marcarTodos) { Text("Marcar todo") } },
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                FILTROS.forEach { (k, t) ->
                    val n = when (k) {
                        "todas" -> vivos.size
                        "no_leidas" -> sinLeer
                        "urgentes" -> vivos.count { it.esUrgente }
                        else -> vivos.count { it.categoria == k }
                    }
                    FilterChip(selected = filtro == k, onClick = { filtro = k }, label = { Text(if (n > 0) "$t · $n" else t) })
                }
            }
            when {
                estado.cargando -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                visibles.isEmpty() -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(estado.error ?: "No hay avisos en este filtro.", style = MaterialTheme.typography.bodyLarge)
                }
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                    fun grupo(titulo: String, lista: List<Aviso>, apagado: Boolean = false) {
                        if (lista.isEmpty()) return
                        item(key = "t-$titulo") {
                            Text(
                                "$titulo · ${lista.size}",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = if (titulo == "Urgentes") Semaforo.Vencido else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
                            )
                        }
                        items(lista, key = { it.id }) { a -> FilaDeAviso(a, apagado) { vm.abrir(a); a.destino?.let(alIr) } }
                    }
                    grupo("Urgentes", urgentes)
                    grupo("Informativas", informativas)
                    grupo("Historial (resueltos)", historial, apagado = true)
                }
            }
        }
    }
}

@Composable
private fun FilaDeAviso(a: Aviso, apagado: Boolean, alTocar: () -> Unit) {
    val color = when {
        apagado -> MaterialTheme.colorScheme.outline
        a.severity == "danger" -> Semaforo.Vencido
        a.severity == "warning" || a.esUrgente -> Marca.Naranja
        else -> Marca.Azul
    }
    val nuevo = a.leido == null && !apagado
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = alTocar)
            .background(if (nuevo) color.copy(alpha = 0.05f) else Color.Transparent)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.padding(top = 6.dp).size(10.dp).background(if (nuevo) color else Color.Transparent, CircleShape))
        Column(Modifier.weight(1f)) {
            Text(a.title, style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (nuevo) FontWeight.SemiBold else FontWeight.Normal,
                color = if (apagado) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
            a.body?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Text(
                listOfNotNull(
                    runCatching {
                        java.time.OffsetDateTime.parse(a.momento.replace(" ", "T"))
                            .atZoneSameInstant(Peru.zona).format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
                    }.getOrNull(),
                    if (a.actualizada != null && !apagado) "actualizado" else null,
                    if (apagado) "resuelto" else null,
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    HorizontalDivider()
}
