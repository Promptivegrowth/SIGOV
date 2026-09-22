package pe.servicon.sigov.ui.sync

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.local.EnvioPendiente
import pe.servicon.sigov.datos.local.EstadoEnvio
import pe.servicon.sigov.datos.sync.ColaRepositorio
import pe.servicon.sigov.datos.sync.MAX_INTENTOS
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject

data class EstadoSincronizacion(
    val enEspera: List<EnvioPendiente> = emptyList(),
    val conError: Int = 0,
    val fotosPendientes: Int = 0,
    val ultimoEnvio: Long? = null,
)

/**
 * El estado de la cola, sin adornos.
 *
 * Lo único que hay que saber es si lo registrado ya llegó o sigue en el
 * equipo, y esto se lee directo de la base local: no se consulta a la nube
 * para contar lo que no ha salido de aquí.
 */
@HiltViewModel
class SincronizacionViewModel @Inject constructor(
    private val cola: ColaRepositorio,
) : ViewModel() {

    val estado: StateFlow<EstadoSincronizacion> = combine(
        cola.enEspera,
        cola.conError,
        cola.archivosPendientes,
        cola.ultimoEnvio,
    ) { espera, errores, fotos, ultimo ->
        EstadoSincronizacion(espera, errores, fotos, ultimo)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EstadoSincronizacion())

    fun sincronizarAhora() {
        viewModelScope.launch { cola.sincronizarAhora() }
    }
}

/**
 * Sincronización (apartado 4.12).
 *
 * En campo no hay señal la mitad del día, y el capataz necesita saber —sin
 * preguntarle a nadie— si el parte que llenó en la quebrada ya llegó a
 * oficina. Mientras haya algo aquí, ese trabajo solo existe en su teléfono.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaSincronizacion(
    vm: SincronizacionViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val pendientes = estado.enEspera.size + estado.fotosPendientes

    ArmazonDeApartado(
        titulo = "Sincronización",
        seccion = "Apartado 4.12",
        alVolver = alVolver,
        ayuda = "Lo que registraste y todavía no sale de este teléfono.",
        botonFlotante = {
            ExtendedFloatingActionButton(
                onClick = vm::sincronizarAhora,
                containerColor = Marca.VerdeBandera,
                contentColor = Color.White,
                icon = { Icon(Icons.Outlined.Sync, contentDescription = null) },
                text = { Text("Sincronizar ahora") },
            )
        },
    ) { relleno ->
        LazyColumn(
            Modifier.fillMaxSize().padding(relleno),
            contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Resumen(pendientes, estado) }

            if (estado.enEspera.isEmpty()) {
                item {
                    Column(
                        Modifier.fillMaxWidth().padding(top = 48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            Icons.Outlined.CloudDone,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = Marca.VerdeBandera,
                        )
                        Spacer(Modifier.height(12.dp))
                        Text("Todo está en la nube", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "No queda nada por enviar desde este teléfono.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                item {
                    Text(
                        "Esperando para subir",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                items(estado.enEspera, key = { it.clientId }) { Envio(it) }
            }
        }
    }
}

@Composable
private fun Resumen(pendientes: Int, estado: EstadoSincronizacion) {
    val todoArriba = pendientes == 0
    val color = when {
        estado.conError > 0 -> Marca.Naranja
        todoArriba -> Marca.VerdeBandera
        else -> Marca.Azul
    }

    Surface(
        color = color.copy(alpha = 0.08f),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (todoArriba) Icons.Outlined.CloudDone else Icons.Outlined.CloudUpload,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        when {
                            todoArriba -> "Todo sincronizado"
                            pendientes == 1 -> "1 registro por enviar"
                            else -> "$pendientes registros por enviar"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = color,
                    )
                    Text(
                        estado.ultimoEnvio?.let { "Último envío: ${cuando(it)}" }
                            ?: "Todavía no se ha enviado nada",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (estado.fotosPendientes > 0) {
                Spacer(Modifier.height(10.dp))
                Text(
                    if (estado.fotosPendientes == 1) "1 fotografía sin subir"
                    else "${estado.fotosPendientes} fotografías sin subir",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Se distingue lo que va a volver a intentarse de lo que ya
            // agotó los intentos. Decir «nada se pierde» de algo que la nube
            // rechaza por el contenido es mentirle al capataz.
            val rendidos = estado.enEspera.count { it.intentos >= MAX_INTENTOS }
            val reintentando = estado.conError - rendidos

            if (reintentando > 0) {
                Spacer(Modifier.height(10.dp))
                Linea(
                    if (reintentando == 1) "1 falló y se va a reintentar solo."
                    else "$reintentando fallaron y se van a reintentar solos.",
                    Marca.Naranja,
                )
            }

            if (rendidos > 0) {
                Spacer(Modifier.height(10.dp))
                Linea(
                    if (rendidos == 1)
                        "1 no se pudo enviar tras varios intentos. Avisa al supervisor."
                    else
                        "$rendidos no se pudieron enviar tras varios intentos. Avisa al supervisor.",
                    MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun Linea(texto: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            Icons.Outlined.ErrorOutline,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(6.dp))
        Text(texto, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

@Composable
private fun Envio(envio: EnvioPendiente) {
    val fallo = envio.estado == EstadoEnvio.ERROR
    val color = if (fallo) Marca.Naranja else Marca.Azul

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(color))

            Column(Modifier.padding(16.dp)) {
                Text(
                    envio.etiqueta,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${enCastellano(envio.tabla)} · registrado ${cuando(envio.creadoEn)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (fallo) {
                    val rendido = envio.intentos >= MAX_INTENTOS
                    val tinte = if (rendido) MaterialTheme.colorScheme.error else Marca.Naranja
                    Spacer(Modifier.height(8.dp))
                    Text(
                        when {
                            rendido -> "No se pudo enviar"
                            envio.intentos == 1 -> "Falló 1 intento · reintentando"
                            else -> "Fallaron ${envio.intentos} intentos · reintentando"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tinte,
                        modifier = Modifier
                            .background(tinte.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    // El motivo tal como lo devolvió el servidor: sin él, el
                    // supervisor no tiene por dónde empezar a mirar.
                    envio.ultimoError?.takeIf { rendido }?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** El nombre de la tabla dicho como lo diría alguien de obra. */
