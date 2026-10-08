package pe.servicon.sigov.ui.evidencia

import android.Manifest
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.local.EvidenciaLocal
import pe.servicon.sigov.datos.EvidenciaEnGaleria
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BrandingWatermark
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.GpsOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.FechaEditada
import pe.servicon.sigov.datos.Peru
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import pe.servicon.sigov.datos.Sello
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.ui.theme.Marca
import java.io.File

/**
 * La cámara de evidencias.
 *
 * Disparar tiene que ser una sola acción: el capataz está parado en la berma,
 * con casco y guantes. Lo que la foto necesita para valer —posición, fecha,
 * tramo y actividad— la app lo pone sola.
 */
@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun PantallaCamara(
    registroClientId: String,
    /** La fase con que se abre: desde la ficha PCI se llega con la foto ya elegida. */
    faseInicial: Fase? = null,
    vm: CamaraViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    val contexto = LocalContext.current

    LaunchedEffect(registroClientId) { vm.abrir(registroClientId, faseInicial) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    val permisos = rememberMultiplePermissionsState(
        listOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION)
    )
    LaunchedEffect(Unit) {
        if (!permisos.allPermissionsGranted) permisos.launchMultiplePermissionRequest()
    }
    val hayCamara = permisos.permissions
        .first { it.permission == Manifest.permission.CAMERA }.status.isGranted

    LaunchedEffect(permisos.allPermissionsGranted) {
        if (permisos.allPermissionsGranted) vm.buscarPosicion()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(avisos) },
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Evidencia fotográfica", style = MaterialTheme.typography.titleMedium)
                        estado.registro?.let { r ->
                            Text(
                                listOfNotNull(
                                    r.actividadNombre,
                                    Progresiva.rango(r.progresivaInicio, r.progresivaFin),
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.75f),
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = alVolver) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Marca.Azul,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                ),
            )
        },
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (hayCamara) {
                    var disparo by remember { mutableStateOf<ImageCapture?>(null) }
                    VisorDeCamara(onListo = { disparo = it })

                    SelloEnVivo(
                        buscando = estado.buscandoGps,
                        coordenadas = estado.punto?.let {
                            "%.5f, %.5f  ±%.0f m".format(it.latitud, it.longitud, it.precision)
                        },
                        modifier = Modifier.align(Alignment.TopCenter).padding(12.dp),
                    )

                    // Lo que va a quedar impreso, donde va a quedar: abajo a la derecha
                    if (estado.conMarcaDeAgua && estado.sello.activo) {
                        SelloPrevio(
                            fechaEditada = estado.fechaEditada,
                            extras = estado.sello.extras,
                            // Encima del disparador, para que no lo tape
                            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 118.dp),
                        )
                    }

                    Disparador(
                        habilitado = disparo != null && !estado.guardando,
                        guardando = estado.guardando,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
                        alDisparar = {
                            val destino = vm.archivoTemporal()
                            disparo?.takePicture(
                                ImageCapture.OutputFileOptions.Builder(destino).build(),
                                ContextCompat.getMainExecutor(contexto),
                                object : ImageCapture.OnImageSavedCallback {
                                    override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                                        vm.sellar(destino)
                                    }

                                    override fun onError(e: ImageCaptureException) {
                                        vm.fallo("No se pudo tomar la foto. Vuelve a intentarlo.")
                                    }
                                },
                            )
                        },
                    )
                } else {
                    Column(
                        Modifier.fillMaxSize().padding(32.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "La cámara necesita tu permiso",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Sin foto sellada la actividad no queda sustentada.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.7f),
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { permisos.launchMultiplePermissionRequest() }) {
                            Text("Dar permiso")
                        }
                    }
                }
            }

            Controles(
                fases = estado.fases,
                fase = estado.fase,
                conMarca = estado.conMarcaDeAgua,
                queLleva = resumenDelSello(estado.sello),
                alCambiarFase = vm::cambiarFase,
                alAlternarMarca = vm::alternarMarca,
            )

            FechaDelSello(
                editada = estado.fechaEditada,
                alEditar = vm::editarFecha,
                alUsarHoraReal = vm::usarHoraReal,
            )

            // La foto que se tocó en la tira, para verla, ampliarla o quitarla
            var abierta by remember { mutableStateOf<EvidenciaLocal?>(null) }
            abierta?.let { foto ->
                VisorDeFoto(
                    foto = paraElVisor(foto, estado.registro),
                    alCerrar = { abierta = null },
                    alEliminar = { vm.eliminar(foto); abierta = null },
                )
            }

            if (estado.evidencias.isNotEmpty()) {
                LazyRow(
                    Modifier.fillMaxWidth().background(Color.Black).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(estado.evidencias, key = { it.clientId }) { foto ->
                        Box(Modifier.clickable { abierta = foto }) {
                            AsyncImage(
                                model = File(foto.rutaLocal),
                                contentDescription = foto.fase,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(74.dp)
                                    .clip(RoundedCornerShape(10.dp)),
                            )
                            Text(
                                Fase.entries.firstOrNull { it.valor == foto.fase }?.etiqueta ?: foto.fase,
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .background(Marca.Azul.copy(alpha = 0.85f))
                                    .padding(horizontal = 5.dp, vertical = 1.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/** El visor. Se ata al ciclo de vida para que la cámara se suelte al salir. */
@Composable
private fun VisorDeCamara(onListo: (ImageCapture) -> Unit) {
    val contexto = LocalContext.current
    val dueno = LocalLifecycleOwner.current

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val vista = PreviewView(ctx).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
            val proveedorFuturo = ProcessCameraProvider.getInstance(ctx)
            proveedorFuturo.addListener({
                val proveedor = proveedorFuturo.get()
                val vistaPrevia = Preview.Builder().build()
                    .also { it.setSurfaceProvider(vista.surfaceProvider) }
                val captura = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                runCatching {
                    proveedor.unbindAll()
                    proveedor.bindToLifecycle(
                        dueno, CameraSelector.DEFAULT_BACK_CAMERA, vistaPrevia, captura,
                    )
                    onListo(captura)
                }
            }, ContextCompat.getMainExecutor(ctx))
            vista
        },
    )
}

/** Lo que va a quedar impreso en la foto, visible antes de disparar. */
@Composable
private fun SelloEnVivo(buscando: Boolean, coordenadas: String?, modifier: Modifier = Modifier) {
    Surface(
        color = Color.Black.copy(alpha = 0.55f),
        shape = RoundedCornerShape(24.dp),
        modifier = modifier,
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            when {
                buscando -> {
                    CircularProgressIndicator(
                        Modifier.size(15.dp),
                        strokeWidth = 2.dp,
                        color = Marca.Verde,
                    )
                    Text("Buscando posición…", color = Color.White, style = MaterialTheme.typography.bodySmall)
                }

                coordenadas != null -> {
                    Icon(
                        Icons.Outlined.GpsFixed,
                        contentDescription = null,
                        tint = Marca.Verde,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(coordenadas, color = Color.White, style = MaterialTheme.typography.bodySmall)
                }

                else -> {
                    Icon(
                        Icons.Outlined.GpsOff,
                        contentDescription = null,
                        tint = Marca.Naranja,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        "Sin GPS · la foto se guarda igual",
                        color = Color.White,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun Disparador(
    habilitado: Boolean,
    guardando: Boolean,
    modifier: Modifier = Modifier,
    alDisparar: () -> Unit,
) {
    Surface(
        onClick = alDisparar,
        enabled = habilitado,
        shape = CircleShape,
        color = if (habilitado) Color.White else Color.White.copy(alpha = 0.4f),
        modifier = modifier.size(78.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (guardando) {
                CircularProgressIndicator(Modifier.size(28.dp), color = Marca.Azul, strokeWidth = 3.dp)
            } else {
                Box(
                    Modifier
                        .size(62.dp)
                        .clip(CircleShape)
                        .background(Marca.Verde),
                )
            }
        }
    }
}

/** Fase de la obra y marca de agua: lo único que el capataz decide. */
@Composable
private fun Controles(
    fases: List<Fase>,
    queLleva: String,
    fase: Fase,
    conMarca: Boolean,
    alCambiarFase: (Fase) -> Unit,
    alAlternarMarca: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Color.Black)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Cada botón mide lo que su palabra: con la letra del teléfono
        // agrandada, «Después» ya no se corta (OBS-22); si no caben todos, la
        // fila se desliza.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            fases.forEach { opcion ->
                val elegida = opcion == fase
                Surface(
                    onClick = { alCambiarFase(opcion) },
                    shape = RoundedCornerShape(20.dp),
                    color = if (elegida) Marca.Verde else Color.White.copy(alpha = 0.12f),
                    modifier = Modifier.defaultMinSize(minWidth = 84.dp),
                ) {
                    Text(
                        opcion.etiqueta,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (elegida) FontWeight.SemiBold else FontWeight.Normal,
                        color = Color.White,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }

        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Outlined.BrandingWatermark,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.8f),
                modifier = Modifier.size(18.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    "Imprimir el sello sobre la foto",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White,
                )
                Text(
                    // Lo que lleva el sello lo decide el contrato, así que
                    // este texto no puede estar cableado: diría una cosa
                    // mientras la foto sale con otra.
                    queLleva,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f),
                )
            }
            Switch(
                checked = conMarca,
                onCheckedChange = { alAlternarMarca() },
                colors = SwitchDefaults.colors(checkedTrackColor = Marca.Verde),
            )
        }
    }
}

/** Qué campos lleva el sello, dicho en una línea. */
private fun resumenDelSello(sello: Sello): String {
    if (!sello.activo) return "Desactivado para este contrato"
    val extras = sello.extras
    return when (extras.size) {
        0 -> "Fecha y hora · lo demás se cambia en Configuración"
        else -> "Fecha y hora, " + extras.joinToString(", ")
    }
}

/** El reloj del sello: avanza solo, para que la vista previa no mienta. */
@Composable
private fun relojDelSello(editada: FechaEditada?): LocalDateTime {
    var ahora by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000)
            ahora = Instant.now()
        }
    }
    return editada?.let { it.momento.plusSeconds(java.time.Duration.between(it.editadaEn, ahora).seconds) }
        ?: LocalDateTime.ofInstant(ahora, Peru.zona)
}

/** La fecha y hora tal como saldrán, abajo a la derecha de la foto. */
@Composable
private fun SelloPrevio(fechaEditada: FechaEditada?, extras: List<String>, modifier: Modifier = Modifier) {
    val momento = relojDelSello(fechaEditada)
    Column(modifier, horizontalAlignment = Alignment.End) {
        if (extras.isNotEmpty()) {
            Text(
                "+ " + extras.joinToString(", "),
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.85f),
                textAlign = TextAlign.End,
                modifier = Modifier.background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
            Spacer(Modifier.height(4.dp))
        }
        Text(
            Peru.sello(momento),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (fechaEditada != null) Marca.Naranja else Color.White,
            modifier = Modifier.background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

/**
 * La fecha y hora del sello, editable antes de la toma y sin pedir motivo
 * (Elvis: «simplemente que aparezca editar y coloque la fecha y la hora»).
 * Editada se ve en naranja, para que nadie la deje puesta sin darse cuenta.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FechaDelSello(
    editada: FechaEditada?,
    alEditar: (LocalDateTime) -> Unit,
    alUsarHoraReal: () -> Unit,
) {
    val momento = relojDelSello(editada)
    var paso by remember { mutableStateOf(0) }          // 0 nada · 1 fecha · 2 hora
    var dia by remember { mutableStateOf<LocalDate?>(null) }

    Row(
        Modifier
            .fillMaxWidth()
            .background(Color.Black)
            .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            Icons.Outlined.EditCalendar,
            contentDescription = null,
            tint = if (editada != null) Marca.Naranja else Color.White.copy(alpha = 0.8f),
            modifier = Modifier.size(18.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                if (editada != null) "Fecha del sello editada" else "Fecha y hora del sello",
                style = MaterialTheme.typography.bodyMedium,
                color = if (editada != null) Marca.Naranja else Color.White,
            )
            Text(
                Peru.sello(momento) + if (editada != null) "" else " · hora real",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.6f),
            )
        }
        if (editada != null) {
            TextButton(onClick = alUsarHoraReal) {
                Icon(Icons.Outlined.Restore, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
                Spacer(Modifier.width(4.dp))
                Text("Hora real", color = Color.White)
            }
        }
        TextButton(onClick = { paso = 1 }) { Text("Editar", color = Marca.Verde) }
    }

    if (paso == 1) {
        val hoy = Peru.hoy()
        val estadoFecha = rememberDatePickerState(
            initialSelectedDateMillis = momento.toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
            // Ni el futuro ni más de 30 días atrás: es para cerrar el día de ayer
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val dia = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                    return !dia.isAfter(hoy) && !dia.isBefore(hoy.minusDays(30))
                }
                override fun isSelectableYear(year: Int) = year in hoy.minusDays(30).year..hoy.year
            },
        )
        DatePickerDialog(
            onDismissRequest = { paso = 0 },
            confirmButton = {
                TextButton(onClick = {
                    dia = estadoFecha.selectedDateMillis?.let {
                        Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    paso = if (dia != null) 2 else 0
                }) { Text("Siguiente") }
            },
            dismissButton = { TextButton(onClick = { paso = 0 }) { Text("Cancelar") } },
        ) { DatePicker(state = estadoFecha) }
    }

    if (paso == 2) {
        val estadoHora = rememberTimePickerState(
            initialHour = momento.hour,
            initialMinute = momento.minute,
            is24Hour = true,
        )
        AlertDialog(
            onDismissRequest = { paso = 0 },
            title = { Text("Hora del sello") },
            text = { TimePicker(state = estadoHora) },
            confirmButton = {
                TextButton(onClick = {
                    dia?.let { alEditar(LocalDateTime.of(it, LocalTime.of(estadoHora.hour, estadoHora.minute))) }
                    paso = 0
                }) { Text("Usar esta fecha") }
            },
            dismissButton = { TextButton(onClick = { paso = 0 }) { Text("Cancelar") } },
        )
    }
}

/** La foto recién tomada, con lo que el visor necesita para su ficha. */
private fun paraElVisor(foto: EvidenciaLocal, registro: RegistroLocal?) = EvidenciaEnGaleria(
    id = foto.clientId,
    clientId = foto.clientId,
    servicioId = foto.servicioId,
    phase = foto.fase,
    ruta = foto.rutaDestino,
    tomadaEn = java.time.Instant.ofEpochMilli(foto.tomadaEn).toString(),
    actividad = registro?.actividadNombre,
    tramo = registro?.tramoNombre,
    progresiva = foto.progresiva,
    pciCodigo = registro?.pciCodigo,
    caption = foto.leyenda,
    lat = foto.latitud.takeIf { it != 0.0 },
    lng = foto.longitud.takeIf { it != 0.0 },
    precision = foto.precision.toDouble().takeIf { it > 0 },
    watermarked = foto.conMarcaDeAgua,
).also { it.rutaLocal = foto.rutaLocal }
