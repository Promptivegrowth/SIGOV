package pe.servicon.sigov.ui.inventario

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Schedule
import java.io.File
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
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.ListAlt
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
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
import pe.servicon.sigov.datos.CampoDelTipo
import pe.servicon.sigov.datos.ElementoVial
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

private val COLOR_SEMAFORO = mapOf(
    Semaforo.AL_DIA to Color(0xFF16A34A),
    Semaforo.POR_VENCER to Color(0xFFF59E0B),
    Semaforo.CRITICO to Color(0xFFDC2626),
    Semaforo.SIN_INTERVENIR to Color(0xFF64748B),
)

/** El rojo de lo observado en campo. */
private val ROJO_OBSERVADO = Color(0xFFB91C1C)

private const val FUENTE = "src-inventario"
private const val CAPA = "capa-inventario"

/** «#7C3AED» → Color; si no se entiende, gris. */
internal fun colorDe(hex: String?): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex ?: "")) }.getOrDefault(Color(0xFF64748B))

/**
 * El inventario del tramo (boceto de Elvis del 14/10).
 *
 * Arriba el tramo (Tramo 1 a 4) y los componentes, que se pueden elegir
 * varios; luego la leyenda del estado. En el mapa cada componente lleva su
 * color, y el borde dice cómo está: verde intervenido, ámbar por vencer, rojo
 * crítico. Debajo, los elementos del tramo para abrir su ficha.
 *
 * La cartografía de fondo necesita señal. Cuando no la hay, el mapa queda
 * gris pero los puntos, los filtros y las fichas siguen funcionando con lo
 * que se bajó la última vez.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaInventario(
    vm: InventarioViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alVerPciEnMapa: () -> Unit = {},
    alVerObservaciones: () -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }

    LaunchedEffect(estado.error, estado.aviso) {
        if (estado.abierto != null) return@LaunchedEffect
        (estado.error ?: estado.aviso)?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    ArmazonDeApartado(
        titulo = "Inventario vial",
        seccion = "Lo que hay en tu tramo",
        alVolver = alVolver,
        avisos = avisos,
        acciones = {
            // Lo que no está en el inventario, en su propio apartado (Elvis, 14/10)
            TextButton(onClick = alVerObservaciones) { Text("Observaciones", fontSize = 12.5.sp) }
            IconButton(onClick = vm::refrescar) {
                Icon(Icons.Outlined.Refresh, "Actualizar", tint = Marca.Azul)
            }
        },
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {
            if (estado.cargando && estado.todos.isEmpty()) {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(color = Marca.Verde, strokeWidth = 3.dp)
                    Spacer(Modifier.height(14.dp))
                    Text("Bajando el inventario…", style = MaterialTheme.typography.bodySmall, color = TintaSuave)
                }
                return@Column
            }

            // ── Tramo ─────────────────────────────────────────────────
            Rotulo("TRAMO", Modifier.padding(start = 14.dp, top = 8.dp))
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                item {
                    FilterChip(
                        selected = estado.tramoId == null,
                        onClick = { vm.elegirTramo(null) },
                        label = { Text("Todo el contrato", fontSize = 12.5.sp) },
                        colors = chipAzul(),
                    )
                }
                items(estado.tramos, key = { it.id }) { t ->
                    FilterChip(
                        selected = estado.tramoId == t.id,
                        onClick = { vm.elegirTramo(t.id) },
                        label = { Text(t.etiqueta, fontSize = 12.5.sp) },
                        colors = chipAzul(),
                    )
                }
            }

            // ── Componentes: varios a la vez, cada uno con su color ───
            Row(Modifier.padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Rotulo("COMPONENTES", Modifier.weight(1f))
                if (estado.tipos.isNotEmpty()) {
                    TextButton(onClick = vm::limpiarTipos) { Text("Limpiar", fontSize = 12.sp) }
                } else {
                    Text("Puedes elegir varios", fontSize = 11.sp, color = TintaSuave, modifier = Modifier.padding(end = 10.dp, top = 6.dp, bottom = 6.dp))
                }
            }
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                items(estado.resumen, key = { it.codigo }) { t ->
                    val color = colorDe(estado.colores[t.codigo])
                    val activo = t.codigo in estado.tipos
                    FilterChip(
                        selected = activo,
                        onClick = { vm.alternarTipo(t.codigo) },
                        leadingIcon = { Box(Modifier.size(10.dp).clip(CircleShape).background(color)) },
                        label = { Text("${t.nombre} · ${t.total}", fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = color.copy(alpha = 0.16f),
                            selectedLabelColor = MaterialTheme.colorScheme.onSurface,
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true, selected = activo,
                            selectedBorderColor = color, selectedBorderWidth = 1.5.dp,
                        ),
                    )
                }
            }

            // ── La leyenda del estado, que también filtra ─────────────
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Semaforo.entries.forEach { s ->
                    Leyenda(s.etiqueta, estado.porSemaforo[s] ?: 0, COLOR_SEMAFORO[s] ?: Color.Gray, s in estado.semaforos) {
                        vm.alternarSemaforo(s)
                    }
                }
                Leyenda("Observados", estado.observados, ROJO_OBSERVADO, estado.soloObservados, cuadrado = true) {
                    vm.alternarObservados()
                }
            }

            // ── El mapa ───────────────────────────────────────────────
            Box(Modifier.fillMaxWidth().weight(1f)) {
                MapaDelInventario(
                    elementos = estado.visibles,
                    alTocar = vm::abrir,
                    modifier = Modifier.fillMaxSize(),
                )
                Button(
                    onClick = alVerPciEnMapa,
                    colors = ButtonDefaults.buttonColors(containerColor = Marca.Azul),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp).height(40.dp),
                ) {
                    Text("Ver PCI en mapa", fontSize = 12.5.sp)
                    Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp))
                }
            }

            // ── Los elementos del tramo ───────────────────────────────
            ListaDeElementos(estado, vm, Modifier.fillMaxWidth().weight(0.85f))
        }
    }

    // ── La ficha del elemento ─────────────────────────────────────────
    estado.abierto?.let { elemento ->
        ModalBottomSheet(onDismissRequest = vm::cerrarFicha, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            FichaDelElemento(elemento, estado, vm)
        }
    }
}

@Composable
private fun chipAzul() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = Marca.Azul,
    selectedLabelColor = Color.White,
)

@Composable
private fun Rotulo(texto: String, modifier: Modifier = Modifier) {
    Text(texto, fontSize = 10.5.sp, letterSpacing = 1.sp, fontWeight = FontWeight.SemiBold, color = TintaSuave, modifier = modifier)
}

@Composable
private fun Leyenda(etiqueta: String, cuantos: Int, color: Color, activo: Boolean, cuadrado: Boolean = false, alTocar: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (activo) color.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
            .clickable(onClick = alTocar)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(Modifier.size(9.dp).clip(if (cuadrado) RoundedCornerShape(2.dp) else CircleShape).background(color))
        Text(etiqueta, fontSize = 11.5.sp, fontWeight = if (activo) FontWeight.Bold else FontWeight.Medium)
        Text("$cuantos", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = color)
    }
}

/** «Elementos en el tramo»: la lista que acompaña al mapa (boceto). */
@Composable
private fun ListaDeElementos(estado: EstadoInventario, vm: InventarioViewModel, modifier: Modifier) {
    // Lo que pide atención primero: lo observado, lo crítico y lo que vence
    val lista = remember(estado.visibles) {
        estado.visibles.sortedWith(
            compareByDescending<ElementoVial> { it.observado }
                .thenBy { Semaforo.de(it.semaforo).let { s -> listOf(Semaforo.CRITICO, Semaforo.POR_VENCER, Semaforo.SIN_INTERVENIR, Semaforo.AL_DIA).indexOf(s) } }
                .thenBy { it.progresivaM ?: 0.0 },
        )
    }
    Column(modifier) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Elementos en ${estado.etiquetaDelTramo?.lowercase() ?: "el contrato"}",
                style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(6.dp))
            Text("${lista.size}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Marca.Azul,
                modifier = Modifier.weight(1f))
            if (estado.tipos.isNotEmpty()) {
                Text("Filtrados: ${estado.tipos.size} ${if (estado.tipos.size == 1) "componente" else "componentes"}",
                    fontSize = 11.sp, color = TintaSuave)
            }
        }
        HorizontalDivider()
        LazyColumn(Modifier.fillMaxSize()) {
            items(lista, key = { it.id }) { e -> FilaDeElemento(e, vm) { vm.abrir(e) } }
        }
    }
}

