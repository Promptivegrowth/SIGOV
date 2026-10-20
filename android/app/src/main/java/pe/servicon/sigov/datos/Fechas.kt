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

    /**
     * `9 oct 2026 1:17:58 p. m.`: el sello de las fotos que COVINCA ya recibe
     * (ejemplos de Elvis, Timestamp Camera). Se arma a mano para que no
     * dependa de cómo abrevia cada versión de Android el mes o el «p. m.».
     */
    fun sello(momento: LocalDateTime = ahora()): String =
        selloFecha(momento.toLocalDate()) + " " + selloHora(momento)

    /** `9 oct 2026` */
    fun selloFecha(dia: LocalDate): String =
        "${dia.dayOfMonth} ${MESES_CORTOS[dia.monthValue - 1]} ${dia.year}"

    /** `1:17:58 p. m.` */
    fun selloHora(momento: LocalDateTime): String {
        val h = momento.hour % 12
        return "%d:%02d:%02d %s".format(if (h == 0) 12 else h, momento.minute, momento.second,
            if (momento.hour < 12) "a. m." else "p. m.")
    }

    private val MESES_CORTOS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
}
