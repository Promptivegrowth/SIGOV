package pe.servicon.sigov.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * El tema de SIGOV, construido sobre los colores de Grupo Servicon.
 *
 * No se usa el color dinámico de Android 12: la aplicación se entrega a un
 * cliente y tiene que verse igual en todos los equipos de la obra, no cambiar
 * según el fondo de pantalla de cada capataz.
 */
private val EsquemaClaro = lightColorScheme(
    primary = AzulPrincipal,
    onPrimary = Marca.Blanco,
    primaryContainer = AzulSuave,
    onPrimaryContainer = AzulOscuro,

    secondary = VerdePrincipal,
    onSecondary = Marca.Blanco,
    secondaryContainer = VerdeSuave,
    onSecondaryContainer = VerdeOscuro,

    tertiary = NaranjaPrincipal,
    onTertiary = Marca.Blanco,
    tertiaryContainer = NaranjaSuave,
    onTertiaryContainer = NaranjaOscuro,

    error = RojoPrincipal,
    onError = Marca.Blanco,
    errorContainer = RojoSuave,
    onErrorContainer = Color(0xFF8E1F1F),

    background = Fondo,
    onBackground = Tinta,
    surface = Superficie,
    onSurface = Tinta,
    surfaceVariant = Color(0xFFEFF3F9),
    onSurfaceVariant = TintaSuave,
    outline = Borde,
    outlineVariant = Color(0xFFE8EDF4),
)

private val EsquemaOscuro = darkColorScheme(
    primary = Color(0xFF7FA0E8),
    onPrimary = Color(0xFF041C48),
    primaryContainer = Color(0xFF123167),
    onPrimaryContainer = Color(0xFFD6E1FA),

    secondary = VerdePrincipal,
    onSecondary = Color(0xFF13290A),
    secondaryContainer = Color(0xFF2C4A19),
    onSecondaryContainer = Color(0xFFDCF0CB),

    tertiary = Color(0xFFFF8A4C),
    onTertiary = Color(0xFF3F1703),
    tertiaryContainer = Color(0xFF6B2A08),
    onTertiaryContainer = Color(0xFFFFDBC9),

    error = Color(0xFFFF6B6B),
    onError = Color(0xFF4A0E0E),

    background = FondoOscuro,
    onBackground = TintaClara,
    surface = SuperficieOscura,
    onSurface = TintaClara,
    surfaceVariant = Color(0xFF1C2941),
    onSurfaceVariant = Color(0xFFA9B6CC),
    outline = BordeOscuro,
    outlineVariant = Color(0xFF1F2B42),
)

@Composable
fun SigovTheme(
    oscuro: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val esquema = if (oscuro) EsquemaOscuro else EsquemaClaro
    val vista = LocalView.current

    if (!vista.isInEditMode) {
        SideEffect {
            val ventana = (vista.context as Activity).window
            // La barra de estado acompaña al azul de la marca
            ventana.statusBarColor = (if (oscuro) FondoOscuro else AzulPrincipal).value.toInt()
            ventana.navigationBarColor = (if (oscuro) FondoOscuro else Superficie).value.toInt()
            WindowCompat.getInsetsController(ventana, vista).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = !oscuro
            }
        }
    }

    MaterialTheme(
        colorScheme = esquema,
        typography = TipografiaSigov,
        content = content,
    )
}
