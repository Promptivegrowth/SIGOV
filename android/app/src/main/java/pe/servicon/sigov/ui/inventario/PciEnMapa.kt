package pe.servicon.sigov.ui.inventario

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
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
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.InventarioRepositorio
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.ResumenPci
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.codigoCortoDePci
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.pci.Estado
import pe.servicon.sigov.ui.pci.diasQueLeQuedan
import pe.servicon.sigov.ui.pci.estadoDe
import pe.servicon.sigov.ui.theme.Marca

/** El avance de un ítem en el mapa (Elvis: «sin plazo no»). */
enum class AvancePci(val etiqueta: String, val singular: String, val color: Color) {
    ATENDIDO("Atendidos", "Atendido", Color(0xFF16A34A)),
    POR_VENCER("Por vencer", "Por vencer", Color(0xFFF59E0B)),
    VENCIDO("Vencidos", "Vencido", Color(0xFFDC2626)),
    EN_EJECUCION("En ejecución", "En ejecución", Color(0xFF2563EB)),
}

fun avanceDe(item: ItemPci): AvancePci = when (estadoDe(item)) {
    Estado.CONFORMES -> AvancePci.ATENDIDO
    Estado.EN_EJECUCION -> AvancePci.EN_EJECUCION
    else -> if ((diasQueLeQuedan(item) ?: 0) < 0) AvancePci.VENCIDO else AvancePci.POR_VENCER
}

data class EstadoPciEnMapa(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    val pcis: List<ResumenPci> = emptyList(),
    val items: List<ItemPci> = emptyList(),
    val posiciones: Map<String, Pair<Double, Double>> = emptyMap(),
    /** Los PCI que se ven; al entrar, todos los activos. */
    val elegidos: Set<String> = emptySet(),
    val avances: Set<AvancePci> = emptySet(),
    val enMapa: Boolean = true,
    val trabajando: String? = null,
    val irACamara: Pair<String, Fase>? = null,
    val error: String? = null,
) {
    private val delosPci: List<ItemPci> get() = items.filter { it.pciId in elegidos }
    val visibles: List<ItemPci>
        get() = delosPci.filter { avances.isEmpty() || avanceDe(it) in avances }
            .sortedWith(compareBy<ItemPci> { avanceDe(it).ordinal }.thenBy { it.vence ?: "9999" })
    fun cuantos(a: AvancePci) = delosPci.count { avanceDe(it) == a }
}

/**
 * PCI en mapa (boceto de Elvis del 14/10): los PCI activos de la cuadrilla
 * sobre la vía, con su avance. Es otra vista de lo mismo que el módulo PCI:
 * las fotos se registran igual, por ítem y etapa.
 */
