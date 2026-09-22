package pe.servicon.sigov.ui.ast

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Draw
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import pe.servicon.sigov.datos.MiembroDeCuadrilla
import pe.servicon.sigov.datos.Peligro
import pe.servicon.sigov.ui.theme.Marca

/** Los EPP que se marcan casi siempre, para no teclearlos cada mañana. */
private val EPP_HABITUAL = listOf(
    "Casco", "Chaleco reflectivo", "Botines de seguridad", "Guantes",
    "Lentes de seguridad", "Protector auditivo", "Mascarilla", "Arnés",
)

/** El nivel de riesgo, como lo nombra la matriz IPERC. */
private val RIESGOS = listOf(
    "trivial" to "Trivial",
    "tolerable" to "Tolerable",
    "moderado" to "Moderado",
    "importante" to "Importante",
    "intolerable" to "Intolerable",
)

/**
 * El AST de la cuadrilla.
 *
 * Tres cosas que el auditor pide y que aquí no son opcionales: qué se va a
 * hacer, qué puede salir mal con su control, y quién estuvo presente. Sin
 * las firmas el documento no demuestra que se habló con el equipo, que es
 * justo lo que se audita.
 */
@Composable
fun FormularioDeCuadrilla(
    integrantes: List<MiembroDeCuadrilla>,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alGuardar: (
        tarea: String,
        lugar: String?,
        peligros: List<Peligro>,
        epp: List<String>,
        riesgoMaximo: String,
        firmas: Map<String, Bitmap>,
    ) -> Unit,
) {
    var tarea by remember { mutableStateOf("") }
    var lugar by remember { mutableStateOf("") }
    var riesgo by remember { mutableStateOf("tolerable") }
    val epp = remember { mutableStateListOf("Casco", "Chaleco reflectivo", "Botines de seguridad", "Guantes") }
    val peligros = remember { mutableStateListOf<Peligro>() }
    val firmas = remember { mutableStateMapOf<String, Bitmap>() }
    var agregando by remember { mutableStateOf(false) }
    var firmando by remember { mutableStateOf<MiembroDeCuadrilla?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    if (agregando) {
        DialogoDePeligro(
            alCerrar = { agregando = false },
            alAgregar = { p -> peligros.add(p); agregando = false },
        )
    }

    firmando?.let { miembro ->
        DialogoDeFirmaSimple(
            titulo = miembro.nombre,
            detalle = listOfNotNull(miembro.position, miembro.dni?.let { "DNI $it" })
                .joinToString(" · ")
                .ifBlank { "Firma de conformidad con lo conversado." },
            alCerrar = { firmando = null },
            alFirmar = { trazo -> firmas[miembro.id] = trazo; firmando = null },
        )
    }

    Dialog(onDismissRequest = alCerrar, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.94f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "AST de la cuadrilla",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "Antes de empezar, al pie del trabajo",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    OutlinedTextField(
                        value = tarea,
                        onValueChange = { tarea = it },
                        label = { Text("Tarea a ejecutar") },
                        placeholder = { Text("Limpieza de cunetas en 247+574") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = lugar,
                        onValueChange = { lugar = it },
                        label = { Text("Lugar") },
                        placeholder = { Text("Tramo y progresiva, o referencia") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    // ── Peligros y controles ─────────────────────────────
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Peligros y controles · ${peligros.size}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { agregando = true }) {
                            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Agregar")
                        }
                    }

                    if (peligros.isEmpty()) {
                        Aviso("Anota al menos un peligro y cómo se controla.", Marca.Naranja)
                    } else {
                        peligros.forEachIndexed { i, p ->
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                                border = CardDefaults.outlinedCardBorder(),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
                                    Column(Modifier.weight(1f)) {
                                        Text(p.peligro, style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold)
                                        Text(
                                            "Riesgo: ${p.riesgo}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(
                                            "Control: ${p.control}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Marca.VerdeBandera,
                                        )
                                    }
                                    IconButton(onClick = { peligros.removeAt(i) }) {
                                        Icon(
                                            Icons.Outlined.Delete,
                                            contentDescription = "Quitar",
                                            tint = MaterialTheme.colorScheme.error,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    SelectorSimple(
                        etiqueta = "Riesgo máximo",
                        valor = RIESGOS.firstOrNull { it.first == riesgo }?.second ?: "",
                        opciones = RIESGOS.map { it.second },
                        alElegir = { i -> riesgo = RIESGOS[i].first },
                    )

                    // ── EPP ──────────────────────────────────────────────
                    Text(
                        "Equipo de protección · ${epp.size}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    EPP_HABITUAL.chunked(2).forEach { pareja ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pareja.forEach { item ->
                                FilterChip(
                                    selected = item in epp,
                                    onClick = { if (item in epp) epp.remove(item) else epp.add(item) },
                                    label = { Text(item) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (pareja.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }

                    // ── Firmas ───────────────────────────────────────────
                    Text(
                        "Firmas · ${firmas.size} de ${integrantes.size}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    integrantes.forEach { miembro ->
                        val firmado = miembro.id in firmas
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .background(
                                    (if (firmado) Marca.VerdeBandera else Marca.Azul).copy(alpha = 0.06f),
                                    RoundedCornerShape(12.dp),
                                )
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(miembro.nombre, style = MaterialTheme.typography.bodyMedium)
                                miembro.position?.let {
                                    Text(
                                        it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            if (firmado) {
                                Icon(
                                    Icons.Outlined.CheckCircle,
                                    contentDescription = "Firmado",
                                    tint = Marca.VerdeBandera,
                                )
                            } else {
                                TextButton(onClick = { firmando = miembro }) {
                                    Icon(Icons.Outlined.Draw, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Firmar")
                                }
                            }
                        }
                    }
                }

                error?.let { Aviso(it, MaterialTheme.colorScheme.error) }

                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = alCerrar,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text("Cancelar") }

                    Button(
                        onClick = {
                            error = when {
                                tarea.isBlank() -> "Describe la tarea que se va a ejecutar."
                                peligros.isEmpty() -> "Anota al menos un peligro y su control."
                                firmas.isEmpty() -> "Falta la firma de la cuadrilla."
                                else -> null
                            }
                            if (error == null) {
                                alGuardar(
                                    tarea.trim(),
                                    lugar.ifBlank { null },
                                    peligros.toList(),
                                    epp.toList(),
                                    riesgo,
                                    firmas.toMap(),
                                )
                            }
                        },
                        enabled = !guardando,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (guardando) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text("Registrar AST", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

/** Un peligro con su riesgo y su control, los tres a la vez. */
@Composable
private fun DialogoDePeligro(alCerrar: () -> Unit, alAgregar: (Peligro) -> Unit) {
    var peligro by remember { mutableStateOf("") }
    var riesgo by remember { mutableStateOf("") }
    var control by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Peligro identificado") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = peligro,
                    onValueChange = { peligro = it },
                    label = { Text("Peligro") },
                    placeholder = { Text("Tránsito vehicular en la vía") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                )
                OutlinedTextField(
                    value = riesgo,
                    onValueChange = { riesgo = it },
                    label = { Text("Riesgo") },
                    placeholder = { Text("Atropello") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                )
                OutlinedTextField(
                    value = control,
                    onValueChange = { control = it },
                    label = { Text("Control") },
                    placeholder = { Text("Conos, banderillero y chaleco reflectivo") },
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = peligro.isNotBlank() && riesgo.isNotBlank() && control.isNotBlank(),
                onClick = { alAgregar(Peligro(peligro.trim(), riesgo.trim(), control.trim())) },
            ) { Text("Agregar") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
