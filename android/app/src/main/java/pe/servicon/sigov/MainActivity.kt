package pe.servicon.sigov

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import android.app.Activity
import androidx.activity.SystemBarStyle
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.currentBackStackEntryAsState
import pe.servicon.sigov.ui.acceso.PantallaAcceso
import pe.servicon.sigov.ui.componentes.BarraInferior
import pe.servicon.sigov.ui.componentes.BarraViewModel
import pe.servicon.sigov.ui.componentes.SeccionInferior
import pe.servicon.sigov.ui.perfil.PantallaPerfil
import pe.servicon.sigov.ui.sync.PantallaSincronizacion
import pe.servicon.sigov.ui.theme.Fondo
import pe.servicon.sigov.ui.acceso.PantallaArranque
import pe.servicon.sigov.ui.ast.PantallaAst
import pe.servicon.sigov.ui.avance.PantallaAvance
import pe.servicon.sigov.ui.caja.PantallaCaja
import pe.servicon.sigov.ui.charlas.PantallaCharlas
import pe.servicon.sigov.ui.evidencia.PantallaCamara
import pe.servicon.sigov.ui.evidencia.PantallaGaleria
import pe.servicon.sigov.ui.inicio.PantallaJornada
import pe.servicon.sigov.ui.materiales.PantallaMateriales
import pe.servicon.sigov.ui.parte.PantallaParte
import pe.servicon.sigov.ui.ssoma.PantallaEquipos
import pe.servicon.sigov.ui.ssoma.PantallaVehiculos
import pe.servicon.sigov.ui.pci.PantallaPci
import pe.servicon.sigov.ui.programacion.PantallaProgramacion
import pe.servicon.sigov.ui.theme.SigovTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // La cabecera de marca es blanca: los iconos del sistema tienen que
        // ir en oscuro o desaparecen.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
        )
        setContent {
            SigovTheme {
                // Se reafirma dentro de la composición: el tema de Compose
                // vuelve a tocar la ventana al montarse y, si se fija solo en
                // onCreate, los iconos quedan blancos sobre la cabecera
                // blanca y el reloj desaparece.
                val ventana = (LocalView.current.context as Activity).window
                SideEffect {
                    WindowCompat.getInsetsController(ventana, ventana.decorView)
                        .isAppearanceLightStatusBars = true
                }
                val nav = rememberNavController()
                val pila by nav.currentBackStackEntryAsState()
                val ruta = pila?.destination?.route
                val barra: BarraViewModel = hiltViewModel()
                val pendientes by barra.pendientes.collectAsStateWithLifecycle(0)

                // La barra inferior solo aparece en las cuatro secciones que
                // dibujó Elvis; en las pantallas de detalle estorba, porque
                // ahí lo que hace falta es volver.
                val seccion = SeccionInferior.entries.firstOrNull { it.ruta == ruta }

                Scaffold(
                    bottomBar = {
                        if (seccion != null) {
                            BarraInferior(
                                actual = seccion,
                                pendientes = pendientes,
                                alIr = { destino ->
                                    if (destino != seccion) {
                                        nav.navigate(destino.ruta) {
                                            // Sin apilar: se salta entre
                                            // secciones, no se entra en ellas.
                                            popUpTo("jornada") { inclusive = false }
                                            launchSingleTop = true
                                        }
                                    }
                                },
                            )
                        }
                    },
                    containerColor = Fondo,
                ) { relleno ->
                NavHost(
                    navController = nav,
                    startDestination = "arranque",
                    modifier = Modifier.padding(relleno),
                ) {
                    composable("arranque") {
                        PantallaArranque(
                            alEntrar = {
                                nav.navigate("jornada") {
                                    popUpTo("arranque") { inclusive = true }
                                }
                            },
                            alPedirAcceso = {
                                nav.navigate("acceso") {
                                    popUpTo("arranque") { inclusive = true }
                                }
                            },
                        )
                    }
                    composable("acceso") {
                        PantallaAcceso(
                            alEntrar = {
                                nav.navigate("jornada") {
                                    popUpTo("acceso") { inclusive = true }
                                }
                            },
                        )
                    }
                    composable("jornada") {
                        PantallaJornada(
                            alSalir = {
                                nav.navigate("acceso") {
                                    popUpTo("jornada") { inclusive = true }
                                }
                            },
                            alAbrirParte = { nav.navigate("parte") },
                            alAbrirProgramacion = { nav.navigate("programacion") },
                            alAbrirPci = { nav.navigate("pci") },
                            alAbrirCaja = { nav.navigate("caja") },
                            alAbrirEvidencias = { nav.navigate("evidencias") },
                            alAbrirMateriales = { nav.navigate("materiales") },
                            alAbrirEquipos = { nav.navigate("equipos") },
                            alAbrirVehiculos = { nav.navigate("vehiculos") },
                            alAbrirCharlas = { nav.navigate("charlas") },
                            alAbrirAst = { nav.navigate("ast") },
                            alAbrirAvance = { nav.navigate("avance") },
                            alAbrirSincronizacion = { nav.navigate("sincronizacion") },
                        )
                    }
                    composable("programacion") {
                        PantallaProgramacion(alVolver = { nav.popBackStack() })
                    }
                    composable("pci") {
                        PantallaPci(alVolver = { nav.popBackStack() })
                    }
                    composable("charlas") {
                        PantallaCharlas(alVolver = { nav.popBackStack() })
                    }
                    composable("vehiculos") {
                        PantallaVehiculos(alVolver = { nav.popBackStack() })
                    }
                    composable("equipos") {
                        PantallaEquipos(alVolver = { nav.popBackStack() })
                    }
                    composable("materiales") {
                        PantallaMateriales(alVolver = { nav.popBackStack() })
                    }
                    composable("evidencias") {
                        PantallaGaleria(alVolver = { nav.popBackStack() })
                    }
                    composable("trabajos") {
                        PantallaProgramacion(alVolver = { nav.popBackStack() })
                    }
                    composable("perfil") {
                        PantallaPerfil(
                            alSalir = {
                                nav.navigate("acceso") {
                                    popUpTo(0) { inclusive = true }
                                }
                            },
                        )
                    }
                    composable("caja") {
                        PantallaCaja(alVolver = { nav.popBackStack() })
                    }
                    composable("ast") {
                        PantallaAst(alVolver = { nav.popBackStack() })
                    }
                    composable("avance") {
                        PantallaAvance(alVolver = { nav.popBackStack() })
                    }
                    composable("sincronizacion") {
                        PantallaSincronizacion(alVolver = { nav.popBackStack() })
                    }
                    composable("parte") {
                        PantallaParte(
                            alVolver = { nav.popBackStack() },
                            alTomarEvidencia = { registroId -> nav.navigate("evidencia/" + registroId) },
                        )
                    }
                    composable(
                        "evidencia/{registro}",
                        arguments = listOf(navArgument("registro") { type = NavType.StringType }),
                    ) { entrada ->
                        PantallaCamara(
                            registroClientId = entrada.arguments?.getString("registro").orEmpty(),
                            alVolver = { nav.popBackStack() },
                        )
                    }
                }
                }
            }
        }
    }
}
