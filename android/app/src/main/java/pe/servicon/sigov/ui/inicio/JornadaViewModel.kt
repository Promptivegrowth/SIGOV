package pe.servicon.sigov.ui.inicio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.CajaRepositorio
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.DocumentoDelDia
import pe.servicon.sigov.datos.DocumentosRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.sync.ColaRepositorio
import javax.inject.Inject

data class EstadoJornada(
    val nombre: String = "",
    val cuadrilla: String = "",
    val cuadrillaCodigo: String = "",
    val supervisor: String = "",
    val sector: String = "",
    val saldo: String = "—",
    val fecha: String = "",
    val fechaCorta: String = "",
    val saludo: String = "",
    val programadas: Int = 0,
    val pci: Int = 0,
    val pendientes: Int = 0,
    /** El rol de quien entra: decide qué apartados se le ofrecen. */
    val rol: String = "jefe_cuadrilla",
    /** Los formatos que la cuadrilla debe tener hoy (OBS-53, §16). */
    val documentos: List<DocumentoDelDia> = emptyList(),
    /**
     * El día cuyos documentos se ven (Elvis, video del 12/10): hoy, o uno
     * anterior para subsanar lo que faltó. Nunca uno futuro.
     */
    val diaDocumentos: java.time.LocalDate = Peru.hoy(),
    /** Avisos sin leer: la campana de arriba. */
    val avisos: Int = 0,
    val error: String? = null,
    /** Mientras no se sepa la cuadrilla, no se afirma nada sobre ella */
    val cargando: Boolean = true,
)

@HiltViewModel
class JornadaViewModel @Inject constructor(
    private val sesion: SesionRepositorio,
    private val colaEnvio: ColaRepositorio,
    private val campo: CampoRepositorio,
    private val caja: CajaRepositorio,
    private val documentosRepo: DocumentosRepositorio,
    private val avisosRepo: pe.servicon.sigov.datos.AvisosRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoJornada())
    val estado: StateFlow<EstadoJornada> = _estado.asStateFlow()

    init {
        _estado.update {
            it.copy(
                fecha = Peru.fechaLarga(),
                fechaCorta = Peru.fechaCorta(),
                saludo = saludoSegunLaHora(),
            )
        }
        cargar()
        vigilarPendientes()
        viewModelScope.launch {
            avisosRepo.sinLeer.collectLatest { n -> _estado.update { it.copy(avisos = n) } }
        }
    }

    /** Cuántos registros esperan señal, en vivo. */
    private fun vigilarPendientes() {
        viewModelScope.launch {
            var antes: Int? = null
            colaEnvio.pendientes.collectLatest { cuantos ->
                _estado.update { it.copy(pendientes = cuantos) }
                // Cuando la cola termina de enviar algo, el estado de los
                // documentos cambió en la nube: se vuelve a consultar
                if (antes != null && cuantos < antes!!) refrescarDocumentos()
                antes = cuantos
            }
        }
    }

    /** Buenos días a las seis de la mañana, que es cuando se abre la app. */
    private fun saludoSegunLaHora(): String = when (Peru.hora().hour) {
        in 0..11 -> "Buenos días"
        in 12..18 -> "Buenas tardes"
        else -> "Buenas noches"
    }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val perfil = sesion.perfil()
                val cuadrilla = sesion.cuadrilla()
                _estado.update {
                    it.copy(
                        nombre = perfil?.nombre.orEmpty(),
                        rol = perfil?.role ?: "jefe_cuadrilla",
                        cuadrilla = cuadrilla?.name.orEmpty(),
                        cuadrillaCodigo = cuadrilla?.code.orEmpty(),
                    )
                }

                // El resto se baja después del perfil para que la pantalla no
                // espere a la red para mostrar el nombre.
                if (cuadrilla == null) {
                    _estado.update { it.copy(cargando = false) }
                    return@runCatching
                }
                runCatching { campo.bajarCatalogos(cuadrilla.servicioId) }

                val programado = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id)
                val pci = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id)
                val miCaja = runCatching { caja.miCaja(cuadrilla.servicioId, cuadrilla.id) }.getOrNull()
                val jefe = runCatching { sesion.supervisor(cuadrilla.servicioId, cuadrilla.id) }.getOrNull()
                val documentos = runCatching { documentosRepo.delDia(cuadrilla.servicioId, cuadrilla.id) }
                    .getOrDefault(emptyList())
                // Los avisos: la campana y, si hay nuevos, la notificación del teléfono
                runCatching { avisosRepo.notificarNuevos() }

                _estado.update {
                    it.copy(
                        programadas = programado.size,
                        pci = pci.size,
                        // El sector sale de lo que hoy toca; si no hay nada
                        // programado, del primer PCI asignado.
                        sector = (programado.firstOrNull()?.tramo
                            ?: pci.firstOrNull()?.tramo).orEmpty(),
                        supervisor = jefe.orEmpty(),
                        documentos = documentos,
                        saldo = miCaja?.caja?.let { c -> soles(c.balance) } ?: "—",
                        cargando = false,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano(), cargando = false) }
            }
        }
    }

    /** Al volver a la jornada los números pueden haber cambiado. */
    fun refrescar() = cargar()

    /**
     * Al volver de otra pantalla se actualizan los documentos del día que se
     * está viendo (Elvis, video del 12/10: la charla ya tenía sus dos fotos
     * y en la Jornada seguía «Pendiente»). Es liviano: no vuelve a bajar los
     * catálogos ni la programación.
     */
    fun refrescarDocumentos() {
        viewModelScope.launch {
            val cuadrilla = runCatching { sesion.cuadrilla() }.getOrNull() ?: return@launch
            val dia = _estado.value.diaDocumentos
            val documentos = runCatching { documentosRepo.delDia(cuadrilla.servicioId, cuadrilla.id, dia) }
                .getOrNull() ?: return@launch
            val miCaja = runCatching { caja.miCaja(cuadrilla.servicioId, cuadrilla.id) }.getOrNull()
            _estado.update {
                if (it.diaDocumentos != dia) it
                else it.copy(documentos = documentos, saldo = miCaja?.caja?.let { c -> soles(c.balance) } ?: it.saldo)
            }
        }
    }

    /** Ver los documentos de otro día: hoy o uno anterior, nunca a futuro. */
    fun verDia(dia: java.time.LocalDate) {
        val elegido = if (dia.isAfter(Peru.hoy())) Peru.hoy() else dia
        _estado.update { it.copy(diaDocumentos = elegido, fechaCorta = Peru.fechaCorta(elegido)) }
        refrescarDocumentos()
    }

    fun salir(alSalir: () -> Unit) {
        viewModelScope.launch {
            runCatching { sesion.salir() }
            alSalir()
        }
    }
}

/** El saldo como se dice en obra: «S/ 1,274.50». */
private fun soles(monto: Double): String =
    "S/ " + String.format(java.util.Locale("es", "PE"), "%,.2f", monto)
