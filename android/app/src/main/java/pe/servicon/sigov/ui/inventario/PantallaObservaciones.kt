package pe.servicon.sigov.ui.inventario

import kotlin.math.roundToInt
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point
import pe.servicon.sigov.datos.Actividad
import pe.servicon.sigov.datos.CabeceraPdf
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Celda
import pe.servicon.sigov.datos.Configuracion
import pe.servicon.sigov.datos.EvidenciaRepositorio
import pe.servicon.sigov.datos.FormatosPdf
import pe.servicon.sigov.datos.HojaXlsx
import pe.servicon.sigov.datos.InventarioRepositorio
import pe.servicon.sigov.datos.Lados
import pe.servicon.sigov.datos.Numeros
import pe.servicon.sigov.datos.ObservacionDeCampo
import pe.servicon.sigov.datos.ObservacionesRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.datos.Trazado
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.celdaNumero
import pe.servicon.sigov.datos.celdaTexto
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.componentes.ControlDeMapa
import pe.servicon.sigov.ui.componentes.ControlesDeMapa
import pe.servicon.sigov.ui.componentes.VisorConZoom
import pe.servicon.sigov.ui.theme.Marca
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import javax.inject.Inject

private val COLOR_ESTADO = mapOf(
    "pendiente" to Color(0xFFDC2626),
    "programada" to Color(0xFFF59E0B),
    "atendida" to Color(0xFF16A34A),
)

/** Las observaciones sin tipo de actividad (las de antes del 26/10). */
private const val SIN_TIPO = "Sin tipo de actividad"

/** Los filtros que se combinan (REV3-OBS-39); null = todos. */
data class FiltrosObs(
    val tramoId: String? = null,
    val sector: String? = null,
    val actividad: String? = null,
    val autor: String? = null,
    val desde: java.time.LocalDate? = null,
    val hasta: java.time.LocalDate? = null,
) {
    val activos: Int get() = listOfNotNull(tramoId, sector, actividad, autor, desde ?: hasta).size

    fun pasa(o: ObservacionDeCampo): Boolean {
        val dia = o.fecha?.take(10)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }
        return (tramoId == null || o.tramoId == tramoId) &&
            (sector == null || o.sector == sector) &&
            (actividad == null || o.actividadCodigo == actividad) &&
            (autor == null || o.autor == autor) &&
            (desde == null || (dia != null && !dia.isBefore(desde))) &&
            (hasta == null || (dia != null && !dia.isAfter(hasta)))
    }
}

/** Lo que se mide a lo largo de la vía lleva progresiva final (REV3-OBS-35). */
fun esLineal(unidad: String?) = unidad?.trim()?.lowercase() in setOf("m", "ml", "m²", "m2", "km")

/** Metros o kilómetros, según cuánto sea. */
private fun distanciaLegible(m: Double): String =
    if (m >= 1000) "${"%.1f".format(m / 1000.0)} km" else "${m.roundToInt()} m"

data class EstadoObservaciones(
    val cargando: Boolean = true,
    val lista: List<ObservacionDeCampo> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    val tramoPorDefecto: Tramo? = null,
    /** Las partidas COVINCA, con su categoría: berma, calzada, drenaje… */
    val actividades: List<Actividad> = emptyList(),
    val unidades: Map<String, String> = emptyMap(),
    /** null = todas. */
    val estado: String? = "pendiente",
    /** null = todas las categorías. */
    val categoria: String? = null,
    val filtros: FiltrosObs = FiltrosObs(),
    /** La que se eligió en la lista: el mapa va hacia ella. */
    val seleccionada: String? = null,
    val usuarioId: String? = null,
    val esGestor: Boolean = false,
    val guardando: Boolean = false,
    val exportando: Boolean = false,
    val buscandoUbicacion: Boolean = false,
    val formulario: Boolean = false,
    /** Agregar otra actividad en el punto de esta observación. */
    val formularioBase: ObservacionDeCampo? = null,
    /** Metros entre el GPS y la progresiva, cuando hay que preguntar. */
    val avisoGps: Double? = null,
    /**
     * Desde cuántos metros se pregunta (REV3-OBS-37). Es un ajuste del
     * contrato: Elvis pidió la mayor precisión posible (respuesta 7, 11/11).
     */
    val umbralGps: Double = 30.0,
    val aviso: String? = null,
    val error: String? = null,
) {
    private fun categoriaDe(o: ObservacionDeCampo) = o.categoria ?: SIN_TIPO

    /** Ordenadas por kilómetro, como se recorre la vía. */
    val visibles: List<ObservacionDeCampo>
        get() = lista.filter { (estado == null || it.estado == estado) && (categoria == null || categoriaDe(it) == categoria) && filtros.pasa(it) }
            .sortedWith(compareBy<ObservacionDeCampo>({ it.tramoCodigo ?: it.tramo ?: "~" }, { it.progresiva ?: Double.MAX_VALUE }))

    fun cuantas(e: String?) = lista.count { (e == null || it.estado == e) && (categoria == null || categoriaDe(it) == categoria) && filtros.pasa(it) }

    /** Las categorías que hay en el filtro de estado, con cuántas tiene cada una. */
    val categorias: List<Pair<String, Int>>
        get() {
            val conEstado = lista.filter { (estado == null || it.estado == estado) && filtros.pasa(it) }
            val orden = ordenDeCategorias
            return conEstado.groupingBy { categoriaDe(it) }.eachCount().toList()
                .sortedBy { (c, _) -> orden[c] ?: Int.MAX_VALUE }
        }

    /** Las categorías en el orden del listado COVINCA (el de la n.º de partida). */
    val ordenDeCategorias: Map<String, Int>
        get() = actividades.filter { it.category != null }
            .groupBy { it.category!! }
            .mapValues { (_, a) -> a.minOf { it.numeroCovinca ?: Int.MAX_VALUE } }

    /** Las otras actividades registradas en el mismo punto. */
    fun delMismoPunto(o: ObservacionDeCampo) = lista.filter { it.punto == o.punto && it.id != o.id }

    fun puedeEditar(o: ObservacionDeCampo) =
        o.porEnviar || esGestor || (o.autorId != null && o.autorId == usuarioId && o.estado == "pendiente")
}

/**
 * Registro de observaciones de campo (videos de Elvis del 14/10 y 26/10):
 * el mapa con lo observado y la lista por kilómetro, y «Registrar
 * observación» con el tipo de actividad (categoría y partida), la progresiva
 * o el intervalo, el lado, el metrado, la observación y de una a tres fotos.
 * Se exporta a Excel y PDF con la foto de referencia, y el mapa como imagen;
 * el supervisor la jala a la programación desde la web.
 */
