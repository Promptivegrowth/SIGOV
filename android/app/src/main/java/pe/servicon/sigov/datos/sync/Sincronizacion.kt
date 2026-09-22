package pe.servicon.sigov.datos.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.ArchivoDao
import pe.servicon.sigov.datos.local.ArchivoPendiente
import pe.servicon.sigov.datos.local.ColaDao
import pe.servicon.sigov.datos.local.EnvioPendiente
import pe.servicon.sigov.datos.local.EstadoEnvio
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min
import kotlin.math.pow

/**
 * Qué columna del hijo apunta a su padre.
 *
 * Una foto no puede subir antes que el registro al que pertenece, y ese
 * registro necesita el identificador real que la nube le dio a su parte. Aquí
 * se dice, para cada pareja, dónde se pega ese identificador.
 */
private val LLAVE_DEL_PADRE: Map<String, Map<String, String>> = mapOf(
    "work_entries" to mapOf("work_orders" to "work_order_id"),
    "evidences" to mapOf("work_entries" to "work_entry_id"),
    "ats_signatures" to mapOf("ats_iperc" to "ats_id"),
    "checklist_responses" to mapOf("work_orders" to "work_order_id"),
    "supply_request_items" to mapOf("supply_requests" to "request_id"),
    "talk_attendance" to mapOf("safety_talks" to "talk_id"),
)

const val MAX_INTENTOS = 8
private const val ESPERA_BASE_MS = 2_000L
private const val ESPERA_MAXIMA_MS = 300_000L

/**
 * La cola de envío de SIGOV.
 *
 * Todo lo que el capataz registra entra aquí primero. El trabajador de fondo
 * la vacía cuando hay conexión, y si algo falla lo reintenta espaciando cada
 * vez más los intentos, para no gastar batería golpeando una red que no está.
 */
@Singleton
class ColaRepositorio @Inject constructor(
    private val cola: ColaDao,
    private val archivos: ArchivoDao,
    @ApplicationContext private val contexto: Context,
) {
    val pendientes: Flow<Int> =
        combine(cola.cuantosPendientes(), archivos.cuantosSinSubir()) { registros, fotos ->
            registros + fotos
        }

    /** Lo que sigue en la cola, para mostrarlo tal cual en Sincronización. */
    val enEspera: Flow<List<EnvioPendiente>> = cola.enEspera()

    /** Cuántos fallaron y van a reintentarse. */
    val conError: Flow<Int> = cola.cuantosConError()

    /** El momento del último envío que sí llegó. */
    val ultimoEnvio: Flow<Long?> = cola.ultimoEnvio()

    /** Fotos y firmas todavía sin subir. */
    val archivosPendientes: Flow<Int> = archivos.cuantosSinSubir()

    /**
     * Empuja la cola ahora mismo.
     *
     * El reintento automático espacia cada vez más los intentos para no
     * gastar batería contra una red que no está; cuando el capataz llega al
     * campamento y ve señal, no tiene por qué esperar ese compás.
     */
    suspend fun sincronizarAhora() {
        // Lo que se había rendido vuelve a la cola: pulsar el botón es una
        // decisión de la persona, no el reintento automático que se frenó.
        cola.revivirFallidos(System.currentTimeMillis())
        pedirSincronizacion(contexto)
    }

    /** Deja un registro listo para subir. Devuelve su identificador propio. */
    suspend fun encolar(
        tabla: String,
        cuerpo: JsonObject,
        etiqueta: String,
        clientId: String = UUID.randomUUID().toString(),
        dependeDe: String? = null,
    ): String {
        val conId = buildJsonObject {
            cuerpo.forEach { (k, v) -> put(k, v) }
            put("client_id", clientId)
        }
        cola.encolar(
            EnvioPendiente(
                clientId = clientId,
                tabla = tabla,
                cuerpo = Json.encodeToString(JsonObject.serializer(), conId),
                etiqueta = etiqueta,
                dependeDe = dependeDe,
                proximoIntento = System.currentTimeMillis(),
            )
        )
        pedirSincronizacion(contexto)
        return clientId
    }

    /** Asocia un archivo —una foto, una firma— a un registro de la cola. */
    suspend fun adjuntar(
        clientId: String,
        bucket: String,
        rutaDestino: String,
        archivoLocal: File,
        tipoMime: String = "image/webp",
    ) {
        archivos.agregar(
            ArchivoPendiente(
                clientId = clientId,
                bucket = bucket,
                rutaDestino = rutaDestino,
                rutaLocal = archivoLocal.absolutePath,
                tipoMime = tipoMime,
                tamano = archivoLocal.length(),
            )
        )
    }
}

