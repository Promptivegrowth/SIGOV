package pe.servicon.sigov.ui.parte

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.background
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import pe.servicon.sigov.datos.Actividad
import pe.servicon.sigov.datos.ItemPci
import pe.servicon.sigov.datos.ItemProgramado
import pe.servicon.sigov.datos.OrigenDelTrabajo
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.Tramo
import pe.servicon.sigov.ui.theme.Marca

/** Los lados de la vía, tal como se anotan en el reporte oficial. */
private val LADOS = listOf("derecho", "izquierdo", "ambos", "eje")

/**
 * El formulario de una actividad ejecutada.
 *
 * La progresiva se escribe como se habla en obra —`18+400`— y se valida
 * contra el tramo elegido: anotar un trabajo fuera de su tramo ensucia la
 * valorización y después cuesta encontrarlo.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormularioActividad(
    actividades: List<Actividad>,
    tramos: List<Tramo>,
    programadas: List<ItemProgramado>,
    pcis: List<ItemPci>,
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
    var actividad by remember { mutableStateOf<Actividad?>(null) }
    var tramo by remember { mutableStateOf<Tramo?>(null) }
    var progIni by remember { mutableStateOf("") }
    var progFin by remember { mutableStateOf("") }
    var lado by remember { mutableStateOf("derecho") }
    var metrado by remember { mutableStateOf("") }
    var observacion by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var origen by remember { mutableStateOf<OrigenDelTrabajo>(OrigenDelTrabajo.Emergencia) }

    // Al señalar de dónde sale el trabajo, el formulario se rellena solo: la
    // partida ya dice qué actividad es, en qué tramo y entre qué progresivas.
    // Volver a teclearlo solo abre la puerta a que no coincida.
    fun adoptar(nuevo: OrigenDelTrabajo) {
        origen = nuevo
        when (nuevo) {
            is OrigenDelTrabajo.Programado -> {
                actividades.firstOrNull { it.id == nuevo.item.actividadId }?.let { actividad = it }
                tramos.firstOrNull { it.id == nuevo.item.tramoId }?.let { tramo = it }
                progIni = nuevo.item.progresivaInicio?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
            }
            is OrigenDelTrabajo.Pci -> {
                actividades.firstOrNull { it.id == nuevo.item.actividadId }?.let { actividad = it }
                tramos.firstOrNull { it.name == nuevo.item.tramo }?.let { tramo = it }
                progIni = nuevo.item.progresiva?.let { Progresiva.aTexto(it) } ?: ""
                progFin = nuevo.item.progresivaFin?.let { Progresiva.aTexto(it) } ?: ""
                nuevo.item.side?.let { lado = it }
            }
            is OrigenDelTrabajo.Emergencia -> Unit  // se llena a mano
        }
    }

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
                    "Actividad ejecutada",
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
                        programadas = programadas,
                        pcis = pcis,
                        alElegir = { adoptar(it) },
                    )

                    Selector(
                        etiqueta = "Actividad",
                        valor = actividad?.name ?: "",
                        opciones = actividades.map { it.name },
                        alElegir = { i -> actividad = actividades[i] },
                    )

                    Selector(
                        etiqueta = "Tramo",
                        valor = tramo?.name ?: "",
                        opciones = tramos.map { "${it.code} · ${it.name}" },
                        alElegir = { i -> tramo = tramos[i] },
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = progIni,
                            onValueChange = { progIni = it },
                            label = { Text("Progresiva inicio") },
                            placeholder = { Text("18+000") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = progFin,
                            onValueChange = { progFin = it },
                            label = { Text("Fin") },
                            placeholder = { Text("18+400") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Selector(
                        etiqueta = "Lado de la vía",
                        valor = lado,
                        opciones = LADOS,
                        alElegir = { i -> lado = LADOS[i] },
                    )

                    OutlinedTextField(
                        value = metrado,
                        onValueChange = { metrado = it },
                        label = { Text("Metrado ejecutado") },
                        placeholder = { Text("400") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = observacion,
                        onValueChange = { observacion = it },
                        label = { Text("Observación") },
                        placeholder = { Text("Condiciones encontradas, incidencias…") },
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )

                }

                // El aviso y el error van fuera del scroll, pegados a los
                // botones: al final de un formulario largo el capataz pulsa
                // Guardar, no pasa nada, y no tiene forma de saber por qué.
                revisar(tramo, progIni)?.let { Aviso(it, Marca.Naranja, margen = 20.dp) }
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
}

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
 * Lo que impide guardar.
 *
 * Solo entra aquí lo que haría del registro un dato inservible: sin
 * actividad no se sabe qué se hizo, sin metrado no se puede valorizar, y
 * una progresiva mal escrita no se puede ubicar en la vía.
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

    // El tramo y la progresiva de inicio no son opcionales: la nube los
    // exige, y un registro sin ellos se queda dando vueltas en la cola sin
    // llegar nunca. Mejor pedirlos aquí, donde el capataz todavía sabe
    // dónde estaba parado, que perderlos después.
    if (tramo == null) return "Elige el tramo donde se ejecutó."
    if (progIni.isBlank()) return "Escribe la progresiva donde empezó el trabajo."

    // Un trabajo que no sale de la programación ni de un PCI tiene que
    // explicarse: en la valorización es lo primero que el cliente pregunta.
    if (origen is OrigenDelTrabajo.Emergencia && observacion.isBlank()) {
        return "Es un trabajo no programado: escribe en la observación por qué se hizo."
    }
    val cantidad = metrado.replace(",", ".").toDoubleOrNull()
    if (cantidad == null || cantidad <= 0) return "Escribe el metrado ejecutado."

    val ini = Progresiva.aMetros(progIni)
    if (progIni.isNotBlank() && ini == null) return "Progresiva no válida. Usa el formato 18+400."
    val fin = Progresiva.aMetros(progFin)
    if (progFin.isNotBlank() && fin == null) return "Progresiva final no válida. Usa el formato 18+400."
    if (ini != null && fin != null && fin < ini) return "La progresiva final debe ser mayor que la inicial."
    return null
}

/**
 * Lo que da mala espina pero no impide guardar.
 *
 * Que la progresiva caiga fuera del tramo casi siempre es un dedazo, pero a
 * veces es el contrato el que está mal cargado. Bloquear por eso deja al
 * capataz sin poder anotar un trabajo que sí se hizo, y un registro perdido
 * no se recupera: el supervisor todavía tiene que validar el parte, y ahí
 * se corrige. Se avisa, no se impide.
 */
