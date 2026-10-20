package pe.servicon.sigov.ui.evidencia

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SwapVert
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import pe.servicon.sigov.datos.EvidenciaEnGaleria
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.codigoCortoDePci
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Evidencias del jefe de cuadrilla, según el boceto de Elvis (13/10/2026).
 *
 * Fecha inicio y fecha final con calendario (y los atajos Hoy, 7, 15 y 30
 * días), origen MR o PCI, un buscador que sugiere actividades y PCI, y las
 * fotos agrupadas por trabajo: cada actividad de la programación en su día y
 * cada ítem de PCI, con sus miniaturas. Solo visualización: exportar es del
 * supervisor y de COVINCA, desde la web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaGaleria(
    vm: GaleriaViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    var grupo by remember { mutableStateOf<GrupoDeFotos?>(null) }
    var abierta by remember { mutableStateOf<EvidenciaEnGaleria?>(null) }

    ArmazonDeApartado(
        titulo = "Evidencias",
        seccion = "Apartado 4.13",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Las fotos de tu cuadrilla: de la programación y de tus PCI. Solo visualización.",
    ) { relleno ->
        LazyColumn(
            Modifier.fillMaxSize().padding(relleno),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // ─── Fechas ─────────────────────────────────────────────────
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CampoDeFecha("Fecha inicio", estado.desde, Modifier.weight(1f), vm::cambiarDesde)
                    CampoDeFecha("Fecha final", estado.hasta, Modifier.weight(1f), vm::cambiarHasta)
                }
                Fichas {
                    Periodo.entries.forEach { p ->
                        FilterChip(
                            selected = estado.periodo == p,
                            onClick = { vm.cambiarPeriodo(p) },
                            label = { Text(p.etiqueta) },
                            colors = verde(),
                        )
                    }
                }
            }

            // ─── Buscador con sugerencias ───────────────────────────────
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    OutlinedTextField(
                        value = estado.busqueda,
                        onValueChange = vm::buscar,
                        placeholder = { Text("Buscar por actividad o PCI") },
                        leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                        trailingIcon = {
                            if (estado.busqueda.isNotEmpty()) {
                                IconButton(onClick = { vm.buscar("") }) {
                                    Icon(Icons.Outlined.Close, contentDescription = "Limpiar")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    estado.sugerencias.forEach { s ->
                        Text(
                            s,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { vm.buscar(s) }
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        )
                    }
                }
            }

            // ─── Origen y PCI ───────────────────────────────────────────
            item {
                Fichas {
                    OrigenDeFoto.entries.forEach { o ->
                        FilterChip(
                            selected = estado.origen == o,
                            onClick = { vm.cambiarOrigen(o) },
                            label = { Text(o.etiqueta) },
                            colors = verde(),
                        )
                    }
                    if (estado.origen != OrigenDeFoto.MR) {
                        estado.pcisDelRango.forEach { codigo ->
                            FilterChip(
                                selected = codigo in estado.pcis,
                                onClick = { vm.alternarPci(codigo) },
                                label = { Text(codigoCortoDePci(codigo) ?: codigo) },
                                colors = verde(),
                            )
                        }
                    }
                }
            }

            item {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Evidencias encontradas: ${estado.visibles.size}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = vm::alternarOrden) {
                        Text(if (estado.masRecientes) "Ordenar" else "Más antiguas")
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Outlined.SwapVert, contentDescription = "Cambiar el orden", modifier = Modifier.size(18.dp))
                    }
                }
            }

            when {
                estado.cargando -> item {
                    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }

                estado.error != null -> item {
                    Text(estado.error!!, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(32.dp))
                }

                estado.grupos.isEmpty() -> item {
                    Column(
                        Modifier.fillMaxWidth().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(Icons.Outlined.PhotoLibrary, contentDescription = null, modifier = Modifier.size(44.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(12.dp))
                        Text("Sin fotos en esas fechas", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Amplía las fechas o quita algún filtro.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                else -> items(estado.grupos, key = { it.clave }) { g ->
                    TarjetaDeGrupo(
                        grupo = g,
                        alAbrir = { grupo = g },
                        alAbrirFoto = { abierta = it },
                    )
                }
            }

            item {
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.Visibility, contentDescription = null, tint = Semaforo.Vencido, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Solo visualización · Sin exportar", style = MaterialTheme.typography.labelLarge, color = Semaforo.Vencido)
                }
            }
        }
    }

    grupo?.let { g ->
        ModalBottomSheet(onDismissRequest = { grupo = null }) {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                Text(g.origen, style = MaterialTheme.typography.labelLarge, color = Marca.Azul)
                Text(g.titulo, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    listOf(fechaCorta(g.fecha), g.ubicacion).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.heightIn(max = 520.dp),
                ) {
                    items(g.fotos, key = { it.id }) { foto -> Miniatura(foto, alTocar = { abierta = foto }) }
                }
            }
        }
    }

    abierta?.let { foto ->
        VisorDeFoto(foto = foto, alCerrar = { abierta = null })
    }
}