@Composable
private fun FilaDeElemento(e: ElementoVial, vm: InventarioViewModel, alAbrir: () -> Unit) {
    val semaforo = Semaforo.de(e.semaforo)
    // La miniatura se firma solo cuando la fila aparece en pantalla
    val url by produceState<String?>(null, e.fotoActual) { value = vm.urlMiniatura(e.fotoActual) }
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = alAbrir)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(colorDe(e.color).copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            if (url != null) {
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.size(14.dp).clip(CircleShape).background(colorDe(e.color)))
            }
        }
        Column(Modifier.weight(1f)) {
            Text(e.name ?: e.tipo ?: "Elemento", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(
                listOfNotNull(e.tipo, e.tramoCorto, e.progresiva?.let { "km $it" }).joinToString(" · "),
                fontSize = 11.5.sp, color = TintaSuave, maxLines = 1,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                val (texto, color) = if (e.observado) "Observado" to ROJO_OBSERVADO else semaforo.etiqueta to (COLOR_SEMAFORO[semaforo] ?: Color.Gray)
                Text(texto, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = color,
                    modifier = Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(5.dp)).padding(horizontal = 6.dp, vertical = 1.dp))
                e.diasSinIntervenir?.let { Text("Hace $it días", fontSize = 11.sp, color = TintaSuave) }
            }
        }
        Text("Abrir", fontSize = 12.5.sp, color = Marca.Azul, fontWeight = FontWeight.SemiBold)
        Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = Marca.Azul)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

