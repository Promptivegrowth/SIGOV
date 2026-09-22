package pe.servicon.sigov.datos

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
 */
fun Throwable.enCristiano(): String {
    sinRed()?.let { return it }
    causa()?.sinRed()?.let { return it }

    val texto = message?.trim().orEmpty()
    return when {
        texto.isBlank() -> "Algo falló y no se pudo completar. Vuelve a intentarlo."

        // Un mensaje con url, verbo y código no se le enseña a nadie
        texto.startsWith("HTTP request to", ignoreCase = true) ->
            "No se pudo hablar con el servidor. Se reintentará al haber señal."

        texto.contains("JWT", ignoreCase = true) ||
            texto.contains("401") ||
            texto.contains("invalid token", ignoreCase = true) ->
            "Tu sesión venció. Vuelve a entrar cuando tengas señal."

        texto.contains("row-level security", ignoreCase = true) ||
            texto.contains("403") ->
            "No tienes permiso para esto. Avisa al coordinador."

        else -> texto
    }
}

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
