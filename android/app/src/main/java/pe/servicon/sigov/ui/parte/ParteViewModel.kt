package pe.servicon.sigov.ui.parte

import pe.servicon.sigov.datos.Peru
import androidx.lifecycle.SavedStateHandle
import pe.servicon.sigov.datos.celdaTexto
import pe.servicon.sigov.datos.HojaXlsx
import pe.servicon.sigov.datos.Celda
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.datos.Actividad
import pe.servicon.sigov.datos.CampoRepositorio
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.OrigenDelTrabajo
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.datos.local.ParteLocal
import pe.servicon.sigov.datos.local.ParteDao
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.datos.CabeceraPdf
import pe.servicon.sigov.datos.FirmaPdf
import pe.servicon.sigov.datos.FormatoOficial
import pe.servicon.sigov.datos.FormatosPdf
import java.time.LocalDate
import javax.inject.Inject

/** Un material anotado dentro del registro de una actividad. */
data class MaterialDelRegistro(val insumoId: String, val nombre: String, val unidad: String?, val cantidad: Double)

/** Un equipo u otro recurso anotado al registrar el avance (REV3-OBS-07). */
data class EquipoDelRegistro(
    val tipo: String, val codigo: String?, val descripcion: String, val unidad: String?, val cantidad: Double?, val observacion: String?,
)

data class EstadoParte(
    val cargando: Boolean = true,
    /** El día que se reporta: hoy por defecto, se puede cambiar (Elvis, 05-10). */
    val fecha: LocalDate = Peru.hoy(),
    /** El subtramo de la cuadrilla, puesto de entrada en el formulario. */
    val tramoPorDefecto: Tramo? = null,
    /** Llegó desde una partida con «Registrar avance»: se abre ya elegida. */
    val partidaInicial: ItemProgramado? = null,
    /** La partida ya tenía avance hoy: se abre su registro para corregirlo. */
    val corregir: String? = null,
    val parte: ParteLocal? = null,
    val registros: List<RegistroLocal> = emptyList(),
    val actividades: List<Actividad> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    // Lo que el capataz puede señalar como origen del metrado
    val programadas: List<ItemProgramado> = emptyList(),
    val pcis: List<ItemPci> = emptyList(),
    val cuadrilla: String = "",
    /** Integrantes activos más el jefe: lo que se propone como personal (OBS-33). */
    val personalSugerido: Int? = null,
    /** Las placas asignadas hoy a la cuadrilla. */
    val vehiculosDelDia: List<String> = emptyList(),
    val supervisor: String? = null,
    val fotosPorRegistro: Map<String, Int> = emptyMap(),
    /** Las fotos de cada actividad por etapa (antes, durante, después…). */
    val fotosPorFase: Map<String, Map<String, Int>> = emptyMap(),
    /** Los ítems PCI del reporte, en cualquier estado: su n.º y su partida para el PDF. */
    val itemsPciDelDia: Map<String, ItemPci> = emptyMap(),
    /** Material usado en el día (Formato 8) y lo que la cuadrilla tiene. */
    val consumos: List<pe.servicon.sigov.datos.Consumo> = emptyList(),
    /** Equipos y otros recursos del día (FOR:001, secciones IV y V). */
    val recursos: List<pe.servicon.sigov.datos.RecursoDelDia> = emptyList(),
    val stockCuadrilla: List<pe.servicon.sigov.datos.StockDeCuadrilla> = emptyList(),
    val insumos: List<pe.servicon.sigov.datos.Insumo> = emptyList(),
    /** Material por unidad de partida: sugiere el material del día. */
    val rendimientos: List<pe.servicon.sigov.datos.Rendimiento> = emptyList(),
    /** Lo que observó el supervisor al devolver el parte. */
    val observacion: String? = null,
    /** La fecha en que se programó cada partida del parte, si es otra (REV3-OBS-20). */
    val fechasProgramadas: Map<String, String> = emptyMap(),
    val guardando: Boolean = false,
    /** Los clientId que siguen en la cola; «envio:<parte>» si el envío espera señal. */
    val porEnviar: Set<String> = emptySet(),
    /** Mientras se arma el PDF del parte */
    val imprimiendo: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val metradoTotal: Double get() = registros.sumOf { it.cantidad }

    /** Lo que falta completar: sin metrado no se valoriza (Elvis, 21/10: «en rojo»). */
    val porCompletar: Int get() = registros.count { it.cantidad <= 0.0 }

    /** El código de partida COVINCA de un registro. */
    fun codigoDe(r: RegistroLocal): String? =
        actividades.firstOrNull { a -> a.id == r.actividadId }?.code
            ?: r.pciItemId?.let { itemsPciDelDia[it]?.actividadCodigo }

    /** Partida o ítem PCI → su registro de hoy que ya tiene avance. */
    val conAvance: Map<String, String>
        get() = registros.filter { it.cantidad > 0 }
            .flatMap { r -> listOfNotNull(r.planItemId, r.pciItemId).map { id -> id to r.clientId } }
            .toMap()

    /** «Ítem 7» de un registro de PCI. */
    fun itemDe(r: RegistroLocal): Int? = r.pciItemId?.let { itemsPciDelDia[it]?.numero }
}

