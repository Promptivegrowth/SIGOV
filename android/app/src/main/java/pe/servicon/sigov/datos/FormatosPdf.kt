package pe.servicon.sigov.datos

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Los formatos oficiales, armados en el propio equipo.
 *
 * El panel web ya los genera, pero el jefe de cuadrilla no siempre tiene a
 * quién pedírselos: termina la jornada en el frente de trabajo, sin señal, y
 * el supervisor quiere el parte esa misma tarde. Aquí el PDF se arma con lo
 * que está guardado en el teléfono y se comparte por donde sea —WhatsApp,
 * correo, Bluetooth—, sin pasar por la nube.
 *
 * Se dibuja con `PdfDocument`, que viene en Android: ninguna biblioteca
 * extra, ningún megabyte más en el APK. El diseño sigue el del panel para
 * que un parte impreso desde el celular y otro impreso desde la oficina sean
 * el mismo documento.
 */

/** Códigos y títulos del manual de SERVICON. */
enum class FormatoOficial(val codigo: String, val titulo: String) {
    PARTE("SIG-OP-F01", "Reporte diario de actividades"),
    AST("SIG-SST-F02", "Análisis de Trabajo Seguro"),
    CHARLA("SIG-SST-F03", "Registro de inducción, capacitación y charla"),
}

/** La cabecera que comparten todos los formatos. */
data class CabeceraPdf(
    val servicio: String,
    val cliente: String?,
    val contrato: String?,
    val cuadrilla: String?,
    val fecha: LocalDate,
    val lugar: String?,
    val emitidoPor: String,
)

/** Una firma al pie. */
data class FirmaPdf(val nombre: String, val cargo: String? = null, val dni: String? = null)

