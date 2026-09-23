package pe.servicon.sigov.datos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Si el equipo tiene señal ahora mismo.
 *
 * La aplicación trabaja de por sí sin conexión —todo lo que el capataz
 * registra entra a la cola y sale cuando puede—, pero hasta ahora no lo
 * decía. En carretera eso se vivía como una avería: el supervisor tocaba
 * el botón de refrescar, no pasaba nada, y no tenía forma de distinguir
 * «no hay señal» de «la aplicación se colgó».
 *
 * Se pregunta al sistema, que ya lo sabe, en vez de descubrirlo fallando.
 * `NET_CAPABILITY_VALIDATED` es la diferencia entre estar prendido al wifi
 * del campamento y que ese wifi llegue a algún lado.
 */
@Singleton
class Conexion @Inject constructor(
    @ApplicationContext private val contexto: Context,
) {
    private val gestor =
        contexto.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Si hay una red que de verdad llega a internet. */
    val hay: StateFlow<Boolean> = callbackFlow {
        fun mirar(): Boolean {
            val red = gestor.activeNetwork ?: return false
            val capacidades = gestor.getNetworkCapabilities(red) ?: return false
            return capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        }

        val oyente = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(red: Network) { trySend(mirar()) }
            override fun onLost(red: Network) { trySend(mirar()) }
            override fun onCapabilitiesChanged(
                red: Network,
                capacidades: NetworkCapabilities,
            ) { trySend(mirar()) }
        }

        trySend(mirar())
        runCatching { gestor.registerDefaultNetworkCallback(oyente) }
        awaitClose { runCatching { gestor.unregisterNetworkCallback(oyente) } }
    }
        .distinctUntilChanged()
        // Se queda escuchando mientras la app viva: el aviso de «sin conexión»
        // aparece en todas las pantallas y no puede reengancharse en cada una.
        .stateIn(ambito, SharingStarted.Eagerly, true)

    /** Lo mismo, preguntado de una vez. */
    fun ahora(): Boolean = hay.value
}
