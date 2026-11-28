package pe.servicon.sigov.datos.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.*
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.coroutines.flow.first
import io.github.jan.supabase.gotrue.auth
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.Configuracion
import pe.servicon.sigov.datos.TABLA_ORIGINAL
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.redSinCosto
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
    "parte_recursos" to mapOf("work_orders" to "work_order_id", "work_entries" to "work_entry_id"),
    "evidences" to mapOf("work_entries" to "work_entry_id", "observaciones_campo" to "observacion_id"),
    "ats_signatures" to mapOf("ats_iperc" to "ats_id"),
    "checklist_responses" to mapOf("work_orders" to "work_order_id"),
    "supply_request_items" to mapOf("supply_requests" to "request_id"),
    "talk_attendance" to mapOf("safety_talks" to "talk_id"),
    "movimientos_cuadrilla" to mapOf("work_entries" to "work_entry_id", "work_orders" to "work_order_id"),
)

/**
 * La llave natural de una tabla, cuando la nube tiene una además del
 * `client_id`.
 *
 * El parte diario es único por contrato, cuadrilla y fecha. Si el equipo
 * abrió el parte estando sin señal y mientras tanto ya existía en la nube
 * —lo abrió el supervisor, o el mismo capataz desde el panel—, el envío
 * choca contra esa restricción y el parte se queda atascado para siempre,
 * arrastrando consigo todo lo que se registró debajo.
 */
