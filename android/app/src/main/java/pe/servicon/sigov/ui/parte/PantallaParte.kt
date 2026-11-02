package pe.servicon.sigov.ui.parte

import pe.servicon.sigov.ui.programacion.SelectorDeDia
import pe.servicon.sigov.datos.OrigenDelTrabajo
import pe.servicon.sigov.datos.Peru
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material.icons.outlined.Straighten
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.local.RegistroLocal
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import java.util.Locale

/**
 * El parte diario: lo que la cuadrilla ejecutó hoy.
 *
 * Cada actividad se anota con su tramo, sus progresivas y su metrado, y de
 * ella cuelgan las fotos. Es el documento que después valida el supervisor y
 * sustenta la valorización.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaParte(
    vm: ParteViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alTomarEvidencia: (registroClientId: String) -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var formularioAbierto by remember { mutableStateOf(false) }
    var anotandoMaterial by remember { mutableStateOf(false) }
    var anotandoRecurso by remember { mutableStateOf(false) }
    var editandoDatos by remember { mutableStateOf(false) }
    var confirmandoEnvio by remember { mutableStateOf(false) }
    var menuAbierto by remember { mutableStateOf(false) }
    // La actividad abierta para completarla, y a cuál se le anota material o equipo
    var abierto by remember { mutableStateOf<String?>(null) }
    var materialDe by remember { mutableStateOf<RegistroLocal?>(null) }
    var recursoDe by remember { mutableStateOf<RegistroLocal?>(null) }
    // Con muchas actividades (200 ítems al día), filtrar y buscar (Elvis, 21/10)
    var filtro by rememberSaveable { mutableStateOf("todos") }
    var busqueda by rememberSaveable { mutableStateOf("") }
    var verTodas by rememberSaveable { mutableStateOf(false) }

    // Desde una partida («Registrar avance») el formulario se abre solo
    LaunchedEffect(estado.partidaInicial) {
        if (estado.partidaInicial != null) formularioAbierto = true
    }
    // …o, si ya tenía avance hoy, se abre ese registro para corregirlo
    LaunchedEffect(estado.corregir) {
        estado.corregir?.let { abierto = it; vm.correccionAbierta() }
    }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Reporte Diario",
        seccion = "Apartado 4.6",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Registra lo ejecutado en el día y genera el formato oficial.",
        avisos = avisos,
        acciones = {
            // El formato SIG-OP-F01, armado aquí mismo: el supervisor puede
            // pedir el parte en el frente de trabajo, sin señal.
            if (estado.parte != null && estado.registros.isNotEmpty()) {
                if (estado.imprimiendo) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = Marca.Azul,
                    )
                } else {
                    IconButton(onClick = { vm.imprimirParte(compartir = false) }) {
                        Icon(Icons.Outlined.PictureAsPdf, contentDescription = "Ver el parte en PDF",
                            tint = Marca.Azul)
                    }
                    Box {
                        IconButton(onClick = { menuAbierto = true }) {
                            Icon(Icons.Outlined.IosShare, contentDescription = "Compartir el parte",
                                tint = Marca.Verde)
                        }
                        DropdownMenu(expanded = menuAbierto, onDismissRequest = { menuAbierto = false }) {
                            DropdownMenuItem(
                                text = { Text("Compartir el PDF") },
                                onClick = { menuAbierto = false; vm.imprimirParte(compartir = true) },
                                leadingIcon = { Icon(Icons.Outlined.PictureAsPdf, null) },
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar Excel (.xlsx)") },
                                onClick = { menuAbierto = false; vm.exportar(comoExcel = true) },
                                leadingIcon = { Icon(Icons.Outlined.TableChart, null) },
                            )
                            DropdownMenuItem(
                                text = { Text("Exportar datos (.csv)") },
                                onClick = { menuAbierto = false; vm.exportar(comoExcel = false) },
                                leadingIcon = { Icon(Icons.Outlined.Description, null) },
                            )
                        }
                    }
                }
            }
        },
        botonFlotante = {
            // Enviado o validado, el día está cerrado: ya no se agregan actividades
            if (!estado.cargando && estado.parte != null && estado.parte!!.editable) {
                ExtendedFloatingActionButton(
                    onClick = { formularioAbierto = true },
                    containerColor = Marca.Verde,
                    contentColor = Color.White,
                    icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                    text = { Text("Registrar actividad", fontWeight = FontWeight.SemiBold) },
                )
            }
        },
    ) { relleno ->
      Column(Modifier.fillMaxSize().padding(relleno)) {
        // De qué día es el reporte: hoy, o uno anterior que quedó pendiente
        SelectorDeDia(
            etiqueta = Peru.fechaLarga(estado.fecha),
            esHoy = estado.fecha == Peru.hoy(),
            alRetroceder = { vm.cambiarFecha(-1) },
            alAvanzar = { vm.cambiarFecha(1) },
            alVolverAHoy = vm::volverAHoy,
            fecha = estado.fecha,
            permitirFuturo = false,
            alElegir = vm::irADia,
        )
        when {
            estado.cargando -> Box(
                Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            estado.parte == null -> Box(
                Modifier.fillMaxSize().padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    estado.error ?: "No se pudo abrir el parte.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }

            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Resumen(estado) }
                estado.observacion?.let { nota -> item { ObservacionDelSupervisor(nota) } }
                estado.parte?.let { p ->
                    item { DatosDelDia(p, alEditar = { editandoDatos = true }, vehiculos = estado.vehiculosDelDia, supervisor = estado.supervisor) }
                }

                if (estado.registros.isEmpty()) {
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Outlined.Straighten,
                                contentDescription = null,
                                modifier = Modifier.size(44.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("Todavía no registras nada", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Anota la primera actividad ejecutada. Funciona sin señal.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    val filtrados = estado.registros
                        .filter { r -> cumpleFiltro(r, filtro) }
                        .filter { r -> coincide(r, busqueda, estado.itemDe(r)) }
                    val visibles = if (verTodas) filtrados else filtrados.take(LIMITE)
                    if (estado.registros.size > 3) {
                        item {
                            FiltrosDeActividades(
                                registros = estado.registros,
                                filtro = filtro,
                                alFiltrar = { filtro = it; verTodas = false },
                                busqueda = busqueda,
                                alBuscar = { busqueda = it; verTodas = false },
                                conBuscador = estado.registros.size > LIMITE,
                            )
                        }
                    }
                    if (filtrados.isEmpty()) {
                        item {
                            Text(
                                "Ninguna actividad en este filtro.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 8.dp),
                            )
                        }
                    }
                    items(visibles, key = { it.clientId }) { registro ->
                        Registro(
                            registro = registro,
                            item = estado.itemDe(registro),
                            fases = estado.fotosPorFase[registro.clientId].orEmpty(),
                            materiales = estado.consumos.count { c -> c.registroClientId == registro.clientId },
                            equipos = estado.recursos.count { r -> r.registroClientId == registro.clientId },
                            editable = estado.parte?.editable == true,
                            porEnviar = registro.clientId in estado.porEnviar,
                            programadaEl = registro.planItemId?.let { estado.fechasProgramadas[it] }
                                ?.takeIf { it != estado.parte?.fecha },
                            alAbrir = { abierto = registro.clientId },
                            alTomarEvidencia = { alTomarEvidencia(registro.clientId) },
                        )
                    }
                    // Un corte: lo demás queda a un toque, y abajo el resumen sigue a la mano
                    if (filtrados.size > visibles.size) {
                        item {
                            OutlinedButton(onClick = { verTodas = true }, modifier = Modifier.fillMaxWidth()) {
                                Text("Ver las ${filtrados.size - visibles.size} actividades restantes")
                            }
                        }
                    } else if (verTodas && filtrados.size > LIMITE) {
                        item {
                            TextButton(onClick = { verTodas = false }, modifier = Modifier.fillMaxWidth()) {
                                Text("Mostrar solo las primeras $LIMITE")
                            }
                        }
                    }
                }
                item {
                    MaterialesUsados(
                        consumos = estado.consumos,
                        alAgregar = { anotandoMaterial = true },
                        alQuitar = vm::descartarConsumo,
                    )
                }
                item {
                    RecursosDelDia(
                        recursos = estado.recursos,
                        editable = estado.parte?.editable == true,
                        alAgregar = { anotandoRecurso = true },
                        alQuitar = vm::descartarRecurso,
                    )
                }
                if (estado.parte?.editable == true && estado.registros.isNotEmpty()) {
                    item {
                        BotonEnviar(reenviar = estado.parte?.estado == "observado", alTocar = { confirmandoEnvio = true })
                    }
                }
            }
        }
      }
    }

    if (anotandoRecurso || recursoDe != null) {
        DialogoRecurso(
            alCerrar = { anotandoRecurso = false; recursoDe = null },
            alGuardar = { tipo, codigo, descripcion, unidad, cantidad, observacion ->
                vm.registrarRecurso(tipo, codigo, descripcion, unidad, cantidad, observacion, recursoDe)
                anotandoRecurso = false; recursoDe = null
            },
        )
    }

    // Completar una actividad: metrado, materiales, equipos y observación
    estado.registros.firstOrNull { it.clientId == abierto }?.let { r ->
        if (materialDe == null && recursoDe == null) {
            DetalleDelRegistro(
                registro = r,
                codigo = estado.codigoDe(r),
                item = estado.itemDe(r),
                fases = estado.fotosPorFase[r.clientId].orEmpty(),
                meta = r.planItemId?.let { id -> estado.programadas.firstOrNull { it.id == id }?.meta },
                fotos = vm.fotosDe(r.clientId).collectAsState(initial = emptyList()).value,
                consumos = estado.consumos.filter { c -> c.registroClientId == r.clientId },
                recursos = estado.recursos.filter { x -> x.registroClientId == r.clientId },
                editable = estado.parte?.editable == true,
                alGuardar = { cantidad, obs -> vm.completar(r, cantidad, obs) { abierto = null } },
                alAgregarMaterial = { materialDe = r },
                alAgregarEquipo = { recursoDe = r },
                alQuitarConsumo = vm::descartarConsumo,
                alQuitarRecurso = vm::descartarRecurso,
                alTomarFoto = { abierto = null; alTomarEvidencia(r.clientId) },
                alCerrar = { abierto = null },
            )
        }
    }

    if (editandoDatos) {
        estado.parte?.let { p ->
            DialogoDatosDelDia(
                parte = p,
                personalSugerido = estado.personalSugerido,
                alCerrar = { editandoDatos = false },
                alGuardar = { clima, inicio, fin, personal, notas ->
                    vm.guardarDatosDelDia(clima, inicio, fin, personal, notas)
                    editandoDatos = false
                },
            )
        }
    }

    if (confirmandoEnvio) {
        DialogoEnviar(
            registros = estado.registros.size,
            sinFotos = estado.registros.count { (estado.fotosPorRegistro[it.clientId] ?: 0) == 0 },
            faltanDatos = estado.parte?.let { it.horaInicio == null || it.personal == null } ?: false,
            alCerrar = { confirmandoEnvio = false },
            alEnviar = { vm.enviar(); confirmandoEnvio = false },
        )
    }

    if (anotandoMaterial || materialDe != null) {
        DialogoMaterialUsado(
            stock = estado.stockCuadrilla,
            insumos = estado.insumos,
            // Desde una actividad, el material queda en ella
            registros = materialDe?.let { listOf(it) } ?: estado.registros,
            rendimientos = estado.rendimientos,
            yaAnotados = estado.consumos,
            alCerrar = { anotandoMaterial = false; materialDe = null },
            alGuardar = { id, nombre, unidad, cantidad, registro ->
                vm.registrarConsumo(id, nombre, unidad, cantidad, registro)
                anotandoMaterial = false; materialDe = null
            },
        )
    }

    // La partida de la que se llegó, fija mientras el formulario está abierto
    val desdePartida = remember(formularioAbierto) {
        estado.partidaInicial?.let { OrigenDelTrabajo.Programado(it) }
    }
    var guardados by remember(formularioAbierto) { mutableIntStateOf(0) }

    if (formularioAbierto) {
        FormularioActividad(
            actividades = estado.actividades,
            tramos = estado.tramos,
            programadas = estado.programadas,
            // Los ítems del reporte que ya se atendieron también se ofrecen,
            // marcados «Registrado»: elegirlos completa su misma línea
            pcis = estado.pcis + estado.itemsPciDelDia.values.filter { i -> estado.pcis.none { it.id == i.id } },
            tramoPorDefecto = estado.tramoPorDefecto,
            inicial = desdePartida,
            guardando = estado.guardando,
            registrados = estado.registros.flatMap { listOfNotNull(it.planItemId, it.pciItemId) }.toSet(),
            cuadrilla = estado.cuadrilla,
            guardados = guardados,
            insumos = estado.insumos,
            rendimientos = estado.rendimientos,
            conAvance = estado.conAvance,
            alCorregir = { id -> formularioAbierto = false; vm.partidaInicialAtendida(); abierto = id },
            alCerrar = { formularioAbierto = false; vm.partidaInicialAtendida() },
            alGuardar = { actividad, tramo, ini, fin, lado, cantidad, obs, origen, detalle, materiales, equipos ->
                vm.registrar(actividad, tramo, ini, fin, lado, cantidad, obs, origen, detalle, materiales, equipos) {
                    // Desde una partida se vuelve a ella; si no, a la lista del paso 2
                    if (desdePartida != null) { formularioAbierto = false; vm.partidaInicialAtendida() }
                    else guardados++
                }
            },
        )
    }
}

@Composable
private fun Resumen(estado: EstadoParte) {
    Surface(
        color = Marca.Azul.copy(alpha = 0.06f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Dato("Actividades", estado.registros.size.toString())
            Dato("Por completar", estado.porCompletar.toString(), if (estado.porCompletar > 0) Semaforo.Vencido else Marca.Azul)
            Dato("Estado", estadoDelParte(estado.parte?.estado, ("envio:" + estado.parte?.clientId) in estado.porEnviar))
        }
    }
}

@Composable
private fun Dato(etiqueta: String, valor: String, color: Color = Marca.Azul) {
    Column {
        Text(
            etiqueta.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(valor, style = MaterialTheme.typography.headlineSmall, color = color)
    }
}

private const val LIMITE = 8

private fun cumpleFiltro(r: RegistroLocal, filtro: String): Boolean = when (filtro) {
    "programacion" -> r.origen == "programacion"
    "pci" -> r.origen == "pci"
    "otros" -> r.origen != "programacion" && r.origen != "pci"
    "completar" -> r.cantidad <= 0.0
    else -> true
}

private fun coincide(r: RegistroLocal, q: String, item: Int?): Boolean {
    val t = q.trim().lowercase()
    if (t.isEmpty()) return true
    val numero = t.removePrefix("ítem").removePrefix("item").trim()
    return r.actividadNombre.lowercase().contains(t) ||
        (item != null && numero.isNotEmpty() && item.toString() == numero) ||
        r.pciCodigo?.lowercase()?.contains(t) == true ||
        Progresiva.rango(r.progresivaInicio, r.progresivaFin)?.contains(t) == true
}

/** Programado · PCI · Otros, como en «Registrar actividad», y lo que falta completar. */
@Composable
private fun FiltrosDeActividades(
    registros: List<RegistroLocal>,
    filtro: String,
    alFiltrar: (String) -> Unit,
    busqueda: String,
    alBuscar: (String) -> Unit,
    conBuscador: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "todos" to "Todas",
                "programacion" to "Programado",
                "pci" to "PCI",
                "otros" to "Otros",
                "completar" to "Por completar",
            ).forEach { (clave, nombre) ->
                val n = registros.count { cumpleFiltro(it, clave) }
                if (clave == "todos" || n > 0) {
                    FilterChip(
                        selected = filtro == clave,
                        onClick = { alFiltrar(clave) },
                        label = { Text("$nombre · $n") },
                        colors = if (clave == "completar") FilterChipDefaults.filterChipColors(
                            labelColor = Semaforo.Vencido,
                            selectedContainerColor = Semaforo.Vencido.copy(alpha = 0.14f),
                            selectedLabelColor = Semaforo.Vencido,
                        ) else FilterChipDefaults.filterChipColors(),
                    )
                }
            }
        }
        if (conBuscador) {
            OutlinedTextField(
                value = busqueda,
                onValueChange = alBuscar,
                placeholder = { Text("Buscar actividad, ítem o progresiva") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                trailingIcon = if (busqueda.isNotEmpty()) {
                    { IconButton(onClick = { alBuscar("") }) { Icon(Icons.Outlined.Close, "Borrar la búsqueda") } }
                } else null,
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * Una actividad del reporte. Tocarla la abre para completar metrado,
 * materiales, equipos y observación; mientras le falte el metrado va en
 * rojo (Elvis, 21/10). Las fotos se cuentan por etapa: A · D · DP.
 */
@Composable
private fun Registro(
    registro: RegistroLocal,
    item: Int?,
    fases: Map<String, Int>,
    materiales: Int,
    equipos: Int,
    editable: Boolean,
    porEnviar: Boolean = false,
    /** La fecha programada, cuando no es la de la ejecución (REV3-OBS-20). */
    programadaEl: String? = null,
    alAbrir: () -> Unit,
    alTomarEvidencia: () -> Unit,
) {
    val incompleta = editable && registro.cantidad <= 0.0
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (incompleta) Semaforo.Vencido.copy(alpha = 0.04f) else MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = if (incompleta) androidx.compose.foundation.BorderStroke(1.5.dp, Semaforo.Vencido.copy(alpha = 0.7f))
                 else CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth().clickable(onClick = alAbrir),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    if (registro.origen == "pci") {
                        Text(
                            listOfNotNull(registro.pciCodigo?.let { pe.servicon.sigov.datos.codigoCortoDePci(it) }, item?.let { "Ítem $it" })
                                .joinToString(" · "),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        registro.actividadNombre,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(
                            registro.tramoNombre,
                            Progresiva.rango(registro.progresivaInicio, registro.progresivaFin),
                            pe.servicon.sigov.datos.Lados.etiqueta(registro.lado),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    programadaEl?.let { f ->
                        Text(
                            "Programado ${f.split("-").reversed().joinToString("/")} · ejecutado en este reporte",
                            style = MaterialTheme.typography.labelSmall,
                            color = Marca.Naranja,
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        pe.servicon.sigov.datos.Numeros.tres(registro.cantidad),
                        style = MaterialTheme.typography.headlineSmall,
                        color = if (incompleta) Semaforo.Vencido else Marca.Azul,
                    )
                    registro.unidad?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }

            // De dónde salió. En la valorización es lo primero que se revisa:
            // un metrado sin origen es un metrado que hay que ir a preguntar.
            Spacer(Modifier.height(8.dp))
            val (rotulo, tinte) = when (registro.origen) {
                "programacion" -> "Según programación" to Marca.VerdeBandera
                "pci" -> "Levantamiento de PCI" to Marca.Naranja
                else -> "No programado" to MaterialTheme.colorScheme.onSurfaceVariant
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Etiqueta(rotulo, tinte)
                // Guardado en el equipo, sube al haber señal (SEG-V2-OBS-03)
                if (porEnviar) Etiqueta("Por enviar", Marca.Naranja)
            }

            registro.observacion?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "«$it»",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(10.dp))
            // Las fotos por etapa, como en el módulo PCI; tocar agrega otra
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    onClick = alTomarEvidencia,
                    shape = RoundedCornerShape(10.dp),
                    color = Marca.Azul.copy(alpha = 0.06f),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    ) {
                        Icon(Icons.Outlined.PhotoCamera, contentDescription = "Tomar foto", tint = Marca.Azul, modifier = Modifier.size(18.dp))
                        if (fases.values.sum() == 0 && registro.origen != "pci") {
                            Text("Tomar evidencia fotográfica", style = MaterialTheme.typography.bodySmall, color = Marca.Naranja)
                        } else {
                            ContadorPorEtapa(fases, exigeLasTres = registro.origen == "pci" || registro.planItemId != null)
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Outlined.ChevronRight, contentDescription = "Completar", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            // Lo que le falta o lo que ya tiene
            Spacer(Modifier.height(6.dp))
            Text(
                listOfNotNull(
                    if (incompleta) "Falta el metrado · tócala para completarla" else null,
                    if (materiales > 0) "$materiales material${if (materiales == 1) "" else "es"}" else null,
                    if (equipos > 0) "$equipos equipo${if (equipos == 1) "" else "s"}" else null,
                ).joinToString(" · ").ifEmpty { if (editable) "Toca para anotar materiales y equipos" else "" },
                style = MaterialTheme.typography.labelSmall,
                color = if (incompleta) Semaforo.Vencido else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Etiqueta(texto: String, color: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}
