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
import pe.servicon.sigov.datos.TiposDeRecurso
import pe.servicon.sigov.datos.consolidarRecursos
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
            // Consolidado (OBS 3): el equipo es su cantidad física y sus horas
            // sumadas; el material, la suma de lo usado
            consolidarRecursos(recursos).forEach { r ->
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
                            listOfNotNull(
                                TiposDeRecurso.nombre(r.tipo),
                                r.horas?.let { "Uso total: ${Numeros.tres(it)} h" },
                                "En ${r.actividades} actividades".takeIf { r.actividades > 1 },
                                r.detalle, r.observacion,
                            ).joinToString(" · "),
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
                        if (r.actividades == 1) recursos.firstOrNull { it.clientId == r.clientIds.first() }?.let { uno ->
                            IconButton(onClick = { alQuitar(uno) }) { Icon(Icons.Outlined.Close, contentDescription = "Quitar") }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Anotar un equipo, una herramienta, EPP/EPC o un material (OBS 3): el equipo
 * lleva su cantidad física y las horas de uso en la actividad; la
 * herramienta, sus horas o su % de participación cuando corresponde.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DialogoRecurso(
    alCerrar: () -> Unit,
    alGuardar: (EquipoDelRegistro) -> Unit,
) {
    var tipo by remember { mutableStateOf("equipo") }
    var codigo by remember { mutableStateOf("") }
    var descripcion by remember { mutableStateOf("") }
    var unidad by remember { mutableStateOf("und") }
    var cantidad by remember { mutableStateOf("1") }
    var horas by remember { mutableStateOf("") }
    var participacion by remember { mutableStateOf("") }
    var observacion by remember { mutableStateOf("") }
    fun dec(v: String) = v.replace(',', '.').toDoubleOrNull()
    val qty = dec(cantidad)
    val h = dec(horas)
    val pct = dec(participacion)
    val conHoras = tipo == "equipo" || tipo == "herramienta"
    val horasOk = horas.isBlank() || (h != null && h in 0.0..24.0)
    val pctOk = participacion.isBlank() || (pct != null && pct in 0.0..100.0)
    fun soloNumero(v: String) = v.filter { it.isDigit() || it == '.' || it == ',' }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Equipo o recurso") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TiposDeRecurso.todos.forEach { t ->
                        FilterChip(selected = tipo == t, onClick = { tipo = t }, label = { Text(TiposDeRecurso.nombre(t)) })
                    }
                }
                OutlinedTextField(
                    value = descripcion, onValueChange = { descripcion = it },
                    label = { Text(if (tipo == "equipo") "Descripción del equipo" else "Descripción") },
                    placeholder = {
                        Text(when (tipo) {
                            "equipo" -> "Hidrolavadora"; "herramienta" -> "Carretilla"; "epp" -> "Casco, chaleco"
                            "epc" -> "Conos de seguridad"; "material" -> "Cemento"; else -> "Descripción"
                        })
                    },
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
                        onValueChange = { cantidad = soloNumero(it) },
                        label = { Text(if (TiposDeRecurso.esFisico(tipo)) "Cant. física" else "Cant.") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
                if (conHoras) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = horas, onValueChange = { horas = soloNumero(it) },
                            label = { Text("Horas de uso") }, singleLine = true, isError = !horasOk,
                            supportingText = { Text(if (horasOk) "En esta actividad" else "De 0 a 24 h") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        if (tipo == "herramienta") {
                            OutlinedTextField(
                                value = participacion, onValueChange = { participacion = soloNumero(it) },
                                label = { Text("% particip.") }, singleLine = true, isError = !pctOk,
                                supportingText = { Text(if (pctOk) "Opcional" else "De 0 a 100") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
                if (tipo == "epp" || tipo == "epc") {
                    Text("Se controla por jornada: en el consolidado del día cuenta una vez, no por actividad.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (tipo != "equipo") {
                    OutlinedTextField(
                        value = observacion, onValueChange = { observacion = it },
                        label = { Text("Observación") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = descripcion.isNotBlank() && (cantidad.isBlank() || qty != null) && horasOk && pctOk,
                onClick = {
                    alGuardar(
                        EquipoDelRegistro(
                            tipo = tipo,
                            codigo = codigo.takeIf { tipo == "equipo" },
                            descripcion = descripcion,
                            unidad = unidad,
                            cantidad = qty,
                            observacion = observacion.takeIf { tipo != "equipo" },
                            horasUso = h.takeIf { conHoras },
                            participacionPct = pct.takeIf { tipo == "herramienta" },
                        )
                    )
                },
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
