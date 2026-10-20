package pe.servicon.sigov.ui.avance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import pe.servicon.sigov.datos.AvanceRepositorio
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.ResumenAvance
import pe.servicon.sigov.datos.sync.ColaRepositorio
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.local.ParteDao
import javax.inject.Inject

data class AvanceDePartida(
    val actividad: String,
    val tramo: String?,
    val progresivaInicio: Double?,
    val progresivaFin: Double?,
    val meta: Double,
    val ejecutado: Double,
    val unidad: String?,
)

data class EstadoAvance(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    val programadas: Int = 0,
    val culminadas: Int = 0,
    val registros: Int = 0,
    val fotos: Int = 0,
    val sinFoto: Int = 0,
    val pciAbiertos: Int = 0,
    /**
     * Los PCI activos con los mismos estados que el módulo PCI (SEG-V2-OBS-24):
     * por atender, en ejecución, conformes y observados; «vencido» es una
     * condición de plazo que puede darse en cualquiera de los abiertos.
     */
    val pciPanel: List<PanelDePci> = emptyList(),
    /** Lo que pide acción ya: vencido o vence hoy o mañana (SEG-V2-OBS-23). */
    val pciUrgentes: Int = 0,
    val partidas: List<AvanceDePartida> = emptyList(),
    val error: String? = null,
    /** 0 = esta semana, -1 = la anterior… */
    val semana: Int = 0,
    val cargandoSemana: Boolean = true,
    val resumen: ResumenAvance? = null,
    /** Si el resumen viene de la copia guardada, desde cuándo (milisegundos). */
    val copiaDe: Long? = null,
    val errorSemana: String? = null,
    /** Lo anotado en el celular que todavía no llegó a la nube. */
    val porSincronizar: Int = 0,
    val conError: Int = 0,
) {
    /**
     * Cumplimiento por partidas cerradas, no por metrado.
     *
     * En un mismo día la cuadrilla hace metros de cuneta, metros cuadrados
     * de parchado y unidades de señal. Sumar eso no da una cifra: da un
     * número sin unidad que engaña.
     */
    val cumplimiento: Double
        get() = if (programadas == 0) 0.0 else culminadas * 100.0 / programadas
}

@HiltViewModel
class AvanceViewModel @Inject constructor(
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
    private val avance: AvanceRepositorio,
    private val cola: ColaRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoAvance())
    val estado: StateFlow<EstadoAvance> = _estado.asStateFlow()

    init {
        cargar()
        cargarSemana()
    }

    /** Cambia la semana del resumen: -1 la anterior, +1 la siguiente (sin pasar de la actual). */
    fun moverSemana(paso: Int) {
        val nueva = (_estado.value.semana + paso).coerceAtMost(0)
        if (nueva == _estado.value.semana) return
        _estado.update { it.copy(semana = nueva) }
        cargarSemana()
    }

    fun refrescar() {
        cargar()
        cargarSemana()
    }

    private fun cargarSemana() {
        val semana = _estado.value.semana
        _estado.update { it.copy(cargandoSemana = true, errorSemana = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val (desde, hasta) = AvanceRepositorio.semanaDe(Peru.hoy().plusWeeks(semana.toLong()))
                val r = avance.resumen(cuadrilla.servicioId, cuadrilla.id, desde, hasta)
                val pendientes = cola.pendientes.first()
                val errores = cola.conError.first()
                Triple(r, pendientes, errores)
            }.onSuccess { (r, pendientes, errores) ->
                if (_estado.value.semana != semana) return@onSuccess
                _estado.update {
                    it.copy(
                        cargandoSemana = false,
                        resumen = r?.resumen,
                        copiaDe = r?.takeIf { x -> !x.fresco }?.guardadoEn,
                        errorSemana = if (r == null) "Sin señal y sin una copia guardada de esta semana." else null,
                        porSincronizar = pendientes,
                        conError = errores,
                    )
                }
            }.onFailure { f ->
                _estado.update { it.copy(cargandoSemana = false, errorSemana = f.enCristiano()) }
            }
        }
    }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")

                val programadas = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id)
                val pcis = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id)
                val resumenes = campo.pciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id).filter { r -> r.activo }
                val items = campo.itemsPciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id).filter { i -> i.activoParaCuadrilla }
                val panel = resumenes.map { r ->
                    val delPci = items.filter { i -> i.pciId == r.pciId }
                    val abiertos = delPci.filter { i -> pe.servicon.sigov.ui.pci.estadoDe(i) != pe.servicon.sigov.ui.pci.Estado.CONFORMES }
                    PanelDePci(
                        pciId = r.pciId,
                        codigo = pe.servicon.sigov.datos.codigoCortoDePci(r.code) ?: r.code,
                        porAtender = delPci.count { i -> pe.servicon.sigov.ui.pci.estadoDe(i) == pe.servicon.sigov.ui.pci.Estado.POR_ATENDER },
                        enEjecucion = delPci.count { i -> pe.servicon.sigov.ui.pci.estadoDe(i) == pe.servicon.sigov.ui.pci.Estado.EN_EJECUCION },
                        conformes = delPci.count { i -> pe.servicon.sigov.ui.pci.estadoDe(i) == pe.servicon.sigov.ui.pci.Estado.CONFORMES },
                        observados = delPci.count { i -> pe.servicon.sigov.ui.pci.estadoDe(i) == pe.servicon.sigov.ui.pci.Estado.OBSERVADOS },
                        vencidos = abiertos.count { i -> (pe.servicon.sigov.ui.pci.diasQueLeQuedan(i) ?: 0) < 0 },
                    )
                }.filter { p -> p.porAtender + p.enEjecucion + p.conformes + p.observados > 0 }
                val urgentes = items.count { i ->
                    pe.servicon.sigov.ui.pci.estadoDe(i) != pe.servicon.sigov.ui.pci.Estado.CONFORMES &&
                        (pe.servicon.sigov.ui.pci.diasQueLeQuedan(i) ?: 99) <= 1
                }

                // Lo registrado sale de la copia local, no de la nube: el
                // capataz consulta su avance justo donde no hay señal.
                val parte = campo.abrirParteDeHoy(cuadrilla.servicioId, cuadrilla.id)
                val registros = partes.registrosDelParte(parte.clientId)
                val conFoto = registros.count { partes.cuantasEvidencias(it.clientId) > 0 }

                _estado.update {
                    it.copy(
                        cargando = false,
                        cuadrilla = cuadrilla.name,
                        programadas = programadas.size,
                        culminadas = programadas.count { p ->
                            val meta = p.meta ?: 0.0
                            meta > 0 && (p.ejecutado ?: 0.0) >= meta
                        },
                        registros = registros.size,
                        fotos = conFoto,
                        sinFoto = registros.size - conFoto,
                        pciAbiertos = pcis.size,
                        pciPanel = panel,
                        pciUrgentes = urgentes,
                        partidas = programadas.map { p ->
                            AvanceDePartida(
                                actividad = p.actividad ?: "Partida sin nombre",
                                tramo = p.tramo,
                                progresivaInicio = p.progresivaInicio,
                                progresivaFin = p.progresivaFin,
                                meta = p.meta ?: 0.0,
                                ejecutado = p.ejecutado ?: 0.0,
                                unidad = p.unidad,
                            )
                        },
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}

/** Un PCI activo en el panel de Mi Avance. */
data class PanelDePci(
    val pciId: String,
    val codigo: String,
    val porAtender: Int,
    val enEjecucion: Int,
    val conformes: Int,
    val observados: Int,
    val vencidos: Int,
)
