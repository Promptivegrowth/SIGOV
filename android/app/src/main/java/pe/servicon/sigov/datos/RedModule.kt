package pe.servicon.sigov.datos

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import io.ktor.client.engine.okhttp.OkHttp
import pe.servicon.sigov.BuildConfig
import javax.inject.Singleton
import kotlin.time.Duration.Companion.seconds

/**
 * La conexión con la nube.
 *
 * La aplicación de campo habla **directo con Supabase**, la misma base que
 * usa la web administrativa: no pasa por el servidor de la web. Un salto
 * menos importa cuando la señal en carretera es la que es.
 *
 * `supabase-kt` es la librería oficial de Kotlin para Supabase y trae en un
 * solo cliente el acceso, las consultas, el almacenamiento de fotos y los
 * avisos en tiempo real.
 */
@Module
@InstallIn(SingletonComponent::class)
object RedModule {

    @Provides
    @Singleton
    fun proveerSupabase(@ApplicationContext contexto: Context): SupabaseClient =
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            // La sesión se guarda en el equipo: el capataz entra una vez y no
            // vuelve a escribir su contraseña cada mañana.
            install(Auth) {
                autoLoadFromStorage = true
                alwaysAutoRefresh = true
            }
            install(Postgrest)
            install(Storage)
            install(Realtime)

            httpEngine = OkHttp.create()

            // El inventario del contrato baja entero de una vez: 7,700
            // elementos, unos 600 KB comprimidos. Con señal de carretera no
            // entra en los diez segundos que la librería da por defecto, y
            // mientras tanto el mapa ya enseña lo que el equipo tenía guardado.
            requestTimeout = 45.seconds
        }
}
