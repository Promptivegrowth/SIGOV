package pe.servicon.sigov.ui.charlas

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.Charla
import pe.servicon.sigov.datos.CharlaRepositorio
import pe.servicon.sigov.datos.FirmaDeAsistente
import pe.servicon.sigov.datos.HigieneDelDia
import pe.servicon.sigov.datos.HigieneRepositorio
import pe.servicon.sigov.datos.PuntoDeHigiene
import pe.servicon.sigov.datos.MiembroDeCuadrilla
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.TipoCharla
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

data class EstadoCharlas(
    val cargando: Boolean = true,
    val charlas: List<Charla> = emptyList(),
    val miembros: List<MiembroDeCuadrilla> = emptyList(),
    val higiene: HigieneDelDia? = null,
    /** Lo marcado y sin subir: cuenta como hecho, aunque la nube no lo sepa. */
    val higieneEnCola: Set<String> = emptySet(),
    val cuadrilla: String = "",
    val hoy: String = Peru.hoy().toString(),
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    /** Si ya se dictó la charla diaria: es la que se exige todos los días. */
    val diariaDeHoy: Charla?
        get() = charlas.firstOrNull { it.fecha == hoy && it.kind == "diaria" }

    fun higieneCumple(punto: PuntoDeHigiene): Boolean =
        higiene?.cumple(punto) == true || punto.valor in higieneEnCola

    val higieneCumplidos: Int
        get() = PuntoDeHigiene.entries.count { higieneCumple(it) }
}

/**
 * Charlas de seguridad.
 *
 * La de cinco minutos es la que se exige cada mañana; las demás se dictan
 * cuando toca. En todas, lo que vale es la lista firmada.
 */
@HiltViewModel
class CharlasViewModel @Inject constructor(
    private val charla: CharlaRepositorio,
    private val higiene: HigieneRepositorio,
    private val sesion: SesionRepositorio,
    private val ubicacion: Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoCharlas())
    val estado: StateFlow<EstadoCharlas> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val charlas = charla.charlas(cuadrilla.servicioId, cuadrilla.id)
                val miembros = charla.miembros(cuadrilla.servicioId, cuadrilla.id)
                val delDia = higiene.deHoy(cuadrilla.servicioId, cuadrilla.id)
                val pendientes = higiene.enCola()
                _estado.update {
                    it.copy(
                        cargando = false,
                        charlas = charlas,
                        miembros = miembros,
                        higiene = delDia,
                        higieneEnCola = pendientes,
                        cuadrilla = cuadrilla.name,
                        hoy = Peru.hoy().toString(),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun registrar(
        tipo: TipoCharla,
        tema: String,
        contenido: String?,
        minutos: Int,
        lugar: String?,
        firmas: Map<MiembroDeCuadrilla, Bitmap>,
        alTerminar: () -> Unit,
    ) {
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
                val perfil = sesion.perfil()
                val punto = runCatching { ubicacion.actual() }.getOrNull()
                charla.registrar(
                    servicioId = cuadrilla.servicioId,
                    cuadrillaId = cuadrilla.id,
                    tipo = tipo,
                    tema = tema,
                    contenido = contenido,
                    minutos = minutos,
                    lugar = lugar,
                    expositor = perfil?.nombre,
                    firmas = firmas.map { (miembro, trazo) -> FirmaDeAsistente(miembro, trazo) },
                    punto = punto,
                )
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = "Charla registrada con ${firmas.size} firma" +
                            (if (firmas.size == 1) "" else "s") + ".",
                    )
                }
                alTerminar()
                cargar()
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    /** Marca un punto de higiene del día. */
    fun marcarHigiene(punto: PuntoDeHigiene, personas: Int?) {
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
                val donde = runCatching { ubicacion.actual() }.getOrNull()
                higiene.marcar(cuadrilla.servicioId, cuadrilla.id, punto, personas, null, donde)
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        higieneEnCola = it.higieneEnCola + punto.valor,
                        aviso = "${punto.etiqueta}: registrado.",
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
