package pe.servicon.sigov.ui.componentes

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import pe.servicon.sigov.datos.sync.ColaRepositorio
import javax.inject.Inject

/**
 * Lo único que la barra inferior necesita saber: cuánto quedó por enviar.
 *
 * Vive fuera de las pantallas porque la insignia tiene que verse desde
 * cualquiera de las cuatro secciones, no solo desde la jornada.
 */
@HiltViewModel
class BarraViewModel @Inject constructor(
    cola: ColaRepositorio,
) : ViewModel() {
    val pendientes: Flow<Int> = cola.pendientes
}
