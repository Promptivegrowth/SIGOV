package pe.servicon.sigov.datos

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/** Dónde se tomó la foto. Sin esto una evidencia no sustenta nada. */
data class Punto(
    val latitud: Double,
    val longitud: Double,
    val precision: Float,
    val altitud: Double?,
)

/**
 * La ubicación del equipo.
 *
 * Se pide una posición fresca y de alta precisión, pero si el GPS no engancha
 * —pasa en quebradas y bajo cerros— se devuelve la última conocida antes de
 * dejar al capataz esperando. Que la foto salga con una precisión pobre es
 * mejor que no tener foto; el número de precisión queda guardado para que
 * quien revisa sepa cuánto confiar.
 */
@Singleton
class Ubicacion @Inject constructor(
    @ApplicationContext private val contexto: Context,
) {

    private val cliente by lazy { LocationServices.getFusedLocationProviderClient(contexto) }

    fun hayPermiso(): Boolean =
        ContextCompat.checkSelfPermission(contexto, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(contexto, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    suspend fun actual(): Punto? {
        if (!hayPermiso()) return null

        val fresca = suspendCancellableCoroutine<android.location.Location?> { cont ->
            val peticion = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setDurationMillis(12_000)
                .setMaxUpdateAgeMillis(30_000)
                .build()
            cliente.getCurrentLocation(peticion, null)
                .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                .addOnFailureListener { if (cont.isActive) cont.resume(null) }
        }

        val sitio = fresca ?: suspendCancellableCoroutine { cont ->
            cliente.lastLocation
                .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                .addOnFailureListener { if (cont.isActive) cont.resume(null) }
        } ?: return null

        return Punto(
            latitud = sitio.latitude,
            longitud = sitio.longitude,
            precision = if (sitio.hasAccuracy()) sitio.accuracy else 0f,
            altitud = if (sitio.hasAltitude()) sitio.altitude else null,
        )
    }
}
