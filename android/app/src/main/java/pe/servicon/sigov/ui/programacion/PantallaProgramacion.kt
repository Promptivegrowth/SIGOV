package pe.servicon.sigov.ui.programacion

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import java.util.Locale

/**
 * Qué le toca hoy a la cuadrilla.
 *
 * Cada partida muestra dónde se ejecuta y cuánto se espera, y cuánto lleva
 * ejecutado según lo que ya se registró en el parte. Así el capataz sabe, sin
 * preguntar por radio, qué le falta para cerrar el día.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaProgramacion(
    vm: ProgramacionViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var impedimento by remember { mutableStateOf<ItemProgramado?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.error ?: estado.aviso)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    impedimento?.let { partida ->
        DialogoDeImpedimento(
            partida = partida,
            alCerrar = { impedimento = null },
            alReportar = { motivo ->
                vm.reportarImpedimento(partida, motivo)
                impedimento = null
            },
        )
    }

    ArmazonDeApartado(
        titulo = "Programación",
        seccion = "Apartado 4.4",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Actividades asignadas por el supervisor a tu cuadrilla.",
        avisos = avisos,
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            SelectorDeDia(
                etiqueta = Peru.fechaLarga(estado.fecha),
                esHoy = estado.esHoy,
                alRetroceder = { vm.moverDia(-1) },
                alAvanzar = { vm.moverDia(1) },
                alVolverAHoy = vm::volverAHoy,
            )

            when {
                estado.cargando -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                estado.error != null -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(estado.error!!, style = MaterialTheme.typography.bodyLarge)
                }

                estado.items.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.EventAvailable,
                        contentDescription = null,
                        modifier = Modifier.size(44.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Sin partidas programadas", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (estado.esHoy) {
                            "El supervisor todavía no publica el plan de hoy."
                        } else {
                            "Para ese día no hay nada programado."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { Resumen(estado) }
                    items(estado.items, key = { it.id }) { item ->
                        Partida(
                            item = item,
                            ocupada = estado.trabajando == item.id,
                            alIniciar = { vm.iniciar(item) },
                            alFinalizar = { vm.finalizar(item) },
                            alReportar = { impedimento = item },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SelectorDeDia(
    etiqueta: String,
    esHoy: Boolean,
    alRetroceder: () -> Unit,
    alAvanzar: () -> Unit,
    alVolverAHoy: () -> Unit,
) {
    Surface(color = Marca.Azul.copy(alpha = 0.06f)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = alRetroceder) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = "Día anterior")
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    etiqueta,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                if (!esHoy) {
                    TextButton(onClick = alVolverAHoy, contentPadding = PaddingValues(0.dp)) {
                        Text("Volver a hoy", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            IconButton(onClick = alAvanzar) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = "Día siguiente")
            }
        }
    }
}

@Composable
private fun Resumen(estado: EstadoProgramacion) {
    Surface(
        color = Marca.Azul.copy(alpha = 0.06f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Dato("Partidas", estado.items.size.toString())
            Dato("Meta", cifra(estado.metaTotal))
            Dato("Ejecutado", cifra(estado.ejecutadoTotal))
        }
    }
}

@Composable
private fun Dato(etiqueta: String, valor: String) {
    Column {
        Text(
            etiqueta.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(valor, style = MaterialTheme.typography.headlineSmall, color = Marca.Azul)
    }
}

@Composable
private fun Partida(
    item: ItemProgramado,
    ocupada: Boolean = false,
    alIniciar: () -> Unit = {},
    alFinalizar: () -> Unit = {},
    alReportar: () -> Unit = {},
) {
    val avance = ((item.avance ?: 0.0) / 100.0).coerceIn(0.0, 1.0).toFloat()

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        item.actividad ?: "Partida sin nombre",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            item.tramo,
                            Progresiva.rango(item.progresivaInicio, item.progresivaFin),
                        ).joinToString(" · ").ifBlank { "Sin ubicación indicada" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        cifra(item.meta ?: 0.0),
                        style = MaterialTheme.typography.headlineSmall,
                        color = Marca.Azul,
                    )
                    item.unidad?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                EtiquetaDeEstado(item.status)
                // El origen importa: una partida que nace de un PCI tiene plazo
                item.pciOrigen?.let { Etiqueta("Nace del $it", Marca.Naranja) }
            }

            item.impedimento?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "«$it»",
                    style = MaterialTheme.typography.bodySmall,
                    color = Marca.Naranja,
                )
            }

            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { avance },
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = if (avance >= 1f) Marca.VerdeBandera else Marca.Verde,
                trackColor = Marca.Azul.copy(alpha = 0.10f),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Ejecutado ${cifra(item.ejecutado ?: 0.0)} de ${cifra(item.meta ?: 0.0)}" +
                    (item.unidad?.let { " $it" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Lo que se puede hacer ahora, y solo eso: ofrecer «Finalizar»
            // sobre una partida que no se ha empezado invita a un error que
            // el servidor va a rechazar de todos modos.
            if (!item.estaCerrada) {
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    when {
                        item.esperaValidacion -> Text(
                            "Esperando el visto bueno del supervisor.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Marca.Naranja,
                        )

                        item.estaEnCurso -> {
                            Boton("Finalizar", Icons.Outlined.CheckCircle, Marca.VerdeBandera,
                                ocupada, Modifier.weight(1f), alFinalizar)
                            Boton("No se pudo", Icons.Outlined.ReportProblem, Marca.Naranja,
                                ocupada, Modifier.weight(1f), alReportar)
                        }

                        else -> {
                            Boton(
                                if (item.estaObservada) "Retomar" else "Iniciar",
                                Icons.Outlined.PlayArrow, Marca.Azul,
                                ocupada, Modifier.weight(1f), alIniciar,
                            )
                            if (!item.estaObservada) {
                                Boton("No se pudo", Icons.Outlined.ReportProblem, Marca.Naranja,
                                    ocupada, Modifier.weight(1f), alReportar)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Boton(
    texto: String,
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    ocupada: Boolean,
    modifier: Modifier = Modifier,
    alTocar: () -> Unit,
) {
    OutlinedButton(
        onClick = alTocar,
        enabled = !ocupada,
        shape = RoundedCornerShape(10.dp),
        // 48 dp de alto: en obra se toca con guantes
        modifier = modifier.height(48.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
    ) {
        if (ocupada) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = color)
        } else {
            Icon(icono, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(texto, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** El estado, dicho como lo nombra el contrato. */
