package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pe.servicon.sigov.R
import pe.servicon.sigov.ui.theme.AzulSuave
import pe.servicon.sigov.ui.theme.Borde
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

/**
 * La cabecera de marca, tal como la dibujó Elvis.
 *
 * Tres bloques en una sola franja: el logotipo de Servicon, el nombre del
 * producto con la V en verde, y la consigna de campaña. Va en todas las
 * pantallas porque es lo que el capataz enseña cuando alguien le pregunta
 * desde qué sistema está registrando.
 */
@Composable
fun CabeceraDeMarca(modifier: Modifier = Modifier) {
    Surface(color = Color.White, modifier = modifier.fillMaxWidth()) {
        Row(
            // Sin reservar la barra de estado: de eso ya se encarga el
            // armazón de la aplicación, y hacerlo dos veces deja una franja
            // blanca vacía encima del logotipo.
            Modifier
                .fillMaxWidth()
                .height(66.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_servicon),
                contentDescription = "Grupo Servicon V&D EIRL",
                modifier = Modifier
                    .padding(start = 12.dp)
                    .height(30.dp),
            )

            // La cuña verde que separa la empresa del producto
            Box(
                Modifier
                    .padding(horizontal = 10.dp)
                    .width(3.dp)
                    .height(34.dp)
                    .background(Marca.Verde, RoundedCornerShape(2.dp)),
            )

            Column(Modifier.weight(1f)) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = Marca.Azul)) { append("SIGO") }
                        withStyle(SpanStyle(color = Marca.Verde)) { append("V") }
                    },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "Sistema de Gestión de Operaciones Viales",
                    style = MaterialTheme.typography.labelSmall,
                    color = TintaSuave,
                    fontSize = 8.5.sp,
                    lineHeight = 10.sp,
                )
            }

            // La consigna, sobre el degradado de la marca
            Box(
                Modifier
                    .fillMaxHeight()
                    .width(104.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(Marca.Verde, Marca.Azul),
                        )
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "SEGURIDAD\nEN MOVIMIENTO,\nCOMPROMISO\nEN CADA KM",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    fontSize = 7.sp,
                    lineHeight = 8.5.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }
        }
    }
}

/**
 * El encabezado de cada apartado.
 *
 * Lleva el número de sección de la especificación —«4.3 Mi Jornada»— porque
 * es así como Elvis y el supervisor se refieren a las pantallas cuando
 * conversan sobre ellas.
 */
@Composable
fun EncabezadoDeApartado(
    titulo: String,
    seccion: String,
    persona: String? = null,
    cuadrilla: String? = null,
    alVolver: (() -> Unit)? = null,
    acciones: @Composable RowScope.() -> Unit = {},
) {
    Surface(color = Color.White) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (alVolver != null) {
                    IconButton(onClick = alVolver) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ArrowBack,
                            contentDescription = "Volver",
                            tint = Marca.Azul,
                        )
                    }
                } else {
                    Spacer(Modifier.width(12.dp))
                }

                Column {
                    Text(
                        titulo,
                        // «Programación» junto al chip de la cuadrilla no
                        // cabía en headlineSmall y se partía, dejando una «n»
                        // suelta en la línea de abajo.
                        style = MaterialTheme.typography.titleLarge,
                        color = Marca.Azul,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        seccion,
                        style = MaterialTheme.typography.labelSmall,
                        color = TintaSuave,
                    )
                }

                // Basta con que haya uno de los dos: en las pantallas de
                // detalle solo se pasa la cuadrilla, y antes no se veía nada.
                if (persona != null || cuadrilla != null) {
                    Spacer(Modifier.width(12.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        // El que cede el ancho es el chip, no el título: el
                        // nombre del apartado es lo que dice dónde estás, y
                        // «Cuadrilla 1 · Calzada y Drenaje» se entiende igual
                        // cortado que entero.
                        modifier = Modifier.weight(1f, fill = false).padding(end = 8.dp),
                    ) {
                        Box(
                            Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(17.dp))
                                .background(Marca.Azul),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.Person,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(19.dp),
                            )
                        }
                        Column {
                            persona?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            cuadrilla?.let {
                                Text(
                                    it,
                                    style = if (persona == null) {
                                        MaterialTheme.typography.labelMedium
                                    } else {
                                        MaterialTheme.typography.labelSmall
                                    },
                                    color = if (persona == null) Marca.Azul else TintaSuave,
                                    fontWeight = if (persona == null) {
                                        FontWeight.SemiBold
                                    } else {
                                        FontWeight.Normal
                                    },
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
                acciones()
            }
            HorizontalDivider(color = Borde)
        }
    }
}

/**
 * La línea de ayuda azul que abre cada apartado.
 *
 * Una sola frase que dice qué se hace aquí. En el documento aparece en todas
 * las pantallas, y sirve para que alguien que entra por primera vez no tenga
 * que preguntar.
 */
@Composable
fun AvisoInformativo(texto: String, modifier: Modifier = Modifier) {
    Surface(
        color = AzulSuave,
        shape = RoundedCornerShape(10.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Outlined.Info,
                contentDescription = null,
                tint = Marca.Azul,
                modifier = Modifier.size(18.dp),
            )
            Text(
                texto,
                style = MaterialTheme.typography.bodySmall,
                color = Marca.Azul,
            )
        }
    }
}
