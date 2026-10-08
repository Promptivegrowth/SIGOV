package pe.servicon.sigov.ui.pci

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.ResumenPci
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.local.ParteDao
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject

/**
 * El plazo que le queda a un ítem. Elvis: «un filtro que diga los plazos:
 * de un día, dos días, tres días, cuatro días».
 */
enum class Plazo(val etiqueta: String) {
    VENCIDO("Vencidos"),
    UN_DIA("1 día"),
    DOS_DIAS("2 días"),
    TRES_DIAS("3 días"),
    CUATRO_O_MAS("4+ días"),
}

/** En qué anda el ítem, para filtrar. */
enum class Filtro(val etiqueta: String) {
    ABIERTOS("Por atender"),
    POR_VALIDAR("Por validar"),
    OBSERVADOS("Observados"),
    CONFORMES("Conformes"),
    TODOS("Todos"),
}

/**
 * Los días que le quedan, calculados en el teléfono con la fecha de Perú:
 * el número que bajó de la nube se congela si el equipo pasa días sin señal.
 */
fun diasQueLeQuedan(item: ItemPci): Int? =
    item.vence?.let { runCatching { ChronoUnit.DAYS.between(Peru.hoy(), LocalDate.parse(it.take(10))).toInt() }.getOrNull() }
        ?: item.diasRestantes

fun plazoDe(item: ItemPci): Plazo? {
    if (!item.estaAbierto) return null
    val d = diasQueLeQuedan(item) ?: return Plazo.CUATRO_O_MAS
    return when {
        d < 0 -> Plazo.VENCIDO
        d <= 1 -> Plazo.UN_DIA
        d == 2 -> Plazo.DOS_DIAS
        d == 3 -> Plazo.TRES_DIAS
        else -> Plazo.CUATRO_O_MAS
    }
}

data class EstadoPci(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    val pcis: List<ResumenPci> = emptyList(),
    val items: List<ItemPci> = emptyList(),
    /** El PCI que se está mirando; sin él, la lista de PCI. */
    val abierto: String? = null,
    val verCompletados: Boolean = false,
    val plazo: Plazo? = null,
    val filtro: Filtro = Filtro.ABIERTOS,
    /** La ficha del ítem abierta. */
    val ficha: String? = null,
    /** Fotos tomadas que aún no llegan a la nube, por ítem. */
    val fotosPorEnviar: Map<String, Int> = emptyMap(),
    /** Metrado anotado en el equipo que quizá aún no sube, por ítem. */
    val metradoLocal: Map<String, Double> = emptyMap(),
    val trabajando: String? = null,
    /** Ir a la cámara: el registro y la fase. Se consume una vez. */
    val irACamara: Pair<String, Fase>? = null,
    val aviso: String? = null,
    val error: String? = null,
) {
    val pciAbierto: ResumenPci? get() = pcis.firstOrNull { it.pciId == abierto }

    val pcisVisibles: List<ResumenPci>
        get() = pcis.filter { verCompletados || !it.completado }
            // Lo vencido y lo urgente primero; después, lo que vence antes
            .sortedWith(compareByDescending<ResumenPci> { it.vencidos > 0 }
                .thenByDescending { it.urgentes > 0 }
                .thenBy { it.proximoVencimiento ?: "9999-12-31" })

    val itemsDelPci: List<ItemPci> get() = items.filter { it.pciId == abierto }

    /** «PCI en atención / pendientes de culminar» (OBS-09): no se pierden de vista. */
    val bandeja: List<ItemPci>
        get() = itemsDelPci.filter { it.status == "en_atencion" || it.estaObservado }

    val visibles: List<ItemPci>
        get() = itemsDelPci
            .filter {
                when (filtro) {
                    Filtro.ABIERTOS -> it.status == "pendiente"
                    Filtro.POR_VALIDAR -> it.esperaValidacion
                    Filtro.OBSERVADOS -> it.estaObservado
                    Filtro.CONFORMES -> it.esConforme
                    Filtro.TODOS -> true
                }
            }
            .filter { plazo == null || plazoDe(it) == plazo }

    fun conteoPlazo(p: Plazo) = itemsDelPci.count { plazoDe(it) == p }
    fun conteoFiltro(f: Filtro) = itemsDelPci.count {
        when (f) {
            Filtro.ABIERTOS -> it.status == "pendiente"
            Filtro.POR_VALIDAR -> it.esperaValidacion
            Filtro.OBSERVADOS -> it.estaObservado
            Filtro.CONFORMES -> it.esConforme
            Filtro.TODOS -> true
        }
    }

    val itemEnFicha: ItemPci? get() = items.firstOrNull { it.id == ficha }

    fun metradoDe(item: ItemPci): Double = maxOf(item.metradoRegistrado, metradoLocal[item.id] ?: 0.0)
}

/**
 * Los PCI de la cuadrilla.
 *
 * Primero el PCI, luego sus ítems (OBS-05/06): una cuadrilla puede tener
 * varios PCI a la vez y elige en cuál trabaja. Dentro, el ítem se atiende de
 * corrido: iniciar, foto del antes, del durante y del después con un toque,
 * el metrado, y darlo por levantado (OBS-13). Lo iniciado no desaparece: va
 * a su bandeja hasta que se levanta (OBS-09).
 */