/**
 * El trabajo de subir la cola, que Android ejecuta cuando hay red —aunque la
 * aplicación esté cerrada.
 */
@HiltWorker
class TrabajadorSincronizacion @AssistedInject constructor(
    @Assisted contexto: Context,
    @Assisted parametros: WorkerParameters,
    private val cola: ColaDao,
    private val archivos: ArchivoDao,
    private val supabase: SupabaseClient,
) : CoroutineWorker(contexto, parametros) {

    override suspend fun doWork(): Result {
        val ahora = System.currentTimeMillis()
        val porEnviar = cola.porEnviar(ahora, MAX_INTENTOS)
        if (porEnviar.isEmpty()) return Result.success()

        val yaSubidos = cola.yaEnviados().toMutableSet()
        var fallaron = 0

        for (envio in porEnviar) {
            // Un hijo espera a que su padre exista en la nube
            if (envio.dependeDe != null && envio.dependeDe !in yaSubidos) continue

            cola.actualizar(envio.copy(estado = EstadoEnvio.ENVIANDO))

            runCatching {
                var cuerpo = Json.decodeFromString(JsonObject.serializer(), envio.cuerpo)

                // Si depende de un padre, se le pega el identificador real
                envio.dependeDe?.let { padreId ->
                    val padre = cola.porId(padreId)
                    val llave = padre?.tabla?.let { LLAVE_DEL_PADRE[envio.tabla]?.get(it) }
                    if (padre?.idEnServidor != null && llave != null) {
                        cuerpo = buildJsonObject {
                            cuerpo.forEach { (k, v) -> put(k, v) }
                            put(llave, padre.idEnServidor)
                        }
                    }
                }

                // `client_id` es la llave del reintento: si el mismo envío
                // llega dos veces por un corte, la nube actualiza en vez de
                // duplicar.
                val respuesta = supabase.postgrest
                    .from(envio.tabla)
                    .upsert(cuerpo, onConflict = "client_id") { select() }
                    .decodeSingle<JsonObject>()

                val idServidor = respuesta["id"]?.jsonPrimitive?.content

                cola.actualizar(
                    envio.copy(
                        estado = EstadoEnvio.ENVIADO,
                        idEnServidor = idServidor,
                        enviadoEn = System.currentTimeMillis(),
                        ultimoError = null,
                    )
                )
                yaSubidos += envio.clientId

                // Y detrás del registro, su archivo
                archivos.pendiente(envio.clientId)?.let { archivo ->
                    val fichero = File(archivo.rutaLocal)
                    if (fichero.exists()) {
                        supabase.storage.from(archivo.bucket)
                            .upload(archivo.rutaDestino, fichero.readBytes(), upsert = true)
                        archivos.marcarSubido(archivo.clientId)
                    }
                }
            }.onFailure { fallo ->
                fallaron++
                val intentos = envio.intentos + 1
                cola.actualizar(
                    envio.copy(
                        estado = EstadoEnvio.ERROR,
                        intentos = intentos,
                        proximoIntento = System.currentTimeMillis() + espera(intentos),
                        ultimoError = fallo.message,
                    )
                )
            }
        }

        // Lo ya enviado se conserva una semana por si hay que rastrear algo
        cola.limpiarViejos(ahora - 7 * 24 * 3600_000L)

        return if (fallaron > 0) Result.retry() else Result.success()
    }

    /** Cada intento falla más espaciado: de 2 segundos hasta 5 minutos. */
    private fun espera(intentos: Int): Long =
        min(ESPERA_BASE_MS * 2.0.pow(intentos).toLong(), ESPERA_MAXIMA_MS)
}

/** Pide a Android que suba la cola en cuanto haya red. */
fun pedirSincronizacion(contexto: Context) {
    val trabajo = OneTimeWorkRequestBuilder<TrabajadorSincronizacion>()
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
        .build()

    WorkManager.getInstance(contexto).enqueueUniqueWork(
        "sigov-sincronizacion",
        ExistingWorkPolicy.APPEND_OR_REPLACE,
        trabajo,
    )
}

/** Un repaso periódico, por si quedó algo sin subir. */
fun programarSincronizacionPeriodica(contexto: Context) {
    val trabajo = PeriodicWorkRequestBuilder<TrabajadorSincronizacion>(15, TimeUnit.MINUTES)
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .build()

    WorkManager.getInstance(contexto).enqueueUniquePeriodicWork(
        "sigov-sincronizacion-periodica",
        ExistingPeriodicWorkPolicy.KEEP,
        trabajo,
    )
}
