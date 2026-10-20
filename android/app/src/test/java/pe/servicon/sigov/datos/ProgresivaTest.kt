package pe.servicon.sigov.datos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * La progresiva se escribe como se pueda con el teclado numérico, que no
 * tiene «+» (Elvis, video del 13/10).
 */
class ProgresivaTest {

    @Test
    fun conMas() {
        assertEquals(852400.0, Progresiva.aMetros("852+400")!!, 0.001)
        assertEquals(34600.0, Progresiva.aMetros(" 34 + 600 ")!!, 0.001)
        assertEquals(18400.5, Progresiva.aMetros("18+400,5")!!, 0.001)
    }

    @Test
    fun conPuntoOComaYTresCifras() {
        assertEquals(852400.0, Progresiva.aMetros("852.400")!!, 0.001)
        assertEquals(852040.0, Progresiva.aMetros("852,040")!!, 0.001)
        assertEquals(5.0, Progresiva.aMetros("0.005")!!, 0.001)
    }

    @Test
    fun enMetros() {
        assertEquals(852400.0, Progresiva.aMetros("852400")!!, 0.001)
        assertEquals(852.5, Progresiva.aMetros("852.5")!!, 0.001)
    }

    @Test
    fun loQueNoSeEntiende() {
        assertNull(Progresiva.aMetros(""))
        assertNull(Progresiva.aMetros(".."))
        assertNull(Progresiva.aMetros("34+"))
    }

    @Test
    fun idaYVuelta() {
        assertEquals(852400.0, Progresiva.aMetros(Progresiva.aTexto(852400.0))!!, 0.001)
    }
}
