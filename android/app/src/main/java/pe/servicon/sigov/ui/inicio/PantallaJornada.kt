package pe.servicon.sigov.ui.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.ui.theme.Marca

/**
 * «Mi Jornada»: la primera pantalla del capataz, tal como la define la
 * especificación de SERVICON.
 *
 * Responde de un vistazo a lo que necesita saber al bajar de la camioneta:
 * qué le toca hoy, cuántos PCI tiene encima, qué le falta registrar y si
 * quedó algo esperando señal.
 */
@Composable
fun PantallaJornada(
    vm: JornadaViewModel = hiltViewModel(),
    alSalir: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            Surface(color = Marca.Azul) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                estado.saludo,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.72f),
                            )
                            Text(
                                estado.nombre.ifBlank { "SIGOV" },
                                style = MaterialTheme.typography.headlineMedium,
                                color = Color.White,
                            )
                        }
                        IconButton(onClick = { vm.salir(alSalir) }) {
                            Icon(
                                Icons.Outlined.Logout,
                                contentDescription = "Cerrar sesión",
                                tint = Color.White,
                            )
                        }
                    }

                    Spacer(Modifier.height(6.dp))
                    Text(
                        listOfNotNull(
                            estado.cuadrilla.ifBlank { null },
                            estado.fecha,
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                }
            }
        },
    ) { relleno ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(relleno)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Estado de la conexión: lo primero que hay que saber en carretera
            EstadoSincronizacion(pendientes = estado.pendientes)

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Indicador(
                    Modifier.weight(1f),
                    Icons.AutoMirrored.Outlined.ListAlt,
                    "Programadas",
                    estado.programadas.toString(),
                    Marca.Azul,
                )
                Indicador(
                    Modifier.weight(1f),
                    Icons.Outlined.Warning,
                    "PCI asignados",
                    estado.pci.toString(),
                    Marca.Naranja,
                )
            }

            Text(
                "Qué vas a hacer",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp),
            )

            Accion(Icons.Outlined.Assignment, "Programación", "Las actividades de hoy")
            Accion(Icons.Outlined.ReportProblem, "PCI", "Los requerimientos con plazo")
            Accion(Icons.Outlined.EditNote, "Reporte diario", "Registrar lo ejecutado")
            Accion(Icons.Outlined.PhotoCamera, "Evidencias", "Fotos con GPS y sello")
            Accion(Icons.Outlined.AccountBalanceWallet, "Mi caja", "Gastos y depósitos")
            Accion(Icons.Outlined.Inventory2, "Materiales", "Solicitar insumos")

            if (estado.error != null) {
                Text(
                    estado.error!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun EstadoSincronizacion(pendientes: Int) {
    val alDia = pendientes == 0
    Surface(
        color = if (alDia) Marca.Verde.copy(alpha = 0.12f) else Marca.Naranja.copy(alpha = 0.14f),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                if (alDia) Icons.Outlined.CloudDone else Icons.Outlined.CloudUpload,
                contentDescription = null,
                tint = if (alDia) Marca.VerdeBandera else Marca.Naranja,
            )
            Column {
                Text(
                    if (alDia) "Todo sincronizado" else "$pendientes registros esperando señal",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    if (alDia) "No hay nada pendiente de enviar"
                    else "Se enviarán solos cuando vuelva la conexión",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Indicador(
    modifier: Modifier,
    icono: ImageVector,
    etiqueta: String,
    valor: String,
    color: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Box(
                Modifier
                    .size(36.dp)
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icono, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.height(10.dp))
            Text(valor, style = MaterialTheme.typography.displayMedium, color = color)
            Text(
                etiqueta,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Accion(icono: ImageVector, titulo: String, detalle: String) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                Modifier
                    .size(42.dp)
                    .background(Marca.Azul.copy(alpha = 0.08f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icono, contentDescription = null, tint = Marca.Azul)
            }
            Column(Modifier.weight(1f)) {
                Text(titulo, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    detalle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
