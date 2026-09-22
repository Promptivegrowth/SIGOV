package pe.servicon.sigov.ui.avance

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
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
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
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
) {
    val estado by vm.estado.collectAsStateWithLifecycle()

    ArmazonDeApartado(
        titulo = "Mi Avance",
        seccion = "Apartado 4.11",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Lo que llevas hecho hoy contra lo que te tocaba.",
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
                Contadores(estado)

                if (estado.partidas.isNotEmpty()) {
                    Text(
                        "Partida por partida",
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
private fun Contadores(estado: EstadoAvance) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Contador("Registros", estado.registros.toString(), Marca.Azul, Modifier.weight(1f))
        Contador("Fotos", estado.fotos.toString(), Marca.VerdeBandera, Modifier.weight(1f))
        Contador("PCI abiertos", estado.pciAbiertos.toString(), Marca.Naranja, Modifier.weight(1f))
    }
}

@Composable
private fun Contador(etiqueta: String, valor: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
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
