package pe.servicon.sigov.datos

import java.io.File
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Un Excel de verdad (.xlsx), escrito a mano.
 *
 * El parte se compartía «para Excel» como un CSV con punto y coma: WPS y
 * Excel en inglés lo abrían con todo en una columna y las cantidades como
 * texto (OBS-35 a 38). Un .xlsx no depende de la configuración del teléfono
 * que lo abre: columnas, números, fechas y filtros viajan dentro del archivo.
 *
 * Un .xlsx es un zip con unos pocos XML. Escribirlos directamente cuesta
 * cien líneas; la biblioteca que lo hace por nosotros pesa varios megas en
 * cada teléfono de campo. Solo se usa lo necesario: texto en línea (sin
 * tabla de cadenas compartidas), números, fechas, una cabecera con color,
 * anchos, la fila de títulos fija y el autofiltro.
 */
sealed interface Celda {
    data class Texto(val valor: String) : Celda
    data class Numero(val valor: Double) : Celda
    data class Fecha(val valor: LocalDate) : Celda
    data object Vacia : Celda
}

fun celdaTexto(v: String?) = if (v.isNullOrBlank()) Celda.Vacia else Celda.Texto(v)
fun celdaNumero(v: Double?) = if (v == null) Celda.Vacia else Celda.Numero(v)

class HojaXlsx(
    val nombre: String,
    /** Datos de identificación arriba de la tabla: «Contrato: …». */
    val ficha: List<Pair<String, String>>,
    val columnas: List<String>,
    val filas: List<List<Celda>>,
    /** Ancho de cada columna, en caracteres. */
    val anchos: List<Double> = columnas.map { (it.length + 4).coerceIn(10, 40).toDouble() },
)

object Xlsx {

    // Estilos (índices de cellXfs en styles.xml)
    private const val NORMAL = 0
    private const val ETIQUETA = 1
    private const val VALOR = 2
    private const val CABECERA = 3
    private const val TEXTO = 4
    private const val NUMERO = 5
    private const val FECHA = 6

    fun escribir(destino: File, hojas: List<HojaXlsx>) {
        ZipOutputStream(destino.outputStream().buffered()).use { zip ->
            fun parte(ruta: String, xml: String) {
                zip.putNextEntry(ZipEntry(ruta))
                zip.write(xml.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
            parte("[Content_Types].xml", tiposDeContenido(hojas.size))
            parte("_rels/.rels", RELS_RAIZ)
            parte("xl/workbook.xml", libro(hojas))
            parte("xl/_rels/workbook.xml.rels", relacionesDelLibro(hojas.size))
            parte("xl/styles.xml", ESTILOS)
            hojas.forEachIndexed { i, h -> parte("xl/worksheets/sheet${i + 1}.xml", hoja(h)) }
        }
    }

    private fun hoja(h: HojaXlsx): String {
        val sb = StringBuilder()
        sb.append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        sb.append("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")

        val filaTitulos = h.ficha.size + (if (h.ficha.isEmpty()) 1 else 2)
        val ultimaFila = filaTitulos + h.filas.size
        val ultimaCol = columna(h.columnas.size - 1)

        // La fila de títulos queda fija al desplazarse
        sb.append("<sheetViews><sheetView workbookViewId=\"0\">")
        sb.append("<pane ySplit=\"$filaTitulos\" topLeftCell=\"A${filaTitulos + 1}\" activePane=\"bottomLeft\" state=\"frozen\"/>")
        sb.append("</sheetView></sheetViews>")

        sb.append("<cols>")
        h.anchos.forEachIndexed { i, a ->
            sb.append("<col min=\"${i + 1}\" max=\"${i + 1}\" width=\"$a\" customWidth=\"1\"/>")
        }
        sb.append("</cols><sheetData>")

        var n = 0
        for ((etiqueta, valor) in h.ficha) {
            n++
            sb.append("<row r=\"$n\">")
            sb.append(celda("A$n", Celda.Texto(etiqueta), ETIQUETA))
            sb.append(celda("B$n", celdaTexto(valor), VALOR))
            sb.append("</row>")
        }
        if (h.ficha.isNotEmpty()) n++   // una fila en blanco

        n++
        sb.append("<row r=\"$n\">")
        h.columnas.forEachIndexed { i, t -> sb.append(celda("${columna(i)}$n", Celda.Texto(t), CABECERA)) }
        sb.append("</row>")

        for (fila in h.filas) {
            n++
            sb.append("<row r=\"$n\">")
            fila.forEachIndexed { i, c ->
                val estilo = when (c) {
                    is Celda.Numero -> NUMERO
                    is Celda.Fecha -> FECHA
                    else -> TEXTO
                }
                sb.append(celda("${columna(i)}$n", c, estilo))
            }
            sb.append("</row>")
        }
        sb.append("</sheetData>")
        if (h.filas.isNotEmpty()) sb.append("<autoFilter ref=\"A$filaTitulos:$ultimaCol$ultimaFila\"/>")
        sb.append("<pageMargins left=\"0.5\" right=\"0.5\" top=\"0.6\" bottom=\"0.6\" header=\"0.3\" footer=\"0.3\"/>")
        sb.append("<pageSetup orientation=\"landscape\" paperSize=\"9\" fitToWidth=\"1\" fitToHeight=\"0\"/>")
        sb.append("</worksheet>")
        return sb.toString()
    }

    private fun celda(ref: String, c: Celda, estilo: Int): String = when (c) {
        is Celda.Texto ->
            "<c r=\"$ref\" s=\"$estilo\" t=\"inlineStr\"><is><t xml:space=\"preserve\">${escapar(c.valor)}</t></is></c>"
        is Celda.Numero ->
            if (c.valor.isFinite()) "<c r=\"$ref\" s=\"$estilo\"><v>${c.valor}</v></c>"
            else "<c r=\"$ref\" s=\"$estilo\"/>"
        // Excel cuenta los días desde el 30-12-1899
        is Celda.Fecha ->
            "<c r=\"$ref\" s=\"$estilo\"><v>${ChronoUnit.DAYS.between(LocalDate.of(1899, 12, 30), c.valor)}</v></c>"
        Celda.Vacia -> "<c r=\"$ref\" s=\"$estilo\"/>"
    }

    /** 0 → A, 25 → Z, 26 → AA. */
    fun columna(i: Int): String {
        var n = i
        val sb = StringBuilder()
        do {
            sb.insert(0, ('A' + n % 26))
            n = n / 26 - 1
        } while (n >= 0)
        return sb.toString()
    }

    private fun escapar(s: String) = buildString {
        for (ch in s) when {
            ch == '&' -> append("&amp;")
            ch == '<' -> append("&lt;")
            ch == '>' -> append("&gt;")
            ch == '"' -> append("&quot;")
            // XML no admite caracteres de control
            ch.code < 0x20 && ch != '\n' && ch != '\t' -> append(' ')
            else -> append(ch)
        }
    }

    private fun tiposDeContenido(hojas: Int) = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">""")
        append("""<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>""")
        append("""<Default Extension="xml" ContentType="application/xml"/>""")
        append("""<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>""")
        append("""<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>""")
        for (i in 1..hojas) {
            append("""<Override PartName="/xl/worksheets/sheet$i.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>""")
        }
        append("</Types>")
    }

