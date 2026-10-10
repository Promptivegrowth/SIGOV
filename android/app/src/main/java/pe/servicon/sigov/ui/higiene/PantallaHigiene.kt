package pe.servicon.sigov.ui.higiene

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pe.servicon.sigov.datos.CharlaRepositorio
import pe.servicon.sigov.datos.HigieneRepositorio
import pe.servicon.sigov.datos.Peru
import pe.servicon.sigov.datos.PuntoDeHigiene
import pe.servicon.sigov.datos.RespuestaHigiene
import pe.servicon.sigov.datos.SesionRepositorio
import pe.servicon.sigov.datos.Ubicacion
import pe.servicon.sigov.datos.enCristiano
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo
import javax.inject.Inject

data class EstadoHigiene(
    val cargando: Boolean = true,
    val cuadrilla: String = "",
    /** Lo que ya está guardado hoy, en la nube o en el equipo. */
    val guardadas: Map<String, RespuestaHigiene> = emptyMap(),
    /** Lo que el capataz está marcando ahora: Sí, No o sin tocar. */
    val respuestas: Map<PuntoDeHigiene, Boolean> = emptyMap(),
    val notas: Map<PuntoDeHigiene, String> = emptyMap(),
    val personas: String = "",
    val guardando: Boolean = false,
    val aviso: String? = null,
    val error: String? = null,
) {
    val completo: Boolean get() = respuestas.size == PuntoDeHigiene.entries.size
    val yaGuardado: Boolean get() = guardadas.isNotEmpty()
    val cumplidos: Int get() = respuestas.values.count { it }
    /** Si lo que se ve en pantalla es distinto de lo guardado. */
    val cambiado: Boolean
        get() = PuntoDeHigiene.entries.any { p ->
            val g = guardadas[p.valor]
            val nota = if (respuestas[p] == false) notas[p]?.trim().orEmpty() else ""
            respuestas[p] != g?.cumple || nota != g?.nota.orEmpty()
        }
}

/**
 * El checklist de higiene del día (OBS-58).
 *
 * Antes estaba metido en la pantalla de charlas, cada toque registraba sin
 * confirmar y solo existía el «Sí». Ahora es un checklist propio: los cinco
 * puntos con Sí o No, el porqué de cada No y un solo botón para guardarlo.
 */
@HiltViewModel
class HigieneViewModel @Inject constructor(
    private val higiene: HigieneRepositorio,
    private val charlas: CharlaRepositorio,
    private val sesion: SesionRepositorio,
    private val ubicacion: Ubicacion,
) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoHigiene())
    val estado: StateFlow<EstadoHigiene> = _estado.asStateFlow()

    init { cargar() }

    private fun cargar() {
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla()
                    ?: error("Tu usuario no dirige ninguna cuadrilla. Avisa al coordinador.")
                val guardadas = higiene.respuestasDeHoy(cuadrilla.servicioId, cuadrilla.id)
                val miembros = runCatching { charlas.miembros(cuadrilla.servicioId, cuadrilla.id).size }.getOrDefault(0)
                Triple(cuadrilla.name, guardadas, miembros)
            }.onSuccess { (nombre, guardadas, miembros) ->
                _estado.update {
                    it.copy(
                        cargando = false,
                        cuadrilla = nombre,
                        guardadas = guardadas,
                        respuestas = PuntoDeHigiene.entries.mapNotNull { p -> guardadas[p.valor]?.let { g -> p to g.cumple } }.toMap(),
                        notas = PuntoDeHigiene.entries.mapNotNull { p -> guardadas[p.valor]?.nota?.let { n -> p to n } }.toMap(),
                        personas = (guardadas.values.firstNotNullOfOrNull { g -> g.personas } ?: miembros.takeIf { m -> m > 0 })
                            ?.toString().orEmpty(),
                    )
                }
            }.onFailure { f -> _estado.update { it.copy(cargando = false, error = f.enCristiano()) } }
        }
    }

    fun responder(punto: PuntoDeHigiene, cumple: Boolean) =
        _estado.update { it.copy(respuestas = it.respuestas + (punto to cumple)) }

    fun anotar(punto: PuntoDeHigiene, nota: String) =
        _estado.update { it.copy(notas = it.notas + (punto to nota)) }

    fun personas(texto: String) =
        _estado.update { it.copy(personas = texto.filter(Char::isDigit).take(3)) }

    fun guardar() {
        val e = _estado.value
        if (!e.completo) {
            _estado.update { it.copy(error = "Responde los ${PuntoDeHigiene.entries.size} puntos antes de guardar.") }
            return
        }
        _estado.update { it.copy(guardando = true) }
        viewModelScope.launch {
            runCatching {
                val cuadrilla = sesion.cuadrilla() ?: error("Sin cuadrilla asignada.")
                val donde = runCatching { ubicacion.actual() }.getOrNull()
                higiene.guardarChecklist(
                    cuadrilla.servicioId, cuadrilla.id, e.respuestas, e.notas,
                    e.personas.toIntOrNull(), donde,
                )
                higiene.respuestasDeHoy(cuadrilla.servicioId, cuadrilla.id)
            }.onSuccess { guardadas ->
                _estado.update {
                    it.copy(
                        guardando = false,
                        guardadas = guardadas,
                        aviso = if (e.yaGuardado) "Checklist corregido." else "Checklist de higiene guardado.",
                    )
                }
            }.onFailure { f -> _estado.update { it.copy(guardando = false, error = f.enCristiano()) } }
        }
    }

    fun avisoVisto() = _estado.update { it.copy(aviso = null, error = null) }
}

