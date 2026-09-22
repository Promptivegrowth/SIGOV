package pe.servicon.sigov.ui.ast

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.datos.AptitudDelConductor
import pe.servicon.sigov.datos.MiembroDeCuadrilla
import pe.servicon.sigov.datos.Peligro
import pe.servicon.sigov.datos.Vehiculo
import pe.servicon.sigov.ui.charlas.PizarraDeFirma
import pe.servicon.sigov.ui.charlas.recordarControlDeFirma
import pe.servicon.sigov.ui.componentes.ArmazonDeApartado
import pe.servicon.sigov.ui.theme.Marca

/**
 * El análisis de seguridad, antes de empezar.
 *
 * Dos documentos distintos que la especificación pide por separado: el del
 * conductor, que se responde antes de mover la camioneta, y el de la
 * cuadrilla, que se hace al pie del trabajo con la firma de cada uno.
 *
 * El orden en pantalla es el orden en obra: si el conductor no está en
 * condiciones, la cuadrilla no llega al frente y lo demás sobra.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaAst(
    vm: AstViewModel = hiltViewModel(),
    alVolver: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val avisos = remember { SnackbarHostState() }
    var formulario by remember { mutableStateOf<Formulario?>(null) }

    LaunchedEffect(estado.aviso, estado.error) {
        (estado.error ?: estado.aviso)?.let {
            avisos.showSnackbar(it)
            vm.avisoVisto()
        }
    }

    when (val f = formulario) {
        Formulario.CONDUCTOR -> FormularioDeConductor(
            vehiculos = estado.vehiculos,
            guardando = estado.guardando,
            alCerrar = { formulario = null },
            alGuardar = { vehiculo, aptitud, firma, nombre ->
                vm.registrarDeConductor(vehiculo, aptitud, firma, nombre) { formulario = null }
            },
        )
        Formulario.CUADRILLA -> FormularioDeCuadrilla(
            integrantes = estado.integrantes,
            guardando = estado.guardando,
            alCerrar = { formulario = null },
            alGuardar = { tarea, lugar, peligros, epp, riesgo, firmas ->
                vm.registrarDeCuadrilla(tarea, lugar, peligros, epp, riesgo, firmas) {
                    formulario = null
                }
            },
        )
        null -> Unit
    }

    ArmazonDeApartado(
        titulo = "AST",
        seccion = "Apartado 4.9",
        alVolver = alVolver,
        cuadrilla = estado.cuadrilla.ifBlank { null },
        ayuda = "El análisis de seguridad antes de empezar la jornada.",
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
            estado.error?.let {
                Aviso(it, MaterialTheme.colorScheme.error)
            }

            Tarjeta(
                icono = Icons.Outlined.DirectionsCar,
                titulo = "AST del conductor",
                detalle = "Antes de mover la camioneta: descanso, alcohol, licencia y estado del vehículo.",
                hecho = estado.deConductorHecho,
                color = Marca.Azul,
                habilitado = estado.vehiculos.isNotEmpty(),
                sinHabilitar = "Tu cuadrilla no tiene vehículo asignado.",
                alTocar = { formulario = Formulario.CONDUCTOR },
            )

            Tarjeta(
                icono = Icons.Outlined.Groups,
                titulo = "AST de la cuadrilla",
                detalle = "Al pie del trabajo: peligros, controles, EPP y la firma de cada uno.",
                hecho = estado.deCuadrillaHecho,
                color = Marca.VerdeBandera,
                habilitado = estado.integrantes.isNotEmpty(),
                sinHabilitar = "Tu cuadrilla no tiene integrantes registrados.",
                alTocar = { formulario = Formulario.CUADRILLA },
            )

            if (estado.hechosHoy.isNotEmpty()) {
                Text(
                    "Hechos hoy",
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

private enum class Formulario { CONDUCTOR, CUADRILLA }

@Composable
private fun Tarjeta(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    titulo: String,
    detalle: String,
    hecho: Boolean,
    color: Color,
    habilitado: Boolean,
    sinHabilitar: String,
    alTocar: () -> Unit,
) {
    Card(
        onClick = alTocar,
        enabled = habilitado,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = CardDefaults.outlinedCardBorder(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                Modifier
                    .size(46.dp)
                    .background(color.copy(alpha = 0.12f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icono, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(titulo, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    if (habilitado) detalle else sinHabilitar,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (hecho) {
                Icon(
                    Icons.Outlined.CheckCircle,
                    contentDescription = "Ya hecho hoy",
                    tint = Marca.VerdeBandera,
                    modifier = Modifier.size(26.dp),
                )
            }
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