private val LLAVE_NATURAL: Map<String, List<String>> = mapOf(
    "work_orders" to listOf("service_id", "crew_id", "work_date"),
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
    private val configuracion: Configuracion,
    private val partesLocales: pe.servicon.sigov.datos.local.ParteDao,
    private val supabaseCliente: SupabaseClient,
) {
    /**
     * Lo que ya existe en la nube (un parte o una actividad bajados para
     * consultarlos): queda como enviado, para que lo que se registre debajo
     * se amarre a su id real sin volver a crearlo. No se muestra en la
     * bandeja de Sincronización (enviadoEn = 0).
     */
    suspend fun registrarEnNube(tabla: String, clientId: String, idServidor: String, etiqueta: String) {
        if (cola.porId(clientId) != null) return
        cola.encolar(
            EnvioPendiente(
                clientId = clientId, tabla = tabla, cuerpo = "{}", etiqueta = etiqueta,
                estado = EstadoEnvio.ENVIADO, idEnServidor = idServidor, creadoEn = 0, enviadoEn = 0,
            )
        )
    }

    /**
     * El parte del día se manda a la nube recién cuando se registra algo
     * en él (ronda 5): abrir una fecha para mirarla ya no deja un borrador
     * vacío en el servidor ni cambia Mi Jornada a «En borrador».
     */
    suspend fun asegurarParte(parteClientId: String) {
        if (cola.porId(parteClientId) != null) return
        val parte = partesLocales.parteDe(parteClientId) ?: return
        if (parte.idEnServidor != null) {
            registrarEnNube("work_orders", parte.clientId, parte.idEnServidor, "Parte del ${parte.fecha}")
            return
        }
        val quien = runCatching { supabaseCliente.auth.currentUserOrNull()?.id }.getOrNull()
        encolar(
            tabla = "work_orders",
            clientId = parte.clientId,
            etiqueta = "Parte del ${parte.fecha}",
            cuerpo = kotlinx.serialization.json.buildJsonObject {
                put("service_id", kotlinx.serialization.json.JsonPrimitive(parte.servicioId))
                parte.cuadrillaId?.let { put("crew_id", kotlinx.serialization.json.JsonPrimitive(it)) }
                put("work_date", kotlinx.serialization.json.JsonPrimitive(parte.fecha))
                put("status", kotlinx.serialization.json.JsonPrimitive("borrador"))
                quien?.let { put("created_by", kotlinx.serialization.json.JsonPrimitive(it)) }
            },
        )
    }
    val pendientes: Flow<Int> =
        combine(cola.cuantosPendientes(), archivos.cuantosSinSubir()) { registros, fotos ->
            registros + fotos
        }

    /** Lo que sigue en la cola, para mostrarlo tal cual en Sincronización. */
    val enEspera: Flow<List<EnvioPendiente>> = cola.enEspera()

    /** Lo que se encoló con ese id, si el equipo todavía lo guarda. */
    suspend fun envio(clientId: String): EnvioPendiente? = cola.porId(clientId)

    /** Lo de una tabla (o acción «rpc:…») que todavía no llega a la nube. */
    suspend fun sinConfirmar(tabla: String): List<EnvioPendiente> = cola.sinConfirmarDe(tabla)

    /** Descarta lo que todavía no salió del teléfono: el registro y su archivo. */
    suspend fun descartar(clientId: String) {
        cola.borrar(clientId)
        archivos.borrar(clientId)
    }

    /** Cuántos fallaron y van a reintentarse. */
    val conError: Flow<Int> = cola.cuantosConError()

    /** El momento del último envío que sí llegó. */
    val ultimoEnvio: Flow<Long?> = cola.ultimoEnvio()

    /** Fotos y firmas todavía sin subir. */
    val archivosPendientes: Flow<Int> = archivos.cuantosSinSubir()

    /** Originales de fotos que esperan subir (con Wi-Fi, por omisión). */
    val originalesPorSubir: Flow<Int> = cola.cuantosOriginales()

    /** La bandeja: lo pendiente y lo sincronizado en las últimas 48 horas (OBS-52). */
    val bandeja: Flow<List<EnvioPendiente>> =
        cola.recientes(System.currentTimeMillis() - 48 * 3600_000L)

    /** Los registros a los que todavía les falta subir su archivo. */
    val conArchivoPendiente: Flow<Set<String>> = archivos.sinSubir().map { it.toSet() }

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
        // Lo «Enviando…» lo revive el trabajador al empezar, ya con el candado:
        // revivirlo aquí podía mandar dos veces un envío que estaba en camino
        pedirSincronizacion(contexto, ahora = true)
    }

    /** Deja un registro listo para subir. Devuelve su identificador propio. */
    suspend fun encolar(
        tabla: String,
        cuerpo: JsonObject,
        etiqueta: String,
        clientId: String = UUID.randomUUID().toString(),
        dependeDe: String? = null,
    ): String {
        // Lo de un parte que aún no está en la cola: primero el parte
        if (dependeDe != null && tabla != "work_orders") asegurarParte(dependeDe)
        // Con la cuenta compartida, el avance dice quién usaba el celular
        // al registrarlo: el jefe o el subjefe (0124)
        val quien = configuracion.quienUsa.value
        val conId = buildJsonObject {
            cuerpo.forEach { (k, v) -> put(k, v) }
            put("client_id", clientId)
            if (tabla == "work_entries" && quien != null && "ejecutado_por" !in cuerpo) put("ejecutado_por", quien)
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
/** El candado del trabajador: una sola sincronización a la vez en el proceso. */
private val candado = kotlinx.coroutines.sync.Mutex()

/** El último latido y el contrato al que se reporta (se piden una vez por proceso). */
private var ultimoLatido = 0L
private var servicioDelLatido: String? = null

@HiltWorker
class TrabajadorSincronizacion @AssistedInject constructor(
    @Assisted contexto: Context,
    @Assisted parametros: WorkerParameters,
    private val cola: ColaDao,
    private val archivos: ArchivoDao,
    private val supabase: SupabaseClient,
    private val configuracion: Configuracion,
) : CoroutineWorker(contexto, parametros) {

    // Un solo trabajador a la vez, aunque Android lance el inmediato, el
    // reintento y el periódico juntos: dos corridas podían mandar el mismo
    // envío dos veces (REV3-OBS-12)
    override suspend fun doWork(): Result = candado.withLock { trabajar() }

    /**
     * Lo enviado se marca sobre la fila de ahora, no sobre la que se leyó al
     * empezar: si el capataz corrigió el metrado mientras el envío iba en
     * camino, la corrección queda en cola y sube detrás, en vez de perderse.
     */
    private suspend fun marcar(envio: EnvioPendiente, cambio: (EnvioPendiente) -> EnvioPendiente, alEnviar: Boolean = false) {
        val ahora = cola.porId(envio.clientId) ?: return
        val corregido = ahora.cuerpo != envio.cuerpo
        cola.actualizar(
            if (alEnviar && corregido) cambio(ahora).copy(estado = EstadoEnvio.PENDIENTE, proximoIntento = 0)
            else cambio(ahora)
        )
    }

    private suspend fun trabajar(): Result {
        val ahora = System.currentTimeMillis()
        // Solo corre un trabajador a la vez: lo que esté «Enviando…» al
        // empezar quedó a medias de una corrida que Android cortó
        cola.revivirEnvios(ahora)
        val porEnviar = cola.porEnviar(ahora, MAX_INTENTOS)
        if (porEnviar.isEmpty()) {
            latido(0, 0)
            return Result.success()
        }

        val yaSubidos = cola.yaEnviados().toMutableSet()
        var fallaron = 0
        var enviados = 0
        // Los originales de las fotos pesan ~3 MB: por omisión esperan al
        // Wi-Fi para no gastar los datos de la cuadrilla (OBS-23)
        val subirOriginales = when (configuracion.modoOriginales.value) {
            pe.servicon.sigov.datos.ModoOriginales.WIFI_Y_DATOS -> true
            pe.servicon.sigov.datos.ModoOriginales.SOLO_WIFI -> redSinCosto(applicationContext)
            pe.servicon.sigov.datos.ModoOriginales.MANUAL -> false
        } || configuracion.subirOriginalesUnaVez
        configuracion.subirOriginalesUnaVez = false

        for (envio in porEnviar) {
            // Un hijo espera a que su padre exista en la nube
            if (envio.dependeDe != null && envio.dependeDe !in yaSubidos) continue
            if (envio.tabla == TABLA_ORIGINAL && !subirOriginales) continue

            marcar(envio, { it.copy(estado = EstadoEnvio.ENVIANDO) })

            runCatching {
                // Las llaves con «_» son solo para mostrar en el teléfono
                var cuerpo = Json.decodeFromString(JsonObject.serializer(), envio.cuerpo)
                    .let { o -> JsonObject(o.filterKeys { !it.startsWith("_") }) }

                // El avance lleva el celular que lo hizo: con la cuenta
                // compartida, dos celulares no son una copia (0121)
                if (envio.tabla == "work_entries" && "dispositivo" !in cuerpo) {
                    cuerpo = buildJsonObject {
                        cuerpo.forEach { (k, v) -> put(k, v) }
                        put("dispositivo", configuracion.idDeInstalacion)
                    }
                }

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

                // Una acción, no un registro: «rpc:<función>» llama a esa
                // función de la base con el cuerpo como parámetros. Así se
                // encolan sin señal cosas como quitar una foto, que pasan por
                // las reglas de la base y no por un UPDATE directo.
                if (envio.tabla.startsWith("rpc:")) {
                    // Si la acción lleva archivo (la foto de un documento), el
                    // archivo sube primero: la base nunca apunta a una foto
                    // que no existe. Subir de nuevo en un reintento no duplica.
                    archivos.pendiente(envio.clientId)?.let { archivo ->
                        val fichero = File(archivo.rutaLocal)
                        if (fichero.exists()) {
                            supabase.storage.from(archivo.bucket)
                                .upload(archivo.rutaDestino, fichero.readBytes(), upsert = true)
                            archivos.marcarSubido(archivo.clientId)
                        }
                    }
                    val parametros = buildJsonObject {
                        cuerpo.forEach { (k, v) -> if (k != "client_id") put(k, v) }
                    }
                    supabase.postgrest.rpc(envio.tabla.removePrefix("rpc:"), parametros)
                    // El original ya está en la nube: el teléfono no lo necesita
                    if (envio.tabla == TABLA_ORIGINAL) {
                        archivos.porId(envio.clientId)?.let { runCatching { File(it.rutaLocal).delete() } }
                    }
                    marcar(
                        envio, { it.copy(
                            estado = EstadoEnvio.ENVIADO,
                            enviadoEn = System.currentTimeMillis(),
                            ultimoError = null,
                        ) }, alEnviar = true,
                    )
                    yaSubidos += envio.clientId
                    enviados++
                    return@runCatching
                }

                // Primero el archivo y después el registro (OBS 12): si la
                // subida se corta, la nube no queda apuntando a una foto que no
                // existe (la ficha mostraba una miniatura en blanco). Subir de
                // nuevo en un reintento no duplica.
                archivos.pendiente(envio.clientId)?.let { archivo ->
                    val fichero = File(archivo.rutaLocal)
                    if (fichero.exists()) {
                        supabase.storage.from(archivo.bucket)
                            .upload(archivo.rutaDestino, fichero.readBytes(), upsert = true)
                        archivos.marcarSubido(archivo.clientId)
                    } else if (envio.tabla == "evidences") {
                        error("La foto ya no está en el teléfono: vuelve a tomarla.")
                    }
                }

                // Si la tabla tiene llave natural, primero se mira si ese
                // registro ya existe en la nube. Existir no es un error: el
                // parte del día es uno solo, lo abra quien lo abra.
                val existente = LLAVE_NATURAL[envio.tabla]?.let { llaves ->
                    val valores = llaves.associateWith { cuerpo[it]?.jsonPrimitive?.contentOrNull }
                    if (valores.values.any { it == null }) null
                    else supabase.postgrest.from(envio.tabla)
                        .select {
                            filter { valores.forEach { (k, v) -> eq(k, v!!) } }
                            limit(1)
                        }
                        .decodeList<JsonObject>()
                        .firstOrNull()
                }

                // `client_id` es la llave del reintento: si el mismo envío
                // llega dos veces por un corte, la nube actualiza en vez de
                // duplicar.
                val respuesta = existente ?: supabase.postgrest
                    .from(envio.tabla)
                    .upsert(cuerpo, onConflict = "client_id") { select() }
                    .decodeSingle<JsonObject>()

                val idServidor = respuesta["id"]?.jsonPrimitive?.content

                marcar(
                    envio, { it.copy(
                        estado = EstadoEnvio.ENVIADO,
                        idEnServidor = idServidor,
                        enviadoEn = System.currentTimeMillis(),
                        ultimoError = null,
                    ) }, alEnviar = true,
                )
                yaSubidos += envio.clientId
                enviados++

            }.onFailure { fallo ->
                fallaron++
                val intentos = envio.intentos + 1
                marcar(
                    envio, { it.copy(
                        estado = EstadoEnvio.ERROR,
                        intentos = intentos,
                        proximoIntento = System.currentTimeMillis() + espera(intentos),
                        ultimoError = fallo.enCristiano(),
                    ) },
                )
            }
        }

        // Lo ya enviado se conserva una semana por si hay que rastrear algo
        cola.limpiarViejos(ahora - 7 * 24 * 3600_000L)

        // Cada registro ya espera su turno (proximoIntento). Un reintento del
        // trabajo con espera exponencial dejaba todo lo nuevo detrás de un
        // registro terco durante horas: se vuelve a mirar en un minuto.
        if (fallaron > 0) pedirSincronizacionLuego(applicationContext)
        latido(enviados, fallaron)
        return Result.success()
    }

    /**
     * El latido del equipo (revisión visual 18/11, Sincronización): le dice
     * al servidor qué tiene en cola, cuántos errores y cuándo confirmó por
     * última vez. Así el Supervisor y el Administrador distinguen «en cola»,
     * «error» y «sin conexión», y si piden «Reintentar», el equipo lo recibe
     * aquí y vuelve a empujar su cola (repetir no duplica: client_id).
     */
    private suspend fun latido(enviados: Int, fallidos: Int) {
        val ahora = System.currentTimeMillis()
        if (enviados == 0 && fallidos == 0 && ahora - ultimoLatido < 5 * 60_000L) return
        runCatching {
            val uid = supabase.auth.currentUserOrNull()?.id ?: return
            val servicio = servicioDelLatido ?: supabase.postgrest.from("service_members")
                .select { filter { eq("profile_id", uid) }; limit(1) }
                .decodeList<JsonObject>().firstOrNull()?.get("service_id")?.jsonPrimitive?.contentOrNull
                ?.also { servicioDelLatido = it } ?: return
            val confirmado = cola.ultimoEnvio().first()
            val respuesta = supabase.postgrest.rpc("sync_latido", buildJsonObject {
                put("p_service", servicio)
                put("p_device", configuracion.idDeInstalacion)
                put("p_label", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                put("p_plataforma", "android")
                put("p_version", pe.servicon.sigov.BuildConfig.VERSION_NAME)
                put("p_pendientes", cola.cuantosPendientes().first())
                put("p_fotos", archivos.cuantosSinSubir().first())
                put("p_errores", cola.cuantosConError().first())
                cola.ultimoErrorTexto()?.let { put("p_ultimo_error", it.take(200)) }
                confirmado?.let { put("p_confirmado_at", java.time.Instant.ofEpochMilli(it).toString()) }
                put("p_enviados", enviados)
                put("p_fallidos", fallidos)
            }).decodeAs<JsonObject>()
            ultimoLatido = ahora
            if (respuesta["reintentar"]?.jsonPrimitive?.booleanOrNull == true) {
                // El Supervisor o el Administrador pidió reintentar: lo rendido vuelve a la cola
                cola.revivirFallidos(System.currentTimeMillis())
                pedirSincronizacion(applicationContext, ahora = true)
            }
        }
    }

    /** Cada intento falla más espaciado: de 2 segundos hasta 5 minutos. */
    private fun espera(intentos: Int): Long =
        min(ESPERA_BASE_MS * 2.0.pow(intentos).toLong(), ESPERA_MAXIMA_MS)
}

/**
 * Pide a Android que suba la cola en cuanto haya red.
 *
 * Con [ahora] (el botón «Sincronizar ahora») reemplaza el envío que estaba
 * esperando: si un registro falló, el siguiente intento quedaba en pausa
 * minutos y todo lo nuevo se ponía detrás de esa pausa.
 */
fun pedirSincronizacion(contexto: Context, ahora: Boolean = false) {
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
        if (ahora) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE,
        trabajo,
    )
}

/** Otra pasada en un minuto, para lo que falló y espera su turno. */
fun pedirSincronizacionLuego(contexto: Context) {
    val trabajo = OneTimeWorkRequestBuilder<TrabajadorSincronizacion>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setInitialDelay(1, TimeUnit.MINUTES)
        .build()
    WorkManager.getInstance(contexto).enqueueUniqueWork("sigov-sincronizacion-reintento", ExistingWorkPolicy.REPLACE, trabajo)
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
