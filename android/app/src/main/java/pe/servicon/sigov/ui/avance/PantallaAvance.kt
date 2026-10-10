package pe.servicon.sigov.ui.avance

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.AvanceDia
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.datos.ResumenAvance
import pe.servicon.sigov.ui.caja.soles
import pe.servicon.sigov.ui.theme.Semaforo
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import java.util.Locale

/**
 * Mi Avance (apartado 4.11).
 *
 * Lo que la cuadrilla lleva hecho hoy, contra lo que se le pidió. No es un
 * informe para oficina: es la respuesta a «¿ya puedo cerrar el día?», que
 * hoy el capataz solo consigue llamando por radio al supervisor.
 *
 * Se mide por partidas cerradas y no por metrado sumado, porque una
 * cuadrilla ejecuta metros de cuneta, metros cuadrados de parchado y
 * unidades de señal el mismo día: sumarlos daría una cifra que no es nada.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaAvance(
    vm: AvanceViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alAbrirParte: () -> Unit = {},
    alAbrirEvidencias: () -> Unit = {},
    alAbrirPci: () -> Unit = {},
    alAbrirProgramacion: () -> Unit = {},
    alAbrirCaja: () -> Unit = {},
    alAbrirMateriales: () -> Unit = {},
    alAbrirSincronizacion: () -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()

    ArmazonDeApartado(
        titulo = "Mi Avance",
        seccion = "Apartado 4.11",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Tu día, tu semana, tus PCI, tus fotos y lo que tienes pendiente.",
        acciones = { TextButton(onClick = vm::refrescar) { Text("Actualizar") } },
    ) { relleno ->
        when {
            estado.cargando -> Box(
                Modifier.fillMaxSize().padding(relleno),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            estado.error != null -> Box(
                Modifier.fillMaxSize().padding(relleno).padding(32.dp),
                contentAlignment = Alignment.Center,
            ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

            else -> Column(
                Modifier
                    .fillMaxSize()
                    .padding(relleno)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Cumplimiento(estado)
                Contadores(estado, alAbrirParte, alAbrirEvidencias, alAbrirPci)

                // ─── OBS-49: el resumen de la semana ───────────────────
                SelectorDeSemana(estado, vm::moverSemana)
                when {
                    estado.cargandoSemana && estado.resumen == null -> Box(
                        Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) { CircularProgressIndicator() }
                    estado.resumen == null -> Aviso(estado.errorSemana ?: "No se pudo calcular el resumen.", Marca.Naranja)
                    else -> {
                        val r = estado.resumen!!
                        BloqueProgramacion(r, alAbrirProgramacion)
                        BloquePci(r, alAbrirPci)
                        BloqueEvidencias(r, alAbrirEvidencias)
                        BloqueOtros(r, estado.porSincronizar, estado.conError, alAbrirCaja, alAbrirMateriales, alAbrirSincronizacion)
                    }
                }

                if (estado.partidas.isNotEmpty()) {
                    Text(
                        "Partidas de hoy",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    estado.partidas.forEach { Partida(it) }
                }

                if (estado.sinFoto > 0) {
                    Aviso(
                        if (estado.sinFoto == 1) "1 registro tuyo todavía no tiene fotografía."
                        else "${estado.sinFoto} registros tuyos todavía no tienen fotografía.",
                        Marca.Naranja,
                    )
                }

                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun Cumplimiento(estado: EstadoAvance) {
    val pct = estado.cumplimiento
    val color = when {
        pct >= 100 -> Marca.VerdeBandera
        pct >= 60 -> Marca.Azul
        else -> Marca.Naranja
    }

    Surface(
        color = color.copy(alpha = 0.08f),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                Peru.fechaLarga(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "${pct.toInt()}",
                    style = MaterialTheme.typography.displayMedium,
                    fontWeight = FontWeight.Bold,
                    color = color,
                )
                Text(
                    "%",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = color,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            Text(
                when {
                    estado.programadas == 0 -> "Hoy no te programaron partidas."
                    estado.culminadas == estado.programadas ->
                        "Cerraste las ${estado.programadas} partidas del día."
                    else ->
                        "${estado.culminadas} de ${estado.programadas} partidas cerradas."
                },
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(14.dp))
            LinearProgressIndicator(
                progress = { (pct / 100.0).coerceIn(0.0, 1.0).toFloat() },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = color,
                trackColor = color.copy(alpha = 0.18f),
            )
        }
    }
}

@Composable
/**
 * Cada cifra lleva a su detalle (OBS-48): los registros al reporte del día,
 * las fotos a la galería y los ítems PCI a la lista de PCI. Y cada una dice
 * lo que cuenta: «Fotos» eran los registros con al menos una foto, y «PCI
 * abiertos» eran ítems, no documentos.
 */
