package pe.servicon.sigov.ui.ssoma

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.EquipoDeSeguridad
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.SsomaRepositorio
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

/** Cómo de apretado está el vencimiento. */
enum class Urgencia(val etiqueta: String) {
    VENCIDO("Vencidos"),
    SIETE("7 días"),
    QUINCE("15 días"),
    TREINTA("30 días"),
    HOLGADO("Con holgura"),
}

/** El nivel de aviso que calcula la base, traducido a la pantalla. */
fun urgenciaDe(equipo: EquipoDeSeguridad): Urgencia = when (equipo.aviso) {
    "vencido" -> Urgencia.VENCIDO
    "7" -> Urgencia.SIETE
    "15" -> Urgencia.QUINCE
    "30" -> Urgencia.TREINTA
    else -> Urgencia.HOLGADO
}

data class EstadoEquipos(
    val cargando: Boolean = true,
    val equipos: List<EquipoDeSeguridad> = emptyList(),
    val filtro: Urgencia? = null,
    val soloMiCuadrilla: Boolean = true,
    val miCuadrillaId: String? = null,
    val cuadrilla: String = "",
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val visibles: List<EquipoDeSeguridad>
        get() = equipos
            .filter { !soloMiCuadrilla || it.cuadrillaId == null || it.cuadrillaId == miCuadrillaId }
            .filter { filtro == null || urgenciaDe(it) == filtro }

    val conteos: Map<Urgencia, Int>
        get() = equipos
            .filter { !soloMiCuadrilla || it.cuadrillaId == null || it.cuadrillaId == miCuadrillaId }
            .groupingBy { urgenciaDe(it) }
            .eachCount()
}

/**
 * Los equipos de seguridad que la cuadrilla tiene a cargo.
 *
 * Un extintor vencido es un hallazgo en auditoría, y el hallazgo llega cuando
 * ya no hay tiempo de recargarlo. Aquí se ve venir con 30, 15 y 7 días.
 */
@HiltViewModel
class EquiposViewModel @Inject constructor(
    private val ssoma: SsomaRepositorio,
    private val sesion: SesionRepositorio,
    private val ubicacion: Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoEquipos())
    val estado: StateFlow<EstadoEquipos> = _estado.asStateFlow()

    init { cargar() }

    fun filtrar(urgencia: Urgencia?) = _estado.update { it.copy(filtro = urgencia) }

    fun alternarAlcance() = _estado.update { it.copy(soloMiCuadrilla = !it.soloMiCuadrilla) }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val equipos = ssoma.equipos(cuadrilla.servicioId, cuadrilla.id)
                _estado.update {
                    it.copy(
                        cargando = false,
                        equipos = equipos,
                        miCuadrillaId = cuadrilla.id,
                        cuadrilla = cuadrilla.name,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun inspeccionar(
        equipo: EquipoDeSeguridad,
        conforme: Boolean,
        hallazgo: String?,
        alTerminar: () -> Unit,
    ) {
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val punto = runCatching { ubicacion.actual() }.getOrNull()
                ssoma.inspeccionar(equipo, conforme, hallazgo, punto)
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = if (conforme) "Revisión registrada."
                        else "Hallazgo registrado. El supervisor lo verá en la web.",
                    )
                }
                alTerminar()
                cargar()
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
