package pe.servicon.sigov.ui.inicio

import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
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
    alAbrirInventario: () -> Unit = {},
    alAbrirVehiculos: () -> Unit = {},
    alAbrirCharlas: () -> Unit = {},
    alAbrirAst: () -> Unit = {},
    alAbrirAvance: () -> Unit = {},
    alAbrirSincronizacion: () -> Unit = {},
    alAbrirConfiguracion: () -> Unit = {},
    alAbrirDocumento: (pe.servicon.sigov.datos.DocumentoDelDia) -> Unit = {},
    alAbrirAvisos: () -> Unit = {},
) {
    // Android 13+: permiso para mostrar los avisos como notificación del teléfono
    val pedirPermiso = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (android.os.Build.VERSION.SDK_INT >= 33) pedirPermiso.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

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
                // La campana: avisos de PCI, observaciones del supervisor, COVINCA y SSOMA
                IconButton(onClick = alAbrirAvisos) {
                    BadgedBox(badge = {
                        if (estado.avisos > 0) Badge { Text(if (estado.avisos > 99) "99+" else estado.avisos.toString()) }
                    }) {
                        Icon(Icons.Outlined.Notifications, contentDescription = "Avisos", tint = Marca.Azul)
                    }
                }
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
                    estado.cuadrillaCodigo.ifBlank { if (estado.cargando) "…" else "—" },
                    Marca.VerdeBandera, Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FichaDato(
                    Icons.Outlined.SupervisorAccount, "Supervisor",
                    // Mientras carga no se afirma nada: «Sin asignar» es una
                    // frase que dice algo, y a los dos segundos resulta falsa.
                    estado.supervisor.ifBlank { if (estado.cargando) "…" else "Sin asignar" },
                    Marca.Azul, Modifier.weight(1f),
                )
                FichaDato(
                    Icons.Outlined.Place, "Sector / Tramo",
                    estado.sector.ifBlank { if (estado.cargando) "…" else "—" },
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

            // ── Los documentos del día: lo que falta, en rojo ───────────
            if (estado.documentos.isNotEmpty()) {
                DocumentosDelDia(
                    documentos = estado.documentos,
                    alTocar = { d ->
                        when (d.tipo) {
                            "reporte_diario" -> alAbrirParte()
                            "higiene" -> alAbrirCharlas()
                            else -> alAbrirDocumento(d)
                        }
                    },
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
                Apartado(Icons.Outlined.Map, "Inventario vial", "Qué hay en tu tramo", azul, 0, alAbrirInventario),
                Apartado(Icons.Outlined.AccountBalanceWallet, "Mi Caja", "Saldo y movimientos", azul, 0, alAbrirCaja),
                // El jefe de cuadrilla ejecuta lo programado; los materiales los
                // pide el supervisor de campo según la programación (regla 1.2).
                Apartado(Icons.Outlined.Inventory2, "Materiales", "Solicitar insumos", verde, 0, alAbrirMateriales)
                    .takeIf { estado.rol != "jefe_cuadrilla" },
                Apartado(Icons.Outlined.HealthAndSafety, "Equipos SSOMA", "Extintores, botiquines", azul, 0, alAbrirEquipos),
                Apartado(Icons.Outlined.DirectionsCar, "Vehículos", "Papeles y revisión", verde, 0, alAbrirVehiculos),
                Apartado(Icons.Outlined.Campaign, "Charlas e higiene", "Charla del día e higiene", azul, 0, alAbrirCharlas),
                Apartado(Icons.Outlined.Assignment, "ATS", "Análisis de Trabajo Seguro", verde, 0, alAbrirAst),
                Apartado(Icons.Outlined.BarChart, "Mi Avance", "Cumplimiento del día", verde, 0, alAbrirAvance),
                Apartado(Icons.Outlined.Sync, "Sincronización", "Registros pendientes", azul, estado.pendientes, alAbrirSincronizacion),
                Apartado(Icons.Outlined.Settings, "Configuración", "Sello de las fotos", verde, 0, alAbrirConfiguracion),
            ).filterNotNull()

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

/**
 * Los formatos del día (Elvis: «si no has tomado la foto, que aparezca en
 * rojo, como son formatos diarios»). Un toque y se carga.
 */
@Composable
private fun DocumentosDelDia(
    documentos: List<pe.servicon.sigov.datos.DocumentoDelDia>,
    alTocar: (pe.servicon.sigov.datos.DocumentoDelDia) -> Unit,
) {
    val faltan = documentos.count { it.falta }
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Documentos del día",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (faltan == 0) "Todo al día" else if (faltan == 1) "Falta 1" else "Faltan $faltan",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (faltan == 0) Marca.VerdeBandera else pe.servicon.sigov.ui.theme.Semaforo.Vencido,
                )
            }
            documentos.forEach { d ->
                val color = pe.servicon.sigov.ui.documentos.colorDelEstado(d)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { alTocar(d) }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(10.dp).background(color, CircleShape))
                    Column(Modifier.weight(1f)) {
                        Text(d.nombre, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            d.estadoLegible + (if (d.paginas > 0) " · ${d.paginas} pág." else ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = color,
                        )
                    }
                    Icon(
                        if (d.esFoto && d.falta) Icons.Outlined.PhotoCamera else Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                        contentDescription = null,
                        tint = if (d.falta) color else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