private fun Contadores(
    estado: EstadoAvance,
    alAbrirParte: () -> Unit,
    alAbrirEvidencias: () -> Unit,
    alAbrirPci: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Contador("Registros", estado.registros.toString(), Marca.Azul, Modifier.weight(1f), alAbrirParte)
        Contador("Registros con foto", estado.fotos.toString(), Marca.VerdeBandera, Modifier.weight(1f), alAbrirEvidencias)
        Contador("Ítems PCI abiertos", estado.pciAbiertos.toString(), Marca.Naranja, Modifier.weight(1f), alAbrirPci)
    }
}

@Composable
private fun Contador(
    etiqueta: String,
    valor: String,
    color: Color,
    modifier: Modifier = Modifier,
    alTocar: () -> Unit = {},
) {
    Surface(
        onClick = alTocar,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = modifier,
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(valor, style = MaterialTheme.typography.headlineSmall, color = color)
            Text(
                etiqueta,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Partida(p: AvanceDePartida) {
    val fraccion = if (p.meta > 0) (p.ejecutado / p.meta).coerceIn(0.0, 1.0).toFloat() else 0f
    val cerrada = p.meta > 0 && p.ejecutado >= p.meta

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        p.actividad,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(p.tramo, Progresiva.rango(p.progresivaInicio, p.progresivaFin))
                            .joinToString(" · ")
                            .ifBlank { "Sin ubicación indicada" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    if (cerrada) "Cerrada" else "${(fraccion * 100).toInt()}%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (cerrada) Marca.VerdeBandera else Marca.Azul,
                )
            }

            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(
                progress = { fraccion },
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = if (cerrada) Marca.VerdeBandera else Marca.Verde,
                trackColor = Marca.Azul.copy(alpha = 0.10f),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "${cifra(p.ejecutado)} de ${cifra(p.meta)}${p.unidad?.let { " $it" } ?: ""}" +
                    if (!cerrada && p.meta > p.ejecutado) " · faltan ${cifra(p.meta - p.ejecutado)}" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Aviso(texto: String, color: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(texto, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

private fun cifra(valor: Double): String = String.format(Locale("es", "PE"), "%.1f", valor)

// ─── El resumen de la semana (OBS-49) ──────────────────────────────────

private val DIA_CORTO = DateTimeFormatter.ofPattern("dd/MM")

@Composable
private fun SelectorDeSemana(estado: EstadoAvance, alMover: (Int) -> Unit) {
    val r = estado.resumen
    val rango = r?.let {
        runCatching { "${LocalDate.parse(it.desde).format(DIA_CORTO)} – ${LocalDate.parse(it.hasta).format(DIA_CORTO)}" }.getOrNull()
    }
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { alMover(-1) }) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = "Semana anterior")
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    when (estado.semana) {
                        0 -> "ESTA SEMANA"
                        -1 -> "SEMANA PASADA"
                        else -> "HACE ${-estado.semana} SEMANAS"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                rango?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
            }
            IconButton(onClick = { alMover(1) }, enabled = estado.semana < 0) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = "Semana siguiente")
            }
        }
        estado.copiaDe?.let { cuando ->
            val hora = java.time.Instant.ofEpochMilli(cuando).atZone(Peru.zona)
                .format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
            Text(
                "Sin señal: resumen guardado el $hora",
                style = MaterialTheme.typography.labelSmall,
                color = Marca.Naranja,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

/** Un bloque del resumen: título, su cifra principal y el detalle; se toca para ir al módulo. */
@Composable
private fun Bloque(
    titulo: String,
    destacado: String? = null,
    colorDestacado: Color = Marca.Azul,
    alTocar: () -> Unit,
    contenido: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        onClick = alTocar,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    titulo,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                destacado?.let {
                    Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = colorDestacado)
                }
                Icon(
                    Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            contenido()
        }
    }
}

/** Una fila de cifras con su etiqueta debajo. */
@Composable
private fun Cifras(vararg cifras: Triple<String, Int, Color>) {
    Row(Modifier.fillMaxWidth()) {
        cifras.forEach { (etiqueta, valor, color) ->
            Column(Modifier.weight(1f)) {
                Text(valor.toString(), style = MaterialTheme.typography.headlineSmall, color = color)
                Text(
                    etiqueta,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Notas cortas en una sola línea: «2 por validar · 1 atrasada». */
@Composable
private fun Notas(vararg notas: Pair<String?, Color>) {
    val vigentes = notas.filter { it.first != null }
    if (vigentes.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        vigentes.forEach { (texto, tono) ->
            Text(
                texto!!,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = tono,
                modifier = Modifier
                    .background(tono.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

private fun plural(n: Int, uno: String, varios: String) = if (n == 1) "1 $uno" else "$n $varios"

@Composable
private fun BloqueProgramacion(r: ResumenAvance, alTocar: () -> Unit) {
    val s = r.semana
    val color = when {
        s.asignadas == 0 -> MaterialTheme.colorScheme.onSurfaceVariant
        s.porcentaje >= 100 -> Marca.VerdeBandera
        s.porcentaje >= 60 -> Marca.Azul
        else -> Marca.Naranja
    }
    Bloque(
        "Programación semanal",
        destacado = if (s.asignadas == 0) null else "${s.porcentaje.toInt()}%",
        colorDestacado = color,
        alTocar = alTocar,
    ) {
        if (s.asignadas == 0) {
            Text(
                "No tienes partidas programadas esta semana.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Bloque
        }
        LinearProgressIndicator(
            progress = { (s.porcentaje / 100.0).coerceIn(0.0, 1.0).toFloat() },
            modifier = Modifier.fillMaxWidth().height(8.dp),
            color = color,
            trackColor = color.copy(alpha = 0.18f),
        )
        Cifras(
            Triple("Asignadas", s.asignadas, Marca.Azul),
            Triple("Ejecutadas", s.ejecutadas, Marca.VerdeBandera),
            Triple("En ejecución", s.enEjecucion, Marca.Naranja),
            Triple("Pendientes", s.pendientes, MaterialTheme.colorScheme.onSurface),
        )
        Notas(
            s.porValidar.takeIf { it > 0 }?.let { "$it por validar" } to Marca.Azul,
            s.atrasadas.takeIf { it > 0 }?.let { plural(it, "atrasada", "atrasadas") } to Semaforo.Vencido,
            s.suspendidas.takeIf { it > 0 }?.let { plural(it, "suspendida", "suspendidas") } to Semaforo.PorVencer,
        )
        if (r.dias.isNotEmpty()) DiasDeLaSemana(r.dias)
    }
}

/** Siete columnas, una por día: cuántas partidas tenía y cuántas cerró. */
@Composable
private fun DiasDeLaSemana(dias: List<AvanceDia>) {
    val hoy = Peru.hoy()
    val tope = (dias.maxOfOrNull { it.asignadas } ?: 0).coerceAtLeast(1)
    val letras = listOf("L", "M", "M", "J", "V", "S", "D")
    Row(Modifier.fillMaxWidth().height(70.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        dias.forEachIndexed { i, d ->
            val fecha = runCatching { LocalDate.parse(d.fecha) }.getOrNull()
            val esHoy = fecha == hoy
            Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                    if (d.asignadas > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .fillMaxHeight(d.asignadas.toFloat() / tope)
                                .background(Marca.Azul.copy(alpha = 0.15f), RoundedCornerShape(4.dp)),
                        )
                        if (d.ejecutadas > 0) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .fillMaxHeight(d.ejecutadas.toFloat() / tope)
                                    .background(Marca.VerdeBandera, RoundedCornerShape(4.dp)),
                            )
                        }
                    }
                }
                Text(
                    letras.getOrElse(i) { "" },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (esHoy) FontWeight.Bold else FontWeight.Normal,
                    color = if (esHoy) Marca.Azul else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun BloquePci(r: ResumenAvance, alTocar: () -> Unit) {
    val p = r.pci
    Bloque(
        "PCI",
        destacado = if (p.vencidos > 0) "${p.vencidos} vencidos" else null,
        colorDestacado = Semaforo.Vencido,
        alTocar = alTocar,
    ) {
        if (p.items == 0) {
            Text(
                "No tienes ítems PCI asignados.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Bloque
        }
        Cifras(
            Triple("PCI asignados", p.documentos, Marca.Azul),
            Triple("Ítems pendientes", p.pendientes, Marca.Naranja),
            Triple("Ítems levantados", p.levantados, Marca.VerdeBandera),
        )
        Notas(
            p.venceHoy.takeIf { it > 0 }?.let { "$it vence hoy" } to Semaforo.Urgente,
            p.porVencer.takeIf { it > 0 }?.let { "$it por vencer" } to Semaforo.PorVencer,
        )
        val detalle = listOfNotNull(
            p.proximoVencimiento?.let { f ->
                runCatching { "Próximo vencimiento: ${LocalDate.parse(f).format(DIA_CORTO)}" }.getOrNull()
            },
            p.observados.takeIf { it > 0 }?.let { plural(it, "observado por COVINCA", "observados por COVINCA") },
            p.conformes.takeIf { it > 0 }?.let { "$it conformes" },
        )
        if (detalle.isNotEmpty()) {
            Text(
                detalle.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun BloqueEvidencias(r: ResumenAvance, alTocar: () -> Unit) {
    val e = r.evidencias
    Bloque(
        "Evidencias",
        destacado = if (e.registros == 0) null else "${e.completas * 100 / e.registros}%",
        colorDestacado = if (e.incompletas == 0) Marca.VerdeBandera else Marca.Naranja,
        alTocar = alTocar,
    ) {
        if (e.registros == 0) {
            Text(
                "Esta semana todavía no hay registros.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Bloque
        }
        Cifras(
            Triple("Completas", e.completas, Marca.VerdeBandera),
            Triple("Incompletas", e.incompletas, if (e.incompletas > 0) Semaforo.Urgente else Marca.Azul),
            Triple("Fotos", e.fotos, Marca.Azul),
        )
        Notas(
            e.sinFotos.takeIf { it > 0 }?.let { "$it sin fotos" } to Semaforo.Vencido,
            e.faltanFotos.takeIf { it > 0 }?.let { "$it con fotos de menos" } to Semaforo.PorVencer,
            e.sinDespues.takeIf { it > 0 }?.let { "$it sin «después»" } to Semaforo.PorVencer,
        )
    }
}

@Composable
private fun BloqueOtros(
    r: ResumenAvance,
    porSincronizar: Int,
    conError: Int,
    alAbrirCaja: () -> Unit,
    alAbrirMateriales: () -> Unit,
    alAbrirSincronizacion: () -> Unit,
) {
    val g = r.gastos
    val s = r.solicitudes
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Text(
                "Otros",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            FilaOtro(
                "Gastos de la semana",
                soles(g.total),
                listOfNotNull(
                    plural(g.cantidad, "gasto", "gastos"),
                    g.porRevisar.takeIf { it > 0 }?.let { "$it por revisar" },
                    g.observados.takeIf { it > 0 }?.let { plural(it, "observado", "observados") },
                    g.saldo?.let { "saldo ${soles(it)}" },
                ).joinToString(" · "),
                if (g.observados > 0) Semaforo.PorVencer else Marca.Azul,
                alAbrirCaja,
            )
            FilaOtro(
                "Solicitudes de depósito",
                (s.depositosAbiertas + s.depositosObservadas).toString(),
                listOfNotNull(
                    "${s.depositosAbiertas} en trámite",
                    s.depositosObservadas.takeIf { it > 0 }?.let { "$it observada por corregir" },
                    s.depositosAtendidas.takeIf { it > 0 }?.let { "$it atendida esta semana" },
                ).joinToString(" · "),
                if (s.depositosObservadas > 0) Semaforo.PorVencer else Marca.Azul,
                alAbrirCaja,
            )
            FilaOtro(
                "Pedidos de materiales",
                s.materialesAbiertos.toString(),
                listOfNotNull(
                    "${s.materialesAbiertos} en trámite",
                    s.materialesBorrador.takeIf { it > 0 }?.let { "$it en borrador" },
                ).joinToString(" · "),
                Marca.Azul,
                alAbrirMateriales,
            )
            FilaOtro(
                "Pendientes de sincronización",
                porSincronizar.toString(),
                when {
                    conError > 0 -> "$conError con error: revisa Sincronización"
                    porSincronizar == 0 -> "Todo está en la nube"
                    else -> "Se envían al haber señal"
                },
                when {
                    conError > 0 -> Semaforo.Vencido
                    porSincronizar > 0 -> Marca.Naranja
                    else -> Marca.VerdeBandera
                },
                alAbrirSincronizacion,
            )
        }
    }
}

@Composable
private fun FilaOtro(titulo: String, valor: String, detalle: String, color: Color, alTocar: () -> Unit) {
    Surface(onClick = alTocar, color = Color.Transparent, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(titulo, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(detalle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(valor, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = color)
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
