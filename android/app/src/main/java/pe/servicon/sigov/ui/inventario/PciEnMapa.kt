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

/**
 * El estado de un ítem en el mapa, el mismo del módulo PCI (Elvis, 26/10:
 * «homogenizar con los anteriores»). Lo que no se ha tocado va en gris.
 */
enum class AvancePci(val etiqueta: String, val singular: String, val color: Color) {
    // Los que no tienen ni una foto (Elvis, 26/10: «un filtro de pendientes»)
    POR_ATENDER("Por atender", "Por atender · sin fotos", Color(0xFF64748B)),
    EN_EJECUCION("En ejecución", "En ejecución", Color(0xFF2563EB)),
    ATENDIDO("Atendidos / Por validar", "Por validar", Color(0xFF16A34A)),
    // Morado, para no confundirlo con el rojo de lo vencido (REV3-OBS-30)
    OBSERVADO("Observados", "Observado", Color(0xFF7C3AED)),
}

fun avanceDe(item: ItemPci): AvancePci = when (estadoDe(item)) {
    Estado.CONFORMES, Estado.VALIDADOS -> AvancePci.ATENDIDO
    Estado.EN_EJECUCION -> AvancePci.EN_EJECUCION
    Estado.OBSERVADOS -> AvancePci.OBSERVADO
    else -> AvancePci.POR_ATENDER
}

/**
 * El color de cada punto (REV3-OBS-30): el de su situación real, sin que
 * importe qué filtros estén marcados. Verde atendido, rojo vencido,
 * amarillo por vencer, azul en ejecución, morado observado y gris por atender.
 */
fun colorEnMapa(item: ItemPci): Color {
    val a = avanceDe(item)
    return when {
        a == AvancePci.ATENDIDO -> AvancePci.ATENDIDO.color
        plazoDe(item) == PlazoEnMapa.VENCIDO -> PlazoEnMapa.VENCIDO.color
        plazoDe(item) == PlazoEnMapa.POR_VENCER -> PlazoEnMapa.POR_VENCER.color
        else -> a.color
    }
}

/** El plazo de lo que falta atender: aparte del estado, para no mezclarlos. */
enum class PlazoEnMapa(val etiqueta: String, val color: Color) {
    POR_VENCER("Por vencer (2 días)", Color(0xFFF59E0B)),
    VENCIDO("Vencidos", Color(0xFFDC2626)),
}

fun plazoDe(item: ItemPci): PlazoEnMapa? {
    if (avanceDe(item) == AvancePci.ATENDIDO) return null
    val dias = diasQueLeQuedan(item) ?: return null
    return when {
        dias < 0 -> PlazoEnMapa.VENCIDO
        dias <= 2 -> PlazoEnMapa.POR_VENCER
        else -> null
    }
}

