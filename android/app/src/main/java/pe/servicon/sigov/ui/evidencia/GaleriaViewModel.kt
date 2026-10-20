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
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.codigoCortoDePci
import pe.servicon.sigov.datos.contienePorBusqueda
import pe.servicon.sigov.datos.enCristiano
import java.time.LocalDate
import javax.inject.Inject

/** Los atajos de fecha del boceto: llenan la fecha inicio y la fecha fin. */
enum class Periodo(val etiqueta: String, val dias: Long) {
    HOY("Hoy", 0),
    SEMANA("7 días", 6),
    QUINCENA("15 días", 14),
    MES("30 días", 29),
}

/** De dónde salen las fotos: la programación (MR) o un PCI. */
enum class OrigenDeFoto(val etiqueta: String) { TODOS("Todos"), MR("MR"), PCI("PCI") }

/**
 * Las fotos de un trabajo: una actividad de la programación en un día, o un
 * ítem de PCI. Así las agrupa el boceto de Elvis (13/10).
 */
data class GrupoDeFotos(
    val clave: String,
    val esPci: Boolean,
    /** «MR / Programación» o «PCI 44 · Ítem 19». */
    val origen: String,
    val titulo: String,
    val ubicacion: String,
    val fecha: String,
    val fotos: List<EvidenciaEnGaleria>,
) {
    val antes get() = fotos.count { it.phase == "antes" }
    val durante get() = fotos.count { it.phase == "durante" }
    val despues get() = fotos.count { it.phase == "despues" }
}

data class EstadoGaleria(
    val cargando: Boolean = true,
    val fotos: List<EvidenciaEnGaleria> = emptyList(),
    val desde: LocalDate = Peru.hoy().minusDays(Periodo.SEMANA.dias),
    val hasta: LocalDate = Peru.hoy(),
    val origen: OrigenDeFoto = OrigenDeFoto.TODOS,
    /** Los PCI elegidos; vacío, todos. */
    val pcis: Set<String> = emptySet(),
    val busqueda: String = "",
    val masRecientes: Boolean = true,
    val cuadrilla: String = "",
    val error: String? = null,
) {
    val periodo: Periodo?
        get() = Periodo.entries.firstOrNull { hasta == Peru.hoy() && desde == hasta.minusDays(it.dias) }

    /** Los PCI con fotos en el rango, para elegirlos. */
    val pcisDelRango: List<String>
        get() = fotos.mapNotNull { it.pciCodigo }.distinct().sorted()

    val visibles: List<EvidenciaEnGaleria>
        get() {
            val texto = busqueda.trim()
            return fotos.filter { foto ->
                val esPci = foto.pciCodigo != null
                when (origen) {
                    OrigenDeFoto.MR -> !esPci
                    OrigenDeFoto.PCI -> esPci
                    OrigenDeFoto.TODOS -> true
                } && (!esPci || pcis.isEmpty() || foto.pciCodigo in pcis) &&
                    (texto.isBlank() || listOfNotNull(
                        foto.actividad, foto.pciCodigo, codigoCortoDePci(foto.pciCodigo),
                        foto.pciItem?.let { "ítem $it" }, foto.caption,
                    ).any { it.contienePorBusqueda(texto) })
            }
        }

    /** Las sugerencias del buscador: actividades y PCI de lo cargado. */
    val sugerencias: List<String>
        get() {
            val texto = busqueda.trim()
            if (texto.length < 2) return emptyList()
            return (fotos.mapNotNull { it.actividad } + fotos.mapNotNull { codigoCortoDePci(it.pciCodigo) })
                .distinct()
                .filter { it.contienePorBusqueda(texto) && !it.equals(texto, ignoreCase = true) }
                .take(5)
        }

    val grupos: List<GrupoDeFotos>
        get() = visibles
            .groupBy { f ->
                if (f.pciCodigo != null) "pci|${f.pciCodigo}|${f.pciItem}"
                else "mr|${f.fecha ?: f.tomadaEn.take(10)}|${f.actividadId ?: f.actividad}"
            }
            .map { (clave, fs) ->
                val f = fs.first()
                val esPci = f.pciCodigo != null
                GrupoDeFotos(
                    clave = clave,
                    esPci = esPci,
                    origen = if (esPci) listOfNotNull(codigoCortoDePci(f.pciCodigo), f.pciItem?.let { "Ítem $it" }).joinToString(" · ")
                             else "MR / Programación",
                    titulo = f.actividad ?: if (esPci) "Ítem de PCI" else "Actividad sin nombre",
                    ubicacion = listOfNotNull(f.tramo, f.progresiva?.let { pe.servicon.sigov.datos.Progresiva.aTexto(it) }?.let { "Km $it" })
                        .joinToString(", "),
                    fecha = fs.mapNotNull { it.fecha }.maxOrNull() ?: f.tomadaEn.take(10),
                    fotos = fs.sortedBy { it.tomadaEn },
                )
            }
            .let { lista -> if (masRecientes) lista.sortedByDescending { it.fecha } else lista.sortedBy { it.fecha } }
}

/**
 * Evidencias del jefe de cuadrilla (boceto de Elvis del 13/10): solo
 * visualización, sin exportar. Fecha inicio y fin, origen y PCI, y las fotos
 * agrupadas por trabajo. Sin filtro de etapa: las etapas se ven contadas.
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
        val hoy = Peru.hoy()
        _estado.update { it.copy(desde = hoy.minusDays(periodo.dias), hasta = hoy) }
        cargar()
    }

    fun cambiarDesde(fecha: LocalDate) {
        _estado.update { it.copy(desde = fecha, hasta = if (it.hasta.isBefore(fecha)) fecha else it.hasta) }
        cargar()
    }

    fun cambiarHasta(fecha: LocalDate) {
        _estado.update { it.copy(hasta = fecha, desde = if (it.desde.isAfter(fecha)) fecha else it.desde) }
        cargar()
    }

    fun cambiarOrigen(origen: OrigenDeFoto) = _estado.update { it.copy(origen = origen) }

    fun alternarPci(codigo: String) = _estado.update {
        it.copy(pcis = if (codigo in it.pcis) it.pcis - codigo else it.pcis + codigo)
    }

    fun buscar(texto: String) = _estado.update { it.copy(busqueda = texto) }

    fun alternarOrden() = _estado.update { it.copy(masRecientes = !it.masRecientes) }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val fotos = evidencias.galeria(
                    servicioId = cuadrilla.servicioId,
                    cuadrillaId = cuadrilla.id,
                    desde = _estado.value.desde.toString(),
                    hasta = _estado.value.hasta.toString(),
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
