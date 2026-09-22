package pe.servicon.sigov.ui.ast

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import pe.servicon.sigov.datos.AptitudDelConductor
import pe.servicon.sigov.datos.Vehiculo
import pe.servicon.sigov.ui.charlas.PizarraDeFirma
import pe.servicon.sigov.ui.charlas.recordarControlDeFirma
import pe.servicon.sigov.ui.theme.Marca

/**
 * Las cinco preguntas antes de arrancar.
 *
 * Se responden de pie junto a la camioneta, así que son interruptores
 * grandes y en el mismo orden siempre. Dos están formuladas en negativo
 * —«¿consumiste alcohol?»— porque así es como se preguntan en obra y como
 * están en el formato que firma el conductor.
 *
 * El «no apto» no bloquea el registro: bloquea el viaje. Registrar que
 * alguien no estaba en condiciones es precisamente el valor del documento;
 * si la app se negara a guardarlo, nadie lo declararía y saldrían igual.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormularioDeConductor(
    vehiculos: List<Vehiculo>,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alGuardar: (Vehiculo, AptitudDelConductor, Bitmap, String) -> Unit,
) {
    var vehiculo by remember { mutableStateOf(vehiculos.firstOrNull()) }
    var nombre by remember { mutableStateOf("") }
    var horas by remember { mutableStateOf("") }
    var descanso by remember { mutableStateOf(false) }
    var alcohol by remember { mutableStateOf(false) }
    var medicacion by remember { mutableStateOf(false) }
    var licencia by remember { mutableStateOf(false) }
    var operativo by remember { mutableStateOf(false) }
    var observacion by remember { mutableStateOf("") }
    var firmando by remember { mutableStateOf(false) }

    val aptitud = AptitudDelConductor(
        descansoSuficiente = descanso,
        consumioAlcohol = alcohol,
        medicacionQueAfecta = medicacion,
        licenciaVigente = licencia,
        vehiculoOperativo = operativo,
        horasDeSueno = horas.toIntOrNull(),
        observacion = observacion.ifBlank { null },
    )

    if (firmando && vehiculo != null) {
        DialogoDeFirmaSimple(
            titulo = nombre.ifBlank { "Conductor" },
            detalle = "Al firmar declaras que lo respondido es cierto.",
            alCerrar = { firmando = false },
            alFirmar = { trazo ->
                firmando = false
                alGuardar(vehiculo!!, aptitud, trazo, nombre.trim())
            },
        )
    }

    Dialog(onDismissRequest = alCerrar, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "AST del conductor",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "Antes de mover el vehículo",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    SelectorSimple(
                        etiqueta = "Vehículo",
                        valor = vehiculo?.let { "${it.plate} · ${it.kind}" } ?: "",
                        opciones = vehiculos.map { "${it.plate} · ${it.kind}" },
                        alElegir = { i -> vehiculo = vehiculos[i] },
                    )

                    OutlinedTextField(
                        value = nombre,
                        onValueChange = { nombre = it },
                        label = { Text("Nombre de quien maneja") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = horas,
                        onValueChange = { horas = it.filter(Char::isDigit).take(2) },
                        label = { Text("Horas que dormiste") },
                        placeholder = { Text("8") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Pregunta("¿Descansaste lo suficiente?", descanso) { descanso = it }
                    Pregunta("¿Consumiste alcohol en las últimas 24 horas?", alcohol, peligrosa = true) { alcohol = it }
                    Pregunta("¿Tomas medicación que afecte al manejo?", medicacion, peligrosa = true) { medicacion = it }
                    Pregunta("¿Llevas la licencia vigente?", licencia) { licencia = it }
                    Pregunta("¿El vehículo está operativo?", operativo) { operativo = it }

                    OutlinedTextField(
                        value = observacion,
                        onValueChange = { observacion = it },
                        label = { Text("Observación") },
                        placeholder = { Text("Algo que el supervisor deba saber…") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                // El veredicto, pegado a los botones: es lo último que se lee
                // antes de firmar y lo que decide si se sale o no.
                if (aptitud.apto) {
                    Aviso("En condiciones de manejar.", Marca.VerdeBandera)
                } else {
                    Aviso(
                        "NO APTO para manejar. " + aptitud.reparos.firstOrNull().orEmpty(),
                        MaterialTheme.colorScheme.error,
                    )
                }

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
                        onClick = { firmando = true },
                        enabled = !guardando && vehiculo != null && nombre.isNotBlank(),
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
                            Text("Firmar y registrar", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Una pregunta de sí o no.
 *
 * Las peligrosas —alcohol, medicación— se pintan en rojo cuando la
 * respuesta es «sí», porque ahí es donde el sí es la mala noticia.
 */
@Composable
private fun Pregunta(
    texto: String,
    valor: Boolean,
    peligrosa: Boolean = false,
    alCambiar: (Boolean) -> Unit,
) {
    val malo = if (peligrosa) valor else !valor
    Row(
        Modifier
            .fillMaxWidth()
            // 56 dp: se responde de pie, con guantes, junto a la camioneta
            .heightIn(min = 56.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            texto,
            style = MaterialTheme.typography.bodyMedium,
            color = if (malo) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = valor, onCheckedChange = alCambiar)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SelectorSimple(
    etiqueta: String,
    valor: String,
    opciones: List<String>,
    alElegir: (Int) -> Unit,
) {
    var abierto by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = abierto, onExpandedChange = { abierto = !abierto }) {
        OutlinedTextField(
            value = valor,
            onValueChange = {},
            readOnly = true,
            label = { Text(etiqueta) },
            placeholder = { Text("Selecciona…") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(abierto) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            opciones.forEachIndexed { i, texto ->
                DropdownMenuItem(text = { Text(texto) }, onClick = { alElegir(i); abierto = false })
            }
        }
    }
}

@Composable
internal fun DialogoDeFirmaSimple(
    titulo: String,
    detalle: String,
    alCerrar: () -> Unit,
    alFirmar: (Bitmap) -> Unit,
) {
    val control = recordarControlDeFirma()
    var hayTrazo by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(titulo) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    detalle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                PizarraDeFirma(control = control, alCambiar = { hayTrazo = it })
            }
        },
        confirmButton = {
            Button(enabled = hayTrazo, onClick = { control.aMapaDeBits()?.let(alFirmar) }) {
                Text("Guardar firma")
            }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
