package pe.servicon.sigov.ui.portal

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.widget.Toast
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import pe.servicon.sigov.datos.Descargas
import pe.servicon.sigov.datos.SesionRepositorio
import org.json.JSONObject
import java.io.File
import java.util.UUID
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
    // Selector de archivos con los tipos reales: antes se pasaba «.xlsx» como tipo y Android
    // no abría nada (ronda 5, TR-01); con «image/*,application/pdf» solo se veían imágenes.
    val elegirVarios = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        callbackArchivos?.onReceiveValue(uris.toTypedArray())
        callbackArchivos = null
    }
    val elegirUno = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        callbackArchivos?.onReceiveValue(uri?.let { arrayOf(it) })
        callbackArchivos = null
    }
    LaunchedEffect(ruta) {
        url = vm.entrada(ruta)
        sinSesion = url == null
    }
    // Atrás de Android (ronda 5, VIS-04): primero cierra el cuadro, menú o búsqueda abierta en la
    // web; luego vuelve a la página anterior; y solo al final sale. Antes se evaluaba una sola vez
    // al componer y, con un cuadro abierto, salía de SIGOV.
    val despachador = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    DisposableEffect(despachador, web) {
        val w = web
        val cb = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                fun salir() { isEnabled = false; despachador?.onBackPressed(); isEnabled = true }
                if (w == null) { salir(); return }
                w.evaluateJavascript("(window.__sigovAtras&&window.__sigovAtras())||false") { r ->
                    if (r == "true") return@evaluateJavascript
                    if (w.canGoBack()) w.goBack() else salir()
                }
            }
        }
        despachador?.addCallback(cb)
        onDispose { cb.remove() }
    }

    Box(Modifier.fillMaxSize()) {
        if (sinSesion) {
            Text("La sesión no está disponible. Sal y vuelve a entrar.", Modifier.align(Alignment.Center))
        }
        url?.let { destino ->
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        // Alto fijo al contenedor: con WRAP_CONTENT el WebView resolvía 100vh en 0 y
                        // los cuadros, el visor de fotos, la búsqueda y los mapas se veían vacíos (ronda 5).
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        settings.userAgentString = settings.userAgentString + " SIGOV-App"
                        val puente = PuenteArchivos(ctx.applicationContext)
                        addJavascriptInterface(puente, "SigovApp")
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                // Todo SIGOV se queda dentro; lo externo (mapas, PDF remotos) también, para no perder el contexto
                                return false
                            }
                            override fun onPageStarted(view: WebView, u: String?, favicon: android.graphics.Bitmap?) { puente.urlActual = u }
                            override fun doUpdateVisitedHistory(view: WebView, u: String?, isReload: Boolean) { puente.urlActual = u }
                        }
                        // Archivos remotos (PDF u originales con enlace firmado): a Descargas/SIGOV con aviso
                        setDownloadListener { enlace, _, disposicion, mime, _ ->
                            if (!enlace.startsWith("http")) return@setDownloadListener
                            runCatching {
                                val nombre = Descargas.nombreSeguro(URLUtil.guessFileName(enlace, disposicion, mime))
                                val pedido = DownloadManager.Request(Uri.parse(enlace))
                                    .setTitle(nombre)
                                    .setMimeType(Descargas.mimeDe(nombre, mime))
                                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Descargas.CARPETA + "/" + nombre)
                                (ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(pedido)
                                Toast.makeText(ctx, "Descargando en Descargas/${Descargas.CARPETA}/$nombre", Toast.LENGTH_LONG).show()
                            }.onFailure { Toast.makeText(ctx, "No se pudo descargar: ${it.message}", Toast.LENGTH_LONG).show() }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) { progreso = newProgress }
                            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                                callbackArchivos?.onReceiveValue(null)
                                callbackArchivos = cb
                                val tipos = tiposMime(params.acceptTypes)
                                runCatching {
                                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) elegirVarios.launch(tipos) else elegirUno.launch(tipos)
                                }.onFailure {
                                    // Sin una app que filtre esos tipos: cualquier archivo; la web valida la extensión
                                    runCatching { elegirUno.launch(arrayOf("*/*")) }.onFailure { cb.onReceiveValue(null); callbackArchivos = null }
                                }
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

