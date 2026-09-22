package pe.servicon.sigov.ui.pci

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
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Verified
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
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Los requerimientos con plazo.
 *
 * Lo vencido arriba y en rojo. Es la pantalla que evita las penalidades: si
 * un ítem se pasa de fecha, el cliente descuenta, así que lo primero que se
 * ve es cuánto falta para que venza.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaPci(
    vm: PciViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var levantando by remember { mutableStateOf<ItemPci?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.error ?: estado.aviso)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
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

    ArmazonDeApartado(
        titulo = "PCIs",
        seccion = "Apartado 4.5",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Los requerimientos con plazo asignados a tu cuadrilla.",
        avisos = avisos,
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            if (estado.items.isNotEmpty()) {
                Filtros(
                    conteos = estado.conteos,
                    total = estado.items.size,
                    elegido = estado.filtro,
                    alElegir = vm::filtrar,
                )
            }

            when {
                estado.cargando -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                estado.error != null -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                estado.items.isEmpty() -> Column(
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
                    Text("Ningún PCI pendiente", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Tu cuadrilla no tiene requerimientos abiertos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(estado.visibles, key = { it.id }) { item ->
                        Requerimiento(
                            item = item,
                            ocupado = estado.trabajando == item.id,
                            alIniciar = { vm.iniciarAtencion(item) },
                            alLevantar = { levantando = item },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Filtros(
    conteos: Map<Urgencia, Int>,
    total: Int,
    elegido: Urgencia?,
    alElegir: (Urgencia?) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(
            selected = elegido == null,
            onClick = { alElegir(null) },
            label = { Text("Todos · $total") },
        )
        Urgencia.entries.forEach { urgencia ->
            val cuantos = conteos[urgencia] ?: 0
            if (cuantos > 0) {
                FilterChip(
                    selected = elegido == urgencia,
                    onClick = { alElegir(if (elegido == urgencia) null else urgencia) },
                    label = { Text("${urgencia.etiqueta} · $cuantos") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = colorDe(urgencia).copy(alpha = 0.16f),
                        selectedLabelColor = colorDe(urgencia),
                    ),
                )
            }
        }
    }
}

@Composable
private fun Requerimiento(
    item: ItemPci,
    ocupado: Boolean = false,
    alIniciar: () -> Unit = {},
    alLevantar: () -> Unit = {},
) {
    val urgencia = urgenciaDe(item)
    val color = colorDe(urgencia)

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            // La banda del semáforo: el estado del plazo se ve de reojo
            Box(Modifier.width(5.dp).fillMaxHeight().background(color))

            Column(Modifier.padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            listOfNotNull(item.pciCodigo, item.numero?.let { "ítem $it" })
                                .joinToString(" · "),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            item.description ?: item.actividad ?: "Requerimiento sin descripción",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        plazo(item),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = color,
                    )
                }

                Spacer(Modifier.height(6.dp))
                Text(
                    listOfNotNull(
                        item.tramo,
                        Progresiva.rango(item.progresiva, item.progresivaFin),
                        item.side?.let { "lado $it" },
                    ).joinToString(" · ").ifBlank { "Sin ubicación indicada" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (item.exigeEvidencia) {
                    Spacer(Modifier.height(12.dp))
                    // No basta con tener fotos: la del «después» es la que
                    // sustenta el levantamiento ante el cliente, y es la que
                    // el servidor exige. Se dice cuál falta, no cuántas hay.
                    val listo = item.puedeLevantarse
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .background(
                                (if (listo) Marca.VerdeBandera else Marca.Naranja).copy(alpha = 0.10f),
                                RoundedCornerShape(10.dp),
                            )
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Icon(
                            Icons.Outlined.PhotoCamera,
                            contentDescription = null,
                            tint = if (listo) Marca.VerdeBandera else Marca.Naranja,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            when {
                                item.fotosDespues > 0 ->
                                    "Antes ${item.fotosAntes} · después ${item.fotosDespues}"
                                item.fotosAntes > 0 ->
                                    "Falta la foto del después"
                                else ->
                                    "Sin evidencia · hace falta antes y después"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (listo) Marca.VerdeBandera else Marca.Naranja,
                        )
                    }
                }

                // Lo que se puede hacer ahora. Un ítem levantado ya no ofrece
                // nada: lo siguiente lo decide el cliente.
                if (!item.estaLevantado) {
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (item.estaPendiente) {
                            BotonPci("Iniciar atención", Icons.Outlined.PlayArrow, Marca.Azul,
                                ocupado, true, Modifier.weight(1f), alIniciar)
                        } else {
                            BotonPci("Dar por levantado", Icons.Outlined.Verified,
                                Marca.VerdeBandera, ocupado, item.puedeLevantarse,
                                Modifier.weight(1f), alLevantar)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BotonPci(
    texto: String,
    icono: androidx.compose.ui.graphics.vector.ImageVector,
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
        // 48 dp de alto: en obra se toca con guantes
        modifier = modifier.height(48.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
    ) {
        if (ocupado) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = color)
        } else {
            Icon(icono, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(texto, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/**
 * El cierre de un ítem, con su nota.
 *
 * La nota no es obligatoria pero se ofrece: cuando el cliente rechaza un
 * levantamiento, lo primero que se busca es qué dijo quien lo cerró.
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
        title = { Text("¿Dar por levantado?") },
        text = {
            Column {
                Text(
                    item.description ?: "Este requerimiento",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Antes ${item.fotosAntes} · después ${item.fotosDespues}",
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
                Text("Levantar")
            }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

/** El plazo dicho como lo diría un capataz, no como una fecha. */
private fun plazo(item: ItemPci): String = when (val dias = item.diasRestantes) {
    null -> "Sin plazo"
    0 -> "Vence hoy"
    1 -> "Vence mañana"
    in Int.MIN_VALUE..-1 -> if (dias == -1) "Venció ayer" else "Venció hace ${-dias} días"
    else -> "Faltan $dias días"
}

private fun colorDe(urgencia: Urgencia): Color = when (urgencia) {
    Urgencia.VENCIDO -> Semaforo.Vencido
    Urgencia.CRITICO -> Semaforo.Urgente
    Urgencia.ATENCION -> Semaforo.PorVencer
    Urgencia.NORMAL -> Semaforo.EnPlazo
}