@HiltViewModel
class ObservacionesViewModel @Inject constructor(
    private val repo: ObservacionesRepositorio,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val evidencias: EvidenciaRepositorio,
    private val configuracion: Configuracion,
    private val ubicacion: Ubicacion,
    private val inventario: InventarioRepositorio,
    private val formatos: FormatosPdf,
) : ViewModel() {
    private val _estado = MutableStateFlow(EstadoObservaciones())
    val estado: StateFlow<EstadoObservaciones> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching {
                // El supervisor y SSOMA también registran observaciones: sin
                // cuadrilla, vale el contrato (matriz, 14/11; CASO 18)
                val c = sesion.cuadrilla()
                val servicioId = sesion.servicioId() ?: error("Tu usuario no está asignado a ningún contrato.")
                val tramos = campo.tramos(servicioId)
                val actividades = campo.actividades(servicioId)
                    .filter { it.code.startsWith("COV-") && it.category != null }
                    .sortedWith(compareBy({ it.numeroCovinca ?: Int.MAX_VALUE }, { it.code }))
                val unidades = campo.unidades().associate { it.id to it.symbol }
                val perfil = runCatching { sesion.perfil() }.getOrNull()
                val lista = repo.lista(servicioId)
                val umbral = campo.ajustes(servicioId).ubicacion.avisoGpsM
                _estado.update {
                    it.copy(
                        cargando = false, lista = lista, tramos = tramos, actividades = actividades, unidades = unidades,
                        umbralGps = umbral,
                        tramoPorDefecto = tramos.firstOrNull { t -> t.id == c?.tramoId },
                        usuarioId = perfil?.id,
                        esGestor = perfil?.role in setOf("admin", "supervisor", "residente"),
                    )
                }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun filtrar(e: String?) = _estado.update { it.copy(estado = e, seleccionada = null) }
    fun filtrarCategoria(c: String?) = _estado.update { it.copy(categoria = c, seleccionada = null) }
    fun seleccionar(id: String?) = _estado.update { it.copy(seleccionada = id) }
    fun filtrarCon(f: FiltrosObs) = _estado.update { it.copy(filtros = f, seleccionada = null) }
    fun abrirFormulario(si: Boolean, base: ObservacionDeCampo? = null) =
        _estado.update { it.copy(formulario = si, formularioBase = if (si) base else null, error = null, avisoGps = null) }
    fun avisoGpsVisto() = _estado.update { it.copy(avisoGps = null) }
    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
    fun archivoTemporal(): File = evidencias.archivoTemporal()
    suspend fun url(ruta: String): String? = inventario.urlDeFoto(ruta)

    fun buscarMiUbicacion(alEncontrar: (Double, Double) -> Unit) {
        _estado.update { it.copy(buscandoUbicacion = true) }
        viewModelScope.launch {
            val punto = runCatching { ubicacion.actual() }.getOrNull()
            _estado.update {
                it.copy(buscandoUbicacion = false, error = if (punto == null) "No se pudo leer tu ubicación. Revisa el GPS y el permiso." else it.error)
            }
            punto?.let { alEncontrar(it.latitud, it.longitud) }
        }
    }

    fun registrar(
        tramo: Tramo?,
        actividades: List<ObservacionesRepositorio.ActividadDelPunto>,
        progresiva: Double?,
        progresivaFin: Double?,
        lado: String,
        descripcion: String,
        fotos: List<File>,
        puntoId: String?,
        gpsConfirmado: Boolean,
    ) {
        _estado.update { it.copy(guardando = true, error = null, avisoGps = null) }
        viewModelScope.launch {
            val punto = runCatching { ubicacion.actual() }.getOrNull()
            // El GPS lejos de la progresiva escrita: se pregunta antes de guardar
            // (REV3-OBS-37). Se calcula sobre el trazado del tramo, sin señal.
            if (!gpsConfirmado && puntoId == null && punto != null && tramo != null && progresiva != null) {
                val sobreLaVia = Trazado.punto(tramo, progresiva)
                val metros = sobreLaVia?.let { (lat, lng) -> Trazado.distancia(punto.latitud, punto.longitud, lat, lng) }
                if (metros != null && metros > _estado.value.umbralGps) {
                    _estado.update { it.copy(guardando = false, avisoGps = metros) }
                    return@launch
                }
            }
            runCatching {
                val c = sesion.cuadrilla()
                val servicioId = sesion.servicioId() ?: error("Tu usuario no está asignado a ningún contrato.")
                val ajustes = campo.ajustes(servicioId)
                repo.registrar(
                    servicioId, c?.id, c?.name, tramo, actividades, progresiva, progresivaFin, lado, descripcion, fotos,
                    configuracion.selloEfectivo(ajustes.sello), punto, puntoId,
                )
            }.onSuccess { id ->
                val n = actividades.size
                _estado.update {
                    it.copy(guardando = false, formulario = false, formularioBase = null, seleccionada = id,
                        aviso = if (n > 1) "$n actividades registradas en el punto. Se enviarán al haber señal." else "Observación registrada. Se enviará al haber señal.")
                }
                cargar()
            }.onFailure { f -> _estado.update { it.copy(guardando = false, error = f.enCristiano()) } }
        }
    }

    fun quitar(o: ObservacionDeCampo) {
        viewModelScope.launch {
            runCatching { repo.quitar(o) }
                .onSuccess {
                    _estado.update { it.copy(lista = it.lista.filter { x -> x.id != o.id }, seleccionada = null, aviso = "Observación quitada.") }
                }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    /** Quita una foto tomada por error; devuelve la observación como queda. */
    fun quitarFoto(o: ObservacionDeCampo, llave: String, alQuitar: (ObservacionDeCampo) -> Unit) {
        viewModelScope.launch {
            runCatching { repo.quitarFoto(llave) }
                .onSuccess {
                    val i = o.galeria.indexOfFirst { it.first == llave }
                    val nueva = o.copy(
                        fotos = o.fotos.filterIndexed { k, _ -> k != i },
                        fotosIds = o.fotosIds.filterIndexed { k, _ -> k != i },
                        fotosLocales = o.fotosLocales - llave,
                    )
                    _estado.update { it.copy(lista = it.lista.map { x -> if (x.id == o.id) nueva else x }, aviso = "Foto quitada.") }
                    alQuitar(nueva)
                }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    // ─── Exportar (Elvis, 26/10; REV3-OBS-40) ─────────────────────────────

    private fun columnas() = listOf(
        "ID", "Sector", "Tramo", "Prog. inicial", "Prog. final", "Lado", "Tipo de actividad", "Actividad",
        "Observación", "Metrado", "Estado",
    )

    private fun textos(o: ObservacionDeCampo) = listOf(
        o.codigo ?: "Por enviar",
        o.sector ?: "—",
        o.tramoCorto ?: "—",
        o.progresiva?.let { Progresiva.aTexto(it) } ?: "—",
        o.progresivaFin?.takeIf { it != o.progresiva }?.let { Progresiva.aTexto(it) } ?: "—",
        Lados.etiqueta(o.side) ?: "—",
        o.categoria ?: "—",
        listOfNotNull(o.actividadCodigo, o.actividad).joinToString(" · ").ifBlank { "—" },
        o.descripcion,
        o.metradoTexto ?: "—",
        if (o.porEnviar) "Por enviar" else o.estadoLegible,
    )

    private fun filtroLegible(e: EstadoObservaciones): String {
        val f = e.filtros
        val dia = { d: java.time.LocalDate -> "%02d/%02d/%d".format(d.dayOfMonth, d.monthValue, d.year) }
        return listOfNotNull(
            when (e.estado) { "pendiente" -> "Pendientes"; "programada" -> "Programadas"; "atendida" -> "Atendidas"; else -> "Todas" },
            e.categoria,
            f.tramoId?.let { id -> e.tramos.firstOrNull { it.id == id }?.let { t -> t.numero?.let { "Tramo $it" } ?: t.code } },
            f.sector?.let { "Sector $it" },
            f.actividad,
            f.autor,
            if (f.desde != null || f.hasta != null) listOfNotNull(f.desde?.let(dia), f.hasta?.let(dia)).joinToString(" al ") else null,
        ).joinToString(" · ")
    }

    /** La primera foto de cada una, chica: del teléfono si sigue ahí, si no de la nube. */
    private suspend fun miniatura(o: ObservacionDeCampo, lado: Int): Bitmap? = withContext(Dispatchers.IO) {
        val (_, modelo) = o.galeria.firstOrNull() ?: return@withContext null
        runCatching {
            val bytes = when (modelo) {
                is File -> modelo.readBytes()
                else -> URL(url(modelo.toString()) ?: return@runCatching null).openStream().use { it.readBytes() }
            }
            val medidas = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, medidas)
            var muestra = 1
            while (maxOf(medidas.outWidth, medidas.outHeight) / (muestra * 2) >= lado) muestra *= 2
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = muestra })
        }.getOrNull()
    }

    fun exportar(comoExcel: Boolean) {
        val e = _estado.value
        val lista = e.visibles
        if (lista.isEmpty()) { _estado.update { it.copy(error = "No hay observaciones en este filtro.") }; return }
        _estado.update { it.copy(exportando = true) }
        viewModelScope.launch {
            runCatching {
                val servicio = sesion.servicioId()?.let { campo.contrato(it) }
                val hoy = Peru.hoy()
                val nombre = "OBSERVACIONES_${hoy}"
                val fotos = lista.map { miniatura(it, 420) }
                val archivo = if (comoExcel) {
                    val imagenes = fotos.mapIndexedNotNull { i, b ->
                        b?.let { bmp -> i to ByteArrayOutputStream().use { s -> bmp.compress(Bitmap.CompressFormat.JPEG, 82, s); s.toByteArray() } }
                    }.toMap()
                    formatos.armarXlsx(
                        nombreArchivo = nombre,
                        hojas = listOf(HojaXlsx(
                            nombre = "Observaciones",
                            ficha = listOf(
                                "Contrato" to (servicio?.name ?: ""),
                                "Cliente" to (servicio?.cliente ?: ""),
                                "Filtro" to filtroLegible(e),
                                "Fecha" to "%02d/%02d/%d".format(hoy.dayOfMonth, hoy.monthValue, hoy.year),
                            ),
                            // Las columnas en el orden del consolidado (REV3-OBS-40); varias
                            // actividades de un mismo punto salen en filas propias
                            columnas = listOf("ID", "Fecha de registro", "Tramo", "Sector", "Tipo de actividad", "Código",
                                "Actividad", "Progresiva inicial", "Progresiva final", "Lado", "Metrado", "Unidad",
                                "Observación", "Estado", "Registrado por", "Fotografía de referencia"),
                            anchos = listOf(11.0, 12.0, 10.0, 9.0, 20.0, 13.0, 32.0, 14.0, 14.0, 11.0, 10.0, 8.0, 40.0, 12.0, 22.0, 23.0),
                            filas = lista.mapIndexed { i, o ->
                                listOf(
                                    celdaTexto(o.codigo ?: "Por enviar"),
                                    o.fecha?.let { f -> runCatching { Celda.Fecha(java.time.LocalDate.parse(f.take(10))) }.getOrNull() } ?: Celda.Vacia,
                                    celdaTexto(o.tramoCorto),
                                    celdaTexto(o.sector),
                                    celdaTexto(o.categoria),
                                    celdaTexto(o.actividadCodigo),
                                    celdaTexto(o.actividad),
                                    celdaTexto(o.progresiva?.let { Progresiva.aTexto(it) }),
                                    celdaTexto(o.progresivaFin?.takeIf { it != o.progresiva }?.let { Progresiva.aTexto(it) }),
                                    celdaTexto(Lados.etiqueta(o.side)),
                                    celdaNumero(o.metrado),
                                    celdaTexto(o.unidad),
                                    celdaTexto(o.descripcion),
                                    celdaTexto(if (o.porEnviar) "Por enviar" else o.estadoLegible),
                                    celdaTexto(listOfNotNull(o.autor, o.cuadrilla).joinToString(" · ")),
                                    if (fotos[i] == null) celdaTexto("Sin foto") else Celda.Vacia,
                                )
                            },
                            imagenes = imagenes,
                        )),
                    )
                } else {
                    formatos.armarObservaciones(
                        cab = CabeceraPdf(
                            servicio = servicio?.name ?: "", cliente = servicio?.cliente, contrato = servicio?.contrato,
                            cuadrilla = sesion.cuadrilla()?.name, fecha = hoy, lugar = null,
                            emitidoPor = runCatching { sesion.perfil()?.nombre }.getOrNull() ?: "SIGOV",
                        ),
                        resumen = "${lista.size} observaciones · ${filtroLegible(e)}",
                        columnas = columnas() + "Foto",
                        anchos = listOf(50f, 32f, 40f, 44f, 44f, 38f, 62f, 100f, 158f, 48f, 46f, 112f),
                        filas = lista.map { o -> textos(o) },
                        fotos = fotos,
                        nombreArchivo = nombre,
                    )
                }
                formatos.compartir(archivo, "Observaciones de campo")
            }.onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
            _estado.update { it.copy(exportando = false) }
        }
    }

    /** El mapa con una franja de título arriba y la leyenda abajo, como el del panel web. */
    private fun conLeyenda(mapa: Bitmap, e: EstadoObservaciones): Bitmap {
        val banda = 120
        val salida = Bitmap.createBitmap(mapa.width, mapa.height + banda * 2, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(salida)
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        c.drawColor(android.graphics.Color.WHITE)
        p.color = android.graphics.Color.rgb(7, 45, 112)
        c.drawRect(0f, 0f, mapa.width.toFloat(), banda.toFloat(), p)
        p.color = android.graphics.Color.WHITE
        p.textSize = 40f; p.isFakeBoldText = true
        c.drawText("Observaciones de campo", 30f, 58f, p)
        p.textSize = 28f; p.isFakeBoldText = false
        c.drawText("${filtroLegible(e)} · ${Peru.hoy().let { "%02d/%02d/%d".format(it.dayOfMonth, it.monthValue, it.year) }} · SIGOV", 30f, 100f, p)
        c.drawBitmap(mapa, 0f, banda.toFloat(), null)
        // La leyenda: cuántas hay de cada estado en lo que se muestra
        var x = 30f
        val y = mapa.height + banda + 72f
        p.textSize = 32f
        for ((k, nombre) in listOf("pendiente" to "Pendientes", "programada" to "Programadas", "atendida" to "Atendidas")) {
            val n = e.visibles.count { it.estado == k }
            if (n == 0) continue
            p.color = hex(COLOR_ESTADO[k] ?: Color.Gray).let { android.graphics.Color.parseColor(it) }
            c.drawCircle(x + 14f, y - 11f, 14f, p)
            p.color = android.graphics.Color.rgb(28, 34, 56)
            val t = "$nombre: $n"
            c.drawText(t, x + 38f, y, p)
            x += p.measureText(t) + 80f
        }
        return salida
    }

    /** El mapa con los puntos del filtro, como imagen (Elvis: «exportar mapa»). */
    fun compartirMapa(imagen: Bitmap) {
        viewModelScope.launch {
            runCatching {
                val archivo = formatos.guardarImagen(conLeyenda(imagen, _estado.value), "MAPA_OBSERVACIONES_${Peru.hoy()}")
                formatos.compartir(archivo, "Mapa de observaciones")
            }.onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaObservaciones(
    vm: ObservacionesViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var abierta by remember { mutableStateOf<ObservacionDeCampo?>(null) }
    var menu by remember { mutableStateOf(false) }
    var filtrando by remember { mutableStateOf(false) }
    val control = remember { ControlDeMapa() }
    val listaEstado = rememberLazyListState()
    LaunchedEffect(estado.aviso, estado.error, estado.formulario) {
        if (estado.formulario) return@LaunchedEffect
        (estado.error ?: estado.aviso)?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    ArmazonDeApartado(
        titulo = "Observaciones de campo",
        seccion = "Lo que no está en el inventario",
        alVolver = alVolver,
        ayuda = "Desmonte, basura, una señal caída… con su actividad, progresiva, metrado y fotos, para programarlo.",
        avisos = avisos,
        acciones = {
            Box {
                IconButton(onClick = { menu = true }, enabled = !estado.exportando) {
                    if (estado.exportando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Outlined.FileDownload, "Exportar")
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Excel con fotos") }, leadingIcon = { Icon(Icons.Outlined.TableChart, null) },
                        onClick = { menu = false; vm.exportar(comoExcel = true) })
                    DropdownMenuItem(text = { Text("PDF con fotos") }, leadingIcon = { Icon(Icons.Outlined.PictureAsPdf, null) },
                        onClick = { menu = false; vm.exportar(comoExcel = false) })
                    DropdownMenuItem(text = { Text("Imagen del mapa") }, leadingIcon = { Icon(Icons.Outlined.Image, null) },
                        onClick = { menu = false; control.mapa?.snapshot { vm.compartirMapa(it) } })
                }
            }
        },
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = { vm.abrirFormulario(true) },
                containerColor = Marca.VerdeBandera,
                contentColor = Color.White,
                icon = { Icon(Icons.Outlined.Add, null) },
                text = { Text("Registrar observación") },
            )
        },
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 12.dp, end = 12.dp, top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Tramo, sector, actividad, fechas y quién registró, combinables (REV3-OBS-39)
                FilterChip(
                    selected = estado.filtros.activos > 0,
                    onClick = { filtrando = true },
                    leadingIcon = { Icon(Icons.Outlined.FilterList, null, Modifier.size(18.dp)) },
                    label = { Text(if (estado.filtros.activos > 0) "Filtros · ${estado.filtros.activos}" else "Filtros") },
                )
                listOf("pendiente" to "Pendientes", "programada" to "Programadas", "atendida" to "Atendidas", null to "Todas").forEach { (k, t) ->
                    FilterChip(
                        selected = estado.estado == k,
                        onClick = { vm.filtrar(k) },
                        leadingIcon = k?.let { c -> { Box(Modifier.size(9.dp).clip(CircleShape).background(COLOR_ESTADO[c] ?: Color.Gray)) } },
                        label = { Text("$t · ${estado.cuantas(k)}") },
                    )
                }
            }
            // Por tipo de actividad: alcantarillas, muros, puentes, berma… (Elvis, 26/10)
            if (estado.categorias.isNotEmpty()) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = estado.categoria == null, onClick = { vm.filtrarCategoria(null) },
                        label = { Text("Todas las actividades", fontSize = 12.sp) })
                    estado.categorias.forEach { (c, n) ->
                        FilterChip(selected = estado.categoria == c, onClick = { vm.filtrarCategoria(if (estado.categoria == c) null else c) },
                            label = { Text("$c · $n", fontSize = 12.sp) })
                    }
                }
            }
            if (estado.cargando) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                return@Column
            }
            Box(Modifier.fillMaxWidth().weight(0.9f)) {
                MapaDeObservaciones(estado.visibles, estado.seleccionada, control, Modifier.fillMaxSize()) { o ->
                    vm.seleccionar(o.id)
                    abierta = o
                }
                ControlesDeMapa(
                    buscando = estado.buscandoUbicacion,
                    alMiUbicacion = { vm.buscarMiUbicacion { lat, lng -> control.miUbicacion(lat, lng) } },
                    alVerTodo = control::verTodo,
                    modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                )
            }
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().weight(1f), state = listaEstado, contentPadding = PaddingValues(bottom = 90.dp)) {
                if (estado.visibles.isEmpty()) {
                    item { Text("No hay observaciones en este filtro.", modifier = Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                items(estado.visibles, key = { it.id }) { o ->
                    FilaObservacion(
                        o,
                        seleccionada = o.id == estado.seleccionada,
                        // Tocar la fila lleva el mapa a ese punto (Elvis, 26/10)
                        alTocar = {
                            vm.seleccionar(o.id)
                            if (o.lat != null && o.lng != null) control.irA(o.lat, o.lng)
                        },
                        alVer = { vm.seleccionar(o.id); abierta = o },
                    )
                }
            }
        }
    }

    if (estado.formulario) {
        FormularioObservacion(estado, vm)
    }
    if (filtrando) {
        DialogoDeFiltros(estado, alAplicar = { vm.filtrarCon(it); filtrando = false }, alCerrar = { filtrando = false })
    }
    abierta?.let { o ->
        // La que se abre se lee de la lista, para ver los cambios al momento
        val actual = estado.lista.firstOrNull { it.id == o.id } ?: o
        DetalleObservacion(
            o = actual,
            delPunto = estado.delMismoPunto(actual),
            umbralGps = estado.umbralGps,
            puedeEditar = estado.puedeEditar(actual),
            vm = vm,
            alCambiar = { abierta = it },
            alAgregarActividad = { abierta = null; vm.abrirFormulario(true, actual) },
            alCerrar = { abierta = null },
        )
    }
}

