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

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (estado.soloMiCuadrilla) "Los de mi cuadrilla y los comunes"
                    else "Todos los del contrato",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Switch(
                    checked = !estado.soloMiCuadrilla,
                    onCheckedChange = { vm.alternarAlcance() },
                )
            }

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
            alRegistrar = { conforme, hallazgo ->
                vm.inspeccionar(equipo, conforme, hallazgo) { inspeccionando = null }
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

                if (equipo.status == "observado" || equipo.observaciones > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Tiene ${equipo.observaciones} observación" +
                            (if (equipo.observaciones == 1) "" else "es") + " sin levantar",
                        style = MaterialTheme.typography.bodySmall,
                        color = Semaforo.PorVencer,
                        modifier = Modifier
                            .background(Semaforo.PorVencer.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    )
                }

                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = alInspeccionar,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Registrar revisión") }
            }
        }
    }
}

@Composable
private fun DialogoInspeccion(
    equipo: EquipoDeSeguridad,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alRegistrar: (conforme: Boolean, hallazgo: String?) -> Unit,
) {
    var conforme by remember { mutableStateOf(true) }
    var hallazgo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Revisar ${equipo.tipo} ${equipo.code}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    listOfNotNull(equipo.capacity, equipo.location).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("¿Está conforme?", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            if (conforme) "Sin novedad" else "Hay algo que corregir",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (conforme) Marca.VerdeBandera else Semaforo.Urgente,
                        )
                    }
                    Switch(checked = conforme, onCheckedChange = { conforme = it })
                }

                if (!conforme) {
                    OutlinedTextField(
                        value = hallazgo,
                        onValueChange = { hallazgo = it },
                        label = { Text("Qué encontraste") },
                        placeholder = { Text("Manómetro en rojo, precinto roto…") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !guardando,
                onClick = {
                    error = if (!conforme && hallazgo.isBlank()) {
                        "Di qué encontraste: el supervisor necesita saber qué corregir."
                    } else null
                    if (error == null) alRegistrar(conforme, hallazgo.ifBlank { null })
                },
            ) { Text("Registrar") }
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
