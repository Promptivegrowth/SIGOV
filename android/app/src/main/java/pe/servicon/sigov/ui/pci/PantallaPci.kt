package pe.servicon.sigov.ui.pci

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material.icons.outlined.Verified
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.ResumenPci
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Los PCI de la cuadrilla.
 *
 * Dos niveles, como los pidió Elvis: primero se elige el PCI (puede haber
 * varios abiertos a la vez) y dentro se ven sus ítems, filtrados por plazo y
 * por estado. Lo que ya se empezó queda arriba, en «En atención», hasta que
 * se levanta: el capataz no tiene que volver a buscarlo entre cientos.
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
    var levantando by remember { mutableStateOf<ItemPci?>(null) }

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
        var primera = true
        val observador = LifecycleEventObserver { _, evento ->
            if (evento == Lifecycle.Event.ON_RESUME) {
                if (!primera) vm.cargar(silencioso = true)
                primera = false
            }
        }
        ciclo.lifecycle.addObserver(observador)
        onDispose { ciclo.lifecycle.removeObserver(observador) }
    }

    // Atrás, dentro de un PCI, vuelve a la lista de PCI
    val variosPci = estado.pcis.count { !it.completado } > 1 || estado.verCompletados
    BackHandler(enabled = estado.abierto != null && variosPci) { vm.cerrarPci() }

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
                alIniciar = { vm.iniciar(item) },
                alTomarFoto = { fase -> vm.tomarFoto(item, fase) },
                alRegistrarMetrado = { vm.registrarMetrado(item, it) },
                alLevantar = { levantando = item },
            )
        }
    }

    levantando?.let { item ->
        DialogoDeLevantamiento(
            item = item,
            alCerrar = { levantando = null },
            alLevantar = { nota ->
                vm.levantar(item, nota)
                levantando = null
            },
        )
    }

    val pci = estado.pciAbierto
    ArmazonDeApartado(
        titulo = pci?.code ?: "PCIs",
        seccion = "Apartado 4.5",
        alVolver = { if (estado.abierto != null && variosPci) vm.cerrarPci() else alVolver() },
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = if (pci == null) "Elige el PCI en que vas a trabajar."
                else pci.title ?: "Los ítems de este PCI asignados a tu cuadrilla.",
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

                pci == null -> ListaDePci(
                    pcis = estado.pcisVisibles,
                    hayCompletados = estado.pcis.any { it.completado },
                    verCompletados = estado.verCompletados,
                    alVerCompletados = vm::verCompletados,
                    alAbrir = { vm.abrirPci(it.pciId) },
                )

                else -> ItemsDelPci(estado = estado, vm = vm)
            }
        }
    }
}

// ─── Nivel 1: los PCI ─────────────────────────────────────────────────────

@Composable
private fun ListaDePci(
    pcis: List<ResumenPci>,
    hayCompletados: Boolean,
    verCompletados: Boolean,
    alVerCompletados: (Boolean) -> Unit,
    alAbrir: (ResumenPci) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (hayCompletados) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Ver también los conformes",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(checked = verCompletados, onCheckedChange = alVerCompletados)
                }
            }
        }
        if (pcis.isEmpty()) {
            item { SinNada("Ningún PCI pendiente", "Tu cuadrilla no tiene requerimientos abiertos.") }
        }
        items(pcis, key = { it.pciId }) { pci -> TarjetaDePci(pci) { alAbrir(pci) } }
    }
}

@Composable
private fun TarjetaDePci(pci: ResumenPci, alTocar: () -> Unit) {
    val color = when {
        pci.vencidos > 0 -> Semaforo.Vencido
        pci.urgentes > 0 -> Semaforo.Urgente
        pci.completado -> Semaforo.Levantado
        else -> Semaforo.EnPlazo
    }
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth().clickable(onClick = alTocar),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(color))
            Column(Modifier.weight(1f).padding(16.dp)) {
                Text(pci.code, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                pci.title?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "${pci.items} ítems · ${pci.abiertos} por atender · ${pci.porValidar} por validar · ${pci.conformes} conformes",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (pci.vencidos > 0 || pci.urgentes > 0 || pci.observados > 0) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (pci.vencidos > 0) Etiqueta("${pci.vencidos} vencidos", Semaforo.Vencido)
                        if (pci.urgentes > 0) Etiqueta("${pci.urgentes} vencen ya", Semaforo.Urgente)
                        if (pci.observados > 0) Etiqueta("${pci.observados} observados", Semaforo.Vencido)
                    }
                }
            }
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                modifier = Modifier.align(Alignment.CenterVertically).padding(end = 12.dp),
            )
        }
    }
}

