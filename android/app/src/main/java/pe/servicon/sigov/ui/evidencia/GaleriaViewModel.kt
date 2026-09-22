package pe.servicon.sigov.ui.evidencia

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.EvidenciaEnGaleria
import pe.servicon.sigov.datos.EvidenciaRepositorio
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.contienePorBusqueda
import pe.servicon.sigov.datos.enCristiano
import java.time.LocalDate
import javax.inject.Inject

/**
 * Los rangos por los que la gente pregunta de verdad.
 *
 * Nadie dice «del 14 al 21»; dice «las de hoy» o «las de esta semana». El
 * rango exacto también está, pero detrás de estas fichas.
 */
enum class Periodo(val etiqueta: String, val dias: Long) {
    HOY("Hoy", 0),
    SEMANA("7 días", 6),
    QUINCENA("15 días", 14),
    MES("30 días", 29),
}

data class EstadoGaleria(
    val cargando: Boolean = true,
    val fotos: List<EvidenciaEnGaleria> = emptyList(),
    val periodo: Periodo = Periodo.SEMANA,
    val fase: Fase? = null,
    val busqueda: String = "",
    val cuadrilla: String = "",
    val error: String? = null,
) {
    /**
     * El filtro de texto busca donde el capataz recuerda: la actividad, el
     * tramo y el código de PCI.
     */
    val visibles: List<EvidenciaEnGaleria>
        get() {
            val texto = busqueda.trim()
            if (texto.isBlank()) return fotos
            return fotos.filter { foto ->
                listOfNotNull(foto.actividad, foto.tramo, foto.pciCodigo, foto.caption)
                    .any { it.contienePorBusqueda(texto) }
            }
        }

    /** Agrupadas por día, que es como se revisan. */
    val porDia: List<Pair<String, List<EvidenciaEnGaleria>>>
        get() = visibles
            .groupBy { it.fecha ?: it.tomadaEn.take(10) }
            .toList()
            .sortedByDescending { it.first }
}

/**
 * La galería de evidencias.
 *
 * Sirve para dos cosas: comprobar que una partida quedó sustentada antes de
 * cerrar el parte, y encontrar una foto vieja cuando el cliente la reclama.
 */
@HiltViewModel
class GaleriaViewModel @Inject constructor(
    private val evidencias: EvidenciaRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoGaleria())
    val estado: StateFlow<EstadoGaleria> = _estado.asStateFlow()

    init { cargar() }

    fun cambiarPeriodo(periodo: Periodo) {
        _estado.update { it.copy(periodo = periodo) }
        cargar()
    }

    fun cambiarFase(fase: Fase?) {
        _estado.update { it.copy(fase = fase) }
        cargar()
    }

    fun buscar(texto: String) = _estado.update { it.copy(busqueda = texto) }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val hasta: LocalDate = Peru.hoy()
                val desde = hasta.minusDays(_estado.value.periodo.dias)
                val fotos = evidencias.galeria(
                    servicioId = cuadrilla.servicioId,
                    cuadrillaId = cuadrilla.id,
                    desde = desde.toString(),
                    hasta = hasta.toString(),
                    fase = _estado.value.fase?.valor,
                )
                _estado.update {
                    it.copy(cargando = false, fotos = fotos, cuadrilla = cuadrilla.name)
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
