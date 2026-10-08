package pe.servicon.sigov.ui.programacion

import pe.servicon.sigov.datos.local.ParteDao
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
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import java.time.LocalDate
import javax.inject.Inject

data class EstadoProgramacion(
    val cargando: Boolean = true,
    val fecha: LocalDate = Peru.hoy(),
    val items: List<ItemProgramado> = emptyList(),
    val cuadrilla: String = "",
    val trabajando: String? = null,   // el id de la partida que se está cambiando
    val aviso: String? = null,
    val error: String? = null,
    /** La partida que se quiso finalizar sin avance: abre el aviso (OBS-04). */
    val sinAvance: ItemProgramado? = null,
) {
    val esHoy: Boolean get() = fecha == Peru.hoy()
    val metaTotal: Double get() = items.sumOf { it.meta ?: 0.0 }
    val ejecutadoTotal: Double get() = items.sumOf { it.ejecutado ?: 0.0 }
}

/**
 * La programación del día.
 *
 * Es lo primero que se mira al bajar de la camioneta: qué partidas toca, en
 * qué tramo y cuánto se espera. Se puede mover de día para revisar lo de
 * ayer o preparar lo de mañana.
 */
@HiltViewModel
class ProgramacionViewModel @Inject constructor(
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoProgramacion())
    val estado: StateFlow<EstadoProgramacion> = _estado.asStateFlow()

    init { cargar(Peru.hoy()) }

    fun moverDia(dias: Long) = cargar(_estado.value.fecha.plusDays(dias))

    fun volverAHoy() = cargar(Peru.hoy())

    fun iniciar(item: ItemProgramado) = accion(item, "Partida iniciada. Suerte allá afuera.") {
        campo.iniciarPartida(item.id)
    }

    /**
     * Finalizar exige avance registrado (OBS-04). Antes se mandaba igual y el
     * rechazo del servidor llegaba como error técnico; ahora se pregunta
     * primero, con la salida a la mano: registrar el avance o cancelar.
     */
    fun finalizar(item: ItemProgramado) {
        viewModelScope.launch {
            val enLaNube = (item.ejecutado ?: 0.0) > 0
            val enElEquipo = runCatching { partes.registrosDePartida(item.id) }.getOrDefault(0) > 0
            when {
                !enLaNube && !enElEquipo -> _estado.update { it.copy(sinAvance = item) }
                // Lo anotó sin señal: el servidor todavía no lo conoce
                !enLaNube -> _estado.update {
                    it.copy(aviso = "Tu avance todavía no se envía. Cuando se sincronice, vuelve a finalizar la actividad.")
                }
                else -> accion(item, "Partida cerrada. Queda esperando el visto bueno del supervisor.") {
                    campo.finalizarPartida(item.id)
                }
            }
        }
    }

    fun cerrarAvisoSinAvance() = _estado.update { it.copy(sinAvance = null) }

    fun reportarImpedimento(item: ItemProgramado, motivo: String) =
        accion(item, "Reportado. El supervisor ya lo sabe.") {
            campo.reportarImpedimento(item.id, motivo)
        }

    /**
     * El molde de las tres: marcar, hacer, recargar.
     *
     * Se recarga desde la nube en vez de tocar la lista en memoria porque
     * el servidor puede decidir otra cosa —rechazar el cierre, por ejemplo—
     * y enseñar un estado que el servidor no aceptó sería mentir.
     */
    private fun accion(item: ItemProgramado, exito: String, bloque: suspend () -> Unit) {
        _estado.update { it.copy(trabajando = item.id, error = null) }
        viewModelScope.launch {
            runCatching { bloque() }
                .onSuccess {
                    _estado.update { it.copy(trabajando = null, aviso = exito) }
                    cargar(_estado.value.fecha)
                }
                // Un fallo al actuar se avisa abajo; la lista sigue a la vista
                .onFailure { fallo ->
                    _estado.update { it.copy(trabajando = null, aviso = fallo.enCristiano()) }
                }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    private fun cargar(fecha: LocalDate) {
        _estado.update { it.copy(cargando = true, fecha = fecha, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val items = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id, fecha)
                _estado.update {
                    it.copy(cargando = false, items = items, cuadrilla = cuadrilla.name)
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
