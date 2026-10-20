package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WarningAmber
import pe.servicon.sigov.ui.pci.Plazo
import pe.servicon.sigov.ui.pci.cumple
import pe.servicon.sigov.ui.theme.Semaforo
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import pe.servicon.sigov.datos.Actividad
import pe.servicon.sigov.datos.DetalleFor001
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.OrigenDelTrabajo
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.ui.theme.Marca
import java.text.Normalizer

/**
 * Los lados de la vía: el valor que guarda la base y cómo se escribe en el
 * formato oficial.
 */
private val LADOS = pe.servicon.sigov.datos.Lados.todos.map { it.valor to it.etiqueta }

/**
 * El lado escrito por el supervisor (LI, LD, LD/LI, LD/EJE/LI, CD, CI…), en
 * el valor de la base. CD y CI son la calzada (Elvis, P8), no LD y LI.
 */
internal fun ladoDesdeProgramacion(texto: String?): String? {
    val crudo = texto?.trim()?.lowercase() ?: return null
    pe.servicon.sigov.datos.Lados.todos.firstOrNull { it.valor == crudo }?.let { return it.valor }
    val t = crudo.uppercase().replace(" ", "").replace(".", "")
    val d = "LD" in t
    val i = "LI" in t
    val cd = "CD" in t || "CALZADADER" in t
    val ci = "CI" in t || "CALZADAIZQ" in t
    return when {
        d && i -> "ambos"
        d -> "derecho"
        i -> "izquierdo"
        cd && ci -> "ambos"
        cd -> "calzada_derecha"
        ci -> "calzada_izquierda"
        "EJE" in t -> "eje"
        else -> null
    }
}