private fun revisar(tramo: Tramo?, progIni: String): String? {
    val ini = Progresiva.aMetros(progIni) ?: return null
    if (tramo == null) return null
    val holgura = 50.0
    if (ini < tramo.progresivaInicio - holgura || ini > tramo.progresivaFin + holgura) {
        return "Esa progresiva queda fuera de ${tramo.name}, que va de " +
            "${Progresiva.aTexto(tramo.progresivaInicio)} a " +
            "${Progresiva.aTexto(tramo.progresivaFin)}. Revísala antes de guardar."
    }
    return null
}

/**
 * De dónde sale el trabajo.
 *
 * Va primero en el formulario y no por capricho: es lo que decide si el
 * metrado avanza una partida de la semana, sustenta el levantamiento de un
 * PCI, o queda como trabajo no programado que habrá que justificar.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SelectorDeOrigen(
    origen: OrigenDelTrabajo,
    programadas: List<ItemProgramado>,
    pcis: List<ItemPci>,
    alElegir: (OrigenDelTrabajo) -> Unit,
) {
    // Lo ya culminado no se ofrece: volver a registrar contra una partida
    // cerrada infla el avance por encima de la meta.
    val pendientes = remember(programadas) { programadas.filter { it.status != "ejecutado" } }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            "¿De dónde sale este trabajo?",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )

        // Los tres chips no caben en una línea de teléfono y el último
        // quedaba cortado por el borde. Que salten de línea.
        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = origen is OrigenDelTrabajo.Programado,
                onClick = {
                    pendientes.firstOrNull()?.let { alElegir(OrigenDelTrabajo.Programado(it)) }
                },
                enabled = pendientes.isNotEmpty(),
                label = { Text("Programación · ${pendientes.size}") },
            )
            FilterChip(
                selected = origen is OrigenDelTrabajo.Pci,
                onClick = { pcis.firstOrNull()?.let { alElegir(OrigenDelTrabajo.Pci(it)) } },
                enabled = pcis.isNotEmpty(),
                label = { Text("PCI · ${pcis.size}") },
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

            is OrigenDelTrabajo.Emergencia -> Aviso(
                "No descuenta de la programación. Explica en la observación por qué se hizo.",
                Marca.Naranja,
            )
        }

        // Lo que falta de la partida, para que no se pase de la meta sin darse cuenta
        (origen as? OrigenDelTrabajo.Programado)?.item?.let { item ->
            val meta = item.meta ?: 0.0
            val hecho = item.ejecutado ?: 0.0
            if (meta > 0) {
                Aviso(
                    if (hecho >= meta) {
                        "Esta partida ya cubrió su meta de ${cifra(meta)}${unidad(item.unidad)}."
                    } else {
                        "Faltan ${cifra(meta - hecho)}${unidad(item.unidad)} para cerrar la partida."
                    },
                    if (hecho >= meta) Marca.VerdeBandera else Marca.Azul,
                )
            }
        }

        (origen as? OrigenDelTrabajo.Pci)?.item?.let { item ->
            Aviso(
                when (val dias = item.diasRestantes) {
                    null -> "Sin plazo indicado."
                    0 -> "Vence hoy."
                    in Int.MIN_VALUE..-1 -> "Venció hace ${-dias} días."
                    else -> "Faltan $dias días para que venza."
                } + if (item.exigeEvidencia) " Exige fotografía." else "",
                if ((item.diasRestantes ?: 99) <= 0) Marca.Naranja else Marca.Azul,
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
).joinToString(" · ").ifBlank { "Partida sin nombre" }

private fun rotulo(item: ItemPci): String = listOfNotNull(
    item.pciCodigo?.let { código -> item.numero?.let { "$código · ítem $it" } ?: código },
    item.description?.take(40),
).joinToString(" · ").ifBlank { "Requerimiento" }

private fun cifra(valor: Double): String =
    if (valor % 1.0 == 0.0) valor.toInt().toString() else String.format("%.1f", valor)

private fun unidad(simbolo: String?): String = simbolo?.let { " $it" } ?: ""
