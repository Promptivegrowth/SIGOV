package pe.servicon.sigov.ui.portal

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import pe.servicon.sigov.BuildConfig
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.ui.theme.Marca
import java.net.URLEncoder
import javax.inject.Inject

/**
 * Las secciones web de cada rol dentro de la app (revisión visual 18/11,
 * T9: paridad web/móvil).
 *
 * Supervisor, Residente, Administrador, Encargado SSOMA y Visor COVINCA
 * usan en el celular los mismos módulos que en la web —mismas reglas en el
 * servidor, mismos datos—, con la barra inferior de su maqueta. La sesión
 * de la app pasa al visor web por el fragmento de /auth/app (no viaja al
 * servidor). La edición masiva y la exportación quedan en la web, como
 * indica la lámina MRPCI_04.
 */
@HiltViewModel
class PortalViewModel @Inject constructor(private val sesion: SesionRepositorio) : ViewModel() {
    suspend fun entrada(ruta: String): String? {
        val (at, rt) = sesion.llavesDeSesion() ?: return null
        val sig = URLEncoder.encode(ruta, "UTF-8")
        return "${BuildConfig.WEB_URL}/auth/app#at=$at&rt=$rt&next=$sig"
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PantallaPortal(ruta: String, vm: PortalViewModel = hiltViewModel()) {
    var url by remember(ruta) { mutableStateOf<String?>(null) }
    var progreso by remember { mutableIntStateOf(0) }
    var web by remember { mutableStateOf<WebView?>(null) }
    var sinSesion by remember { mutableStateOf(false) }
    var callbackArchivos by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val elegir = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        callbackArchivos?.onReceiveValue(uris.toTypedArray())
        callbackArchivos = null
    }
    LaunchedEffect(ruta) {
        url = vm.entrada(ruta)
        sinSesion = url == null
    }
    BackHandler(enabled = web?.canGoBack() == true) { web?.goBack() }

    Box(Modifier.fillMaxSize()) {
        if (sinSesion) {
            Text("La sesión no está disponible. Sal y vuelve a entrar.", Modifier.align(Alignment.Center))
        }
        url?.let { destino ->
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        settings.userAgentString = settings.userAgentString + " SIGOV-App"
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                // Todo SIGOV se queda dentro; lo externo (mapas, PDF remotos) también, para no perder el contexto
                                return false
                            }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) { progreso = newProgress }
                            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                                callbackArchivos?.onReceiveValue(null)
                                callbackArchivos = cb
                                val tipo = params.acceptTypes.firstOrNull { it.isNotBlank() }?.substringBefore(',') ?: "*/*"
                                runCatching { elegir.launch(tipo) }.onFailure { cb.onReceiveValue(null); callbackArchivos = null }
                                return true
                            }
                        }
                        loadUrl(destino)
                        web = this
                    }
                },
            )
            if (progreso in 1..99) {
                LinearProgressIndicator(progress = { progreso / 100f }, color = Marca.Azul, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
