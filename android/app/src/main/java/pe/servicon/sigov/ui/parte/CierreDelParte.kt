package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.datos.local.ParteLocal
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/** El estado del parte dicho en palabras. */
fun estadoDelParte(estado: String?): String = when (estado) {
    "borrador" -> "En borrador"
    "enviado" -> "Enviado · por validar"
    "validado" -> "Validado"
    "observado" -> "Observado"
    else -> estado ?: "—"
}

val ParteLocal.editable: Boolean get() = estado == "borrador" || estado == "observado"

/**
 * Los datos del día que van en la cabecera del reporte (OBS-27/33): clima,
 * horario y personal. Se ven de un vistazo y se corrigen con un toque.
 */
@Composable
fun DatosDelDia(parte: ParteLocal, alEditar: () -> Unit) {
    Card(
        onClick = alEditar,
        enabled = parte.editable,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface, disabledContainerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.WbSunny, contentDescription = null, tint = Marca.Naranja)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Datos del día", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                val falta = parte.clima == null || parte.horaInicio == null || parte.personal == null
                Text(
                    listOfNotNull(
                        parte.clima,
                        listOfNotNull(parte.horaInicio, parte.horaFin).joinToString(" a ").ifBlank { null },
                        parte.personal?.let { "$it personas" },
                    ).joinToString(" · ").ifBlank { "Clima, horario y personal" },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (falta && parte.editable) Marca.Naranja else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (parte.editable) Text("Editar", color = Marca.Azul, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun DialogoDatosDelDia(
    parte: ParteLocal,
    alCerrar: () -> Unit,
    alGuardar: (clima: String?, inicio: String?, fin: String?, personal: Int?, notas: String?) -> Unit,
) {
    val climas = listOf("Soleado", "Nublado", "Lluvia", "Viento fuerte", "Neblina")
    var clima by remember { mutableStateOf(parte.clima) }
    var inicio by remember { mutableStateOf(parte.horaInicio ?: "07:00") }
    var fin by remember { mutableStateOf(parte.horaFin ?: "16:00") }
    var personal by remember { mutableStateOf(parte.personal?.toString() ?: "") }
    var notas by remember { mutableStateOf(parte.notas ?: "") }
    val hora = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
    val valido = (inicio.isBlank() || hora.matches(inicio)) && (fin.isBlank() || hora.matches(fin))

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Datos del día") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Clima", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    climas.forEach { c ->
                        FilterChip(selected = clima == c, onClick = { clima = if (clima == c) null else c }, label = { Text(c) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(inicio, { inicio = it.take(5) }, label = { Text("Inicio") }, placeholder = { Text("07:00") },
                        singleLine = true, isError = inicio.isNotBlank() && !hora.matches(inicio), modifier = Modifier.weight(1f))
                    OutlinedTextField(fin, { fin = it.take(5) }, label = { Text("Fin") }, placeholder = { Text("16:00") },
                        singleLine = true, isError = fin.isNotBlank() && !hora.matches(fin), modifier = Modifier.weight(1f))
                }
                OutlinedTextField(
                    personal, { v -> personal = v.filter { it.isDigit() }.take(3) },
                    label = { Text("Personal en campo") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(notas, { notas = it }, label = { Text("Notas del día (opcional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(enabled = valido, onClick = {
                alGuardar(clima, inicio.ifBlank { null }, fin.ifBlank { null }, personal.toIntOrNull(), notas.trim().ifBlank { null })
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

/** Lo que observó el supervisor: el jefe corrige y vuelve a enviar. */
@Composable
fun ObservacionDelSupervisor(nota: String) {
    Row(
        Modifier.fillMaxWidth().background(Semaforo.Vencido.copy(alpha = 0.08f), RoundedCornerShape(12.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = Semaforo.Vencido)
        Column {
            Text("Observado por el supervisor", style = MaterialTheme.typography.labelLarge, color = Semaforo.Vencido)
            Text(nota, style = MaterialTheme.typography.bodyMedium)
            Text("Corrige y vuelve a enviar el reporte.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Cerrar el día y mandarlo al supervisor (OBS-34). */
@Composable
fun BotonEnviar(reenviar: Boolean, alTocar: () -> Unit) {
    Button(
        onClick = alTocar,
        modifier = Modifier.fillMaxWidth().height(54.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Marca.Azul),
    ) {
        Icon(Icons.Outlined.Send, contentDescription = null)
        Spacer(Modifier.width(8.dp))
        Text(if (reenviar) "Corregido: volver a enviar" else "Cerrar y enviar al supervisor", fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun DialogoEnviar(registros: Int, sinFotos: Int, faltanDatos: Boolean, alCerrar: () -> Unit, alEnviar: () -> Unit) {
    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("¿Cerrar y enviar el reporte?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("$registros actividad(es) registradas.")
                if (sinFotos > 0) Text("$sinFotos actividad(es) sin foto.", color = Marca.Naranja)
                if (faltanDatos) Text("Faltan los datos del día (clima, horario o personal).", color = Marca.Naranja)
                Text(
                    "Después de enviarlo ya no podrás agregar actividades, salvo que el supervisor lo observe.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { TextButton(onClick = alEnviar) { Text("Enviar") } },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
