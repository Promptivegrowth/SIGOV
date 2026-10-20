package pe.servicon.sigov.ui.inventario

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.Configuracion
import pe.servicon.sigov.datos.EvidenciaRepositorio
import pe.servicon.sigov.datos.InventarioRepositorio
import pe.servicon.sigov.datos.ObservacionDeCampo
import pe.servicon.sigov.datos.ObservacionesRepositorio
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.componentes.VisorConZoom
import pe.servicon.sigov.ui.theme.Marca
import java.io.File
import javax.inject.Inject

private val COLOR_ESTADO = mapOf(
    "pendiente" to Color(0xFFDC2626),
    "programada" to Color(0xFFF59E0B),
    "atendida" to Color(0xFF16A34A),
)

data class EstadoObservaciones(
    val cargando: Boolean = true,
    val lista: List<ObservacionDeCampo> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    val tramoPorDefecto: Tramo? = null,
    /** null = todas. */
    val estado: String? = "pendiente",
    val guardando: Boolean = false,
    val formulario: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val visibles: List<ObservacionDeCampo> get() = lista.filter { estado == null || it.estado == estado }
    fun cuantas(e: String?) = lista.count { e == null || it.estado == e }
}

/**
 * Registro de observaciones de campo (video de Elvis del 14/10): el mapa con
 * lo observado y la lista, y «Registrar observación» con progresiva, lado,
 * descripción y de una a tres fotos. El supervisor la programa y la da por
 * atendida desde la web, donde también se exporta a PDF.
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
) : ViewModel() {
    private val _estado = MutableStateFlow(EstadoObservaciones())
    val estado: StateFlow<EstadoObservaciones> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching {
                val c = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val tramos = campo.tramos(c.servicioId)
                val lista = repo.lista(c.servicioId)
                _estado.update {
                    it.copy(cargando = false, lista = lista, tramos = tramos, tramoPorDefecto = tramos.firstOrNull { t -> t.id == c.tramoId })
                }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun filtrar(e: String?) = _estado.update { it.copy(estado = e) }
    fun abrirFormulario(si: Boolean) = _estado.update { it.copy(formulario = si, error = null) }
    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
    fun archivoTemporal(): File = evidencias.archivoTemporal()
    suspend fun url(ruta: String): String? = inventario.urlDeFoto(ruta)

    fun registrar(tramo: Tramo?, progresiva: Double?, lado: String, descripcion: String, fotos: List<File>) {
        _estado.update { it.copy(guardando = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val c = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val ajustes = campo.ajustes(c.servicioId)
                val punto = runCatching { ubicacion.actual() }.getOrNull()
                repo.registrar(c.servicioId, c.id, c.name, tramo, progresiva, lado, descripcion, fotos,
                    configuracion.selloEfectivo(ajustes.sello), punto)
            }.onSuccess {
                _estado.update { it.copy(guardando = false, formulario = false, aviso = "Observación registrada. Se enviará al haber señal.") }
                cargar()
            }.onFailure { f -> _estado.update { it.copy(guardando = false, error = f.enCristiano()) } }
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
    LaunchedEffect(estado.aviso, estado.error, estado.formulario) {
        if (estado.formulario) return@LaunchedEffect
        (estado.error ?: estado.aviso)?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    ArmazonDeApartado(
        titulo = "Observaciones de campo",
        seccion = "Lo que no está en el inventario",
        alVolver = alVolver,
        ayuda = "Desmonte, basura, una señal caída… con su progresiva y fotos, para programarlo.",
        avisos = avisos,
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
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("pendiente" to "Pendientes", "programada" to "Programadas", "atendida" to "Atendidas", null to "Todas").forEach { (k, t) ->
                    FilterChip(
                        selected = estado.estado == k,
                        onClick = { vm.filtrar(k) },
                        leadingIcon = k?.let { c -> { Box(Modifier.size(9.dp).clip(CircleShape).background(COLOR_ESTADO[c] ?: Color.Gray)) } },
                        label = { Text("$t · ${estado.cuantas(k)}") },
                    )
                }
            }
            if (estado.cargando) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                return@Column
            }
            MapaDeObservaciones(estado.visibles, Modifier.fillMaxWidth().weight(0.9f)) { abierta = it }
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().weight(1f), contentPadding = PaddingValues(bottom = 90.dp)) {
                if (estado.visibles.isEmpty()) {
                    item { Text("No hay observaciones en este filtro.", modifier = Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                items(estado.visibles, key = { it.id }) { o -> FilaObservacion(o) { abierta = o } }
            }
        }
    }

    if (estado.formulario) {
        FormularioObservacion(estado, vm)
    }
    abierta?.let { o -> DetalleObservacion(o, vm) { abierta = null } }
}

@Composable
private fun FilaObservacion(o: ObservacionDeCampo, alAbrir: () -> Unit) {
    val color = COLOR_ESTADO[o.estado] ?: Color.Gray
    Row(
        Modifier.fillMaxWidth().clickable(onClick = alAbrir).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(12.dp).clip(CircleShape).background(color))
        Column(Modifier.weight(1f)) {
            Text(o.descripcion, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(o.tramoCorto, o.progresiva?.let { "km " + Progresiva.aTexto(it) },
                    pe.servicon.sigov.datos.Lados.codigo(o.side)?.let { "lado $it" }, o.fecha?.let { f -> f.take(10).split("-").reversed().joinToString("/") })
                    .joinToString(" · "),
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(if (o.porEnviar) "Por enviar" else o.estadoLegible, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            color = if (o.porEnviar) Marca.Naranja else color,
            modifier = Modifier.background((if (o.porEnviar) Marca.Naranja else color).copy(alpha = 0.12f), RoundedCornerShape(6.dp))
                .padding(horizontal = 7.dp, vertical = 2.dp))
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun DetalleObservacion(o: ObservacionDeCampo, vm: ObservacionesViewModel, alCerrar: () -> Unit) {
    var ampliada by remember { mutableStateOf<String?>(null) }
    val urls = remember { mutableStateMapOf<String, String?>() }
    LaunchedEffect(o.id) { o.fotos.forEach { r -> urls[r] = vm.url(r) } }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(o.estadoLegible, color = COLOR_ESTADO[o.estado] ?: Color.Gray) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(o.descripcion, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(listOfNotNull(o.tramoCorto, o.tramo, o.progresiva?.let { "km " + Progresiva.aTexto(it) },
                    pe.servicon.sigov.datos.Lados.etiqueta(o.side)).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                Text(listOfNotNull(o.autor, o.cuadrilla).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                o.notaAtencion?.let { Text("Atención: $it", style = MaterialTheme.typography.bodySmall) }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    o.fotos.forEach { r ->
                        AsyncImage(model = urls[r], contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.size(80.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFE9EDF3)).clickable { ampliada = urls[r] })
                    }
                }
                if (o.porEnviar) Text("Guardada en el celular: sube al haber señal.", color = Marca.Naranja, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = alCerrar) { Text("Cerrar") } },
    )
    ampliada?.let { VisorConZoom(modelo = it, descripcion = null, alCerrar = { ampliada = null }) }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FormularioObservacion(estado: EstadoObservaciones, vm: ObservacionesViewModel) {
    val contexto = LocalContext.current
    var tramo by remember { mutableStateOf(estado.tramoPorDefecto) }
    var prog by remember { mutableStateOf("") }
    var lado by remember { mutableStateOf("derecho") }
    var descripcion by remember { mutableStateOf("") }
    val fotos = remember { mutableStateListOf<File>() }
    var destino by remember { mutableStateOf<File?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var eligiendoTramo by remember { mutableStateOf(false) }
    val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { bien ->
        destino?.takeIf { bien && it.exists() && it.length() > 0 }?.let { fotos += it }
    }

    Dialog(onDismissRequest = { vm.abrirFormulario(false) }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.92f), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.fillMaxSize()) {
                Text("Registrar observación", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp))
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedCard(onClick = { eligiendoTramo = true }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text("Tramo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(tramo?.let { "${it.code} · ${it.name}" } ?: "Elige el tramo", style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                    OutlinedTextField(
                        prog, { prog = it },
                        label = { Text("Progresiva") }, placeholder = { Text("1072.000") },
                        supportingText = { Text("El punto se ubica solo en el mapa. Se escribe 1072.000 o 1072+000.") },
                        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("Lado de la vía", style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pe.servicon.sigov.datos.Lados.todos.forEach { l ->
                            FilterChip(selected = lado == l.valor, onClick = { lado = l.valor }, label = { Text(l.etiqueta) })
                        }
                    }
                    OutlinedTextField(
                        descripcion, { descripcion = it.take(500) },
                        label = { Text("Observación") }, placeholder = { Text("Desmonte en la berma, basura acumulada, señal caída…") },
                        minLines = 3, modifier = Modifier.fillMaxWidth(),
                    )
                    Text("Fotos (de 1 a 3)", style = MaterialTheme.typography.labelLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        fotos.forEach { f ->
                            Box {
                                AsyncImage(model = f, contentDescription = null, contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(90.dp).clip(RoundedCornerShape(10.dp)))
                                IconButton(onClick = { fotos.remove(f) }, modifier = Modifier.align(Alignment.TopEnd).size(28.dp)
                                    .background(Color.Black.copy(alpha = 0.5f), CircleShape)) {
                                    Icon(Icons.Outlined.Close, "Quitar", tint = Color.White, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        if (fotos.size < 3) {
                            OutlinedButton(
                                onClick = {
                                    val a = vm.archivoTemporal(); destino = a
                                    camara.launch(FileProvider.getUriForFile(contexto, "${contexto.packageName}.fileprovider", a))
                                },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.size(90.dp),
                                contentPadding = PaddingValues(4.dp),
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(Icons.Outlined.PhotoCamera, null)
                                    Text("Tomar", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                    (error ?: estado.error)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { vm.abrirFormulario(false) }, modifier = Modifier.weight(1f).height(50.dp)) { Text("Cancelar") }
                    Button(
                        onClick = {
                            val m = prog.takeIf { it.isNotBlank() }?.let { Progresiva.aMetros(it) }
                            error = when {
                                descripcion.isBlank() -> "Escribe qué se observa."
                                fotos.isEmpty() -> "Toma al menos una foto."
                                prog.isNotBlank() && m == null -> "La progresiva no se entiende. Escríbela como 1072.000."
                                prog.isNotBlank() && tramo == null -> "Elige el tramo de esa progresiva."
                                else -> null
                            }
                            if (error == null) vm.registrar(tramo, m, lado, descripcion.trim(), fotos.toList())
                        },
                        enabled = !estado.guardando,
                        colors = ButtonDefaults.buttonColors(containerColor = Marca.VerdeBandera),
                        modifier = Modifier.weight(1f).height(50.dp),
                    ) { Text(if (estado.guardando) "Guardando…" else "Guardar") }
                }
            }
        }
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
private fun MapaDeObservaciones(lista: List<ObservacionDeCampo>, modifier: Modifier, alTocar: (ObservacionDeCampo) -> Unit) {
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
                m.setStyle(Style.Builder().fromJson(ESTILO_CALLES)) { estilo ->
                    estilo.addSource(GeoJsonSource("src-obs", FeatureCollection.fromFeatures(emptyList())))
                    estilo.addLayer(CircleLayer("capa-obs", "src-obs").withProperties(
                        PropertyFactory.circleColor(Expression.toColor(Expression.get("color"))),
                        PropertyFactory.circleRadius(Expression.interpolate(Expression.linear(), Expression.zoom(),
                            Expression.stop(6, 5f), Expression.stop(12, 9f), Expression.stop(16, 13f))),
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
    LaunchedEffect(lista, listo) {
        val m = mapa ?: return@LaunchedEffect
        if (!listo) return@LaunchedEffect
        val puntos = lista.filter { it.lat != null && it.lng != null }
        val rasgos = puntos.map { o ->
            Feature.fromGeometry(Point.fromLngLat(o.lng!!, o.lat!!)).apply {
                addStringProperty("id", o.id)
                addStringProperty("color", hex(COLOR_ESTADO[o.estado] ?: Color.Gray))
            }
        }
        m.getStyle { it.getSourceAs<GeoJsonSource>("src-obs")?.setGeoJson(FeatureCollection.fromFeatures(rasgos)) }
        if (puntos.isNotEmpty()) {
            val b = LatLngBounds.Builder()
            puntos.forEach { b.include(LatLng(it.lat!!, it.lng!!)) }
            if (puntos.size == 1) b.include(LatLng(puntos[0].lat!! + 0.02, puntos[0].lng!! + 0.02))
            runCatching { m.animateCamera(CameraUpdateFactory.newLatLngBounds(b.build(), 60), 600) }
        } else {
            runCatching { m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-17.2, -71.5), 6.0)) }
        }
    }
}