@HiltViewModel
class PciEnMapaViewModel @javax.inject.Inject constructor(
    private val campo: CampoRepositorio,
    private val inventario: InventarioRepositorio,
    private val sesion: SesionRepositorio,
) : ViewModel() {
    private val _estado = MutableStateFlow(EstadoPciEnMapa())
    val estado: StateFlow<EstadoPciEnMapa> = _estado.asStateFlow()
    private var cargoUnaVez = false

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching {
                val c = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val pcis = campo.pciDeLaCuadrilla(c.servicioId, c.id).filter { it.activo && !it.completado }
                val items = campo.itemsPciDeLaCuadrilla(c.servicioId, c.id).filter { it.activoParaCuadrilla }
                val pos = inventario.posicionesPci(c.servicioId)
                cargoUnaVez = true
                _estado.update {
                    it.copy(
                        cargando = false, cuadrilla = c.name, pcis = pcis, items = items, posiciones = pos,
                        elegidos = it.elegidos.ifEmpty { pcis.map { p -> p.pciId }.toSet() },
                    )
                }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun alVolver() { if (cargoUnaVez) cargar() }
    fun alternarPci(id: String) = _estado.update { it.copy(elegidos = if (id in it.elegidos) it.elegidos - id else it.elegidos + id) }
    fun alternarAvance(a: AvancePci) = _estado.update { it.copy(avances = if (a in it.avances) it.avances - a else it.avances + a) }
    fun verEnMapa(si: Boolean) = _estado.update { it.copy(enMapa = si) }
    fun camaraAbierta() = _estado.update { it.copy(irACamara = null) }
    fun avisoVisto() = _estado.update { it.copy(error = null) }

    fun tomarFoto(item: ItemPci, fase: Fase) {
        _estado.update { it.copy(trabajando = item.id) }
        viewModelScope.launch {
            runCatching {
                val c = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                if (item.status == "pendiente") runCatching { campo.iniciarAtencionPci(item.id) }
                campo.registroDelItemPci(c.servicioId, c.id, item)
            }.onSuccess { r -> _estado.update { it.copy(trabajando = null, irACamara = r.clientId to fase) } }
                .onFailure { f -> _estado.update { it.copy(trabajando = null, error = f.enCristiano()) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaPciEnMapa(
    vm: PciEnMapaViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alVerFicha: () -> Unit,
    alTomarFoto: (registroId: String, fase: Fase) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var fotografiando by remember { mutableStateOf<ItemPci?>(null) }

    LaunchedEffect(estado.error) { estado.error?.let { avisos.showSnackbar(it); vm.avisoVisto() } }
    val tomarFoto by rememberUpdatedState(alTomarFoto)
    LaunchedEffect(estado.irACamara) {
        estado.irACamara?.let { (r, f) -> vm.camaraAbierta(); tomarFoto(r, f) }
    }
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) vm.alVolver() }
        ciclo.lifecycle.addObserver(o)
        onDispose { ciclo.lifecycle.removeObserver(o) }
    }

    fotografiando?.let { item ->
        AlertDialog(
            onDismissRequest = { fotografiando = null },
            title = { Text("Registrar fotos") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(listOfNotNull(item.pciCorto, item.numero?.let { "Ítem $it" }, item.tituloCorto).joinToString(" · "),
                        fontWeight = FontWeight.SemiBold)
                    listOf(Fase.ANTES to item.fotosAntes, Fase.DURANTE to item.fotosDurante, Fase.DESPUES to item.fotosDespues).forEach { (f, n) ->
                        OutlinedButton(onClick = { fotografiando = null; vm.tomarFoto(item, f) },
                            modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(10.dp)) {
                            Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(f.etiqueta, modifier = Modifier.weight(1f))
                            Text(if (n == 0) "sin foto" else "$n", color = if (n > 0) Marca.VerdeBandera else Marca.Naranja)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { fotografiando = null }) { Text("Cancelar") } },
        )
    }

    ArmazonDeApartado(
        titulo = "PCI en mapa",
        seccion = "Seguimiento georreferenciado",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        avisos = avisos,
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {
            // En mapa / En lista
            Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(true to "En mapa", false to "En lista").forEach { (k, t) ->
                    FilterChip(selected = estado.enMapa == k, onClick = { vm.verEnMapa(k) }, label = { Text(t) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Marca.Azul, selectedLabelColor = Color.White))
                }
            }
            if (estado.cargando) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                return@Column
            }
            // Los PCI activos, se pueden quitar y volver a poner
            Text("PCI · puedes seleccionar varios", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 14.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                estado.pcis.forEach { p ->
                    val sel = p.pciId in estado.elegidos
                    FilterChip(
                        selected = sel,
                        onClick = { vm.alternarPci(p.pciId) },
                        leadingIcon = { Checkbox(checked = sel, onCheckedChange = null, modifier = Modifier.size(18.dp)) },
                        label = { Text(codigoCortoDePci(p.code) ?: p.code) },
                    )
                }
                if (estado.pcis.isEmpty()) Text("Ningún PCI activo.", fontSize = 12.sp)
            }
            // El avance, que también filtra
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AvancePci.entries.forEach { a ->
                    val activo = a in estado.avances
                    Column(
                        Modifier.clip(RoundedCornerShape(10.dp))
                            .background(a.color.copy(alpha = if (activo) 0.22f else 0.09f))
                            .clickable { vm.alternarAvance(a) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("${estado.cuantos(a)}", fontWeight = FontWeight.Bold, color = a.color, fontSize = 16.sp)
                        Text(a.etiqueta, fontSize = 11.sp)
                    }
                }
            }

            if (estado.enMapa) {
                MapaDePci(estado.visibles, estado.posiciones, Modifier.fillMaxWidth().weight(1f)) { fotografiando = it }
            }
            Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("PCIs en el tramo", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Spacer(Modifier.width(6.dp))
                Text("${estado.visibles.size}", fontWeight = FontWeight.Bold, color = Marca.Azul, fontSize = 14.sp)
            }
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().weight(if (estado.enMapa) 0.9f else 1f)) {
                items(estado.visibles, key = { it.id }) { item ->
                    TarjetaPciEnMapa(item, estado.trabajando == item.id, alVerFicha) { fotografiando = item }
                }
            }
        }
    }
}

@Composable
private fun TarjetaPciEnMapa(item: ItemPci, ocupado: Boolean, alVerFicha: () -> Unit, alFotos: () -> Unit) {
    val a = avanceDe(item)
    val fases = listOf(item.fotosAntes, item.fotosDurante, item.fotosDespues).count { it > 0 }
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 9.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(listOfNotNull(item.pciCorto, item.numero?.let { "Ítem $it" }).joinToString(" · "),
                fontWeight = FontWeight.Bold, color = Marca.Azul, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(a.singular, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = a.color,
                modifier = Modifier.background(a.color.copy(alpha = 0.12f), RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 2.dp))
        }
        Text(item.tituloCorto, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(listOfNotNull(item.tramo, Progresiva.rango(item.progresiva, item.progresivaFin)?.let { "km $it" }).joinToString(" · "),
            fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            LinearProgressIndicator(progress = { fases / 3f }, color = a.color, trackColor = a.color.copy(alpha = 0.15f),
                modifier = Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)))
            Spacer(Modifier.width(8.dp))
            Text("${fases * 100 / 3}%", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
            OutlinedButton(onClick = alVerFicha, modifier = Modifier.weight(1f).height(40.dp), shape = RoundedCornerShape(10.dp)) {
                Text("Ver ficha"); Icon(Icons.Outlined.ChevronRight, null, Modifier.size(16.dp))
            }
            OutlinedButton(onClick = alFotos, enabled = !ocupado, modifier = Modifier.weight(1f).height(40.dp), shape = RoundedCornerShape(10.dp)) {
                Text("Fotos"); Icon(Icons.Outlined.ChevronRight, null, Modifier.size(16.dp))
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun MapaDePci(
    items: List<ItemPci>,
    posiciones: Map<String, Pair<Double, Double>>,
    modifier: Modifier,
    alTocar: (ItemPci) -> Unit,
) {
    val contexto = LocalContext.current
    val porId by rememberUpdatedState(remember(items) { items.associateBy { it.id } })
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
                    estilo.addSource(GeoJsonSource("src-pci", FeatureCollection.fromFeatures(emptyList())))
                    estilo.addLayer(CircleLayer("capa-pci", "src-pci").withProperties(
                        PropertyFactory.circleColor(Expression.toColor(Expression.get("color"))),
                        PropertyFactory.circleRadius(Expression.interpolate(Expression.linear(), Expression.zoom(),
                            Expression.stop(6, 4f), Expression.stop(12, 8f), Expression.stop(16, 13f))),
                        PropertyFactory.circleStrokeWidth(2f),
                        PropertyFactory.circleStrokeColor("#FFFFFF"),
                    ))
                    listo = true
                }
                m.addOnMapClickListener { punto ->
                    val p = m.projection.toScreenLocation(punto)
                    val r = 26f
                    val f = m.queryRenderedFeatures(android.graphics.RectF(p.x - r, p.y - r, p.x + r, p.y + r), "capa-pci")
                    f.firstOrNull()?.getStringProperty("id")?.let { id -> porId[id]?.let(tocar) }
                    f.isNotEmpty()
                }
            }
        }
    }
    LaunchedEffect(items, posiciones, listo) {
        val m = mapa ?: return@LaunchedEffect
        if (!listo) return@LaunchedEffect
        val puntos = items.mapNotNull { i -> posiciones[i.id]?.let { (lat, lng) -> Triple(i, lat, lng) } }
        val rasgos = puntos.map { (i, lat, lng) ->
            Feature.fromGeometry(Point.fromLngLat(lng, lat)).apply {
                addStringProperty("id", i.id)
                addStringProperty("color", hex(avanceDe(i).color))
            }
        }
        m.getStyle { it.getSourceAs<GeoJsonSource>("src-pci")?.setGeoJson(FeatureCollection.fromFeatures(rasgos)) }
        if (puntos.isNotEmpty()) {
            val b = LatLngBounds.Builder()
            puntos.forEach { (_, lat, lng) -> b.include(LatLng(lat, lng)) }
            if (puntos.size == 1) b.include(LatLng(puntos[0].second + 0.01, puntos[0].third + 0.01))
            runCatching { m.animateCamera(CameraUpdateFactory.newLatLngBounds(b.build(), 60), 700) }
        }
    }
}
