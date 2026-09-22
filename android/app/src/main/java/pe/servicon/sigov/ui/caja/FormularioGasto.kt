package pe.servicon.sigov.ui.caja

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import pe.servicon.sigov.datos.COMPROBANTES
import pe.servicon.sigov.datos.RUBROS_DE_GASTO
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.io.File

/**
 * El gasto, anotado donde ocurre.
 *
 * El orden de los campos es el de la boleta en la mano: cuánto, de qué,
 * a quién y con qué comprobante. La foto se toma aquí mismo porque si se deja
 * para después no se toma nunca.
 */
@Composable
fun FormularioGasto(
    guardando: Boolean,
    alCerrar: () -> Unit,
    alGuardar: (
        importe: Double,
        rubro: String,
        descripcion: String,
        proveedor: String?,
        ruc: String?,
        tipoComprobante: String,
        numeroComprobante: String?,
        foto: File?,
    ) -> Unit,
) {
    val contexto = LocalContext.current

    var importe by remember { mutableStateOf("") }
    var rubro by remember { mutableStateOf(RUBROS_DE_GASTO.first()) }
    var detalle by remember { mutableStateOf("") }
    var proveedor by remember { mutableStateOf("") }
    var ruc by remember { mutableStateOf("") }
    var tipo by remember { mutableStateOf(COMPROBANTES.first().first) }
    var numero by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    // El archivo donde la cámara va a escribir, y aparte el aviso de que ya
    // escribió: sin ese segundo estado la pantalla no se entera de que la
    // foto llegó, porque el archivo es el mismo objeto de antes.
    var destino by remember { mutableStateOf<File?>(null) }
    var foto by remember { mutableStateOf<File?>(null) }

    val camara = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { salioBien ->
        foto = destino?.takeIf { salioBien && it.exists() && it.length() > 0 }
        if (foto != null) error = null
    }

    fun tomarFoto() {
        val archivo = File(
            File(contexto.filesDir, "comprobantes").apply { mkdirs() },
            "boleta-${System.currentTimeMillis()}.jpg",
        )
        destino = archivo
        camara.launch(uriDe(contexto, archivo))
    }

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "Gasto de caja",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "Con su comprobante, para que administración lo apruebe",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    OutlinedTextField(
                        value = importe,
                        onValueChange = { importe = it },
                        label = { Text("Importe") },
                        placeholder = { Text("120.50") },
                        prefix = { Text("S/ ") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Selector("Rubro", rubro, RUBROS_DE_GASTO) { rubro = RUBROS_DE_GASTO[it] }

                    OutlinedTextField(
                        value = detalle,
                        onValueChange = { detalle = it },
                        label = { Text("En qué se gastó") },
                        placeholder = { Text("Petróleo para la camioneta de la cuadrilla") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = proveedor,
                        onValueChange = { proveedor = it },
                        label = { Text("Proveedor") },
                        placeholder = { Text("Grifo Repsol El Pedregal") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = ruc,
                            onValueChange = { ruc = it.filter(Char::isDigit).take(11) },
                            label = { Text("RUC") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = numero,
                            onValueChange = { numero = it },
                            label = { Text("N.º comprobante") },
                            placeholder = { Text("B001-0001234") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Selector(
                        "Tipo de comprobante",
                        COMPROBANTES.first { it.first == tipo }.second,
                        COMPROBANTES.map { it.second },
                    ) { tipo = COMPROBANTES[it].first }

                    BotonDeFoto(
                        hayFoto = foto != null,
                        obligatoria = tipo != "sin_comprobante",
                        alTocar = ::tomarFoto,
                    )

                    error?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
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
                        onClick = {
                            val adjunta = foto
                            error = validar(importe, detalle, tipo, adjunta)
                            if (error == null) {
                                alGuardar(
                                    importe.replace(",", ".").toDouble(),
                                    rubro,
                                    detalle.trim(),
                                    proveedor.ifBlank { null },
                                    ruc.ifBlank { null },
                                    tipo,
                                    numero.ifBlank { null },
                                    adjunta,
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
                            Text("Guardar", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

/** Pedir plata, con motivo y monto, para que quede constancia. */
@Composable
fun SolicitudDeposito(
    sugerido: Double,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alEnviar: (importe: Double, motivo: String) -> Unit,
) {
    var importe by remember { mutableStateOf(sugerido.toInt().toString()) }
    var motivo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text("Pedir depósito") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Administración lo verá en la web y responderá con el número de operación.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = importe,
                    onValueChange = { importe = it },
                    label = { Text("Cuánto necesitas") },
                    prefix = { Text("S/ ") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = { Text("Para qué") },
                    placeholder = { Text("Combustible y peajes de la semana") },
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !guardando,
                onClick = {
                    val monto = importe.replace(",", ".").toDoubleOrNull()
                    error = when {
                        monto == null || monto <= 0 -> "Escribe cuánto necesitas."
                        motivo.isBlank() -> "Di para qué es el depósito."
                        else -> null
                    }
                    if (error == null) alEnviar(monto!!, motivo.trim())
                },
            ) { Text("Enviar solicitud") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}

@Composable
private fun BotonDeFoto(hayFoto: Boolean, obligatoria: Boolean, alTocar: () -> Unit) {
    val color = when {
        hayFoto -> Marca.VerdeBandera
        obligatoria -> Semaforo.Urgente
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    OutlinedCard(
        onClick = alTocar,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                if (hayFoto) Icons.Outlined.CheckCircle else Icons.Outlined.PhotoCamera,
                contentDescription = null,
                tint = color,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    if (hayFoto) "Comprobante fotografiado" else "Fotografiar el comprobante",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    when {
                        hayFoto -> "Toca para volver a tomarla"
                        obligatoria -> "Sin la foto el gasto no se aprueba"
                        else -> "Opcional cuando no hay comprobante"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = color,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Selector(
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

private fun uriDe(contexto: android.content.Context, archivo: File): Uri =
    FileProvider.getUriForFile(contexto, "${contexto.packageName}.fileprovider", archivo)

private fun validar(
    importe: String,
    detalle: String,
    tipoComprobante: String,
    foto: File?,
): String? {
    val monto = importe.replace(",", ".").toDoubleOrNull()
    return when {
        monto == null || monto <= 0 -> "Escribe el importe del gasto."
        detalle.isBlank() -> "Di en qué se gastó."
        tipoComprobante != "sin_comprobante" && foto == null ->
            "Falta la foto del comprobante. Si de verdad no hay, elige «Sin comprobante»."
        else -> null
    }
}
