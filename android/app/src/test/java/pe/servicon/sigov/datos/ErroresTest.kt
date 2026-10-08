package pe.servicon.sigov.datos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import java.net.UnknownHostException
import org.junit.Test

/**
 * Nada técnico llega a la pantalla del capataz (OBS-01).
 *
 * El mensaje de prueba imita el que arma la biblioteca de Supabase cuando
 * el servidor rechaza una llamada: el texto de la base seguido de la
 * petición entera, con la cabecera Authorization y la llave del proyecto.
 */
class ErroresTest {

    private val token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_-xyz"
    private fun conPeticion(texto: String) = "$texto\n" +
        "URL: https://abcdefgh.supabase.co/rest/v1/rpc/partida_finalizar\n" +
        "Headers: [Authorization=[Bearer $token], apikey=[$token], X-Client-Info=[supabase-kt/2.6.0]]\n" +
        "Http Method: POST"

    private val prohibido = listOf("supabase", "Bearer", "eyJ", "apikey", "URL:", "Headers", "rpc/", "http")

    private fun sinNadaTecnico(t: String) = prohibido.forEach {
        assertFalse("«$it» se colaba en: $t", t.contains(it, ignoreCase = true))
    }

    @Test fun finalizarSinAvance_dicePrimeroRegistreElAvance() {
        val t = Exception(conPeticion("SIGOV: registra primero el avance ejecutado")).enCristiano()
        assertEquals("Primero registre el avance ejecutado de esta actividad.", t)
        sinNadaTecnico(t)
    }

    @Test fun mensajeDeLaBase_seEnseniaSinLaPeticion() {
        val t = Exception(conPeticion("SIGOV: la partida está validada y no se puede finalizar")).enCristiano()
        assertEquals("La partida está validada y no se puede finalizar.", t)
        sinNadaTecnico(t)
    }

    @Test fun errorDesconocidoDelServidor_esGenerico() {
        val t = Exception(conPeticion("function public.algo(uuid) does not exist")).enCristiano()
        sinNadaTecnico(t)
        assertFalse(t.contains("does not exist"))
    }

    @Test fun permisoDenegado() {
        val t = Exception(conPeticion("new row violates row-level security policy for table \"x\"")).enCristiano()
        assertEquals("No tienes permiso para esto. Avisa al coordinador.", t)
    }

    @Test fun mensajePropioDeLaApp_seEnsenia() {
        assertEquals("El pedido no tiene ningún insumo.",
            runCatching { require(false) { "El pedido no tiene ningún insumo." } }.exceptionOrNull()!!.enCristiano())
    }

    @Test fun mensajePropioConAlgoTecnico_noSeEnsenia() {
        sinNadaTecnico(IllegalStateException("falló https://x.supabase.co con $token").enCristiano())
    }

    @Test fun sinRed() {
        assertEquals("Sin conexión. Lo que registres se guarda y se envía al volver la señal.",
            UnknownHostException("abcdefgh.supabase.co").enCristiano())
    }

    @Test fun sinSecretos_quitaTokensYDirecciones() {
        // Para el registro del equipo: se queda la palabra, nunca el token ni la dirección
        val limpio = sinSecretos("fallo con Bearer $token en https://x.supabase.co/rest/v1 y $token")
        listOf("eyJ", "supabase", "http").forEach { assertFalse(limpio.contains(it, ignoreCase = true)) }
    }
}
