package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.SessionStatus
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.Email
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.encodeToString
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
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
    private val catalogo: CatalogoDao,
) {

    private val json = Json { ignoreUnknownKeys = true }
    val estado: StateFlow<SessionStatus> = supabase.auth.sessionStatus

    val autenticado: Flow<Boolean> = estado.map { it is SessionStatus.Authenticated }

    /**
     * Espera a que Supabase termine de leer del equipo la sesión guardada y
     * responde si hay alguien dentro.
     *
     * Hace falta porque el estado de la sesión arranca en «no autenticado» y
     * recién después de cargar pasa a «autenticado»: preguntarle antes de
     * tiempo mandaba al capataz a la pantalla de contraseña aunque su sesión
     * estuviera guardada.
     */
    suspend fun haySesion(): Boolean = usuarioId() != null

    /**
     * Quién está dentro, esperando a que Supabase termine de leer del equipo
     * la sesión guardada.
     *
     * El estado arranca en «no autenticado» y solo después pasa a
     * «autenticado». Preguntar antes de tiempo devolvía null, y como null no
     * es un error, la pantalla se quedaba en blanco sin decir por qué: sin
     * nombre, sin cuadrilla y sin saldo, como si el usuario no tuviera nada
     * asignado. Toda consulta que dependa de quién eres pasa por aquí.
     */
    private suspend fun usuarioId(): String? {
        supabase.auth.awaitInitialization()
        return supabase.auth.currentUserOrNull()?.id
    }

    suspend fun entrar(correo: String, contrasena: String) {
        supabase.auth.signInWith(Email) {
            this.email = correo.trim()
            this.password = contrasena
        }
    }

    suspend fun salir() = supabase.auth.signOut()

    /**
     * Los datos de la persona que entró, leídos de la misma tabla que la web.
     *
     * Quedan copiados en el equipo: quién eres y qué cuadrilla diriges no
     * cambia de un día para otro, y sin esa copia toda la aplicación se caía
     * al entrar a una zona sin señal.
     */
    suspend fun perfil(): Perfil? = recordando("mi_perfil") {
        val usuario = usuarioId() ?: return@recordando null
        supabase.postgrest
            .from("profiles")
            .select { filter { eq("id", usuario) } }
            .decodeSingleOrNull<Perfil>()
    }

    /**
     * El supervisor del servicio.
     *
     * La especificación habla de «supervisor asignado» por cuadrilla, pero el
     * modelo todavía no guarda esa asignación: hoy se devuelve el supervisor
     * del contrato. Cuando exista el campo por cuadrilla, esto cambia aquí y
     * la pantalla no se entera.
     */
    suspend fun supervisor(servicioId: String): String? = recordando("mi_supervisor") {
        supabase.postgrest
            .from("service_members")
            .select(Columns.raw("profiles(full_name)")) {
                filter { eq("service_id", servicioId); eq("role", "supervisor") }
                limit(1)
            }
            .decodeList<JsonObject>()
            .firstOrNull()
            ?.get("profiles")
            ?.jsonObject?.get("full_name")?.jsonPrimitive?.contentOrNull
    }

    /** La cuadrilla que lidera, que es la que va a registrar trabajo. */
    suspend fun cuadrilla(): Cuadrilla? = recordando("mi_cuadrilla") {
        val usuario = usuarioId() ?: return@recordando null
        supabase.postgrest
            .from("crews")
            .select { filter { eq("leader_id", usuario) } }
            .decodeList<Cuadrilla>()
            .firstOrNull()
    }

    /**
     * Pregunta a la nube y guarda la respuesta; si no hay red, responde con
     * lo último que se guardó.
     */
    private suspend inline fun <reified T> recordando(
        clave: String,
        bajar: suspend () -> T?,
    ): T? {
        val usuario = usuarioId() ?: return null
        val fresco = runCatching { bajar() }.getOrNull()
        if (fresco != null) {
            catalogo.guardar(
                listOf(
                    FilaCatalogo(
                        tabla = clave,
                        id = usuario,
                        servicioId = null,
                        datos = json.encodeToString<T>(fresco),
                    )
                )
            )
            return fresco
        }
        return catalogo.de(clave, null)
            .firstOrNull { it.id == usuario }
            ?.let { runCatching { json.decodeFromString<T>(it.datos) }.getOrNull() }
    }
}

/**
 * El identificador de quien está usando la aplicación, esperando a que
 * Supabase termine de cargar la sesión guardada en el equipo.
 *
 * Existe como extensión y no solo dentro del repositorio porque media
 * docena de repositorios lo necesitan para firmar lo que registran. Sin la
 * espera, un registro hecho en los primeros segundos tras abrir la app
 * llegaba a la nube sin autor: nadie sabía quién lo había anotado.
 */
suspend fun SupabaseClient.usuarioActual(): String? {
    auth.awaitInitialization()
    return auth.currentUserOrNull()?.id
}
