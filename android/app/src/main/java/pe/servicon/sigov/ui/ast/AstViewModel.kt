package pe.servicon.sigov.ui.ast

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.AptitudDelConductor
import pe.servicon.sigov.datos.AstRegistrado
import pe.servicon.sigov.datos.AstRepositorio
import pe.servicon.sigov.datos.CharlaRepositorio
import pe.servicon.sigov.datos.FirmaDeAsistente
import pe.servicon.sigov.datos.MiembroDeCuadrilla
import pe.servicon.sigov.datos.Peligro
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.SsomaRepositorio
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.Vehiculo
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

data class EstadoAst(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    val integrantes: List<MiembroDeCuadrilla> = emptyList(),
    val vehiculos: List<Vehiculo> = emptyList(),
    val hechosHoy: List<AstRegistrado> = emptyList(),
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val deCuadrillaHecho: Boolean get() = hechosHoy.any { it.kind == "cuadrilla" }
    val deConductorHecho: Boolean get() = hechosHoy.any { it.kind == "conductor" }
}

/**
 * El análisis de seguridad antes de empezar la jornada.
 *
 * Son dos documentos y el orden importa: primero el del conductor —si no
 * está en condiciones, la cuadrilla no sale— y después el de la cuadrilla,
 * al pie del trabajo.
 */
@HiltViewModel
class AstViewModel @Inject constructor(
    private val ast: AstRepositorio,
    private val charlas: CharlaRepositorio,
    private val ssoma: SsomaRepositorio,
    private val sesion: SesionRepositorio,
    private val ubicacion: Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoAst())
    val estado: StateFlow<EstadoAst> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        _estado.update { it.copy(cargando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                _estado.update {
                    it.copy(
                        cargando = false,
                        cuadrilla = cuadrilla.name,
                        integrantes = charlas.miembros(cuadrilla.servicioId, cuadrilla.id),
                        vehiculos = ssoma.vehiculos(cuadrilla.servicioId)
                            .filter { v -> v.cuadrillaId == null || v.cuadrillaId == cuadrilla.id },
                        hechosHoy = ast.delDia(cuadrilla.servicioId, cuadrilla.id),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    fun registrarDeConductor(
        vehiculo: Vehiculo,
        aptitud: AptitudDelConductor,
        firma: Bitmap,
        nombre: String,
        alTerminar: () -> Unit,
    ) = guardando {
        val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
        ast.registrarDeConductor(
            servicioId = cuadrilla.servicioId,
            cuadrillaId = cuadrilla.id,
            vehiculoId = vehiculo.id,
            placa = vehiculo.plate,
            aptitud = aptitud,
            firma = FirmaDeAsistente(
                // El conductor firma por sí mismo: no es un integrante de la
                // lista, es quien está usando el teléfono.
                miembro = MiembroDeCuadrilla(
                    id = cuadrilla.id,
                    cuadrillaId = cuadrilla.id,
                    nombre = nombre,
                ),
                trazo = firma,
            ),
            punto = runCatching { ubicacion.actual() }.getOrNull(),
        )
        alTerminar()
        if (aptitud.apto) {
            "AST del conductor registrado. Buen viaje."
        } else {
            "Registrado como NO APTO. El supervisor ya lo sabe: no manejes."
        }
    }

    fun registrarDeCuadrilla(
        tarea: String,
        lugar: String?,
        peligros: List<Peligro>,
        epp: List<String>,
        riesgoMaximo: String,
        firmas: Map<String, Bitmap>,
        alTerminar: () -> Unit,
    ) = guardando {
        val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
        val integrantes = _estado.value.integrantes.associateBy { it.id }
        ast.registrarDeCuadrilla(
            servicioId = cuadrilla.servicioId,
            cuadrillaId = cuadrilla.id,
            tarea = tarea,
            lugar = lugar,
            tramoId = null,
            progresiva = null,
            peligros = peligros,
            epp = epp,
            riesgoMaximo = riesgoMaximo,
            firmas = firmas.mapNotNull { (id, trazo) ->
                integrantes[id]?.let { FirmaDeAsistente(it, trazo) }
            },
            punto = runCatching { ubicacion.actual() }.getOrNull(),
        )
        alTerminar()
        "AST de la cuadrilla registrado con ${firmas.size} firmas."
    }

    /** El molde de los dos registros: marcar, hacer, recargar. */
    private fun guardando(bloque: suspend () -> String) {
        _estado.update { it.copy(guardando = true, error = null) }
        viewModelScope.launch {
            runCatching { bloque() }
                .onSuccess { mensaje ->
                    _estado.update { it.copy(guardando = false, aviso = mensaje) }
                    cargar()
                }
                .onFailure { fallo ->
                    _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
                }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
