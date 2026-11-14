package pe.servicon.sigov.ui.ssoma

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.FireExtinguisher
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Sanitizer
import androidx.compose.material.icons.outlined.ShieldMoon
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.ui.componentes.ConformeONo
import pe.servicon.sigov.datos.EquipoDeSeguridad
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Extintores, botiquines y kits.
 *
 * Ordenados por lo que vence primero, con la banda de color a la izquierda
 * para que el que está vencido salte a la vista sin leer fechas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaEquipos(
    vm: EquiposViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var inspeccionando by remember { mutableStateOf<EquipoDeSeguridad?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Equipos de seguridad",
        seccion = "Apartado 6.8",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Extintores, botiquines y kits, con su vencimiento e inspección.",
        avisos = avisos,
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = estado.filtro == null,
                    onClick = { vm.filtrar(null) },
                    label = { Text("Todos") },
                )
                Urgencia.entries.forEach { urgencia ->
                    val cuantos = estado.conteos[urgencia] ?: 0
                    if (cuantos > 0) {
                        FilterChip(
                            selected = estado.filtro == urgencia,
                            onClick = { vm.filtrar(if (estado.filtro == urgencia) null else urgencia) },
                            label = { Text("${urgencia.etiqueta} · $cuantos") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = colorDe(urgencia).copy(alpha = 0.16f),
                                selectedLabelColor = colorDe(urgencia),
                            ),
                        )
                    }
                }
            }

            // El jefe ve lo de su cuadrilla y nada más: el interruptor que
            // mostraba lo de todo el contrato se retiró (OBS-61/65). Administrar
            // lo de todas las cuadrillas es de SSOMA, desde la web.

            when {
                estado.cargando -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                estado.error != null && estado.equipos.isEmpty() -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                estado.visibles.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        modifier = Modifier.size(44.dp),
                        tint = Marca.VerdeBandera,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Nada por aquí", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "No hay equipos en ese filtro.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(estado.visibles, key = { it.id }) { equipo ->
                        FilaEquipo(equipo, alInspeccionar = { inspeccionando = equipo })
                    }
                }
            }
        }
    }

    inspeccionando?.let { equipo ->
        DialogoInspeccion(
            equipo = equipo,
            guardando = estado.guardando,
            alCerrar = { inspeccionando = null },
            nuevoArchivo = vm::archivoTemporal,
            alRegistrar = { foto, nota ->
                vm.inspeccionarConFoto(equipo, foto, nota) { inspeccionando = null }
            },
        )
    }
}

@Composable
private fun FilaEquipo(equipo: EquipoDeSeguridad, alInspeccionar: () -> Unit) {
    val urgencia = urgenciaDe(equipo)
    val color = colorDe(urgencia)

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(5.dp).fillMaxHeight().background(color))

            Column(Modifier.padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Icon(
                        iconoDe(equipo.kind),
                        contentDescription = null,
                        tint = Marca.Azul,
                        modifier = Modifier.size(22.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${equipo.tipo} ${equipo.code}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            listOfNotNull(
                                equipo.capacity,
                                equipo.location,
                                equipo.cuadrilla,
                            ).joinToString(" · ").ifBlank { "Sin ubicación registrada" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        plazo(equipo.diasParaVencer),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = color,
                    )
                }

                equipo.diasParaRevision?.let { dias ->
                    if (dias <= 30) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Inspección: " + plazo(dias).lowercase(),
                            style = MaterialTheme.typography.bodySmall,
                            color = colorDeSemaforo(equipo.semaforoRevision),
                        )
                    }
                }

                // Vigencia y revisión SSOMA, cada una por su lado (OBS 14):
                // un equipo vencido puede tener su última revisión conforme
                val dma = { f: String -> f.take(10).split("-").reversed().joinToString("/") }
                fun Etiqueta(texto: String, color: androidx.compose.ui.graphics.Color) = @Composable {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        texto,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = color,
                        modifier = Modifier
                            .background(color.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }
                Spacer(Modifier.height(2.dp))
                when (equipo.vigencia) {
                    "vencido" -> Etiqueta("Vigencia: Vencido" + (equipo.vence?.let { " desde el ${dma(it)}" } ?: ""), Semaforo.Vencido)()
                    "vigente" -> Etiqueta("Vigencia: Vigente" + (equipo.vence?.let { " hasta el ${dma(it)}" } ?: ""), Marca.VerdeBandera)()
                    else -> {}
                }
                when {
                    equipo.ultimaRevisionEstado == "conforme" && equipo.ultimaConforme != null ->
                        Etiqueta("Última revisión SSOMA: Conforme el ${dma(equipo.ultimaConforme)}", Marca.VerdeBandera)()
                    equipo.ultimaRevisionEstado == null -> Etiqueta("Revisión SSOMA: sin inspecciones", MaterialTheme.colorScheme.onSurfaceVariant)()
                    equipo.observacionPendiente == null && equipo.ultimaRevisionEstado == "pendiente" ->
                        Etiqueta("Revisión SSOMA: Pendiente" + (equipo.ultimaInspeccion?.let { " · inspección del ${dma(it)}" } ?: ""), Marca.Azul)()
                    else -> {}
                }
                // Observación anterior y nueva inspección, diferenciadas (OBS 15)
                equipo.observacionPendiente?.let { f ->
                    Etiqueta(
                        "Observación anterior pendiente de levantamiento (${dma(f)})" +
                            (equipo.observacionPendienteNota?.let { ": $it" } ?: ""),
                        Semaforo.Vencido,
                    )()
                }
                equipo.inspeccionPendiente?.takeIf { equipo.ultimaRevisionEstado == "pendiente" && equipo.observacionPendiente != null }?.let { f ->
                    Etiqueta("Nueva inspección enviada a SSOMA el ${dma(f)}", Marca.Azul)()
                }

                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = alInspeccionar,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Fotografiar formato de inspección") }
            }
        }
    }
}

