package pe.servicon.sigov.ui.pci

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.ResumenPci
import pe.servicon.sigov.datos.codigoCortoDePci
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.componentes.VisorConZoom
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Los PCI de la cuadrilla, como en la propuesta de Elvis (13/10).
 *
 * La vista general junta los ítems de todos los PCI activos: arriba cuatro
 * contadores que filtran (por atender, en ejecución, conformes,
 * observados), los PCI en paralelo, el buscador y los plazos; abajo, los
 * ítems por vencimiento. Al tocar un PCI se ven solo sus ítems, con su
 * propio filtro de estado y los botones «Registrar fotos» y «Foto
 * referencial». Flujo: elegir PCI → filtrar → registrar fotos → revisar →
 * con las tres fotos, a validación.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaPci(
    vm: PciViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alTomarFoto: (registroId: String, fase: Fase) -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var eligiendoFase by remember { mutableStateOf<ItemPci?>(null) }

    // Con la ficha abierta el mensaje va dentro de ella: abajo quedaría tapado
    LaunchedEffect(estado.aviso, estado.error, estado.ficha) {
        if (estado.ficha != null) return@LaunchedEffect
        (estado.error ?: estado.aviso)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    // A la cámara con la fase ya elegida; al volver se recargan las cuentas
    val tomarFoto by rememberUpdatedState(alTomarFoto)
    LaunchedEffect(estado.irACamara) {
        estado.irACamara?.let { (registro, fase) ->
            vm.camaraAbierta()
            tomarFoto(registro, fase)
        }
    }
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        // Al volver de la cámara esta pantalla se vuelve a componer: quién
        // sabe si ya cargó una vez es el ViewModel, que sobrevive al viaje
        val observador = LifecycleEventObserver { _, evento ->
            if (evento == Lifecycle.Event.ON_RESUME) vm.alVolver()
        }
        ciclo.lifecycle.addObserver(observador)
        onDispose { ciclo.lifecycle.removeObserver(observador) }
    }

    // Atrás, dentro de un PCI, vuelve a la vista general
    BackHandler(enabled = estado.abierto != null) { vm.cerrarPci() }

    estado.referencia?.let { url ->
        VisorConZoom(modelo = url, descripcion = "Foto referencial", alCerrar = vm::cerrarReferencia)
    }

    eligiendoFase?.let { item ->
        DialogoDeFase(
            item = item,
            alCerrar = { eligiendoFase = null },
            alElegir = { fase ->
                eligiendoFase = null
                vm.tomarFoto(item, fase)
            },
        )
    }

    estado.itemEnFicha?.let { item ->
        ModalBottomSheet(
            onDismissRequest = vm::cerrarFicha,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            FichaDelItem(
                item = item,
                metrado = estado.metradoDe(item),
                fotosPorEnviar = estado.fotosPorEnviar[item.id] ?: 0,
                ocupado = estado.trabajando == item.id,
                error = estado.error,
                aviso = estado.aviso,
                alTomarFoto = { fase -> vm.tomarFoto(item, fase) },
                alVerReferencia = { vm.verReferencia(item) },
                alRegistrarMetrado = { vm.registrarMetrado(item, it) },
            )
        }
    }

    val pci = estado.pciAbierto
    ArmazonDeApartado(
        titulo = pci?.let { codigoCortoDePci(it.code) } ?: "PCI · Pendientes de la cuadrilla",
        seccion = "Apartado 4.5",
        alVolver = { if (estado.abierto != null) vm.cerrarPci() else alVolver() },
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = if (pci == null) "Los ítems de tus PCI activos, por vencimiento."
                else "${pci.items} ítems de tu cuadrilla en este PCI.",
        avisos = avisos,
    ) { relleno ->
        Box(Modifier.fillMaxSize().padding(relleno)) {
            when {
                estado.cargando -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                estado.pcis.isEmpty() && estado.error != null -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                estado.pcis.isEmpty() -> SinNada("Ningún PCI activo", "Tu cuadrilla no tiene requerimientos abiertos.")

                else -> ListaDeItems(
                    estado = estado,
                    vm = vm,
                    alRegistrarFotos = { eligiendoFase = it },
                )
            }
        }
    }
}

// ─── La lista ─────────────────────────────────────────────────────────────

