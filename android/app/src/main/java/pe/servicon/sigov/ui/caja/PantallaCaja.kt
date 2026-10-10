package pe.servicon.sigov.ui.caja

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Caja
import pe.servicon.sigov.datos.ESTADOS_DE_DEPOSITO
import pe.servicon.sigov.datos.Movimiento
import pe.servicon.sigov.datos.PedidoDeDeposito
import pe.servicon.sigov.datos.Peru
import java.time.format.DateTimeFormatter
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.util.Locale

/**
 * Mi caja.
 *
 * Cuánto queda, en qué se fue y —cuando se está acabando— el botón para pedir
 * depósito. Todo lo que aquí se anota queda con fecha, rubro y comprobante,
 * que es justo lo que después falta a la hora de rendir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaCaja(
    vm: CajaViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var formularioAbierto by remember { mutableStateOf(false) }
    var solicitudAbierta by remember { mutableStateOf(false) }
    var corrigiendo by remember { mutableStateOf<PedidoDeDeposito?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Mi Caja",
        seccion = "Apartado 4.7",
        alVolver = alVolver,
        cuadrilla = estado.caja?.cuadrilla,
        ayuda = "Gestiona la caja operativa de tu cuadrilla.",
        avisos = avisos,
        botonFlotante = {
            if (estado.caja != null) {
                ExtendedFloatingActionButton(
                    onClick = { formularioAbierto = true },
                    containerColor = Marca.Verde,
                    contentColor = Color.White,
                    icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                    text = { Text("Anotar gasto", fontWeight = FontWeight.SemiBold) },
                )
            }
        },
    ) { relleno ->
        when {
            estado.cargando -> Box(
                Modifier.fillMaxSize().padding(relleno),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            estado.caja == null -> Box(
                Modifier.fillMaxSize().padding(relleno).padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    estado.error ?: "No se pudo abrir tu caja.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }

            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(relleno),
                contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Saldo(estado, alPedirDeposito = { solicitudAbierta = true }) }

                // OBS-41: lo pedido no desaparece con el aviso; queda aquí con su estado
                if (estado.solicitudes.isNotEmpty()) {
                    item {
                        Text(
                            "MIS SOLICITUDES DE DEPÓSITO",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    items(estado.solicitudes, key = { "dep-" + it.id }) { pedido ->
                        SolicitudFila(pedido, alCorregir = { corrigiendo = pedido })
                    }
                }

                if (estado.todos.isEmpty()) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Outlined.ReceiptLong,
                                contentDescription = null,
                                modifier = Modifier.size(44.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("Sin movimientos", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Anota el primer gasto con su boleta.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    item {
                        Text(
                            "Movimientos",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    items(estado.todos, key = { it.id }) { MovimientoFila(it) }
                }
            }
        }
    }

    if (formularioAbierto) {
        FormularioGasto(
            montoMinimoComprobante = estado.montoMinimoComprobante,
            guardando = estado.guardando,
            alCerrar = { formularioAbierto = false },
            alGuardar = { importe, rubro, detalle, proveedor, ruc, tipo, numero, foto ->
                vm.registrarGasto(importe, rubro, detalle, proveedor, ruc, tipo, numero, foto) {
                    formularioAbierto = false
                }
            },
        )
    }

    if (solicitudAbierta) {
        SolicitudDeposito(
            sugerido = estado.caja?.let { (it.saldoMinimo * 5).coerceAtLeast(500.0) } ?: 500.0,
            guardando = estado.guardando,
            alCerrar = { solicitudAbierta = false },
            alEnviar = { importe, motivo, prioridad ->
                vm.pedirDeposito(importe, motivo, prioridad) { solicitudAbierta = false }
            },
        )
    }

    corrigiendo?.let { pedido ->
        SolicitudDeposito(
            sugerido = pedido.amount,
            guardando = estado.guardando,
            alCerrar = { corrigiendo = null },
            alEnviar = { importe, motivo, prioridad ->
                vm.corregirDeposito(pedido, importe, motivo, prioridad) { corrigiendo = null }
            },
            motivoInicial = pedido.reason,
            prioridadInicial = pedido.priority,
            observacion = pedido.nota,
            corrigiendo = true,
        )
    }
}

/** El color de cada estado: lo que espera respuesta en naranja, lo cerrado en verde o rojo. */
@Composable
private fun colorDeSolicitud(estado: String): Color = when (estado) {
    "depositado" -> Marca.VerdeBandera
    "aprobado", "en_evaluacion" -> Marca.Azul
    "observado" -> Semaforo.PorVencer
    "rechazado" -> Semaforo.Vencido
    "en_cola", "corrigiendo", "solicitado" -> Marca.Naranja
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

@Composable
private fun SolicitudFila(pedido: PedidoDeDeposito, alCorregir: () -> Unit) {
    val tono = colorDeSolicitud(pedido.status)
    val fecha = runCatching {
        java.time.OffsetDateTime.parse(pedido.creado.replace(" ", "T"))
            .atZoneSameInstant(Peru.zona).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
    }.getOrElse {
        runCatching {
            java.time.Instant.parse(pedido.creado).atZone(Peru.zona)
                .format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
        }.getOrDefault(pedido.creado.take(10))
    }

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
                    Text(pedido.reason, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        listOfNotNull(fecha, pedido.paraCuando?.let { "para el $it" }).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(soles(pedido.amount), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    pedido.montoAprobado?.takeIf { it != pedido.amount }?.let {
                        Text(
                            (if (pedido.status == "depositado") "depositado " else "aprobado ") + soles(it),
                            style = MaterialTheme.typography.labelSmall,
                            color = tono,
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Etiqueta(ESTADOS_DE_DEPOSITO[pedido.status] ?: pedido.status, tono)
                Etiqueta(
                    if (pedido.urgente) "Urgente" else "Normal",
                    if (pedido.urgente) Semaforo.Urgente else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val detalle = listOfNotNull(
                pedido.nota?.takeIf { pedido.status != "solicitado" && pedido.status != "corrigiendo" },
                pedido.operacion?.let { "Operación $it" },
            )
            if (detalle.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    detalle.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (pedido.status == "observado" || pedido.status == "rechazado") tono
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (pedido.corregible) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = alCorregir, shape = RoundedCornerShape(10.dp)) { Text("Corregir y reenviar") }
            }
        }
    }
}

@Composable
private fun Etiqueta(texto: String, tono: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = tono,
        modifier = Modifier
            .background(tono.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

@Composable
private fun Saldo(estado: EstadoCaja, alPedirDeposito: () -> Unit) {
    val caja = estado.caja ?: return
    val color = if (estado.saldoBajo) Semaforo.Urgente else Marca.Azul

    Surface(
        color = color.copy(alpha = 0.07f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                "SALDO DISPONIBLE",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                soles(estado.saldo),
                style = MaterialTheme.typography.displaySmall,
                color = color,
            )

            val notas = listOfNotNull(
                estado.enCola.size.takeIf { it > 0 }?.let { "$it esperando señal" },
                caja.porRevisar.takeIf { it > 0 }?.let { "$it por revisar" },
                caja.observed.takeIf { it > 0 }?.let { "$it observado" },
            )
            if (notas.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    notas.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (estado.saldoBajo) {
                Spacer(Modifier.height(14.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .background(Semaforo.Urgente.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Icon(
                        Icons.Outlined.WarningAmber,
                        contentDescription = null,
                        tint = Semaforo.Urgente,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        "Te estás quedando sin fondo",
                        style = MaterialTheme.typography.bodySmall,
                        color = Semaforo.Urgente,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            OutlinedButton(
                onClick = alPedirDeposito,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Icon(
                    Icons.Outlined.AccountBalance,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text("Pedir depósito")
            }
        }
    }
}

@Composable
private fun MovimientoFila(movimiento: Movimiento) {
    val entra = movimiento.importeConSigno >= 0
    val color = when (movimiento.status) {
        "observado" -> Semaforo.PorVencer
        "anulado" -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> if (entra) Marca.VerdeBandera else Marca.Azul
    }

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
                        movimiento.description,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            movimiento.fecha,
                            movimiento.category,
                            movimiento.supplier,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    (if (entra) "+" else "−") + soles(kotlin.math.abs(movimiento.importeConSigno)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = color,
                )
            }

            val avisos = buildList {
                if (movimiento.kind == "gasto" && movimiento.rutaFoto == null) {
                    add("Sin comprobante adjunto" to Semaforo.Urgente)
                }
                when (movimiento.status) {
                    "en_cola" -> add("Esperando señal" to Marca.Naranja)
                    "registrado" -> add("Por revisar" to Marca.Naranja)
                    "observado" -> add(
                        (movimiento.observacion ?: "Observado por administración") to Semaforo.PorVencer
                    )
                    "anulado" -> add("Anulado" to Semaforo.Vencido)
                }
            }

            avisos.forEach { (texto, tono) ->
                Spacer(Modifier.height(8.dp))
                Text(
                    texto,
                    style = MaterialTheme.typography.bodySmall,
                    color = tono,
                    modifier = Modifier
                        .background(tono.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }
        }
    }
}

/** En soles y con dos decimales, como se rinde. */
internal fun soles(monto: Double): String =
    "S/ " + String.format(Locale("es", "PE"), "%,.2f", monto)