@Composable
fun PantallaHigiene(vm: HigieneViewModel = hiltViewModel(), alVolver: () -> Unit) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.aviso ?: estado.error)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    ArmazonDeApartado(
        titulo = "Checklist de higiene",
        seccion = "Apartado 6.5",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "Responde Sí o No en cada punto y guarda. Si algo no se cumplió, di por qué.",
        avisos = avisos,
    ) { relleno ->
        if (estado.cargando) {
            Box(Modifier.fillMaxSize().padding(relleno), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ArmazonDeApartado
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(relleno)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Resumen(estado)

            PuntoDeHigiene.entries.forEach { punto ->
                FilaPunto(
                    punto = punto,
                    respuesta = estado.respuestas[punto],
                    nota = estado.notas[punto].orEmpty(),
                    alResponder = { vm.responder(punto, it) },
                    alAnotar = { vm.anotar(punto, it) },
                )
            }

            OutlinedTextField(
                value = estado.personas,
                onValueChange = vm::personas,
                label = { Text("Personas en la cuadrilla hoy") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = vm::guardar,
                enabled = !estado.guardando && estado.completo && (!estado.yaGuardado || estado.cambiado),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    when {
                        estado.guardando -> "Guardando…"
                        !estado.completo -> "Faltan ${PuntoDeHigiene.entries.size - estado.respuestas.size} por responder"
                        estado.yaGuardado && !estado.cambiado -> "Guardado"
                        estado.yaGuardado -> "Guardar corrección"
                        else -> "Guardar checklist"
                    },
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Resumen(estado: EstadoHigiene) {
    val porEnviar = estado.guardadas.values.any { it.porEnviar }
    val (texto, color) = when {
        !estado.yaGuardado -> "Todavía no se registra hoy" to Semaforo.Urgente
        porEnviar -> "Guardado en el celular · se envía al haber señal" to Marca.Naranja
        else -> "Registrado hoy · ${estado.guardadas.values.count { it.cumple }} de ${PuntoDeHigiene.entries.size} cumplidos" to Marca.VerdeBandera
    }
    Surface(color = color.copy(alpha = 0.10f), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(Peru.fechaLarga(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(texto, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = color)
        }
    }
}

@Composable
private fun FilaPunto(
    punto: PuntoDeHigiene,
    respuesta: Boolean?,
    nota: String,
    alResponder: (Boolean) -> Unit,
    alAnotar: (String) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder(),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(punto.etiqueta, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(punto.detalle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Opcion("Sí", respuesta == true, Marca.VerdeBandera, Modifier.weight(1f)) { alResponder(true) }
                Opcion("No", respuesta == false, Semaforo.Vencido, Modifier.weight(1f)) { alResponder(false) }
            }
            if (respuesta == false) {
                OutlinedTextField(
                    value = nota,
                    onValueChange = alAnotar,
                    label = { Text("¿Por qué no se cumplió?") },
                    placeholder = { Text("No llegó el bloqueador, sin agua en la unidad…") },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun Opcion(texto: String, elegida: Boolean, color: Color, modifier: Modifier, alTocar: () -> Unit) {
    if (elegida) {
        Button(
            onClick = alTocar,
            colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White),
            shape = RoundedCornerShape(10.dp),
            modifier = modifier.height(46.dp),
        ) { Text(texto, fontWeight = FontWeight.Bold) }
    } else {
        OutlinedButton(onClick = alTocar, shape = RoundedCornerShape(10.dp), modifier = modifier.height(46.dp)) {
            Text(texto)
        }
    }
}
