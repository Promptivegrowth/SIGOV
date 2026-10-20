package pe.servicon.sigov.ui.ast

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.documentos.AccesoAFoto
import pe.servicon.sigov.ui.theme.Marca

/**
 * El ATS del día, todo por foto del formato llenado en papel (Elvis, P43):
 * el de la cuadrilla y el del conductor de cada vehículo asignado. Abajo, el
 * PETAR, que solo se sube si ese día hubo un trabajo que lo pide (P44).
 */
@Composable
fun PantallaAst(
    vm: AstViewModel = hiltViewModel(),
    alVolver: () -> Unit,
    alFotografiar: () -> Unit = {},
    alFotografiarConductor: (vehiculoId: String) -> Unit = {},
    alFotografiarPetar: () -> Unit = {},
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }

    // Al volver de tomar una foto, el estado de cada ATS se actualiza
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        // Sin «la primera vez no»: al volver, esta pantalla se compone de
        // nuevo y esa marca se reiniciaba, así que nunca recargaba
        val observador = LifecycleEventObserver { _, evento ->
            if (evento == Lifecycle.Event.ON_RESUME) vm.cargar()
        }
        ciclo.lifecycle.addObserver(observador)
        onDispose { ciclo.lifecycle.removeObserver(observador) }
    }

    ArmazonDeApartado(
        titulo = "ATS",
        seccion = "Apartado 4.9",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "El análisis de seguridad del día: la foto del formato llenado en papel.",
        avisos = avisos,
    ) { relleno ->
        if (estado.cargando) {
            Box(Modifier.fillMaxSize().padding(relleno), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@ArmazonDeApartado
        }

        Column(
            Modifier
                .fillMaxSize()
                .padding(relleno)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            estado.error?.let { Aviso(it, MaterialTheme.colorScheme.error) }

            AccesoAFoto(
                titulo = "ATS de la cuadrilla",
                detalle = estado.deCuadrilla?.let { "Hoy: " + it.estadoLegible } ?: "La foto del ATS de hoy, con la firma de cada uno.",
                alTocar = alFotografiar,
            )

            if (estado.deConductores.isEmpty()) {
                Aviso("Tu cuadrilla no tiene vehículo asignado hoy: no hay ATS del conductor que tomar.", Marca.Azul)
            }
            estado.deConductores.forEach { d ->
                AccesoAFoto(
                    titulo = "ATS del conductor · " + (d.placa ?: "vehículo"),
                    detalle = "Hoy: " + d.estadoLegible + ". Antes de mover el vehículo.",
                    alTocar = { d.vehiculoId?.let(alFotografiarConductor) },
                )
            }

            AccesoAFoto(
                titulo = "PETAR (si hubo trabajo de alto riesgo)",
                detalle = estado.petar?.let { "Hoy: " + it.estadoLegible } ?: "Opcional: la foto del permiso firmado.",
                alTocar = alFotografiarPetar,
            )

            if (estado.hechosHoy.isNotEmpty()) {
                Text(
                    "Llenados en el celular",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 4.dp),
                )
                estado.hechosHoy.forEach { a ->
                    val noApto = a.kind == "conductor" && a.apto == false
                    Aviso(
                        buildString {
                            append(if (a.kind == "conductor") "Conductor" else "Cuadrilla")
                            a.placa?.let { append(" · $it") }
                            append(" · ${a.firmas} ")
                            append(if (a.firmas == 1) "firma" else "firmas")
                            if (noApto) append(" · NO APTO")
                        },
                        if (noApto) MaterialTheme.colorScheme.error else Marca.VerdeBandera,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
internal fun Aviso(texto: String, color: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(texto, style = MaterialTheme.typography.bodySmall, color = color)
    }
}
