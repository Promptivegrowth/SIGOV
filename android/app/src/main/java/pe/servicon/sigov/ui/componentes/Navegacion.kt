package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.ui.theme.Borde
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

/**
 * Las cuatro secciones de la barra inferior.
 *
 * Son las que dibujó Elvis. No son todos los módulos —serían demasiados para
 * el pulgar— sino los cuatro sitios a los que se vuelve todo el día.
 */
enum class SeccionInferior(
    val ruta: String,
    val etiqueta: String,
    val icono: ImageVector,
) {
    INICIO("jornada", "Inicio", Icons.Outlined.Home),
    TRABAJOS("trabajos", "Trabajos", Icons.Outlined.Work),
    FOTOS("evidencias", "Fotos", Icons.Outlined.CameraAlt),
    PERFIL("perfil", "Perfil", Icons.Outlined.Person),
    // Roles de gestión y consulta (revisión visual 18/11): módulos web dentro de la app
    GESTION("portal/gestion", "Gestión", Icons.Outlined.Layers),
    ALERTAS("portal/alertas", "Alertas", Icons.Outlined.Notifications),
    REPORTES("portal/reportes", "Reportes", Icons.Outlined.BarChart),
    PCI("portal/pci", "PCI", Icons.Outlined.Flag),
    OBSERVACIONES("portal/observaciones", "Observaciones", Icons.Outlined.ChatBubbleOutline),
    INSPECCIONES("portal/inspecciones", "Inspecciones", Icons.Outlined.Assignment),
    HALLAZGOS("portal/hallazgos", "Hallazgos", Icons.Outlined.WarningAmber),
}

/** La barra de cada rol, como en sus maquetas móviles. */
fun seccionesDelRol(rol: String?): List<SeccionInferior> = when (rol) {
    null, "jefe_cuadrilla" -> listOf(SeccionInferior.INICIO, SeccionInferior.TRABAJOS, SeccionInferior.FOTOS, SeccionInferior.PERFIL)
    "visor" -> listOf(SeccionInferior.INICIO, SeccionInferior.PCI, SeccionInferior.OBSERVACIONES, SeccionInferior.REPORTES, SeccionInferior.PERFIL)
    "ing_seguridad" -> listOf(SeccionInferior.INICIO, SeccionInferior.INSPECCIONES, SeccionInferior.HALLAZGOS, SeccionInferior.REPORTES, SeccionInferior.PERFIL)
    else -> listOf(SeccionInferior.INICIO, SeccionInferior.GESTION, SeccionInferior.ALERTAS, SeccionInferior.REPORTES, SeccionInferior.PERFIL)
}

/** La pantalla web que abre cada sección para ese rol. */
fun rutaWeb(seccion: SeccionInferior, rol: String?): String = when (seccion) {
    SeccionInferior.GESTION -> if (rol == "admin") "/gestion/usuarios" else "/revision-reportes"
    SeccionInferior.ALERTAS -> if (rol == "admin") "/alertas" else "/notificaciones"
    SeccionInferior.REPORTES -> "/reportes"
    SeccionInferior.PCI -> "/pci"
    SeccionInferior.OBSERVACIONES -> "/revision"
    SeccionInferior.INSPECCIONES -> "/ssoma/inspecciones"
    SeccionInferior.HALLAZGOS -> "/ssoma/hallazgos"
    else -> "/dashboard"
}

/**
 * La barra inferior.
 *
 * Objetivos táctiles grandes: se usa de pie, con guantes y con una sola mano,
 * así que cada destino ocupa un cuarto del ancho y toda la altura de la barra.
 */
@Composable
fun BarraInferior(
    actual: SeccionInferior,
    alIr: (SeccionInferior) -> Unit,
    pendientes: Int = 0,
    secciones: List<SeccionInferior> = SeccionInferior.entries,
) {
    Surface(color = Color.White, shadowElevation = 12.dp) {
        Column {
            HorizontalDivider(color = Borde)
            Row(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .height(64.dp),
            ) {
                secciones.forEach { seccion ->
                    val activa = seccion == actual
                    Column(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .then(
                                if (activa) {
                                    Modifier.background(Marca.Azul.copy(alpha = 0.06f))
                                } else Modifier
                            )
                            .clickableSinRipple { alIr(seccion) },
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box {
                            Icon(
                                seccion.icono,
                                contentDescription = seccion.etiqueta,
                                tint = if (activa) Marca.Azul else TintaSuave,
                                modifier = Modifier.size(23.dp),
                            )
                            // Lo pendiente de enviar se avisa donde el capataz
                            // mira, no escondido en un menú.
                            if (seccion == SeccionInferior.INICIO && pendientes > 0) {
                                Box(
                                    Modifier
                                        .align(Alignment.TopEnd)
                                        .offset(x = 7.dp, y = (-4).dp)
                                        .background(Marca.Naranja, RoundedCornerShape(8.dp))
                                        .padding(horizontal = 4.dp, vertical = 1.dp),
                                ) {
                                    Text(
                                        if (pendientes > 9) "9+" else "$pendientes",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(3.dp))
                        Text(
                            seccion.etiqueta,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (activa) Marca.Azul else TintaSuave,
                            fontWeight = if (activa) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
    }
}

/** Sin la onda del material: en la barra inferior estorba más que ayuda. */
@Composable
private fun Modifier.clickableSinRipple(alTocar: () -> Unit): Modifier {
    val interaccion = remember { MutableInteractionSource() }
    return this.clickable(
        interactionSource = interaccion,
        indication = null,
        onClick = alTocar,
    )
}
