package pe.servicon.sigov.ui.programacion

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.AvanceRepositorio
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.time.LocalDate
import javax.inject.Inject

data class EstadoSemana(
    val cargando: Boolean = true,
    val lunes: LocalDate = AvanceRepositorio.semanaDe(Peru.hoy()).first,
    val dias: List<Pair<LocalDate, List<ItemProgramado>>> = emptyList(),
    val cuadrilla: String = "",
    val error: String? = null,
)

/**
 * La semana de programación, día por día (SEG-V2-OBS-25): desde la tarjeta
 * semanal de Mi Avance se abre la semana elegida con sus actividades; recién
 * al tocar un día se abre la programación diaria.
 */
@HiltViewModel
class SemanaViewModel @Inject constructor(
    ruta: SavedStateHandle,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {
    private val _estado = MutableStateFlow(
        EstadoSemana(
            lunes = ruta.get<String>("lunes")?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                ?.let { AvanceRepositorio.semanaDe(it).first }
                ?: AvanceRepositorio.semanaDe(Peru.hoy()).first,
        )
    )
    val estado: StateFlow<EstadoSemana> = _estado.asStateFlow()

    init { cargar() }

    fun mover(semanas: Long) {
        _estado.update { it.copy(lunes = it.lunes.plusWeeks(semanas), cargando = true) }
        cargar()
    }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val c = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val lunes = _estado.value.lunes
                val dias = (0L..6L).map { d ->
                    val dia = lunes.plusDays(d)
                    dia to campo.programacionDelDia(c.servicioId, c.id, dia)
                }
                _estado.update { it.copy(cargando = false, dias = dias, cuadrilla = c.name) }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }
}

@Composable
fun PantallaSemana(
    vm: SemanaViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alAbrirDia: (String) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val domingo = estado.lunes.plusDays(6)
    ArmazonDeApartado(
        titulo = "Programación semanal",
        seccion = "Semana del ${Peru.fechaCorta(estado.lunes)} al ${Peru.fechaCorta(domingo)}",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Toca un día para abrir su programación.",
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { vm.mover(-1) }) { Text("‹ Semana anterior") }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { vm.mover(1) }) { Text("Semana siguiente ›") }
            }
            when {
                estado.cargando -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                estado.error != null -> Text(estado.error!!, modifier = Modifier.padding(24.dp))
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(estado.dias, key = { it.first.toString() }) { (dia, partidas) ->
                        TarjetaDia(dia, partidas) { alAbrirDia(dia.toString()) }
                    }
                }
            }
        }
    }
}

@Composable
private fun TarjetaDia(dia: LocalDate, partidas: List<ItemProgramado>, alAbrir: () -> Unit) {
    val esHoy = dia == Peru.hoy()
    val ejecutadas = partidas.count { it.status in setOf("ejecutado", "validado", "por_validar") }
    val noEjecutadas = partidas.count { it.status == "suspendido" }
    OutlinedCard(
        onClick = alAbrir,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    Peru.fechaLarga(dia),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (esHoy) Marca.Azul else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (partidas.isEmpty()) "Sin partidas" else "$ejecutadas de ${partidas.size} ejecutadas",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(Icons.Outlined.ChevronRight, contentDescription = null)
            }
            if (noEjecutadas > 0) {
                Text("$noEjecutadas no ejecutada${if (noEjecutadas == 1) "" else "s"}", style = MaterialTheme.typography.labelSmall, color = Semaforo.PorVencer)
            }
            partidas.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val color = when (p.status) {
                        "ejecutado", "validado", "por_validar" -> Marca.VerdeBandera
                        "en_curso" -> Marca.Azul
                        "suspendido" -> Semaforo.PorVencer
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Box(Modifier.size(8.dp).background(color, RoundedCornerShape(4.dp)))
                    Text(
                        listOfNotNull(p.actividad, Progresiva.rango(p.progresivaInicio, p.progresivaFin)).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}
