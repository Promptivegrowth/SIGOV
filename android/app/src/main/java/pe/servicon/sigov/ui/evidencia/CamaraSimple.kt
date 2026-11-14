package pe.servicon.sigov.ui.evidencia

import androidx.activity.compose.BackHandler
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.io.File

/**
 * La cámara de SIGOV para una sola foto (inventario vial, observaciones de
 * campo), en lugar de la cámara del teléfono (Elvis, 26/10): solo dispara
 * en horizontal, la vista previa enseña el encuadre completo de la foto y,
 * al disparar, vuelve sola con la foto. La de la galería del teléfono se
 * quedaba en vertical, salía con otro encuadre y a veces no volvía.
 */
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CamaraSimple(
    titulo: String,
    destino: () -> File,
    alTomar: (File) -> Unit,
    alCerrar: () -> Unit,
    /** Un formato en papel se fotografía en vertical (REV3-OBS-45). */
    soloHorizontal: Boolean = true,
    /**
     * Como las cámaras de PCI y Programación (OBS 13): la ubicación con su
     * precisión, lo que se imprimirá y qué se fotografía (código, tramo,
     * progresiva). Sin ellos, la cámara simple de siempre (formatos).
     */
    gps: String? = null,
    buscandoGps: Boolean = false,
    sello: pe.servicon.sigov.datos.Sello? = null,
    identificacion: String? = null,
) {
    val contexto = LocalContext.current
    val permiso = rememberPermissionState(android.Manifest.permission.CAMERA)
    LaunchedEffect(Unit) { if (!permiso.status.isGranted) permiso.launchPermissionRequest() }
    var disparo by remember { mutableStateOf<ImageCapture?>(null) }
    var tomando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val giro by rememberGiroDelEquipo()
    val horizontal = !soloHorizontal || giro == android.view.Surface.ROTATION_90 || giro == android.view.Surface.ROTATION_270

    // La toma sale en la orientación en que se sostiene el celular
    LaunchedEffect(giro, disparo) { disparo?.targetRotation = giro }
    BackHandler(onBack = alCerrar)

    Dialog(onDismissRequest = alCerrar, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (permiso.status.isGranted) {
                VisorDeCamara(onListo = { disparo = it })
                BotonDeFlash(disparo, Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 60.dp, end = 12.dp))
                if (gps != null || buscandoGps) {
                    SelloEnVivo(
                        buscando = buscandoGps, coordenadas = gps,
                        modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(top = 112.dp, start = 12.dp),
                    )
                }
                identificacion?.let {
                    Text(
                        it, color = Color.White, style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(top = 162.dp, start = 12.dp, end = 12.dp)
                            .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
                if (sello?.activo == true) {
                    SelloPrevio(
                        fechaEditada = null, extras = sello.extras,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 118.dp),
                    )
                }
                if (!horizontal) AvisoDeGirar(Modifier.align(Alignment.Center))
                // También una foto que ya existe en la galería (OBS 2)
                BotonDeGaleria(
                    destino = destino,
                    alElegir = alTomar,
                    modifier = Modifier.align(Alignment.BottomStart).padding(start = 20.dp, bottom = 44.dp),
                )
                Disparador(
                    habilitado = disparo != null && !tomando && horizontal,
                    guardando = tomando,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 32.dp),
                    alDisparar = {
                        val archivo = destino()
                        tomando = true
                        disparo?.takePicture(
                            ImageCapture.OutputFileOptions.Builder(archivo).build(),
                            ContextCompat.getMainExecutor(contexto),
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                                    tomando = false
                                    alTomar(archivo)
                                }
                                override fun onError(e: ImageCaptureException) {
                                    tomando = false
                                    error = "No se pudo tomar la foto. Vuelve a intentarlo."
                                }
                            },
                        )
                    },
                )
            } else {
                Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("La cámara necesita tu permiso", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { permiso.launchPermissionRequest() }) { Text("Dar permiso") }
                }
            }
            Row(
                Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.55f)).statusBarsPadding().padding(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = alCerrar) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Volver", tint = Color.White) }
                Text(titulo, color = Color.White, style = MaterialTheme.typography.titleSmall)
            }
            error?.let {
                Text(
                    it, color = Color.White, style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 72.dp)
                        .background(Color(0xFFB3261E), RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
}
