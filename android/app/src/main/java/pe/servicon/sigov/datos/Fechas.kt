package pe.servicon.sigov.datos

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * La hora del Perú, no la del equipo.
 *
 * El reloj del celular se puede cambiar a mano, y un equipo que vuelve de
 * fábrica o de un reseteo arranca en GMT. Si el parte tomara esa fecha, el
 * trabajo del 21 se registraría como del 22 y la valorización saldría corrida.
 * Por eso toda fecha que se guarda o se muestra sale de aquí.
 */
object Peru {

    val zona: ZoneId = ZoneId.of("America/Lima")

    private val esPe = Locale("es", "PE")

    /** El día de hoy en Lima. Es la fecha con la que se abre el parte. */
    fun hoy(): LocalDate = LocalDate.now(zona)

    fun ahora(): LocalDateTime = LocalDateTime.now(zona)

    fun hora(): LocalTime = LocalTime.now(zona)

    /** «Lunes 21 de setiembre», como se lee en la cabecera de la jornada. */
    fun fechaLarga(dia: LocalDate = hoy()): String =
        dia.format(DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", esPe))
            .replaceFirstChar { it.uppercase() }

    /** `21/09/2026`, para cuadros y listados. */
    fun fechaCorta(dia: LocalDate = hoy()): String =
        dia.format(DateTimeFormatter.ofPattern("dd/MM/yyyy", esPe))

    /** `21/09/2026 21:58`, para sellar evidencias. */
    fun sello(momento: LocalDateTime = ahora()): String =
        momento.format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", esPe))
}
