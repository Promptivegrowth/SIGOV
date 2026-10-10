package pe.servicon.sigov.ui.sync

import pe.servicon.sigov.datos.Conexion
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
    /** Todo lo de la bandeja: pendiente, enviándose y lo llegado en 48 h. */
    val bandeja: List<EnvioPendiente> = emptyList(),
    /** Registros a los que todavía les falta subir su foto o archivo. */
    val conArchivo: Set<String> = emptySet(),
)

/** Los grupos de la bandeja, como los pidió Elvis (OBS-52). */
enum class GrupoEnvio(val titulo: String) {
    ACTIVIDADES("Actividades"),
    REPORTES("Reportes"),
    FOTOS("Fotografías"),
    GASTOS("Gastos"),
    OTROS("Otros"),
}

fun grupoDe(tabla: String): GrupoEnvio = when (tabla) {
    "work_entries", "movimientos_cuadrilla", "supply_requests", "supply_request_items" -> GrupoEnvio.ACTIVIDADES
    "work_orders", "rpc:actualizar_parte", "rpc:enviar_parte", "rpc:cargar_pagina_documento",
    "rpc:quitar_pagina_documento", "safety_talks", "talk_attendance", "hygiene_checks",
    "ats_iperc", "ats_signatures", "vehicle_checks", "checklist_responses", "safety_equipment_checks" -> GrupoEnvio.REPORTES
    "evidences", "rpc:dar_de_baja_evidencia" -> GrupoEnvio.FOTOS
    "cash_movements", "deposit_requests", "rpc:corregir_solicitud_deposito" -> GrupoEnvio.GASTOS
    else -> GrupoEnvio.OTROS
}

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
    private val conexion: Conexion,
) : ViewModel() {

    /** Lo que se le dice al capataz al pulsar «Sincronizar ahora». */
    private val _aviso = MutableStateFlow<String?>(null)
    val aviso: StateFlow<String?> = _aviso.asStateFlow()
    fun avisoVisto() { _aviso.value = null }

    val estado: StateFlow<EstadoSincronizacion> = combine(
        combine(cola.enEspera, cola.conError, cola.archivosPendientes, cola.ultimoEnvio) { espera, errores, fotos, ultimo ->
            EstadoSincronizacion(espera, errores, fotos, ultimo)
        },
        cola.bandeja,
        cola.conArchivoPendiente,
    ) { base, bandeja, conArchivo ->
        base.copy(bandeja = bandeja, conArchivo = conArchivo)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EstadoSincronizacion())

    /**
     * Sin señal, el botón no hacía nada visible y parecía roto (OBS-50).
     * Ahora dice qué pasa: sin red, que todo queda guardado y saldrá solo;
     * con red, que está enviando.
     */
    fun sincronizarAhora() {
        viewModelScope.launch { cola.sincronizarAhora() }
        _aviso.value = if (!conexion.ahora())
            "Sin conexión. Los registros permanecerán guardados y se enviarán automáticamente al recuperar señal."
        else if (estado.value.enEspera.isEmpty() && estado.value.fotosPendientes == 0)
            "No hay nada pendiente: todo está en la nube."
        else
            "Enviando lo pendiente…"
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
    val aviso by vm.aviso.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var grupo by rememberSaveable { mutableStateOf<GrupoEnvio?>(null) }
    LaunchedEffect(aviso) {
        aviso?.let { avisos.showSnackbar(it); vm.avisoVisto() }
    }

    ArmazonDeApartado(
        titulo = "Sincronización",
        seccion = "Apartado 4.12",
        alVolver = alVolver,
        ayuda = "Lo que falta enviar, lo que se está enviando y lo que ya llegó, por tipo.",
        avisos = avisos,
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

            item {
                FiltroDeGrupos(
                    elegido = grupo,
                    cuantos = { g -> estado.bandeja.count { grupoDe(it.tabla) == g && it.estado != EstadoEnvio.ENVIADO } },
                    alElegir = { grupo = it },
                )
            }

            val delGrupo = estado.bandeja.filter { grupo == null || grupoDe(it.tabla) == grupo }
            val porEnviar = delGrupo.filter { it.estado != EstadoEnvio.ENVIADO }
            val enviados = delGrupo.filter { it.estado == EstadoEnvio.ENVIADO }

            if (porEnviar.isEmpty()) {
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
                        Text(
                            if (grupo == null) "Todo está en la nube" else "Nada de ${grupo!!.titulo.lowercase()} por enviar",
                            style = MaterialTheme.typography.titleMedium,
                        )
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
                        "Por enviar · ${porEnviar.size}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                items(porEnviar, key = { it.clientId }) { Envio(it, it.clientId in estado.conArchivo) }
            }

            if (enviados.isNotEmpty()) {
                item {
                    Text(
                        "Sincronizado en las últimas 48 horas · ${enviados.size}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                items(enviados, key = { "ok-" + it.clientId }) { Envio(it, false) }
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
private fun FiltroDeGrupos(elegido: GrupoEnvio?, cuantos: (GrupoEnvio) -> Int, alElegir: (GrupoEnvio?) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(selected = elegido == null, onClick = { alElegir(null) }, label = { Text("Todos") })
        GrupoEnvio.entries.forEach { g ->
            val n = cuantos(g)
            FilterChip(
                selected = elegido == g,
                onClick = { alElegir(if (elegido == g) null else g) },
                label = { Text(if (n > 0) "${g.titulo} · $n" else g.titulo) },
            )
        }
    }
}

/** El estado de un registro, con su color: lo que el capataz mira primero. */
private data class Etiqueta(val texto: String, val color: Color)

@Composable
private fun etiquetaDe(envio: EnvioPendiente): Etiqueta = when (envio.estado) {
    EstadoEnvio.PENDIENTE -> Etiqueta("Pendiente", Marca.Azul)
    EstadoEnvio.ENVIANDO -> Etiqueta("Enviando…", Marca.Naranja)
    EstadoEnvio.ENVIADO -> Etiqueta("Sincronizado", Marca.VerdeBandera)
    EstadoEnvio.ERROR -> if (envio.intentos >= MAX_INTENTOS) Etiqueta("Error · no se pudo enviar", MaterialTheme.colorScheme.error)
        else Etiqueta("Error · reintentando", Marca.Naranja)
}

@Composable
private fun Envio(envio: EnvioPendiente, faltaArchivo: Boolean) {
    val etiqueta = etiquetaDe(envio)

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(etiqueta.color))

            Column(Modifier.padding(16.dp)) {
                Text(
                    envio.etiqueta,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${grupoDe(envio.tabla).titulo} · ${enCastellano(envio.tabla)} · registrado ${cuando(envio.creadoEn)}" +
                        (envio.enviadoEn?.takeIf { envio.estado == EstadoEnvio.ENVIADO }?.let { " · llegó ${cuando(it)}" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip(etiqueta.texto, etiqueta.color)
                    if (faltaArchivo) Chip("Foto por subir", Marca.Naranja)
                    if (envio.estado == EstadoEnvio.ERROR && envio.intentos > 0 && envio.intentos < MAX_INTENTOS) {
                        Chip(if (envio.intentos == 1) "1 intento" else "${envio.intentos} intentos", MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // El motivo tal como lo devolvió el servidor: sin él, el
                // supervisor no tiene por dónde empezar a mirar.
                envio.ultimoError?.takeIf { envio.estado == EstadoEnvio.ERROR }?.let {
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

@Composable
private fun Chip(texto: String, color: Color) {
    Text(
        texto,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
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
    "movimientos_cuadrilla" -> "Material usado"
    "rpc:actualizar_parte" -> "Datos del parte"
    "rpc:enviar_parte" -> "Envío del parte"
    "rpc:cargar_pagina_documento" -> "Documento del día"
    "rpc:quitar_pagina_documento" -> "Quitar página"
    "rpc:dar_de_baja_evidencia" -> "Eliminar fotografía"
    "rpc:corregir_solicitud_deposito" -> "Corrección de depósito"
    else -> tabla.removePrefix("rpc:")
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
