package pe.servicon.sigov.ui.parte

import pe.servicon.sigov.datos.Peru
import androidx.lifecycle.SavedStateHandle
import pe.servicon.sigov.datos.celdaTexto
import pe.servicon.sigov.datos.HojaXlsx
import pe.servicon.sigov.datos.Celda
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
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

data class EstadoParte(
    val cargando: Boolean = true,
    /** El día que se reporta: hoy por defecto, se puede cambiar (Elvis, 05-10). */
    val fecha: LocalDate = Peru.hoy(),
    /** El subtramo de la cuadrilla, puesto de entrada en el formulario. */
    val tramoPorDefecto: Tramo? = null,
    /** Llegó desde una partida con «Registrar avance»: se abre ya elegida. */
    val partidaInicial: ItemProgramado? = null,
    val parte: ParteLocal? = null,
    val registros: List<RegistroLocal> = emptyList(),
    val actividades: List<Actividad> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    // Lo que el capataz puede señalar como origen del metrado
    val programadas: List<ItemProgramado> = emptyList(),
    val pcis: List<ItemPci> = emptyList(),
    val cuadrilla: String = "",
    val fotosPorRegistro: Map<String, Int> = emptyMap(),
    /** Material usado en el día (Formato 8) y lo que la cuadrilla tiene. */
    val consumos: List<pe.servicon.sigov.datos.Consumo> = emptyList(),
    val stockCuadrilla: List<pe.servicon.sigov.datos.StockDeCuadrilla> = emptyList(),
    val insumos: List<pe.servicon.sigov.datos.Insumo> = emptyList(),
    val guardando: Boolean = false,
    /** Mientras se arma el PDF del parte */
    val imprimiendo: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val metradoTotal: Double get() = registros.sumOf { it.cantidad }
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
    private val consumoRepo: pe.servicon.sigov.datos.ConsumoRepositorio,
    private val materialRepo: pe.servicon.sigov.datos.MaterialRepositorio,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoParte())
    val estado: StateFlow<EstadoParte> = _estado.asStateFlow()

    init { abrir(Peru.hoy()) }

    /** Reportar otro día: el de ayer que quedó pendiente, por ejemplo. No el de mañana. */
    fun cambiarFecha(dias: Long) {
        val nueva = _estado.value.fecha.plusDays(dias)
        if (nueva.isAfter(Peru.hoy())) return
        abrir(nueva)
    }

    fun volverAHoy() = abrir(Peru.hoy())

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

                // Lo programado y los PCI llegan después: si no hay señal el
                // parte igual se abre, solo que sin poder amarrar el origen.
                runCatching {
                    val programadas = campo.programacionDelDia(servicioId, cuadrilla.id, fecha)
                    val pcis = campo.pciAsignados(servicioId, cuadrilla.id)
                    // Si se llegó desde una partida, se ofrece ya elegida (una sola vez)
                    val pedida = ruta.get<String>("partida")?.also { ruta["partida"] = null }
                    _estado.update {
                        it.copy(
                            programadas = programadas,
                            pcis = pcis,
                            partidaInicial = pedida?.let { id -> programadas.firstOrNull { p -> p.id == id } },
                        )
                    }
                }
                vigilarRegistros(parte.clientId)
                cargarMateriales()
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
                    _estado.update { it.copy(registros = filas) }
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
        alTerminar: () -> Unit,
    ) {
        val parte = _estado.value.parte ?: return
        _estado.update { it.copy(guardando = true) }

        viewModelScope.launch {
            runCatching {
                campo.registrarActividad(
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
                )
            }.onSuccess {
                _estado.update {
                    it.copy(
                        guardando = false,
                        aviso = when (origen) {
                            is OrigenDelTrabajo.Programado ->
                                "Registrado y descontado de la partida programada."
                            is OrigenDelTrabajo.Pci ->
                                "Registrado como sustento del ${origen.item.pciCodigo ?: "PCI"}."
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
     * El parte del día como PDF, armado en el equipo.
     *
     * El formato SIG-OP-F01 sale igual que el del panel, pero sin depender de
     * que haya señal: al capataz le pueden pedir el parte en el frente de
     * trabajo y aquí lo manda por donde quiera.
     */
    fun imprimirParte(compartir: Boolean) {
        val e = _estado.value
        val parte = e.parte ?: return
        _estado.update { it.copy(imprimiendo = true) }

        viewModelScope.launch {
            runCatching {
                val servicio = campo.contrato(parte.servicioId)
                val quien = sesion.perfil()?.nombre ?: "SIGOV"
                val fecha = LocalDate.parse(parte.fecha)

                val archivo = formatos.armar(
                    formato = FormatoOficial.PARTE,
                    cab = CabeceraPdf(
                        servicio = servicio?.name ?: "",
                        cliente = servicio?.cliente,
                        contrato = servicio?.contrato,
                        cuadrilla = e.cuadrilla,
                        fecha = fecha,
                        lugar = e.registros.firstNotNullOfOrNull { it.tramoNombre },
                        emitidoPor = quien,
                    ),
                    // De dónde nace cada actividad, sus dos progresivas y la
                    // observación que escribió la cuadrilla: antes el PDF solo
                    // traía la nota del parte, y lo anotado en cada registro
                    // —«PRUEBA OFFLINE» en la prueba— no salía (OBS-28/30/31).
                    columnas = listOf("Actividad", "Origen", "Prog. inicio", "Prog. fin", "Lado",
                        "Cantidad", "Observación", "Fotos"),
                    anchos = listOf(118f, 62f, 50f, 50f, 38f, 52f, 107f, 30f),
                    filas = e.registros.map { r ->
                        listOf(
                            r.actividadNombre,
                            origenDe(r),
                            r.progresivaInicio?.let { progresiva(it) } ?: "—",
                            r.progresivaFin?.takeIf { it != r.progresivaInicio }?.let { progresiva(it) } ?: "—",
                            r.lado.replaceFirstChar { it.uppercase() },
                            "%.2f %s".format(r.cantidad, r.unidad ?: ""),
                            r.observacion?.takeIf { it.isNotBlank() } ?: "—",
                            (e.fotosPorRegistro[r.clientId] ?: 0).toString(),
                        )
                    },
                    contextoExtra = listOf(
                        "Clima" to (parte.clima ?: "—"),
                        "Personal" to (parte.personal?.toString() ?: "—"),
                        "Jornada" to listOfNotNull(parte.horaInicio, parte.horaFin)
                            .joinToString(" a ").ifBlank { "—" },
                        "Metrado total" to "%.2f".format(e.metradoTotal),
                    ),
                    nota = parte.notas,
                    firmas = listOf(
                        FirmaPdf(quien, "Jefe de cuadrilla"),
                        FirmaPdf("", "Supervisor de obra"),
                    ),
                    nombreArchivo = "PARTE_${parte.fecha}_${e.cuadrilla.filter { it.isLetterOrDigit() }}",
                )
                if (compartir) formatos.compartir(archivo, "Parte diario ${parte.fecha}")
                else formatos.abrir(archivo)
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
            _estado.update { it.copy(imprimiendo = false) }
        }
    }

    /**
     * El mismo parte como hoja de cálculo.
     *
     * Dos salidas distintas y con su nombre (OBS-35 a 38): «Excel» genera un
     * .xlsx de verdad, con números y fechas que Excel reconoce y filtros; los
     * datos en CSV quedan aparte, para cargarlos en otro sistema.
     */
    fun exportar(comoExcel: Boolean) {
        val e = _estado.value
        val parte = e.parte ?: return
        _estado.update { it.copy(imprimiendo = true) }

        viewModelScope.launch {
            runCatching {
                val servicio = campo.contrato(parte.servicioId)
                val fecha = LocalDate.parse(parte.fecha)
                val columnas = listOf("Fecha", "Cuadrilla", "Actividad", "Origen", "Tramo",
                    "Progresiva inicio", "Progresiva fin", "Lado", "Cantidad", "Unidad",
                    "Observación", "Fotos")
                val nombre = "PARTE_${parte.fecha}_${e.cuadrilla.filter { it.isLetterOrDigit() }}"
                val archivo = if (comoExcel) {
                    formatos.armarXlsx(
                        nombreArchivo = nombre,
                        hojas = listOf(HojaXlsx(
                            nombre = "Parte ${parte.fecha}",
                            ficha = listOf(
                                "Contrato" to (servicio?.name ?: ""),
                                "Cliente" to (servicio?.cliente ?: ""),
                                "Cuadrilla" to e.cuadrilla,
                                "Fecha" to "%02d/%02d/%d".format(fecha.dayOfMonth, fecha.monthValue, fecha.year),
                                "Metrado total" to "%.2f".format(java.util.Locale.US, e.metradoTotal),
                            ),
                            columnas = columnas,
                            anchos = listOf(11.0, 22.0, 40.0, 16.0, 26.0, 14.0, 14.0, 9.0, 11.0, 8.0, 40.0, 7.0),
                            filas = e.registros.map { r ->
                                listOf(
                                    Celda.Fecha(fecha),
                                    celdaTexto(e.cuadrilla),
                                    celdaTexto(r.actividadNombre),
                                    celdaTexto(origenDe(r)),
                                    celdaTexto(r.tramoNombre),
                                    celdaTexto(r.progresivaInicio?.let { progresiva(it) }),
                                    celdaTexto(r.progresivaFin?.let { progresiva(it) }),
                                    celdaTexto(r.lado),
                                    Celda.Numero(r.cantidad),
                                    celdaTexto(r.unidad),
                                    celdaTexto(r.observacion),
                                    Celda.Numero((e.fotosPorRegistro[r.clientId] ?: 0).toDouble()),
                                )
                            },
                        )),
                    )
                } else {
                    formatos.armarCsv(
                        nombreArchivo = nombre,
                        columnas = columnas,
                        filas = e.registros.map { r ->
                            listOf(
                                parte.fecha,
                                e.cuadrilla,
                                r.actividadNombre,
                                origenDe(r),
                                r.tramoNombre ?: "",
                                r.progresivaInicio?.let { progresiva(it) } ?: "",
                                r.progresivaFin?.let { progresiva(it) } ?: "",
                                r.lado,
                                // Punto decimal siempre, sea cual sea el idioma del teléfono
                                "%.2f".format(java.util.Locale.US, r.cantidad),
                                r.unidad ?: "",
                                r.observacion ?: "",
                                (e.fotosPorRegistro[r.clientId] ?: 0).toString(),
                            )
                        },
                    )
                }
                formatos.compartir(archivo, "Parte diario ${parte.fecha}")
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
            _estado.update { it.copy(imprimiendo = false) }
        }
    }

    /** De dónde nace la actividad, como se lee en el formato. */
    private fun origenDe(r: RegistroLocal): String = when (r.origen) {
        "programacion" -> "Programación"
        "pci" -> listOfNotNull("PCI", r.pciCodigo).joinToString(" ")
        "no_programado" -> "No programado"
        else -> "Emergencia"
    }

    /** La progresiva, como se lee en el contrato: 12+450. */
    private fun progresiva(metros: Double): String =
        "%d+%03d".format((metros / 1000).toInt(), (metros % 1000).toInt())

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }

    /** Lo usado hoy, el stock de la cuadrilla y el catálogo para elegir. */
    fun cargarMateriales() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: return@runCatching
                val fecha = _estado.value.fecha
                val consumos = consumoRepo.delDia(cuadrilla.servicioId, cuadrilla.id, fecha, _estado.value.registros)
                val stock = consumoRepo.stock(cuadrilla.servicioId, cuadrilla.id)
                val insumos = runCatching { materialRepo.insumos(cuadrilla.servicioId) }.getOrDefault(emptyList())
                _estado.update { it.copy(consumos = consumos, stockCuadrilla = stock, insumos = insumos) }
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

    fun descartarConsumo(c: pe.servicon.sigov.datos.Consumo) {
        viewModelScope.launch {
            runCatching { consumoRepo.descartar(c.clientId) }
                .onSuccess { _estado.update { it.copy(aviso = "Material quitado.") }; cargarMateriales() }
                .onFailure { f -> _estado.update { it.copy(error = f.enCristiano()) } }
        }
    }
}
