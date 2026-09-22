package pe.servicon.sigov.ui.parte

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.Actividad
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.OrigenDelTrabajo
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.datos.local.ParteLocal
import pe.servicon.sigov.datos.local.ParteDao
import pe.servicon.sigov.datos.local.RegistroLocal
import javax.inject.Inject

data class EstadoParte(
    val cargando: Boolean = true,
    val parte: ParteLocal? = null,
    val registros: List<RegistroLocal> = emptyList(),
    val actividades: List<Actividad> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    // Lo que el capataz puede señalar como origen del metrado
    val programadas: List<ItemProgramado> = emptyList(),
    val pcis: List<ItemPci> = emptyList(),
    val cuadrilla: String = "",
    val fotosPorRegistro: Map<String, Int> = emptyMap(),
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val metradoTotal: Double get() = registros.sumOf { it.cantidad }
}

/**
 * El parte del día.
 *
 * Abre —o crea— el parte de hoy para la cuadrilla y va acumulando lo que se
 * ejecuta. Todo se guarda en el equipo primero; la cola se encarga del resto.
 */
@HiltViewModel
class ParteViewModel @Inject constructor(
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoParte())
    val estado: StateFlow<EstadoParte> = _estado.asStateFlow()

    init { abrir() }

    private fun abrir() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val servicioId = cuadrilla.servicioId

                // Los catálogos se refrescan si hay señal; si no, se usa la
                // copia que ya está en el equipo.
                runCatching { campo.bajarCatalogos(servicioId) }

                val parte = campo.abrirParteDeHoy(servicioId, cuadrilla.id)

                _estado.update {
                    it.copy(
                        cargando = false,
                        parte = parte,
                        cuadrilla = cuadrilla.name,
                        actividades = campo.actividades(servicioId),
                        tramos = campo.tramos(servicioId),
                    )
                }

                // Lo programado y los PCI llegan después: si no hay señal el
                // parte igual se abre, solo que sin poder amarrar el origen.
                runCatching {
                    val programadas = campo.programacionDelDia(servicioId, cuadrilla.id)
                    val pcis = campo.pciAsignados(servicioId, cuadrilla.id)
                    _estado.update { it.copy(programadas = programadas, pcis = pcis) }
                }
                vigilarRegistros(parte.clientId)
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    private fun vigilarRegistros(parteId: String) {
        viewModelScope.launch {
            campo.registrosDe(parteId).collectLatest { filas ->
                _estado.update { it.copy(registros = filas) }
            }
        }
        // Las fotos se cuentan aparte: al volver de la cámara la lista se
        // actualiza sola, sin recargar el parte.
        viewModelScope.launch {
            partes.conteoEvidencias(parteId).collectLatest { conteos ->
                _estado.update { estado ->
                    estado.copy(fotosPorRegistro = conteos.associate { it.registroClientId to it.cuantas })
                }
            }
        }
    }

    fun registrar(
        actividad: Actividad,
        tramo: Tramo?,
        progresivaInicio: Double?,
        progresivaFin: Double?,
        lado: String,
        cantidad: Double,
        observacion: String?,
        origen: OrigenDelTrabajo,
        alTerminar: () -> Unit,
    ) {
        val parte = _estado.value.parte ?: return
        _estado.update { it.copy(guardando = true) }

        viewModelScope.launch {
            runCatching {
                campo.registrarActividad(
                    parte = parte,
                    actividad = actividad,
                    tramo = tramo,
                    progresivaInicio = progresivaInicio,
                    progresivaFin = progresivaFin,
                    lado = lado,
                    cantidad = cantidad,
                    unidad = null,
                    observacion = observacion,
                    origen = origen,
                )
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = when (origen) {
                            is OrigenDelTrabajo.Programado ->
                                "Registrado y descontado de la partida programada."
                            is OrigenDelTrabajo.Pci ->
                                "Registrado como sustento del ${origen.item.pciCodigo ?: "PCI"}."
                            else -> "Actividad registrada. Se enviará al haber señal."
                        },
                    )
                }
                // Lo programado cambia al registrar: si no se vuelve a leer,
                // la partida recién cubierta sigue ofreciéndose como pendiente
                refrescarOrigenes()
                alTerminar()
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    private fun refrescarOrigenes() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: return@runCatching
                _estado.update {
                    it.copy(
                        programadas = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id),
                        pcis = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id),
                    )
                }
            }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