// ─── Nivel 2: los ítems de un PCI ─────────────────────────────────────────

@Composable
private fun ItemsDelPci(estado: EstadoPci, vm: PciViewModel) {
    val bandeja = estado.bandeja
    LazyColumn(
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (bandeja.isNotEmpty()) {
            item {
                Titulo("En atención · pendientes de culminar (${bandeja.size})")
            }
            items(bandeja, key = { "b" + it.id }) { item ->
                Box(Modifier.padding(horizontal = 16.dp)) {
                    TarjetaDeItem(item, estado.metradoDe(item)) { vm.abrirFicha(item) }
                }
            }
        }

        item {
            Titulo("Ítems del PCI")
            Fichas {
                Filtro.entries.forEach { f ->
                    val n = estado.conteoFiltro(f)
                    if (n > 0 || f == Filtro.ABIERTOS || f == estado.filtro) {
                        FilterChip(
                            selected = estado.filtro == f,
                            onClick = { vm.filtrar(f) },
                            label = { Text("${f.etiqueta} · $n") },
                        )
                    }
                }
            }
            Fichas {
                FilterChip(
                    selected = estado.plazo == null,
                    onClick = { vm.filtrarPlazo(null) },
                    label = { Text("Cualquier plazo") },
                )
                Plazo.entries.forEach { p ->
                    val n = estado.conteoPlazo(p)
                    if (n > 0) {
                        FilterChip(
                            selected = estado.plazo == p,
                            onClick = { vm.filtrarPlazo(if (estado.plazo == p) null else p) },
                            label = { Text("${p.etiqueta} · $n") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = colorDe(p).copy(alpha = 0.16f),
                                selectedLabelColor = colorDe(p),
                            ),
                        )
                    }
                }
            }
        }

        val visibles = estado.visibles
        if (visibles.isEmpty()) {
            item { SinNada("Nada en este filtro", "Prueba con otro estado o plazo.") }
        }
        items(visibles, key = { it.id }) { item ->
            Box(Modifier.padding(horizontal = 16.dp)) {
                TarjetaDeItem(item, estado.metradoDe(item)) { vm.abrirFicha(item) }
            }
        }
    }
}

