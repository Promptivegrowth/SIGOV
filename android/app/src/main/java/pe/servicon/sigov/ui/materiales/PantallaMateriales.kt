package pe.servicon.sigov.ui.materiales

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Insumo
import pe.servicon.sigov.datos.Pedido
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.util.Locale

/**
 * Materiales del almacén.
 *
 * Dos pestañas: lo que hay y lo que se pidió. Ver el stock antes de salir
 * evita el viaje perdido, y el pedido queda con fecha y motivo en vez de en
 * un mensaje que después nadie encuentra.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaMateriales(
    vm: MaterialesViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var pestana by remember { mutableIntStateOf(0) }
    var pidiendo by remember { mutableStateOf(false) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Materiales",
        seccion = "Apartado 4.10",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Consulta el almacén y solicita insumos para la semana.",
        avisos = avisos,
        botonFlotante = {
            if (estado.enCanasta > 0) {
                ExtendedFloatingActionButton(
                    onClick = { pidiendo = true },
                    containerColor = Marca.Verde,
                    contentColor = Color.White,
                    icon = { Icon(Icons.Outlined.Send, contentDescription = null) },
                    text = {
                        Text(
                            "Pedir ${estado.enCanasta} insumo" + if (estado.enCanasta == 1) "" else "s",
                            fontWeight = FontWeight.SemiBold,
                        )
                    },
                )
            }
        },
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            TabRow(selectedTabIndex = pestana, containerColor = MaterialTheme.colorScheme.surface) {
                Tab(
                    selected = pestana == 0,
                    onClick = { pestana = 0 },
                    text = { Text("En almacén") },
                )
                Tab(
                    selected = pestana == 1,
                    onClick = { pestana = 1 },
                    text = {
                        Text(
                            "Mis pedidos" +
                                if (estado.todosLosPedidos.isNotEmpty()) " · ${estado.todosLosPedidos.size}" else ""
                        )
                    },
                )
            }

            when {
                estado.cargando -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                estado.error != null && estado.insumos.isEmpty() -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                pestana == 0 -> Almacen(estado, vm)

                else -> Pedidos(estado)
            }
        }
    }

    if (pidiendo) {
        FormularioPedido(
            renglones = estado.canasta.size,
            guardando = estado.guardando,
            alCerrar = { pidiendo = false },
            alEnviar = { paraCuando, motivo ->
                vm.enviarPedido(paraCuando, motivo) { pidiendo = false }
            },
        )
    }
}

@Composable
private fun Almacen(estado: EstadoMateriales, vm: MaterialesViewModel) {
    Column {
        OutlinedTextField(
            value = estado.busqueda,
            onValueChange = vm::buscar,
            placeholder = { Text("Buscar insumo por nombre o código") },
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
            modifier = Modifier.fillMaxWidth().padding(16.dp, 12.dp, 16.dp, 4.dp),
        )

        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = estado.categoria == null,
                onClick = { vm.filtrarPor(null) },
                label = { Text("Todo") },
            )
            estado.categorias.forEach { categoria ->
                FilterChip(
                    selected = estado.categoria == categoria,
                    onClick = { vm.filtrarPor(if (estado.categoria == categoria) null else categoria) },
                    label = { Text(categoria) },
                )
            }
        }

        LazyColumn(
            contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(estado.visibles, key = { it.id }) { insumo ->
                FilaInsumo(
                    insumo = insumo,
                    cantidad = estado.canasta[insumo.id] ?: 0.0,
                    alCambiar = { vm.poner(insumo, it) },
                )
            }
        }
    }
}

@Composable
private fun FilaInsumo(insumo: Insumo, cantidad: Double, alCambiar: (Double) -> Unit) {
    var texto by remember(insumo.id, cantidad == 0.0) {
        mutableStateOf(if (cantidad > 0) cifra(cantidad) else "")
    }

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        insumo.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        insumo.code,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        cifra(insumo.disponible) + (insumo.unidad?.let { " $it" } ?: ""),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (insumo.escaso) Semaforo.Urgente else Marca.Azul,
                    )
                    Text(
                        if (insumo.committed > 0) {
                            "de ${cifra(insumo.stock)} · ${cifra(insumo.committed)} comprometido"
                        } else {
                            "disponible"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (insumo.escaso) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Por debajo del mínimo · avisa al residente",
                    style = MaterialTheme.typography.bodySmall,
                    color = Semaforo.Urgente,
                    modifier = Modifier
                        .background(Semaforo.Urgente.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }

            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = texto,
                onValueChange = { nuevo ->
                    texto = nuevo
                    alCambiar(nuevo.replace(",", ".").toDoubleOrNull() ?: 0.0)
                },
                label = { Text("Cuánto necesitas") },
                placeholder = { Text("0") },
                suffix = { insumo.unidad?.let { Text(it) } },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal,
                ),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun Pedidos(estado: EstadoMateriales) {
    if (estado.todosLosPedidos.isEmpty()) {
        Column(
            Modifier.fillMaxSize().padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Outlined.Inventory2,
                contentDescription = null,
                modifier = Modifier.size(44.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Text("Sin pedidos", style = MaterialTheme.typography.titleMedium)
            Text(
                "Marca lo que necesitas en «En almacén» y envíalo.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 96.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(estado.todosLosPedidos, key = { it.id }) { FilaPedido(it) }
    }
}

@Composable
private fun FilaPedido(pedido: Pedido) {
    val (etiqueta, color) = when (pedido.status) {
        "en_cola" -> "Esperando señal" to Marca.Naranja
        "solicitado" -> "Esperando al residente" to Marca.Naranja
        "aprobado" -> "Aprobado" to Semaforo.EnPlazo
        "parcial" -> "Entregado en parte" to Semaforo.PorVencer
        "entregado" -> "Entregado" to Marca.VerdeBandera
        "rechazado" -> "Rechazado" to Semaforo.Vencido
        "anulado" -> "Anulado" to Semaforo.Vencido
        else -> pedido.status to MaterialTheme.colorScheme.onSurfaceVariant
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
                        pedido.code ?: "Pedido sin número",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            "para el ${pedido.paraCuando}",
                            "${pedido.renglones} insumo" + if (pedido.renglones == 1) "" else "s",
                            pedido.actividad,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    etiqueta,
                    style = MaterialTheme.typography.labelMedium,
                    color = color,
                    modifier = Modifier
                        .background(color.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }

            pedido.reason?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "«$it»",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            pedido.respuesta?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Semaforo.PorVencer,
                )
            }
        }
    }
}

/** Fecha y motivo: sin eso el almacén no sabe para cuándo ni para qué. */
@Composable
private fun FormularioPedido(
    renglones: Int,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alEnviar: (paraCuando: String, motivo: String) -> Unit,
) {
    var paraCuando by remember { mutableStateOf(pe.servicon.sigov.datos.Peru.hoy().plusDays(2).toString()) }
    var motivo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Enviar pedido") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "$renglones insumo" + (if (renglones == 1) "" else "s") +
                        ". El residente lo aprueba desde la web.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = paraCuando,
                    onValueChange = { paraCuando = it },
                    label = { Text("Para cuándo") },
                    placeholder = { Text("2026-09-24") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = { Text("Para qué") },
                    placeholder = { Text("Sellado de fisuras en Camaná – La Joya") },
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !guardando,
                onClick = {
                    error = when {
                        !Regex("""^\d{4}-\d{2}-\d{2}$""").matches(paraCuando.trim()) ->
                            "La fecha va como 2026-09-24."
                        motivo.isBlank() -> "Di para qué partida es el material."
                        else -> null
                    }
                    if (error == null) alEnviar(paraCuando.trim(), motivo.trim())
                },
            ) { Text("Enviar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

private fun cifra(valor: Double): String =
    if (valor % 1.0 == 0.0) valor.toLong().toString()
    else String.format(Locale("es", "PE"), "%.1f", valor)
