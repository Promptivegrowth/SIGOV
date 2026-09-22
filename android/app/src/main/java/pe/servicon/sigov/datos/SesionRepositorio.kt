package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.SessionStatus
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.Email
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** El usuario tal como lo necesita la aplicación de campo. */
@Serializable
data class Perfil(
    val id: String,
    @SerialName("full_name") val nombre: String,
    val email: String? = null,
    val role: String? = null,
    val position: String? = null,
)

/** El contrato en el que trabaja, con su cuadrilla si la lidera. */
@Serializable
data class Servicio(
    val id: String,
    val code: String,
    val name: String,
    @SerialName("client_name") val cliente: String? = null,
    @SerialName("contract_code") val contrato: String? = null,
)

@Serializable
data class Cuadrilla(
    val id: String,
    val code: String,
    val name: String,
    @SerialName("service_id") val servicioId: String,
)

/**
 * Quién está usando la aplicación y a qué tiene acceso.
 *
 * La sesión la mantiene Supabase en el equipo; aquí se agrega lo que la
 * aplicación necesita saber además del correo: el nombre de la persona, su
 * rol y la cuadrilla que dirige.
 */
@Singleton
class SesionRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
) {
    val estado: StateFlow<SessionStatus> = supabase.auth.sessionStatus

    val autenticado: Flow<Boolean> = estado.map { it is SessionStatus.Authenticated }

    suspend fun entrar(correo: String, contrasena: String) {
        supabase.auth.signInWith(Email) {
            this.email = correo.trim()
            this.password = contrasena
        }
    }

    suspend fun salir() = supabase.auth.signOut()

    /** Los datos de la persona que entró, leídos de la misma tabla que la web. */
    suspend fun perfil(): Perfil? {
        val usuario = supabase.auth.currentUserOrNull() ?: return null
        return supabase.postgrest
            .from("profiles")
            .select { filter { eq("id", usuario.id) } }
            .decodeSingleOrNull<Perfil>()
    }

    /** La cuadrilla que lidera, que es la que va a registrar trabajo. */
    suspend fun cuadrilla(): Cuadrilla? {
        val usuario = supabase.auth.currentUserOrNull() ?: return null
        return supabase.postgrest
            .from("crews")
            .select { filter { eq("leader_id", usuario.id) } }
            .decodeList<Cuadrilla>()
            .firstOrNull()
    }
}