    private fun libro(hojas: List<HojaXlsx>) = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>""")
        hojas.forEachIndexed { i, h ->
            // Excel no admite en el nombre de una hoja : \ / ? * [ ] ni más de 31 caracteres
            val nombre = escapar(h.nombre.replace(Regex("""[:\\/?*\[\]]"""), " ").take(31))
            append("""<sheet name="$nombre" sheetId="${i + 1}" r:id="rId${i + 1}"/>""")
        }
        append("</sheets>")
        // El autofiltro necesita su nombre definido para que Excel lo respete
        append("<definedNames>")
        hojas.forEachIndexed { i, h ->
            if (h.filas.isNotEmpty()) {
                val desde = h.ficha.size + (if (h.ficha.isEmpty()) 1 else 2)
                val hasta = desde + h.filas.size
                val col = columna(h.columnas.size - 1)
                append("""<definedName name="_xlnm._FilterDatabase" localSheetId="$i" hidden="1">'${escapar(h.nombre.take(31))}'!${'$'}A${'$'}$desde:${'$'}$col${'$'}$hasta</definedName>""")
            }
        }
        append("</definedNames></workbook>")
    }

    private fun relacionesDelLibro(hojas: Int) = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""")
        for (i in 1..hojas) {
            append("""<Relationship Id="rId$i" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet$i.xml"/>""")
        }
        append("""<Relationship Id="rId${hojas + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>""")
        append("</Relationships>")
    }

    private const val RELS_RAIZ =
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""

    // Azul de la marca en la cabecera, bordes finos en la tabla, 0.00 y dd/mm/aaaa
    private const val ESTILOS =
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""" +
        """<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""" +
        """<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>""" +
        """<fonts count="4">""" +
        """<font><sz val="10"/><name val="Arial"/></font>""" +
        """<font><b/><sz val="10"/><color rgb="FF5B6475"/><name val="Arial"/></font>""" +
        """<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>""" +
        """<font><b/><sz val="10"/><name val="Arial"/></font>""" +
        """</fonts>""" +
        """<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>""" +
        """<fill><patternFill patternType="solid"><fgColor rgb="FF17375E"/><bgColor indexed="64"/></patternFill></fill></fills>""" +
        """<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>""" +
        """<border><left style="thin"><color rgb="FFB7C0CC"/></left><right style="thin"><color rgb="FFB7C0CC"/></right>""" +
        """<top style="thin"><color rgb="FFB7C0CC"/></top><bottom style="thin"><color rgb="FFB7C0CC"/></bottom><diagonal/></border></borders>""" +
        """<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>""" +
        """<cellXfs count="7">""" +
        """<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>""" +
        """<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>""" +
        """<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>""" +
        """<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>""" +
        """<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>""" +
        """<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>""" +
        """<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>""" +
        """</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>"""
}