// ═══ El mapa ══════════════════════════════════════════════════════════

/**
 * El lienzo de MapLibre dentro de Compose.
 *
 * Una sola capa de círculos: el relleno es el color del componente (Elvis:
 * «que tenga distintos colores al momento de filtrar») y el borde, el estado.
 * Miles de puntos en una capa vectorial se mueven sin tirones.
 */
@Composable
internal fun MapaDelInventario(
    elementos: List<ElementoVial>,
    alTocar: (ElementoVial) -> Unit,
    modifier: Modifier = Modifier,
) {
    val contexto = LocalContext.current
    // El oyente de toques se registra una sola vez, con el mapa: tiene que
    // leer siempre la lista vigente.
    val porId by rememberUpdatedState(remember(elementos) { elementos.associateBy { it.id } })
    val tocar by rememberUpdatedState(alTocar)
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
                            PropertyFactory.circleColor(Expression.toColor(Expression.get("color"))),
                            PropertyFactory.circleRadius(
                                Expression.interpolate(
                                    Expression.linear(), Expression.zoom(),
                                    Expression.stop(6, 2.5f),
                                    Expression.stop(9, 4f),
                                    Expression.stop(12, 7f),
                                    Expression.stop(16, 12f),
                                )
                            ),
                            PropertyFactory.circleStrokeWidth(
                                Expression.interpolate(
                                    Expression.linear(), Expression.zoom(),
                                    Expression.stop(6, 0.6f),
                                    Expression.stop(10, 1.2f),
                                    Expression.stop(13, 2.4f),
                                    Expression.stop(16, 3.2f),
                                )
                            ),
                            PropertyFactory.circleStrokeColor(Expression.toColor(Expression.get("borde"))),
                            PropertyFactory.circleOpacity(0.95f),
                        )
                    )
                    estiloListo = true
                }

                m.addOnMapClickListener { punto ->
                    val pantalla = m.projection.toScreenLocation(punto)
                    // Un dedo no acierta un círculo de siete píxeles
                    val radio = 26f
                    val caja = android.graphics.RectF(
                        pantalla.x - radio, pantalla.y - radio,
                        pantalla.x + radio, pantalla.y + radio,
                    )
                    val encontrados = m.queryRenderedFeatures(caja, CAPA)
                    encontrados.firstOrNull()?.getStringProperty("id")?.let { id ->
                        porId[id]?.let(tocar)
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
            val borde = if (e.observado) ROJO_OBSERVADO else COLOR_SEMAFORO[Semaforo.de(e.semaforo)] ?: Color.Gray
            Feature.fromGeometry(Point.fromLngLat(lng, lat)).apply {
                addStringProperty("id", e.id)
                addStringProperty("color", e.color ?: "#64748B")
                addStringProperty("borde", hex(borde))
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
                    m.animateCamera(CameraUpdateFactory.newLatLngBounds(limites, 50), 700)
                }
            }
        }
    }
}

