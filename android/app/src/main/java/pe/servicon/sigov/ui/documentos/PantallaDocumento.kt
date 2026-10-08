package pe.servicon.sigov.ui.documentos

import android.Manifest
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.DocumentoDelDia
import pe.servicon.sigov.datos.DocumentosRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.evidencia.Disparador
import pe.servicon.sigov.ui.evidencia.VisorDeCamara
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.io.File
import java.time.LocalDate
import javax.inject.Inject

/** Una página: en la nube (con enlace) o todavía en el teléfono. */
data class Pagina(val clientId: String, val modelo: Any, val enTelefono: Boolean)

data class EstadoDocumento(
    val documento: DocumentoDelDia? = null,
    val paginas: List<Pagina> = emptyList(),
    val cargando: Boolean = true,
    val guardando: Boolean = false,
    val camara: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
)

@HiltViewModel
class DocumentoViewModel @Inject constructor(
    private val documentos: DocumentosRepositorio,
    private val sesion: SesionRepositorio,
    guardado: SavedStateHandle,
) : ViewModel() {

    val tipo: String = guardado["tipo"] ?: "ats"
    private val vehiculo: String? = guardado.get<String>("vehiculo")?.takeIf { it.isNotBlank() }
    private val titulo: String? = guardado.get<String>("titulo")?.takeIf { it.isNotBlank() }
    private val fecha: LocalDate = guardado.get<String>("fecha")?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: Peru.hoy()
    private val clave = tipo + "|" + (vehiculo ?: "") + "|" + (titulo ?: "")

    private val _estado = MutableStateFlow(EstadoDocumento())
    val estado: StateFlow<EstadoDocumento> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                val doc = documentos.delDia(cuadrilla.servicioId, cuadrilla.id, fecha).firstOrNull { it.clave == clave }
                    ?: DocumentoDelDia(cuadrilla.id, fecha.toString(), tipo, vehiculo, null, titulo)
                val remotas = doc.documentoId?.let { id ->
                    documentos.paginas(id).map { p -> Pagina(p.clientId, documentos.enlace(p.ruta) ?: "", false) }
                } ?: emptyList()
                val locales = documentos.paginasLocales(cuadrilla.id, fecha, clave)
                    .map { f -> Pagina(f.nameWithoutExtension, f, true) }
                _estado.update { it.copy(documento = doc, paginas = remotas + locales, cargando = false) }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun abrirCamara(si: Boolean) = _estado.update { it.copy(camara = si) }
    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
    fun archivoTemporal(): File = documentos.archivoTemporal()

    fun guardarFoto(toma: File) {
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                documentos.cargarPagina(cuadrilla.servicioId, cuadrilla.id, fecha, tipo, toma, vehiculo, titulo)
            }.onSuccess {
                _estado.update { it.copy(guardando = false, aviso = "Página guardada. Se enviará al haber señal.") }
                cargar()
            }.onFailure { f -> _estado.update { it.copy(guardando = false, error = f.enCristiano()) } }
        }
    }

    fun quitar(pagina: Pagina) {
        viewModelScope.launch {
            runCatching { documentos.quitarPagina(pagina.clientId) }
                .onSuccess { _estado.update { it.copy(aviso = "Página quitada.") }; cargar() }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    fun fallo(m: String) = _estado.update { it.copy(error = m, guardando = false) }
}

/**
 * Un documento del día: la foto del formato físico, una o varias páginas.
 * Elvis: «ingreso a uno de esos apartados y simplemente debo guardar las
 * fotos nada más».
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun PantallaDocumento(
    vm: DocumentoViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    val contexto = LocalContext.current
    val permiso = rememberPermissionState(Manifest.permission.CAMERA)
    var ampliada by remember { mutableStateOf<Pagina?>(null) }
    var quitando by remember { mutableStateOf<Pagina?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.error ?: estado.aviso)?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    val doc = estado.documento
    val editable = doc?.estado != "conforme"

    Scaffold(
        snackbarHost = { SnackbarHost(avisos) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(doc?.nombre ?: "Documento", style = MaterialTheme.typography.titleMedium)
                        Text(
                            doc?.fecha?.let { runCatching { Peru.fechaLarga(LocalDate.parse(it)) }.getOrNull() } ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.75f),
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { if (estado.camara) vm.abrirCamara(false) else alVolver() }) {
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
        if (estado.camara && permiso.status.isGranted) {
            Box(Modifier.fillMaxSize().padding(relleno).background(Color.Black)) {
                var disparo by remember { mutableStateOf<ImageCapture?>(null) }
                VisorDeCamara(onListo = { disparo = it })
                Text(
                    "Encuadra la hoja completa, sin sombras",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.align(Alignment.TopCenter).padding(12.dp)
                        .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                )
                Disparador(
                    habilitado = disparo != null && !estado.guardando,
                    guardando = estado.guardando,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 28.dp),
                    alDisparar = {
                        val destino = vm.archivoTemporal()
                        disparo?.takePicture(
                            ImageCapture.OutputFileOptions.Builder(destino).build(),
                            ContextCompat.getMainExecutor(contexto),
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                                    vm.guardarFoto(destino)
                                    vm.abrirCamara(false)
                                }
                                override fun onError(e: ImageCaptureException) {
                                    vm.fallo("No se pudo tomar la foto. Vuelve a intentarlo.")
                                }
                            },
                        )
                    },
                )
            }
            return@Scaffold
        }

        Column(
            Modifier.fillMaxSize().padding(relleno).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (estado.cargando) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                return@Column
            }
            doc?.let { EstadoDelDocumento(it) }

            if (doc?.estado == "observado" && !doc.observacion.isNullOrBlank()) {
                Row(
                    Modifier.fillMaxWidth()
                        .background(Semaforo.Vencido.copy(alpha = 0.08f), RoundedCornerShape(10.dp))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = Semaforo.Vencido)
                    Column {
                        Text("Observación SSOMA", style = MaterialTheme.typography.labelLarge, color = Semaforo.Vencido)
                        Text(doc.observacion, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "Toma la foto del formato corregido: vuelve a revisión.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Text(
                if (estado.paginas.isEmpty()) "Todavía no hay fotos de este formato."
                else "${estado.paginas.size} página(s)",
                style = MaterialTheme.typography.titleSmall,
            )
            if (estado.paginas.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(estado.paginas, key = { it.clientId }) { p ->
                        Box {
                            AsyncImage(
                                model = p.modelo,
                                contentDescription = "Página",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(110.dp, 146.dp).clip(RoundedCornerShape(10.dp))
                                    .background(Color(0xFFE6E8EC)).clickable { ampliada = p },
                            )
                            if (p.enTelefono) {
                                Text(
                                    "Por enviar",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White,
                                    modifier = Modifier.align(Alignment.BottomStart)
                                        .background(Marca.Naranja.copy(alpha = 0.9f)).padding(horizontal = 5.dp, vertical = 1.dp),
                                )
                            }
                            if (editable) {
                                Box(
                                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(30.dp)
                                        .clip(RoundedCornerShape(15.dp))
                                        .background(Color.Black.copy(alpha = 0.55f))
                                        .clickable { quitando = p },
                                    contentAlignment = Alignment.Center,
                                ) { Icon(Icons.Outlined.Close, contentDescription = "Quitar", tint = Color.White, modifier = Modifier.size(18.dp)) }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f))
            if (editable) {
                Button(
                    onClick = {
                        if (permiso.status.isGranted) vm.abrirCamara(true) else permiso.launchPermissionRequest()
                    },
                    enabled = !estado.guardando,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Marca.VerdeBandera),
                ) {
                    Text(
                        when {
                            doc?.estado == "observado" -> "Tomar foto del formato corregido"
                            estado.paginas.isEmpty() -> "Tomar foto del formato"
                            else -> "Agregar otra página"
                        },
                        style = MaterialTheme.typography.titleSmall,
                    )
                }
            } else {
                Text(
                    "SSOMA dio este documento por conforme.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    ampliada?.let { p ->
        Dialog(onDismissRequest = { ampliada = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black).clickable { ampliada = null }) {
                AsyncImage(model = p.modelo, contentDescription = "Página", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            }
        }
    }

    quitando?.let { p ->
        AlertDialog(
            onDismissRequest = { quitando = null },
            title = { Text("¿Quitar esta página?") },
            text = { Text("Úsalo si la foto salió borrosa o es de otro formato.") },
            confirmButton = { TextButton(onClick = { vm.quitar(p); quitando = null }) { Text("Quitar") } },
            dismissButton = { TextButton(onClick = { quitando = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
fun EstadoDelDocumento(doc: DocumentoDelDia) {
    val color = colorDelEstado(doc)
    Text(
        doc.estadoLegible,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

fun colorDelEstado(doc: DocumentoDelDia): Color = when {
    doc.falta -> Semaforo.Vencido
    doc.porEnviar > 0 -> Marca.Naranja
    doc.estado in setOf("conforme", "validado") -> Semaforo.Levantado
    doc.estado in setOf("pendiente_revision", "subsanado", "enviado") -> Marca.Azul
    doc.estado == "borrador" -> Semaforo.PorVencer
    else -> Color(0xFF616161)
}

/**
 * El acceso a la foto del formato desde su apartado: lo principal es la foto
 * del papel; el formulario digital queda como opción.
 */
@Composable
fun AccesoAFoto(titulo: String, detalle: String, alTocar: () -> Unit) {
    Card(
        onClick = alTocar,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Marca.VerdeBandera.copy(alpha = 0.10f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Icon(
                androidx.compose.material.icons.Icons.Outlined.PhotoCamera,
                contentDescription = null,
                tint = Marca.VerdeBandera,
                modifier = Modifier.size(30.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(titulo, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(detalle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
