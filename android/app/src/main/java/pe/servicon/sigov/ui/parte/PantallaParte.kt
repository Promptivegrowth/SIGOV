package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import java.util.Locale

/**
 * El parte diario: lo que la cuadrilla ejecutó hoy.
 *
 * Cada actividad se anota con su tramo, sus progresivas y su metrado, y de
 * ella cuelgan las fotos. Es el documento que después valida el supervisor y
 * sustenta la valorización.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaParte(
    vm: ParteViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alTomarEvidencia: (registroClientId: String) -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var formularioAbierto by remember { mutableStateOf(false) }
    var menuAbierto by remember { mutableStateOf(false) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Reporte Diario",
        seccion = "Apartado 4.6",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Registra lo ejecutado hoy y genera el formato oficial.",
        avisos = avisos,
        acciones = {
            // El formato SIG-OP-F01, armado aquí mismo: el supervisor puede
            // pedir el parte en el frente de trabajo, sin señal.
            if (estado.parte != null && estado.registros.isNotEmpty()) {
                if (estado.imprimiendo) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = Marca.Azul,
                    )
                } else {
                    IconButton(onClick = { vm.imprimirParte(compartir = false) }) {
                        Icon(Icons.Outlined.PictureAsPdf, contentDescription = "Ver el parte en PDF",
                            tint = Marca.Azul)
                    }
                    Box {
                        IconButton(onClick = { menuAbierto = true }) {
                            Icon(Icons.Outlined.IosShare, contentDescription = "Compartir el parte",
                                tint = Marca.Verde)
                        }
                        DropdownMenu(expanded = menuAbierto, onDismissRequest = { menuAbierto = false }) {
                            DropdownMenuItem(
                                text = { Text("Compartir el PDF") },
                                onClick = { menuAbierto = false; vm.imprimirParte(compartir = true) },
                                leadingIcon = { Icon(Icons.Outlined.PictureAsPdf, null) },
                            )
                            DropdownMenuItem(
                                text = { Text("Compartir para Excel") },
                                onClick = { menuAbierto = false; vm.exportarCsv() },
                                leadingIcon = { Icon(Icons.Outlined.TableChart, null) },
                            )
                        }
                    }
                }
            }
        },
        botonFlotante = {
            if (!estado.cargando && estado.parte != null) {
                ExtendedFloatingActionButton(
                    onClick = { formularioAbierto = true },
                    containerColor = Marca.Verde,
                    contentColor = Color.White,
                    icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                    text = { Text("Registrar actividad", fontWeight = FontWeight.SemiBold) },
                )
            }
        },
    ) { relleno ->
        when {
            estado.cargando -> Box(
                Modifier.fillMaxSize().padding(relleno),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            estado.parte == null -> Box(
                Modifier.fillMaxSize().padding(relleno).padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    estado.error ?: "No se pudo abrir el parte.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }

            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(relleno),
                contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Resumen(estado) }

                if (estado.registros.isEmpty()) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Outlined.Straighten,
                                contentDescription = null,
                                modifier = Modifier.size(44.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("Todavía no registras nada", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Anota la primera actividad ejecutada. Funciona sin señal.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    items(estado.registros, key = { it.clientId }) { registro ->
                        Registro(
                            registro = registro,
                            fotos = estado.fotosPorRegistro[registro.clientId] ?: 0,
                            alTomarEvidencia = { alTomarEvidencia(registro.clientId) },
                        )
                    }
                }
            }
        }
    }

    if (formularioAbierto) {
        FormularioActividad(
            actividades = estado.actividades,
            tramos = estado.tramos,
            programadas = estado.programadas,
            pcis = estado.pcis,
            guardando = estado.guardando,
            alCerrar = { formularioAbierto = false },
            alGuardar = { actividad, tramo, ini, fin, lado, cantidad, obs, origen ->
                vm.registrar(actividad, tramo, ini, fin, lado, cantidad, obs, origen) {
                    formularioAbierto = false
                }
            },
        )
    }
}

@Composable
private fun Resumen(estado: EstadoParte) {
    Surface(
        color = Marca.Azul.copy(alpha = 0.06f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Dato("Registros", estado.registros.size.toString())
            Dato("Metrado", String.format(Locale("es", "PE"), "%.1f", estado.metradoTotal))
            Dato("Estado", estado.parte?.estado?.replaceFirstChar { it.uppercase() } ?: "—")
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
private fun Registro(
    registro: RegistroLocal,
    fotos: Int,
    alTomarEvidencia: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        registro.actividadNombre,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            registro.tramoNombre,
                            Progresiva.rango(registro.progresivaInicio, registro.progresivaFin),
                            "lado ${registro.lado}",
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    String.format(Locale("es", "PE"), "%.1f", registro.cantidad),
                    style = MaterialTheme.typography.headlineSmall,
                    color = Marca.Azul,
                )
            }

            // De dónde salió. En la valorización es lo primero que se revisa:
            // un metrado sin origen es un metrado que hay que ir a preguntar.
            Spacer(Modifier.height(8.dp))
            val (rotulo, tinte) = when (registro.origen) {
                "programacion" -> "Según programación" to Marca.VerdeBandera
                "pci" -> "Levantamiento de PCI" to Marca.Naranja
                else -> "No programado" to MaterialTheme.colorScheme.onSurfaceVariant
            }
            Text(
                rotulo,
                style = MaterialTheme.typography.labelSmall,
                color = tinte,
                modifier = Modifier
                    .background(tinte.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )

            registro.observacion?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "«$it»",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))
            // Una partida sin foto no se valoriza: el aviso es naranja hasta
            // que la evidencia existe.
            val conFotos = fotos > 0
            val color = if (conFotos) Marca.VerdeBandera else Marca.Naranja
            Surface(
                onClick = alTomarEvidencia,
                shape = RoundedCornerShape(10.dp),
                color = color.copy(alpha = 0.10f),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Icon(
                        Icons.Outlined.PhotoCamera,
                        contentDescription = null,
                        tint = color,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        when (fotos) {
                            0 -> "Tomar evidencia fotográfica"
                            1 -> "1 foto · agregar otra"
                            else -> "$fotos fotos · agregar otra"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = color,
                    )
                }
            }
        }
    }
}
