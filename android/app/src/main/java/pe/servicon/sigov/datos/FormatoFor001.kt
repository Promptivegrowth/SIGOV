package pe.servicon.sigov.datos

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/** Una fila de «II) Datos de ejecución», con las columnas de la plantilla. */
data class FilaFor001(
    val codigo: String, val numero: String, val pci: String, val item: String, val unidad: String,
    val actividad: String, val horaInicio: String, val horaFin: String, val duracion: String, val personas: String,
    val progInicial: String, val progFinal: String, val lado: String, val longitud: String, val ancho: String,
    val espesor: String, val metrado: String, val observacion: String,
) {
    fun celdas() = listOf(codigo, numero, pci, item, unidad, actividad, horaInicio, horaFin, duracion, personas,
        progInicial, progFinal, lado, longitud, ancho, espesor, metrado, unidad, observacion)
}

/** Todo lo que lleva el FOR:001 del día. */
data class DatosFor001(
    val fecha: LocalDate,
    /** MR, PCI, AT. EMERG., OTROS: los que se marcan con X. */
    val procesos: Set<String>,
    val subtramo: String,
    val cliente: String,
    val componente: String,
    val supervisor: String,
    val cuadrilla: String,
    val capataz: String,
    val sector: String,
    val filas: List<FilaFor001>,
    /** COD. PARTIDA, N°, ACTIVIDAD, MATERIALES, CANT, UND */
    val materiales: List<List<String>>,
    /** CÓDIGO, N°, DESCRIPCIÓN EQUIPO, UND, CANT */
    val equipos: List<List<String>>,
    /** DESCRIPCIÓN, UND, CANT, OBSERVACIONES */
    val otros: List<List<String>>,
    val observaciones: String,
    val validador: String?,
)

/**
 * El «Reporte diario de ejecución – Mantenimiento rutinario» (FOR:001) tal
 * como la plantilla entregada por SERVICON, armado en el teléfono
 * (REV3-OBS-19: «no deberá crearse un nuevo formato»). Es el mismo trazado
 * que el del panel web: dos hojas A4 horizontales, la ejecución en la
 * primera; materiales, equipos, otros recursos y firmas en la segunda.
 */
