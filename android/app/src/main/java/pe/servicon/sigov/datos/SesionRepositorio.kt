package pe.servicon.sigov.datos

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
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
import kotlinx.coroutines.withTimeoutOrNull
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
 *
 * Y se agrega una cosa más, que en carretera resultó no ser un detalle:
 * **quién eres se recuerda aunque no haya señal**. Supabase renueva el
 * permiso de acceso cada hora contra su servidor; si en ese momento el
 * equipo está en una quebrada sin cobertura, la renovación falla y la
 * librería deja la sesión en «error de red», donde no hay usuario. La
 * aplicación leía eso como «nadie ha entrado» y mandaba al supervisor a la
 * pantalla de contraseña —contraseña que tampoco podía validar, porque no
 * había señal—. Pasó en campo: se salió el aplicativo en plena vía y la
 * cuadrilla se quedó sin poder registrar.
 *
 * Desde aquí, a quien entró se lo recuerda en el equipo. Si Supabase no
 * puede confirmar la sesión **y no hay conexión**, se lo da por dentro con
 * lo recordado: lo que ve son los datos que él mismo descargó y lo que
 * registre entra a la cola de envío como siempre. En cuanto vuelve la señal
 * manda el servidor: si dice que esa sesión ya no vale —contraseña
 * cambiada, cuenta dada de baja—, ahí sí se cierra y se olvida.
 */
@Singleton
class SesionRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val conexion: Conexion,
    @ApplicationContext contexto: Context,
) {

    private val json = Json { ignoreUnknownKeys = true }
    val estado: StateFlow<SessionStatus> = supabase.auth.sessionStatus

    val autenticado: Flow<Boolean> = estado.map { it is SessionStatus.Authenticated }

    /** Lo que sobrevive a quedarse sin señal: quién entró la última vez. */
    private val recuerdo =
        contexto.getSharedPreferences("sesion", Context.MODE_PRIVATE)

    private var usuarioRecordado: String?
        get() = recuerdo.getString("usuario_id", null)
        set(v) {
            recuerdo.edit().apply {
                if (v == null) remove("usuario_id") else putString("usuario_id", v)
            }.apply()
            RecuerdoDeSesion.usuario = v
        }

    init {
        // Antes de que nadie pregunte nada: lo que el equipo ya sabía.
        RecuerdoDeSesion.usuario = recuerdo.getString("usuario_id", null)
    }

    /** El correo de quien entró, para no hacérselo escribir de nuevo. */
    val correoRecordado: String? get() = recuerdo.getString("correo", null)

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
     *
     * Cuando Supabase no puede confirmar la sesión, decide la señal: con
     * conexión manda el servidor —si dice que no, es que no— y sin conexión
     * vale lo que el equipo recuerda.
     */
    suspend fun usuarioId(): String? {
        // Un tope a la espera. Leer la sesión del equipo es instantáneo; lo
        // que tarda es renovar el permiso contra el servidor, y con media
        // barra de señal esa renovación se reintenta sola durante casi un
        // minuto. Sin el tope, la pantalla de arranque se quedaba todo ese
        // rato diciendo «preparando tu jornada» sin explicar nada.
        withTimeoutOrNull(6_000) { supabase.auth.awaitInitialization() }

        supabase.auth.currentUserOrNull()?.id?.let { confirmado ->
            if (usuarioRecordado != confirmado) usuarioRecordado = confirmado
            return confirmado
        }

        val recordado = usuarioRecordado ?: return null

        // A alguien solo lo echa el servidor, con señal y habiendo contestado
        // que esa sesión ya no vale. Sin señal, o mientras la librería sigue
        // peleando por renovar el permiso, manda lo que el equipo recuerda.
        val rechazado = conexion.ahora() &&
            supabase.auth.sessionStatus.value is SessionStatus.NotAuthenticated
        if (!rechazado) return recordado

        olvidar()
        return null
    }

    suspend fun entrar(correo: String, contrasena: String) {
        supabase.auth.signInWith(Email) {
            this.email = correo.trim()
            this.password = contrasena
        }
        supabase.auth.currentUserOrNull()?.id?.let { usuarioRecordado = it }
        recuerdo.edit().putString("correo", correo.trim()).apply()
    }

    suspend fun salir() {
        olvidar()
        supabase.auth.signOut()
    }

    /**
     * Borra el recuerdo y la copia local de quién es.
     *
     * Se llama al salir a propósito y cuando el servidor rechaza la sesión.
     * No se llama por un fallo de red: eso es justo lo que se quiere evitar.
     */
    private suspend fun olvidar() {
        val quien = usuarioRecordado ?: return
        usuarioRecordado = null
        // El correo se queda: no es un secreto y ahorra escribirlo con
        // guantes a las seis de la mañana.
        runCatching {
            listOf("mi_perfil", "mi_supervisor", "mi_cuadrilla").forEach {
                catalogo.borrarTabla(it, null)
            }
        }
    }

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
 * Quién entró la última vez, al alcance de la extensión de abajo.
 *
 * `usuarioActual()` es una extensión del cliente de Supabase y no puede
 * inyectarse nada, pero necesita el mismo respaldo que el repositorio: sin
 * señal, quién eres lo dice el equipo. El repositorio —que sí es único y se
 * crea al arrancar— mantiene este valor al día desde las preferencias.
 */
internal object RecuerdoDeSesion {
    @Volatile var usuario: String? = null
}

/**
 * El identificador de quien está usando la aplicación, esperando a que
 * Supabase termine de cargar la sesión guardada en el equipo.
 *
 * Existe como extensión y no solo dentro del repositorio porque media
 * docena de repositorios lo necesitan para firmar lo que registran. Sin la
 * espera, un registro hecho en los primeros segundos tras abrir la app
 * llegaba a la nube sin autor: nadie sabía quién lo había anotado.
 *
 * Y sin el respaldo pasaba lo mismo cuatro horas después, en la quebrada:
 * caducado el permiso de acceso y sin señal para renovarlo, `currentUser`
 * se queda en nada y el parte del día entero entraba a la cola sin firmar.
 * Los registros de campo se hacen justo donde no hay cobertura; el autor no
 * puede depender de ella.
 */
suspend fun SupabaseClient.usuarioActual(): String? {
    auth.awaitInitialization()
    return auth.currentUserOrNull()?.id ?: RecuerdoDeSesion.usuario
}
