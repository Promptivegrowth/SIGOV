package pe.servicon.sigov

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import pe.servicon.sigov.ui.acceso.PantallaAcceso
import pe.servicon.sigov.ui.inicio.PantallaJornada
import pe.servicon.sigov.ui.theme.SigovTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SigovTheme {
                val nav = rememberNavController()
                NavHost(navController = nav, startDestination = "acceso") {
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
                        )
                    }
                }
            }
        }
    }
}
