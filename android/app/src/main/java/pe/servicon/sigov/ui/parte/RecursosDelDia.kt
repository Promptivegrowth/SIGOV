package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.datos.Numeros
import pe.servicon.sigov.datos.RecursoDelDia
import pe.servicon.sigov.ui.theme.Marca

/**
 * Los equipos y los otros recursos del día: secciones IV y V del reporte
 * diario FOR:001 (compactadora, cortadora, herramientas, EPC…).
 */
@Composable
fun RecursosDelDia(
    recursos: List<RecursoDelDia>,
    editable: Boolean,
    alAgregar: () -> Unit,
    alQuitar: (RecursoDelDia) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Construction, contentDescription = null, tint = Marca.Azul, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Equipos y otros recursos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (editable) {
                    TextButton(onClick = alAgregar) {
                        Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Anotar")
                    }
                }
            }
            if (recursos.isEmpty()) {
                Text(
                    "Anota los equipos (compactadora, cortadora…) y las herramientas o EPC que usó la cuadrilla hoy.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }
            recursos.forEach { r ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            listOfNotNull(r.codigo, r.descripcion).joinToString(" · "),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            listOfNotNull(if (r.tipo == "equipo") "Equipo" else "Otro recurso", r.observacion).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    r.cantidad?.let {
                        Text(
                            Numeros.tres(it) + (r.unidad?.let { u -> " $u" } ?: ""),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (!r.enviado) {
                        Icon(Icons.Outlined.CloudUpload, contentDescription = "Por enviar", tint = Marca.Naranja, modifier = Modifier.padding(start = 8.dp).size(18.dp))
                        IconButton(onClick = { alQuitar(r) }) { Icon(Icons.Outlined.Close, contentDescription = "Quitar") }
                    }
                }
            }
        }
    }
}

/** Anotar un equipo o un recurso. */
@Composable
fun DialogoRecurso(
    alCerrar: () -> Unit,
    alGuardar: (tipo: String, codigo: String?, descripcion: String, unidad: String?, cantidad: Double?, observacion: String?) -> Unit,
) {
    var tipo by remember { mutableStateOf("equipo") }
    var codigo by remember { mutableStateOf("") }
    var descripcion by remember { mutableStateOf("") }
    var unidad by remember { mutableStateOf("und") }
    var cantidad by remember { mutableStateOf("1") }
    var observacion by remember { mutableStateOf("") }
    val qty = cantidad.replace(',', '.').toDoubleOrNull()

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Equipo o recurso") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = tipo == "equipo", onClick = { tipo = "equipo" }, label = { Text("Equipo") })
                    FilterChip(selected = tipo == "otro", onClick = { tipo = "otro" }, label = { Text("Herramienta, EPC…") })
                }
                OutlinedTextField(
                    value = descripcion, onValueChange = { descripcion = it },
                    label = { Text(if (tipo == "equipo") "Descripción del equipo" else "Descripción") },
                    placeholder = { Text(if (tipo == "equipo") "Compactadora tipo plancha" else "Conos de seguridad") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (tipo == "equipo") {
                        OutlinedTextField(
                            value = codigo, onValueChange = { codigo = it },
                            label = { Text("Código") }, singleLine = true, modifier = Modifier.weight(1f),
                        )
                    }
                    OutlinedTextField(
                        value = unidad, onValueChange = { unidad = it },
                        label = { Text("Und") }, singleLine = true, modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = cantidad,
                        onValueChange = { v -> cantidad = v.filter { it.isDigit() || it == '.' || it == ',' } },
                        label = { Text("Cant.") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
                if (tipo == "otro") {
                    OutlinedTextField(
                        value = observacion, onValueChange = { observacion = it },
                        label = { Text("Observación") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = descripcion.isNotBlank() && (cantidad.isBlank() || qty != null),
                onClick = {
                    alGuardar(
                        tipo,
                        codigo.takeIf { tipo == "equipo" },
                        descripcion,
                        unidad,
                        qty,
                        observacion.takeIf { tipo == "otro" },
                    )
                },
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
