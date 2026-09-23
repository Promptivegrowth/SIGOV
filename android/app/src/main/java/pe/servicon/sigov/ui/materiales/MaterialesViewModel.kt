package pe.servicon.sigov.ui.materiales

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Insumo
import pe.servicon.sigov.datos.MaterialRepositorio
import pe.servicon.sigov.datos.Pedido
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.RenglonPedido
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Unidad
import pe.servicon.sigov.datos.contienePorBusqueda
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

data class EstadoMateriales(
    val cargando: Boolean = true,
    val insumos: List<Insumo> = emptyList(),
    val pedidos: List<Pedido> = emptyList(),
    val enCola: List<Pedido> = emptyList(),
    val busqueda: String = "",
    val categoria: String? = null,
    /** Lo que el capataz va marcando: insumo → cantidad. */
    val canasta: Map<String, Double> = emptyMap(),
    /** Lo que pidió escrito porque no figuraba en la lista. */
    val escritos: List<RenglonPedido> = emptyList(),
    val unidades: List<Unidad> = emptyList(),
    val cuadrilla: String = "",
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val categorias: List<String>
        get() = insumos.mapNotNull { it.category }.distinct().sorted()

    val visibles: List<Insumo>
        get() {
            val texto = busqueda.trim()
            return insumos
                .filter { categoria == null || it.category == categoria }
                .filter {
                    texto.isBlank() ||
                        it.name.contienePorBusqueda(texto) ||
                        it.code.contienePorBusqueda(texto)
                }
        }

    val todosLosPedidos: List<Pedido> get() = enCola + pedidos

    val enCanasta: Int get() = canasta.size + escritos.size
}

/**
 * Materiales e insumos.
 *
 * Dos cosas: ver qué hay en almacén antes de salir, y pedir lo que falta
 * para la semana. La aprobación es del residente y ocurre en la web.
 */
@HiltViewModel
class MaterialesViewModel @Inject constructor(
    private val material: MaterialRepositorio,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoMateriales())
    val estado: StateFlow<EstadoMateriales> = _estado.asStateFlow()

    init { cargar() }

    fun buscar(texto: String) = _estado.update { it.copy(busqueda = texto) }

    fun filtrarPor(categoria: String?) = _estado.update { it.copy(categoria = categoria) }

    /** Marca o desmarca un insumo del pedido que se está armando. */
    fun poner(insumo: Insumo, cantidad: Double) = _estado.update { estado ->
        val canasta = estado.canasta.toMutableMap()
        if (cantidad <= 0) canasta.remove(insumo.id) else canasta[insumo.id] = cantidad
        estado.copy(canasta = canasta)
    }

    fun vaciarCanasta() = _estado.update { it.copy(canasta = emptyMap(), escritos = emptyList()) }

    /**
     * Agrega al pedido algo que no está en la lista.
     *
     * El catálogo se arma en la oficina y en la vía siempre falta algo que
     * nadie previó. Antes eso salía por WhatsApp y dejaba de haber registro.
     */
    fun agregarEscrito(nombre: String, unidadId: String?, cantidad: Double) {
        val limpio = nombre.trim()
        if (limpio.isBlank() || cantidad <= 0) return
        _estado.update { estado ->
            val unidad = estado.unidades.firstOrNull { it.id == unidadId }
            estado.copy(
                escritos = estado.escritos + RenglonPedido(
                    cantidad = cantidad,
                    nombreEscrito = limpio,
                    unidadId = unidadId,
                    unidad = unidad?.symbol,
                )
            )
        }
    }

    fun quitarEscrito(renglon: RenglonPedido) = _estado.update {
        it.copy(escritos = it.escritos - renglon)
    }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val insumos = material.insumos(cuadrilla.servicioId)
                val pedidos = material.pedidos(cuadrilla.servicioId, cuadrilla.id)
                val pendientes = material.pedidosEnCola(pedidos)
                val unidades = campo.unidades()
                _estado.update {
                    it.copy(
                        cargando = false,
                        insumos = insumos,
                        pedidos = pedidos,
                        enCola = pendientes,
                        unidades = unidades,
                        cuadrilla = cuadrilla.name,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun enviarPedido(paraCuando: String, motivo: String, alTerminar: () -> Unit) {
        val estado = _estado.value
        // Un pedido puede llevar solo cosas escritas a mano: el catálogo
        // puede no tener nada de lo que hoy hace falta.
        if (estado.enCanasta == 0) return
        _estado.update { it.copy(guardando = true) }

        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
                val delCatalogo = estado.canasta.mapNotNull { (id, cantidad) ->
                    estado.insumos.firstOrNull { it.id == id }
                        ?.let { RenglonPedido(cantidad = cantidad, insumo = it) }
                }
                val renglones = delCatalogo + estado.escritos
                material.pedir(
                    servicioId = cuadrilla.servicioId,
                    cuadrillaId = cuadrilla.id,
                    paraCuando = paraCuando.ifBlank { Peru.hoy().toString() },
                    motivo = motivo,
                    renglones = renglones,
                )
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        canasta = emptyMap(),
                        escritos = emptyList(),
                        aviso = "Pedido enviado. El residente lo verá en la web.",
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
