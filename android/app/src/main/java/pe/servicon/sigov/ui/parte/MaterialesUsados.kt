package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.datos.Consumo
import pe.servicon.sigov.datos.Insumo
import pe.servicon.sigov.datos.Numeros
import pe.servicon.sigov.datos.StockDeCuadrilla
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.ui.theme.Marca

/**
 * El material usado en el día (Formato 8, «salidas»; OBS-32 «recursos del
 * parte»). Se anota aquí, con la actividad en que se usó.
 */
@Composable
fun MaterialesUsados(
    consumos: List<Consumo>,
    alAgregar: () -> Unit,
    alQuitar: (Consumo) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Inventory2, contentDescription = null, tint = Marca.Azul, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Materiales usados", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = alAgregar) {
                    Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Anotar")
                }
            }
            if (consumos.isEmpty()) {
                Text(
                    "Anota el material que la cuadrilla usó hoy: pintura, emulsión, tachas…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }
            consumos.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(c.nombre, style = MaterialTheme.typography.bodyLarge)
                        c.actividad?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Text(
                        Numeros.tres(c.cantidad) + (c.unidad?.let { " $it" } ?: ""),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (!c.enviado) {
                        Icon(Icons.Outlined.CloudUpload, contentDescription = "Por enviar", tint = Marca.Naranja, modifier = Modifier.padding(start = 8.dp).size(18.dp))
                        IconButton(onClick = { alQuitar(c) }) { Icon(Icons.Outlined.Close, contentDescription = "Quitar") }
                    }
                }
            }
        }
    }
}

/**
 * Anotar un material: primero lo que la cuadrilla tiene (con su stock), y
 * si no está, el catálogo completo.
 */
@Composable
fun DialogoMaterialUsado(
    stock: List<StockDeCuadrilla>,
    insumos: List<Insumo>,
    registros: List<RegistroLocal>,
    alCerrar: () -> Unit,
    alGuardar: (insumoId: String, nombre: String, unidad: String?, cantidad: Double, registro: RegistroLocal?) -> Unit,
) {
    data class Opcion(val id: String, val nombre: String, val unidad: String?, val tiene: Double?)
    val opciones = remember(stock, insumos) {
        val propios = stock.filter { it.stock > 0 }.map { Opcion(it.insumoId, it.nombre, it.unidad, it.stock) }
        val ids = propios.map { it.id }.toSet()
        propios + insumos.filter { it.id !in ids }.map { Opcion(it.id, it.name, it.unidad, null) }
    }
    var buscar by remember { mutableStateOf("") }
    var elegido by remember { mutableStateOf<Opcion?>(null) }
    var cantidad by remember { mutableStateOf("") }
    var registro by remember { mutableStateOf<RegistroLocal?>(registros.singleOrNull()) }
    val sinTildes = { t: String -> java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase() }
    val filtradas = remember(buscar, opciones) {
        val t = sinTildes(buscar)
        opciones.filter { t.isBlank() || sinTildes(it.nombre).contains(t) }.take(40)
    }
    val qty = cantidad.replace(',', '.').toDoubleOrNull()

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Material usado") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (elegido == null) {
                    OutlinedTextField(
                        value = buscar, onValueChange = { buscar = it },
                        label = { Text("Buscar material") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    LazyColumn(Modifier.heightIn(max = 280.dp)) {
                        items(filtradas, key = { it.id }) { o ->
                            Column(Modifier.fillMaxWidth().clickable { elegido = o }.padding(vertical = 8.dp)) {
                                Text(o.nombre, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    o.tiene?.let { "La cuadrilla tiene ${Numeros.tres(it)} ${o.unidad.orEmpty()}" } ?: (o.unidad ?: ""),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (o.tiene != null) Marca.VerdeBandera else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            HorizontalDivider()
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(elegido!!.nombre, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            elegido!!.tiene?.let { Text("Tiene ${Numeros.tres(it)} ${elegido!!.unidad.orEmpty()}", style = MaterialTheme.typography.labelSmall) }
                        }
                        TextButton(onClick = { elegido = null }) { Text("Cambiar") }
                    }
                    OutlinedTextField(
                        value = cantidad,
                        onValueChange = { v -> cantidad = v.filter { it.isDigit() || it == '.' || it == ',' } },
                        label = { Text("Cantidad") },
                        suffix = { elegido!!.unidad?.let { Text(it) } },
                        supportingText = { Text("Hasta 3 decimales: 0,125") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (registros.isNotEmpty()) {
                        Text("¿En qué actividad?", style = MaterialTheme.typography.labelLarge)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            registros.forEach { r ->
                                FilterChip(
                                    selected = registro?.clientId == r.clientId,
                                    onClick = { registro = if (registro?.clientId == r.clientId) null else r },
                                    label = { Text(r.actividadNombre, maxLines = 1) },
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = elegido != null && qty != null && qty > 0,
                onClick = { elegido?.let { o -> alGuardar(o.id, o.nombre, o.unidad, qty!!, registro) } },
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
