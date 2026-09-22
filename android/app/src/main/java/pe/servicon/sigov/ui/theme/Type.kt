package pe.servicon.sigov.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import pe.servicon.sigov.R

/**
 * Dos tipografías con oficios distintos.
 *
 * **Saira** para los títulos: es geométrica y de corte recto, la más cercana
 * al trazo angular del wordmark SERVICON sin caer en lo ilegible.
 *
 * **Inter** para el cuerpo, los datos y los formularios: está dibujada para
 * leerse en pantalla, que es lo que importa cuando el capataz mira el celular
 * con guantes y bajo el sol.
 *
 * Ambas son fuentes variables, así que un solo archivo cubre todos los pesos.
 */
@OptIn(ExperimentalTextApi::class)
private fun saira(peso: Int) = Font(
    R.font.saira,
    FontWeight(peso),
    variationSettings = FontVariation.Settings(FontVariation.weight(peso)),
)

@OptIn(ExperimentalTextApi::class)
private fun inter(peso: Int) = Font(
    R.font.inter,
    FontWeight(peso),
    variationSettings = FontVariation.Settings(FontVariation.weight(peso)),
)

val Titulos = FontFamily(
    saira(400), saira(500), saira(600), saira(700),
)

val Cuerpo = FontFamily(
    inter(400), inter(500), inter(600), inter(700),
)

val TipografiaSigov = Typography(
    // ── Títulos: Saira ────────────────────────────────────────────────────
    displayLarge = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.Bold,
        fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.4).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.Bold,
        fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.3).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.Bold,
        fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = (-0.2).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp, lineHeight = 26.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp, lineHeight = 24.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp, lineHeight = 23.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Titulos, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = 21.sp,
    ),

    // ── Cuerpo y datos: Inter ─────────────────────────────────────────────
    titleSmall = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp, lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.Normal,
        fontSize = 16.sp, lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.Normal,
        fontSize = 14.sp, lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.Normal,
        fontSize = 12.5f.sp, lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp, lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.Medium,
        fontSize = 13.sp, lineHeight = 18.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = Cuerpo, fontWeight = FontWeight.Medium,
        fontSize = 11.sp, lineHeight = 15.sp, letterSpacing = 0.4.sp,
    ),
)
