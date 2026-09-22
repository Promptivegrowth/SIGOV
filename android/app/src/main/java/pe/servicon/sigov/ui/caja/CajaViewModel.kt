package pe.servicon.sigov.ui.caja

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.Caja
import pe.servicon.sigov.datos.CajaRepositorio
import pe.servicon.sigov.datos.Movimiento
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import java.io.File
import javax.inject.Inject

data class EstadoCaja(
    val cargando: Boolean = true,
    val caja: Caja? = null,
    val movimientos: List<Movimiento> = emptyList(),
    /** Anotados en el equipo y todavía sin subir. */
    val enCola: List<Movimiento> = emptyList(),
    /** Si el saldo lo acaba de calcular el servidor o viene de la copia. */
    val saldoFresco: Boolean = true,
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    /**
     * El saldo de verdad: el que informa el servidor menos lo que el capataz
     * ya gastó y sigue esperando señal.
     */
    val saldo: Double
        get() {
            val base = if (saldoFresco) {
                caja?.balance ?: 0.0
            } else {
                // La copia del saldo y la de los movimientos se guardaron en
                // momentos distintos: sin red se vuelve a sumar, que siempre
                // es coherente consigo mismo.
                movimientos.filter { it.status != "anulado" }.sumOf { it.importeConSigno }
            }
            return base + enCola.sumOf { it.importeConSigno }
        }

    val saldoBajo: Boolean
        get() = caja != null && saldo <= caja.saldoMinimo

    /** Lo pendiente primero: es lo que el capataz acaba de anotar. */
    val todos: List<Movimiento> get() = enCola + movimientos
}

/**
 * La caja chica de la cuadrilla.
 *
 * El responsable necesita dos cosas: saber cuánto le queda y poder anotar el
 * gasto en el momento, con la boleta en la mano. Lo demás —aprobar, observar,
 * rendir— es trabajo de administración en la web.
 */
@HiltViewModel
class CajaViewModel @Inject constructor(
    private val caja: CajaRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoCaja())
    val estado: StateFlow<EstadoCaja> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val mia = caja.miCaja(cuadrilla.servicioId, cuadrilla.id)
                    ?: error("Todavía no te abrieron caja chica. Pídesela a administración.")
                val movimientos = caja.movimientos(mia.caja.id, cuadrilla.servicioId)
                val pendientes = caja.enCola(movimientos)
                _estado.update {
                    it.copy(
                        cargando = false,
                        caja = mia.caja,
                        saldoFresco = mia.fresca,
                        movimientos = movimientos,
                        enCola = pendientes,
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun registrarGasto(
        importe: Double,
        rubro: String,
        descripcion: String,
        proveedor: String?,
        ruc: String?,
        tipoComprobante: String,
        numeroComprobante: String?,
        foto: File?,
        alTerminar: () -> Unit,
    ) {
        val mia = _estado.value.caja ?: return
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                caja.registrarGasto(
                    caja = mia,
                    importe = importe,
                    rubro = rubro,
                    descripcion = descripcion,
                    proveedor = proveedor,
                    rucProveedor = ruc,
                    tipoComprobante = tipoComprobante,
                    numeroComprobante = numeroComprobante,
                    fotoComprobante = foto,
                )
            }.onSuccess {
                _estado.update {
                    it.copy(guardando = false, aviso = "Gasto anotado. Se enviará al haber señal.")
                }
                alTerminar()
                cargar()
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun pedirDeposito(importe: Double, motivo: String, alTerminar: () -> Unit) {
        val mia = _estado.value.caja ?: return
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching { caja.pedirDeposito(mia, importe, motivo, null) }
                .onSuccess {
                    _estado.update {
                        it.copy(
                            guardando = false,
                            aviso = "Solicitud enviada. Administración la verá en la web.",
                        )
                    }
                    alTerminar()
                }
                .onFailure { fallo ->
                    _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
                }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