@Composable
private fun ListaDeItems(estado: EstadoPci, vm: PciViewModel, alRegistrarFotos: (ItemPci) -> Unit) {
    val general = estado.abierto == null
    val visibles = estado.visibles
    LazyColumn(
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (general) {
            // Los cuatro contadores filtran al tocarlos
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(Estado.POR_ATENDER, Estado.EN_EJECUCION, Estado.CONFORMES, Estado.OBSERVADOS).forEach { e ->
                        Contador(e, estado.cuantos(e), estado.estado == e, Modifier.weight(1f)) { vm.elegirContador(e) }
                    }
                }
            }
            item {
                Titulo(
                    if (estado.pcis.size == 1) "PCI activo"
                    else "PCIs activos (${estado.pcis.size} en paralelo)",
                )
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    estado.pcisOrdenados.forEach { p -> TarjetaDePci(p) { vm.abrirPci(p.pciId) } }
                }
            }
        } else {
            // Dentro del PCI, su propio filtro de estado
            item {
                Fichas {
                    Estado.entries.forEach { e ->
                        val n = estado.cuantos(e)
                        FilterChip(
                            selected = estado.estadoDelPci == e,
                            onClick = { vm.filtrarEstadoDelPci(e) },
                            label = { Text("${e.etiqueta} · $n") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = colorDe(e).copy(alpha = 0.16f),
                                selectedLabelColor = colorDe(e),
                            ),
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = estado.busqueda,
                onValueChange = vm::buscar,
                placeholder = { Text("Buscar por ruta, código o descripción") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                trailingIcon = if (estado.busqueda.isNotEmpty()) {
                    { IconButton(onClick = { vm.buscar("") }) { Icon(Icons.Outlined.Close, "Borrar la búsqueda") } }
                } else null,
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            Fichas {
                FilterChip(
                    selected = estado.plazo == null,
                    onClick = { vm.filtrarPlazo(null) },
                    label = { Text("Cualquier plazo") },
                )
                Plazo.entries.forEach { p ->
                    FilterChip(
                        selected = estado.plazo == p,
                        onClick = { vm.filtrarPlazo(p) },
                        label = { Text("${p.etiqueta} · ${estado.cuantos(p)}") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = colorDe(p).copy(alpha = 0.16f),
                            selectedLabelColor = colorDe(p),
                        ),
                    )
                }
            }
            Text(
                "Mostrando ${visibles.size} ${if (visibles.size == 1) "ítem" else "ítems"}" +
                    (if (estado.estadoEnVista != Estado.TODOS) " ${estado.estadoEnVista.etiqueta.lowercase()}" else "") +
                    " · Orden: vencimiento",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
            )
        }

        if (visibles.isEmpty()) {
            item { SinNada("Nada en este filtro", "Prueba con otro estado, plazo o búsqueda.") }
        }
        items(visibles, key = { it.id }) { item ->
            Box(Modifier.padding(horizontal = 16.dp)) {
                TarjetaDeItem(
                    item = item,
                    conBotones = !general,
                    ocupado = estado.trabajando == item.id,
                    alTocar = { vm.abrirFicha(item) },
                    alRegistrarFotos = { alRegistrarFotos(item) },
                    alVerReferencia = { vm.verReferencia(item) },
                )
            }
        }

        if (!general) {
            item {
                Text(
                    "A = Antes · D = Durante · DP = Después. Con las tres fotos el ítem pasa solo a Conformes y a la validación de COVINCA.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun Contador(e: Estado, n: Int, elegido: Boolean, modifier: Modifier, alTocar: () -> Unit) {
    val color = colorDe(e)
    Column(
        modifier
            .background(color.copy(alpha = if (elegido) 0.22f else 0.09f), RoundedCornerShape(12.dp))
            .then(if (elegido) Modifier.border(2.dp, color, RoundedCornerShape(12.dp)) else Modifier)
            .clickable(onClick = alTocar)
            .padding(vertical = 10.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("$n", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Text(
            e.etiqueta,
            style = MaterialTheme.typography.labelSmall,
            textAlign = TextAlign.Center,
            maxLines = 2,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** El PCI: solo su código y cuántos ítems tiene (un PCI trae defectos mezclados). */
@Composable
private fun TarjetaDePci(pci: ResumenPci, alTocar: () -> Unit) {
    val color = when {
        pci.vencidos > 0 -> Semaforo.Vencido
        pci.urgentes > 0 -> Semaforo.Urgente
        pci.completado -> Semaforo.Levantado
        else -> Semaforo.EnPlazo
    }
    OutlinedCard(
        onClick = alTocar,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, color.copy(alpha = 0.6f)),
        modifier = Modifier.widthIn(min = 132.dp),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    codigoCortoDePci(pci.code) ?: pci.code,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Outlined.ChevronRight, contentDescription = null, modifier = Modifier.size(18.dp))
            }
            Text(
                "${pci.items} ítems · ${pci.abiertos} pendientes",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (pci.vencidos > 0) {
                Text("${pci.vencidos} vencidos", style = MaterialTheme.typography.labelSmall, color = Semaforo.Vencido)
            }
        }
    }
}

/**
 * El ítem en una tarjeta compacta: número, título corto, dónde, estado y
 * plazo. Dentro de un PCI lleva además sus dos botones.
 */
@Composable
private fun TarjetaDeItem(
    item: ItemPci,
    conBotones: Boolean,
    ocupado: Boolean,
    alTocar: () -> Unit,
    alRegistrarFotos: () -> Unit,
    alVerReferencia: () -> Unit,
) {
    val estado = estadoDe(item)
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth().clickable(onClick = alTocar),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(colorDe(estado)))
            Column(Modifier.weight(1f).padding(start = 14.dp, top = 12.dp, bottom = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        listOfNotNull(item.numero?.let { "Ítem $it" }, item.pciCorto.takeIf { !conBotones }).joinToString(" · "),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Etiqueta(etiquetaDe(item), colorDe(estado))
                }
                Text(
                    item.tituloCorto,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    ubicacion(item),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ContadorDeFotos(item)
                    Spacer(Modifier.weight(1f))
                    textoDelPlazo(item).takeIf { it.isNotEmpty() }?.let {
                        Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = colorDelPlazo(item))
                    }
                }
                // Los observados con su observación a la vista (Elvis)
                if (item.estaObservado && !item.observacion.isNullOrBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Observación: " + item.observacion,
                        style = MaterialTheme.typography.bodySmall,
                        color = Semaforo.Vencido,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Semaforo.Vencido.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                            .padding(8.dp),
                    )
                }
                if (conBotones) {
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (estado != Estado.CONFORMES || item.estaObservado) {
                            Boton("Registrar fotos", Icons.Outlined.PhotoCamera, Marca.Azul, ocupado, true, Modifier.weight(1f), alRegistrarFotos)
                        }
                        Boton(
                            "Foto referencial", Icons.Outlined.Image, Marca.Azul, false,
                            item.fotoReferencia != null, Modifier.weight(1f), alVerReferencia,
                        )
                    }
                }
            }
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                modifier = Modifier.align(Alignment.CenterVertically).padding(horizontal = 6.dp),
            )
        }
    }
}

/** «A 0/1 · D 0/1 · DP 0/1», cada uno en verde si ya tiene su foto. */
@Composable
private fun ContadorDeFotos(item: ItemPci) {
    if (!item.exigeEvidencia) return
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("A" to item.fotosAntes, "D" to item.fotosDurante, "DP" to item.fotosDespues).forEach { (letra, n) ->
            val color = if (n > 0) Semaforo.EnPlazo else Semaforo.Vencido
            Text(
                "$letra ${minOf(n, 1)}/1",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = color,
                modifier = Modifier
                    .background(color.copy(alpha = 0.10f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

// ─── Registrar fotos: elegir la etapa ─────────────────────────────────────

@Composable
private fun DialogoDeFase(item: ItemPci, alCerrar: () -> Unit, alElegir: (Fase) -> Unit) {
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Registrar fotos") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    listOfNotNull(item.numero?.let { "Ítem $it" }, item.tituloCorto).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text("¿De qué etapa es la foto?", style = MaterialTheme.typography.bodySmall)
                listOf(
                    Fase.ANTES to item.fotosAntes,
                    Fase.DURANTE to item.fotosDurante,
                    Fase.DESPUES to item.fotosDespues,
                ).forEach { (fase, n) ->
                    BotonDeFoto(fase, n, false, Modifier.fillMaxWidth()) { alElegir(fase) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

// ─── La ficha del ítem ────────────────────────────────────────────────────

/**
 * El ítem completo: la descripción entera, dónde, la foto referencial, las
 * tres fotos y, si se quiere, el metrado. No hay que «levantarlo»: con las
 * tres fotos pasa solo a Conformes.
 */
@Composable
private fun FichaDelItem(
    item: ItemPci,
    metrado: Double,
    fotosPorEnviar: Int,
    ocupado: Boolean,
    error: String?,
    aviso: String?,
    alTomarFoto: (Fase) -> Unit,
    alVerReferencia: () -> Unit,
    alRegistrarMetrado: (Double) -> Unit,
) {
    var texto by remember(item.id) { mutableStateOf(if (metrado > 0) numero(metrado) else "") }
    val cantidad = texto.replace(',', '.').toDoubleOrNull()
    val estado = estadoDe(item)

    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            listOfNotNull(item.pciCorto, item.numero?.let { "Ítem $it" }).joinToString(" · "),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            item.description ?: item.actividad ?: "Ítem sin descripción",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        item.actividad?.takeIf { it != item.description }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium)
        }
        Text(ubicacion(item), style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Etiqueta(etiquetaDe(item), colorDe(estado))
            Text(textoDelPlazo(item), style = MaterialTheme.typography.labelLarge, color = colorDelPlazo(item))
        }
        item.quantity?.let {
            Text(
                "Cantidad pedida: ${numero(it)} ${item.unidad.orEmpty()}",
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        (error ?: aviso)?.let { texto ->
            val color = if (error != null) Semaforo.Vencido else Marca.VerdeBandera
            Text(
                texto,
                style = MaterialTheme.typography.bodyMedium,
                color = color,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(color.copy(alpha = 0.10f), RoundedCornerShape(10.dp))
                    .padding(12.dp),
            )
        }

        if (item.estaObservado && !item.observacion.isNullOrBlank()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Semaforo.Vencido.copy(alpha = 0.08f), RoundedCornerShape(10.dp))
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = Semaforo.Vencido)
                Column {
                    Text("Observación", style = MaterialTheme.typography.labelLarge, color = Semaforo.Vencido)
                    Text(item.observacion!!, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Vuelve a tomar las fotos que hagan falta: con las tres etapas pasa a revisión otra vez.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (item.fotoReferencia != null) {
            Boton("Foto referencial", Icons.Outlined.Image, Marca.Azul, false, true, Modifier.fillMaxWidth(), alVerReferencia)
        }

        if (item.estaLevantado) {
            Text(
                if (item.esConforme) "COVINCA validó este ítem."
                else "Conforme con sus tres fotos: espera la revisión de COVINCA.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }

        // Las tres fotos, cada una con su botón: la cámara se abre en esa fase
        Text("Fotos", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Fase.ANTES to item.fotosAntes,
                Fase.DURANTE to item.fotosDurante,
                Fase.DESPUES to item.fotosDespues,
            ).forEach { (fase, cuantas) ->
                BotonDeFoto(fase, cuantas, ocupado, Modifier.weight(1f)) { alTomarFoto(fase) }
            }
        }
        val faltan = buildList {
            if (item.fotosAntes == 0) add("antes")
            if (item.fotosDurante == 0) add("durante")
            if (item.fotosDespues == 0) add("después")
        }
        Text(
            when {
                faltan.isNotEmpty() && item.exigeEvidencia ->
                    "Falta la foto del " + (if (faltan.size == 1) faltan[0] else faltan.dropLast(1).joinToString(", ") + " y " + faltan.last()) +
                        ". Con las tres pasa solo a Conformes."
                fotosPorEnviar > 0 ->
                    "Ya tiene las tres fotos. ${if (fotosPorEnviar == 1) "1 foto sigue" else "$fotosPorEnviar fotos siguen"} en el teléfono: se envían solas al haber señal y entonces pasa a revisión de COVINCA."
                else -> "Ya tiene las tres fotos: pasa a revisión de COVINCA."
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (faltan.isNotEmpty()) Marca.Naranja else Marca.VerdeBandera,
        )

        Text("Metrado ejecutado (opcional)", style = MaterialTheme.typography.titleSmall)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = texto,
                onValueChange = { nuevo -> texto = nuevo.filter { it.isDigit() || it == '.' || it == ',' } },
                label = { Text("Cantidad") },
                suffix = { item.unidad?.let { Text(it) } },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f),
            )
            Boton(
                "Guardar",
                Icons.Outlined.Straighten,
                Marca.Azul,
                ocupado,
                cantidad != null && cantidad > 0 && cantidad != metrado,
                Modifier,
            ) { cantidad?.let(alRegistrarMetrado) }
        }
    }
}

// ─── Piezas ───────────────────────────────────────────────────────────────

@Composable
private fun Titulo(texto: String) {
    Text(
        texto,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 2.dp),
    )
}

@Composable
private fun Fichas(contenido: @Composable RowScope.() -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = contenido,
    )
}

@Composable
private fun Etiqueta(texto: String, color: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
private fun SinNada(titulo: String, detalle: String) {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(44.dp), tint = Marca.VerdeBandera)
        Spacer(Modifier.height(12.dp))
        Text(titulo, style = MaterialTheme.typography.titleMedium)
        Text(detalle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Un botón por fase: la foto y cuántas hay, en dos líneas para que quepa. */
@Composable
private fun BotonDeFoto(fase: Fase, cuantas: Int, ocupado: Boolean, modifier: Modifier, alTocar: () -> Unit) {
    val color = if (cuantas > 0) Marca.VerdeBandera else Marca.Naranja
    OutlinedButton(
        onClick = alTocar,
        enabled = !ocupado,
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(4.dp),
        modifier = modifier.height(64.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text(fase.etiqueta, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            }
            Text(
                when (cuantas) { 0 -> "sin foto"; 1 -> "1 foto"; else -> "$cuantas fotos" },
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun Boton(
    texto: String,
    icono: ImageVector,
    color: Color,
    ocupado: Boolean,
    habilitado: Boolean,
    modifier: Modifier = Modifier,
    alTocar: () -> Unit,
) {
    OutlinedButton(
        onClick = alTocar,
        enabled = !ocupado && habilitado,
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 10.dp),
        // 48 dp de alto: en obra se toca con guantes
        modifier = modifier.height(48.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
    ) {
        if (ocupado) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = color)
        } else {
            Icon(icono, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(texto, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
    }
}

private fun ubicacion(item: ItemPci): String =
    listOf(
        item.tramo ?: "Sin tramo",
        Progresiva.rango(item.progresiva, item.progresivaFin) ?: "Sin progresiva",
        pe.servicon.sigov.datos.Lados.codigo(item.side)?.let { "lado $it" } ?: "lado sin indicar",
    ).joinToString(" · ")

/** El estado dicho como en la propuesta, con el matiz que hace falta. */
private fun etiquetaDe(item: ItemPci): String = when (estadoDe(item)) {
    Estado.CONFORMES -> when {
        item.esConforme -> "Conforme · validado"
        item.estaLevantado -> "Conforme · por revisar"
        else -> "Conforme · por enviar"
    }
    Estado.OBSERVADOS -> "Observado"
    Estado.EN_EJECUCION -> "En ejecución"
    else -> "Por atender"
}

/** El plazo dicho como lo diría un capataz, no como una fecha. */
private fun textoDelPlazo(item: ItemPci): String {
    if (estadoDe(item) == Estado.CONFORMES) return ""
    return when (val dias = diasQueLeQuedan(item)) {
        null -> "Sin plazo"
        0 -> "Vence hoy"
        1 -> "Vence mañana"
        -1 -> "Venció ayer"
        in Int.MIN_VALUE..-2 -> "Venció hace ${-dias} días"
        else -> "Faltan $dias días"
    }
}

private fun colorDe(p: Plazo): Color = when (p) {
    Plazo.VENCIDO -> Semaforo.Vencido
    Plazo.UN_DIA -> Semaforo.Urgente
    Plazo.DOS_DIAS, Plazo.TRES_DIAS -> Semaforo.PorVencer
    Plazo.SIETE_DIAS, Plazo.CATORCE_DIAS -> Semaforo.EnPlazo
}

private fun colorDelPlazo(item: ItemPci): Color {
    if (estadoDe(item) == Estado.CONFORMES) return Semaforo.Levantado
    val d = diasQueLeQuedan(item) ?: return Semaforo.EnPlazo
    return when {
        d < 0 -> Semaforo.Vencido
        d <= 1 -> Semaforo.Urgente
        d <= 3 -> Semaforo.PorVencer
        else -> Semaforo.EnPlazo
    }
}

/** Los colores de los cuatro contadores. */
private fun colorDe(e: Estado): Color = when (e) {
    Estado.POR_ATENDER -> Color(0xFF616161)
    Estado.EN_EJECUCION -> Semaforo.PorVencer
    Estado.CONFORMES -> Semaforo.Levantado
    Estado.OBSERVADOS -> Semaforo.Vencido
    Estado.PENDIENTES, Estado.TODOS -> Marca.Azul
}

private fun numero(n: Double): String =
    if (n % 1.0 == 0.0) n.toLong().toString() else "%.2f".format(java.util.Locale.US, n).trimEnd('0').trimEnd('.')
