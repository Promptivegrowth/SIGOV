package pe.servicon.sigov.ui.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.ui.componentes.AzulejoDeMenu
import pe.servicon.sigov.ui.componentes.CabeceraDeMarca
import pe.servicon.sigov.ui.componentes.EncabezadoDeApartado
import pe.servicon.sigov.ui.componentes.FichaDato
import pe.servicon.sigov.ui.theme.Fondo
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.TintaSuave

/**
 * «Mi Jornada», el apartado 4.3 de la especificación.
 *
 * Responde de un vistazo a lo que el capataz necesita al bajar de la
 * camioneta: en qué fecha y sector está, quién lo supervisa, cuánto le queda
 * en caja, qué le toca hoy y si algo quedó esperando señal. Debajo, el menú
 * en cuadrícula con los apartados del documento.
 */
@Composable
fun PantallaJornada(
    vm: JornadaViewModel = hiltViewModel(),
    alSalir: () -> Unit,
    alAbrirParte: () -> Unit = {},
    alAbrirProgramacion: () -> Unit = {},
    alAbrirPci: () -> Unit = {},
    alAbrirCaja: () -> Unit = {},
    alAbrirEvidencias: () -> Unit = {},
    alAbrirMateriales: () -> Unit = {},
    alAbrirEquipos: () -> Unit = {},
    alAbrirVehiculos: () -> Unit = {},
    alAbrirCharlas: () -> Unit = {},
    alAbrirAst: () -> Unit = {},
    alAbrirAvance: () -> Unit = {},
    alAbrirSincronizacion: () -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()

    // El color de fondo se declara aquí: sin él se transparenta el fondo de
    // la ventana, que es el de la pantalla de arranque.
    Surface(color = Fondo, modifier = Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize()) {
        CabeceraDeMarca()
        EncabezadoDeApartado(
            titulo = "Mi Jornada",
            seccion = "Apartado 4.3 · ${estado.saludo}",
            persona = estado.nombre.ifBlank { null },
            cuadrilla = estado.cuadrilla.ifBlank { null },
            acciones = {
                IconButton(onClick = { vm.salir(alSalir) }) {
                    Icon(
                        Icons.Outlined.Logout,
                        contentDescription = "Cerrar sesión",
                        tint = TintaSuave,
                    )
                }
            },
        )

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // ── La fila de contexto del documento ───────────────────────
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FichaDato(
                    Icons.Outlined.CalendarMonth, "Fecha", estado.fechaCorta,
                    Marca.Azul, Modifier.weight(1f),
                )
                FichaDato(
                    Icons.Outlined.Groups, "Cuadrilla",
                    estado.cuadrillaCodigo.ifBlank { "—" },
                    Marca.VerdeBandera, Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FichaDato(
                    Icons.Outlined.SupervisorAccount, "Supervisor",
                    estado.supervisor.ifBlank { "Sin asignar" },
                    Marca.Azul, Modifier.weight(1f),
                )
                FichaDato(
                    Icons.Outlined.Place, "Sector / Tramo",
                    estado.sector.ifBlank { "—" },
                    Marca.Naranja, Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FichaDato(
                    Icons.Outlined.AccountBalanceWallet, "Saldo disponible",
                    estado.saldo,
                    Marca.VerdeBandera, Modifier.weight(1f),
                    alTocar = alAbrirCaja,
                )
                FichaDato(
                    Icons.Outlined.CloudUpload, "Pendientes",
                    estado.pendientes.toString(),
                    if (estado.pendientes == 0) Marca.VerdeBandera else Marca.Naranja,
                    Modifier.weight(1f),
                    alTocar = alAbrirSincronizacion,
                )
            }

            // ── El menú, en cuadrícula de dos columnas ──────────────────
            Text(
                "Menú principal",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 6.dp),
            )

            val azul = Marca.Azul
            val verde = Marca.VerdeBandera
            val apartados = listOf(
                Apartado(Icons.Outlined.Assignment, "Programación", "Lo asignado a tu cuadrilla", azul, estado.programadas, alAbrirProgramacion),
                Apartado(Icons.AutoMirrored.Outlined.ListAlt, "PCIs", "Ítems por atender", verde, estado.pci, alAbrirPci),
                Apartado(Icons.Outlined.EditNote, "Reporte Diario", "Registrar lo ejecutado", azul, 0, alAbrirParte),
                Apartado(Icons.Outlined.PhotoCamera, "Fotos / Evidencias", "Fotos con GPS y sello", verde, 0, alAbrirEvidencias),
                Apartado(Icons.Outlined.AccountBalanceWallet, "Mi Caja", "Saldo y movimientos", azul, 0, alAbrirCaja),
                Apartado(Icons.Outlined.Inventory2, "Materiales", "Solicitar insumos", verde, 0, alAbrirMateriales),
                Apartado(Icons.Outlined.HealthAndSafety, "Equipos SSOMA", "Extintores, botiquines", azul, 0, alAbrirEquipos),
                Apartado(Icons.Outlined.DirectionsCar, "Vehículos", "Papeles y revisión", verde, 0, alAbrirVehiculos),
                Apartado(Icons.Outlined.Campaign, "Charlas e higiene", "Charla del día e higiene", azul, 0, alAbrirCharlas),
                Apartado(Icons.Outlined.Assignment, "AST", "Antes de empezar la jornada", verde, 0, alAbrirAst),
                Apartado(Icons.Outlined.BarChart, "Mi Avance", "Cumplimiento del día", verde, 0, alAbrirAvance),
                Apartado(Icons.Outlined.Sync, "Sincronización", "Registros pendientes", azul, estado.pendientes, alAbrirSincronizacion),
            )

            apartados.chunked(2).forEach { pareja ->
                // La fila se mide por el azulejo más alto y los dos se
                // estiran a esa altura: quedan parejos sin fijar dp.
                Row(
                    Modifier.height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    pareja.forEach { a ->
                        AzulejoDeMenu(
                            icono = a.icono,
                            titulo = a.titulo,
                            detalle = a.detalle,
                            color = a.color,
                            insignia = a.insignia,
                            alTocar = a.alTocar,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        )
                    }
                    // Si la fila quedó impar, el hueco se reserva para que el
                    // azulejo solitario no ocupe todo el ancho.
                    if (pareja.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            estado.error?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            BandaDeCampana()
            Spacer(Modifier.height(4.dp))
        }
    }
    }
}

private data class Apartado(
    val icono: ImageVector,
    val titulo: String,
    val detalle: String,
    val color: Color,
    val insignia: Int,
    val alTocar: () -> Unit,
)

/** La banda de campaña del pie, que cierra la pantalla con la marca. */
@Composable
private fun BandaDeCampana() {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.horizontalGradient(listOf(Marca.Azul, Marca.VerdeBandera)))
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Column {
            Text(
                "PREVENCIÓN HOY,",
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Text(
                "VÍAS MÁS SEGURAS MAÑANA",
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
