package pe.servicon.sigov.ui.charlas

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Draw
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Charla
import pe.servicon.sigov.datos.MiembroDeCuadrilla
import pe.servicon.sigov.datos.PuntoDeHigiene
import pe.servicon.sigov.datos.TipoCharla
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Charlas de seguridad.
 *
 * Arriba, si hoy ya se dictó la de cinco minutos —que es la que se exige
 * todos los días—. Debajo, el historial.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaCharlas(
    vm: CharlasViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var dictando by remember { mutableStateOf(false) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Charlas e higiene",
        seccion = "Apartado 6.4 y 6.5",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "La charla del día con sus firmas y la higiene de la cuadrilla.",
        avisos = avisos,
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = { dictando = true },
                containerColor = Marca.Verde,
                contentColor = Color.White,
                icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                text = { Text("Dictar charla", fontWeight = FontWeight.SemiBold) },
            )
        },
    ) { relleno ->
        when {
            estado.cargando -> Box(
                Modifier.fillMaxSize().padding(relleno),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            estado.error != null && estado.charlas.isEmpty() -> Box(
                Modifier.fillMaxSize().padding(relleno).padding(32.dp),
                contentAlignment = Alignment.Center,
            ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

            else -> LazyColumn(
                Modifier.fillMaxSize().padding(relleno),
                contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { DiariaDeHoy(estado.diariaDeHoy) }

                item {
                    Text(
                        "Higiene de hoy · ${estado.higieneCumplidos} de ${PuntoDeHigiene.entries.size}",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
                items(PuntoDeHigiene.entries, key = { it.valor }) { punto ->
                    FilaHigiene(
                        punto = punto,
                        cumplido = estado.higieneCumple(punto),
                        alMarcar = { vm.marcarHigiene(punto, estado.miembros.size.takeIf { it > 0 }) },
                    )
                }

                if (estado.charlas.isNotEmpty()) {
                    item {
                        Text(
                            "Historial",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                    items(estado.charlas, key = { it.id }) { FilaCharla(it) }
                }
            }
        }
    }

    if (dictando) {
        DictarCharla(
            miembros = estado.miembros,
            guardando = estado.guardando,
            alCerrar = { dictando = false },
            alRegistrar = { tipo, tema, contenido, minutos, lugar, firmas ->
                vm.registrar(tipo, tema, contenido, minutos, lugar, firmas) { dictando = false }
            },
        )
    }
}

/**
 * Un punto de higiene del día.
 *
 * Una vez marcado no se puede desmarcar desde el celular: lo que se registró
 * en obra es un hecho, y deshacerlo es cosa del supervisor desde la web.
 */
@Composable
private fun FilaHigiene(punto: PuntoDeHigiene, cumplido: Boolean, alMarcar: () -> Unit) {
    val color = if (cumplido) Marca.VerdeBandera else Marca.Naranja

    Surface(
        onClick = { if (!cumplido) alMarcar() },
        enabled = !cumplido,
        shape = RoundedCornerShape(12.dp),
        color = if (cumplido) Marca.VerdeBandera.copy(alpha = 0.08f)
        else MaterialTheme.colorScheme.surface,
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                if (cumplido) Icons.Outlined.CheckCircle else Icons.Outlined.WaterDrop,
                contentDescription = null,
                tint = color,
            )
            Column(Modifier.weight(1f)) {
                Text(punto.etiqueta, style = MaterialTheme.typography.bodyMedium)
                Text(
                    punto.detalle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                if (cumplido) "Hecho" else "Marcar",
                style = MaterialTheme.typography.labelMedium,
                color = color,
            )
        }
    }
}

/** Lo primero que hay que saber: si hoy ya se dictó la de cinco minutos. */
@Composable
private fun DiariaDeHoy(charla: Charla?) {
    val hecha = charla != null
    val color = if (hecha) Marca.VerdeBandera else Semaforo.Urgente

    Surface(
        color = color.copy(alpha = 0.10f),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                if (hecha) Icons.Outlined.CheckCircle else Icons.Outlined.Campaign,
                contentDescription = null,
                tint = color,
            )
            Column {
                Text(
                    if (hecha) "Charla diaria dictada" else "Falta la charla diaria",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    if (hecha) {
                        "«${charla!!.topic}» · ${charla.firmados} de ${charla.asistentes} firmaron"
                    } else {
                        "Los cinco minutos antes de empezar la jornada"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun FilaCharla(charla: Charla) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        charla.topic,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            charla.fecha,
                            charla.hora,
                            charla.minutos?.let { "$it min" },
                            charla.expositor,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    charla.tipo.etiqueta,
                    style = MaterialTheme.typography.labelSmall,
                    color = Marca.Azul,
                    modifier = Modifier
                        .background(Marca.Azul.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }

            Spacer(Modifier.height(10.dp))
            val completa = charla.firmados >= charla.asistentes && charla.asistentes > 0
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.Draw,
                    contentDescription = null,
                    tint = if (completa) Marca.VerdeBandera else Marca.Naranja,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    "${charla.firmados} de ${charla.asistentes} firmaron",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (completa) Marca.VerdeBandera else Marca.Naranja,
                )
            }
        }
    }
}

/**
 * Dictar una charla.
 *
 * Se elige el tipo y el tema, y después firma cada uno. La lista de firmas es
 * lo que de verdad vale: sin ella la charla no sustenta nada.
 */
@Composable
private fun DictarCharla(
    miembros: List<MiembroDeCuadrilla>,
    guardando: Boolean,
    alCerrar: () -> Unit,
    alRegistrar: (
        tipo: TipoCharla,
        tema: String,
        contenido: String?,
        minutos: Int,
        lugar: String?,
        firmas: Map<MiembroDeCuadrilla, Bitmap>,
    ) -> Unit,
) {
    var tipo by remember { mutableStateOf(TipoCharla.DIARIA) }
    var tema by remember { mutableStateOf("") }
    var contenido by remember { mutableStateOf("") }
    var minutos by remember { mutableStateOf("5") }
    var lugar by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var firmando by remember { mutableStateOf<MiembroDeCuadrilla?>(null) }
    val firmas = remember { mutableStateMapOf<String, Bitmap>() }

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.93f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "Dictar charla",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "${firmas.size} de ${miembros.size} han firmado",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Tipo", style = MaterialTheme.typography.labelLarge)
                    TipoCharla.entries.forEach { opcion ->
                        Surface(
                            onClick = { tipo = opcion; if (opcion != TipoCharla.DIARIA) minutos = "30" },
                            shape = RoundedCornerShape(12.dp),
                            color = if (tipo == opcion) Marca.Azul.copy(alpha = 0.10f)
                            else MaterialTheme.colorScheme.surface,
                            border = CardDefaults.outlinedCardBorder(),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(selected = tipo == opcion, onClick = null)
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(opcion.etiqueta, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        opcion.descripcion,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }

                    OutlinedTextField(
                        value = tema,
                        onValueChange = { tema = it },
                        label = { Text("Tema") },
                        placeholder = { Text("Trabajos junto a vía con tránsito") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = contenido,
                        onValueChange = { contenido = it },
                        label = { Text("Qué se trató") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = minutos,
                            onValueChange = { minutos = it.filter(Char::isDigit) },
                            label = { Text("Duración") },
                            suffix = { Text("min") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = lugar,
                            onValueChange = { lugar = it },
                            label = { Text("Lugar") },
                            placeholder = { Text("Km 940") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                    }

                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Text("Asistencia", style = MaterialTheme.typography.labelLarge)

                    if (miembros.isEmpty()) {
                        Text(
                            "Tu cuadrilla no tiene integrantes registrados. " +
                                "Pídelo al coordinador para poder tomar asistencia.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Semaforo.Urgente,
                        )
                    }

                    miembros.forEach { miembro ->
                        val firmado = firmas.containsKey(miembro.id)
                        Surface(
                            onClick = { firmando = miembro },
                            shape = RoundedCornerShape(12.dp),
                            color = if (firmado) Marca.VerdeBandera.copy(alpha = 0.08f)
                            else MaterialTheme.colorScheme.surface,
                            border = CardDefaults.outlinedCardBorder(),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    if (firmado) Icons.Outlined.CheckCircle else Icons.Outlined.Draw,
                                    contentDescription = null,
                                    tint = if (firmado) Marca.VerdeBandera else Marca.Azul,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(miembro.nombre, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        listOfNotNull(miembro.position, miembro.dni?.let { "DNI $it" })
                                            .joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    if (firmado) "Firmado" else "Firmar",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (firmado) Marca.VerdeBandera else Marca.Azul,
                                )
                            }
                        }
                    }

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
                            error = when {
                                tema.isBlank() -> "Escribe el tema de la charla."
                                firmas.isEmpty() -> "Falta que firme al menos un asistente."
                                else -> null
                            }
                            if (error == null) {
                                val porNombre = miembros.associateBy { it.id }
                                alRegistrar(
                                    tipo,
                                    tema.trim(),
                                    contenido.ifBlank { null },
                                    minutos.toIntOrNull() ?: 5,
                                    lugar.ifBlank { null },
                                    firmas.mapNotNull { (id, mapa) ->
                                        porNombre[id]?.let { it to mapa }
                                    }.toMap(),
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
                            Text("Registrar", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    firmando?.let { miembro ->
        DialogoDeFirma(
            miembro = miembro,
            alCerrar = { firmando = null },
            alFirmar = { mapa ->
                firmas[miembro.id] = mapa
                firmando = null
            },
        )
    }
}

@Composable
private fun DialogoDeFirma(
    miembro: MiembroDeCuadrilla,
    alCerrar: () -> Unit,
    alFirmar: (Bitmap) -> Unit,
) {
    val control = recordarControlDeFirma()
    var hayTrazo by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = alCerrar,
        title = { Text(miembro.nombre) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    listOfNotNull(miembro.position, miembro.dni?.let { "DNI $it" })
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                PizarraDeFirma(control = control, alCambiar = { hayTrazo = it })
            }
        },
        confirmButton = {
            Button(
                enabled = hayTrazo,
                onClick = { control.aMapaDeBits()?.let(alFirmar) },
            ) { Text("Guardar firma") }
        },
        dismissButton = { TextButton(onClick = alCerrar) { Text("Cancelar") } },
    )
}