data class EstadoPciEnMapa(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    val pcis: List<ResumenPci> = emptyList(),
    val items: List<ItemPci> = emptyList(),
    val posiciones: Map<String, Pair<Double, Double>> = emptyMap(),
    /** Los ítems con intervalo, como tramo de vía. */
    val tramos: Map<String, List<Pair<Double, Double>>> = emptyMap(),
    val plazos: Set<PlazoEnMapa> = emptySet(),
    val buscandoUbicacion: Boolean = false,
    /** Los PCI que se ven; al entrar, todos los activos. */
    val elegidos: Set<String> = emptySet(),
    val avances: Set<AvancePci> = emptySet(),
    val enMapa: Boolean = true,
    val trabajando: String? = null,
    val irACamara: Pair<String, Fase>? = null,
    val error: String? = null,
    /** Dónde quedó el mapa al ir a un ítem: se vuelve ahí (REV3-OBS-32). */
    val camara: org.maplibre.android.camera.CameraPosition? = null,
    /** El enlace de la foto referencial abierta (REV3-OBS-06). */
    val referencia: String? = null,
) {
    private val delosPci: List<ItemPci> get() = items.filter { it.pciId in elegidos }
    val visibles: List<ItemPci>
        get() = delosPci.filter { (avances.isEmpty() || avanceDe(it) in avances) && (plazos.isEmpty() || plazoDe(it) in plazos) }
            .sortedWith(compareBy<ItemPci> { avanceDe(it).ordinal }.thenBy { it.vence ?: "9999" })
    fun cuantos(a: AvancePci) = delosPci.count { avanceDe(it) == a }
    fun cuantos(p: PlazoEnMapa) = delosPci.count { plazoDe(it) == p }
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
    private val ubicacion: pe.servicon.sigov.datos.Ubicacion,
    private val documentos: pe.servicon.sigov.datos.DocumentosRepositorio,
    private val partes: pe.servicon.sigov.datos.local.ParteDao,
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
                // Las fotos que siguen en el teléfono cuentan igual, como en el
                // módulo PCI: las cifras A·D·DP son las mismas (REV3-OBS-05)
                val locales = runCatching { partes.fotosPciPorEnviar() }.getOrDefault(emptyList())
                fun local(id: String, fase: String) = locales.filter { it.pciItemId == id && it.fase == fase }.sumOf { it.cuantas }
                val items = campo.itemsPciDeLaCuadrilla(c.servicioId, c.id).filter { it.activoParaCuadrilla }
                    .map { i ->
                        i.copy(
                            fotosAntes = i.fotosAntes + local(i.id, "antes"),
                            fotosDurante = i.fotosDurante + local(i.id, "durante"),
                            fotosDespues = i.fotosDespues + local(i.id, "despues"),
                        )
                    }
                val pos = inventario.posicionesPci(c.servicioId)
                val tramos = inventario.tramosPci(c.servicioId)
                cargoUnaVez = true
                _estado.update {
                    it.copy(
                        cargando = false, cuadrilla = c.name, pcis = pcis, items = items, posiciones = pos, tramos = tramos,
                        elegidos = it.elegidos.ifEmpty { pcis.map { p -> p.pciId }.toSet() },
                    )
                }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun alVolver() { if (cargoUnaVez) cargar() }
    fun alternarPci(id: String) = _estado.update { it.copy(elegidos = if (id in it.elegidos) it.elegidos - id else it.elegidos + id) }
    fun alternarAvance(a: AvancePci) = _estado.update { it.copy(avances = if (a in it.avances) it.avances - a else it.avances + a) }
    fun alternarPlazo(p: PlazoEnMapa) = _estado.update { it.copy(plazos = if (p in it.plazos) it.plazos - p else it.plazos + p) }
    fun cualquierPlazo() = _estado.update { it.copy(plazos = emptySet()) }
    fun recordarCamara(c: org.maplibre.android.camera.CameraPosition?) = _estado.update { it.copy(camara = c) }

    fun verReferencia(item: ItemPci) {
        val ruta = item.fotoReferencia ?: return
        viewModelScope.launch {
            val url = documentos.enlace(ruta)
            _estado.update { if (url == null) it.copy(error = "No se pudo abrir la foto referencial. Revisa la señal.") else it.copy(referencia = url) }
        }
    }
    fun cerrarReferencia() = _estado.update { it.copy(referencia = null) }

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

    /** A la cámara de frente, en la primera etapa sin foto (Elvis, 26/10). */
    fun tomarFotos(item: ItemPci) = tomarFoto(
        item,
        when {
            item.fotosAntes == 0 -> Fase.ANTES
            item.fotosDurante == 0 -> Fase.DURANTE
            else -> Fase.DESPUES
        },
    )
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
    /** La ficha del ítem en el módulo PCI: la misma vista en todas partes. */
    alVerFicha: (ItemPci) -> Unit,
    alTomarFoto: (registroId: String, fase: Fase) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    estado.referencia?.let { url ->
        pe.servicon.sigov.ui.componentes.VisorConZoom(modelo = url, descripcion = "Foto referencial", alCerrar = vm::cerrarReferencia)
    }
    val avisos = remember { SnackbarHostState() }
    val control = remember { pe.servicon.sigov.ui.componentes.ControlDeMapa() }

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
            // El estado (como en el módulo PCI) y, aparte, el plazo de lo que falta
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AvancePci.entries.forEach { a ->
                    Cifra(estado.cuantos(a), a.etiqueta, a.color, a in estado.avances) { vm.alternarAvance(a) }
                }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Plazo", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                // Estado y plazo se combinan: «Por atender + Vencidos» (REV3-OBS-29)
                FilterChip(
                    selected = estado.plazos.isEmpty(),
                    onClick = { vm.cualquierPlazo() },
                    label = { Text("Cualquier plazo", fontSize = 12.sp) },
                )
                PlazoEnMapa.entries.forEach { p ->
                    FilterChip(
                        selected = p in estado.plazos,
                        onClick = { vm.alternarPlazo(p) },
                        leadingIcon = { Box(Modifier.size(9.dp).clip(CircleShape).background(p.color)) },
                        label = { Text("${p.etiqueta} · ${estado.cuantos(p)}", fontSize = 12.sp) },
                    )
                }
            }

            if (estado.enMapa) {
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    MapaDePci(estado.visibles, estado.posiciones, estado.tramos, Modifier.fillMaxSize(), control, estado.camara) {
                        vm.recordarCamara(control.mapa?.cameraPosition); alVerFicha(it)
                    }
                    // Qué significa cada color (REV3-OBS-30)
                    Row(
                        Modifier.align(Alignment.BottomStart).padding(8.dp)
                            .background(Color.White.copy(alpha = 0.88f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf(AvancePci.ATENDIDO.color to "Atendido", PlazoEnMapa.VENCIDO.color to "Vencido",
                            PlazoEnMapa.POR_VENCER.color to "Por vencer", AvancePci.EN_EJECUCION.color to "En ejecución",
                            AvancePci.OBSERVADO.color to "Observado", AvancePci.POR_ATENDER.color to "Por atender").forEach { (c, t) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).clip(CircleShape).background(c))
                                Text(" $t", fontSize = 9.5.sp, color = Color(0xFF334155))
                            }
                        }
                    }
                    pe.servicon.sigov.ui.componentes.ControlesDeMapa(
                        buscando = estado.buscandoUbicacion,
                        alMiUbicacion = { vm.buscarMiUbicacion { lat, lng -> control.miUbicacion(lat, lng) } },
                        alVerTodo = control::verTodo,
                        modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                    )
                }
            }
            Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                // Un PCI es el conjunto; lo que se ve son sus ítems (Elvis, 24/10)
                Text("Ítems PCI mostrados", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Spacer(Modifier.width(6.dp))
                Text("${estado.visibles.size}", fontWeight = FontWeight.Bold, color = Marca.Azul, fontSize = 14.sp)
            }
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().weight(if (estado.enMapa) 0.9f else 1f)) {
                items(estado.visibles, key = { it.id }) { item ->
                    TarjetaPciEnMapa(
                        item, estado.trabajando == item.id,
                        // Tocar el ítem lleva el mapa a su lugar (Elvis, 26/10)
                        alUbicar = { estado.posiciones[item.id]?.let { (lat, lng) -> control.irA(lat, lng) } },
                        alVerFicha = { vm.recordarCamara(control.mapa?.cameraPosition); alVerFicha(item) },
                        // La foto referencial, a un toque desde el mapa (REV3-OBS-06)
                        alReferencia = { vm.verReferencia(item) },
                        alFotos = { vm.tomarFotos(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TarjetaPciEnMapa(item: ItemPci, ocupado: Boolean, alUbicar: () -> Unit, alVerFicha: () -> Unit, alFotos: () -> Unit,
                             alReferencia: () -> Unit = {}) {
    val a = avanceDe(item)
    val fases = listOf(item.fotosAntes, item.fotosDurante, item.fotosDespues).count { it > 0 }
    Column(Modifier.fillMaxWidth().clickable(onClick = alUbicar).padding(horizontal = 14.dp, vertical = 9.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(listOfNotNull(item.pciCorto, item.numero?.let { "Ítem $it" }).joinToString(" · "),
                fontWeight = FontWeight.Bold, color = Marca.Azul, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(a.singular, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = a.color,
                modifier = Modifier.background(a.color.copy(alpha = 0.12f), RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 2.dp))
        }
        Text(item.tituloCorto, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(listOfNotNull(item.tramo, Progresiva.rango(item.progresiva, item.progresivaFin)?.let { "km $it" }).joinToString(" · "),
            fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // Las fotos por etapa, como en el módulo PCI
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("A" to item.fotosAntes, "D" to item.fotosDurante, "DP" to item.fotosDespues).forEach { (letra, n) ->
                val c = if (n > 0) Color(0xFF16A34A) else Color(0xFFDC2626)
                Text("$letra $n", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = c,
                    modifier = Modifier.background(c.copy(alpha = 0.10f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
            }
            plazoDe(item)?.let { p ->
                Spacer(Modifier.weight(1f))
                Text(if (p == PlazoEnMapa.VENCIDO) "Vencido" else "Por vencer", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = p.color)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
            // Abre el ítem en el módulo PCI y al cerrarlo vuelve aquí (REV3-OBS-32)
            OutlinedButton(onClick = alVerFicha, modifier = Modifier.weight(1f).height(40.dp), shape = RoundedCornerShape(10.dp)) {
                Text("Gestionar ítem"); Icon(Icons.Outlined.ChevronRight, null, Modifier.size(16.dp))
            }
            if (item.fotoReferencia != null) {
                OutlinedButton(onClick = alReferencia, modifier = Modifier.height(40.dp), shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp)) { Text("Ref.") }
            }
            OutlinedButton(onClick = alFotos, enabled = !ocupado, modifier = Modifier.weight(1f).height(40.dp), shape = RoundedCornerShape(10.dp)) {
                Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Tomar fotos")
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun MapaDePci(
    items: List<ItemPci>,
    posiciones: Map<String, Pair<Double, Double>>,
    tramos: Map<String, List<Pair<Double, Double>>>,
    modifier: Modifier,
    control: pe.servicon.sigov.ui.componentes.ControlDeMapa,
    camaraGuardada: org.maplibre.android.camera.CameraPosition? = null,
    alTocar: (ItemPci) -> Unit,
) {
    var encuadrado by remember { mutableStateOf(false) }
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
                control.mapa = m
                m.setStyle(Style.Builder().fromJson(ESTILO_CALLES)) { estilo ->
                    // Lo que tiene intervalo, como un tramo de vía (Elvis, 26/10)
                    estilo.addSource(GeoJsonSource("src-pci-tramos", FeatureCollection.fromFeatures(emptyList())))
                    estilo.addLayer(org.maplibre.android.style.layers.LineLayer("capa-pci-tramos", "src-pci-tramos").withProperties(
                        PropertyFactory.lineColor(Expression.toColor(Expression.get("color"))),
                        PropertyFactory.lineWidth(Expression.interpolate(Expression.linear(), Expression.zoom(),
                            Expression.stop(8, 3f), Expression.stop(14, 7f), Expression.stop(17, 11f))),
                        PropertyFactory.lineCap(org.maplibre.android.style.layers.Property.LINE_CAP_ROUND),
                        PropertyFactory.lineOpacity(0.85f),
                    ))
                    // Lejos, los puntos se agrupan con su cantidad (REV3-REC-01)
                    estilo.addSource(GeoJsonSource("src-pci", FeatureCollection.fromFeatures(emptyList()),
                        org.maplibre.android.style.sources.GeoJsonOptions().withCluster(true).withClusterMaxZoom(11).withClusterRadius(42)))
                    estilo.addLayer(CircleLayer("capa-pci-grupos", "src-pci").withProperties(
                        PropertyFactory.circleColor("#072D70"),
                        PropertyFactory.circleOpacity(0.85f),
                        PropertyFactory.circleRadius(Expression.step(Expression.get("point_count"), Expression.literal(14f),
                            Expression.stop(10, 18f), Expression.stop(50, 24f))),
                        PropertyFactory.circleStrokeWidth(2f),
                        PropertyFactory.circleStrokeColor("#FFFFFF"),
                    ).withFilter(Expression.has("point_count")))
                    estilo.addLayer(org.maplibre.android.style.layers.SymbolLayer("capa-pci-cuenta", "src-pci").withProperties(
                        PropertyFactory.textField(Expression.toString(Expression.get("point_count"))),
                        PropertyFactory.textSize(12f),
                        PropertyFactory.textColor("#FFFFFF"),
                        PropertyFactory.textAllowOverlap(true),
                    ).withFilter(Expression.has("point_count")))
                    estilo.addLayer(CircleLayer("capa-pci", "src-pci").withFilter(Expression.not(Expression.has("point_count"))).withProperties(
                        PropertyFactory.circleColor(Expression.toColor(Expression.get("color"))),
                        PropertyFactory.circleRadius(Expression.interpolate(Expression.linear(), Expression.zoom(),
                            Expression.stop(6, 4f), Expression.stop(12, 8f), Expression.stop(16, 13f))),
                        PropertyFactory.circleStrokeWidth(2.5f),
                        // Lo vencido lleva el borde rojo
                        PropertyFactory.circleStrokeColor(Expression.toColor(Expression.get("borde"))),
                    ))
                    listo = true
                }
                m.addOnMapClickListener { punto ->
                    val p = m.projection.toScreenLocation(punto)
                    val r = 26f
                    // Un grupo se abre acercándose
                    if (m.queryRenderedFeatures(android.graphics.RectF(p.x - r, p.y - r, p.x + r, p.y + r), "capa-pci-grupos").isNotEmpty()) {
                        m.animateCamera(CameraUpdateFactory.newLatLngZoom(punto, m.cameraPosition.zoom + 2), 500)
                        return@addOnMapClickListener true
                    }
                    val f = m.queryRenderedFeatures(android.graphics.RectF(p.x - r, p.y - r, p.x + r, p.y + r), "capa-pci", "capa-pci-tramos")
                    f.firstOrNull()?.getStringProperty("id")?.let { id -> porId[id]?.let(tocar) }
                    f.isNotEmpty()
                }
            }
        }
    }
    LaunchedEffect(items, posiciones, tramos, listo) {
        val m = mapa ?: return@LaunchedEffect
        if (!listo) return@LaunchedEffect
        val puntos = items.mapNotNull { i -> posiciones[i.id]?.let { (lat, lng) -> Triple(i, lat, lng) } }
        val rasgos = puntos.map { (i, lat, lng) ->
            Feature.fromGeometry(Point.fromLngLat(lng, lat)).apply {
                addStringProperty("id", i.id)
                addStringProperty("color", hex(colorEnMapa(i)))
                addStringProperty("borde", "#FFFFFF")
            }
        }
        val lineas = items.mapNotNull { i ->
            tramos[i.id]?.let { t ->
                Feature.fromGeometry(org.maplibre.geojson.LineString.fromLngLats(t.map { (lat, lng) -> Point.fromLngLat(lng, lat) })).apply {
                    addStringProperty("id", i.id)
                    addStringProperty("color", hex(colorEnMapa(i)))
                }
            }
        }
        m.getStyle {
            it.getSourceAs<GeoJsonSource>("src-pci")?.setGeoJson(FeatureCollection.fromFeatures(rasgos))
            it.getSourceAs<GeoJsonSource>("src-pci-tramos")?.setGeoJson(FeatureCollection.fromFeatures(lineas))
        }
        if (puntos.isNotEmpty()) {
            val b = LatLngBounds.Builder()
            puntos.forEach { (_, lat, lng) -> b.include(LatLng(lat, lng)) }
            if (puntos.size == 1) b.include(LatLng(puntos[0].second + 0.01, puntos[0].third + 0.01))
            control.limites = b.build()
            // Al volver de un ítem, el mapa queda donde estaba (REV3-OBS-32)
            if (!encuadrado && camaraGuardada != null) runCatching { m.moveCamera(CameraUpdateFactory.newCameraPosition(camaraGuardada)) }
            else runCatching { m.animateCamera(CameraUpdateFactory.newLatLngBounds(b.build(), 60), 700) }
            encuadrado = true
        }
    }
}

@Composable
private fun Cifra(n: Int, etiqueta: String, color: Color, activo: Boolean, alTocar: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = if (activo) 0.22f else 0.09f))
            .clickable(onClick = alTocar)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("$n", fontWeight = FontWeight.Bold, color = color, fontSize = 16.sp)
        Text(etiqueta, fontSize = 11.sp)
    }
}

