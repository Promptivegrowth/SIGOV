package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.ui.theme.Fondo

/**
 * El armazón de un apartado.
 *
 * Todas las pantallas del documento tienen la misma estructura: cabecera de
 * marca, título con su número de sección, una línea de ayuda y el contenido.
 * Tenerlo en un solo sitio evita que cada pantalla lo repita distinto —que es
 * justo lo que había pasado— y deja los ajustes de margen en un único lugar.
 */
@Composable
fun ArmazonDeApartado(
    titulo: String,
    seccion: String,
    alVolver: (() -> Unit)? = null,
    persona: String? = null,
    cuadrilla: String? = null,
    ayuda: String? = null,
    avisos: SnackbarHostState? = null,
    botonFlotante: @Composable () -> Unit = {},
    acciones: @Composable RowScope.() -> Unit = {},
    contenido: @Composable (PaddingValues) -> Unit,
) {
    Surface(color = Fondo, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            CabeceraDeMarca()
            EncabezadoDeApartado(
                titulo = titulo,
                seccion = seccion,
                persona = persona,
                cuadrilla = cuadrilla,
                alVolver = alVolver,
                acciones = acciones,
            )

            Scaffold(
                containerColor = Fondo,
                snackbarHost = { avisos?.let { SnackbarHost(it) } },
                floatingActionButton = botonFlotante,
                // Los bordes del sistema ya los reservó el armazón general:
                // volver a reservarlos aquí deja franjas vacías.
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
            ) { relleno ->
                Column(Modifier.fillMaxSize().padding(relleno)) {
                    ayuda?.let {
                        AvisoInformativo(
                            it,
                            Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        )
                    }
                    contenido(PaddingValues(0.dp))
                }
            }
        }
    }
}
