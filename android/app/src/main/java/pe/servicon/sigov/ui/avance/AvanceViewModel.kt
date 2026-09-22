package pe.servicon.sigov.ui.avance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.CampoRepositorio
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
    val partidas: List<AvanceDePartida> = emptyList(),
    val error: String? = null,
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
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoAvance())
    val estado: StateFlow<EstadoAvance> = _estado.asStateFlow()

    init { cargar() }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")

                val programadas = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id)
                val pcis = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id)

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
