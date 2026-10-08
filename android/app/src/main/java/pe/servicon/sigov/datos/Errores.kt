package pe.servicon.sigov.datos

import android.util.Log
import io.github.jan.supabase.exceptions.RestException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * El fallo dicho en castellano.
 *
 * A quien está parado en la berma no le sirve una traza de HTTP: necesita
 * saber si tiene que esperar señal, si tiene que avisar al coordinador o si
 * puede seguir trabajando igual. Todo lo que la aplicación muestre como error
 * pasa por aquí.
 *
 * Y nada técnico llega a la pantalla. La biblioteca de Supabase arma el
 * mensaje de error con la petición entera —la dirección del servidor, la
 * cabecera Authorization con el token de sesión y la llave del proyecto—; un
 * capataz que pulsó «Finalizar» sin avance vio todo eso en su teléfono. Ahora
 * solo se enseña lo que la base escribió para el usuario (sus mensajes
 * empiezan por «SIGOV:») o una frase conocida; el resto, una frase genérica.
 * El detalle va al registro del equipo, también sin secretos.
 */
fun Throwable.enCristiano(): String {
    sinRed()?.let { return it }
    causa()?.sinRed()?.let { return it }

    runCatching { Log.w("SIGOV", "Fallo: ${javaClass.simpleName}: ${sinSecretos(message)}") }

    // Lo que contestó el servidor, sin la petición que lo acompaña
    val delServidor = (this as? RestException)?.let { listOfNotNull(it.error, it.description).joinToString(" ") }
    val texto = (delServidor ?: message).orEmpty().trim()

    return when {
        texto.isBlank() -> GENERICO

        // Los mensajes de la base para el usuario: «SIGOV: …»
        texto.contains("SIGOV:") -> paraElUsuario(texto.substringAfter("SIGOV:"))

        texto.contains("JWT", ignoreCase = true) ||
            texto.contains("invalid token", ignoreCase = true) ||
            (this as? RestException)?.statusCode == 401 ->
            "Tu sesión venció. Vuelve a entrar cuando tengas señal."

        texto.contains("row-level security", ignoreCase = true) ||
            texto.contains("permission denied", ignoreCase = true) ||
            (this as? RestException)?.statusCode == 403 ->
            "No tienes permiso para esto. Avisa al coordinador."

        texto.contains("duplicate key", ignoreCase = true) ->
            "Ese registro ya existe."

        texto.contains("violates foreign key", ignoreCase = true) ->
            "Falta un dato relacionado (tramo, cuadrilla o actividad). Actualiza y vuelve a intentarlo."

        texto.contains("violates check constraint", ignoreCase = true) ||
            texto.contains("violates not-null", ignoreCase = true) ->
            "Hay un dato incompleto o fuera de rango. Revisa lo que escribiste."

        texto.startsWith("HTTP request to", ignoreCase = true) ->
            "No se pudo hablar con el servidor. Se reintentará al haber señal."

        // Un mensaje propio de la aplicación (error("…")) es para el usuario
        (this is IllegalStateException || this is IllegalArgumentException) && esTextoSeguro(texto) -> texto

        else -> GENERICO
    }
}

private const val GENERICO = "No se pudo completar. Vuelve a intentarlo; si se repite, avisa al coordinador."

/**
 * Los mensajes de la base que necesitan otra redacción para el capataz.
 * Los demás se enseñan como vienen, con mayúscula inicial.
 */
private fun paraElUsuario(crudo: String): String {
    val t = sinSecretos(crudo).lineSequence().first().trim().trimEnd('.')
    return when {
        t.contains("registra primero el avance", ignoreCase = true) ->
            "Primero registre el avance ejecutado de esta actividad."
        t.isBlank() -> GENERICO
        else -> t.replaceFirstChar { it.uppercase() } + "."
    }
}

/** Un texto que no lleva nada técnico: ni direcciones, ni llaves, ni código. */
private fun esTextoSeguro(t: String): Boolean =
    t.length < 200 && SECRETO.none { it.containsMatchIn(t) }

private val SECRETO = listOf(
    Regex("""https?://""", RegexOption.IGNORE_CASE),
    Regex("""supabase""", RegexOption.IGNORE_CASE),
    Regex("""Bearer""", RegexOption.IGNORE_CASE),
    Regex("""apikey|api key|authorization""", RegexOption.IGNORE_CASE),
    Regex("""eyJ[A-Za-z0-9_-]{8,}"""),
    Regex("""Headers:|URL:|Http Method""", RegexOption.IGNORE_CASE),
    Regex("""\brpc/|/rest/v1""", RegexOption.IGNORE_CASE),
    Regex("""\b(select|insert|update|delete)\b.+\b(from|into|set)\b""", RegexOption.IGNORE_CASE),
)

/**
 * El texto sin lo que no debe verse ni guardarse: la petición que la
 * biblioteca adjunta (URL, cabeceras, método), los tokens y las llaves.
 */
fun sinSecretos(mensaje: String?): String =
    (mensaje ?: "")
        .substringBefore("URL:")
        .substringBefore("Headers:")
        .substringBefore("Http Method")
        .replace(Regex("""Bearer\s+[A-Za-z0-9._-]+"""), "Bearer ···")
        .replace(Regex("""eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}"""), "···")
        .replace(Regex("""https?://\S+"""), "···")
        .trim()

private fun Throwable.sinRed(): String? = when (this) {
    is UnknownHostException ->
        "Sin conexión. Lo que registres se guarda y se envía al volver la señal."
    is SocketTimeoutException ->
        "La red está muy lenta. Lo que registres se guarda y se envía después."
    is IOException ->
        "Sin conexión. Lo que registres se guarda y se envía al volver la señal."
    else -> null
}

/** La causa de fondo: Ktor envuelve el fallo de red en su propia excepción. */
private fun Throwable.causa(): Throwable? {
    var actual = cause
    var saltos = 0
    while (actual != null && saltos < 5) {
        if (actual.sinRed() != null) return actual
        actual = actual.cause
        saltos++
    }
    return null
}
