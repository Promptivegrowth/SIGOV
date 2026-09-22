package pe.servicon.sigov.ui.parte

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
    val parte: ParteLocal? = null,
    val registros: List<RegistroLocal> = emptyList(),
    val actividades: List<Actividad> = emptyList(),
    val tramos: List<Tramo> = emptyList(),
    // Lo que el capataz puede señalar como origen del metrado
    val programadas: List<ItemProgramado> = emptyList(),
    val pcis: List<ItemPci> = emptyList(),
    val cuadrilla: String = "",
    val fotosPorRegistro: Map<String, Int> = emptyMap(),
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
    private val campo: CampoRepositorio,
    private val sesion: SesionRepositorio,
    private val partes: ParteDao,
    private val formatos: FormatosPdf,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoParte())
    val estado: StateFlow<EstadoParte> = _estado.asStateFlow()

    init { abrir() }

    private fun abrir() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val servicioId = cuadrilla.servicioId

                // Los catálogos se refrescan si hay señal; si no, se usa la
                // copia que ya está en el equipo.
                runCatching { campo.bajarCatalogos(servicioId) }

                val parte = campo.abrirParteDeHoy(servicioId, cuadrilla.id)

                _estado.update {
                    it.copy(
                        cargando = false,
                        parte = parte,
                        cuadrilla = cuadrilla.name,
                        actividades = campo.actividades(servicioId),
                        tramos = campo.tramos(servicioId),
                    )
                }

                // Lo programado y los PCI llegan después: si no hay señal el
                // parte igual se abre, solo que sin poder amarrar el origen.
                runCatching {
                    val programadas = campo.programacionDelDia(servicioId, cuadrilla.id)
                    val pcis = campo.pciAsignados(servicioId, cuadrilla.id)
                    _estado.update { it.copy(programadas = programadas, pcis = pcis) }
                }
                vigilarRegistros(parte.clientId)
            }.onFailure { fallo ->
                _estado.update { it.copy(cargando = false, error = fallo.enCristiano()) }
            }
        }
    }

    private fun vigilarRegistros(parteId: String) {
        viewModelScope.launch {
            campo.registrosDe(parteId).collectLatest { filas ->
                _estado.update { it.copy(registros = filas) }
            }
        }
        // Las fotos se cuentan aparte: al volver de la cámara la lista se
        // actualiza sola, sin recargar el parte.
        viewModelScope.launch {
            partes.conteoEvidencias(parteId).collectLatest { conteos ->
                _estado.update { estado ->
                    estado.copy(fotosPorRegistro = conteos.associate { it.registroClientId to it.cuantas })
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
                        programadas = campo.programacionDelDia(cuadrilla.servicioId, cuadrilla.id),
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
                    columnas = listOf("Actividad", "Tramo", "Progresiva", "Lado", "Cantidad", "Fotos"),
                    anchos = listOf(150f, 110f, 95f, 50f, 65f, 57f),
                    filas = e.registros.map { r ->
                        listOf(
                            r.actividadNombre,
                            r.tramoNombre ?: "—",
                            listOfNotNull(r.progresivaInicio, r.progresivaFin)
                                .joinToString(" → ") { progresiva(it) }
                                .ifBlank { "—" },
                            r.lado.replaceFirstChar { it.uppercase() },
                            "%.2f %s".format(r.cantidad, r.unidad ?: ""),
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
     * Lo pide la oficina cuando quiere sumar metrados de varias cuadrillas:
     * el PDF se lee, el CSV se pega en la planilla.
     */
    fun exportarCsv() {
        val e = _estado.value
        val parte = e.parte ?: return
        _estado.update { it.copy(imprimiendo = true) }

        viewModelScope.launch {
            runCatching {
                val servicio = campo.contrato(parte.servicioId)
                val archivo = formatos.armarCsv(
                    columnas = listOf("Actividad", "Tramo", "Progresiva inicio", "Progresiva fin",
                        "Lado", "Cantidad", "Unidad", "Origen", "Observación", "Fotos"),
                    filas = e.registros.map { r ->
                        listOf(
                            r.actividadNombre,
                            r.tramoNombre ?: "",
                            r.progresivaInicio?.let { progresiva(it) } ?: "",
                            r.progresivaFin?.let { progresiva(it) } ?: "",
                            r.lado,
                            "%.2f".format(r.cantidad),
                            r.unidad ?: "",
                            r.pciCodigo ?: r.origen,
                            r.observacion ?: "",
                            (e.fotosPorRegistro[r.clientId] ?: 0).toString(),
                        )
                    },
                    encabezado = listOf(
                        "Contrato" to (servicio?.name ?: ""),
                        "Cliente" to (servicio?.cliente ?: ""),
                        "Cuadrilla" to e.cuadrilla,
                        "Fecha" to parte.fecha,
                        "Metrado total" to "%.2f".format(e.metradoTotal),
                    ),
                    nombreArchivo = "PARTE_${parte.fecha}_${e.cuadrilla.filter { it.isLetterOrDigit() }}",
                )
                formatos.compartir(archivo, "Parte diario ${parte.fecha}")
            }.onFailure { fallo ->
                _estado.update { it.copy(error = fallo.enCristiano()) }
            }
            _estado.update { it.copy(imprimiendo = false) }
        }
    }

    /** La progresiva, como se lee en el contrato: 12+450. */
    private fun progresiva(metros: Double): String =
        "%d+%03d".format((metros / 1000).toInt(), (metros % 1000).toInt())

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}
