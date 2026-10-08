package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
private val LADOS = listOf(
    "derecho" to "LD · derecho",
    "izquierdo" to "LI · izquierdo",
    "ambos" to "LD/LI · ambos lados",
    "eje" to "EJE · eje",
)

/** El lado escrito por el supervisor (LI, LD, LD/LI, LD/EJE/LI…), en el valor de la base. */
internal fun ladoDesdeProgramacion(texto: String?): String? {
    val t = texto?.uppercase()?.replace(" ", "") ?: return null
    val d = "LD" in t || "CD" in t
    val i = "LI" in t || "CI" in t
    return when {
        d && i -> "ambos"
        d -> "derecho"
        i -> "izquierdo"
        "EJE" in t -> "eje"
        else -> null
    }
}

/**
 * El formulario de una actividad ejecutada.
 *
 * Primero se dice de dónde sale el trabajo, y eso decide lo demás:
 *
 * · Programado hoy: solo las partidas que el supervisor programó para esta
 *   cuadrilla en la fecha del reporte, no el catálogo entero. La actividad,
 *   el tramo y las progresivas vienen de la programación y no se vuelven a
 *   escribir (OBS-02); solo el metrado, la observación y, si cambió en
 *   campo, dónde se ejecutó de verdad.
 * · PCI: el ítem que se atiende.
 * · Otros: lo que la cuadrilla hizo además de lo programado porque le
 *   alcanzó el tiempo; aquí sí se elige del catálogo completo, con buscador.
 * · Emergencia: igual que «Otros», con la justificación obligatoria.
 *
 * El tramo de la cuadrilla viene puesto (Elvis: «si es Santos, del tramo 1,
 * ya le debe aparecer Dv. Quilca – Arequipa»). Y la progresiva solo se
 * revisa contra el tramo cuando la escribe el capataz: la que viene de la
 * programación o del PCI es la oficial y no se discute (OBS-03).
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
    ) -> Unit,
) {
    // Lo ya culminado no se ofrece: volver a registrar contra una partida
    // cerrada infla el avance por encima de la meta.
    val pendientes = remember(programadas) {
        programadas.filter { it.status !in setOf("ejecutado", "por_validar", "validado") }
    }

    var origen by remember {
        mutableStateOf(
            inicial ?: pendientes.firstOrNull()?.let { OrigenDelTrabajo.Programado(it) }
            ?: OrigenDelTrabajo.NoProgramado
        )
    }
    var actividad by remember { mutableStateOf<Actividad?>(null) }
    var tramo by remember { mutableStateOf(tramoPorDefecto) }
    var progIni by remember { mutableStateOf("") }
    var progFin by remember { mutableStateOf("") }
    var lado by remember { mutableStateOf("derecho") }
    var metrado by remember { mutableStateOf("") }
    var observacion by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var buscando by remember { mutableStateOf(false) }

    // Al señalar de dónde sale el trabajo, el formulario se rellena solo
    fun adoptar(nuevo: OrigenDelTrabajo) {
        origen = nuevo
        error = null
        when (nuevo) {
            is OrigenDelTrabajo.Programado -> {
                actividad = actividades.firstOrNull { it.id == nuevo.item.actividadId }
                    ?: nuevo.item.actividadId?.let { id ->
                        Actividad(id = id, code = nuevo.item.actividadCodigo ?: "", name = nuevo.item.actividad ?: "")
                    }
                tramo = tramos.firstOrNull { it.id == nuevo.item.tramoId } ?: tramo
                progIni = nuevo.item.progresivaInicio?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
                ladoDesdeProgramacion(nuevo.item.lado)?.let { lado = it }
            }
            is OrigenDelTrabajo.Pci -> {
                actividad = actividades.firstOrNull { it.id == nuevo.item.actividadId }
                tramo = tramos.firstOrNull { it.name == nuevo.item.tramo } ?: tramo
                progIni = nuevo.item.progresiva?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
                nuevo.item.side?.let { lado = it }
            }
            OrigenDelTrabajo.NoProgramado, OrigenDelTrabajo.Emergencia -> {
                // Se elige del catálogo; el tramo vuelve al de la cuadrilla
                actividad = null
                tramo = tramoPorDefecto ?: tramo
                progIni = ""
                progFin = ""
            }
        }
    }

    // La primera vez, rellenar con lo que trae el origen inicial
    LaunchedEffect(Unit) { adoptar(origen) }

    val manual = origen is OrigenDelTrabajo.NoProgramado || origen is OrigenDelTrabajo.Emergencia

    Dialog(
        onDismissRequest = alCerrar,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.92f),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.fillMaxSize()) {
                Text(
                    "Registrar avance",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(20.dp, 20.dp, 20.dp, 4.dp),
                )
                Text(
                    "Lo que hizo la cuadrilla, dónde y cuánto",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )

                Column(
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    SelectorDeOrigen(
                        origen = origen,
                        pendientes = pendientes,
                        pcis = pcis,
                        alElegir = { adoptar(it) },
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
                        Selector(
                            etiqueta = "Tramo",
                            valor = tramo?.let { "${it.code} · ${it.name}" } ?: "",
                            opciones = tramos.map { "${it.code} · ${it.name}" },
                            alElegir = { i -> tramo = tramos[i] },
                        )
                    } else {
                        FichaDelOrigen(origen, actividad, tramo)
                    }

                    Text(
                        if (manual) "Dónde se ejecutó" else "Dónde se ejecutó (cámbialo solo si fue en otro punto)",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = progIni,
                            onValueChange = { progIni = it },
                            label = { Text("Progresiva inicio") },
                            placeholder = { Text("1334+600") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = progFin,
                            onValueChange = { progFin = it },
                            label = { Text("Fin") },
                            placeholder = { Text("1335+000") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Selector(
                        etiqueta = "Lado de la vía",
                        valor = LADOS.firstOrNull { it.first == lado }?.second ?: lado,
                        opciones = LADOS.map { it.second },
                        alElegir = { i -> lado = LADOS[i].first },
                    )

                    OutlinedTextField(
                        value = metrado,
                        onValueChange = { metrado = it },
                        label = { Text("Metrado ejecutado") },
                        suffix = (origen as? OrigenDelTrabajo.Programado)?.item?.unidad?.let { u -> { Text(u) } },
                        placeholder = { Text("400") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = observacion,
                        onValueChange = { observacion = it },
                        label = { Text(if (origen is OrigenDelTrabajo.Emergencia) "Observación (obligatoria)" else "Observación") },
                        placeholder = { Text("Condiciones encontradas, incidencias…") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                // El aviso y el error van fuera del scroll, pegados a los botones
                if (manual) revisar(tramo, progIni)?.let { Aviso(it, Marca.Naranja, margen = 20.dp) }
                error?.let { Aviso(it, MaterialTheme.colorScheme.error, margen = 20.dp) }

                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = alCerrar,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text("Cancelar") }

                    Button(
                        onClick = {
                            error = validar(actividad, tramo, progIni, progFin, metrado, origen, observacion)
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
                                )
                            }
                        },
                        enabled = !guardando,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (guardando) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text("Guardar", fontWeight = FontWeight.SemiBold)
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

/** Lo que trae la partida o el ítem: se muestra, no se vuelve a escribir. */
@Composable
private fun FichaDelOrigen(origen: OrigenDelTrabajo, actividad: Actividad?, tramo: Tramo?) {
    val item = (origen as? OrigenDelTrabajo.Programado)?.item
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Marca.Azul.copy(alpha = 0.06f),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                actividad?.name ?: item?.actividad ?: (origen as? OrigenDelTrabajo.Pci)?.item?.description ?: "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            // El código va, pero en segundo plano: el capataz trabaja por el nombre (regla 1.3)
            (item?.actividadCodigo ?: actividad?.code)?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                listOfNotNull(
                    tramo?.name,
                    item?.sector?.let { "sector $it" },
                    item?.lado,
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
            )
            item?.let { p ->
                val meta = p.meta ?: 0.0
                val hecho = p.ejecutado ?: 0.0
                if (meta > 0) {
                    Text(
                        if (hecho >= meta) "Ya cubrió su meta de ${cifra(meta)}${unidad(p.unidad)}."
                        else "Meta ${cifra(meta)}${unidad(p.unidad)} · faltan ${cifra(meta - hecho)}${unidad(p.unidad)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (hecho >= meta) Marca.VerdeBandera else Marca.Azul,
                    )
                }
                p.notes?.takeIf { it.isNotBlank() }?.let {
                    Text("Indicación: $it", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            (origen as? OrigenDelTrabajo.Pci)?.item?.let { pci ->
                Text(
                    when (val dias = pci.diasRestantes) {
                        null -> "Sin plazo indicado."
                        0 -> "Vence hoy."
                        in Int.MIN_VALUE..-1 -> "Venció hace ${-dias} días."
                        else -> "Faltan $dias días para que venza."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if ((pci.diasRestantes ?: 99) <= 1) Marca.Naranja else Marca.Azul,
                )
            }
        }
    }
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

/**
 * De dónde sale el trabajo. Va primero: decide si el metrado avanza una
 * partida de la semana, sustenta un PCI, o es trabajo no programado.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SelectorDeOrigen(
    origen: OrigenDelTrabajo,
    pendientes: List<ItemProgramado>,
    pcis: List<ItemPci>,
    alElegir: (OrigenDelTrabajo) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            "¿De dónde sale este trabajo?",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )

        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = origen is OrigenDelTrabajo.Programado,
                onClick = { pendientes.firstOrNull()?.let { alElegir(OrigenDelTrabajo.Programado(it)) } },
                enabled = pendientes.isNotEmpty(),
                label = { Text("Programado · ${pendientes.size}") },
            )
            FilterChip(
                selected = origen is OrigenDelTrabajo.Pci,
                onClick = { pcis.firstOrNull()?.let { alElegir(OrigenDelTrabajo.Pci(it)) } },
                enabled = pcis.isNotEmpty(),
                label = { Text("PCI · ${pcis.size}") },
            )
            FilterChip(
                selected = origen is OrigenDelTrabajo.NoProgramado,
                onClick = { alElegir(OrigenDelTrabajo.NoProgramado) },
                label = { Text("Otros") },
            )
            FilterChip(
                selected = origen is OrigenDelTrabajo.Emergencia,
                onClick = { alElegir(OrigenDelTrabajo.Emergencia) },
                label = { Text("Emergencia") },
            )
        }

        when (origen) {
            is OrigenDelTrabajo.Programado -> Selector(
                etiqueta = "Partida programada",
                valor = rotulo(origen.item),
                opciones = pendientes.map { rotulo(it) },
                alElegir = { i -> alElegir(OrigenDelTrabajo.Programado(pendientes[i])) },
            )

            is OrigenDelTrabajo.Pci -> Selector(
                etiqueta = "Ítem de PCI",
                valor = rotulo(origen.item),
                opciones = pcis.map { rotulo(it) },
                alElegir = { i -> alElegir(OrigenDelTrabajo.Pci(pcis[i])) },
            )

            OrigenDelTrabajo.NoProgramado -> Aviso(
                "Trabajo hecho además de lo programado. Elige la actividad del catálogo.",
                Marca.Azul,
            )

            OrigenDelTrabajo.Emergencia -> Aviso(
                "No descuenta de la programación. Explica en la observación qué pasó.",
                Marca.Naranja,
            )
        }
    }
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
    item.pciCodigo?.let { codigo -> item.numero?.let { "$codigo · ítem $it" } ?: codigo },
    item.description?.take(40),
).joinToString(" · ").ifBlank { "Requerimiento" }

private fun cifra(valor: Double): String =
    if (valor % 1.0 == 0.0) valor.toInt().toString() else String.format("%.1f", valor)

private fun unidad(simbolo: String?): String = simbolo?.let { " $it" } ?: ""
