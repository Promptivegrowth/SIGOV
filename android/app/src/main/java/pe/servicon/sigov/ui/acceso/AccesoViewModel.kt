package pe.servicon.sigov.ui.acceso

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.SesionRepositorio
import javax.inject.Inject

data class EstadoAcceso(
    val correo: String = "",
    val contrasena: String = "",
    val cargando: Boolean = false,
    val error: String? = null,
    val entro: Boolean = false,
)

@HiltViewModel
class AccesoViewModel @Inject constructor(
    private val sesion: SesionRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoAcceso())
    val estado: StateFlow<EstadoAcceso> = _estado.asStateFlow()

    fun correoCambio(v: String) = _estado.update { it.copy(correo = v, error = null) }
    fun contrasenaCambio(v: String) = _estado.update { it.copy(contrasena = v, error = null) }

    fun entrar() {
        val s = _estado.value
        if (s.cargando) return
        _estado.update { it.copy(cargando = true, error = null) }

        viewModelScope.launch {
            runCatching { sesion.entrar(s.correo, s.contrasena) }
                .onSuccess { _estado.update { e -> e.copy(cargando = false, entro = true) } }
                .onFailure { fallo ->
                    // El mensaje que devuelve el servidor viene en inglés y no
                    // le dice nada a un capataz a las seis de la mañana.
                    val mensaje = when {
                        fallo.message?.contains("Invalid login", true) == true ||
                        fallo.message?.contains("credentials", true) == true ->
                            "El correo o la contraseña no coinciden."
                        fallo.message?.contains("network", true) == true ||
                        fallo.message?.contains("resolve", true) == true ||
                        fallo.message?.contains("timeout", true) == true ->
                            "Sin conexión. Revisa la señal e inténtalo de nuevo."
                        else -> fallo.message ?: "No se pudo entrar."
                    }
                    _estado.update { e -> e.copy(cargando = false, error = mensaje) }
                }
        }
    }
}
