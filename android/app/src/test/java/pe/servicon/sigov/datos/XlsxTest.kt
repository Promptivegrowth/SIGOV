package pe.servicon.sigov.datos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/** El parte en Excel: un .xlsx que se abre con columnas, números y fechas (OBS-36). */
class XlsxTest {

    @Test fun columnas() {
        assertEquals("A", Xlsx.columna(0))
        assertEquals("Z", Xlsx.columna(25))
        assertEquals("AA", Xlsx.columna(26))
        assertEquals("AN", Xlsx.columna(39))
    }

    @Test fun escribeUnLibroValido() {
        val destino = File("build/prueba-parte.xlsx")
        Xlsx.escribir(destino, listOf(HojaXlsx(
            nombre = "Parte 2026-10-05",
            ficha = listOf("Contrato" to "Conservación Vial", "Cuadrilla" to "Cuadrilla 1 · Calzada & Drenaje"),
            columnas = listOf("Fecha", "Actividad", "Cantidad", "Observación"),
            filas = listOf(
                listOf(Celda.Fecha(LocalDate.of(2026, 10, 5)), celdaTexto("Limpieza de alcantarilla <tipo TMC>"),
                    Celda.Numero(12.5), celdaTexto("PRUEBA OFFLINE")),
                listOf(Celda.Fecha(LocalDate.of(2026, 10, 5)), celdaTexto("Sello de fisuras"),
                    Celda.Numero(3.0), Celda.Vacia),
            ),
        )))
        assertTrue(destino.length() > 0)
    }
}