@Singleton
class FormatoFor001 @Inject constructor(
    @ApplicationContext private val contexto: Context,
) {
    private val mm = 72f / 25.4f
    private val an = 842f
    private val al = 595f
    private val m = 10 * mm
    private val azul = Color.rgb(7, 45, 112)
    private val verde = Color.rgb(0, 150, 64)
    private val cabecera = Color.rgb(221, 235, 247)
    private val fondo = Color.rgb(232, 240, 250)

    private fun p(tam: Float, negrita: Boolean = false, color: Int = Color.rgb(20, 20, 20)) = Paint().apply {
        isAntiAlias = true; textSize = tam; this.color = color
        typeface = Typeface.create(Typeface.SANS_SERIF, if (negrita) Typeface.BOLD else Typeface.NORMAL)
    }

    private val borde = Paint().apply { style = Paint.Style.STROKE; strokeWidth = 0.45f; color = Color.rgb(170, 170, 170); isAntiAlias = true }

    suspend fun armar(d: DatosFor001, nombreArchivo: String): File = withContext(Dispatchers.IO) {
        val doc = PdfDocument()
        val dia = "%02d/%02d/%d".format(d.fecha.dayOfMonth, d.fecha.monthValue, d.fecha.year)
        val logo = runCatching {
            BitmapFactory.decodeResource(contexto.resources, pe.servicon.sigov.R.drawable.logo_servicon)
        }.getOrNull()

        fun encabezado(c: Canvas) {
            val linea = Paint().apply { style = Paint.Style.STROKE; strokeWidth = 1.1f; color = azul; isAntiAlias = true }
            c.drawRect(m, m, an - m, m + 16 * mm, linea)
            c.drawLine(m + 42 * mm, m, m + 42 * mm, m + 16 * mm, linea)
            c.drawLine(an - m - 52 * mm, m, an - m - 52 * mm, m + 16 * mm, linea)
            c.drawLine(an - m - 52 * mm, m + 8 * mm, an - m, m + 8 * mm, linea)
            logo?.let { b ->
                val alto = 11 * mm
                val ancho = minOf(36 * mm, b.width * alto / b.height)
                c.drawBitmap(b, null, RectF(m + 3 * mm, m + 2.5f * mm, m + 3 * mm + ancho, m + 2.5f * mm + alto), Paint(Paint.FILTER_BITMAP_FLAG))
            }
            c.drawText("FORMATO", m + 46 * mm, m + 5 * mm, p(7.5f * 1.0f, true, verde))
            c.drawText("REPORTE DIARIO DE EJECUCIÓN - MANTENIMIENTO RUTINARIO", m + 46 * mm, m + 11.5f * mm, p(10f, true, azul))
            val centro = an - m - 26 * mm
            c.drawText("FOR:001", centro, m + 5.5f * mm, p(10f, true, azul).apply { textAlign = Paint.Align.CENTER })
            c.drawText(dia, centro, m + 13.5f * mm, p(8.5f, false, azul).apply { textAlign = Paint.Align.CENTER })
            c.drawLine(m, m + 17 * mm, an - m, m + 17 * mm, Paint().apply { strokeWidth = 2.2f; color = verde })
        }

        fun pie(c: Canvas, pagina: Int) {
            c.drawLine(m, al - 9 * mm, an - m, al - 9 * mm, Paint().apply { strokeWidth = 1.1f; color = verde })
            c.drawText("GRUPO SERVICON V&D EIRL", m, al - 5 * mm, p(7.5f, true, azul))
            c.drawText("PÁGINA $pagina DE 2", an - m, al - 5 * mm, p(7.5f, false, azul).apply { textAlign = Paint.Align.RIGHT })
        }

        fun seccion(c: Canvas, texto: String, x: Float, y: Float, ancho: Float, tam: Float = 9f) {
            c.drawRect(x, y, x + ancho, y + 5.5f * mm, Paint().apply { color = fondo })
            c.drawText(texto, x + 1.5f * mm, y + 4 * mm, p(tam, true, azul))
        }

        /**
         * Una tabla de la plantilla: cabecera con fondo celeste, celdas con
         * borde y el texto que no cabe en dos líneas recortado.
         */
        fun tabla(c: Canvas, x: Float, y0: Float, anchos: List<Float>, cabeza: List<String>, filas: List<List<String>>,
                  minimo: Int, altoFila: Float, alineados: Set<Int> = emptySet()): Float {
            var y = y0
            val pc = p(5.6f, true, azul).apply { textAlign = Paint.Align.CENTER }
            val altoCabeza = 6 * mm
            var xx = x
            cabeza.forEachIndexed { i, t ->
                val w = anchos[i]
                c.drawRect(xx, y, xx + w, y + altoCabeza, Paint().apply { color = cabecera })
                c.drawRect(xx, y, xx + w, y + altoCabeza, borde)
                val lineas = t.split("\n")
                lineas.forEachIndexed { k, l -> c.drawText(l, xx + w / 2, y + altoCabeza / 2 + 2f + (k - (lineas.size - 1) / 2f) * 6.5f, pc) }
                xx += w
            }
            y += altoCabeza
            val pt = p(6f)
            val todas = filas + List((minimo - filas.size).coerceAtLeast(0)) { List(cabeza.size) { "" } }
            todas.forEach { fila ->
                val lineas = fila.mapIndexed { i, t ->
                    val w = anchos[i] - 4f
                    val e = envolver(t, pt, w)
                    if (e.size <= 2) e else listOf(e[0], recortar(e.drop(1).joinToString(" "), pt, w))
                }
                val h = maxOf(altoFila, 4f + 7.5f * (lineas.maxOfOrNull { it.size } ?: 1))
                xx = x
                lineas.forEachIndexed { i, ls ->
                    val w = anchos[i]
                    c.drawRect(xx, y, xx + w, y + h, borde)
                    ls.forEachIndexed { k, l ->
                        if (i in alineados) c.drawText(l, xx + w / 2, y + 8.5f + k * 7.5f, p(6f).apply { textAlign = Paint.Align.CENTER })
                        else c.drawText(l, xx + 2f, y + 8.5f + k * 7.5f, pt)
                    }
                    xx += w
                }
                y += h
            }
            return y
        }

        // ═══ Página 1 ═════════════════════════════════════════════════
        val p1 = doc.startPage(PdfDocument.PageInfo.Builder(an.toInt(), al.toInt(), 1).create())
        val c1 = p1.canvas
        encabezado(c1)
        var y = m + 20 * mm
        seccion(c1, "I) DATOS GENERALES", m, y, an - 2 * m)
        y += 8 * mm
        c1.drawText("PROCESO", m + 4 * mm, y + 4 * mm, p(8.5f))
        listOf("MR", "PCI", "AT. EMERG.", "OTROS").forEachIndexed { i, k ->
            val x = m + 24 * mm + i * 15 * mm
            c1.drawText(k, x + 7 * mm, y - 0.5f * mm, p(6.5f, true).apply { textAlign = Paint.Align.CENTER })
            c1.drawRect(x, y + 0.5f * mm, x + 14 * mm, y + 5 * mm, borde)
            if (k in d.procesos) c1.drawText("X", x + 7 * mm, y + 4.2f * mm, p(9f, true).apply { textAlign = Paint.Align.CENTER })
        }
        listOf(
            Triple("FECHA", dia, Pair(m + 4 * mm, y + 10 * mm)),
            Triple("SUB TRAMO", d.subtramo, Pair(m + 4 * mm, y + 16 * mm)),
            Triple("CLIENTE", d.cliente, Pair(m + 96 * mm, y + 4 * mm)),
            Triple("COMPONENTE", d.componente, Pair(m + 96 * mm, y + 10 * mm)),
            Triple("ING. SUPERVISOR", d.supervisor, Pair(m + 96 * mm, y + 16 * mm)),
            Triple("CUADRILLA", d.cuadrilla, Pair(m + 188 * mm, y + 4 * mm)),
            Triple("CAPATAZ", d.capataz, Pair(m + 188 * mm, y + 10 * mm)),
            Triple("SECTOR", d.sector, Pair(m + 188 * mm, y + 16 * mm)),
        ).forEach { (rotulo, valor, xy) ->
            val (x, yy) = xy
            c1.drawText(rotulo, x, yy, p(8.5f))
            c1.drawRect(x + 28 * mm, yy - 3.5f * mm, x + 84 * mm, yy + 1.3f * mm, borde)
            c1.drawText(recortar(valor, p(7.5f), 54 * mm), x + 29 * mm, yy, p(7.5f))
        }
        y += 22 * mm
        seccion(c1, "II) DATOS DE EJECUCIÓN", m, y, an - 2 * m)
        y += 6.5f * mm

        // Las columnas de la plantilla, con sus grupos arriba
        val anchos = listOf(20f, 8f, 15f, 9f, 9f, 40f, 11f, 11f, 12f, 12f, 15f, 15f, 11f, 13f, 11f, 11f, 13f, 9f).map { it * mm }
        val anchoObs = an - 2 * m - anchos.sum()
        val todos = anchos + anchoObs
        val grupos = listOf("COD. PARTIDA" to 1, "N°" to 1, "ACTA PCI" to 2, "DESCRIPCIÓN" to 2, "HORA DE EJECUCIÓN" to 4,
            "UBICACIÓN" to 3, "AVANCE EJECUTADO" to 5, "OBSERVACIONES" to 1)
        var x = m
        var col = 0
        val altoGrupo = 5 * mm
        grupos.forEach { (t, n) ->
            val w = todos.subList(col, col + n).sum()
            c1.drawRect(x, y, x + w, y + altoGrupo, Paint().apply { color = cabecera })
            c1.drawRect(x, y, x + w, y + altoGrupo, borde)
            c1.drawText(t, x + w / 2, y + 3.6f * mm, p(5.6f, true, azul).apply { textAlign = Paint.Align.CENTER })
            x += w; col += n
        }
        y += altoGrupo
        val y1 = tabla(
            c1, m, y, todos,
            listOf("", "", "N° PCI", "ÍTEM", "UND", "ACTIVIDAD", "INICIO", "FIN", "DURAC.", "CANT.\nPERS.", "PROG.\nINICIAL",
                "PROG.\nFINAL", "LD/LI/\nEJE", "LONGITUD\n(m)", "ANCHO\n(m)", "ESPESOR\n(m)", "METRADO", "UND", ""),
            d.filas.map { it.celdas() }, minimo = 8, altoFila = 7 * mm,
            alineados = setOf(1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17),
        )
        if (y1 > al - 14 * mm) {
            c1.drawText("(continúa en el panel web: más actividades de las que caben en una hoja)", m, al - 11 * mm, p(6.5f, false, Color.GRAY))
        }
        pie(c1, 1)
        doc.finishPage(p1)

        // ═══ Página 2 ═════════════════════════════════════════════════
        val p2 = doc.startPage(PdfDocument.PageInfo.Builder(an.toInt(), al.toInt(), 2).create())
        val c2 = p2.canvas
        encabezado(c2)
        y = m + 20 * mm
        val anchoMat = 128 * mm
        val anchoEq = 64 * mm
        val anchoOtros = an - 2 * m - anchoMat - anchoEq - 8 * mm
        val xEq = m + anchoMat + 4 * mm
        val xOtros = xEq + anchoEq + 4 * mm
        seccion(c2, "III) MATERIALES", m, y, anchoMat)
        seccion(c2, "IV) EQUIPOS", xEq, y, anchoEq)
        seccion(c2, "V) OTROS RECURSOS (HERRAMIENTAS, EPC, ETC)", xOtros, y, anchoOtros, 7.5f)
        y += 6.5f * mm
        val finMat = tabla(c2, m, y, listOf(20f, 8f, 36f, 40f, 13f, 11f).map { it * mm },
            listOf("COD. PARTIDA", "N°", "ACTIVIDAD", "MATERIALES", "CANT", "UND"), d.materiales, 16, 5 * mm, setOf(1, 4, 5))
        val finEq = tabla(c2, xEq, y, listOf(12f, 7f, 25f, 10f, 10f).map { it * mm },
            listOf("CÓDIGO", "N°", "DESCRIPCIÓN EQUIPO", "UND", "CANT"), d.equipos, 16, 5 * mm, setOf(1, 3, 4))
        val finOtros = tabla(c2, xOtros, y, listOf(anchoOtros * 0.36f, 10 * mm, 10 * mm, anchoOtros * 0.64f - 20 * mm),
            listOf("DESCRIPCIÓN", "UND", "CANT", "OBSERVACIONES"), d.otros, 16, 5 * mm, setOf(1, 2))
        y = maxOf(finMat, finEq, finOtros) + 4 * mm
        seccion(c2, "OBSERVACIONES GENERALES", m, y, an - 2 * m)
        c2.drawRect(m, y + 5.5f * mm, an - m, y + 21.5f * mm, borde)
        envolver(d.observaciones.ifBlank { " " }, p(7.5f), an - 2 * m - 4 * mm).take(4).forEachIndexed { k, l ->
            c2.drawText(l, m + 2 * mm, y + 10 * mm + k * 10f, p(7.5f))
        }
        val yf = minOf(y + 26 * mm, al - 32 * mm)
        fun firma(titulo: String, nombre: String?, xf: Float) {
            val ancho = 100 * mm
            c2.drawRect(xf, yf, xf + ancho, yf + 5 * mm, Paint().apply { color = cabecera })
            c2.drawRect(xf, yf, xf + ancho, yf + 5 * mm, borde)
            c2.drawRect(xf, yf + 5 * mm, xf + ancho, yf + 19 * mm, borde)
            c2.drawText(titulo, xf + ancho / 2, yf + 3.5f * mm, p(6.5f, true, azul).apply { textAlign = Paint.Align.CENTER })
            c2.drawText("Firma:", xf + 2 * mm, yf + 10 * mm, p(6.5f))
            c2.drawText("Nombre: " + (nombre ?: ""), xf + 2 * mm, yf + 16 * mm, p(6.5f))
        }
        firma("JEFE DE CUADRILLA / CAPATAZ", d.capataz, m + 30 * mm)
        firma("INGENIERO SUPERVISOR / RESIDENTE", d.validador ?: d.supervisor, an - m - 130 * mm)
        pie(c2, 2)
        doc.finishPage(p2)

        val carpeta = File(contexto.filesDir, "formatos").apply { mkdirs() }
        val archivo = File(carpeta, "$nombreArchivo.pdf")
        archivo.outputStream().use { doc.writeTo(it) }
        doc.close()
        archivo
    }

    private fun recortar(texto: String, p: Paint, ancho: Float): String {
        if (p.measureText(texto) <= ancho) return texto
        var t = texto
        while (t.length > 1 && p.measureText("$t…") > ancho) t = t.dropLast(1)
        return "$t…"
    }

    private fun envolver(texto: String, p: Paint, ancho: Float): List<String> {
        val lineas = mutableListOf<String>()
        var actual = ""
        for (w in texto.split(" ")) {
            val intento = if (actual.isEmpty()) w else "$actual $w"
            if (p.measureText(intento) <= ancho) actual = intento
            else { if (actual.isNotEmpty()) lineas.add(actual); actual = w }
        }
        if (actual.isNotEmpty()) lineas.add(actual)
        return lineas.ifEmpty { listOf("") }
    }
}
