package pe.servicon.sigov.ui.ssoma

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.datos.Vehiculo

private val TIPOS = listOf("camioneta" to "Camioneta", "volquete" to "Volquete", "cisterna" to "Cisterna", "moto" to "Moto", "otro" to "Otro")
private val MOTIVOS = listOf("mantenimiento" to "Mantenimiento", "averia" to "Avería", "reparacion" to "Reparación", "cambio_temporal" to "Cambio temporal")

/**
 * El vehículo que entra: de reemplazo de un titular (OBS-71) o temporal
 * (OBS-72). Datos mínimos del consolidado: placa, tipo, marca/modelo,
 * motivo, kilometraje inicial y observación. La fecha de inicio es hoy.
 */
@Composable
fun DialogoVehiculoNuevo(
    titular: Vehiculo?,
    guardando: Boolean,
    error: String? = null,
    alCerrar: () -> Unit,
    alGuardar: (placa: String, tipo: String, marca: String?, modelo: String?, motivo: String, km: Int, obs: String?) -> Unit,
) {
    var placa by remember { mutableStateOf("") }
    var tipo by remember { mutableStateOf("camioneta") }
    var marca by remember { mutableStateOf("") }
    var modelo by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("mantenimiento") }
    var km by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    val kmValido = km.toIntOrNull()?.let { it > 0 } == true
    val listo = placa.trim().length >= 5 && kmValido

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(if (titular != null) "Reemplazo de ${titular.plate}" else "Vehículo temporal") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (titular == null) {
                    Text(
                        "Queda asignado a tu cuadrilla desde hoy. El supervisor lo valida para incorporarlo al inventario.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedTextField(
                    placa, { placa = it.uppercase().take(10) }, label = { Text("Placa") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Tipo", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TIPOS.forEach { (k, v) -> FilterChip(selected = tipo == k, onClick = { tipo = k }, label = { Text(v) }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(marca, { marca = it }, label = { Text("Marca") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(modelo, { modelo = it }, label = { Text("Modelo") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                if (titular != null) {
                    Text("Motivo", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MOTIVOS.forEach { (k, v) -> FilterChip(selected = motivo == k, onClick = { motivo = k }, label = { Text(v) }) }
                    }
                }
                OutlinedTextField(
                    km, { v -> km = v.filter { it.isDigit() }.take(7) },
                    label = { Text("Kilometraje inicial") }, singleLine = true,
                    isError = km.isNotEmpty() && !kmValido,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(obs, { obs = it }, label = { Text("Observación (opcional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = listo && !guardando, onClick = {
                alGuardar(placa.trim(), tipo, marca.trim().ifBlank { null }, modelo.trim().ifBlank { null }, motivo, km.toInt(), obs.trim().ifBlank { null })
            }) { Text(if (guardando) "Guardando…" else "Registrar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

/** El titular vuelve: se cierra el reemplazo con su kilometraje final. */
@Composable
fun DialogoDevolverTitular(reemplazo: Vehiculo, guardando: Boolean, error: String?, alCerrar: () -> Unit, alConfirmar: (Int?) -> Unit) {
    var km by remember { mutableStateOf("") }
    val minimo = reemplazo.kmInicialAsignacion
    val menor = km.toIntOrNull()?.let { minimo != null && it < minimo } == true
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("¿Volvió ${reemplazo.reemplazaA ?: "el titular"}?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Se cierra el uso de ${reemplazo.plate} en tu cuadrilla y el titular vuelve a quedar asignado.")
                OutlinedTextField(
                    km, { v -> km = v.filter { it.isDigit() }.take(7) },
                    label = { Text("Kilometraje final de ${reemplazo.plate}") }, singleLine = true,
                    isError = menor,
                    supportingText = { minimo?.let { Text(if (menor) "No puede ser menor que el inicial (${"%,d".format(it)})" else "Inicial: ${"%,d".format(it)}") } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                // El error va dentro del diálogo: el aviso de abajo queda tapado
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = { TextButton(enabled = !guardando && !menor, onClick = { alConfirmar(km.toIntOrNull()) }) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
