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
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.CajaRepositorio
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.sync.ColaRepositorio
import javax.inject.Inject

data class EstadoJornada(
    val nombre: String = "",
    val cuadrilla: String = "",
    val cuadrillaCodigo: String = "",
    val supervisor: String = "",
    val sector: String = "",
    val saldo: String = "—",
    val fecha: String = "",
    val fechaCorta: String = "",
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
    private val campo: CampoRepositorio,
    private val caja: CajaRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoJornada())
    val estado: StateFlow<EstadoJornada> = _estado.asStateFlow()

    init {
        _estado.update {
            it.copy(
                fecha = Peru.fechaLarga(),
                fechaCorta = Peru.fechaCorta(),
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
    private fun saludoSegunLaHora(): String = when (Peru.hora().hour) {
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
                        cuadrillaCodigo = cuadrilla?.code.orEmpty(),
                    )
                }

                // El resto se baja después del perfil para que la pantalla no
                // espere a la red para mostrar el nombre.
                cuadrilla ?: return@runCatching
                runCatching { campo.bajarCatalogos(cuadrilla.servicioId) }

                val programado = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id)
                val pci = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id)
                val miCaja = runCatching { caja.miCaja(cuadrilla.servicioId, cuadrilla.id) }.getOrNull()
                val jefe = runCatching { sesion.supervisor(cuadrilla.servicioId) }.getOrNull()

                _estado.update {
                    it.copy(
                        programadas = programado.size,
                        pci = pci.size,
                        // El sector sale de lo que hoy toca; si no hay nada
                        // programado, del primer PCI asignado.
                        sector = (programado.firstOrNull()?.tramo
                            ?: pci.firstOrNull()?.tramo).orEmpty(),
                        supervisor = jefe.orEmpty(),
                        saldo = miCaja?.caja?.let { c -> soles(c.balance) } ?: "—",
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
        }
    }

    /** Al volver a la jornada los números pueden haber cambiado. */
    fun refrescar() = cargar()

    fun salir(alSalir: () -> Unit) {
        viewModelScope.launch {
            runCatching { sesion.salir() }
            alSalir()
        }
    }
}

/** El saldo como se dice en obra: «S/ 1,274.50». */
private fun soles(monto: Double): String =
    "S/ " + String.format(java.util.Locale("es", "PE"), "%,.2f", monto)
