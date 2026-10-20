package pe.servicon.sigov.ui.parte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import pe.servicon.sigov.datos.Lados

/** El lado que escribe el supervisor, en el valor de la base (Elvis, P8: CD/CI). */
class LadoDesdeProgramacionTest {

    @Test
    fun ladosDeLaVia() {
        assertEquals("derecho", ladoDesdeProgramacion("LD"))
        assertEquals("izquierdo", ladoDesdeProgramacion("li"))
        assertEquals("ambos", ladoDesdeProgramacion("LD/LI"))
        assertEquals("ambos", ladoDesdeProgramacion("LD / EJE / LI"))
        assertEquals("eje", ladoDesdeProgramacion("Eje"))
    }

    @Test
    fun calzadaNoEsLado() {
        assertEquals("calzada_derecha", ladoDesdeProgramacion("CD"))
        assertEquals("calzada_izquierda", ladoDesdeProgramacion("C.I."))
        assertEquals("calzada_izquierda", ladoDesdeProgramacion("Calzada izquierda"))
        assertEquals("calzada_derecha", ladoDesdeProgramacion("calzada_derecha"))
    }

    @Test
    fun sinLado() {
        assertNull(ladoDesdeProgramacion(null))
        assertNull(ladoDesdeProgramacion("—"))
    }

    @Test
    fun etiquetas() {
        assertEquals("CD · calzada derecha", Lados.etiqueta("calzada_derecha"))
        assertEquals("CI", Lados.codigo("calzada_izquierda"))
        assertEquals("LD/LI", Lados.codigo("ambos"))
        assertNull(Lados.etiqueta(""))
    }
}