@Singleton
class FormatosPdf @Inject constructor(
    @ApplicationContext private val contexto: Context,
) {

    // A4 a 72 puntos por pulgada, que es la unidad de PdfDocument
    private val ancho = 595
    private val alto = 842
    private val margen = 34f

    private val azul = Color.rgb(7, 45, 112)
    private val naranja = Color.rgb(249, 100, 20)
    private val gris = Color.rgb(244, 245, 248)

    private val dia = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    /**
     * Arma el PDF y devuelve el archivo.
     *
     * `filas` es la tabla principal; `contextoExtra`, los pares que van en la
     * cabecera de datos; `bloques`, las tablas adicionales.
     */
    suspend fun armar(
        formato: FormatoOficial,
        cab: CabeceraPdf,
        columnas: List<String>,
        anchos: List<Float>,
        filas: List<List<String>>,
        contextoExtra: List<Pair<String, String>> = emptyList(),
        bloques: List<Triple<String, List<String>, List<List<String>>>> = emptyList(),
        nota: String? = null,
        firmas: List<FirmaPdf> = emptyList(),
        nombreArchivo: String,
    ): File = withContext(Dispatchers.IO) {
        val doc = PdfDocument()
        val pagina = doc.startPage(PdfDocument.PageInfo.Builder(ancho, alto, 1).create())
        val c = pagina.canvas

        var y = cabecera(c, formato, cab)
        y = contexto(c, y, cab, contextoExtra)
        y = tabla(c, y, columnas, anchos, filas)

        for ((titulo, cols, fs) in bloques) {
            y = seccion(c, y, titulo)
            val an = List(cols.size) { (ancho - margen * 2) / cols.size }
            y = tabla(c, y, cols, an, fs)
        }

        if (!nota.isNullOrBlank()) y = notaAlPie(c, y, nota)
        if (firmas.isNotEmpty()) firmasAlPie(c, y, firmas)
        pie(c, cab)

        doc.finishPage(pagina)

        val carpeta = File(contexto.filesDir, "formatos").apply { mkdirs() }
        val archivo = File(carpeta, "$nombreArchivo.pdf")
        archivo.outputStream().use { doc.writeTo(it) }
        doc.close()
        archivo
    }

    /**
     * El mismo cuadro, como hoja de cálculo.
     *
     * Se escribe CSV con punto y coma y BOM: Excel en español lo abre en
     * columnas con doble clic, sin importar nada ni pedir asistente. Un
     * .xlsx de verdad exigiría meter una biblioteca de varios megabytes en
     * el teléfono para ganar formato que en campo no hace falta.
     */
    suspend fun armarCsv(
        columnas: List<String>,
        filas: List<List<String>>,
        encabezado: List<Pair<String, String>> = emptyList(),
        nombreArchivo: String,
    ): File = withContext(Dispatchers.IO) {
        val salto = "\r\n"
        val comilla = "\""
        fun celda(v: String): String = comilla + v.replace(comilla, comilla + comilla) + comilla

        val texto = buildString {
            // La marca de orden de bytes: sin ella Excel abre las tildes rotas
            append("\uFEFF")
            for ((k, v) in encabezado) {
                append(celda(k)).append(";").append(celda(v)).append(salto)
            }
            if (encabezado.isNotEmpty()) append(salto)
            append(columnas.joinToString(";") { celda(it) }).append(salto)
            for (f in filas) append(f.joinToString(";") { celda(it) }).append(salto)
        }

        val carpeta = File(contexto.filesDir, "formatos").apply { mkdirs() }
        val archivo = File(carpeta, "$nombreArchivo.csv")
        archivo.writeText(texto, Charsets.UTF_8)
        archivo
    }

    /** Lanza el selector para mandar el archivo por donde el usuario quiera. */
    fun compartir(archivo: File, titulo: String) {
        val uri = FileProvider.getUriForFile(
            contexto, "${contexto.packageName}.fileprovider", archivo
        )
        val envio = Intent(Intent.ACTION_SEND).apply {
            type = if (archivo.extension == "csv") "text/csv" else "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, titulo)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        contexto.startActivity(
            Intent.createChooser(envio, titulo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    /** Abre el PDF con el visor que tenga el equipo. */
    fun abrir(archivo: File) {
        val uri = FileProvider.getUriForFile(
            contexto, "${contexto.packageName}.fileprovider", archivo
        )
        val ver = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { contexto.startActivity(ver) }
            .onFailure { compartir(archivo, archivo.name) }
    }

    // ═══ El dibujo ════════════════════════════════════════════════════

    private fun pintura(
        tam: Float, negrita: Boolean = false, color: Int = Color.BLACK
    ) = Paint().apply {
        isAntiAlias = true
        textSize = tam
        this.color = color
        typeface = Typeface.create(Typeface.SANS_SERIF, if (negrita) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun cabecera(c: Canvas, formato: FormatoOficial, cab: CabeceraPdf): Float {
        val alto = 62f
        val anchoMarca = 130f
        val anchoCodigo = 113f
        val derecha = ancho - margen

        val borde = Paint().apply {
            style = Paint.Style.STROKE; strokeWidth = 1.1f; color = azul; isAntiAlias = true
        }
        c.drawRect(margen, margen, derecha, margen + alto, borde)
        c.drawLine(margen + anchoMarca, margen, margen + anchoMarca, margen + alto, borde)
        c.drawLine(derecha - anchoCodigo, margen, derecha - anchoCodigo, margen + alto, borde)

        // La marca
        c.drawRect(margen, margen, margen + anchoMarca, margen + alto,
            Paint().apply { color = azul })
        val blancoGrande = pintura(26f, true, Color.WHITE).apply { textAlign = Paint.Align.CENTER }
        c.drawText("SERVICON", margen + anchoMarca / 2, margen + 28f, blancoGrande)
        val blancoChico = pintura(7f, false, Color.WHITE).apply { textAlign = Paint.Align.CENTER }
        c.drawText("GRUPO SERVICON V&D EIRL", margen + anchoMarca / 2, margen + 40f, blancoChico)
        c.drawRect(margen + 24f, margen + 46f, margen + anchoMarca - 24f, margen + 49f,
            Paint().apply { color = naranja })

        // El título
        val centro = margen + anchoMarca + (derecha - anchoCodigo - margen - anchoMarca) / 2
        val tituloP = pintura(11f, true, azul).apply { textAlign = Paint.Align.CENTER }
        envolver(formato.titulo.uppercase(), tituloP, derecha - anchoCodigo - margen - anchoMarca - 12)
            .forEachIndexed { i, linea ->
                c.drawText(linea, centro, margen + 28f + i * 14f, tituloP)
            }

        // El código
        val chico = pintura(7.5f, false, Color.rgb(60, 60, 60))
        val xc = derecha - anchoCodigo + 7f
        c.drawText("Código: ${formato.codigo}", xc, margen + 16f, chico)
        c.drawText("Versión: 01", xc, margen + 29f, chico)
        c.drawText("Fecha: ${cab.fecha.format(dia)}", xc, margen + 42f, chico)
        c.drawText("Página 1 de 1", xc, margen + 55f, chico)

        return margen + alto
    }

    private fun contexto(
        c: Canvas, desde: Float, cab: CabeceraPdf, extra: List<Pair<String, String>>
    ): Float {
        val filas = buildList {
            add("Contrato" to listOfNotNull(cab.contrato, cab.servicio).joinToString(" · ").ifBlank { "—" })
            add("Cliente" to (cab.cliente ?: "—"))
            add("Cuadrilla" to (cab.cuadrilla ?: "—"))
            add("Lugar" to (cab.lugar ?: "—"))
            addAll(extra)
        }
        var y = desde
        val altoFila = 16f
        val anchoEtiqueta = 88f
        val derecha = ancho - margen
        val mitad = (derecha - margen) / 2

        val borde = Paint().apply {
            style = Paint.Style.STROKE; strokeWidth = 0.6f
            color = Color.rgb(190, 195, 205); isAntiAlias = true
        }
        val etiqueta = pintura(7.5f, true, Color.rgb(80, 85, 95))
        val valor = pintura(8.5f)

        filas.chunked(2).forEach { par ->
            par.forEachIndexed { i, (k, v) ->
                val x = margen + i * mitad
                c.drawRect(x, y, x + mitad, y + altoFila, Paint().apply { color = gris })
                c.drawRect(x, y, x + mitad, y + altoFila, borde)
                c.drawText(k.uppercase(), x + 5f, y + 11f, etiqueta)
                c.drawText(recortar(v, valor, mitad - anchoEtiqueta - 10), x + anchoEtiqueta, y + 11f, valor)
            }
            if (par.size == 1) {
                val x = margen + mitad
                c.drawRect(x, y, x + mitad, y + altoFila, borde)
            }
            y += altoFila
        }
        return y + 10f
    }

    private fun seccion(c: Canvas, desde: Float, texto: String): Float {
        val y = desde + 14f
        c.drawRect(margen, y - 11f, ancho - margen, y + 4f, Paint().apply { color = azul })
        c.drawText(texto.uppercase(), margen + 6f, y, pintura(8.5f, true, Color.WHITE))
        return y + 12f
    }

    private fun tabla(
        c: Canvas, desde: Float, columnas: List<String>, anchos: List<Float>, filas: List<List<String>>
    ): Float {
        var y = desde
        val altoFila = 15f
        val cabezaP = pintura(7.5f, true, Color.WHITE)
        val celdaP = pintura(8f)
        val borde = Paint().apply {
            style = Paint.Style.STROKE; strokeWidth = 0.5f
            color = Color.rgb(200, 205, 215); isAntiAlias = true
        }

        // Cabecera
        c.drawRect(margen, y, ancho - margen, y + altoFila, Paint().apply { color = azul })
        var x = margen
        columnas.forEachIndexed { i, col ->
            c.drawText(recortar(col.uppercase(), cabezaP, anchos[i] - 6), x + 3f, y + 10.5f, cabezaP)
            x += anchos[i]
        }
        y += altoFila

        // Cuerpo
        filas.forEachIndexed { n, fila ->
            if (y > alto - 150) return@forEachIndexed   // una página, como el formato impreso
            if (n % 2 == 1) {
                c.drawRect(margen, y, ancho - margen, y + altoFila, Paint().apply { color = gris })
            }
            x = margen
            fila.forEachIndexed { i, celda ->
                val an = anchos.getOrElse(i) { 60f }
                c.drawRect(x, y, x + an, y + altoFila, borde)
                c.drawText(recortar(celda, celdaP, an - 6), x + 3f, y + 10.5f, celdaP)
                x += an
            }
            y += altoFila
        }
        if (filas.isEmpty()) {
            c.drawText("Sin registros", margen + 4f, y + 11f, pintura(8f, false, Color.GRAY))
            y += altoFila
        }
        return y + 8f
    }

    private fun notaAlPie(c: Canvas, desde: Float, nota: String): Float {
        var y = seccion(c, desde, "Observaciones")
        val p = pintura(8f)
        envolver(nota, p, ancho - margen * 2 - 8).take(6).forEach {
            c.drawText(it, margen + 4f, y + 8f, p)
            y += 12f
        }
        return y + 6f
    }

    private fun firmasAlPie(c: Canvas, desde: Float, firmas: List<FirmaPdf>) {
        var y = maxOf(desde + 20f, alto - 140f)
        val porFila = 3
        val anchoCelda = (ancho - margen * 2) / porFila
        val linea = Paint().apply {
            strokeWidth = 0.7f; color = Color.rgb(120, 125, 135); isAntiAlias = true
        }
        val nombreP = pintura(7.5f, true).apply { textAlign = Paint.Align.CENTER }
        val cargoP = pintura(6.5f, false, Color.GRAY).apply { textAlign = Paint.Align.CENTER }

        firmas.take(9).chunked(porFila).forEach { fila ->
            fila.forEachIndexed { i, f ->
                val cx = margen + i * anchoCelda + anchoCelda / 2
                c.drawLine(cx - anchoCelda / 2 + 14f, y, cx + anchoCelda / 2 - 14f, y, linea)
                c.drawText(recortar(f.nombre, nombreP, anchoCelda - 10), cx, y + 10f, nombreP)
                val bajo = listOfNotNull(f.cargo, f.dni?.let { "DNI $it" }).joinToString(" · ")
                if (bajo.isNotBlank()) c.drawText(recortar(bajo, cargoP, anchoCelda - 10), cx, y + 19f, cargoP)
            }
            y += 46f
        }
    }

    private fun pie(c: Canvas, cab: CabeceraPdf) {
        val p = pintura(6.5f, false, Color.GRAY)
        c.drawText(
            "Emitido por ${cab.emitidoPor} desde SIGOV · ${LocalDate.now().format(dia)}",
            margen, alto - 22f, p
        )
        val d = pintura(6.5f, false, Color.GRAY).apply { textAlign = Paint.Align.RIGHT }
        c.drawText("Grupo Servicon V&D EIRL", ancho - margen, alto - 22f, d)
    }

    // ═══ Medidas ══════════════════════════════════════════════════════

    private fun recortar(texto: String, p: Paint, ancho: Float): String {
        if (p.measureText(texto) <= ancho) return texto
        var t = texto
        while (t.length > 1 && p.measureText("$t…") > ancho) t = t.dropLast(1)
        return "$t…"
    }

    private fun envolver(texto: String, p: Paint, ancho: Float): List<String> {
        val palabras = texto.split(" ")
        val lineas = mutableListOf<String>()
        var actual = ""
        for (w in palabras) {
            val intento = if (actual.isEmpty()) w else "$actual $w"
            if (p.measureText(intento) <= ancho) actual = intento
            else { if (actual.isNotEmpty()) lineas.add(actual); actual = w }
        }
        if (actual.isNotEmpty()) lineas.add(actual)
        return lineas
    }
}
