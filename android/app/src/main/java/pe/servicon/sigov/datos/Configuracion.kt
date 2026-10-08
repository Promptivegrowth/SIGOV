package pe.servicon.sigov.datos

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La fecha y hora que el capataz puso al sello, y cuándo lo hizo: las fotos
 * siguientes avanzan desde ahí al ritmo del reloj, así la del «después» no
 * sale con la misma hora que la del «antes».
 */
data class FechaEditada(val momento: LocalDateTime, val editadaEn: Instant)

/**
 * La configuración del equipo (Elvis: «afuera una opción de configuraciones,
 * como en cualquier aplicativo»).
 *
 * El contrato fija el sello por omisión —solo fecha y hora— y desde aquí el
 * capataz prende o apaga lo demás en su teléfono. Mientras no toque nada,
 * manda el contrato; si lo cambia, manda lo suyo hasta que vuelva a lo del
 * contrato. Fecha y hora no se apagan nunca.
 *
 * Se guarda en el teléfono y no en la nube: es una preferencia de quien
 * toma las fotos, y tiene que funcionar sin señal.
 */
@Singleton
class Configuracion @Inject constructor(
    @ApplicationContext contexto: Context,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val guardado = contexto.getSharedPreferences("configuracion", Context.MODE_PRIVATE)

    private val _sello = MutableStateFlow(leer())

    /** El sello elegido en este teléfono; null si sigue el del contrato. */
    val sello: StateFlow<Sello?> = _sello.asStateFlow()

    /** El sello que se imprime: lo del teléfono si lo hay, si no lo del contrato. */
    fun selloEfectivo(contrato: Sello): Sello = (_sello.value ?: contrato).conFechaYHora()

    fun fijarSello(sello: Sello) {
        val limpio = sello.conFechaYHora()
        guardado.edit().putString(CLAVE_SELLO, json.encodeToString(limpio)).apply()
        _sello.value = limpio
    }

    fun volverAlContrato() {
        guardado.edit().remove(CLAVE_SELLO).apply()
        _sello.value = null
    }

    private val _fechaDelSello = MutableStateFlow<FechaEditada?>(null)

    /**
     * La fecha y hora editadas del sello (Elvis: el PCI vencía hoy y se
     * terminó mañana a primera hora; la foto tiene que salir con la fecha de
     * hoy). Sin motivo: «va a ser muy engorroso para el capataz». Vive solo
     * mientras la app está abierta: al día siguiente nadie arrastra una
     * fecha vieja sin darse cuenta. La hora real se guarda siempre aparte.
     */
    val fechaDelSello: StateFlow<FechaEditada?> = _fechaDelSello.asStateFlow()

    fun editarFechaDelSello(momento: LocalDateTime) {
        _fechaDelSello.value = FechaEditada(momento, Instant.now())
    }

    fun usarHoraReal() {
        _fechaDelSello.value = null
    }

    /** El instante que se imprime ahora, o null si va la hora real. */
    fun momentoDelSello(): Instant? = _fechaDelSello.value?.let {
        it.momento.atZone(Peru.zona).toInstant().plus(Duration.between(it.editadaEn, Instant.now()))
    }

    private fun leer(): Sello? =
        guardado.getString(CLAVE_SELLO, null)
            ?.let { runCatching { json.decodeFromString<Sello>(it) }.getOrNull() }

    private companion object {
        const val CLAVE_SELLO = "sello"
    }
}
