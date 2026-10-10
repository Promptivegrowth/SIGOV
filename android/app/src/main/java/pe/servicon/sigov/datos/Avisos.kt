package pe.servicon.sigov.datos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pe.servicon.sigov.MainActivity
import pe.servicon.sigov.R
import java.time.Instant
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Un aviso para el usuario: PCI por vencer, parte observado, documento observado… */
@Serializable
data class Aviso(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val severity: String? = null,
    @SerialName("created_at") val creado: String,
    @SerialName("read_at") val leido: String? = null,
) {
    /** A qué pantalla de la app lleva tocarlo. */
    val destino: String?
        get() = when {
            type.startsWith("pci") -> "pci"
            type.startsWith("parte") -> "parte"
            type.startsWith("ssoma") -> "jornada"
            type.startsWith("vehiculo") -> "vehiculos"
            type.startsWith("deposito") -> "caja"
            else -> null
        }
}

/**
 * Los avisos que la base genera para el usuario (tabla notifications).
 *
 * Hasta ahora la app no los leía: el PCI observado por COVINCA, el parte
 * observado por el supervisor o el ítem fuera de plazo solo se veían en la
 * web, que el jefe de cuadrilla no abre (OBS-11).
 */
@Singleton
class AvisosRepositorio @Inject constructor(
    @ApplicationContext private val contexto: Context,
    private val supabase: SupabaseClient,
) {
    private val _sinLeer = MutableStateFlow(0)
    val sinLeer: StateFlow<Int> = _sinLeer.asStateFlow()

    suspend fun recientes(): List<Aviso> = withContext(Dispatchers.IO) {
        val uid = supabase.usuarioActual() ?: return@withContext emptyList()
        val lista = supabase.postgrest.from("notifications")
            .select {
                filter { eq("profile_id", uid) }
                order("created_at", Order.DESCENDING)
                limit(60)
            }
            .decodeList<Aviso>()
        _sinLeer.value = lista.count { it.leido == null }
        lista
    }

    suspend fun contarSinLeer(): Int = runCatching { recientes().count { it.leido == null } }.getOrDefault(_sinLeer.value)

    suspend fun marcarLeido(aviso: Aviso) = withContext(Dispatchers.IO) {
        if (aviso.leido != null) return@withContext
        supabase.postgrest.from("notifications")
            .update(buildJsonObject { put("read_at", Instant.now().toString()) }) { filter { eq("id", aviso.id) } }
        _sinLeer.value = (_sinLeer.value - 1).coerceAtLeast(0)
    }

    suspend fun marcarTodos() = withContext(Dispatchers.IO) {
        val uid = supabase.usuarioActual() ?: return@withContext
        supabase.postgrest.from("notifications")
            .update(buildJsonObject { put("read_at", Instant.now().toString()) }) {
                filter { eq("profile_id", uid); exact("read_at", null) }
            }
        _sinLeer.value = 0
    }

    /**
     * Publica como notificación del teléfono los avisos nuevos que aún no
     * se mostraron (lo recuerda en el equipo, para no repetirlos).
     */
    suspend fun notificarNuevos() {
        val guardado = contexto.getSharedPreferences("avisos", Context.MODE_PRIVATE)
        val ultimo = guardado.getString("ultimo_mostrado", null)
        val nuevos = recientes().filter { it.leido == null && (ultimo == null || it.creado > ultimo) }
        // La primera vez no se inunda el teléfono con lo viejo: solo lo de las últimas 24 h
        val corte = Instant.now().minusSeconds(24 * 3600).toString()
        nuevos.filter { ultimo != null || it.creado > corte }.take(5).forEach { mostrar(it) }
        recientes().maxOfOrNull { it.creado }?.let { guardado.edit().putString("ultimo_mostrado", it).apply() }
    }

    private fun mostrar(aviso: Aviso) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val gestor = contexto.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && gestor.getNotificationChannel(CANAL) == null) {
            gestor.createNotificationChannel(
                NotificationChannel(CANAL, "Avisos de SIGOV", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "PCI por vencer o fuera de plazo, observaciones del supervisor, COVINCA y SSOMA"
                },
            )
        }
        val abrir = PendingIntent.getActivity(
            contexto, aviso.id.hashCode(),
            Intent(contexto, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("destino", "avisos"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val nota = NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(aviso.title)
            .setContentText(aviso.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(aviso.body))
            .setPriority(if (aviso.severity == "danger") NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(abrir)
            .build()
        NotificationManagerCompat.from(contexto).notify(aviso.id.hashCode(), nota)
    }

    private companion object {
        const val CANAL = "sigov-avisos"
    }
}

/** Revisa los avisos cada cuarto de hora, aunque la app esté cerrada. */
@HiltWorker
class TrabajadorAvisos @AssistedInject constructor(
    @Assisted contexto: Context,
    @Assisted parametros: WorkerParameters,
    private val avisos: AvisosRepositorio,
) : CoroutineWorker(contexto, parametros) {
    override suspend fun doWork(): Result =
        runCatching { avisos.notificarNuevos() }.fold({ Result.success() }, { Result.retry() })
}

fun programarAvisos(contexto: Context) {
    val trabajo = PeriodicWorkRequestBuilder<TrabajadorAvisos>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
    WorkManager.getInstance(contexto).enqueueUniquePeriodicWork("sigov-avisos", ExistingPeriodicWorkPolicy.KEEP, trabajo)
}