internal fun hex(c: Color): String = String.format("#%06X", 0xFFFFFF and c.toArgb())

/** La misma cartografía abierta que usa el panel web: sin clave ni licencia. */
internal const val ESTILO_CALLES = """
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

// ═══ La ficha ═════════════════════════════════════════════════════════

/**
 * El detalle del elemento (boceto «Registro de foto de intervención»): la
 * foto base del inventario siempre queda; al lado, las tres últimas fotos de
 * intervención con su fecha y hora, y el recuadro para registrar otra. Las
 * más viejas dejan de verse aquí pero siguen en la base (Elvis).
 */
@Composable
private fun FichaDelElemento(
    elemento: ElementoVial,
    estado: EstadoInventario,
    vm: InventarioViewModel,
) {
    // La foto ampliada, cuando se toca una
    var ampliada by remember { mutableStateOf<String?>(null) }
    var registrando by remember { mutableStateOf(false) }
    val alcance = rememberCoroutineScope()
    val ampliar: (String?) -> Unit = { ruta -> alcance.launch { ampliada = vm.urlGrande(ruta) } }

    val semaforo = Semaforo.de(elemento.semaforo)
    val color = if (elemento.observado) ROJO_OBSERVADO else COLOR_SEMAFORO[semaforo] ?: Color.Gray

    val base = estado.galeria.lastOrNull { it.first.esBase }
    val intervenciones = estado.galeria.filter { !it.first.esBase }

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
            Text("${elemento.code ?: ""} · ${elemento.tipo ?: ""}", fontSize = 12.sp, color = TintaSuave)
        }

        // El estado: lo que trajo al supervisor hasta aquí
        Surface(shape = RoundedCornerShape(10.dp), color = color.copy(alpha = 0.10f), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(if (elemento.observado) "Observado" else semaforo.etiqueta, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color)
                elemento.observacion?.takeIf { elemento.observado }?.let {
                    Text(it, fontSize = 12.5.sp, color = color)
                }
                Text(
                    elemento.ultimaIntervencion?.let {
                        "Última intervención el ${fechaDma(it)} · hace ${elemento.diasSinIntervenir ?: 0} días"
                    } ?: "Nunca se registró una intervención",
                    fontSize = 12.sp, color = TintaSuave,
                )
            }
        }

        // Dónde está
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DatoFicha(
                "Progresiva",
                elemento.progresivaFinM
                    ?.takeIf { it != elemento.progresivaM }
                    ?.let { "${elemento.progresiva ?: "—"} → ${progresivaTxt(it)}" }
                    ?: (elemento.progresiva ?: "—"),
                Modifier.weight(1f),
            )
            DatoFicha("Lado", pe.servicon.sigov.datos.Lados.etiqueta(elemento.side) ?: "—", Modifier.weight(1f))
        }
        DatoFicha("Tramo", listOfNotNull(elemento.tramoCorto, elemento.tramo).joinToString(" · ").ifBlank { "—" }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DatoFicha("Conservación", elemento.condition ?: "—", Modifier.weight(1f))
            DatoFicha("Visitas", "${elemento.visitas}", Modifier.weight(1f))
        }

        // Lo que el inventario oficial registra de este tipo de elemento
        val campos = estado.campos[elemento.tipoCodigo].orEmpty()
            .mapNotNull { c -> valorDelCampo(c, elemento)?.let { c.label to it } }
        if (campos.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.ListAlt, null, Modifier.size(14.dp), tint = TintaSuave)
                    Spacer(Modifier.width(5.dp))
                    Rotulo("DATOS DEL INVENTARIO")
                }
                Surface(shape = RoundedCornerShape(10.dp), color = Color(0xFFF5F7FA), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        campos.forEachIndexed { i, (etiqueta, valor) ->
                            if (i > 0) HorizontalDivider(color = Color(0xFFE3E8EF))
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(etiqueta, fontSize = 12.sp, color = TintaSuave, modifier = Modifier.weight(1f))
                                Text(valor, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }

        // Cuando la coordenada del Excel no era de fiar
        if (texto(elemento, "ubicacion") == "progresiva") {
            Surface(shape = RoundedCornerShape(10.dp), color = Color(0xFFF5F7FA), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(10.dp)) {
                    Icon(Icons.Outlined.Info, null, Modifier.size(15.dp), tint = TintaSuave)
                    Spacer(Modifier.width(7.dp))
                    Text(
                        "Ubicado por su progresiva sobre la vía oficial." +
                            (texto(elemento, "motivo_ubicacion")?.let { " La coordenada del inventario quedaba $it." } ?: ""),
                        fontSize = 11.5.sp, color = TintaSuave,
                    )
                }
            }
        }

        // ── Fotografías: la base, las tres últimas y «Registrar nueva foto» ─
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(14.dp), tint = TintaSuave)
                Spacer(Modifier.width(5.dp))
                Rotulo("FOTOGRAFÍAS")
            }
            Surface(shape = RoundedCornerShape(10.dp), color = Marca.Azul.copy(alpha = 0.06f), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Info, null, Modifier.size(16.dp), tint = Marca.Azul)
                    Spacer(Modifier.width(7.dp))
                    Text("Cada intervención agrega una nueva foto con fecha y hora; no reemplaza la foto base.",
                        fontSize = 11.5.sp, color = Marca.Azul)
                }
            }
            if (estado.cargandoFicha) {
                Box(Modifier.fillMaxWidth().height(60.dp), Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = Marca.Verde)
                }
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    base?.let { (foto, url) ->
                        item { FotoDeFicha("Foto base", url, pieDeFoto(foto.ruta, foto.tomada), Modifier.width(118.dp), alTocar = { ampliar(foto.ruta) }) }
                    }
                    items(intervenciones.take(3), key = { it.first.id }) { (foto, url) ->
                        FotoDeFicha(
                            if (foto.estado == "observado") "Observado" else "Intervención",
                            url, fechaYHora(foto.tomada), Modifier.width(118.dp), destacada = true,
                            colorTitulo = if (foto.estado == "observado") ROJO_OBSERVADO else Marca.Azul,
                            alTocar = { ampliar(foto.ruta) },
                        )
                    }
                    item {
                        Surface(
                            onClick = { registrando = true },
                            shape = RoundedCornerShape(10.dp),
                            color = Marca.VerdeBandera.copy(alpha = 0.06f),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, Marca.VerdeBandera.copy(alpha = 0.6f)),
                            modifier = Modifier.width(118.dp).aspectRatio(1f),
                        ) {
                            Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(Modifier.size(30.dp).clip(CircleShape).background(Marca.VerdeBandera), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Outlined.Add, null, tint = Color.White)
                                }
                                Spacer(Modifier.height(6.dp))
                                Text("Registrar nueva foto", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold,
                                    color = Marca.VerdeBandera, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }

        // ── Historial de intervenciones (las fotos, de la más nueva a la base) ─
        if (estado.galeria.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Rotulo("HISTORIAL DE INTERVENCIONES")
                (intervenciones + listOfNotNull(base)).forEach { (foto, url) ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
                        modifier = Modifier.fillMaxWidth().clickable { ampliar(foto.ruta) }) {
                        val c = when {
                            foto.esBase -> Color(0xFF64748B)
                            foto.estado == "observado" -> ROJO_OBSERVADO
                            else -> Marca.Azul
                        }
                        Box(Modifier.size(8.dp).clip(CircleShape).background(c))
                        Text(
                            when { foto.esBase -> "Foto base"; foto.estado == "observado" -> "Observado"; else -> "Intervención" },
                            fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(88.dp),
                        )
                        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.size(width = 46.dp, height = 34.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xFFE9EDF3)))
                        Column(Modifier.weight(1f)) {
                            Text(if (foto.esBase) pieDeFoto(foto.ruta, foto.tomada) else fechaYHora(foto.tomada), fontSize = 12.sp)
                            foto.caption?.takeIf { it.isNotBlank() && !foto.esBase }?.let {
                                Text(it, fontSize = 11.sp, color = TintaSuave, maxLines = 2)
                            }
                        }
                    }
                }
            }
        }

        if (estado.galeria.isEmpty() && !estado.cargandoFicha) {
            Text("Todavía no hay fotografías de este elemento. Registra la primera.", fontSize = 12.sp, color = TintaSuave)
        }

        // El aviso, dentro de la ficha: abajo quedaría tapado
        (estado.error ?: estado.aviso)?.let { t ->
            val c = if (estado.error != null) ROJO_OBSERVADO else Marca.VerdeBandera
            Text(t, fontSize = 12.5.sp, color = c,
                modifier = Modifier.fillMaxWidth().background(c.copy(alpha = 0.10f), RoundedCornerShape(10.dp)).padding(12.dp))
        }
    }

    if (registrando) {
        DialogoNuevaFoto(
            vm = vm,
            guardando = estado.guardandoFoto,
            alCerrar = { registrando = false },
            alGuardar = { toma, est, comentario ->
                vm.registrarFoto(toma, est, comentario)
                registrando = false
            },
        )
    }

    ampliada?.let { url ->
        pe.servicon.sigov.ui.componentes.VisorConZoom(modelo = url, descripcion = null, alCerrar = { ampliada = null })
    }
}

/**
 * «Registrar nueva foto»: tomar la foto, un comentario opcional y el
 * semáforo de dos colores (Elvis): verde si está bien, rojo si se observa
 * algo («el panel de la señal vertical está doblado»). La fecha y la hora
 * las pone el equipo.
 */
@Composable
private fun DialogoNuevaFoto(
    vm: InventarioViewModel,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alGuardar: (File, String, String?) -> Unit,
) {
    val contexto = LocalContext.current
    var destino by remember { mutableStateOf<File?>(null) }
    var toma by remember { mutableStateOf<File?>(null) }
    var comentario by remember { mutableStateOf("") }
    var estado by remember { mutableStateOf("ok") }
    var error by remember { mutableStateOf<String?>(null) }
    val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { bien ->
        toma = destino?.takeIf { bien && it.exists() && it.length() > 0 }
        if (toma != null) error = null
    }
    fun tomar() {
        val archivo = vm.archivoTemporal()
        destino = archivo
        camara.launch(FileProvider.getUriForFile(contexto, "${contexto.packageName}.fileprovider", archivo))
    }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Registrar nueva foto") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = ::tomar, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (toma == null) "Tomar foto" else "Volver a tomar", modifier = Modifier.weight(1f))
                    Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp))
                }
                toma?.let {
                    AsyncImage(model = it, contentDescription = "La foto tomada", contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(10.dp)))
                }
                Text("¿Cómo está?", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("ok" to "OK", "observado" to "Observado").forEach { (clave, texto) ->
                        val c = if (clave == "ok") Marca.VerdeBandera else ROJO_OBSERVADO
                        FilterChip(
                            selected = estado == clave,
                            onClick = { estado = clave },
                            leadingIcon = { Box(Modifier.size(10.dp).clip(CircleShape).background(c)) },
                            label = { Text(texto) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = c.copy(alpha = 0.16f), selectedLabelColor = c),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                OutlinedTextField(
                    value = comentario,
                    onValueChange = { comentario = it.take(200) },
                    label = { Text(if (estado == "observado") "Observación (obligatoria)" else "Agregar comentario (opcional)") },
                    placeholder = { Text("Estado actual, observaciones…") },
                    supportingText = { Text("${comentario.length}/200") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.fillMaxWidth().background(Marca.VerdeBandera.copy(alpha = 0.08f), RoundedCornerShape(10.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp), tint = Marca.VerdeBandera)
                    Spacer(Modifier.width(8.dp))
                    Text("Fecha y hora automáticas: se registra con la fecha y hora actual del equipo.",
                        fontSize = 11.5.sp, color = Marca.VerdeBandera)
                }
                error?.let { Text(it, color = ROJO_OBSERVADO, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !guardando,
                onClick = {
                    error = when {
                        toma == null -> "Toma la foto primero."
                        estado == "observado" && comentario.isBlank() -> "Escribe qué se observa: el supervisor lo ve en el mapa."
                        else -> null
                    }
                    if (error == null) alGuardar(toma!!, estado, comentario)
                },
            ) { Text("Guardar evidencia") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

private fun fechaDma(iso: String): String =
    iso.take(10).split("-").let { if (it.size == 3) "${it[2]}/${it[1]}/${it[0]}" else iso }

/** «14/10/2026 · 07:55», en la hora de Perú. */
private fun fechaYHora(iso: String?): String {
    if (iso.isNullOrBlank()) return "Sin fecha"
    return runCatching {
        val z = java.time.OffsetDateTime.parse(iso).atZoneSameInstant(pe.servicon.sigov.datos.Peru.zona)
        z.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy · HH:mm"))
    }.getOrDefault(fechaDma(iso))
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
    pie: String,
    modifier: Modifier = Modifier,
    destacada: Boolean = false,
    colorTitulo: Color = Marca.Azul,
    alTocar: () -> Unit = {},
) {
    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFE9EDF3))
                .clickable(onClick = alTocar),
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
                color = if (destacada) colorTitulo.copy(alpha = 0.9f) else Color.Black.copy(alpha = 0.6f),
            ) {
                Text(titulo, Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                    fontSize = 9.5.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
        Text(pie, fontSize = 10.5.sp, color = TintaSuave, modifier = Modifier.padding(top = 3.dp))
    }
}

/**
 * Lo que va bajo una foto.
 *
 * Las del Inventario Vial 2024 casi nunca traen la fecha en que se tomaron;
 * al guardarlas se les puso la de emisión del tomo para no dejar el dato
 * vacío. Enseñarla bajo la foto sería afirmar algo que no se sabe: se dice
 * de qué inventario es.
 */
private fun pieDeFoto(ruta: String?, fecha: String?): String {
    val inv = ruta?.let { Regex("/inventario-(\\d{4})/").find(it) }
    if (inv != null) return "Inventario ${inv.groupValues[1]}"
    return fecha?.take(10)?.let { f ->
        val p = f.split("-")
        if (p.size == 3) "${p[2]}/${p[1]}/${p[0]}" else f
    } ?: "Sin fecha"
}

private fun progresivaTxt(m: Double): String {
    val km = (m / 1000).toInt()
    val r = Math.round(m - km * 1000).toInt()
    return "$km+${r.toString().padStart(3, '0')}"
}

private fun texto(e: ElementoVial, clave: String): String? =
    (e.atributos?.get(clave) as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

/** El valor de un campo del inventario, legible, o null si el elemento no lo tiene. */
private fun valorDelCampo(c: CampoDelTipo, e: ElementoVial): String? {
    val p = e.atributos?.get(c.key) as? JsonPrimitive ?: return null
    val t = p.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
    return when {
        c.key == "uso" -> if (t == "en_uso") "En uso" else if (t == "en_desuso") "En desuso" else t
        c.type == "date" -> t.take(10).split("-").let { if (it.size == 3) "${it[2]}/${it[1]}/${it[0]}" else t }
        c.type == "number" -> p.doubleOrNull?.let { d ->
            if (d % 1.0 == 0.0) d.toLong().toString() else String.format(java.util.Locale.US, "%.2f", d)
        } ?: t
        c.type == "bool" -> if (t == "true") "Sí" else "No"
        else -> t
    }
}
