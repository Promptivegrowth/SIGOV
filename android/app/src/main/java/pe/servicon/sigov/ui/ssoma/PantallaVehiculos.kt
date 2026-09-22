package pe.servicon.sigov.ui.ssoma

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.PUNTOS_PREOPERACIONAL
import pe.servicon.sigov.datos.Vehiculo
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * La flota.
 *
 * Lo primero que se ve de cada vehículo es qué papel vence antes, porque es
 * lo que decide si puede salir. Debajo, el preoperacional del día.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaVehiculos(
    vm: VehiculosViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var revisando by remember { mutableStateOf<Vehiculo?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Vehículos",
        seccion = "Apartado 6.6",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Papeles del vehículo y revisión de antes de salir.",
        avisos = avisos,
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    if (estado.soloMiCuadrilla) "Los de mi cuadrilla y los comunes"
                    else "Toda la flota del contrato",
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

                estado.error != null && estado.vehiculos.isEmpty() -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                estado.visibles.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.DirectionsCar,
                        contentDescription = null,
                        modifier = Modifier.size(44.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Sin vehículos", style = MaterialTheme.typography.titleMedium)
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(estado.visibles, key = { it.id }) { vehiculo ->
                        FilaVehiculo(
                            vehiculo = vehiculo,
                            hoy = estado.hoy,
                            alRevisar = { revisando = vehiculo },
                        )
                    }
                }
            }
        }
    }

    revisando?.let { vehiculo ->
        Preoperacional(
            vehiculo = vehiculo,
            guardando = estado.guardando,
            alCerrar = { revisando = null },
            alRegistrar = { puntos, km, hallazgo ->
                vm.registrarPreoperacional(vehiculo, puntos, km, hallazgo) { revisando = null }
            },
        )
    }
}

@Composable
private fun FilaVehiculo(vehiculo: Vehiculo, hoy: String, alRevisar: () -> Unit) {
    val color = colorDeSemaforo(vehiculo.semaforo)
    val revisado = vehiculo.revisadoHoy(hoy)

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
                    Column(Modifier.weight(1f)) {
                        Text(
                            vehiculo.plate,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            listOfNotNull(
                                vehiculo.tipo,
                                listOfNotNull(vehiculo.brand, vehiculo.model).joinToString(" ")
                                    .ifBlank { null },
                                vehiculo.cuadrilla,
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (revisado) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                Icons.Outlined.CheckCircle,
                                contentDescription = null,
                                tint = Marca.VerdeBandera,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                "Revisado hoy",
                                style = MaterialTheme.typography.labelMedium,
                                color = Marca.VerdeBandera,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))
                Papel("SOAT", vehiculo.soat)
                Papel("Revisión técnica", vehiculo.revisionTecnica)
                Papel("Póliza", vehiculo.poliza)

                vehiculo.kmParaServicio?.let { km ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (km <= 0) "Servicio vencido por kilometraje"
                        else "Faltan ${"%,d".format(km)} km para el servicio",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (km <= 1000) Semaforo.PorVencer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = alRevisar,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text(if (revisado) "Volver a revisar" else "Revisión antes de salir")
                }
            }
        }
    }
}

/** Una línea por papel, con su fecha y su color. */
@Composable
private fun Papel(nombre: String, fecha: String?) {
    if (fecha == null) return
    val dias = runCatching {
        java.time.temporal.ChronoUnit.DAYS.between(
            java.time.LocalDate.now(pe.servicon.sigov.datos.Peru.zona),
            java.time.LocalDate.parse(fecha),
        ).toInt()
    }.getOrNull()

    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            nombre,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            plazoDias(dias),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = if ((dias ?: 99) <= 15) FontWeight.SemiBold else FontWeight.Normal,
            color = colorDeDias(dias),
        )
    }
}

/**
 * El preoperacional.
 *
 * Todos los puntos arrancan en conforme porque lo normal es que el vehículo
 * esté bien; lo que el conductor hace es marcar lo que NO está, que es más
 * rápido y refleja lo que realmente revisa.
 */
@Composable
private fun Preoperacional(
    vehiculo: Vehiculo,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alRegistrar: (puntos: Map<String, Boolean>, km: Int?, hallazgo: String?) -> Unit,
) {
    val puntos = remember {
        mutableStateMapOf<String, Boolean>().apply {
            PUNTOS_PREOPERACIONAL.forEach { (clave, _) -> put(clave, true) }
        }
    }
    var kilometraje by remember { mutableStateOf(vehiculo.kilometraje?.toString() ?: "") }
    var hallazgo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    val observados = puntos.count { !it.value }

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "Antes de salir · ${vehiculo.plate}",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "Marca lo que NO está conforme",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    OutlinedTextField(
                        value = kilometraje,
                        onValueChange = { kilometraje = it.filter(Char::isDigit) },
                        label = { Text("Kilometraje del tablero") },
                        suffix = { Text("km") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(6.dp))

                    PUNTOS_PREOPERACIONAL.forEach { (clave, etiqueta) ->
                        val conforme = puntos[clave] ?: true
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(
                                    if (conforme) Color.Transparent
                                    else Semaforo.Urgente.copy(alpha = 0.08f),
                                    RoundedCornerShape(10.dp),
                                )
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                etiqueta,
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (conforme) MaterialTheme.colorScheme.onSurface
                                else Semaforo.Urgente,
                                modifier = Modifier.weight(1f),
                            )
                            Switch(
                                checked = conforme,
                                onCheckedChange = { puntos[clave] = it },
                            )
                        }
                    }

                    if (observados > 0) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = hallazgo,
                            onValueChange = { hallazgo = it },
                            label = { Text("Qué encontraste") },
                            placeholder = { Text("Llanta posterior derecha con poco labrado…") },
                            minLines = 2,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    error?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }

                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = alCerrar,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text("Cancelar") }

                    Button(
                        onClick = {
                            error = when {
                                kilometraje.isBlank() -> "Anota el kilometraje del tablero."
                                observados > 0 && hallazgo.isBlank() ->
                                    "Di qué encontraste en los $observados puntos observados."
                                else -> null
                            }
                            if (error == null) {
                                alRegistrar(
                                    puntos.toMap(),
                                    kilometraje.toIntOrNull(),
                                    hallazgo.ifBlank { null },
                                )
                            }
                        },
                        enabled = !guardando,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (guardando) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text(
                                if (observados > 0) "Registrar con $observados observado"
                                else "Todo conforme",
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun plazoDias(dias: Int?): String = when {
    dias == null -> "Sin fecha"
    dias < 0 -> if (dias == -1) "Venció ayer" else "Venció hace ${-dias} días"
    dias == 0 -> "Vence hoy"
    dias == 1 -> "Vence mañana"
    else -> "Faltan $dias días"
}

private fun colorDeDias(dias: Int?): Color = when {
    dias == null -> Semaforo.EnPlazo
    dias < 0 -> Semaforo.Vencido
    dias <= 7 -> Semaforo.Urgente
    dias <= 15 -> Semaforo.PorVencer
    dias <= 30 -> Marca.Verde
    else -> Semaforo.EnPlazo
}