@Composable
private fun EtiquetaDeEstado(status: String) {
    val (texto, color) = when (status) {
        "programado" -> "Pendiente" to Marca.Azul
        "en_curso" -> "En ejecución" to Marca.Verde
        "por_validar" -> "Por validar" to Marca.Naranja
        "ejecutado" -> "Culminada" to Marca.VerdeBandera
        "suspendido" -> "Observada" to Marca.Naranja
        "reprogramado" -> "Reprogramada" to Marca.Naranja
        else -> "Anulada" to Color.Gray
    }
    Etiqueta(texto, color)
}

/**
 * Por qué no se pudo ejecutar.
 *
 * Se pide por escrito y no con una lista de motivos fijos: el supervisor
 * necesita reprogramar y justificar ante el cliente, y «otro» no justifica
 * nada. Lo que se escriba aquí viaja tal cual al aviso que le llega.
 */
@Composable
private fun DialogoDeImpedimento(
    partida: ItemProgramado,
    alCerrar: () -> Unit,
    alReportar: (String) -> Unit,
) {
    var motivo by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("¿Por qué no se pudo?") },
        text = {
            Column {
                Text(
                    partida.actividad ?: "Esta partida",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    placeholder = { Text("No llegó el material, vía cerrada, lluvia…") },
                    minLines = 3,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "El supervisor lo recibe al instante para reprogramar.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { alReportar(motivo.trim()) },
                enabled = motivo.isNotBlank(),
            ) { Text("Reportar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

@Composable
private fun Etiqueta(texto: String, color: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

/** Los metrados se dictan con un decimal; más cifras solo estorban. */
private fun cifra(valor: Double): String = String.format(Locale("es", "PE"), "%.1f", valor)