/** Los tipos que pide el campo de archivo (`accept`), como tipos MIME que Android entiende. */
internal fun tiposMime(accept: Array<String>?): Array<String> {
    val pedidos = accept.orEmpty().flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotBlank() }
    if (pedidos.isEmpty() || "*/*" in pedidos) return arrayOf("*/*")
    val r = linkedSetOf<String>()
    for (t in pedidos) {
        if (t.startsWith(".")) {
            r += Descargas.mimeDe("x$t")
            when (t) {
                // Los gestores de archivos suelen registrar las hojas como binario genérico
                ".xlsx", ".xls" -> r += listOf("application/vnd.ms-excel", "application/octet-stream", "application/zip")
                ".csv" -> r += listOf("text/comma-separated-values", "text/plain", "application/vnd.ms-excel")
                ".kml", ".kmz", ".geojson", ".gpx", ".json" -> r += listOf("application/octet-stream", "application/json", "text/xml", "application/xml")
                ".docx", ".doc" -> r += listOf("application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            }
        } else r += t
    }
    return r.toTypedArray()
}

/**
 * Puente con la web para los archivos que se arman en el navegador (PDF,
 * Excel, ZIP con `blob:`): el WebView no los descarga por sí solo. La web
 * los manda por partes en base64 y aquí se guardan en Descargas/SIGOV, o en
 * temporal para abrirlos con la app del teléfono (ronda 5, TR-05).
 * Solo responde a páginas de SIGOV.
 */
class PuenteArchivos(private val ctx: Context) {
    @Volatile var urlActual: String? = null
    private val enCurso = java.util.concurrent.ConcurrentHashMap<String, Pair<File, String>>()

    private fun permitido() = urlActual?.startsWith(BuildConfig.WEB_URL) == true

    private fun error(msg: String) = JSONObject().put("ok", false).put("error", msg).toString()

    @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun iniciar(nombre: String, mime: String): String {
        if (!permitido()) return ""
        val id = UUID.randomUUID().toString()
        val dir = File(ctx.cacheDir, "capturas/descargas").apply { mkdirs() }
        val f = File(dir, id)
        f.writeBytes(ByteArray(0))
        enCurso[id] = f to (Descargas.nombreSeguro(nombre) + "|" + mime)
        return id
    }

    @JavascriptInterface
    fun parte(id: String, base64: String): Boolean {
        val (f, _) = enCurso[id] ?: return false
        return runCatching { f.appendBytes(Base64.decode(base64, Base64.DEFAULT)) }.isSuccess
    }

    /** [modo] «guardar» → Descargas/SIGOV; «abrir» → temporal y se abre con la app del teléfono. */
    @JavascriptInterface
    fun terminar(id: String, modo: String): String {
        val (f, meta) = enCurso.remove(id) ?: return error("La descarga no se inició")
        val nombre = meta.substringBefore('|')
        val mime = Descargas.mimeDe(nombre, meta.substringAfter('|', ""))
        return runCatching {
            if (modo == "abrir") {
                val dir = File(ctx.cacheDir, "capturas/abiertos").apply { mkdirs() }
                val destino = File(dir, nombre).also { if (it.exists()) it.delete() }
                if (!f.renameTo(destino)) { f.copyTo(destino, overwrite = true); f.delete() }
                val uri = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", destino)
                Descargas.abrir(ctx, uri, mime)
                JSONObject().put("ok", true).put("nombre", nombre).put("uri", uri.toString()).put("mime", mime).toString()
            } else {
                val g = Descargas.guardar(ctx, f, nombre, mime)
                f.delete()
                JSONObject().put("ok", true).put("nombre", g.nombre).put("ruta", g.ruta).put("uri", g.uri.toString()).put("mime", g.mime).toString()
            }
        }.getOrElse { f.delete(); error(it.message ?: "No se pudo guardar el archivo") }
    }

    @JavascriptInterface
    fun abrir(uri: String, mime: String) {
        if (!permitido()) return
        runCatching { Descargas.abrir(ctx, Uri.parse(uri), mime) }
    }

    @JavascriptInterface
    fun compartir(uri: String, mime: String) {
        if (!permitido()) return
        runCatching { Descargas.compartir(ctx, Uri.parse(uri), mime) }
    }

    /** Enlaces externos (p. ej. un PDF firmado) con la app del teléfono, sin salir de la sesión. */
    @JavascriptInterface
    fun abrirEnlace(url: String) {
        if (!permitido() || !url.startsWith("http")) return
        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}
