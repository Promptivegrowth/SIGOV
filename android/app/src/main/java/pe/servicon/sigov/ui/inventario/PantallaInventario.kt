package pe.servicon.sigov.ui.inventario

import android.graphics.Color as ColorAndroid
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point
import pe.servicon.sigov.datos.ElementoVial
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

/**
 * El inventario del tramo sobre el mapa.
 *
 * Es la misma pantalla del panel web, hecha para el bolsillo: el supervisor
 * está parado en la carretera y necesita saber qué tiene cerca que hace
 * tiempo nadie toca. Por eso el color del punto es el tiempo sin intervenir
 * y no el estado de conservación, y por eso los filtros están arriba, a un
 * toque del pulgar.
 *
 * La cartografía de fondo necesita señal. Cuando no la hay, el mapa queda
 * gris pero los puntos, los filtros y las fichas siguen funcionando con lo
 * que se bajó la última vez: en carretera eso es la diferencia entre una
 * herramienta y un adorno.
 */

private val COLOR_SEMAFORO = mapOf(
    Semaforo.AL_DIA to Color(0xFF16A34A),
    Semaforo.POR_VENCER to Color(0xFFF59E0B),
    Semaforo.CRITICO to Color(0xFFDC2626),
    Semaforo.SIN_INTERVENIR to Color(0xFF64748B),
)