/** Los filtros combinables de la lista y el mapa (REV3-OBS-39). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DialogoDeFiltros(estado: EstadoObservaciones, alAplicar: (FiltrosObs) -> Unit, alCerrar: () -> Unit) {
    var f by remember { mutableStateOf(estado.filtros) }
    var eligiendoFecha by remember { mutableStateOf<Boolean?>(null) }   // true = desde, false = hasta
    val l = estado.lista
    val dia = { d: java.time.LocalDate -> "%02d/%02d/%d".format(d.dayOfMonth, d.monthValue, d.year) }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Filtrar observaciones") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Selector("Tramo", l.mapNotNull { o -> o.tramoId?.let { it to (o.tramoCorto ?: it) } }.distinct().sortedBy { it.second },
                    f.tramoId) { f = f.copy(tramoId = it) }
                Selector("Sector", l.mapNotNull { it.sector }.distinct().sorted().map { it to "Sector $it" }, f.sector) { f = f.copy(sector = it) }
                Selector("Código / actividad", l.mapNotNull { o -> o.actividadCodigo?.let { it to "$it · ${o.actividad ?: ""}" } }.distinct().sortedBy { it.first },
                    f.actividad) { f = f.copy(actividad = it) }
                Selector("Registrado por", l.mapNotNull { it.autor }.distinct().sorted().map { it to it }, f.autor) { f = f.copy(autor = it) }
                Text("Fecha de registro", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { eligiendoFecha = true }, modifier = Modifier.weight(1f)) { Text(f.desde?.let { "Desde ${dia(it)}" } ?: "Desde") }
                    OutlinedButton(onClick = { eligiendoFecha = false }, modifier = Modifier.weight(1f)) { Text(f.hasta?.let { "Hasta ${dia(it)}" } ?: "Hasta") }
                }
            }
        },
        dismissButton = { TextButton(onClick = { alAplicar(FiltrosObs()) }) { Text("Limpiar") } },
        confirmButton = { TextButton(onClick = { alAplicar(f) }) { Text("Aplicar") } },
    )
    eligiendoFecha?.let { esDesde ->
        val inicial = (if (esDesde) f.desde else f.hasta)?.atStartOfDay(java.time.ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
        val elegido = rememberDatePickerState(initialSelectedDateMillis = inicial)
        DatePickerDialog(
            onDismissRequest = { eligiendoFecha = null },
            confirmButton = {
                TextButton(onClick = {
                    val d = elegido.selectedDateMillis?.let { java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate() }
                    f = if (esDesde) f.copy(desde = d) else f.copy(hasta = d)
                    eligiendoFecha = null
                }) { Text("Listo") }
            },
            dismissButton = { TextButton(onClick = { f = if (esDesde) f.copy(desde = null) else f.copy(hasta = null); eligiendoFecha = null }) { Text("Quitar") } },
        ) { DatePicker(elegido) }
    }
}

/** Un desplegable con «Todos» y las opciones (valor, etiqueta). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Selector(etiqueta: String, opciones: List<Pair<String, String>>, valor: String?, alElegir: (String?) -> Unit) {
    var abierto by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = abierto, onExpandedChange = { abierto = it }) {
        OutlinedTextField(
            value = opciones.firstOrNull { it.first == valor }?.second ?: "Todos", onValueChange = {}, readOnly = true,
            label = { Text(etiqueta) }, singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(abierto) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            DropdownMenuItem(text = { Text("Todos") }, onClick = { alElegir(null); abierto = false })
            opciones.forEach { (v, t) -> DropdownMenuItem(text = { Text(t, maxLines = 2) }, onClick = { alElegir(v); abierto = false }) }
        }
    }
}

@Composable
private fun FilaObservacion(o: ObservacionDeCampo, seleccionada: Boolean, alTocar: () -> Unit, alVer: () -> Unit) {
    val color = COLOR_ESTADO[o.estado] ?: Color.Gray
    Row(
        Modifier.fillMaxWidth()
            .background(if (seleccionada) Marca.Naranja.copy(alpha = 0.08f) else Color.Transparent)
            .clickable(onClick = alTocar).padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(12.dp).clip(CircleShape).background(color))
        Column(Modifier.weight(1f)) {
            Text(o.descripcion, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            (o.actividad ?: o.categoria)?.let {
                Text(listOfNotNull(o.codigo, o.categoria, o.actividad).joinToString(" · "), fontSize = 12.sp, color = Marca.Azul,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(
                listOfNotNull(o.sector?.let { "Sector $it" } ?: o.tramoCorto, o.progresivas?.let { "km $it" },
                    Lados.codigo(o.side)?.let { "lado $it" }, o.metradoTexto,
                    o.fecha?.let { f -> f.take(10).split("-").reversed().joinToString("/") })
                    .joinToString(" · "),
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(if (o.porEnviar) "Por enviar" else o.estadoLegible, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            color = if (o.porEnviar) Marca.Naranja else color,
            modifier = Modifier.background((if (o.porEnviar) Marca.Naranja else color).copy(alpha = 0.12f), RoundedCornerShape(6.dp))
                .padding(horizontal = 7.dp, vertical = 2.dp))
        IconButton(onClick = alVer) { Icon(Icons.Outlined.Visibility, "Ver la observación", tint = Marca.Azul) }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun DetalleObservacion(
    o: ObservacionDeCampo,
    delPunto: List<ObservacionDeCampo>,
    umbralGps: Double,
    puedeEditar: Boolean,
    vm: ObservacionesViewModel,
    alCambiar: (ObservacionDeCampo) -> Unit,
    alAgregarActividad: () -> Unit,
    alCerrar: () -> Unit,
) {
    var ampliada by remember { mutableStateOf<Any?>(null) }
    var confirmarQuitar by remember { mutableStateOf(false) }
    var fotoAQuitar by remember { mutableStateOf<String?>(null) }
    val urls = remember { mutableStateMapOf<String, String?>() }
    LaunchedEffect(o.fotos) {
        o.galeria.forEach { (llave, modelo) -> if (modelo !is File && llave !in urls) urls[llave] = vm.url(modelo.toString()) }
    }
    fun modeloDe(llave: String, modelo: Any): Any? = if (modelo is File) modelo else urls[llave]

    AlertDialog(
        onDismissRequest = alCerrar,
        title = {
            Text(listOfNotNull(o.codigo, if (o.porEnviar) "Por enviar" else o.estadoLegible).joinToString(" · "),
                color = COLOR_ESTADO[o.estado] ?: Color.Gray)
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(o.descripcion, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                (o.actividad ?: o.categoria)?.let {
                    Text(listOfNotNull(o.categoria, listOfNotNull(o.actividadCodigo, o.actividad).joinToString(" · ").ifBlank { null })
                        .joinToString("\n"), style = MaterialTheme.typography.bodyMedium, color = Marca.Azul)
                }
                Text(listOfNotNull(o.sector?.let { "Sector $it" }, o.tramoCorto, o.progresivas?.let { "km $it" },
                    Lados.etiqueta(o.side)).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                o.metradoTexto?.let { Text("Metrado: $it", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold) }
                Text(listOfNotNull(o.autor, o.cuadrilla).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                o.programadaPara?.let { Text("Programada para el ${it.take(10).split("-").reversed().joinToString("/")}", style = MaterialTheme.typography.bodySmall, color = Marca.Naranja) }
                o.notaAtencion?.let { Text("Atención: $it", style = MaterialTheme.typography.bodySmall) }
                // El GPS del teléfono quedó lejos de la progresiva escrita (REV3-OBS-37)
                o.gpsDistancia?.takeIf { it > umbralGps }?.let { m ->
                    Text("La ubicación GPS quedó a ${distanciaLegible(m.toDouble())} de la progresiva registrada. Verifique el dato.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                }
                // Varias actividades en el mismo punto (REV3-OBS-34)
                if (delPunto.isNotEmpty()) {
                    Text("También en este punto", style = MaterialTheme.typography.labelLarge)
                    delPunto.forEach { x ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { alCambiar(x) }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.size(9.dp).clip(CircleShape).background(COLOR_ESTADO[x.estado] ?: Color.Gray))
                            Text(listOfNotNull(x.actividadCodigo, x.actividad, x.metradoTexto).joinToString(" · ").ifBlank { x.descripcion },
                                style = MaterialTheme.typography.bodySmall, color = Marca.Azul, modifier = Modifier.weight(1f))
                        }
                    }
                }
                if (puedeEditar && o.progresiva != null) {
                    OutlinedButton(onClick = alAgregarActividad, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                        Text("Agregar otra actividad en este punto")
                    }
                }
                // Todas las fotos, y la X para la que salió mal (Elvis, 26/10)
                Text("Fotos (${o.fotos.size})", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    o.galeria.forEach { (llave, modelo) ->
                        Box {
                            AsyncImage(model = modeloDe(llave, modelo), contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.size(96.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFFE9EDF3))
                                    .clickable { ampliada = modeloDe(llave, modelo) })
                            if (puedeEditar && o.fotos.size > 1) {
                                BotonQuitar("Quitar foto", Modifier.align(Alignment.TopEnd)) { fotoAQuitar = llave }
                            }
                        }
                    }
                }
                if (puedeEditar && o.fotos.size == 1) {
                    Text("La observación lleva al menos una foto.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (o.porEnviar) Text("Guardada en el celular: sube al haber señal.", color = Marca.Naranja, style = MaterialTheme.typography.bodySmall)
            }
        },
        dismissButton = {
            if (puedeEditar) {
                TextButton(onClick = { confirmarQuitar = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Icon(Icons.Outlined.DeleteOutline, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text("Quitar observación")
                }
            }
        },
        confirmButton = { TextButton(onClick = alCerrar) { Text("Cerrar") } },
    )
    ampliada?.let { VisorConZoom(modelo = it, descripcion = null, alCerrar = { ampliada = null }) }
    if (confirmarQuitar) {
        AlertDialog(
            onDismissRequest = { confirmarQuitar = false },
            title = { Text("¿Quitar la observación?") },
            text = { Text("«${o.descripcion.take(80)}» se quita con sus ${o.fotos.size} foto(s). Úsalo si se registró por error.") },
            confirmButton = {
                TextButton(onClick = { confirmarQuitar = false; vm.quitar(o); alCerrar() },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Sí, quitar") }
            },
            dismissButton = { TextButton(onClick = { confirmarQuitar = false }) { Text("Cancelar") } },
        )
    }
    fotoAQuitar?.let { llave ->
        AlertDialog(
            onDismissRequest = { fotoAQuitar = null },
            title = { Text("¿Quitar esta foto?") },
            text = { Text("Se quita de la observación. Las demás fotos se quedan.") },
            confirmButton = {
                TextButton(onClick = { fotoAQuitar = null; vm.quitarFoto(o, llave, alCambiar) },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Sí, quitar") }
            },
            dismissButton = { TextButton(onClick = { fotoAQuitar = null }) { Text("Cancelar") } },
        )
    }
}

/** La X sobre una miniatura: chica, sin el círculo grande del botón de Material. */
@Composable
private fun BotonQuitar(descripcion: String, modifier: Modifier, alTocar: () -> Unit) {
    Box(
        modifier.padding(4.dp).size(26.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = alTocar),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.Close, descripcion, tint = Color.White, modifier = Modifier.size(15.dp))
    }
}

