package pe.servicon.sigov.ui.ast

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.AstRegistrado
import pe.servicon.sigov.datos.AstRepositorio
import pe.servicon.sigov.datos.DocumentoDelDia
import pe.servicon.sigov.datos.DocumentosRepositorio
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import javax.inject.Inject

data class EstadoAst(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    /** El ATS de la cuadrilla de hoy (documento del día). */
    val deCuadrilla: DocumentoDelDia? = null,
    /** Un ATS del conductor por cada vehículo asignado hoy. */
    val deConductores: List<DocumentoDelDia> = emptyList(),
    /** El PETAR, si ya se subió hoy. */
    val petar: DocumentoDelDia? = null,
    /** Los ATS que se llenaron en el celular antes del cambio. */
    val hechosHoy: List<AstRegistrado> = emptyList(),
    val error: String? = null,
)

/**
 * El ATS del día, por foto (Elvis, P43): uno de la cuadrilla y uno del
 * conductor por cada vehículo asignado, «ya no digital». El PETAR también va
 * con foto, si ese día lo hay (P44).
 */
@HiltViewModel
class AstViewModel @Inject constructor(
    private val ast: AstRepositorio,
    private val documentos: DocumentosRepositorio,
    private val sesion: SesionRepositorio,
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
                val delDia = documentos.delDia(cuadrilla.servicioId, cuadrilla.id)
                _estado.update {
                    it.copy(
                        cargando = false,
                        cuadrilla = cuadrilla.name,
                        deCuadrilla = delDia.firstOrNull { d -> d.tipo == "ats" },
                        deConductores = delDia.filter { d -> d.tipo == "ats_conductor" },
                        petar = delDia.firstOrNull { d -> d.tipo == "petar" },
                        hechosHoy = runCatching { ast.delDia(cuadrilla.servicioId, cuadrilla.id) }.getOrDefault(emptyList()),
                    )
                }
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }
}