private const val FUENTE = "src-inventario"
private const val CAPA = "capa-inventario"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaInventario(
    vm: InventarioViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var filtrosAbiertos by remember { mutableStateOf(false) }

    LaunchedEffect(estado.error) {
        estado.error?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    ArmazonDeApartado(
        titulo = "Inventario vial",
        seccion = "Lo que hay en tu tramo",
        alVolver = alVolver,
        ayuda = "En rojo, lo que hace tiempo que nadie interviene.",
        avisos = avisos,
        acciones = {
            IconButton(onClick = { filtrosAbiertos = true }) {
                Icon(Icons.Outlined.FilterList, "Filtros", tint = Marca.Azul)
            }
            IconButton(onClick = vm::refrescar) {
                Icon(Icons.Outlined.Refresh, "Actualizar", tint = Marca.Azul)
            }
        },
    ) { relleno ->
        Box(Modifier.fillMaxSize().padding(relleno)) {

            if (estado.cargando && estado.todos.isEmpty()) {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(color = Marca.Verde, strokeWidth = 3.dp)
                    Spacer(Modifier.height(14.dp))
                    Text("Bajando el inventario…", style = MaterialTheme.typography.bodySmall,
                        color = TintaSuave)
                }
            } else {
                MapaDelInventario(
                    elementos = estado.visibles,
                    alTocar = vm::abrir,
                    modifier = Modifier.fillMaxSize(),
                )

                // ── El semáforo, siempre a la vista ───────────────────
                Row(
                    Modifier
                        .align(Alignment.TopCenter)
                        .padding(10.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White.copy(alpha = 0.94f))
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Semaforo.entries.forEach { s ->
                        val activo = s in estado.semaforos
                        val cuantos = estado.porSemaforo[s] ?: 0
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(7.dp))
                                .background(if (activo) Marca.Azul.copy(alpha = 0.10f) else Color.Transparent)
                                .clickable { vm.alternarSemaforo(s) }
                                .padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Box(Modifier.size(9.dp).clip(CircleShape)
                                .background(COLOR_SEMAFORO[s] ?: Color.Gray))
                            Text(s.etiqueta, fontSize = 11.5.sp,
                                fontWeight = if (activo) FontWeight.SemiBold else FontWeight.Normal)
                            Text("$cuantos", fontSize = 11.sp, color = TintaSuave)
                        }
                    }
                }

                // ── Cuántos se están viendo ───────────────────────────
                Surface(
                    Modifier.align(Alignment.BottomStart).padding(10.dp),
                    shape = RoundedCornerShape(9.dp),
                    color = Color.White.copy(alpha = 0.94f),
                    shadowElevation = 2.dp,
                ) {
                    Text(
                        "${estado.visibles.size} de ${estado.todos.size} elementos",
                        Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }

    // ── Los filtros ───────────────────────────────────────────────────
    if (filtrosAbiertos) {
        ModalBottomSheet(onDismissRequest = { filtrosAbiertos = false }) {
            HojaDeFiltros(
                estado = estado,
                alElegirTramo = vm::elegirTramo,
                alAlternarTipo = vm::alternarTipo,
                alLimpiar = vm::limpiarTipos,
            )
        }
    }

    // ── La ficha del elemento ─────────────────────────────────────────
    estado.abierto?.let { elemento ->
        ModalBottomSheet(onDismissRequest = vm::cerrarFicha) {
            FichaDelElemento(elemento, estado)
        }
    }
}

// ═══ El mapa ══════════════════════════════════════════════════════════

/**
 * El lienzo de MapLibre dentro de Compose.
 *
 * Se dibuja una sola capa de círculos coloreada por el semáforo, igual que
 * en la web. Miles de puntos en una capa vectorial se mueven sin tirones; un
 * marcador por elemento habría dejado el mapa inservible.
 */
@Composable
private fun MapaDelInventario(
    elementos: List<ElementoVial>,
    alTocar: (ElementoVial) -> Unit,
    modifier: Modifier = Modifier,
) {
    val contexto = LocalContext.current
    val porId = remember(elementos) { elementos.associateBy { it.id } }
    var mapa by remember { mutableStateOf<MapLibreMap?>(null) }
    var estiloListo by remember { mutableStateOf(false) }

    val vista = remember {
        MapLibre.getInstance(contexto)
        MapView(contexto)
    }

    DisposableEffect(Unit) {
        vista.onStart()
        vista.onResume()
        onDispose {
            vista.onPause()
            vista.onStop()
            vista.onDestroy()
        }
    }

    AndroidView(factory = { vista }, modifier = modifier) { v ->
        if (mapa == null) {
            v.getMapAsync { m ->
                mapa = m
                m.setStyle(Style.Builder().fromJson(ESTILO_CALLES)) { estilo ->
                    estilo.addSource(GeoJsonSource(FUENTE, FeatureCollection.fromFeatures(emptyList())))
                    estilo.addLayer(
                        CircleLayer(CAPA, FUENTE).withProperties(
                            PropertyFactory.circleColor(
                                Expression.match(
                                    Expression.get("semaforo"),
                                    Expression.color(COLOR_SEMAFORO[Semaforo.SIN_INTERVENIR]!!.toArgb()),
                                    Expression.stop("al_dia", Expression.color(COLOR_SEMAFORO[Semaforo.AL_DIA]!!.toArgb())),
                                    Expression.stop("por_vencer", Expression.color(COLOR_SEMAFORO[Semaforo.POR_VENCER]!!.toArgb())),
                                    Expression.stop("critico", Expression.color(COLOR_SEMAFORO[Semaforo.CRITICO]!!.toArgb())),
                                )
                            ),
                            PropertyFactory.circleRadius(
                                Expression.interpolate(
                                    Expression.linear(), Expression.zoom(),
                                    Expression.stop(6, 2f),
                                    Expression.stop(9, 3.5f),
                                    Expression.stop(12, 6f),
                                    Expression.stop(16, 11f),
                                )
                            ),
                            // El borde blanco aparece al acercarse. A vista de
                            // contrato hay dos mil setecientos puntos casi
                            // pegados y sus bordes se fundían en una banda
                            // blanca que tapaba los colores del semáforo.
                            PropertyFactory.circleStrokeWidth(
                                Expression.interpolate(
                                    Expression.linear(), Expression.zoom(),
                                    Expression.stop(6, 0f),
                                    Expression.stop(10, 0f),
                                    Expression.stop(12, 1.2f),
                                    Expression.stop(16, 1.8f),
                                )
                            ),
                            PropertyFactory.circleStrokeColor(ColorAndroid.WHITE),
                            PropertyFactory.circleOpacity(0.92f),
                        )
                    )
                    estiloListo = true
                }

                m.addOnMapClickListener { punto ->
                    val pantalla = m.projection.toScreenLocation(punto)
                    // Un dedo no acierta un círculo de siete píxeles: se
                    // busca en un cuadrado de tolerancia alrededor del toque.
                    val radio = 26f
                    val caja = android.graphics.RectF(
                        pantalla.x - radio, pantalla.y - radio,
                        pantalla.x + radio, pantalla.y + radio,
                    )
                    val encontrados = m.queryRenderedFeatures(caja, CAPA)
                    encontrados.firstOrNull()?.getStringProperty("id")?.let { id ->
                        porId[id]?.let(alTocar)
                    }
                    encontrados.isNotEmpty()
                }
            }
        }
    }

    // Los puntos, cada vez que cambian los filtros
    LaunchedEffect(elementos, estiloListo) {
        val m = mapa ?: return@LaunchedEffect
        if (!estiloListo) return@LaunchedEffect

        val rasgos = elementos.mapNotNull { e ->
            val lat = e.lat ?: return@mapNotNull null
            val lng = e.lng ?: return@mapNotNull null
            Feature.fromGeometry(Point.fromLngLat(lng, lat)).apply {
                addStringProperty("id", e.id)
                addStringProperty("semaforo", e.semaforo ?: "sin_intervenir")
            }
        }

        m.getStyle { estilo ->
            (estilo.getSourceAs<GeoJsonSource>(FUENTE))
                ?.setGeoJson(FeatureCollection.fromFeatures(rasgos))
        }

        // Encuadrar lo que se está viendo
        if (rasgos.isNotEmpty()) {
            val lats = elementos.mapNotNull { it.lat }
            val lngs = elementos.mapNotNull { it.lng }
            if (lats.isNotEmpty() && lngs.isNotEmpty()) {
                val limites = LatLngBounds.Builder()
                    .include(LatLng(lats.min(), lngs.min()))
                    .include(LatLng(lats.max(), lngs.max()))
                    .build()
                runCatching {
                    m.animateCamera(CameraUpdateFactory.newLatLngBounds(limites, 60), 700)
                }
            }
        }
    }
}

/** La misma cartografía abierta que usa el panel web: sin clave ni licencia. */
private const val ESTILO_CALLES = """
{
  "version": 8,
  "sources": {
    "osm": {
      "type": "raster",
      "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      "tileSize": 256,
      "attribution": "© OpenStreetMap"
    }
  },
  "layers": [{ "id": "osm", "type": "raster", "source": "osm" }]
}
"""

// ═══ Los filtros ══════════════════════════════════════════════════════

@Composable
private fun HojaDeFiltros(
    estado: EstadoInventario,
    alElegirTramo: (String?) -> Unit,
    alAlternarTipo: (String) -> Unit,
    alLimpiar: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Filtrar el inventario", style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold)

        // El tramo
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text("TRAMO", fontSize = 10.5.sp, letterSpacing = 1.sp,
                fontWeight = FontWeight.SemiBold, color = TintaSuave)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                item {
                    FilterChip(
                        selected = estado.tramoId == null,
                        onClick = { alElegirTramo(null) },
                        label = { Text("Todo el contrato", fontSize = 12.sp) },
                    )
                }
                items(estado.tramos) { t ->
                    FilterChip(
                        selected = estado.tramoId == t.id,
                        onClick = { alElegirTramo(t.id) },
                        label = { Text(t.code, fontSize = 12.sp) },
                    )
                }
            }
        }

        // Los componentes
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("COMPONENTE", fontSize = 10.5.sp, letterSpacing = 1.sp,
                    fontWeight = FontWeight.SemiBold, color = TintaSuave,
                    modifier = Modifier.weight(1f))
                if (estado.tipos.isNotEmpty()) {
                    TextButton(onClick = alLimpiar) { Text("Ver todos", fontSize = 12.sp) }
                }
            }

            estado.resumen.forEach { t ->
                val activo = t.codigo in estado.tipos
                Surface(
                    onClick = { alAlternarTipo(t.codigo) },
                    shape = RoundedCornerShape(10.dp),
                    color = if (activo) Marca.Azul.copy(alpha = 0.08f) else Color.Transparent,
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        if (activo) Marca.Azul.copy(alpha = 0.45f) else Color(0xFFE2E6EE),
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(t.nombre, fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
                            Text(t.category ?: "", fontSize = 11.sp, color = TintaSuave)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${t.total}", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            if (t.porAtender > 0) {
                                Text("${t.porAtender} por atender", fontSize = 10.5.sp,
                                    color = COLOR_SEMAFORO[Semaforo.CRITICO]!!)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══ La ficha ═════════════════════════════════════════════════════════

@Composable
private fun FichaDelElemento(elemento: ElementoVial, estado: EstadoInventario) {
    val semaforo = Semaforo.de(elemento.semaforo)
    val color = COLOR_SEMAFORO[semaforo] ?: Color.Gray

    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, bottom = 30.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Column {
            Text(elemento.name ?: elemento.tipo ?: "Elemento",
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("${elemento.code ?: ""} · ${elemento.tipo ?: ""}",
                fontSize = 12.sp, color = TintaSuave)
        }

        // El semáforo: lo que trajo al supervisor hasta aquí
        Surface(shape = RoundedCornerShape(10.dp), color = color.copy(alpha = 0.10f),
            modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(semaforo.etiqueta, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color)
                Text(
                    elemento.ultimaIntervencion?.let {
                        "Última intervención el $it · hace ${elemento.diasSinIntervenir ?: 0} días"
                    } ?: "Nunca se registró una intervención",
                    fontSize = 12.sp, color = TintaSuave,
                )
            }
        }

        // Dónde está
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DatoFicha("Progresiva", elemento.progresiva ?: "—", Modifier.weight(1f))
            DatoFicha("Lado", elemento.side ?: "—", Modifier.weight(1f))
        }
        DatoFicha("Tramo", elemento.tramo ?: "—", Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DatoFicha("Conservación", elemento.condition ?: "—", Modifier.weight(1f))
            DatoFicha("Visitas", "${elemento.visitas}", Modifier.weight(1f))
        }

        // Las dos fotos
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(14.dp), tint = TintaSuave)
                Spacer(Modifier.width(5.dp))
                Text("FOTOGRAFÍAS", fontSize = 10.5.sp, letterSpacing = 1.sp,
                    fontWeight = FontWeight.SemiBold, color = TintaSuave,
                    modifier = Modifier.weight(1f))
                elemento.diasEntreFotos?.let {
                    Text("$it días entre una y otra", fontSize = 10.5.sp, color = TintaSuave)
                }
            }

            when {
                estado.cargandoFicha ->
                    Box(Modifier.fillMaxWidth().height(60.dp), Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp,
                            color = Marca.Verde)
                    }

                estado.urlActual == null ->
                    Surface(shape = RoundedCornerShape(10.dp), color = Color(0xFFF5F7FA),
                        modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Todavía no hay fotografías de este elemento. Aparecerán cuando " +
                                "una cuadrilla registre trabajo en esta progresiva.",
                            Modifier.padding(12.dp), fontSize = 12.sp, color = TintaSuave,
                        )
                    }

                else -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FotoDeFicha("Ahora", estado.urlActual, elemento.fotoActualFecha,
                        Modifier.weight(1f), destacada = true)
                    if (estado.urlAnterior != null) {
                        FotoDeFicha("Antes", estado.urlAnterior, elemento.fotoAnteriorFecha,
                            Modifier.weight(1f))
                    } else {
                        Surface(shape = RoundedCornerShape(10.dp), color = Color(0xFFF5F7FA),
                            modifier = Modifier.weight(1f).aspectRatio(1f)) {
                            Box(Modifier.padding(10.dp), Alignment.Center) {
                                Text("Todavía no hay una visita anterior con la que comparar",
                                    fontSize = 10.5.sp, color = TintaSuave)
                            }
                        }
                    }
                }
            }
        }

        // El historial
        if (estado.historial.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("ÚLTIMAS INTERVENCIONES", fontSize = 10.5.sp, letterSpacing = 1.sp,
                    fontWeight = FontWeight.SemiBold, color = TintaSuave)
                estado.historial.forEach { h ->
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(Modifier.padding(top = 5.dp).size(5.dp).clip(CircleShape)
                            .background(Marca.Azul.copy(alpha = 0.6f)))
                        Text("${h.fecha} · ${h.action ?: "intervención"}", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun DatoFicha(etiqueta: String, valor: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(9.dp), color = Color(0xFFF5F7FA), modifier = modifier) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
            Text(etiqueta.uppercase(), fontSize = 9.5.sp, letterSpacing = 0.8.sp, color = TintaSuave)
            Text(valor, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 2)
        }
    }
}

@Composable
private fun FotoDeFicha(
    titulo: String,
    url: String?,
    fecha: String?,
    modifier: Modifier = Modifier,
    destacada: Boolean = false,
) {
    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFE9EDF3)),
        ) {
            AsyncImage(
                model = url,
                contentDescription = titulo,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Surface(
                Modifier.padding(5.dp),
                shape = RoundedCornerShape(5.dp),
                color = if (destacada) Marca.Azul.copy(alpha = 0.9f) else Color.Black.copy(alpha = 0.6f),
            ) {
                Text(titulo, Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                    fontSize = 9.5.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
        Text(fecha?.take(10) ?: "Sin fecha", fontSize = 10.5.sp, color = TintaSuave,
            modifier = Modifier.padding(top = 3.dp))
    }
}
