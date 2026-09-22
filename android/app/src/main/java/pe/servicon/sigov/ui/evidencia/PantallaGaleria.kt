package pe.servicon.sigov.ui.evidencia

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import pe.servicon.sigov.datos.EvidenciaEnGaleria
import pe.servicon.sigov.datos.Fase
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.Progresiva
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import java.io.File
import java.time.LocalDate

/**
 * Las fotos de la cuadrilla.
 *
 * Agrupadas por día, con fichas de periodo y de fase, y buscador por
 * actividad, tramo o código de PCI: las tres cosas por las que alguien
 * recuerda una foto cuando el cliente la reclama meses después.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaGaleria(
    vm: GaleriaViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    var abierta by remember { mutableStateOf<EvidenciaEnGaleria?>(null) }

    ArmazonDeApartado(
        titulo = "Evidencias",
        seccion = "Apartado 4.13",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Las fotos selladas de tu cuadrilla, por día y por fase.",
    ) { relleno ->
        Column(Modifier.fillMaxSize().padding(relleno)) {

            OutlinedTextField(
                value = estado.busqueda,
                onValueChange = vm::buscar,
                placeholder = { Text("Buscar por actividad, tramo o PCI") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                trailingIcon = {
                    if (estado.busqueda.isNotEmpty()) {
                        IconButton(onClick = { vm.buscar("") }) {
                            Icon(Icons.Outlined.Close, contentDescription = "Limpiar")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )

            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Periodo.entries.forEach { periodo ->
                    FilterChip(
                        selected = estado.periodo == periodo,
                        onClick = { vm.cambiarPeriodo(periodo) },
                        label = { Text(periodo.etiqueta) },
                    )
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = estado.fase == null,
                    onClick = { vm.cambiarFase(null) },
                    label = { Text("Todas las fases") },
                )
                Fase.entries.forEach { fase ->
                    FilterChip(
                        selected = estado.fase == fase,
                        onClick = { vm.cambiarFase(if (estado.fase == fase) null else fase) },
                        label = { Text(fase.etiqueta) },
                    )
                }
            }

            when {
                estado.cargando -> Box(
                    Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                estado.error != null -> Box(
                    Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(estado.error!!, style = MaterialTheme.typography.bodyLarge) }

                estado.visibles.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(32.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.PhotoLibrary,
                        contentDescription = null,
                        modifier = Modifier.size(44.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Sin fotos en ese rango", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Prueba ampliando el periodo o quitando el filtro.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    estado.porDia.forEach { (dia, fotos) ->
                        item(span = { GridItemSpan(maxLineSpan) }, key = "dia-$dia") {
                            Text(
                                encabezadoDeDia(dia, fotos.size),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
                            )
                        }
                        items(fotos, key = { it.id }) { foto ->
                            Miniatura(foto, alTocar = { abierta = foto })
                        }
                    }
                }
            }
        }
    }

    abierta?.let { foto ->
        VisorDeFoto(foto = foto, alCerrar = { abierta = null })
    }
}

@Composable
private fun Miniatura(foto: EvidenciaEnGaleria, alTocar: () -> Unit) {
    Box(
        Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        AsyncImage(
            model = foto.rutaLocal?.let { File(it) } ?: foto.url,
            contentDescription = foto.actividad,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().clickable(onClick = alTocar),
        )

        // La fase, que es lo que se busca al armar el panel fotográfico
        Text(
            Fase.entries.firstOrNull { it.valor == foto.phase }?.etiqueta ?: foto.phase,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .background(Marca.Azul.copy(alpha = 0.85f))
                .padding(horizontal = 5.dp, vertical = 1.dp),
        )

        // Una foto que todavía no subió no sustenta nada todavía
        if (foto.rutaLocal != null && foto.url == null && foto.sha256 == null) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp)
                    .size(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Marca.Naranja),
            )
        }
    }
}

/** «Lunes 21 de setiembre · 4 fotos», que es como se revisa el día. */
private fun encabezadoDeDia(dia: String, cuantas: Int): String {
    val fecha = runCatching { LocalDate.parse(dia) }.getOrNull()
    val nombre = fecha?.let { Peru.fechaLarga(it) } ?: dia
    return "$nombre · $cuantas foto" + if (cuantas == 1) "" else "s"
}

/** Lo que ubica la foto: dónde, cuándo y de qué trabajo es. */
internal fun detalleDe(foto: EvidenciaEnGaleria): String =
    listOfNotNull(
        foto.actividad,
        foto.tramo,
        foto.progresiva?.let { Progresiva.aTexto(it) },
        foto.pciCodigo,
    ).joinToString(" · ")
