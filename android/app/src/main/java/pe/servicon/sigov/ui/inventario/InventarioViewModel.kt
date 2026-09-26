package pe.servicon.sigov.ui.inventario

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.CampoDelTipo
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.ElementoVial
import pe.servicon.sigov.datos.FotoDeActivo
import pe.servicon.sigov.datos.IntervencionDeActivo
import pe.servicon.sigov.datos.InventarioRepositorio
import pe.servicon.sigov.datos.ResumenDeTipo
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

/** El semáforo, con los mismos cuatro estados que el panel web. */
enum class Semaforo(val clave: String, val etiqueta: String) {
    AL_DIA("al_dia", "Al día"),
    POR_VENCER("por_vencer", "Por vencer"),
    CRITICO("critico", "Crítico"),
    SIN_INTERVENIR("sin_intervenir", "Sin intervenir");

    companion object {
        fun de(clave: String?): Semaforo =
            entries.firstOrNull { it.clave == clave } ?: SIN_INTERVENIR
    }
}

data class EstadoInventario(
    val cargando: Boolean = true,
    val servicioId: String = "",
    val todos: List<ElementoVial> = emptyList(),
    val resumen: List<ResumenDeTipo> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    // Lo que el supervisor eligió ver
    val tramoId: String? = null,
    val tipos: Set<String> = emptySet(),
    val semaforos: Set<Semaforo> = emptySet(),
    // El elemento abierto
    val abierto: ElementoVial? = null,
    val historial: List<IntervencionDeActivo> = emptyList(),
    val urlActual: String? = null,
    val urlAnterior: String? = null,
    /** Las fotos del elemento abierto, cada una con la dirección de su miniatura. */
    val galeria: List<Pair<FotoDeActivo, String?>> = emptyList(),
    /** Los campos del inventario de cada tipo, para enseñarlos con su etiqueta. */
    val campos: Map<String, List<CampoDelTipo>> = emptyMap(),
    val cargandoFicha: Boolean = false,
    val error: String? = null,
) {
    /** Los elementos que pasan los filtros: es lo que se dibuja. */
    val visibles: List<ElementoVial>
        get() = todos.filter { e ->
            (tramoId == null || e.tramoId == tramoId) &&
                (tipos.isEmpty() || e.tipoCodigo in tipos) &&
                (semaforos.isEmpty() || Semaforo.de(e.semaforo) in semaforos)
        }

    val porSemaforo: Map<Semaforo, Int>
        get() = todos
            .filter { tramoId == null || it.tramoId == tramoId }
            .groupingBy { Semaforo.de(it.semaforo) }
            .eachCount()
}

/**
 * El inventario del tramo, en el celular.
 *
 * El filtrado se hace en el equipo y no en la nube: el supervisor está en
 * carretera y cambia de filtro cada pocos segundos mientras recorre. Bajar
 * todo una vez y filtrar en memoria es lo que hace que responda al instante
 * y que siga funcionando cuando se cae la señal.
 */
@HiltViewModel
class InventarioViewModel @Inject constructor(
    private val inventario: InventarioRepositorio,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoInventario())
    val estado: StateFlow<EstadoInventario> = _estado.asStateFlow()

    init { cargar() }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                val servicioId = cuadrilla?.servicioId
                    ?: error("Tu usuario no está asignado a ningún contrato.")

                // Primero lo guardado, para que la pantalla abra al instante
                val guardado = inventario.elementos(servicioId, refrescar = false)
                if (guardado.isNotEmpty()) {
                    _estado.update {
                        it.copy(servicioId = servicioId, todos = guardado, cargando = false)
                    }
                }

                val tramos = campo.tramos(servicioId)
                val campos = inventario.camposPorTipo()
                val frescos = inventario.elementos(servicioId, refrescar = true)
                val resumen = inventario.resumen(servicioId, null)

                _estado.update {
                    it.copy(
                        servicioId = servicioId,
                        todos = frescos.ifEmpty { guardado },
                        resumen = resumen,
                        tramos = tramos,
                        campos = campos,
                        cargando = false,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun elegirTramo(id: String?) {
        _estado.update { it.copy(tramoId = id) }
        viewModelScope.launch {
            val s = _estado.value
            if (s.servicioId.isBlank()) return@launch
            val r = inventario.resumen(s.servicioId, id)
            _estado.update { it.copy(resumen = r) }
        }
    }

    fun alternarTipo(codigo: String) = _estado.update {
        it.copy(tipos = if (codigo in it.tipos) it.tipos - codigo else it.tipos + codigo)
    }

    fun alternarSemaforo(s: Semaforo) = _estado.update {
        it.copy(semaforos = if (s in it.semaforos) it.semaforos - s else it.semaforos + s)
    }

    fun limpiarTipos() = _estado.update { it.copy(tipos = emptySet()) }

    /**
     * Abre la ficha: el historial y las fotos se piden al vuelo.
     *
     * Las dos de la comparación y la galería van en miniatura: en la ficha
     * se ven igual y en carretera cada foto grande son 150 KB.
     */
    fun abrir(elemento: ElementoVial) {
        _estado.update {
            it.copy(abierto = elemento, cargandoFicha = true, historial = emptyList(),
                    urlActual = null, urlAnterior = null, galeria = emptyList())
        }
        viewModelScope.launch {
            val historial = inventario.historial(elemento.id)
            val actual = inventario.urlDeMiniatura(elemento.fotoActual)
            val anterior = inventario.urlDeMiniatura(elemento.fotoAnterior)
            val fotos = inventario.galeria(elemento.id)
            val galeria = if (fotos.size > 1)
                fotos.map { it to inventario.urlDeMiniatura(it.ruta) }
            else emptyList()
            _estado.update {
                if (it.abierto?.id != elemento.id) it   // se abrió otro mientras tanto
                else it.copy(
                    historial = historial,
                    urlActual = actual,
                    urlAnterior = anterior,
                    galeria = galeria,
                    cargandoFicha = false,
                )
            }
        }
    }

    /** La foto grande, cuando se toca una miniatura para ampliarla. */
    suspend fun urlGrande(ruta: String?): String? = inventario.urlDeFoto(ruta)

    fun cerrarFicha() = _estado.update {
        it.copy(abierto = null, historial = emptyList(), urlActual = null, urlAnterior = null,
                galeria = emptyList())
    }

    fun avisoVisto() = _estado.update { it.copy(error = null) }

    fun refrescar() {
        _estado.update { it.copy(cargando = true) }
        cargar()
    }
}
