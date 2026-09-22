package pe.servicon.sigov.ui.pci

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.SesionRepositorio
import javax.inject.Inject

/** Cómo va el plazo. Es el orden en que hay que atenderlos. */
enum class Urgencia(val etiqueta: String) {
    VENCIDO("Vencidos"),
    CRITICO("Por vencer"),
    ATENCION("Esta semana"),
    NORMAL("Con holgura"),
}

data class EstadoPci(
    val cargando: Boolean = true,
    val items: List<ItemPci> = emptyList(),
    val filtro: Urgencia? = null,
    val cuadrilla: String = "",
    val trabajando: String? = null,
    val aviso: String? = null,
    val error: String? = null,
) {
    val visibles: List<ItemPci>
        get() = if (filtro == null) items else items.filter { urgenciaDe(it) == filtro }

    val conteos: Map<Urgencia, Int>
        get() = items.groupingBy { urgenciaDe(it) }.eachCount()
}

/**
 * Cómo de apretado está el plazo de un ítem.
 *
 * Se calcula con los días que faltan y no con el semáforo que trae la vista,
 * para que siga siendo cierto cuando el celular lleva días sin bajar datos.
 */
fun urgenciaDe(item: ItemPci): Urgencia {
    val dias = item.diasRestantes ?: return Urgencia.NORMAL
    return when {
        dias < 0 -> Urgencia.VENCIDO
        dias <= 2 -> Urgencia.CRITICO
        dias <= 7 -> Urgencia.ATENCION
        else -> Urgencia.NORMAL
    }
}

/**
 * Los PCI de la cuadrilla.
 *
 * Un PCI es un requerimiento del cliente con fecha de vencimiento: si se pasa
 * el plazo hay penalidad. Por eso la pantalla abre ordenada por vencimiento y
 * lo vencido va primero, en rojo.
 */
@HiltViewModel
class PciViewModel @Inject constructor(
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoPci())
    val estado: StateFlow<EstadoPci> = _estado.asStateFlow()

    init { cargar() }

    fun filtrar(urgencia: Urgencia?) = _estado.update { it.copy(filtro = urgencia) }

    fun iniciarAtencion(item: ItemPci) =
        accion(item, "Atención iniciada. Toma la foto del antes.") {
            campo.iniciarAtencionPci(item.id)
        }

    fun levantar(item: ItemPci, nota: String?) =
        accion(item, "Levantado. El supervisor ya lo tiene para presentarlo.") {
            campo.levantarPci(item.id, nota)
        }

    /**
     * El molde de las dos: marcar, hacer, recargar.
     *
     * Se recarga desde la nube en vez de tocar la lista en memoria porque el
     * servidor puede rechazar el levantamiento —le falta la foto del
     * después— y enseñar un estado que el servidor no aceptó sería mentir.
     */
    private fun accion(item: ItemPci, exito: String, bloque: suspend () -> Unit) {
        _estado.update { it.copy(trabajando = item.id, error = null) }
        viewModelScope.launch {
            runCatching { bloque() }
                .onSuccess {
                    _estado.update { it.copy(trabajando = null, aviso = exito) }
                    cargar()
                }
                .onFailure { fallo ->
                    _estado.update { it.copy(trabajando = null, error = fallo.enCristiano()) }
                }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val items = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id)
                _estado.update {
                    it.copy(cargando = false, items = items, cuadrilla = cuadrilla.name)
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
