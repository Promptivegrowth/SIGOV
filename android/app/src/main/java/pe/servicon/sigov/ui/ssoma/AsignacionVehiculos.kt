package pe.servicon.sigov.ui.ssoma

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
private val MOTIVOS = listOf(
    "mantenimiento" to "Mantenimiento", "averia" to "Avería", "reparacion" to "Reparación",
    "cambio_temporal" to "Cambio temporal", "otro" to "Otro",
)

/**
 * El vehículo de reemplazo de un titular (SEG-V2-OBS-09/10): el único
 * camino para que entre otra unidad a la cuadrilla.
 *
 * Al escribir una placa que ya está en la flota, se completan el tipo, la
 * marca y el modelo. El motivo es obligatorio (si es «Otro», se escribe
 * cuál), la fecha de inicio es hoy salvo que se cambie, y el retorno del
 * titular cierra el reemplazo con su fecha.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DialogoVehiculoNuevo(
    titular: Vehiculo?,
    guardando: Boolean,
    error: String? = null,
    flota: List<Vehiculo> = emptyList(),
    alCerrar: () -> Unit,
    alGuardar: (placa: String, tipo: String, marca: String?, modelo: String?, motivo: String, km: Int, obs: String?, desde: java.time.LocalDate) -> Unit,
) {
    var placa by remember { mutableStateOf("") }
    var tipo by remember { mutableStateOf("camioneta") }
    var marca by remember { mutableStateOf("") }
    var modelo by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf<String?>(null) }
    var otroMotivo by remember { mutableStateOf("") }
    var km by remember { mutableStateOf("") }
    var obs by remember { mutableStateOf("") }
    var desde by remember { mutableStateOf(pe.servicon.sigov.datos.Peru.hoy()) }
    var calendario by remember { mutableStateOf(false) }
    val kmValido = km.toIntOrNull()?.let { it > 0 } == true
    val motivoValido = motivo != null && (motivo != "otro" || otroMotivo.isNotBlank())
    val listo = placa.trim().length >= 5 && kmValido && (titular == null || motivoValido)

    // La placa ya conocida: se completan sus datos (no se vuelven a digitar)
    val conocida = remember(placa, flota) {
        val p = placa.replace("-", "").trim()
        flota.firstOrNull { it.plate.replace("-", "").equals(p, ignoreCase = true) }
    }
    val sugerencias = remember(placa, flota) {
        val p = placa.replace("-", "").trim()
        if (p.length < 2 || conocida != null) emptyList()
        else flota.filter { it.plate.replace("-", "").contains(p, ignoreCase = true) && it.id != titular?.id }.take(4)
    }
    LaunchedEffect(conocida?.id) {
        conocida?.let { v ->
            tipo = v.kind
            marca = v.brand.orEmpty()
            modelo = v.model.orEmpty()
            v.kilometraje?.takeIf { km.isBlank() }?.let { km = it.toString() }
        }
    }

    if (calendario) {
        val hoy = pe.servicon.sigov.datos.Peru.hoy()
        val estadoFecha = rememberDatePickerState(
            initialSelectedDateMillis = desde.atStartOfDay().toInstant(java.time.ZoneOffset.UTC).toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    !java.time.Instant.ofEpochMilli(utcTimeMillis).atZone(java.time.ZoneOffset.UTC).toLocalDate().isAfter(hoy)
            },
        )
        DatePickerDialog(
            onDismissRequest = { calendario = false },
            confirmButton = {
                TextButton(onClick = {
                    estadoFecha.selectedDateMillis?.let { desde = java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate() }
                    calendario = false
                }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { calendario = false }) { Text("Cancelar") } },
        ) { DatePicker(state = estadoFecha) }
    }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(if (titular != null) "Reemplazo de ${titular.plate}" else "Vehículo de reemplazo") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    placa, { placa = it.uppercase().take(10) }, label = { Text("Placa del reemplazo") }, singleLine = true,
                    supportingText = conocida?.let { v -> { Text("De la flota: ${v.tipo}${v.brand?.let { " · $it" } ?: ""}${v.model?.let { " $it" } ?: ""}") } },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    modifier = Modifier.fillMaxWidth(),
                )
                sugerencias.forEach { v ->
                    TextButton(onClick = { placa = v.plate }) {
                        Text("${v.plate} · ${v.tipo}${v.brand?.let { " · $it" } ?: ""}")
                    }
                }
                Text("Tipo", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TIPOS.forEach { (k, v) -> FilterChip(selected = tipo == k, onClick = { tipo = k }, label = { Text(v) }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(marca, { marca = it }, label = { Text("Marca") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(modelo, { modelo = it }, label = { Text("Modelo") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                if (titular != null) {
                    Text("Motivo (obligatorio)", style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MOTIVOS.forEach { (k, v) -> FilterChip(selected = motivo == k, onClick = { motivo = k }, label = { Text(v) }) }
                    }
                    if (motivo == "otro") {
                        OutlinedTextField(otroMotivo, { otroMotivo = it }, label = { Text("¿Cuál?") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    }
                    OutlinedTextField(
                        value = desde.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Fecha de inicio") },
                        trailingIcon = { TextButton(onClick = { calendario = true }) { Text("Cambiar") } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    km, { v -> km = v.filter { it.isDigit() }.take(7) },
                    label = { Text("Kilometraje inicial") }, singleLine = true,
                    isError = km.isNotEmpty() && !kmValido,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(obs, { obs = it }, label = { Text("Observación (opcional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                if (titular != null && motivo == null) {
                    Text("Elige el motivo del reemplazo.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = listo && !guardando, onClick = {
                val nota = listOfNotNull(
                    otroMotivo.trim().takeIf { motivo == "otro" && it.isNotBlank() }?.let { "Motivo: $it" },
                    obs.trim().ifBlank { null },
                ).joinToString(" · ").ifBlank { null }
                alGuardar(placa.trim(), tipo, marca.trim().ifBlank { null }, modelo.trim().ifBlank { null },
                    motivo ?: "mantenimiento", km.toInt(), nota, desde)
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