/**
 * La progresiva se escribe solo con números y el «+» aparece solo antes de
 * los metros (Elvis, 26/10: «que aparezca con el término de progresiva, con
 * un más intermedio»): 1130221 se ve 1130+221.
 */
private object ConMas : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val s = text.text
        if (s.length <= 3) return TransformedText(text, OffsetMapping.Identity)
        val corte = s.length - 3
        return TransformedText(
            AnnotatedString(s.substring(0, corte) + "+" + s.substring(corte)),
            object : OffsetMapping {
                override fun originalToTransformed(offset: Int) = if (offset <= corte) offset else offset + 1
                override fun transformedToOriginal(offset: Int) = if (offset <= corte) offset else offset - 1
            },
        )
    }
}

/** Lo que se escribe en el campo de progresiva: solo cifras, hasta km 9999+999. */
private fun soloCifras(v: String) = v.filter { it.isDigit() }.take(7)

/** Una actividad del formulario: la categoría elegida, la partida y su metrado. */
private data class Entrada(val categoria: String? = null, val actividad: Actividad? = null, val metrado: String = "")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FormularioObservacion(estado: EstadoObservaciones, vm: ObservacionesViewModel) {
    // Agregar otra actividad en un punto ya registrado: el sitio no cambia
    val base = estado.formularioBase
    var tramo by remember { mutableStateOf(base?.tramoId?.let { id -> estado.tramos.firstOrNull { it.id == id } } ?: estado.tramoPorDefecto) }
    val entradas = remember { mutableStateListOf(Entrada()) }
    var prog by remember { mutableStateOf(base?.progresiva?.toLong()?.toString() ?: "") }
    var progFin by remember { mutableStateOf(base?.progresivaFin?.toLong()?.toString() ?: "") }
    var lado by remember { mutableStateOf(base?.side ?: "derecho") }
    var descripcion by remember { mutableStateOf(base?.descripcion ?: "") }
    val fotos = remember { mutableStateListOf<File>() }
    var error by remember { mutableStateOf<String?>(null) }
    var eligiendoTramo by remember { mutableStateOf(false) }
    // El desplegable abierto: (n.º de actividad, true = categoría / false = actividad)
    var abierto by remember { mutableStateOf<Pair<Int, Boolean>?>(null) }
    val categorias = remember(estado.actividades) {
        estado.actividades.mapNotNull { it.category }.distinct()
            .sortedBy { c -> estado.ordenDeCategorias[c] ?: Int.MAX_VALUE }
    }
    fun unidadDe(a: Actividad?) = a?.unidadId?.let { estado.unidades[it] }
    // La progresiva final solo para lo que se mide a lo largo de la vía (REV3-OBS-35)
    val hayLineal = entradas.any { esLineal(unidadDe(it.actividad)) }
    fun tramoDe(m: Double?) = m?.let { estado.tramos.firstOrNull { t -> it >= t.progresivaInicio && it <= t.progresivaFin } }
    // El aviso se va en cuanto se corrige algo: no se queda pidiendo lo que ya se llenó
    LaunchedEffect(entradas.toList(), prog, progFin, descripcion, fotos.size) { error = null }