@HiltViewModel
class PciViewModel @Inject constructor(
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoPci())
    val estado: StateFlow<EstadoPci> = _estado.asStateFlow()

    init { cargar() }

    fun abrirPci(id: String) = _estado.update { it.copy(abierto = id, plazo = null, filtro = Filtro.ABIERTOS) }
    fun cerrarPci() = _estado.update { it.copy(abierto = null, ficha = null) }
    fun verCompletados(si: Boolean) = _estado.update { it.copy(verCompletados = si) }
    fun filtrarPlazo(p: Plazo?) = _estado.update { it.copy(plazo = p) }
    fun filtrar(f: Filtro) = _estado.update { it.copy(filtro = f) }
    fun abrirFicha(item: ItemPci) = _estado.update { it.copy(ficha = item.id, aviso = null, error = null) }
    /** Al cerrar la ficha se va con ella lo que decía: no reaparece abajo. */
    fun cerrarFicha() = _estado.update { it.copy(ficha = null, aviso = null, error = null) }
    fun camaraAbierta() = _estado.update { it.copy(irACamara = null) }
    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    fun iniciar(item: ItemPci) = accion(item, "Atención iniciada. Toma la foto del antes.") {
        campo.iniciarAtencionPci(item.id)
    }

    /**
     * La foto de una fase, con un toque. Si el ítem no se había iniciado, se
     * inicia primero; si no hay señal para eso, la foto se toma igual: lo que
     * importa en la quebrada es no perderla.
     */
    fun tomarFoto(item: ItemPci, fase: Fase) {
        _estado.update { it.copy(trabajando = item.id, aviso = null, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                if (item.status == "pendiente") runCatching { campo.iniciarAtencionPci(item.id) }
                campo.registroDelItemPci(cuadrilla.servicioId, cuadrilla.id, item)
            }.onSuccess { registro ->
                _estado.update { it.copy(trabajando = null, irACamara = registro.clientId to fase) }
            }.onFailure { fallo ->
                _estado.update { it.copy(trabajando = null, error = fallo.enCristiano()) }
            }
        }
    }

    fun registrarMetrado(item: ItemPci, cantidad: Double) {
        _estado.update { it.copy(trabajando = item.id, aviso = null, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val registro = campo.registroDelItemPci(cuadrilla.servicioId, cuadrilla.id, item)
                campo.fijarMetrado(registro, cantidad)
            }.onSuccess {
                _estado.update {
                    it.copy(
                        trabajando = null,
                        metradoLocal = it.metradoLocal + (item.id to cantidad),
                        aviso = "Metrado registrado. Se enviará al haber señal.",
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(trabajando = null, error = fallo.enCristiano()) }
            }
        }
    }

    fun levantar(item: ItemPci, nota: String?) =
        accion(item, if (item.estaObservado) "Subsanado. COVINCA lo vuelve a revisar." else "Levantado. Queda pendiente de validación COVINCA.") {
            campo.levantarPci(item.id, nota)
        }

    /**
     * Marcar, hacer, recargar. Se recarga desde la nube en vez de tocar la
     * lista en memoria: el servidor puede rechazar el levantamiento, y
     * enseñar un estado que no aceptó sería mentir.
     */
    private fun accion(item: ItemPci, exito: String, bloque: suspend () -> Unit) {
        _estado.update { it.copy(trabajando = item.id, aviso = null, error = null) }
        viewModelScope.launch {
            runCatching { bloque() }
                .onSuccess {
                    _estado.update { it.copy(trabajando = null, aviso = exito) }
                    cargar(silencioso = true)
                }
                .onFailure { fallo ->
                    _estado.update { it.copy(trabajando = null, error = fallo.enCristiano()) }
                }
        }
    }

    /**
     * La lista no se cambia por un indicador de carga al recargar: el
     * capataz no pierde su lugar entre cientos de ítems (OBS-09).
     */
    fun cargar(silencioso: Boolean = false) {
        if (!silencioso) _estado.update { it.copy(cargando = it.items.isEmpty(), error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val pcis = campo.pciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id)
                // Las fotos del teléfono que aún no suben cuentan igual: el
                // capataz las tomó y no tiene por qué volver a tomarlas
                val locales = runCatching { partes.fotosPciPorEnviar() }.getOrDefault(emptyList())
                fun local(id: String, fase: String) = locales.filter { it.pciItemId == id && it.fase == fase }.sumOf { it.cuantas }
                val items = campo.itemsPciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id).map { i ->
                    i.copy(
                        fotosAntes = i.fotosAntes + local(i.id, "antes"),
                        fotosDurante = i.fotosDurante + local(i.id, "durante"),
                        fotosDespues = i.fotosDespues + local(i.id, "despues"),
                    )
                }
                val porEnviar = locales.groupBy { it.pciItemId }.mapValues { (_, l) -> l.sumOf { it.cuantas } }
                _estado.update {
                    it.copy(
                        cargando = false,
                        pcis = pcis,
                        items = items,
                        fotosPorEnviar = porEnviar,
                        cuadrilla = cuadrilla.name,
                        // Con un solo PCI abierto, se entra directo a él
                        abierto = it.abierto ?: pcis.filter { p -> !p.completado }.singleOrNull()?.pciId,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
