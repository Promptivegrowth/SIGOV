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
import pe.servicon.sigov.datos.DocumentosRepositorio
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
 * Cuánto le queda a un ítem, como en la propuesta de Elvis: «1 día, 2, 3,
 * 7, 14 días, vencidos». Cada plazo incluye a los más cortos: «7 días» es lo
 * que vence de hoy a siete días.
 */
enum class Plazo(val etiqueta: String, val dias: Int) {
    UN_DIA("1 día", 1),
    DOS_DIAS("2 días", 2),
    TRES_DIAS("3 días", 3),
    SIETE_DIAS("7 días", 7),
    CATORCE_DIAS("14 días", 14),
    VENCIDO("Vencidos", -1),
}

/**
 * En qué anda el ítem, según sus fotos (Elvis, video del 13/10): sin fotos,
 * por atender; con alguna, en ejecución; con las tres (antes, durante y
 * después), conforme; y observado si el visor o el supervisor lo devolvió.
 */
enum class Estado(val etiqueta: String) {
    PENDIENTES("Pendientes"),
    POR_ATENDER("Por atender"),
    EN_EJECUCION("En ejecución"),
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

/**
 * El estado que ve el capataz. Cuenta las fotos que aún están en el
 * teléfono: si ya tomó las tres, el ítem está conforme aunque la nube se
 * entere al haber señal.
 */
fun estadoDe(item: ItemPci): Estado = when {
    item.estaObservado -> Estado.OBSERVADOS
    item.estaLevantado -> Estado.CONFORMES
    item.fotosCompletas -> Estado.CONFORMES
    item.estaEnAtencion || item.fotosAntes + item.fotosDurante + item.fotosDespues > 0 -> Estado.EN_EJECUCION
    else -> Estado.POR_ATENDER
}

fun cumple(item: ItemPci, estado: Estado): Boolean = when (estado) {
    Estado.PENDIENTES -> estadoDe(item) != Estado.CONFORMES
    Estado.TODOS -> true
    else -> estadoDe(item) == estado
}

/** Lo conforme ya no corre plazo. */
fun cumple(item: ItemPci, plazo: Plazo?): Boolean {
    if (plazo == null) return true
    if (estadoDe(item) == Estado.CONFORMES) return false
    val d = diasQueLeQuedan(item) ?: return false
    return if (plazo == Plazo.VENCIDO) d < 0 else d in 0..plazo.dias
}

private fun coincide(item: ItemPci, busqueda: String): Boolean {
    val q = busqueda.trim().lowercase()
    if (q.isEmpty()) return true
    return listOfNotNull(
        item.tramo, item.pciCodigo, item.pciCorto, item.description, item.actividad,
        item.numero?.let { "ítem $it" }, item.numero?.let { "item $it" },
    ).any { it.lowercase().contains(q) }
}

data class EstadoPci(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    /** Los PCI activos de la cuadrilla (el supervisor puede pausar alguno). */
    val pcis: List<ResumenPci> = emptyList(),
    val items: List<ItemPci> = emptyList(),
    /** El PCI que se está mirando; sin él, la vista general. */
    val abierto: String? = null,
    /** El filtro de la vista general: lo eligen los cuatro contadores. */
    val estado: Estado = Estado.PENDIENTES,
    /** El filtro de dentro de un PCI, aparte del de la vista general. */
    val estadoDelPci: Estado = Estado.PENDIENTES,
    val plazo: Plazo? = null,
    val busqueda: String = "",
    /** La ficha del ítem abierta. */
    val ficha: String? = null,
    /** Fotos tomadas que aún no llegan a la nube, por ítem. */
    val fotosPorEnviar: Map<String, Int> = emptyMap(),
    /** Metrado anotado en el equipo que quizá aún no sube, por ítem. */
    val metradoLocal: Map<String, Double> = emptyMap(),
    val trabajando: String? = null,
    /** Ir a la cámara: el registro y la fase. Se consume una vez. */
    val irACamara: Pair<String, Fase>? = null,
    /** El enlace de la foto referencial abierta. */
    val referencia: String? = null,
    val aviso: String? = null,
    val error: String? = null,
) {
    val pciAbierto: ResumenPci? get() = pcis.firstOrNull { it.pciId == abierto }

    /** Los PCI con algo por hacer primero; después, lo que vence antes. */
    val pcisOrdenados: List<ResumenPci>
        get() = pcis.sortedWith(
            compareBy<ResumenPci> { it.completado }
                .thenByDescending { it.vencidos > 0 }
                .thenBy { it.proximoVencimiento ?: "9999-12-31" },
        )

    /** Los ítems de la pantalla: todos, o los del PCI abierto. */
    private val itemsEnVista: List<ItemPci>
        get() = if (abierto == null) items else items.filter { it.pciId == abierto }

    val estadoEnVista: Estado get() = if (abierto == null) estado else estadoDelPci

    /** Los ítems que se ven, por vencimiento: lo más urgente arriba. */
    val visibles: List<ItemPci>
        get() = itemsEnVista
            .filter { cumple(it, estadoEnVista) && cumple(it, plazo) && coincide(it, busqueda) }
            .sortedWith(
                compareBy<ItemPci> { it.vence ?: "9999-12-31" }
                    .thenBy { it.pciCodigo }
                    .thenBy { it.numero ?: Int.MAX_VALUE },
            )

    fun cuantos(e: Estado): Int = itemsEnVista.count { cumple(it, e) }
    fun cuantos(p: Plazo): Int = itemsEnVista.count { cumple(it, p) && cumple(it, estadoEnVista) }

    val itemEnFicha: ItemPci? get() = items.firstOrNull { it.id == ficha }

    fun metradoDe(item: ItemPci): Double = maxOf(item.metradoRegistrado, metradoLocal[item.id] ?: 0.0)
}

/**
 * Los PCI de la cuadrilla, según la propuesta de Elvis (13/10): una vista
 * general con los ítems de todos sus PCI activos, cuatro contadores que
 * filtran, buscador y plazos; y la pantalla de cada PCI. El ítem cambia de
 * estado solo con sus fotos: ya no se «levanta» a mano.
 */
@HiltViewModel
class PciViewModel @Inject constructor(
    private val ruta: androidx.lifecycle.SavedStateHandle,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
    private val documentos: DocumentosRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoPci())
    val estado: StateFlow<EstadoPci> = _estado.asStateFlow()