    // La cámara de SIGOV, en horizontal y con el encuadre real (Elvis, 26/10)
    var camaraAbierta by remember { mutableStateOf(false) }
    if (camaraAbierta) {
        pe.servicon.sigov.ui.evidencia.CamaraSimple(
            titulo = "Foto de la observación",
            destino = { vm.archivoTemporal() },
            alTomar = { f -> fotos += f; camaraAbierta = false },
            alCerrar = { camaraAbierta = false },
        )
    }

    fun guardar(gpsConfirmado: Boolean) {
        val m = prog.takeIf { it.isNotBlank() }?.let { Progresiva.aMetros(it) }
        val mFin = progFin.takeIf { it.isNotBlank() && hayLineal }?.let { Progresiva.aMetros(it) }
        // La progresiva manda: si cae en otro tramo, es ese tramo (Elvis,
        // 26/10: el km 1130+221 del tramo 2 se guardó en el tramo 1)
        if (base == null) tramoDe(m)?.let { tramo = it }
        val t = tramo
        val fuera = m != null && t != null && (m < t.progresivaInicio || m > t.progresivaFin)
        val finFuera = mFin != null && t != null && (mFin < t.progresivaInicio || mFin > t.progresivaFin)
        val sinActividad = entradas.indexOfFirst { it.actividad == null }
        val metradoMalo = entradas.indexOfFirst { it.metrado.isNotBlank() && it.metrado.toDoubleOrNull() == null }
        val repetida = entradas.mapNotNull { it.actividad?.id }.let { it.size != it.toSet().size }
        error = when {
            sinActividad >= 0 -> if (entradas.size == 1) "Elige el tipo de actividad: la categoría y luego la actividad."
                else "Elige la categoría y la actividad ${sinActividad + 1}."
            repetida -> "La misma actividad está dos veces en el punto."
            prog.isBlank() -> "Escribe la progresiva inicial."
            m == null -> "La progresiva no se entiende. Escribe solo los números: 1130221."
            t == null -> "Elige el tramo de esa progresiva."
            fuera -> "El km ${Progresiva.aTexto(m)} no está en ningún tramo del contrato. Revisa la progresiva."
            hayLineal && progFin.isBlank() -> "Es una actividad lineal: escribe también la progresiva final."
            hayLineal && mFin == null -> "La progresiva final no se entiende."
            finFuera -> "La progresiva final no está en el ${t.code}: un intervalo va dentro de un tramo."
            metradoMalo >= 0 -> "El metrado de la actividad ${metradoMalo + 1} no se entiende."
            descripcion.isBlank() -> "Escribe qué se observa."
            fotos.isEmpty() && base == null -> "Toma al menos una foto."
            else -> null
        }
        if (error != null) return
        // El intervalo va de menor a mayor, se escriba como se escriba
        val (ini, fin) = if (mFin != null && mFin < m!!) mFin to m else m to mFin
        vm.registrar(
            tramo = t,
            actividades = entradas.map { e ->
                val u = unidadDe(e.actividad)
                ObservacionesRepositorio.ActividadDelPunto(e.actividad!!, u, e.metrado.takeIf { it.isNotBlank() }?.toDoubleOrNull(), esLineal(u))
            },
            progresiva = ini,
            progresivaFin = fin?.takeIf { it != ini },
            lado = lado,
            descripcion = descripcion.trim(),
            fotos = fotos.toList(),
            puntoId = base?.punto,
            gpsConfirmado = gpsConfirmado,
        )
    }