private fun enCastellano(tabla: String): String = when (tabla) {
    "work_orders" -> "Parte diario"
    "work_entries" -> "Actividad ejecutada"
    "evidences" -> "Fotografía"
    "cash_movements" -> "Gasto de caja"
    "deposit_requests" -> "Pedido de depósito"
    "supply_requests" -> "Pedido de materiales"
    "supply_request_items" -> "Ítem del pedido"
    "safety_talks" -> "Charla de seguridad"
    "talk_attendance" -> "Firma de asistencia"
    "hygiene_checks" -> "Control de higiene"
    "safety_equipment_checks" -> "Revisión de equipo"
    "vehicle_checks" -> "Revisión de vehículo"
    "checklist_responses" -> "Checklist"
    "ats_iperc" -> "ATS / IPERC"
    "ats_signatures" -> "Firma del ATS"
    else -> tabla
}

/** Hace cuánto, no la hora exacta: en campo nadie compara relojes. */
private fun cuando(instante: Long): String {
    val minutos = (System.currentTimeMillis() - instante) / 60_000
    return when {
        minutos < 1 -> "hace un momento"
        minutos < 60 -> "hace $minutos min"
        minutos < 24 * 60 -> "hace ${minutos / 60} h"
        minutos < 48 * 60 -> "ayer"
        else -> Peru.fechaCorta(
            Instant.ofEpochMilli(instante).atZone(ZoneId.of("America/Lima")).toLocalDate()
        )
    }
}