@Composable
private fun TarjetaDeGrupo(grupo: GrupoDeFotos, alAbrir: () -> Unit, alAbrirFoto: (EvidenciaEnGaleria) -> Unit) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = alAbrir),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (grupo.esPci) Icons.Outlined.Description else Icons.Outlined.Event,
                    contentDescription = null,
                    tint = Marca.Azul,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    grupo.origen,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Marca.Azul,
                    modifier = Modifier.weight(1f),
                )
                Text(fechaCorta(grupo.fecha), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(grupo.titulo, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (grupo.ubicacion.isNotBlank()) {
                    Icon(Icons.Outlined.Place, contentDescription = null, modifier = Modifier.size(15.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(3.dp))
                }
                Text(
                    grupo.ubicacion,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${grupo.fotos.size} ${if (grupo.fotos.size == 1) "foto" else "fotos"}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                grupo.fotos.take(4).forEach { foto ->
                    Box(Modifier.weight(1f)) { Miniatura(foto, alTocar = { alAbrirFoto(foto) }, conEtapa = false) }
                }
                if (grupo.fotos.size > 4) {
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable(onClick = alAbrir),
                        contentAlignment = Alignment.Center,
                    ) { Text("+${grupo.fotos.size - 4}", style = MaterialTheme.typography.titleSmall) }
                } else repeat(5 - grupo.fotos.size.coerceAtMost(4)) { Spacer(Modifier.weight(1f)) }
                Icon(Icons.Outlined.ChevronRight, contentDescription = null)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Etapa("A", grupo.antes)
                Etapa("D", grupo.durante)
                Etapa("DP", grupo.despues)
            }
        }
    }
}

@Composable
private fun Etapa(letra: String, n: Int) {
    val color = if (n > 0) Semaforo.EnPlazo else MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        "$letra $n",
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.10f), RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** Un campo de fecha que abre el calendario (Elvis: «presiono y me sale un calendario»). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CampoDeFecha(etiqueta: String, fecha: LocalDate, modifier: Modifier, alElegir: (LocalDate) -> Unit) {
    var abierto by remember { mutableStateOf(false) }
    OutlinedCard(onClick = { abierto = true }, shape = RoundedCornerShape(12.dp), modifier = modifier) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = Marca.Azul, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Column {
                Text(etiqueta, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(fecha.format(DD_MM_AAAA), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
        }
    }
    if (abierto) {
        val hoy = Peru.hoy()
        val estadoFecha = rememberDatePickerState(
            initialSelectedDateMillis = fecha.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isAfter(hoy)
            },
        )
        DatePickerDialog(
            onDismissRequest = { abierto = false },
            confirmButton = {
                TextButton(onClick = {
                    estadoFecha.selectedDateMillis?.let { alElegir(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    abierto = false
                }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { abierto = false }) { Text("Cancelar") } },
        ) { DatePicker(state = estadoFecha) }
    }
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
private fun verde() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = Marca.VerdeBandera,
    selectedLabelColor = Color.White,
)

@Composable
private fun Miniatura(foto: EvidenciaEnGaleria, alTocar: () -> Unit, conEtapa: Boolean = true) {
    Box(
        Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        AsyncImage(
            model = foto.rutaLocal?.let { File(it) } ?: foto.url,
            contentDescription = foto.actividad,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().clickable(onClick = alTocar),
        )
        if (conEtapa) {
            Text(
                Fase.entries.firstOrNull { it.valor == foto.phase }?.etiqueta ?: foto.phase,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .background(Marca.Azul.copy(alpha = 0.85f))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            )
        }
        // Una foto que todavía no subió no sustenta nada todavía
        if (foto.rutaLocal != null && foto.url == null && foto.sha256 == null) {
            Text(
                "Por enviar",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(3.dp)
                    .background(Marca.Naranja, RoundedCornerShape(5.dp))
                    .padding(horizontal = 4.dp, vertical = 1.dp),
            )
        }
    }
}

private val DD_MM_AAAA = DateTimeFormatter.ofPattern("dd/MM/yyyy")

private fun fechaCorta(iso: String): String =
    runCatching { LocalDate.parse(iso.take(10)).format(DD_MM_AAAA) }.getOrDefault(iso)

/** Lo que ubica la foto: dónde, cuándo y de qué trabajo es. */
internal fun detalleDe(foto: EvidenciaEnGaleria): String =
    listOfNotNull(
        foto.actividad,
        foto.tramo,
        foto.progresiva?.let { Progresiva.aTexto(it) },
        codigoCortoDePci(foto.pciCodigo)?.let { c -> foto.pciItem?.let { "$c · ítem $it" } ?: c },
    ).joinToString(" · ")
