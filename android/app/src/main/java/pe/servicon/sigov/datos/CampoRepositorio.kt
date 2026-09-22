package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import pe.servicon.sigov.datos.local.ParteDao
import pe.servicon.sigov.datos.local.ParteLocal
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.sync.ColaRepositorio
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * El trabajo de campo: lo que se consulta y lo que se registra.
 *
 * La regla de la casa: **se lee de la copia local y se escribe a la cola**.
 * Nunca se hace depender al capataz de que haya señal en el momento exacto en
 * que termina una partida.
 */
@Singleton
class CampoRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
    private val partes: ParteDao,
    private val cola: ColaRepositorio,
    private val ubicacion: Ubicacion,
) {

    // ─── Catálogos ────────────────────────────────────────────────────────

    /**
     * Baja al equipo lo que hace falta para llenar formularios sin señal:
     * las partidas del contrato, los tramos, las cuadrillas y las unidades.
     * Se llama al entrar y, de ahí en más, cuando hay conexión.
     */
    suspend fun bajarCatalogos(servicioId: String) = withContext(Dispatchers.IO) {
        suspend fun guardar(tabla: String, filas: List<JsonObject>, conServicio: Boolean = true) =
            espejar(tabla, if (conServicio) servicioId else null, filas)

        guardar(
            "activities_catalog",
            supabase.postgrest.from("activities_catalog")
                .select {
                    filter { eq("service_id", servicioId); exact("deleted_at", null) }
                    order("code", Order.ASCENDING)
                }
                .decodeList<JsonObject>()
        )

        guardar(
            "road_sections",
            supabase.postgrest.from("road_sections")
                .select {
                    filter { eq("service_id", servicioId); exact("deleted_at", null) }
                    order("prog_start_m", Order.ASCENDING)
                }
                .decodeList<JsonObject>()
        )

        guardar(
            "crews",
            supabase.postgrest.from("crews")
                .select { filter { eq("service_id", servicioId); exact("deleted_at", null) } }
                .decodeList<JsonObject>()
        )

        // El contrato: su nombre, el cliente y el número van en la cabecera
        // de todo formato que el equipo imprima en campo.
        guardar(
            "services",
            supabase.postgrest.from("services")
                .select { filter { eq("id", servicioId) } }
                .decodeList<JsonObject>()
        )

        guardar(
            "units",
            supabase.postgrest.from("units").select().decodeList<JsonObject>(),
            conServicio = false,
        )

        // Los ajustes del contrato bajan con los catálogos: sellar una foto
        // en la quebrada no puede depender de que haya señal para preguntar
        // qué campos lleva el sello.
        runCatching {
            val fila: JsonObject = supabase.postgrest
                .rpc("ajustes_del_servicio", buildJsonObject { put("p_service_id", servicioId) })
                .decodeAs()
            catalogo.guardar(
                listOf(
                    FilaCatalogo(
                        tabla = "ajustes",
                        id = servicioId,
                        servicioId = servicioId,
                        datos = fila.toString(),
                    )
                )
            )
        }
    }

    /**
     * Cómo está configurado el contrato.
     *
     * Si nunca se bajó, responde con los valores de siempre: es preferible
     * sellar con el formato por omisión que dejar al capataz sin poder
     * fotografiar.
     */
    suspend fun ajustes(servicioId: String): AjustesDelServicio =
        catalogo.de("ajustes", servicioId)
            .firstOrNull()
            ?.let { runCatching { json.decodeFromString<AjustesDelServicio>(it.datos) }.getOrNull() }
            ?: AjustesDelServicio()

    suspend fun actividades(servicioId: String): List<Actividad> =
        catalogo.de("activities_catalog", servicioId)
            .mapNotNull { runCatching { json.decodeFromString<Actividad>(it.datos) }.getOrNull() }

    suspend fun tramos(servicioId: String): List<Tramo> =
        catalogo.de("road_sections", servicioId)
            .mapNotNull { runCatching { json.decodeFromString<Tramo>(it.datos) }.getOrNull() }
            // Por código, que es como están rotulados en el contrato: cada
            // corredor lleva su propio kilometraje y ordenarlos por progresiva
            // los mezclaba.
            .sortedBy { it.code }

    /** El contrato, para la cabecera de los formatos impresos en campo. */
    suspend fun contrato(servicioId: String): Servicio? =
        catalogo.de("services", servicioId)
            .firstOrNull()
            ?.let { runCatching { json.decodeFromString<Servicio>(it.datos) }.getOrNull() }

    suspend fun unidades(): List<Unidad> =
        catalogo.de("units", null)
            .mapNotNull { runCatching { json.decodeFromString<Unidad>(it.datos) }.getOrNull() }

    // ─── Lo programado y los PCI ──────────────────────────────────────────

    /**
     * Lo que le toca hoy a la cuadrilla, según la programación del supervisor.
     *
     * Se intenta refrescar; si no hay señal se responde con la última copia
     * bajada. Salir a trabajar sin saber qué toca no es una opción.
     */
    suspend fun programacionDelDia(
        servicioId: String,
        cuadrillaId: String?,
        fecha: LocalDate = Peru.hoy(),
    ): List<ItemProgramado> = withContext(Dispatchers.IO) {
        runCatching {
            val filas = todasLasPaginas { desde, hasta ->
                supabase.postgrest.from("v_plan_items")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            eq("scheduled_on", fecha.toString())
                            cuadrillaId?.let { eq("crew_id", it) }
                        }
                        order("sort_order", Order.ASCENDING)
                        range(desde, hasta)
                    }
                    .decodeList<JsonObject>()
            }
            espejar("plan_items", servicioId, filas)
            filas.map { fila -> json.decodeFromString<ItemProgramado>(fila.toString()) }
        }.getOrElse {
            deLaCopia<ItemProgramado>("plan_items", servicioId)
                .filter { it.fecha == fecha.toString() }
                .filter { cuadrillaId == null || it.cuadrillaId == cuadrillaId }
        }
    }

    /**
     * Los requerimientos con plazo que tiene encima la cuadrilla.
     *
     * Van ordenados por vencimiento: lo que primero se vence es lo primero
     * que hay que atender, y el semáforo lo dice de un vistazo.
     */
    suspend fun pciAsignados(
        servicioId: String,
        cuadrillaId: String?,
    ): List<ItemPci> = withContext(Dispatchers.IO) {
        runCatching {
            val filas = todasLasPaginas { desde, hasta ->
                supabase.postgrest.from("v_pci_items")
                    .select {
                        filter {
                            eq("service_id", servicioId)
                            isIn("status", listOf("pendiente", "en_atencion"))
                            // La vista llama a esta columna assigned_crew_id
                            cuadrillaId?.let { eq("assigned_crew_id", it) }
                        }
                        order("due_date", Order.ASCENDING)
                        range(desde, hasta)
                    }
                    .decodeList<JsonObject>()
            }
            espejar("pci_items", servicioId, filas)
            filas.map { fila -> json.decodeFromString<ItemPci>(fila.toString()) }
        }.getOrElse {
            deLaCopia<ItemPci>("pci_items", servicioId)
                .filter { it.status == "pendiente" || it.status == "en_atencion" }
                .filter { cuadrillaId == null || it.cuadrillaId == cuadrillaId }
                .sortedBy { it.vence ?: "9999-12-31" }
        }
    }

    // ─── El ciclo de la partida ───────────────────────────────────────────
    //
    // Estas cuatro acciones sí necesitan señal, a diferencia del resto de la
    // aplicación. No es un descuido: el servidor comprueba reglas —no se
    // finaliza lo que no se empezó, no se cierra sin avance registrado— y
    // encolarlas significaría que el capataz cree haber cerrado la partida y
    // tres días después descubre que se rechazó. El metrado, que es el dato
    // que no se puede perder, sí se registra sin señal.

    suspend fun iniciarPartida(itemId: String) = accionDePartida("partida_iniciar", itemId)

    suspend fun finalizarPartida(itemId: String) = accionDePartida("partida_finalizar", itemId)

    suspend fun reportarImpedimento(itemId: String, motivo: String) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc(
            "partida_impedimento",
            buildJsonObject {
                put("p_item", itemId)
                put("p_motivo", motivo)
            },
        )
        Unit
    }

    suspend fun iniciarAtencionPci(itemId: String) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc("pci_iniciar_atencion", buildJsonObject { put("p_item", itemId) })
        Unit
    }

    suspend fun levantarPci(itemId: String, nota: String?) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc(
            "pci_levantar",
            buildJsonObject {
                put("p_item", itemId)
                nota?.takeIf { it.isNotBlank() }?.let { put("p_nota", it) }
            },
        )
        Unit
    }

    private suspend fun accionDePartida(funcion: String, itemId: String) = withContext(Dispatchers.IO) {
        supabase.postgrest.rpc(funcion, buildJsonObject { put("p_item", itemId) })
        Unit
    }

    /** Guarda una bajada en el espejo local, reemplazando la anterior. */
    private suspend fun espejar(tabla: String, servicioId: String?, filas: List<JsonObject>) {
        val vigentes = filas.mapNotNull { fila ->
            val id = fila["id"]?.toString()?.trim('"') ?: return@mapNotNull null
            FilaCatalogo(tabla = tabla, id = id, servicioId = servicioId, datos = fila.toString())
        }
        catalogo.guardar(vigentes)
        if (vigentes.isNotEmpty()) {
            catalogo.borrarLosQueYaNoEstan(tabla, vigentes.map { it.id })
        }
    }

    private suspend inline fun <reified T> deLaCopia(tabla: String, servicioId: String?): List<T> =
        catalogo.de(tabla, servicioId).mapNotNull {
            runCatching { json.decodeFromString<T>(it.datos) }.getOrNull()
        }

    /**
     * Trae todas las filas, no las primeras mil.
     *
     * PostgREST corta la respuesta en mil filas sin avisar. Un contrato con
     * más PCI abiertos que eso mostraría un número corto y nadie se enteraría,
     * así que se pide por páginas hasta que deja de venir nada.
     */
    private suspend fun todasLasPaginas(
        tamano: Int = 500,
        tope: Int = 20_000,
        pedir: suspend (desde: Long, hasta: Long) -> List<JsonObject>,
    ): List<JsonObject> {
        val todas = mutableListOf<JsonObject>()
        var desde = 0L
        while (todas.size < tope) {
            val pagina = pedir(desde, desde + tamano - 1)
            todas += pagina
            if (pagina.size < tamano) break
            desde += tamano
        }
        return todas
    }

    // ─── El parte del día ─────────────────────────────────────────────────

    /**
     * Abre el parte de hoy, o lo crea si todavía no existe.
     *
     * Se crea siempre en el equipo y se encola: el capataz puede empezar a
     * registrar aunque esté en una quebrada sin señal.
     */
    suspend fun abrirParteDeHoy(
        servicioId: String,
        cuadrillaId: String?,
        fecha: LocalDate = Peru.hoy(),
    ): ParteLocal = withContext(Dispatchers.IO) {
        partes.delDia(fecha.toString(), cuadrillaId)?.let { return@withContext it }

        val clientId = UUID.randomUUID().toString()
        val parte = ParteLocal(
            clientId = clientId,
            servicioId = servicioId,
            cuadrillaId = cuadrillaId,
            fecha = fecha.toString(),
        )
        partes.guardar(parte)

        cola.encolar(
            tabla = "work_orders",
            clientId = clientId,
            etiqueta = "Parte del $fecha",
            cuerpo = buildJsonObject {
                put("service_id", servicioId)
                cuadrillaId?.let { put("crew_id", it) }
                put("work_date", fecha.toString())
                put("status", "borrador")
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
        parte
    }

    fun registrosDe(parteClientId: String) = partes.registrosDe(parteClientId)

    fun partesRecientes() = partes.recientes()

    /**
     * Anota una actividad ejecutada. Queda guardada y encolada.
     *
     * El origen no es un adorno: si el metrado no dice de qué partida
     * programada o de qué ítem de PCI sale, el avance de esa partida se
     * queda en cero en el panel del supervisor aunque la cuadrilla la haya
     * terminado, y el levantamiento del PCI no queda sustentado.
     */
    suspend fun registrarActividad(
        parte: ParteLocal,
        actividad: Actividad,
        tramo: Tramo?,
        progresivaInicio: Double?,
        progresivaFin: Double?,
        lado: String,
        cantidad: Double,
        unidad: String?,
        observacion: String?,
        origen: OrigenDelTrabajo = OrigenDelTrabajo.Emergencia,
    ): RegistroLocal = withContext(Dispatchers.IO) {
        val clientId = UUID.randomUUID().toString()
        // Dónde se registró el trabajo. Si el GPS no engancha se manda sin
        // punto y el servidor lo sitúa por la progresiva declarada.
        val punto = runCatching { ubicacion.actual() }.getOrNull()
        // El símbolo de la unidad, para que el metrado se lea en el equipo:
        // «300 m²» y no «300» a secas. En la nube ya lo resuelve el
        // disparador a partir de la actividad.
        val simbolo = unidad ?: actividad.unidadId?.let { id ->
            runCatching { unidades().firstOrNull { it.id == id }?.symbol }.getOrNull()
        }
        val registro = RegistroLocal(
            clientId = clientId,
            parteClientId = parte.clientId,
            servicioId = parte.servicioId,
            actividadId = actividad.id,
            actividadNombre = actividad.name,
            tramoId = tramo?.id,
            tramoNombre = tramo?.name,
            progresivaInicio = progresivaInicio,
            progresivaFin = progresivaFin,
            lado = lado,
            cantidad = cantidad,
            unidad = simbolo,
            observacion = observacion,
            origen = origen.clave,
            planItemId = origen.planItemId,
            pciItemId = origen.pciItemId,
            pciCodigo = origen.pciCodigo,
        )
        partes.guardarRegistro(registro)

        cola.encolar(
            tabla = "work_entries",
            clientId = clientId,
            // El registro espera a que su parte exista en la nube
            dependeDe = parte.clientId,
            etiqueta = "${actividad.name} · ${cantidad}",
            cuerpo = buildJsonObject {
                put("service_id", parte.servicioId)
                put("activity_id", actividad.id)
                tramo?.let { put("section_id", it.id) }
                progresivaInicio?.let { put("prog_start_m", it) }
                progresivaFin?.let { put("prog_end_m", it) }
                put("side", lado)
                put("quantity", cantidad)
                // La unidad viene de la actividad: «limpieza de cunetas» se
                // mide en metros siempre, y sin ella el metrado llega al
                // panel como una cifra suelta que no se sabe leer.
                actividad.unidadId?.let { put("unit_id", it) }
                origen.planItemId?.let { put("plan_item_id", it) }
                origen.pciItemId?.let { put("pci_item_id", it) }
                punto?.let {
                    put("lat", it.latitud)
                    put("lng", it.longitud)
                    put("accuracy_m", it.precision)
                }
                observacion?.takeIf { it.isNotBlank() }?.let { put("observation", it) }
                supabase.usuarioActual()?.let { put("created_by", it) }
            },
        )
        registro
    }
}
