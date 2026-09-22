package pe.servicon.sigov.ui.evidencia

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.EvidenciaRepositorio
import pe.servicon.sigov.datos.AjustesDelServicio
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Punto
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.local.EvidenciaLocal
import pe.servicon.sigov.datos.local.ParteDao
import pe.servicon.sigov.datos.local.RegistroLocal
import java.io.File
import javax.inject.Inject

data class EstadoCamara(
    val registro: RegistroLocal? = null,
    val evidencias: List<EvidenciaLocal> = emptyList(),
    val fase: Fase = Fase.DURANTE,
    val conMarcaDeAgua: Boolean = true,
    val ajustes: AjustesDelServicio = AjustesDelServicio(),
    val cuadrilla: String? = null,
    val punto: Punto? = null,
    val buscandoGps: Boolean = true,
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
)

/**
 * La cámara de evidencias.
 *
 * Mientras el capataz encuadra, la app ya está buscando la posición: cuando
 * dispara, el sello sale completo sin hacerlo esperar.
 */
@HiltViewModel
class CamaraViewModel @Inject constructor(
    private val evidencias: EvidenciaRepositorio,
    private val partes: ParteDao,
    private val ubicacion: Ubicacion,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoCamara())
    val estado: StateFlow<EstadoCamara> = _estado.asStateFlow()

    fun abrir(registroClientId: String) {
        viewModelScope.launch {
            val registro = partes.registro(registroClientId)
            if (registro == null) {
                _estado.update { it.copy(error = "No se encontró la actividad.") }
                return@launch
            }
            _estado.update {
                it.copy(
                    registro = registro,
                    // El formato del sello lo fija el contrato, no la app
                    ajustes = campo.ajustes(registro.servicioId),
                    cuadrilla = runCatching { sesion.cuadrilla()?.name }.getOrNull(),
                )
            }
            evidencias.evidenciasDe(registroClientId).collectLatest { fotos ->
                _estado.update { it.copy(evidencias = fotos) }
            }
        }
        buscarPosicion()
    }

    /** Se adelanta a la toma: engancha el GPS mientras el capataz encuadra. */
    fun buscarPosicion() {
        _estado.update { it.copy(buscandoGps = true) }
        viewModelScope.launch {
            val punto = runCatching { ubicacion.actual() }.getOrNull()
            _estado.update { it.copy(punto = punto, buscandoGps = false) }
        }
    }

    fun cambiarFase(fase: Fase) = _estado.update { it.copy(fase = fase) }

    fun alternarMarca() = _estado.update { it.copy(conMarcaDeAgua = !it.conMarcaDeAgua) }

    fun archivoTemporal(): File = evidencias.archivoTemporal()

    fun sellar(toma: File, leyenda: String? = null) {
        val registro = _estado.value.registro ?: return
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                evidencias.guardar(
                    registro = registro,
                    original = toma,
                    fase = _estado.value.fase,
                    leyenda = leyenda,
                    conMarcaDeAgua = _estado.value.conMarcaDeAgua,
                    sello = _estado.value.ajustes.sello,
                    cuadrilla = _estado.value.cuadrilla,
                    pciCodigo = _estado.value.registro?.pciCodigo,
                )
            }.onSuccess {
                _estado.update {
                    it.copy(guardando = false, aviso = "Foto sellada. Se enviará al haber señal.")
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun fallo(mensaje: String) = _estado.update { it.copy(error = mensaje, guardando = false) }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