/**
 * Registrar actividad, en tres pasos (boceto de Elvis del 13/10/2026):
 *
 * 1. **Origen**: Programado, PCI, Otros o Emergencia, en cuatro tarjetas.
 * 2. **Actividad**: las partidas que el supervisor programó para el día o los
 *    ítems PCI disponibles (con filtro de plazo), cada uno con «Seleccionar».
 *    Lo ya registrado se marca «Registrado»; un PCI con sus tres fotos queda
 *    registrado solo, y en rojo si le falta alguna.
 * 3. **Avance**: lo que trae la partida o el ítem va bloqueado (🔒) y solo se
 *    escribe lo que pasó en campo. En lo programado se pueden corregir el
 *    tramo, las progresivas y el lado («me programaron del 12 al 14 y ejecuté
 *    del 12 al 13»); en un PCI todo es fijo, salvo la observación.
 *
 * Otros y Emergencia saltan del paso 1 al 3 con el formulario completo. Al
 * guardar se vuelve al paso 2 para seguir con la siguiente (Elvis: «no me
 * va a botar al primer paso»). Si se llegó desde una partida («Registrar
 * avance»), se abre directo en el paso 3.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormularioActividad(
    actividades: List<Actividad>,
    tramos: List<Tramo>,
    programadas: List<ItemProgramado>,
    pcis: List<ItemPci>,
    tramoPorDefecto: Tramo?,
    /** Cuando se llega desde una partida («Registrar avance»): ya elegida. */
    inicial: OrigenDelTrabajo? = null,
    guardando: Boolean,
    /** Los id de partidas e ítems PCI que ya tienen registro en este reporte. */
    registrados: Set<String> = emptySet(),
    cuadrilla: String = "",
    /** Sube cada vez que se guardó bien: el formulario vuelve al paso 2. */
    guardados: Int = 0,
    alCerrar: () -> Unit,
    alGuardar: (
        actividad: Actividad,
        tramo: Tramo?,
        progresivaInicio: Double?,
        progresivaFin: Double?,
        lado: String,
        cantidad: Double,
        observacion: String?,
        origen: OrigenDelTrabajo,
        detalle: DetalleFor001,
    ) -> Unit,
) {
    // Lo ya culminado no se ofrece: volver a registrar contra una partida
    // cerrada infla el avance por encima de la meta.
    val pendientes = remember(programadas) {
        programadas.filter { it.status !in setOf("ejecutado", "por_validar", "validado") }
    }

    var paso by remember { mutableIntStateOf(if (inicial != null) 3 else 1) }
    var verPci by remember { mutableStateOf(false) }
    var origen by remember { mutableStateOf(inicial ?: OrigenDelTrabajo.NoProgramado) }
    var actividad by remember { mutableStateOf<Actividad?>(null) }
    var tramo by remember { mutableStateOf(tramoPorDefecto) }
    var progIni by remember { mutableStateOf("") }
    var progFin by remember { mutableStateOf("") }
    var lado by remember { mutableStateOf("derecho") }
    var metrado by remember { mutableStateOf("") }
    var observacion by remember { mutableStateOf("") }
    // FOR:001: horas, personas y medidas de lo ejecutado
    var horaIni by remember { mutableStateOf("") }
    var horaFin by remember { mutableStateOf("") }
    var personas by remember { mutableStateOf("") }
    var longitud by remember { mutableStateOf("") }
    var ancho by remember { mutableStateOf("") }
    var espesor by remember { mutableStateOf("") }
    var verFor001 by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var buscando by remember { mutableStateOf(false) }

    // Al elegir de dónde sale el trabajo, el formulario se rellena solo
    fun adoptar(nuevo: OrigenDelTrabajo) {
        origen = nuevo
        error = null
        metrado = ""
        observacion = ""
        horaIni = ""; horaFin = ""; personas = ""; longitud = ""; ancho = ""; espesor = ""
        when (nuevo) {
            is OrigenDelTrabajo.Programado -> {
                actividad = actividades.firstOrNull { it.id == nuevo.item.actividadId }
                    ?: nuevo.item.actividadId?.let { id ->
                        Actividad(id = id, code = nuevo.item.actividadCodigo ?: "", name = nuevo.item.actividad ?: "")
                    }
                tramo = tramos.firstOrNull { it.id == nuevo.item.tramoId } ?: tramoPorDefecto
                progIni = nuevo.item.progresivaInicio?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
                lado = ladoDesdeProgramacion(nuevo.item.lado) ?: "derecho"
            }
            is OrigenDelTrabajo.Pci -> {
                actividad = actividades.firstOrNull { it.id == nuevo.item.actividadId }
                    ?: nuevo.item.actividadId?.let { id ->
                        Actividad(id = id, code = nuevo.item.actividadCodigo ?: "", name = nuevo.item.actividad ?: "")
                    }
                tramo = tramos.firstOrNull { it.id == nuevo.item.tramoId || it.name == nuevo.item.tramo } ?: tramoPorDefecto
                progIni = nuevo.item.progresiva?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
                lado = nuevo.item.side ?: "derecho"
                // El metrado del PCI es el del ítem: puntual o por intervalo (Elvis)
                metrado = nuevo.item.quantity?.let { cifra(it) } ?: ""
            }
            OrigenDelTrabajo.NoProgramado, OrigenDelTrabajo.Emergencia -> {
                // Se elige del catálogo; el tramo vuelve al de la cuadrilla
                actividad = null
                tramo = tramoPorDefecto
                progIni = ""
                progFin = ""
                lado = "derecho"
            }
        }
    }

    // La primera vez, rellenar con lo que trae la partida de la que se llegó
    LaunchedEffect(Unit) { inicial?.let { adoptar(it) } }

    // Guardado bien: a la lista del paso 2 (o al paso 1 si era manual)
    LaunchedEffect(guardados) {
        if (guardados > 0) {
            error = null
            paso = if (origen is OrigenDelTrabajo.Programado || origen is OrigenDelTrabajo.Pci) 2 else 1
        }
    }

    val manual = origen is OrigenDelTrabajo.NoProgramado || origen is OrigenDelTrabajo.Emergencia
    val itemPci = (origen as? OrigenDelTrabajo.Pci)?.item
    val partida = (origen as? OrigenDelTrabajo.Programado)?.item

    fun atras() {
        error = null
        paso = when {
            paso == 3 && inicial != null -> { alCerrar(); 3 }
            paso == 3 && manual -> 1
            else -> paso - 1
        }
    }

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.94f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                // ─── Cabecera e indicador de pasos ─────────────────────
                Row(Modifier.padding(start = 6.dp, end = 16.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { if (paso == 1) alCerrar() else atras() }) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Atrás")
                    }
                    Column {
                        Text(
                            if (paso == 3) "Registrar avance" else "Registrar actividad",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (cuadrilla.isNotBlank()) {
                            Text(cuadrilla, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                IndicadorDePasos(paso, Modifier.padding(horizontal = 24.dp, vertical = 10.dp))
                HorizontalDivider()

                Column(
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (paso) {
                        // ─── 1 · Origen ────────────────────────────────
                        1 -> {
                            TituloDePaso("1. Seleccionar origen del trabajo", "¿De dónde sale este trabajo?")
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                TarjetaDeOrigen(
                                    "Programado", "Trabajo del programa del día", Icons.Outlined.CalendarMonth,
                                    cuenta = pendientes.size, habilitada = pendientes.isNotEmpty(), modifier = Modifier.weight(1f),
                                ) { verPci = false; paso = 2 }
                                TarjetaDeOrigen(
                                    "PCI", "Trabajo del inventario PCI", Icons.Outlined.Description,
                                    cuenta = pcis.size, habilitada = pcis.isNotEmpty(), modifier = Modifier.weight(1f),
                                ) { verPci = true; paso = 2 }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                TarjetaDeOrigen(
                                    "Otros", "Trabajo no programado", Icons.Outlined.EditNote,
                                    destacada = false, modifier = Modifier.weight(1f),
                                ) { adoptar(OrigenDelTrabajo.NoProgramado); paso = 3 }
                                TarjetaDeOrigen(
                                    "Emergencia", "Atención inmediata", Icons.Outlined.WarningAmber,
                                    destacada = false, color = Marca.Naranja, modifier = Modifier.weight(1f),
                                ) { adoptar(OrigenDelTrabajo.Emergencia); paso = 3 }
                            }
                            Aviso("El jefe de cuadrilla no debe reconstruir manualmente lo que ya viene asignado.", Marca.Azul)
                        }

                        // ─── 2 · Actividad ─────────────────────────────
                        2 -> {
                            Aviso("Desde aquí se selecciona el trabajo real, sin volver a digitar todo.", Marca.Azul)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Pestana("Si viene de Programado", !verPci, Modifier.weight(1f)) { verPci = false }
                                Pestana("Si viene de PCI", verPci, Modifier.weight(1f)) { verPci = true }
                            }
                            if (!verPci) {
                                Text("Actividades programadas del día", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                if (pendientes.isEmpty()) {
                                    Text("El supervisor no programó partidas pendientes para este día.",
                                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                pendientes.forEach { p ->
                                    TarjetaDePartida(p, registrada = p.id in registrados) {
                                        adoptar(OrigenDelTrabajo.Programado(p)); paso = 3
                                    }
                                }
                            } else {
                                ListaDeItemsPci(pcis, registrados) { item -> adoptar(OrigenDelTrabajo.Pci(item)); paso = 3 }
                            }
                        }

                        // ─── 3 · Avance ────────────────────────────────
                        else -> {
                            TituloDePaso("3. Registrar avance", "Lo que hizo la cuadrilla, dónde y cuánto")
                            if (inicial is OrigenDelTrabajo.Programado) {
                                val dia = runCatching { java.time.LocalDate.parse(inicial.item.fecha) }.getOrNull()
                                Text(
                                    "Avance de la partida programada" + (dia?.let { " del " + pe.servicon.sigov.datos.Peru.fechaCorta(it) } ?: ""),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            CampoFijo(
                                "Origen del trabajo",
                                when (origen) {
                                    is OrigenDelTrabajo.Programado -> "Programado"
                                    is OrigenDelTrabajo.Pci -> "PCI · " + listOfNotNull(itemPci?.pciCorto, itemPci?.numero?.let { "Ítem $it" }).joinToString(" · ")
                                    OrigenDelTrabajo.NoProgramado -> "Otros · trabajo no programado"
                                    OrigenDelTrabajo.Emergencia -> "Emergencia"
                                },
                            )

                            if (manual) {
                                // Buscador del catálogo completo: 191 partidas no caben en un desplegable
                                Box {
                                    OutlinedTextField(
                                        value = actividad?.name ?: "",
                                        onValueChange = {},
                                        readOnly = true,
                                        label = { Text("Actividad") },
                                        placeholder = { Text("Buscar por nombre o código…") },
                                        supportingText = actividad?.let { a -> { Text(a.code, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                                        trailingIcon = { Icon(Icons.Outlined.Search, null) },
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    // Todo el campo abre el buscador
                                    Box(Modifier.matchParentSize().clickable { buscando = true })
                                }
                            } else {
                                CampoFijo("Actividad", actividad?.name ?: partida?.actividad ?: itemPci?.actividad ?: itemPci?.tituloCorto ?: "—")
                                itemPci?.let { CampoFijo("Ítem", it.description ?: it.tituloCorto, lineas = 3) }
                            }

                            // El tramo: fijo en el PCI; en lo demás, se corrige si hizo falta
                            if (itemPci != null) {
                                CampoFijo("Tramo", tramo?.name ?: itemPci.tramo ?: "—")
                            } else {
                                Selector(
                                    etiqueta = "Tramo",
                                    valor = tramo?.let { "${it.code} · ${it.name}" } ?: "",
                                    opciones = tramos.map { "${it.code} · ${it.name}" },
                                    alElegir = { i -> tramo = tramos[i] },
                                )
                            }

                            if (itemPci != null) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    CampoFijo("Progresiva inicio", progIni.ifBlank { "—" }, Modifier.weight(1f))
                                    CampoFijo("Progresiva fin", progFin.ifBlank { "—" }, Modifier.weight(1f))
                                }
                                CampoFijo("Lado de la vía", LADOS.firstOrNull { it.first == lado }?.second ?: lado)
                            } else {
                                if (partida != null) {
                                    Text("Si no ejecutaste todo el tramo programado, corrige las progresivas.",
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    OutlinedTextField(
                                        value = progIni,
                                        onValueChange = { progIni = it },
                                        label = { Text("Progresiva inicio") },
                                        placeholder = { Text("1334.600") },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f),
                                    )
                                    OutlinedTextField(
                                        value = progFin,
                                        onValueChange = { progFin = it },
                                        label = { Text("Progresiva fin") },
                                        placeholder = { Text("1335.000") },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                // «1334.600» vale lo mismo que «1334+600»: el teclado
                                // numérico no tiene «+» (Elvis, video del 13/10)
                                Text(
                                    "Se escribe 1334.600 o 1334+600 (km y metros).",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Selector(
                                    etiqueta = "Lado de la vía",
                                    valor = LADOS.firstOrNull { it.first == lado }?.second ?: lado,
                                    opciones = LADOS.map { it.second },
                                    alElegir = { i -> lado = LADOS[i].first },
                                )
                            }

                            // Unidad y meta, de la programación
                            partida?.let { p ->
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    CampoFijo("Unidad", p.unidad ?: "—", Modifier.weight(1f))
                                    CampoFijo("Meta programada", p.meta?.let { cifra(it) } ?: "—", Modifier.weight(1f))
                                }
                            }

                            val unidad = partida?.unidad ?: itemPci?.unidad
                            if (itemPci != null && itemPci.quantity != null) {
                                CampoFijo("Metrado ejecutado", "${metrado} ${unidad.orEmpty()}".trim())
                            } else {
                                OutlinedTextField(
                                    value = metrado,
                                    onValueChange = { metrado = it },
                                    label = { Text("Metrado ejecutado *") },
                                    suffix = unidad?.let { u -> { Text(u) } },
                                    placeholder = { Text("350") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        unfocusedBorderColor = Marca.VerdeBandera, focusedBorderColor = Marca.VerdeBandera,
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }

                            OutlinedTextField(
                                value = observacion,
                                onValueChange = { observacion = it },
                                label = { Text(if (origen is OrigenDelTrabajo.Emergencia) "Observación (obligatoria)" else "Observación") },
                                placeholder = { Text("Si hay alguna observación: condiciones, incidencias…") },
                                minLines = 2,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth(),
                            )

                            // Lo que pide el FOR:001 de cada actividad: opcional y plegado,
                            // para no retrasar el registro (boceto, nota 5)
                            if (itemPci == null) {
                                Row(
                                    Modifier.fillMaxWidth().clickable { verFor001 = !verFor001 }.padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        "Horario, personas y medidas para el reporte diario (opcional)",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    Icon(if (verFor001) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, contentDescription = null)
                                }
                                if (verFor001) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        CampoCorto(horaIni, { horaIni = it }, "Inicio", "07:30", KeyboardType.Number, Modifier.weight(1f))
                                        CampoCorto(horaFin, { horaFin = it }, "Fin", "12:00", KeyboardType.Number, Modifier.weight(1f))
                                        CampoCorto(personas, { personas = it }, "Personas", "6", KeyboardType.Number, Modifier.weight(1f))
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        CampoCorto(longitud, { longitud = it }, "Largo (m)", "100", KeyboardType.Decimal, Modifier.weight(1f))
                                        CampoCorto(ancho, { ancho = it }, "Ancho (m)", "1.5", KeyboardType.Decimal, Modifier.weight(1f))
                                        CampoCorto(espesor, { espesor = it }, "Espesor", "0.05", KeyboardType.Decimal, Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }
                }

                // El aviso y el error van fuera del scroll, pegados a los botones
                if (paso == 3 && manual) revisar(tramo, progIni)?.let { Aviso(it, Marca.Naranja, margen = 20.dp) }
                error?.let { Aviso(it, MaterialTheme.colorScheme.error, margen = 20.dp) }

                if (paso == 3) {
                    HorizontalDivider()
                    Row(
                        Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Button(
                            onClick = { if (inicial != null) alCerrar() else atras() },
                            colors = ButtonDefaults.buttonColors(containerColor = Marca.Azul),
                            modifier = Modifier.weight(1f).height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) { Text("Cancelar") }

                        Button(
                            onClick = {
                                error = validar(actividad, tramo, progIni, progFin, metrado, origen, observacion)
                                    ?: validarFor001(horaIni, horaFin, personas, longitud, ancho, espesor)
                                if (error == null) {
                                    alGuardar(
                                        actividad!!,
                                        tramo,
                                        Progresiva.aMetros(progIni),
                                        Progresiva.aMetros(progFin),
                                        lado,
                                        metrado.replace(",", ".").toDouble(),
                                        observacion.ifBlank { null },
                                        origen,
                                        DetalleFor001(
                                            horaInicio = DetalleFor001.hora(horaIni),
                                            horaFin = DetalleFor001.hora(horaFin),
                                            personas = personas.trim().toIntOrNull(),
                                            longitud = DetalleFor001.numero(longitud),
                                            ancho = DetalleFor001.numero(ancho),
                                            espesor = DetalleFor001.numero(espesor),
                                        ),
                                    )
                                }
                            },
                            enabled = !guardando,
                            colors = ButtonDefaults.buttonColors(containerColor = Marca.VerdeBandera),
                            modifier = Modifier.weight(1f).height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            if (guardando) {
                                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                            } else {
                                Text("Guardar avance", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }

    if (buscando) {
        BuscadorDeActividad(
            actividades = actividades,
            alElegir = { actividad = it; buscando = false },
            alCerrar = { buscando = false },
        )
    }
}

/** «1 Origen · 2 Actividad · 3 Avance», con lo ya hecho marcado. */
@Composable
private fun IndicadorDePasos(paso: Int, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        listOf("Origen", "Actividad", "Avance").forEachIndexed { i, nombre ->
            val n = i + 1
            val hecho = n < paso
            val actual = n == paso
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(if (hecho || actual) Marca.Azul else MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    if (hecho) Icon(Icons.Outlined.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    else Text("$n", color = if (actual) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                }
                Text(nombre, style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (actual) FontWeight.Bold else FontWeight.Normal,
                    color = if (actual) Marca.Azul else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (n < 3) {
                Box(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 6.dp)
                        .padding(bottom = 14.dp)
                        .height(2.dp)
                        .background(if (hecho) Marca.Azul else MaterialTheme.colorScheme.surfaceVariant),
                )
            }
        }
    }
}

@Composable
private fun TituloDePaso(titulo: String, subtitulo: String) {
    Column {
        Text(titulo, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(subtitulo, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Una de las cuatro tarjetas grandes del paso 1. */
@Composable
private fun TarjetaDeOrigen(
    titulo: String,
    detalle: String,
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    cuenta: Int? = null,
    habilitada: Boolean = true,
    destacada: Boolean = true,
    color: Color = Marca.Azul,
    alTocar: () -> Unit,
) {
    OutlinedCard(
        onClick = alTocar,
        enabled = habilitada,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.outlinedCardColors(
            containerColor = if (destacada) Marca.Azul.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (destacada) Marca.Azul.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.height(130.dp),
    ) {
        Column(Modifier.fillMaxSize().padding(14.dp)) {
            Icon(icono, contentDescription = null, tint = if (habilitada) color else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(32.dp))
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    titulo + (cuenta?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Icon(Icons.Outlined.ChevronRight, contentDescription = null)
            }
            Text(detalle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
    }
}

@Composable
private fun Pestana(texto: String, elegida: Boolean, modifier: Modifier, alTocar: () -> Unit) {
    Surface(
        onClick = alTocar,
        shape = RoundedCornerShape(10.dp),
        color = if (elegida) Marca.Azul else MaterialTheme.colorScheme.surfaceVariant,
        modifier = modifier.height(44.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(texto, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                color = if (elegida) Color.White else MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** Una partida programada para el día, con su botón «Seleccionar». */
@Composable
private fun TarjetaDePartida(p: ItemProgramado, registrada: Boolean, alSeleccionar: () -> Unit) {
    OutlinedCard(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.actividad ?: "Partida sin nombre", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text("Tramo: ${p.tramo ?: "—"}", style = MaterialTheme.typography.bodySmall)
            Text(
                "Progresivas: " + (Progresiva.rango(p.progresivaInicio, p.progresivaFin) ?: "—") +
                    " · " + (p.lado?.takeIf { it.isNotBlank() }?.let { "lado " + (pe.servicon.sigov.datos.Lados.codigo(it) ?: it) } ?: "lado sin indicar"),
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "Meta: ${p.meta?.let { cifra(it) } ?: "—"}${unidad(p.unidad)} | Unidad: ${p.unidad ?: "—"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (registrada) Etiqueta("Registrado", Marca.VerdeBandera)
                Spacer(Modifier.weight(1f))
                BotonSeleccionar(alSeleccionar)
            }
        }
    }
}

/** Los ítems PCI de la cuadrilla, con el filtro de plazo (Elvis: «solo los de un día»). */
@Composable
private fun ListaDeItemsPci(pcis: List<ItemPci>, registrados: Set<String>, alSeleccionar: (ItemPci) -> Unit) {
    var plazo by remember { mutableStateOf<Plazo?>(null) }
    Text("Ítems PCI disponibles", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(selected = plazo == null, onClick = { plazo = null }, label = { Text("Cualquier plazo") })
        Plazo.entries.forEach { p ->
            val n = pcis.count { cumple(it, p) }
            FilterChip(selected = plazo == p, onClick = { plazo = if (plazo == p) null else p }, label = { Text("${p.etiqueta} · $n") })
        }
    }
    val visibles = pcis.filter { cumple(it, plazo) }
        .sortedWith(compareBy<ItemPci> { it.vence ?: "9999-12-31" }.thenBy { it.numero ?: Int.MAX_VALUE })
    if (visibles.isEmpty()) {
        Text("Ningún ítem en ese plazo.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    visibles.forEach { item ->
        val fotos = item.fotosAntes + item.fotosDurante + item.fotosDespues
        OutlinedCard(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    listOfNotNull(item.pciCorto, item.numero?.let { "Ítem $it" }).joinToString(" · "),
                    style = MaterialTheme.typography.labelLarge,
                    color = Marca.Azul,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(item.tituloCorto, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text("Tramo: ${item.tramo ?: "—"}", style = MaterialTheme.typography.bodySmall)
                Text(
                    "Progresivas: " + (Progresiva.rango(item.progresiva, item.progresivaFin) ?: "—") + " · " +
                        (pe.servicon.sigov.datos.Lados.codigo(item.side)?.let { "lado $it" } ?: "lado sin indicar"),
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    when {
                        // Con sus tres fotos queda registrado solo en el reporte (Elvis)
                        item.fotosCompletas -> Etiqueta("Registrado", Marca.VerdeBandera)
                        fotos > 0 || item.id in registrados -> Etiqueta(
                            "Faltan fotos: " + listOfNotNull(
                                "antes".takeIf { item.fotosAntes == 0 },
                                "durante".takeIf { item.fotosDurante == 0 },
                                "después".takeIf { item.fotosDespues == 0 },
                            ).joinToString(", "),
                            Semaforo.Vencido,
                        )
                        item.estaObservado -> Etiqueta("Observado", Semaforo.Vencido)
                        else -> Etiqueta(if (item.estaEnAtencion) "En ejecución" else "Pendiente", Marca.Naranja)
                    }
                    Spacer(Modifier.weight(1f))
                    BotonSeleccionar { alSeleccionar(item) }
                }
            }
        }
    }
}

@Composable
private fun BotonSeleccionar(alTocar: () -> Unit) {
    Button(
        onClick = alTocar,
        colors = ButtonDefaults.buttonColors(containerColor = Marca.Azul),
        shape = RoundedCornerShape(10.dp),
        contentPadding = PaddingValues(horizontal = 18.dp),
        modifier = Modifier.height(40.dp),
    ) { Text("Seleccionar") }
}

@Composable
private fun Etiqueta(texto: String, color: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Lo que viene de la partida o del ítem: se muestra con candado, no se escribe. */
@Composable
private fun CampoFijo(etiqueta: String, valor: String, modifier: Modifier = Modifier.fillMaxWidth(), lineas: Int = 1) {
    OutlinedTextField(
        value = valor,
        onValueChange = {},
        readOnly = true,
        label = { Text(etiqueta) },
        trailingIcon = { Icon(Icons.Outlined.Lock, contentDescription = "Fijo", modifier = Modifier.size(18.dp)) },
        maxLines = lineas,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        modifier = modifier,
    )
}

/** El catálogo completo, buscable por nombre o código, sin tildes. */
@Composable
private fun BuscadorDeActividad(
    actividades: List<Actividad>,
    alElegir: (Actividad) -> Unit,
    alCerrar: () -> Unit,
) {
    var q by remember { mutableStateOf("") }
    val visibles = remember(q, actividades) {
        val t = sinTildes(q)
        actividades.filter { t.isBlank() || sinTildes(it.name).contains(t) || sinTildes(it.code).contains(t) }
    }
    Dialog(onDismissRequest = alCerrar, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.88f),
            shape = RoundedCornerShape(20.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                OutlinedTextField(
                    value = q,
                    onValueChange = { q = it },
                    label = { Text("Buscar actividad") },
                    placeholder = { Text("limpieza, señal, COV-SV…") },
                    leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${visibles.size} de ${actividades.size}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 6.dp),
                )
                LazyColumn(Modifier.weight(1f)) {
                    items(visibles, key = { it.id }) { a ->
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clickable { alElegir(a) }
                                .padding(vertical = 10.dp, horizontal = 4.dp),
                        ) {
                            Text(a.name, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                listOfNotNull(a.code, a.category).joinToString(" · "),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider()
                    }
                }
                TextButton(onClick = alCerrar, modifier = Modifier.align(Alignment.End)) { Text("Cerrar") }
            }
        }
    }
}

private fun sinTildes(t: String) =
    Normalizer.normalize(t, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Selector(
    etiqueta: String,
    valor: String,
    opciones: List<String>,
    alElegir: (Int) -> Unit,
) {
    var abierto by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = abierto,
        onExpandedChange = { abierto = !abierto },
    ) {
        OutlinedTextField(
            value = valor,
            onValueChange = {},
            readOnly = true,
            label = { Text(etiqueta) },
            placeholder = { Text("Selecciona…") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(abierto) },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            opciones.forEachIndexed { i, texto ->
                DropdownMenuItem(
                    text = { Text(texto) },
                    onClick = { alElegir(i); abierto = false },
                )
            }
        }
    }
}

/**
 * Lo que impide guardar: lo que haría del registro un dato inservible.
 */
private fun validar(
    actividad: Actividad?,
    tramo: Tramo?,
    progIni: String,
    progFin: String,
    metrado: String,
    origen: OrigenDelTrabajo,
    observacion: String,
): String? {
    if (actividad == null) return "Elige la actividad ejecutada."

    // El tramo y la progresiva de inicio los exige la nube: un registro sin
    // ellos se queda dando vueltas en la cola sin llegar nunca.
    if (tramo == null) return "Elige el tramo donde se ejecutó."
    if (progIni.isBlank()) return "Escribe la progresiva donde empezó el trabajo."

    // Una emergencia tiene que explicarse: en la valorización es lo primero
    // que el cliente pregunta.
    if (origen is OrigenDelTrabajo.Emergencia && observacion.isBlank()) {
        return "Es una emergencia: escribe en la observación qué pasó."
    }
    val cantidad = metrado.replace(",", ".").toDoubleOrNull()
    if (cantidad == null || cantidad <= 0) return "Escribe el metrado ejecutado."

    val ini = Progresiva.aMetros(progIni)
    if (ini == null) return "Progresiva no válida. Usa el formato 1334+600."
    val fin = Progresiva.aMetros(progFin)
    if (progFin.isNotBlank() && fin == null) return "Progresiva final no válida. Usa el formato 1334+600."
    if (fin != null && fin < ini) return "La progresiva final debe ser mayor que la inicial."
    return null
}

/**
 * Lo que da mala espina pero no impide guardar. Solo para lo escrito a
 * mano: se avisa, no se impide.
 */
/** Un campo angosto de una fila de tres. */
@Composable
private fun CampoCorto(
    valor: String,
    alCambiar: (String) -> Unit,
    etiqueta: String,
    ejemplo: String,
    teclado: KeyboardType,
    modifier: Modifier,
) {
    OutlinedTextField(
        value = valor,
        onValueChange = alCambiar,
        label = { Text(etiqueta, maxLines = 1) },
        placeholder = { Text(ejemplo) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier,
    )
}

/** Las horas y medidas del FOR:001 son opcionales, pero si se escriben deben leerse. */
internal fun validarFor001(
    horaIni: String,
    horaFin: String,
    personas: String,
    longitud: String,
    ancho: String,
    espesor: String,
): String? {
    val ini = DetalleFor001.hora(horaIni)
    val fin = DetalleFor001.hora(horaFin)
    return when {
        horaIni.isNotBlank() && ini == null -> "La hora de inicio no se entiende. Escríbela como 07:30."
        horaFin.isNotBlank() && fin == null -> "La hora de fin no se entiende. Escríbela como 12:00."
        ini != null && fin != null && !fin.isAfter(ini) -> "La hora de fin debe ser posterior a la de inicio."
        personas.isNotBlank() && personas.trim().toIntOrNull()?.takeIf { it in 1..99 } == null ->
            "La cantidad de personas debe ser un número entre 1 y 99."
        longitud.isNotBlank() && DetalleFor001.numero(longitud) == null -> "La longitud debe ser un número."
        ancho.isNotBlank() && DetalleFor001.numero(ancho) == null -> "El ancho debe ser un número."
        espesor.isNotBlank() && DetalleFor001.numero(espesor) == null -> "El espesor debe ser un número."
        else -> null
    }
}

private fun revisar(tramo: Tramo?, progIni: String): String? {
    val ini = Progresiva.aMetros(progIni) ?: return null
    if (tramo == null) return null
    val holgura = 50.0
    if (ini < tramo.progresivaInicio - holgura || ini > tramo.progresivaFin + holgura) {
        return "Esa progresiva queda fuera de ${tramo.name} (" +
            "${Progresiva.aTexto(tramo.progresivaInicio)} a " +
            "${Progresiva.aTexto(tramo.progresivaFin)}). Revísala; se puede guardar igual."
    }
    return null
}

@Composable
private fun Aviso(texto: String, color: Color, margen: Dp = 0.dp) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = margen)
            .background(color.copy(alpha = 0.10f), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(texto, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

private fun rotulo(item: ItemProgramado): String = listOfNotNull(
    item.actividad,
    item.progresivaInicio?.let { Progresiva.aTexto(it) },
    item.lado,
).joinToString(" · ").ifBlank { "Partida sin nombre" }

private fun rotulo(item: ItemPci): String = listOfNotNull(
    item.pciCorto?.let { codigo -> item.numero?.let { "$codigo · ítem $it" } ?: codigo },
    item.tituloCorto,
).joinToString(" · ").ifBlank { "Requerimiento" }

private fun cifra(valor: Double): String =
    if (valor % 1.0 == 0.0) valor.toInt().toString() else String.format("%.1f", valor)

private fun unidad(simbolo: String?): String = simbolo?.let { " $it" } ?: ""
