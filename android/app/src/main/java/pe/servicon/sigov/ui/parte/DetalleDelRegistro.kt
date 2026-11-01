package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.datos.Consumo
import pe.servicon.sigov.datos.Numeros
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.RecursoDelDia
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Una actividad del reporte, completa en un solo lugar (Elvis, 21/10): lo
 * que se ejecutó en el PCI o en la partida llega al reporte, y aquí se le
 * pone el metrado, los materiales, los equipos y la observación —«es
 * simple: metrado, materiales, equipos»—, sin volver a «Registrar
 * actividad». El metrado siempre se puede corregir, también en un ítem PCI.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetalleDelRegistro(
    registro: RegistroLocal,
    codigo: String?,
    item: Int?,
    fases: Map<String, Int>,
    consumos: List<Consumo>,
    recursos: List<RecursoDelDia>,
    editable: Boolean,
    alGuardar: (cantidad: Double, observacion: String?) -> Unit,
    alAgregarMaterial: () -> Unit,
    alAgregarEquipo: () -> Unit,
    alQuitarConsumo: (Consumo) -> Unit,
    alQuitarRecurso: (RecursoDelDia) -> Unit,
    alTomarFoto: () -> Unit,
    alCerrar: () -> Unit,
) {
    var metrado by remember(registro.clientId) {
        mutableStateOf(if (registro.cantidad > 0) Numeros.tres(registro.cantidad) else "")
    }
    var observacion by remember(registro.clientId) { mutableStateOf(registro.observacion.orEmpty()) }
    val cantidad = metrado.replace(',', '.').toDoubleOrNull()
    val cambio = cantidad != null && (cantidad != registro.cantidad || observacion.trim() != registro.observacion.orEmpty())

    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                listOfNotNull(codigo, registro.pciCodigo?.let { pe.servicon.sigov.datos.codigoCortoDePci(it) }, item?.let { "Ítem $it" })
                    .joinToString(" · "),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(registro.actividadNombre, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                listOfNotNull(
                    registro.tramoNombre,
                    Progresiva.rango(registro.progresivaInicio, registro.progresivaFin),
                    pe.servicon.sigov.datos.Lados.etiqueta(registro.lado),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
            )

            // Fotos por etapa, como en el módulo PCI
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ContadorPorEtapa(fases, exigeLasTres = registro.origen == "pci")
                Spacer(Modifier.weight(1f))
                TextButton(onClick = alTomarFoto) {
                    Icon(Icons.Outlined.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Fotos")
                }
            }

            // 1 · Metrado
            Seccion(Icons.Outlined.Straighten, "Metrado")
            OutlinedTextField(
                value = metrado,
                onValueChange = { v -> metrado = v.filter { it.isDigit() || it == '.' || it == ',' }.take(10) },
                label = { Text("Metrado ejecutado") },
                suffix = registro.unidad?.let { u -> { Text(u) } },
                isError = editable && (cantidad == null || cantidad <= 0.0),
                supportingText = if (editable && (cantidad == null || cantidad <= 0.0)) {
                    { Text("Falta el metrado: sin él la actividad no se valoriza.") }
                } else null,
                enabled = editable,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )

            // 2 · Materiales
            Seccion(Icons.Outlined.Inventory2, "Materiales", if (editable) alAgregarMaterial else null)
            if (consumos.isEmpty()) Vacio("Sin materiales en esta actividad.")
            consumos.forEach { c ->
                Linea(
                    c.nombre,
                    Numeros.tres(c.cantidad) + (c.unidad?.let { " $it" } ?: ""),
                    porEnviar = !c.enviado,
                    alQuitar = if (editable && !c.enviado) ({ alQuitarConsumo(c) }) else null,
                )
            }

            // 3 · Equipos
            Seccion(Icons.Outlined.Construction, "Equipos y otros recursos", if (editable) alAgregarEquipo else null)
            if (recursos.isEmpty()) Vacio("Sin equipos en esta actividad.")
            recursos.forEach { r ->
                Linea(
                    listOfNotNull(r.codigo, r.descripcion).joinToString(" · "),
                    r.cantidad?.let { Numeros.tres(it) + (r.unidad?.let { u -> " $u" } ?: "") } ?: "",
                    porEnviar = !r.enviado,
                    alQuitar = if (editable && !r.enviado) ({ alQuitarRecurso(r) }) else null,
                )
            }

            // 4 · Observación
            OutlinedTextField(
                value = observacion,
                onValueChange = { observacion = it.take(300) },
                label = { Text("Observación (opcional)") },
                enabled = editable,
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )

            if (editable) {
                Button(
                    onClick = { alGuardar(cantidad ?: 0.0, observacion) },
                    enabled = cambio,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                ) { Text("Guardar metrado y observación") }
            }
        }
    }
}

/** A · D · DP con cuántas fotos lleva cada etapa; lo que falta, en rojo. */
@Composable
fun ContadorPorEtapa(fases: Map<String, Int>, exigeLasTres: Boolean) {
    val etapas = listOf("antes" to "A", "durante" to "D", "despues" to "DP")
        .filter { (f, _) -> exigeLasTres || (fases[f] ?: 0) > 0 }
    val generales = fases.filterKeys { it !in setOf("antes", "durante", "despues") }.values.sum()
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        etapas.forEach { (f, letra) ->
            val n = fases[f] ?: 0
            val color = if (n > 0) Semaforo.EnPlazo else Semaforo.Vencido
            Text(
                "$letra $n",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = color,
                modifier = Modifier
                    .background(color.copy(alpha = 0.10f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        if (generales > 0) {
            Text(
                "Fotos $generales",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = Marca.Azul,
                modifier = Modifier
                    .background(Marca.Azul.copy(alpha = 0.10f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun Seccion(icono: ImageVector, titulo: String, alAgregar: (() -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icono, contentDescription = null, tint = Marca.Azul, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(titulo, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        alAgregar?.let {
            TextButton(onClick = it) {
                Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Agregar")
            }
        }
    }
}

@Composable
private fun Vacio(texto: String) {
    Text(texto, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Linea(nombre: String, cantidad: String, porEnviar: Boolean, alQuitar: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(nombre, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(cantidad, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        if (porEnviar) {
            Icon(Icons.Outlined.CloudUpload, contentDescription = "Por enviar", tint = Marca.Naranja, modifier = Modifier.padding(start = 8.dp).size(18.dp))
        }
        alQuitar?.let { IconButton(onClick = it) { Icon(Icons.Outlined.Close, contentDescription = "Quitar") } }
    }
}