    Dialog(onDismissRequest = { vm.abrirFormulario(false) }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.94f), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.fillMaxSize()) {
                Text(if (base == null) "Registrar observación" else "Otra actividad en este punto",
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp))
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // ── Las actividades: categoría y partida; varias en un mismo punto (REV3-OBS-33/34)
                    entradas.forEachIndexed { i, e ->
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(if (entradas.size == 1) "Tipo de actividad" else "Actividad ${i + 1}",
                                        style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                                    if (entradas.size > 1) {
                                        TextButton(onClick = { entradas.removeAt(i) }) { Text("Quitar") }
                                    }
                                }
                                ExposedDropdownMenuBox(expanded = abierto == (i to true), onExpandedChange = { abierto = if (it) i to true else null }) {
                                    OutlinedTextField(
                                        value = e.categoria ?: "", onValueChange = {}, readOnly = true,
                                        label = { Text("Categoría") }, placeholder = { Text("Berma, calzada, drenaje…") },
                                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(abierto == (i to true)) },
                                        modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                                    )
                                    ExposedDropdownMenu(expanded = abierto == (i to true), onDismissRequest = { abierto = null }) {
                                        categorias.forEach { c ->
                                            DropdownMenuItem(text = { Text(c) }, onClick = {
                                                entradas[i] = if (c != e.categoria) Entrada(categoria = c) else e
                                                abierto = null
                                            })
                                        }
                                    }
                                }
                                val delTipo = estado.actividades.filter { it.category == e.categoria }
                                ExposedDropdownMenuBox(expanded = abierto == (i to false), onExpandedChange = { if (e.categoria != null) abierto = if (it) i to false else null }) {
                                    OutlinedTextField(
                                        value = e.actividad?.let { "${it.code} · ${it.name}" } ?: "", onValueChange = {}, readOnly = true,
                                        enabled = e.categoria != null,
                                        label = { Text("Actividad") },
                                        placeholder = { Text(if (e.categoria == null) "Elige primero la categoría" else "Limpieza de berma, parchado…") },
                                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(abierto == (i to false)) },
                                        modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                                    )
                                    ExposedDropdownMenu(expanded = abierto == (i to false), onDismissRequest = { abierto = null }) {
                                        delTipo.forEach { a ->
                                            DropdownMenuItem(
                                                text = {
                                                    Column {
                                                        Text(a.name, fontSize = 14.sp)
                                                        Text(listOfNotNull(a.code, unidadDe(a), if (esLineal(unidadDe(a))) "lineal" else "puntual").joinToString(" · "),
                                                            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                    }
                                                },
                                                onClick = { entradas[i] = e.copy(actividad = a); abierto = null },
                                            )
                                        }
                                    }
                                }
                                // La unidad sale del catálogo: no se elige ni se escribe (REV3-OBS-01)
                                val u = unidadDe(e.actividad)
                                OutlinedTextField(
                                    e.metrado, { v -> entradas[i] = e.copy(metrado = v.replace(',', '.').filter { it.isDigit() || it == '.' }.take(10)) },
                                    label = { Text("Metrado") }, placeholder = { Text("30") },
                                    suffix = u?.let { { Text(it) } },
                                    supportingText = { Text(if (u != null) "En $u, la unidad de la actividad." else "Lo que se estima por atender.") },
                                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                    if (entradas.size < 6) {
                        OutlinedButton(onClick = { entradas += Entrada() }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Outlined.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                            Text("Agregar otra actividad en este punto")
                        }
                    }

                    // ── Dónde: la progresiva manda el tramo
                    if (base != null) {
                        Surface(shape = RoundedCornerShape(12.dp), color = Marca.Azul.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text("En el punto de ${base.codigo ?: "la observación"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(listOfNotNull(base.tramoCorto, base.progresivas?.let { "km $it" }, Lados.etiqueta(base.side)).joinToString(" · "),
                                    style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                prog,
                                { v ->
                                    prog = soloCifras(v)
                                    tramoDe(Progresiva.aMetros(prog))?.let { tramo = it }
                                },
                                label = { Text(if (hayLineal) "Progresiva inicial" else "Progresiva") }, placeholder = { Text("1130+221") },
                                visualTransformation = ConMas,
                                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f),
                            )
                            if (hayLineal) {
                                OutlinedTextField(
                                    progFin, { progFin = soloCifras(it) },
                                    label = { Text("Progresiva final") }, placeholder = { Text("1130+400") },
                                    visualTransformation = ConMas,
                                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        Text(
                            "Escribe solo los números: el «+» aparece solo. " +
                                if (hayLineal) "Es una actividad lineal: va de una progresiva a otra." else "Es una actividad puntual: una sola progresiva.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedCard(onClick = { eligiendoTramo = true }, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Tramo (sale de la progresiva)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(tramo?.let { "${it.code} · ${it.name}" } ?: "Elige el tramo", style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                        Text("Lado de la vía", style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Lados.todos.forEach { l ->
                                FilterChip(selected = lado == l.valor, onClick = { lado = l.valor }, label = { Text(l.etiqueta) })
                            }
                        }
                    }
                    OutlinedTextField(
                        descripcion, { descripcion = it.take(500) },
                        label = { Text("Observación") }, placeholder = { Text("Desmonte en la berma, basura acumulada, señal caída…") },
                        minLines = 3, modifier = Modifier.fillMaxWidth(),
                    )

                    // ── Las fotos del momento, como en las demás fichas (en verde)
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Marca.VerdeBandera.copy(alpha = 0.06f),
                        border = BorderStroke(1.dp, Marca.VerdeBandera.copy(alpha = 0.45f)),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Outlined.PhotoCamera, null, tint = Marca.VerdeBandera)
                                Text("Fotos del momento", fontWeight = FontWeight.SemiBold, color = Marca.VerdeBandera)
                                Spacer(Modifier.weight(1f))
                                Text("${fotos.size} de 3", fontSize = 12.sp, color = Marca.VerdeBandera)
                            }
                            if (base != null) {
                                Text("El punto ya tiene ${base.fotos.size} foto(s); se comparten. Agrega otras solo si hacen falta.",
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                fotos.forEach { f ->
                                    Box {
                                        AsyncImage(model = f, contentDescription = null, contentScale = ContentScale.Crop,
                                            modifier = Modifier.size(92.dp).clip(RoundedCornerShape(10.dp))
                                                .border(2.dp, Marca.VerdeBandera, RoundedCornerShape(10.dp)))
                                        BotonQuitar("Quitar", Modifier.align(Alignment.TopEnd)) { fotos.remove(f) }
                                    }
                                }
                                if (fotos.size < 3) {
                                    OutlinedButton(
                                        onClick = { camaraAbierta = true },
                                        shape = RoundedCornerShape(10.dp),
                                        border = BorderStroke(1.5.dp, Marca.VerdeBandera),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Marca.VerdeBandera),
                                        modifier = Modifier.size(92.dp),
                                        contentPadding = PaddingValues(4.dp),
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Icon(Icons.Outlined.PhotoCamera, null)
                                            Text("Tomar foto", fontSize = 12.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // El aviso va junto al botón: en el video se pulsaba «Guardar»
                // una y otra vez sin ver qué faltaba, porque quedaba arriba
                (error ?: estado.error)?.let {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                        Text(it, color = MaterialTheme.colorScheme.onErrorContainer, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
                    }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { vm.abrirFormulario(false) }, modifier = Modifier.weight(1f).height(50.dp)) { Text("Cancelar") }
                    Button(
                        onClick = { guardar(gpsConfirmado = false) },
                        enabled = !estado.guardando,
                        colors = ButtonDefaults.buttonColors(containerColor = Marca.VerdeBandera),
                        modifier = Modifier.weight(1f).height(50.dp),
                    ) { Text(if (estado.guardando) "Guardando…" else "Guardar") }
                }
            }
        }
    }
    // El GPS quedó lejos de la progresiva escrita (REV3-OBS-37)
    estado.avisoGps?.let { metros ->
        AlertDialog(
            onDismissRequest = vm::avisoGpsVisto,
            title = { Text("Revisa la progresiva") },
            text = {
                Text("La ubicación GPS está alejada de la progresiva registrada (a ${distanciaLegible(metros)}). " +
                    "Verifique el dato.\n\nSi estás registrando desde otro lugar, puedes guardar igual.")
            },
            confirmButton = { TextButton(onClick = { guardar(gpsConfirmado = true) }) { Text("Guardar igual") } },
            dismissButton = { TextButton(onClick = vm::avisoGpsVisto) { Text("Revisar") } },
        )
    }
    if (eligiendoTramo) {
        AlertDialog(
            onDismissRequest = { eligiendoTramo = false },
            title = { Text("Tramo") },
            text = {
                LazyColumn {
                    items(estado.tramos, key = { it.id }) { t ->
                        Text("${t.code} · ${t.name}", modifier = Modifier.fillMaxWidth().clickable { tramo = t; eligiendoTramo = false }.padding(vertical = 12.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { eligiendoTramo = false }) { Text("Cerrar") } },
        )
    }
}

@Composable
private fun MapaDeObservaciones(
    lista: List<ObservacionDeCampo>,
    seleccionada: String?,
    control: ControlDeMapa,
    modifier: Modifier,
    alTocar: (ObservacionDeCampo) -> Unit,
) {
    val contexto = LocalContext.current
    val porId by rememberUpdatedState(remember(lista) { lista.associateBy { it.id } })
    val tocar by rememberUpdatedState(alTocar)
    var mapa by remember { mutableStateOf<MapLibreMap?>(null) }
    var listo by remember { mutableStateOf(false) }
    val vista = remember { MapLibre.getInstance(contexto); MapView(contexto) }
    DisposableEffect(Unit) {
        vista.onStart(); vista.onResume()
        onDispose { vista.onPause(); vista.onStop(); vista.onDestroy() }
    }
    AndroidView(factory = { vista }, modifier = modifier) { v ->
        if (mapa == null) {
            v.getMapAsync { m ->
                mapa = m
                control.mapa = m
                m.setStyle(Style.Builder().fromJson(ESTILO_CALLES)) { estilo ->
                    estilo.addSource(GeoJsonSource("src-obs", FeatureCollection.fromFeatures(emptyList())))
                    // El halo de la elegida en la lista
                    estilo.addLayer(CircleLayer("capa-obs-sel", "src-obs").withProperties(
                        PropertyFactory.circleColor("#F96414"),
                        PropertyFactory.circleOpacity(0.35f),
                        PropertyFactory.circleRadius(22f),
                    ).withFilter(Expression.eq(Expression.get("sel"), Expression.literal(true))))
                    estilo.addLayer(CircleLayer("capa-obs", "src-obs").withProperties(
                        PropertyFactory.circleColor(Expression.toColor(Expression.get("color"))),
                        // El zoom va arriba (regla de MapLibre); cada actividad más agranda el punto
                        PropertyFactory.circleRadius(Expression.interpolate(Expression.linear(), Expression.zoom(),
                            Expression.stop(6, Expression.sum(Expression.literal(5f), Expression.product(Expression.literal(2f), Expression.subtract(Expression.get("n"), Expression.literal(1f))))),
                            Expression.stop(12, Expression.sum(Expression.literal(9f), Expression.product(Expression.literal(2f), Expression.subtract(Expression.get("n"), Expression.literal(1f))))),
                            Expression.stop(16, Expression.sum(Expression.literal(13f), Expression.product(Expression.literal(2f), Expression.subtract(Expression.get("n"), Expression.literal(1f))))))),
                        PropertyFactory.circleStrokeWidth(2f),
                        PropertyFactory.circleStrokeColor("#FFFFFF"),
                    ))
                    listo = true
                }
                m.addOnMapClickListener { punto ->
                    val p = m.projection.toScreenLocation(punto)
                    val r = 26f
                    val f = m.queryRenderedFeatures(android.graphics.RectF(p.x - r, p.y - r, p.x + r, p.y + r), "capa-obs")
                    f.firstOrNull()?.getStringProperty("id")?.let { id -> porId[id]?.let(tocar) }
                    f.isNotEmpty()
                }
            }
        }
    }
    // Los puntos (y el halo de la elegida)
    LaunchedEffect(lista, seleccionada, listo) {
        val m = mapa ?: return@LaunchedEffect
        if (!listo) return@LaunchedEffect
        // Un marcador por punto, aunque tenga varias actividades (REV3-OBS-34):
        // lleva el color de la más atrasada y se agranda con cada actividad
        val rasgos = lista.filter { it.lat != null && it.lng != null }.groupBy { it.punto }.values.map { delPunto ->
            val o = delPunto.first()
            val peor = delPunto.minByOrNull { listOf("pendiente", "programada", "atendida").indexOf(it.estado).let { i -> if (i < 0) 0 else i } } ?: o
            Feature.fromGeometry(Point.fromLngLat(o.lng!!, o.lat!!)).apply {
                addStringProperty("id", o.id)
                addStringProperty("color", hex(if (delPunto.any { it.porEnviar }) Marca.Naranja else COLOR_ESTADO[peor.estado] ?: Color.Gray))
                addBooleanProperty("sel", delPunto.any { it.id == seleccionada })
                addNumberProperty("n", delPunto.size)
            }
        }
        m.getStyle { it.getSourceAs<GeoJsonSource>("src-obs")?.setGeoJson(FeatureCollection.fromFeatures(rasgos)) }
    }
    // El encuadre, solo cuando cambia lo que se muestra
    LaunchedEffect(lista, listo) {
        val m = mapa ?: return@LaunchedEffect
        if (!listo) return@LaunchedEffect
        val puntos = lista.filter { it.lat != null && it.lng != null }
        if (puntos.isNotEmpty()) {
            val b = LatLngBounds.Builder()
            puntos.forEach { b.include(LatLng(it.lat!!, it.lng!!)) }
            // Uno solo, o varios en el mismo km: se encuadra con margen, no al zoom máximo
            if (puntos.distinctBy { it.lat to it.lng }.size == 1) {
                // Con margen a ambos lados, para que el punto quede al centro
                b.include(LatLng(puntos[0].lat!! + 0.01, puntos[0].lng!! + 0.01))
                b.include(LatLng(puntos[0].lat!! - 0.01, puntos[0].lng!! - 0.01))
            }
            val limites = b.build()
            control.limites = limites
            runCatching { m.animateCamera(CameraUpdateFactory.newLatLngBounds(limites, 60), 600) }
        } else {
            runCatching { m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-17.2, -71.5), 6.0)) }
        }
    }
}
