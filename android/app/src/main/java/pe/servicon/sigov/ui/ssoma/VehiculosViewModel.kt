package pe.servicon.sigov.ui.ssoma

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.PUNTOS_PREOPERACIONAL
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.SsomaRepositorio
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.Vehiculo
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

data class EstadoVehiculos(
    val cargando: Boolean = true,
    val vehiculos: List<Vehiculo> = emptyList(),
    val soloMiCuadrilla: Boolean = true,
    val miCuadrillaId: String? = null,
    val cuadrilla: String = "",
    val hoy: String = Peru.hoy().toString(),
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val visibles: List<Vehiculo>
        get() = vehiculos.filter {
            !soloMiCuadrilla || it.cuadrillaId == null || it.cuadrillaId == miCuadrillaId
        }

    /** Los que todavía no se revisaron hoy: es lo que falta antes de salir. */
    val sinRevisarHoy: Int get() = visibles.count { !it.revisadoHoy(hoy) }
}

/**
 * La flota y su revisión de antes de salir.
 *
 * Circular con el SOAT vencido es una papeleta segura y, si hay accidente,
 * deja a la empresa sin cobertura. Por eso la fecha que primero vence va
 * arriba y en color.
 */
@HiltViewModel
class VehiculosViewModel @Inject constructor(
    private val ssoma: SsomaRepositorio,
    private val sesion: SesionRepositorio,
    private val ubicacion: Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoVehiculos())
    val estado: StateFlow<EstadoVehiculos> = _estado.asStateFlow()

    init { cargar() }

    fun alternarAlcance() = _estado.update { it.copy(soloMiCuadrilla = !it.soloMiCuadrilla) }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val flota = ssoma.vehiculos(cuadrilla.servicioId)
                _estado.update {
                    it.copy(
                        cargando = false,
                        vehiculos = flota,
                        miCuadrillaId = cuadrilla.id,
                        cuadrilla = cuadrilla.name,
                        hoy = Peru.hoy().toString(),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun registrarPreoperacional(
        vehiculo: Vehiculo,
        puntos: Map<String, Boolean>,
        kilometraje: Int?,
        hallazgo: String?,
        alTerminar: () -> Unit,
    ) {
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val punto = runCatching { ubicacion.actual() }.getOrNull()
                ssoma.revisarVehiculo(vehiculo, puntos, kilometraje, hallazgo, punto)
            }.onSuccess {
                val faltantes = PUNTOS_PREOPERACIONAL.count { puntos[it.first] == false }
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = if (faltantes == 0) {
                            "Preoperacional registrado. Puedes salir."
                        } else {
                            "Registrado con $faltantes punto" +
                                (if (faltantes == 1) "" else "s") + " observado. Avisa al supervisor."
                        },
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
