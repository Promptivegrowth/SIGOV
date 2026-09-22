package pe.servicon.sigov.ui.inicio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

data class EstadoJornada(
    val nombre: String = "",
    val cuadrilla: String = "",
    val fecha: String = "",
    val saludo: String = "",
    val programadas: Int = 0,
    val pci: Int = 0,
    val pendientes: Int = 0,
    val error: String? = null,
)

@HiltViewModel
class JornadaViewModel @Inject constructor(
    private val sesion: SesionRepositorio,
    private val colaEnvio: ColaRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoJornada())
    val estado: StateFlow<EstadoJornada> = _estado.asStateFlow()

    init {
        val hoy = LocalDate.now()
        val formato = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale("es", "PE"))
        _estado.update {
            it.copy(
                fecha = hoy.format(formato).replaceFirstChar { c -> c.uppercase() },
                saludo = saludoSegunLaHora(),
            )
        }
        cargar()
        vigilarPendientes()
    }

    /** Cuántos registros esperan señal, en vivo. */
    private fun vigilarPendientes() {
        viewModelScope.launch {
            colaEnvio.pendientes.collectLatest { cuantos ->
                _estado.update { it.copy(pendientes = cuantos) }
            }
        }
    }

    /** Buenos días a las seis de la mañana, que es cuando se abre la app. */
    private fun saludoSegunLaHora(): String = when (LocalTime.now().hour) {
        in 0..11 -> "Buenos días"
        in 12..18 -> "Buenas tardes"
        else -> "Buenas noches"
    }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val perfil = sesion.perfil()
                val cuadrilla = sesion.cuadrilla()
                _estado.update {
                    it.copy(
                        nombre = perfil?.nombre.orEmpty(),
                        cuadrilla = cuadrilla?.name.orEmpty(),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.message) }
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