    /** Ya llegó la primera carga: desde ahí, cada regreso a la pantalla recarga. */
    private var cargoUnaVez = false

    init {
        // Desde Mi Avance: la cifra tocada llega ya filtrada, también dentro
        // del PCI abierto (que filtra con su propio estado)
        ruta.get<String>("estado")?.let { e -> Estado.entries.firstOrNull { it.name == e } }
            ?.let { e -> _estado.update { it.copy(estado = e, estadoDelPci = e) } }
        ruta.get<String>("plazo")?.let { p -> Plazo.entries.firstOrNull { it.name == p } }
            ?.let { p -> _estado.update { it.copy(plazo = p) } }
        ruta.get<String>("pci")?.let { id -> _estado.update { it.copy(abierto = id) } }
        cargar()
    }

    /** Al volver de la cámara: las fotos recién tomadas cambian las cuentas y el estado. */
    fun alVolver() {
        if (cargoUnaVez) cargar(silencioso = true)
    }

    fun abrirPci(id: String) = _estado.update { it.copy(abierto = id, estadoDelPci = Estado.PENDIENTES) }
    fun cerrarPci() = _estado.update { it.copy(abierto = null, ficha = null) }

    /** Tocar un contador filtra por él; tocarlo otra vez vuelve a lo pendiente. */
    fun elegirContador(e: Estado) = _estado.update {
        it.copy(estado = if (it.estado == e) Estado.PENDIENTES else e)
    }
    fun filtrarEstadoDelPci(e: Estado) = _estado.update { it.copy(estadoDelPci = e) }
    fun filtrarPlazo(p: Plazo?) = _estado.update { it.copy(plazo = if (it.plazo == p) null else p) }
    fun buscar(texto: String) = _estado.update { it.copy(busqueda = texto) }

    fun abrirFicha(item: ItemPci) = _estado.update { it.copy(ficha = item.id, aviso = null, error = null) }
    /** Al cerrar la ficha se va con ella lo que decía: no reaparece abajo. */
    fun cerrarFicha() = _estado.update { it.copy(ficha = null, aviso = null, error = null) }
    fun camaraAbierta() = _estado.update { it.copy(irACamara = null) }
    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    /** La foto referencial del ítem, con un enlace temporal. */
    fun verReferencia(item: ItemPci) {
        val ruta = item.fotoReferencia ?: return
        viewModelScope.launch {
            val url = documentos.enlace(ruta)
            _estado.update {
                if (url == null) it.copy(error = "No se pudo abrir la foto referencial. Revisa la señal.")
                else it.copy(referencia = url)
            }
        }
    }

    fun cerrarReferencia() = _estado.update { it.copy(referencia = null) }

    /**
     * La foto de una fase. Si el ítem no se había iniciado, se inicia
     * primero; si no hay señal para eso, la foto se toma igual: lo que
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

    /** El metrado es opcional: el ítem queda conforme por sus fotos. */
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
                val pcis = campo.pciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id).filter { it.activo }
                // Las fotos del teléfono que aún no suben cuentan igual: el
                // capataz las tomó y no tiene por qué volver a tomarlas
                val locales = runCatching { partes.fotosPciPorEnviar() }.getOrDefault(emptyList())
                fun local(id: String, fase: String) = locales.filter { it.pciItemId == id && it.fase == fase }.sumOf { it.cuantas }
                val activos = pcis.map { it.pciId }.toSet()
                val items = campo.itemsPciDeLaCuadrilla(cuadrilla.servicioId, cuadrilla.id)
                    .filter { it.activoParaCuadrilla && it.pciId in activos }
                    .map { i ->
                        i.copy(
                            fotosAntes = i.fotosAntes + local(i.id, "antes"),
                            fotosDurante = i.fotosDurante + local(i.id, "durante"),
                            fotosDespues = i.fotosDespues + local(i.id, "despues"),
                        )
                    }
                val porEnviar = locales.groupBy { it.pciItemId }.mapValues { (_, l) -> l.sumOf { it.cuantas } }
                cargoUnaVez = true
                _estado.update {
                    it.copy(
                        cargando = false,
                        pcis = pcis,
                        items = items,
                        fotosPorEnviar = porEnviar,
                        cuadrilla = cuadrilla.name,
                        // Si el PCI abierto se pausó, se vuelve a la vista general
                        abierto = it.abierto?.takeIf { id -> id in activos },
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