@Composable
private fun TarjetaDeItem(item: ItemPci, metrado: Double, alTocar: () -> Unit) {
    val color = colorDe(item)
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth().clickable(onClick = alTocar),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(color))
            Column(Modifier.weight(1f).padding(14.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        listOfNotNull(item.numero?.let { "Ítem $it" }, item.actividadCodigo).joinToString(" · "),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        textoDelPlazo(item),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = color,
                    )
                }
                Text(
                    item.description ?: item.actividad ?: "Ítem sin descripción",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 3,
                )
                Text(
                    ubicacion(item),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Etiqueta(item.estadoLegible, colorDelEstado(item))
                    if (item.exigeEvidencia && !item.estaPendiente) {
                        Text(
                            "A ${item.fotosAntes} · D ${item.fotosDurante} · Dp ${item.fotosDespues}" +
                                (if (metrado > 0) " · ${numero(metrado)} ${item.unidad.orEmpty()}" else ""),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

// ─── La ficha del ítem ────────────────────────────────────────────────────

/**
 * Todo lo que se hace con un ítem, en un solo lugar (OBS-13): iniciar, las
 * tres fotos con un toque cada una, el metrado y el levantamiento.
 */
@Composable
private fun FichaDelItem(
    item: ItemPci,
    metrado: Double,
    fotosPorEnviar: Int,
    ocupado: Boolean,
    error: String?,
    aviso: String?,
    alIniciar: () -> Unit,
    alTomarFoto: (Fase) -> Unit,
    alRegistrarMetrado: (Double) -> Unit,
    alLevantar: () -> Unit,
) {
    var texto by remember(item.id) { mutableStateOf(if (metrado > 0) numero(metrado) else "") }
    val cantidad = texto.replace(',', '.').toDoubleOrNull()

    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            listOfNotNull(item.pciCodigo, item.numero?.let { "Ítem $it" }, item.actividadCodigo).joinToString(" · "),
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
            Etiqueta(item.estadoLegible, colorDelEstado(item))
            Text(textoDelPlazo(item), style = MaterialTheme.typography.labelLarge, color = colorDe(item))
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
                    Text("Observación de COVINCA", style = MaterialTheme.typography.labelLarge, color = Semaforo.Vencido)
                    Text(item.observacion!!, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (!item.estaAbierto) {
            Text(
                if (item.esConforme) "COVINCA dio este ítem por conforme." else "Ya se levantó: espera la validación de COVINCA.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }

        if (item.estaPendiente) {
            Boton("Iniciar atención", Icons.Outlined.PlayArrow, Marca.Azul, ocupado, true, Modifier.fillMaxWidth(), alIniciar)
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
        if (fotosPorEnviar > 0) {
            Text(
                if (fotosPorEnviar == 1) "1 foto aún en el teléfono: se envía sola al haber señal, y recién entonces se puede levantar."
                else "$fotosPorEnviar fotos aún en el teléfono: se envían solas al haber señal, y recién entonces se puede levantar.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Text("Metrado ejecutado", style = MaterialTheme.typography.titleSmall)
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

        val faltan = buildList {
            if (item.exigeEvidencia && item.fotosAntes == 0) add("la foto del antes")
            if (item.exigeEvidencia && item.fotosDespues == 0) add("la foto del después")
            if (metrado <= 0) add("el metrado")
            if (fotosPorEnviar > 0) add("que se envíen las fotos")
        }
        if (faltan.isNotEmpty()) {
            val lista = if (faltan.size == 1) faltan[0]
                        else faltan.dropLast(1).joinToString(", ") + " y " + faltan.last()
            Text(
                "Para levantarlo falta $lista.",
                style = MaterialTheme.typography.bodySmall,
                color = Marca.Naranja,
            )
        }
        Boton(
            if (item.estaObservado) "Dar por subsanado" else "Dar por levantado",
            Icons.Outlined.Verified,
            Marca.VerdeBandera,
            ocupado,
            faltan.isEmpty(),
            Modifier.fillMaxWidth(),
            alLevantar,
        )
    }
}

/**
 * El cierre de un ítem, con su nota. La nota no es obligatoria pero se
 * ofrece: cuando COVINCA observa, lo primero que se busca es qué se dijo.
 */
@Composable
private fun DialogoDeLevantamiento(
    item: ItemPci,
    alCerrar: () -> Unit,
    alLevantar: (String?) -> Unit,
) {
    var nota by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(if (item.estaObservado) "¿Dar por subsanado?" else "¿Dar por levantado?") },
        text = {
            Column {
                Text(
                    item.description ?: "Este ítem",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Antes ${item.fotosAntes} · durante ${item.fotosDurante} · después ${item.fotosDespues}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = nota,
                    onValueChange = { nota = it },
                    label = { Text("Nota (opcional)") },
                    placeholder = { Text("Qué se hizo, con qué material…") },
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { alLevantar(nota.trim().ifBlank { null }) }) {
                Text(if (item.estaObservado) "Subsanado" else "Levantar")
            }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

// ─── Piezas ───────────────────────────────────────────────────────────────

@Composable
private fun Titulo(texto: String) {
    Text(
        texto,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp),
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
    listOfNotNull(
        item.tramo,
        Progresiva.rango(item.progresiva, item.progresivaFin),
        item.side?.let { "lado $it" },
    ).joinToString(" · ").ifBlank { "Sin ubicación indicada" }

/** El plazo dicho como lo diría un capataz, no como una fecha. */
private fun textoDelPlazo(item: ItemPci): String {
    if (!item.estaAbierto) return ""
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
    Plazo.CUATRO_O_MAS -> Semaforo.EnPlazo
}

private fun colorDe(item: ItemPci): Color = plazoDe(item)?.let(::colorDe) ?: Semaforo.Levantado

private fun colorDelEstado(item: ItemPci): Color = when {
    item.estaObservado -> Semaforo.Vencido
    item.esConforme -> Semaforo.Levantado
    item.esperaValidacion -> Marca.Azul
    item.estaEnAtencion -> Semaforo.PorVencer
    else -> Color(0xFF616161)
}

private fun numero(n: Double): String =
    if (n % 1.0 == 0.0) n.toLong().toString() else "%.2f".format(java.util.Locale.US, n).trimEnd('0').trimEnd('.')
