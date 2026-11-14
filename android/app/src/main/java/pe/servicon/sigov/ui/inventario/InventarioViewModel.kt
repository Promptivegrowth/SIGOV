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
import pe.servicon.sigov.datos.Configuracion
import pe.servicon.sigov.datos.ElementoVial
import pe.servicon.sigov.datos.EvidenciaRepositorio
import pe.servicon.sigov.datos.FotoDeActivo
import pe.servicon.sigov.datos.IntervencionDeActivo
import pe.servicon.sigov.datos.InventarioRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.ResumenDeTipo
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import java.io.File
import javax.inject.Inject

/** El estado del elemento: la leyenda del boceto (Intervenido, Por vencer, Crítico, Sin intervenir). */
enum class Semaforo(val clave: String, val etiqueta: String) {
    AL_DIA("al_dia", "Intervenido"),
    POR_VENCER("por_vencer", "Por vencer"),
    CRITICO("critico", "Crítico"),
    SIN_INTERVENIR("sin_intervenir", "Sin intervenir");

    companion object {
        fun de(clave: String?): Semaforo =
            entries.firstOrNull { it.clave == clave } ?: SIN_INTERVENIR
    }
}

/** Un tramo del contrato, como chip: «Tramo 1» o su código. */
data class TramoDelInventario(val id: String, val etiqueta: String, val nombre: String?, val orden: Int)

data class EstadoInventario(
    /** La cámara del inventario, como la de PCI (OBS 13): GPS y sello. */
    val gpsCamara: String? = null,
    val buscandoGpsCamara: Boolean = false,
    val selloCamara: pe.servicon.sigov.datos.Sello? = null,
    val cargando: Boolean = true,
    val servicioId: String = "",
    val todos: List<ElementoVial> = emptyList(),
    val resumen: List<ResumenDeTipo> = emptyList(),
    // Lo que se eligió ver
    val tramoId: String? = null,
    val tipos: Set<String> = emptySet(),
    val semaforos: Set<Semaforo> = emptySet(),
    /** Solo los que la última foto de campo dejó observados. */
    val soloObservados: Boolean = false,
    // El elemento abierto
    val abierto: ElementoVial? = null,
    val historial: List<IntervencionDeActivo> = emptyList(),
    /** Las fotos del elemento abierto, cada una con la dirección de su miniatura. */
    val galeria: List<Pair<FotoDeActivo, String?>> = emptyList(),
    /** Los campos del inventario de cada tipo, para enseñarlos con su etiqueta. */
    val campos: Map<String, List<CampoDelTipo>> = emptyMap(),
    val cargandoFicha: Boolean = false,
    val guardandoFoto: Boolean = false,
    val buscandoUbicacion: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    /** Tramo 1 a 4 (y la vía alterna), de lo que hay en el inventario. */
    val tramos: List<TramoDelInventario>
        get() = todos.filter { it.tramoId != null }
            .distinctBy { it.tramoId }
            .map { TramoDelInventario(it.tramoId!!, it.tramoCorto ?: "Tramo", it.tramo, it.tramoNumero ?: 99) }
            .sortedWith(compareBy<TramoDelInventario> { it.orden }.thenBy { it.etiqueta })

    private val delTramo: List<ElementoVial>
        get() = todos.filter { tramoId == null || it.tramoId == tramoId }

    /** Los elementos que pasan los filtros: es lo que se dibuja. */
    val visibles: List<ElementoVial>
        get() = delTramo.filter { e ->
            (tipos.isEmpty() || e.tipoCodigo in tipos) &&
                (semaforos.isEmpty() || Semaforo.de(e.semaforo) in semaforos) &&
                (!soloObservados || e.observado)
        }

    /** Las cuentas de la leyenda, con el tramo y los componentes elegidos. */
    val porSemaforo: Map<Semaforo, Int>
        get() = delTramo.filter { tipos.isEmpty() || it.tipoCodigo in tipos }
            .groupingBy { Semaforo.de(it.semaforo) }
            .eachCount()

    val observados: Int
        get() = delTramo.count { (tipos.isEmpty() || it.tipoCodigo in tipos) && it.observado }

    /** El color de cada componente, para los chips y el mapa. */
    val colores: Map<String, String?>
        get() = todos.filter { it.tipoCodigo != null }.distinctBy { it.tipoCodigo }.associate { it.tipoCodigo!! to it.color }

    val etiquetaDelTramo: String?
        get() = tramos.firstOrNull { it.id == tramoId }?.etiqueta
}

