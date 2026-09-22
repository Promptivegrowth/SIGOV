package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pe.servicon.sigov.ui.theme.Borde
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

/**
 * Una ficha de dato: icono en azulejo de color, valor grande y etiqueta.
 *
 * Es la pieza con la que el documento arma la fila de contexto de cada
 * pantalla —fecha, cuadrilla, supervisor, saldo— y también los contadores.
 */
@Composable
fun FichaDato(
    icono: ImageVector,
    etiqueta: String,
    valor: String,
    color: Color = Marca.Azul,
    modifier: Modifier = Modifier,
    alTocar: (() -> Unit)? = null,
) {
    Card(
        onClick = { alTocar?.invoke() },
        enabled = alTocar != null,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, Borde),
        modifier = modifier,
    ) {
        Row(
            Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(color),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icono,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    etiqueta,
                    style = MaterialTheme.typography.labelSmall,
                    color = TintaSuave,
                    maxLines = 1,
                )
                Text(
                    valor,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Un azulejo del menú principal.
 *
 * Va en cuadrícula de dos columnas, con el icono sobre un cuadro de color
 * que alterna entre el azul y el verde de la marca: así el menú se recorre
 * de un vistazo en vez de leerse línea por línea.
 */
@Composable
fun AzulejoDeMenu(
    icono: ImageVector,
    titulo: String,
    detalle: String,
    color: Color,
    modifier: Modifier = Modifier,
    insignia: Int = 0,
    alTocar: () -> Unit,
) {
    Card(
        onClick = alTocar,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, Borde),
        // Sin altura fija: se mide por su contenido. Una altura en dp se
        // rompe en cuanto el capataz sube el tamaño de letra del celular, y
        // el subtítulo desaparece sin que nadie se entere.
        modifier = modifier,
    ) {
        // En columna, no en fila: a dos por pantalla el ancho no alcanza para
        // icono, texto y galón sin partir las palabras.
        Column(
            Modifier.fillMaxWidth().padding(11.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Box {
                Box(
                    Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(color),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        icono,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(19.dp),
                    )
                }
                if (insignia > 0) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 6.dp, y = (-5).dp)
                            .background(Marca.Naranja, RoundedCornerShape(9.dp))
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    ) {
                        Text(
                            if (insignia > 99) "99+" else "$insignia",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Text(
                titulo,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                detalle,
                style = MaterialTheme.typography.labelSmall,
                color = TintaSuave,
                // Una línea: dos no caben sin recortarse por abajo, y un
                // subtítulo cortado se lee peor que uno breve.
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 12.sp,
            )
        }
    }
}

/** El borde fino de las tarjetas, igual en toda la aplicación. */
private fun BorderStroke(ancho: androidx.compose.ui.unit.Dp, color: Color) =
    androidx.compose.foundation.BorderStroke(ancho, color)