/**
 * La inspección del equipo: la foto del formato físico ya llenado
 * (REV3-OBS-45). El jefe no vuelve a marcar Conforme / No conforme: eso lo
 * dictamina el Ingeniero SSOMA al revisar la foto.
 */
@Composable
private fun DialogoInspeccion(
    equipo: EquipoDeSeguridad,
    guardando: Boolean,
    nuevoArchivo: () -> java.io.File,
    alCerrar: () -> Unit,
    alRegistrar: (foto: java.io.File, nota: String?) -> Unit,
) {
    var foto by remember { mutableStateOf<java.io.File?>(null) }
    var nota by remember { mutableStateOf("") }
    var camara by remember { mutableStateOf(false) }
    if (camara) {
        pe.servicon.sigov.ui.evidencia.CamaraSimple(
            titulo = "Formato de inspección · ${equipo.code}",
            destino = nuevoArchivo,
            alTomar = { f -> foto = f; camara = false },
            alCerrar = { camara = false },
            soloHorizontal = false,
        )
    }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Inspección de ${equipo.tipo} ${equipo.code}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    listOfNotNull(equipo.capacity, equipo.location).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Fotografía el formato de inspección ya llenado. El Ingeniero SSOMA lo revisa y dictamina: " +
                        "conforme, observado, vencido o requiere corrección.",
                    style = MaterialTheme.typography.bodySmall,
                )
                foto?.let { f ->
                    coil.compose.AsyncImage(
                        model = f, contentDescription = null,
                        contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().height(220.dp).background(Color(0xFFE9EDF3), RoundedCornerShape(10.dp)),
                    )
                }
                OutlinedButton(onClick = { camara = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (foto == null) "Fotografiar formato" else "Volver a fotografiar")
                }
                OutlinedTextField(
                    value = nota,
                    onValueChange = { nota = it.take(300) },
                    label = { Text("Nota (opcional)") },
                    placeholder = { Text("Si algo llama la atención: manómetro en rojo…") },
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = !guardando && foto != null,
                onClick = { foto?.let { alRegistrar(it, nota.ifBlank { null }) } },
            ) { Text(if (guardando) "Enviando…" else "Enviar a revisión SSOMA") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

/** El plazo dicho como lo diría el capataz, no como una fecha. */
private fun plazo(dias: Int?): String = when {
    dias == null -> "Sin fecha"
    dias < 0 -> if (dias == -1) "Venció ayer" else "Venció hace ${-dias} días"
    dias == 0 -> "Vence hoy"
    dias == 1 -> "Vence mañana"
    else -> "Faltan $dias días"
}

private fun colorDe(urgencia: Urgencia): Color = when (urgencia) {
    Urgencia.VENCIDO -> Semaforo.Vencido
    Urgencia.SIETE -> Semaforo.Urgente
    Urgencia.QUINCE -> Semaforo.PorVencer
    Urgencia.TREINTA -> Marca.Verde
    Urgencia.HOLGADO -> Semaforo.EnPlazo
}

internal fun colorDeSemaforo(semaforo: String): Color = when (semaforo) {
    "vencido" -> Semaforo.Vencido
    "rojo" -> Semaforo.Urgente
    "ambar" -> Semaforo.PorVencer
    "verde" -> Marca.Verde
    else -> Semaforo.EnPlazo
}

private fun iconoDe(kind: String): ImageVector = when (kind) {
    "extintor" -> Icons.Outlined.FireExtinguisher
    "botiquin" -> Icons.Outlined.MedicalServices
    "kit_antiderrame" -> Icons.Outlined.Sanitizer
    else -> Icons.Outlined.ShieldMoon
}
