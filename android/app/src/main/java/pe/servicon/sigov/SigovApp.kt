package pe.servicon.sigov

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import pe.servicon.sigov.datos.sync.programarSincronizacionPeriodica
import javax.inject.Inject

/**
 * Punto de entrada de la aplicación.
 *
 * SIGOV de campo trabaja contra la misma base que la web administrativa, pero
 * guarda todo primero en el equipo: en carretera la señal va y viene, y un
 * registro perdido es trabajo que hay que repetir.
 */
@HiltAndroidApp
class SigovApp : Application(), Configuration.Provider {

    @Inject lateinit var fabricaDeTrabajos: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(fabricaDeTrabajos)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Un repaso cada cuarto de hora, por si algo quedó sin subir
        programarSincronizacionPeriodica(this)
    }
}