/**
 * El parte del día.
 *
 * Abre —o crea— el parte de hoy para la cuadrilla y va acumulando lo que se
 * ejecuta. Todo se guarda en el equipo primero; la cola se encarga del resto.
 */
@HiltViewModel
class ParteViewModel @Inject constructor(
    private val ruta: SavedStateHandle,
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
    private val formatos: FormatosPdf,
    private val for001: pe.servicon.sigov.datos.FormatoFor001,
    private val consumoRepo: pe.servicon.sigov.datos.ConsumoRepositorio,
    private val recursoRepo: pe.servicon.sigov.datos.RecursoRepositorio,
    private val materialRepo: pe.servicon.sigov.datos.MaterialRepositorio,
    private val charlas: pe.servicon.sigov.datos.CharlaRepositorio,
    private val ssoma: pe.servicon.sigov.datos.SsomaRepositorio,
    private val colaEnvio: pe.servicon.sigov.datos.sync.ColaRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoParte())
    val estado: StateFlow<EstadoParte> = _estado.asStateFlow()

    // Se puede abrir en un día anterior desde la Jornada, para subsanarlo
    init {
        // Lo que todavía espera señal, en vivo: cada actividad y el envío del
        // reporte lo dicen («Por enviar», SEG-V2-OBS-03)
        viewModelScope.launch {
            colaEnvio.enEspera.collect { cola ->
                val ids = cola.map { it.clientId }.toMutableSet()
                cola.filter { it.tabla == "rpc:enviar_parte" }.forEach { e ->
                    runCatching { kotlinx.serialization.json.Json.parseToJsonElement(e.cuerpo) as kotlinx.serialization.json.JsonObject }
                        .getOrNull()?.get("p_id")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                        ?.let { ids += "envio:$it" }
                }
                _estado.update { it.copy(porEnviar = ids) }
            }
        }
        abrir(
            ruta.get<String>("fecha")?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                ?.takeIf { !it.isAfter(Peru.hoy()) } ?: Peru.hoy()
        )
    }

    /** Reportar otro día: el de ayer que quedó pendiente, por ejemplo. No el de mañana. */
    fun cambiarFecha(dias: Long) {
        val nueva = _estado.value.fecha.plusDays(dias)
        if (nueva.isAfter(Peru.hoy())) return
        abrir(nueva)
    }

    fun volverAHoy() = abrir(Peru.hoy())

    /** Ir a un día anterior desde el calendario. No a mañana. */
    fun irADia(fecha: LocalDate) {
        if (fecha.isAfter(Peru.hoy())) return
        abrir(fecha)
    }

    fun partidaInicialAtendida() = _estado.update { it.copy(partidaInicial = null) }

    private var vigilancia: kotlinx.coroutines.Job? = null

    private fun abrir(fecha: LocalDate) {
        _estado.update { it.copy(cargando = true, fecha = fecha, registros = emptyList(), programadas = emptyList()) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val servicioId = cuadrilla.servicioId

                // Los catálogos se refrescan si hay señal; si no, se usa la
                // copia que ya está en el equipo.
                runCatching { campo.bajarCatalogos(servicioId) }

                val parte = campo.abrirParteDeHoy(servicioId, cuadrilla.id, fecha)
                val tramos = campo.tramos(servicioId)

                _estado.update {
                    it.copy(
                        cargando = false,
                        parte = parte,
                        cuadrilla = cuadrilla.name,
                        actividades = campo.actividades(servicioId),
                        tramos = tramos,
                        tramoPorDefecto = tramos.firstOrNull { t -> t.id == cuadrilla.tramoId },
                    )
                }

                // OBS-33: lo que el sistema ya sabe no se vuelve a pedir:
                // el supervisor de la cuadrilla, su personal y sus vehículos
                runCatching {
                    val lista = charlas.miembros(servicioId, cuadrilla.id)
                    val yo = sesion.usuarioId()
                    // El jefe cuenta una sola vez: suele estar ya en la lista
                    val miembros = lista.size + if (lista.none { m -> m.perfilId == yo }) 1 else 0
                    val placas = ssoma.vehiculos(servicioId)
                        .filter { v -> v.cuadrillaId == cuadrilla.id }
                        .map { v -> v.plate }
                    val supervisor = runCatching { sesion.supervisor(servicioId, cuadrilla.id) }.getOrNull()
                    _estado.update {
                        it.copy(
                            personalSugerido = miembros.takeIf { lista.isNotEmpty() },
                            vehiculosDelDia = placas,
                            supervisor = supervisor,
                        )
                    }
                }

                // Lo programado y los PCI llegan después: si no hay señal el
                // parte igual se abre, solo que sin poder amarrar el origen.
                runCatching {
                    val programadas = campo.programacionDelDia(servicioId, cuadrilla.id, fecha)
                    val pcis = campo.pciAsignados(servicioId, cuadrilla.id)
                    // Si se llegó desde una partida, se ofrece ya elegida (una sola vez)
                    val pedida = ruta.get<String>("partida")?.also { ruta["partida"] = null }
                    // Puede ser de otro día (una partida atrasada): se busca aparte
                    val partida = pedida?.let { id ->
                        programadas.firstOrNull { p -> p.id == id } ?: campo.itemProgramado(id)
                    }
                    val yaConAvance = partida?.let { p -> partes.registroDePartida(parte.clientId, p.id) }
                        ?.takeIf { r -> r.cantidad > 0 }
                    // De qué día era cada partida del parte: la programada se
                    // muestra como antecedente cuando no es la fecha real (REV3-OBS-20)
                    val fechasProgramadas = partes.registrosDe(parte.clientId).first().mapNotNull { r -> r.planItemId }.distinct()
                        .mapNotNull { id ->
                            (programadas.firstOrNull { p -> p.id == id } ?: runCatching { campo.itemProgramado(id) }.getOrNull())
                                ?.fecha?.take(10)?.let { id to it }
                        }.toMap()
                    _estado.update {
                        it.copy(
                            fechasProgramadas = fechasProgramadas,
                            programadas = programadas,
                            pcis = pcis,
                            partidaInicial = partida.takeIf { yaConAvance == null },
                            corregir = yaConAvance?.clientId,
                            aviso = if (yaConAvance != null) "Esta partida ya tiene avance hoy: corrígelo aquí, sin registrarla otra vez." else it.aviso,
                        )
                    }
                }
                vigilarRegistros(parte.clientId)
                cargarMateriales()
                cargarRecursos()
                refrescarEstado()
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    private fun vigilarRegistros(parteId: String) {
        // Al cambiar de día se deja de mirar el parte anterior
        vigilancia?.cancel()
        vigilancia = viewModelScope.launch {
            launch {
                campo.registrosDe(parteId).collectLatest { filas ->
                    val antes = _estado.value.registros.map { it.clientId }.toSet()
                    _estado.update { it.copy(registros = filas) }
                    cargarItemsDelDia(filas)
                    // Materiales y equipos se amarran a sus actividades: con
                    // actividades nuevas se vuelven a leer
                    if (filas.map { it.clientId }.toSet() != antes) { cargarMateriales(); cargarRecursos() }
                }
            }
            launch {
                partes.conteoPorFase(parteId).collectLatest { conteos ->
                    _estado.update { estado ->
                        estado.copy(
                            fotosPorFase = conteos.groupBy { it.registroClientId }
                                .mapValues { (_, cs) -> cs.associate { c -> c.fase to c.cuantas } },
                        )
                    }
                }
            }
            // Las fotos se cuentan aparte: al volver de la cámara la lista se
            // actualiza sola, sin recargar el parte.
            launch {
                partes.conteoEvidencias(parteId).collectLatest { conteos ->
                    _estado.update { estado ->
                        estado.copy(fotosPorRegistro = conteos.associate { it.registroClientId to it.cuantas })
                    }
                }
            }
        }
    }

    fun registrar(
        actividad: Actividad,
        tramo: Tramo?,
        progresivaInicio: Double?,
        progresivaFin: Double?,
        lado: String,
        cantidad: Double,
        observacion: String?,
        origen: OrigenDelTrabajo,
        detalle: pe.servicon.sigov.datos.DetalleFor001,
        materiales: List<MaterialDelRegistro> = emptyList(),
        equipos: List<EquipoDelRegistro> = emptyList(),
        alTerminar: () -> Unit,
    ) {
        val parte = _estado.value.parte ?: return
        _estado.update { it.copy(guardando = true) }

        viewModelScope.launch {
            runCatching {
                // El ítem PCI o la partida ya tienen su registro si se les
                // tomaron fotos: se completa ese mismo, no se duplica la línea
                val existente = when (origen) {
                    is OrigenDelTrabajo.Pci -> _estado.value.registros.firstOrNull { r -> r.pciItemId == origen.item.id }
                    is OrigenDelTrabajo.Programado -> _estado.value.registros
                        .firstOrNull { r -> r.planItemId == origen.item.id }
                    else -> null
                }
                val registro = if (existente != null) {
                    campo.completarRegistro(existente, tramo, progresivaInicio, progresivaFin, lado, cantidad,
                        observacion ?: existente.observacion, detalle)
                } else campo.registrarActividad(
                    parte = parte,
                    actividad = actividad,
                    tramo = tramo,
                    progresivaInicio = progresivaInicio,
                    progresivaFin = progresivaFin,
                    lado = lado,
                    cantidad = cantidad,
                    unidad = null,
                    observacion = observacion,
                    origen = origen,
                    detalle = detalle,
                )
                // El material de esa actividad, con ella (SEG-V2-OBS-14)
                val cuadrilla = sesion.cuadrilla()
                if (cuadrilla != null) materiales.filter { m -> m.cantidad > 0 }.forEach { m ->
                    consumoRepo.registrar(
                        cuadrilla.servicioId, cuadrilla.id, _estado.value.fecha, m.insumoId, m.nombre, m.unidad, m.cantidad,
                        registro, parte.clientId,
                    )
                }
                // Y sus equipos, como en el PCI: el ítem lleva todo lo suyo (REV3-OBS-07)
                equipos.forEach { q ->
                    recursoRepo.registrar(parte, q.tipo, q.codigo, q.descripcion, q.unidad, q.cantidad, q.observacion, registro)
                }
            }.onSuccess {
                if (materiales.any { m -> m.cantidad > 0 }) cargarMateriales()
                if (equipos.isNotEmpty()) cargarRecursos()
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = when (origen) {
                            is OrigenDelTrabajo.Programado ->
                                "Registrado y descontado de la partida programada."
                            is OrigenDelTrabajo.Pci ->
                                "Registrado como sustento del ${origen.item.pciCorto ?: "PCI"}."
                            else -> "Actividad registrada. Se enviará al haber señal."
                        },
                    )
                }
                // Lo programado cambia al registrar: si no se vuelve a leer,
                // la partida recién cubierta sigue ofreciéndose como pendiente
                refrescarOrigenes()
                alTerminar()
            }.onFailure { fallo ->
                _estado.update { it.copy(guardando = false, error = fallo.enCristiano()) }
            }
        }
    }

    /** Los ítems PCI que tiene el reporte, aunque ya estén atendidos. */
    private fun cargarItemsDelDia(registros: List<RegistroLocal>) {
        val faltan = registros.mapNotNull { it.pciItemId }.filter { it !in _estado.value.itemsPciDelDia }.toSet()
        if (faltan.isEmpty()) return
        viewModelScope.launch {
            runCatching {
                val servicio = registros.first().servicioId
                campo.itemsPciPorId(servicio, faltan)
            }.onSuccess { items ->
                _estado.update { it.copy(itemsPciDelDia = it.itemsPciDelDia + items.associateBy { i -> i.id }) }
            }
        }
    }

    /**
     * Completa una actividad desde su tarjeta del reporte: el metrado y la
     * observación (Elvis, 21/10: «metrado, materiales, equipos y
     * observación»). Se corrige el mismo registro, no se crea otro.
     */
    fun completar(registro: RegistroLocal, cantidad: Double, observacion: String?, alTerminar: () -> Unit = {}) {
        viewModelScope.launch {
            runCatching { campo.fijarMetrado(registro, cantidad, observacion?.trim()?.ifBlank { null }) }
                .onSuccess {
                    _estado.update { it.copy(aviso = "Actividad actualizada. Se enviará al haber señal.") }
                    alTerminar()
                }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    fun correccionAbierta() = _estado.update { it.copy(corregir = null) }

    private fun refrescarOrigenes() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: return@runCatching
                _estado.update {
                    it.copy(
                        programadas = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id, it.fecha),
                        pcis = campo.pciAsignados(cuadrilla.servicioId, cuadrilla.id),
                    )
                }
            }
        }
    }

    /**
     * Lo que lleva el FOR:001 del día, de lo guardado en el teléfono
     * (REV3-OBS-19: la plantilla entregada, sin columnas ajenas). Lo que la
     * plantilla no tiene —la fecha programada cuando difiere de la real
     * (REV3-OBS-20)— va en la observación de la actividad.
     */
    private suspend fun datosFor001(): pe.servicon.sigov.datos.DatosFor001 {
        val e = _estado.value
        val parte = e.parte ?: error("No hay parte abierto.")
        val servicio = campo.contrato(parte.servicioId)
        val fecha = LocalDate.parse(parte.fecha)
        val detalles = campo.detallesFor001(e.registros)
        fun txt(o: kotlinx.serialization.json.JsonObject?, k: String) =
            (o?.get(k) as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { !it.toString().equals("null") }?.content
        fun num(v: String?, dec: Int = 2) = v?.toDoubleOrNull()?.let { pe.servicon.sigov.datos.Numeros.tres(it) } ?: ""
        val partidas = e.registros.mapNotNull { it.planItemId }.distinct().associateWith { id ->
            e.programadas.firstOrNull { it.id == id } ?: runCatching { campo.itemProgramado(id) }.getOrNull()
        }
        val diaCorto = { f: String -> f.take(10).split("-").let { (a, m, d) -> "$d/$m/$a" } }
        val filas = e.registros.mapIndexed { i, r ->
            val d = detalles[r.clientId]
            val hi = txt(d, "hora_inicio")?.take(5)
            val hf = txt(d, "hora_fin")?.take(5)
            val dur = if (hi != null && hf != null) runCatching {
                val m = java.time.Duration.between(java.time.LocalTime.parse(hi), java.time.LocalTime.parse(hf)).toMinutes()
                if (m > 0) "%d:%02d".format(m / 60, m % 60) else ""
            }.getOrDefault("") else ""
            val act = e.actividades.firstOrNull { it.id == r.actividadId }
            val programada = r.planItemId?.let { partidas[it] }?.fecha
            val obs = listOfNotNull(
                r.observacion?.takeIf { it.isNotBlank() },
                programada?.takeIf { it.take(10) != parte.fecha }?.let { "Programado ${diaCorto(it)} · ejecutado ${diaCorto(parte.fecha)}" },
            ).joinToString(" · ")
            pe.servicon.sigov.datos.FilaFor001(
                codigo = e.codigoDe(r) ?: "",
                numero = (act?.numeroCovinca ?: (i + 1)).toString(),
                pci = r.pciCodigo?.let { pe.servicon.sigov.datos.codigoCortoDePci(it) ?: it } ?: "",
                item = e.itemDe(r)?.toString() ?: "",
                unidad = r.unidad ?: "",
                actividad = r.actividadNombre,
                horaInicio = hi ?: "", horaFin = hf ?: "", duracion = dur,
                personas = txt(d, "personas") ?: "",
                progInicial = r.progresivaInicio?.let { progresiva(it) } ?: "",
                progFinal = r.progresivaFin?.let { progresiva(it) } ?: "",
                lado = pe.servicon.sigov.datos.Lados.codigo(r.lado) ?: "",
                longitud = num(txt(d, "longitud_m")), ancho = num(txt(d, "ancho_m")), espesor = num(txt(d, "espesor_m")),
                metrado = pe.servicon.sigov.datos.Numeros.tres(r.cantidad),
                observacion = obs,
            )
        }
        val porId = e.registros.associateBy { it.clientId }
        val materiales = e.consumos.map { c ->
            val r = c.registroClientId?.let { porId[it] }
            val act = r?.let { x -> e.actividades.firstOrNull { it.id == x.actividadId } }
            listOf(r?.let { e.codigoDe(it) } ?: "", act?.numeroCovinca?.toString() ?: "", r?.actividadNombre ?: c.actividad ?: "",
                c.nombre, pe.servicon.sigov.datos.Numeros.tres(c.cantidad), c.unidad ?: "")
        }
        val equipos = e.recursos.filter { it.tipo == "equipo" }.mapIndexed { i, x ->
            listOf(x.codigo ?: "", "${i + 1}", x.descripcion, x.unidad ?: "", x.cantidad?.let { pe.servicon.sigov.datos.Numeros.tres(it) } ?: "")
        }
        val otros = e.recursos.filter { it.tipo != "equipo" }.map { x ->
            listOf(x.descripcion, x.unidad ?: "", x.cantidad?.let { pe.servicon.sigov.datos.Numeros.tres(it) } ?: "", x.observacion ?: "")
        }
        val procesos = e.registros.map { r ->
            when (r.origen) { "programacion" -> "MR"; "pci" -> "PCI"; "emergencia" -> "AT. EMERG."; else -> "OTROS" }
        }.toSet()
        return pe.servicon.sigov.datos.DatosFor001(
            fecha = fecha,
            procesos = procesos,
            subtramo = e.tramoPorDefecto?.let { t -> "SUBTRAMO " + (t.numero?.toString() ?: t.code) } ?: "",
            cliente = servicio?.cliente ?: "COVINCA",
            componente = e.registros.mapNotNull { r -> e.actividades.firstOrNull { it.id == r.actividadId }?.category }.distinct().joinToString(", "),
            supervisor = e.supervisor ?: "",
            cuadrilla = e.cuadrilla,
            capataz = sesion.perfil()?.nombre ?: "",
            sector = partidas.values.mapNotNull { it?.sector }.distinct().joinToString(", "),
            filas = filas,
            materiales = materiales,
            equipos = equipos,
            otros = otros,
            observaciones = listOfNotNull(
                parte.notas?.takeIf { it.isNotBlank() },
                listOfNotNull(parte.horaInicio, parte.horaFin).takeIf { it.isNotEmpty() }?.let { "Jornada: " + it.joinToString(" a ") },
                (parte.personal ?: e.personalSugerido)?.let { "Personal: $it" },
                e.vehiculosDelDia.takeIf { it.isNotEmpty() }?.let { "Vehículo: " + it.joinToString(", ") },
            ).joinToString(" · "),
            validador = null,
        )
    }

    /**
     * El FOR:001 en PDF, igual al del panel, armado en el teléfono: al capataz
     * le pueden pedir el parte en el frente de trabajo, sin señal.
     */
    /** Las fotos de una actividad que siguen en el teléfono, con su etapa. */
    fun fotosDe(registroId: String) = partes.evidenciasDe(registroId)

    fun imprimirParte(compartir: Boolean) {
        val e = _estado.value
        val parte = e.parte ?: return
        _estado.update { it.copy(imprimiendo = true) }
        viewModelScope.launch {
            runCatching {
                val archivo = for001.armar(datosFor001(), "FOR001_${parte.fecha}_${e.cuadrilla.filter { it.isLetterOrDigit() }}")
                if (compartir) formatos.compartir(archivo, "Reporte diario ${parte.fecha}")
                else formatos.abrir(archivo)
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
            _estado.update { it.copy(imprimiendo = false) }
        }
    }

    /**
     * El mismo FOR:001 como hoja de cálculo: las columnas de la plantilla en
     * «Ejecución», y materiales, equipos y otros recursos en sus hojas
     * (REV3-OBS-17 y 19). El CSV queda para cargarlo en otro sistema.
     */
    fun exportar(comoExcel: Boolean) {
        val e = _estado.value
        val parte = e.parte ?: return
        _estado.update { it.copy(imprimiendo = true) }

        viewModelScope.launch {
            runCatching {
                val d = datosFor001()
                val nombre = "FOR001_${parte.fecha}_${e.cuadrilla.filter { it.isLetterOrDigit() }}"
                val columnas = listOf("COD. PARTIDA", "N°", "N° PCI", "ÍTEM", "UND", "ACTIVIDAD", "HORA INICIO", "HORA FIN",
                    "DURACIÓN", "CANT. PERS.", "PROG. INICIAL", "PROG. FINAL", "LD/LI/EJE", "LONGITUD (m)", "ANCHO (m)",
                    "ESPESOR (m)", "METRADO", "UND", "OBSERVACIONES")
                val archivo = if (comoExcel) {
                    fun t(v: String) = celdaTexto(v)
                    fun n(v: String) = v.replace(",", "").toDoubleOrNull()?.let { Celda.Numero(it) } ?: celdaTexto(v)
                    val dia = "%02d/%02d/%d".format(d.fecha.dayOfMonth, d.fecha.monthValue, d.fecha.year)
                    val ficha = listOf(
                        "Formato" to "FOR:001 · Reporte diario de ejecución - Mantenimiento rutinario",
                        "Fecha" to dia,
                        "Proceso" to listOf("MR", "PCI", "AT. EMERG.", "OTROS").filter { it in d.procesos }.joinToString(", "),
                        "Cliente" to d.cliente,
                        "Componente" to d.componente,
                        "Ing. supervisor" to d.supervisor,
                        "Cuadrilla" to d.cuadrilla,
                        "Capataz" to d.capataz,
                        "Sub tramo" to d.subtramo,
                        "Sector" to d.sector,
                    )
                    formatos.armarXlsx(
                        nombreArchivo = nombre,
                        hojas = listOf(
                            HojaXlsx(
                                nombre = "II Ejecución", ficha = ficha, columnas = columnas,
                                anchos = listOf(13.0, 5.0, 9.0, 6.0, 6.0, 36.0, 9.0, 9.0, 9.0, 8.0, 11.0, 11.0, 9.0, 10.0, 9.0, 9.0, 10.0, 6.0, 40.0),
                                filas = d.filas.map { f ->
                                    listOf(t(f.codigo), n(f.numero), t(f.pci), n(f.item), t(f.unidad), t(f.actividad), t(f.horaInicio), t(f.horaFin),
                                        t(f.duracion), n(f.personas), t(f.progInicial), t(f.progFinal), t(f.lado), n(f.longitud), n(f.ancho),
                                        n(f.espesor), n(f.metrado), t(f.unidad), t(f.observacion))
                                },
                            ),
                            HojaXlsx(
                                nombre = "III Materiales", ficha = listOf("Fecha" to dia, "Cuadrilla" to d.cuadrilla),
                                columnas = listOf("COD. PARTIDA", "N°", "ACTIVIDAD", "MATERIALES", "CANT", "UND"),
                                anchos = listOf(13.0, 5.0, 34.0, 30.0, 9.0, 7.0),
                                filas = d.materiales.map { r -> listOf(t(r[0]), n(r[1]), t(r[2]), t(r[3]), n(r[4]), t(r[5])) },
                            ),
                            HojaXlsx(
                                nombre = "IV Equipos", ficha = listOf("Fecha" to dia, "Cuadrilla" to d.cuadrilla),
                                columnas = listOf("CÓDIGO", "N°", "DESCRIPCIÓN EQUIPO", "UND", "CANT"),
                                anchos = listOf(12.0, 5.0, 34.0, 7.0, 9.0),
                                filas = d.equipos.map { r -> listOf(t(r[0]), n(r[1]), t(r[2]), t(r[3]), n(r[4])) },
                            ),
                            HojaXlsx(
                                nombre = "V Otros recursos", ficha = listOf("Fecha" to dia, "Cuadrilla" to d.cuadrilla),
                                columnas = listOf("DESCRIPCIÓN", "UND", "CANT", "OBSERVACIONES"),
                                anchos = listOf(34.0, 7.0, 9.0, 34.0),
                                filas = d.otros.map { r -> listOf(t(r[0]), t(r[1]), n(r[2]), t(r[3])) },
                            ),
                        ),
                    )
                } else {
                    formatos.armarCsv(
                        nombreArchivo = nombre,
                        columnas = columnas,
                        filas = d.filas.map { f -> f.celdas() },
                    )
                }
                formatos.compartir(archivo, "Reporte diario ${parte.fecha}")
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
            _estado.update { it.copy(imprimiendo = false) }
        }
    }

    private fun origenDe(r: RegistroLocal): String = when (r.origen) {
        "programacion" -> "Programación"
        "pci" -> r.pciCodigo?.let { pe.servicon.sigov.datos.codigoCortoDePci(it) } ?: "PCI"
        "no_programado" -> "No programado"
        else -> "Emergencia"
    }

    /** La progresiva, como se lee en el contrato: 12+450. */
    private fun progresiva(metros: Double): String =
        "%d+%03d".format((metros / 1000).toInt(), (metros % 1000).toInt())

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    /** El estado en la nube: enviado, validado u observado (con su nota). */
    fun refrescarEstado() {
        viewModelScope.launch {
            val parte = _estado.value.parte ?: return@launch
            val remoto = campo.parteEnLaNube(parte) ?: return@launch
            val local = partes.parteDe(parte.clientId) ?: parte
            _estado.update {
                it.copy(parte = local, observacion = remoto.observacion?.takeIf { remoto.status == "observado" })
            }
        }
    }

    fun guardarDatosDelDia(clima: String?, inicio: String?, fin: String?, personal: Int?, notas: String?) {
        val parte = _estado.value.parte ?: return
        viewModelScope.launch {
            runCatching { campo.guardarDatosDelDia(parte, clima, inicio, fin, personal, notas) }
                .onSuccess { nuevo -> _estado.update { it.copy(parte = nuevo, aviso = "Datos del día guardados.") } }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    /** Cierra el día y lo manda al supervisor. */
    fun enviar() {
        val parte = _estado.value.parte ?: return
        if (_estado.value.registros.isEmpty()) {
            _estado.update { it.copy(error = "Registra al menos una actividad antes de enviar el reporte.") }
            return
        }
        viewModelScope.launch {
            // El personal, si no se puso: los integrantes de la cuadrilla
            val sugerido = _estado.value.personalSugerido
            val completo = if (parte.personal == null && sugerido != null) {
                runCatching { campo.guardarDatosDelDia(parte, null, parte.horaInicio, parte.horaFin, sugerido, parte.notas) }
                    .getOrDefault(parte)
            } else parte
            runCatching { campo.enviarParte(completo) }
                .onSuccess { nuevo -> _estado.update { it.copy(parte = nuevo, observacion = null, aviso = "Reporte enviado al supervisor.") } }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    /** Lo usado hoy, el stock de la cuadrilla y el catálogo para elegir. */
    fun cargarMateriales() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: return@runCatching
                val fecha = _estado.value.fecha
                val consumos = consumoRepo.delDia(cuadrilla.servicioId, cuadrilla.id, fecha, _estado.value.registros)
                val stock = consumoRepo.stock(cuadrilla.servicioId, cuadrilla.id)
                val insumos = runCatching { materialRepo.insumos(cuadrilla.servicioId) }.getOrDefault(emptyList())
                val rendimientos = runCatching { materialRepo.rendimientos(cuadrilla.servicioId) }.getOrDefault(emptyList())
                _estado.update { it.copy(consumos = consumos, stockCuadrilla = stock, insumos = insumos, rendimientos = rendimientos) }
            }
        }
    }

    fun registrarConsumo(insumoId: String, nombre: String, unidad: String?, cantidad: Double, registro: RegistroLocal?) {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Tu usuario no dirige ninguna cuadrilla.")
                consumoRepo.registrar(
                    cuadrilla.servicioId, cuadrilla.id, _estado.value.fecha, insumoId, nombre, unidad, cantidad,
                    registro, _estado.value.parte?.clientId,
                )
            }.onSuccess {
                _estado.update { it.copy(aviso = "Material anotado. Se enviará al haber señal.") }
                cargarMateriales()
            }.onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    /** Los equipos y otros recursos anotados en el parte. */
    fun cargarRecursos() {
        val parte = _estado.value.parte ?: return
        viewModelScope.launch {
            runCatching { recursoRepo.delParte(parte, _estado.value.registros) }
                .onSuccess { r -> _estado.update { it.copy(recursos = r) } }
        }
    }

    fun registrarRecurso(
        tipo: String, codigo: String?, descripcion: String, unidad: String?, cantidad: Double?, observacion: String?,
        registro: RegistroLocal? = null,
    ) {
        val parte = _estado.value.parte ?: return
        viewModelScope.launch {
            runCatching { recursoRepo.registrar(parte, tipo, codigo, descripcion, unidad, cantidad, observacion, registro) }
                .onSuccess {
                    _estado.update { it.copy(aviso = if (tipo == "equipo") "Equipo anotado." else "Recurso anotado.") }
                    cargarRecursos()
                }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    fun descartarRecurso(r: pe.servicon.sigov.datos.RecursoDelDia) {
        viewModelScope.launch {
            runCatching { recursoRepo.descartar(r.clientId) }
                .onSuccess { _estado.update { it.copy(aviso = "Quitado.") }; cargarRecursos() }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }

    fun descartarConsumo(c: pe.servicon.sigov.datos.Consumo) {
        viewModelScope.launch {
            runCatching { consumoRepo.descartar(c.clientId) }
                .onSuccess { _estado.update { it.copy(aviso = "Material quitado.") }; cargarMateriales() }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }
}
