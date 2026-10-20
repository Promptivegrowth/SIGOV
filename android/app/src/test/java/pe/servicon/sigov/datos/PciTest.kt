package pe.servicon.sigov.datos

import org.junit.Assert.assertEquals
import org.junit.Test

/** Cómo se nombra un PCI y sus ítems en el celular (Elvis, video del 13/10). */
class PciTest {

    @Test
    fun codigoCorto() {
        assertEquals("PCI 44", codigoCortoDePci("PCI-2026-044"))
        assertEquals("PCI 100", codigoCortoDePci("PCI-2026-100"))
        assertEquals("PCI 5", codigoCortoDePci("pci-2027-005"))
        // Lo que no tiene esa forma se deja como está
        assertEquals("OSITRAN 12", codigoCortoDePci("OSITRAN 12"))
        assertEquals(null, codigoCortoDePci(null))
    }

    private fun item(descripcion: String?, actividad: String? = null) =
        ItemPci(id = "1", pciId = "p", description = descripcion, actividad = actividad)

    @Test
    fun tituloCorto() {
        assertEquals(
            "Reposición de señal R-30",
            item("Reposición de señal R-30 (Señal vertical 194+722). Retroreflectividad actual Tipo III, se exige mínimo Tipo IV.").tituloCorto,
        )
        assertEquals("Limpieza de cunetas", item("Limpieza de cunetas. Km 12 al 14").tituloCorto)
        assertEquals("Bacheo 1.5 m2", item("Bacheo 1.5 m2").tituloCorto)
        assertEquals(
            "Descolmatación y limpieza de Alcantarilla 173+023",
            item("Descolmatación y limpieza de Alcantarilla 173+023 — obstrucción registrada 16%. Retirar material").tituloCorto,
        )
        assertEquals("Señal R-1 km 12-14", item("Señal R-1 km 12-14").tituloCorto)
        assertEquals("Pintado de marcas", item(null, "Pintado de marcas").tituloCorto)
        assertEquals("x".repeat(67) + "…", item("x".repeat(120)).tituloCorto)
    }
}