/**
 * El inventario del tramo, en el celular (boceto de Elvis del 14/10).
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
    private val evidencias: EvidenciaRepositorio,
    private val configuracion: Configuracion,
    private val ubicacion: pe.servicon.sigov.datos.Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoInventario())
    val estado: StateFlow<EstadoInventario> = _estado.asStateFlow()

    init { cargar() }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val servicioId = sesion.servicioId()
                    ?: error("Tu usuario no está asignado a ningún contrato.")

                // Primero lo guardado, para que la pantalla abra al instante
                val guardado = inventario.elementos(servicioId, refrescar = false)
                if (guardado.isNotEmpty()) {
                    _estado.update {
                        it.copy(servicioId = servicioId, todos = guardado, cargando = false)
                    }
                }

                val campos = inventario.camposPorTipo()
                val frescos = inventario.elementos(servicioId, refrescar = true)
                // De entrada, el tramo de la cuadrilla, con sus cuentas
                val tramo = _estado.value.tramoId ?: sesion.cuadrilla()?.tramoId?.takeIf { id -> frescos.any { e -> e.tramoId == id } }
                val resumen = inventario.resumen(servicioId, tramo)

                _estado.update {
                    it.copy(
                        servicioId = servicioId,
                        todos = frescos.ifEmpty { guardado },
                        resumen = resumen,
                        campos = campos,
                        cargando = false,
                        tramoId = tramo,
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

    fun alternarObservados() = _estado.update { it.copy(soloObservados = !it.soloObservados) }

    fun limpiarTipos() = _estado.update { it.copy(tipos = emptySet()) }

    /** Abre la ficha: el historial y las fotos se piden al vuelo, en miniatura. */
    fun abrir(elemento: ElementoVial) {
        _estado.update {
            it.copy(abierto = elemento, cargandoFicha = true, historial = emptyList(), galeria = emptyList())
        }
        cargarFicha(elemento)
    }

    private fun cargarFicha(elemento: ElementoVial) {
        viewModelScope.launch {
            val historial = inventario.historial(elemento.id)
            val fotos = inventario.galeria(elemento.id)
            // Las que aún no suben, desde el teléfono y con su rótulo (OBS 12)
            val enLaNube = fotos.mapNotNull { it.clientId }.toSet()
            val locales = runCatching { evidencias.pendientesDeActivo(elemento.id) }.getOrDefault(emptyList())
                .filter { (e, _) -> e.clientId !in enLaNube }
                .map { (e, estadoFoto) ->
                    FotoDeActivo(
                        id = e.clientId, clientId = e.clientId, ruta = e.rutaDestino,
                        tomada = java.time.Instant.ofEpochMilli(e.tomadaEn).toString(),
                        caption = e.leyenda, estado = estadoFoto, pendiente = true,
                    ) to (if (java.io.File(e.rutaLocal).exists()) "file://" + e.rutaLocal else null)
                }
            val galeria = locales.sortedByDescending { it.first.tomada } + fotos.map { it to inventario.urlDeMiniatura(it.ruta) }
            _estado.update {
                if (it.abierto?.id != elemento.id) it   // se abrió otro mientras tanto
                else it.copy(historial = historial, galeria = galeria, cargandoFicha = false)
            }
        }
    }

    /** Al abrir la cámara: la ubicación con su precisión y el sello del contrato (OBS 13). */
    fun prepararCamara() {
        _estado.update { it.copy(buscandoGpsCamara = true) }
        viewModelScope.launch {
            val sello = runCatching { configuracion.selloEfectivo(campo.ajustes(sesion.servicioId() ?: _estado.value.servicioId).sello) }.getOrNull()
            val punto = runCatching { ubicacion.actual() }.getOrNull()
            _estado.update {
                it.copy(
                    buscandoGpsCamara = false,
                    selloCamara = sello,
                    gpsCamara = punto?.let { p -> "%.5f, %.5f  ±%.0f m".format(p.latitud, p.longitud, p.precision) },
                )
            }
        }
    }

    /** Dónde está el teléfono, para verse en el mapa (Elvis, 26/10). */
    fun buscarMiUbicacion(alEncontrar: (Double, Double) -> Unit) {
        _estado.update { it.copy(buscandoUbicacion = true) }
        viewModelScope.launch {
            val punto = runCatching { ubicacion.actual() }.getOrNull()
            _estado.update {
                it.copy(
                    buscandoUbicacion = false,
                    error = if (punto == null) "No se pudo leer tu ubicación. Revisa el GPS y el permiso." else it.error,
                )
            }
            punto?.let { alEncontrar(it.latitud, it.longitud) }
        }
    }

    /**
     * Quita una foto de intervención tomada por error (Elvis, 26/10). La
     * nube recalcula el estado del elemento con las fotos que quedan.
     */
    fun quitarFoto(foto: FotoDeActivo) {
        val e = _estado.value.abierto ?: return
        val llave = foto.clientId ?: foto.id
        viewModelScope.launch {
            runCatching { evidencias.eliminarPorClientId(llave) }
                .onSuccess {
                    val quedan = _estado.value.galeria.filter { (f, _) -> f.id != foto.id && !f.esBase }
                    val ultima = quedan.maxByOrNull { (f, _) -> f.tomada ?: "" }?.first
                    // La visita de esa foto se descuenta si era la única del día (OBS 10),
                    // y la última visita pasa a ser la de la foto más reciente que queda
                    val dia = { iso: String? -> iso?.let { runCatching { java.time.OffsetDateTime.parse(it).atZoneSameInstant(Peru.zona).toLocalDate() }
                        .recoverCatching { _ -> java.time.Instant.parse(it).atZone(Peru.zona).toLocalDate() }.getOrNull() } }
                    val otraDelDia = quedan.any { (f, _) -> dia(f.tomada) != null && dia(f.tomada) == dia(foto.tomada) }
                    val eraLaUltima = e.ultimaVisitaEn != null && dia(e.ultimaVisitaEn) == dia(foto.tomada)
                    val actualizado = e.copy(
                        observado = ultima?.estado == "observado",
                        observacion = if (ultima?.estado == "observado") ultima.caption ?: "Observado en campo" else null,
                        visitas = if (otraDelDia) e.visitas else (e.visitas - 1).coerceAtLeast(0),
                        ultimaVisitaEn = if (eraLaUltima) ultima?.tomada else e.ultimaVisitaEn,
                        ultimaVisitaEstado = if (eraLaUltima) ultima?.estado else e.ultimaVisitaEstado,
                        ultimaVisitaComentario = if (eraLaUltima) ultima?.caption else e.ultimaVisitaComentario,
                        ultimaVisitaPor = if (eraLaUltima && ultima == null) null else e.ultimaVisitaPor,
                    )
                    _estado.update {
                        it.copy(
                            abierto = actualizado,
                            galeria = it.galeria.filter { (f, _) -> f.id != foto.id },
                            todos = it.todos.map { x -> if (x.id == e.id) actualizado else x },
                            aviso = "Foto quitada.",
                        )
                    }
                }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    /** La foto grande, cuando se toca una miniatura para ampliarla. */
    suspend fun urlGrande(ruta: String?): String? = inventario.urlDeFoto(ruta)

    suspend fun urlMiniatura(ruta: String?): String? = inventario.urlDeMiniatura(ruta)

    /** Donde la cámara deja la toma. */
    fun archivoTemporal(): File = evidencias.archivoTemporal()

    /**
     * La foto de intervención (boceto de Elvis): OK cuenta como intervención
     * y reinicia el plazo del elemento; Observado lo marca en rojo hasta que
     * otra foto lo deje OK. Se guarda en el equipo y sube al haber señal.
     */
    fun registrarFoto(toma: File, estado: String, comentario: String?) {
        val e = _estado.value.abierto ?: return
        _estado.update { it.copy(guardandoFoto = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                val servicioId = sesion.servicioId() ?: _estado.value.servicioId
                val ajustes = campo.ajustes(servicioId)
                evidencias.guardarDeActivo(
                    servicioId = servicioId,
                    activoId = e.id,
                    // El código identifica el registro en el sello (OBS 13)
                    nombre = listOfNotNull(e.code, e.name ?: e.tipo ?: "Elemento").joinToString(" · "),
                    tramoId = e.tramoId,
                    tramo = e.tramo,
                    progresiva = e.progresivaM,
                    lado = e.side,
                    original = toma,
                    estado = estado,
                    comentario = comentario?.trim()?.takeIf { it.isNotBlank() },
                    cuadrilla = cuadrilla?.name,
                    sello = configuracion.selloEfectivo(ajustes.sello),
                )
            }.onSuccess { local ->
                // Se ve al instante, desde el equipo; la nube lo confirma al subir
                val nueva = FotoDeActivo(
                    id = local.clientId,
                    clientId = local.clientId,
                    ruta = local.rutaDestino,
                    tomada = java.time.Instant.ofEpochMilli(local.tomadaEn).toString(),
                    caption = comentario?.trim()?.ifBlank { null },
                    estado = estado,
                    pendiente = true,
                ) to "file://" + local.rutaLocal
                // La ficha se actualiza al instante (OBS 10 y 11): última visita,
                // con hora, estado, comentario y quién; un día nuevo suma visita
                val ahora = java.time.Instant.ofEpochMilli(local.tomadaEn).toString()
                val diaNuevo = e.ultimaVisitaEn?.let {
                    runCatching { java.time.OffsetDateTime.parse(it).atZoneSameInstant(Peru.zona).toLocalDate() }.getOrNull()
                } != Peru.hoy()
                val conVisita = e.copy(
                    ultimaVisitaEn = ahora, ultimaVisitaEstado = estado,
                    ultimaVisitaComentario = comentario?.trim()?.ifBlank { null },
                    ultimaVisitaPor = sesion.perfil()?.nombre,
                    ultimaVisitaConHora = true,
                    visitas = if (diaNuevo) e.visitas + 1 else e.visitas,
                )
                val actualizado = if (estado == "ok") conVisita.copy(
                    semaforo = Semaforo.AL_DIA.clave, observado = false, observacion = null,
                    ultimaIntervencion = Peru.hoy().toString(), diasSinIntervenir = 0,
                ) else conVisita.copy(observado = true, observacion = comentario?.trim()?.ifBlank { null } ?: "Observado en campo")
                _estado.update {
                    it.copy(
                        guardandoFoto = false,
                        abierto = actualizado,
                        galeria = listOf(nueva) + it.galeria,
                        todos = it.todos.map { x -> if (x.id == e.id) actualizado else x },
                        aviso = "Foto guardada con fecha y hora. Se enviará al haber señal.",
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(guardandoFoto = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun cerrarFicha() = _estado.update { it.copy(abierto = null, historial = emptyList(), galeria = emptyList()) }

    fun avisoVisto() = _estado.update { it.copy(error = null, aviso = null) }

    fun refrescar() {
        _estado.update { it.copy(cargando = true) }
        cargar()
    }
}
