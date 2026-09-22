package pe.servicon.sigov.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Los colores salen del propio logo de Grupo Servicon, muestreados del
 * archivo original: el azul del wordmark, el verde y el naranja del símbolo,
 * y el verde bandera de la barra inferior.
 */
object Marca {
    val Azul = Color(0xFF072D70)
    val Verde = Color(0xFF6BB43B)
    val Naranja = Color(0xFFF96414)
    val VerdeBandera = Color(0xFF019D3F)
    val Blanco = Color(0xFFFFFFFF)
}

// ─── Azul: color principal, el del wordmark ───────────────────────────────
val AzulPrincipal = Marca.Azul
val AzulClaro = Color(0xFF2B4E9B)
val AzulOscuro = Color(0xFF041C48)
val AzulSuave = Color(0xFFE7ECF7)

// ─── Verde: confirmaciones y avance ───────────────────────────────────────
val VerdePrincipal = Marca.Verde
val VerdeOscuro = Marca.VerdeBandera
val VerdeSuave = Color(0xFFEDF6E4)

// ─── Naranja: lo que reclama atención sin ser todavía un error ────────────
val NaranjaPrincipal = Marca.Naranja
val NaranjaOscuro = Color(0xFFC44B0C)
val NaranjaSuave = Color(0xFFFEEDE3)

// ─── Rojo: solo para lo que de verdad está mal ────────────────────────────
val RojoPrincipal = Color(0xFFD32F2F)
val RojoSuave = Color(0xFFFDEAEA)

// ─── Neutros ──────────────────────────────────────────────────────────────
val Tinta = Color(0xFF0F172A)
val TintaSuave = Color(0xFF475569)
val Borde = Color(0xFFDDE3EC)
val Fondo = Color(0xFFF6F8FB)
val Superficie = Color(0xFFFFFFFF)

// ─── Tema oscuro: para la noche y para ahorrar batería en campo ───────────
val FondoOscuro = Color(0xFF0B1220)
val SuperficieOscura = Color(0xFF141E33)
val BordeOscuro = Color(0xFF26324B)
val TintaClara = Color(0xFFE8EDF6)

/**
 * El semáforo de plazos de PCI, igual que en la web administrativa:
 * verde en plazo, ámbar por vencer, naranja urgente, rojo vencido.
 */
object Semaforo {
    val EnPlazo = Marca.VerdeBandera
    val PorVencer = Color(0xFFE0A400)
    val Urgente = Marca.Naranja
    val Vencido = Color(0xFFC62828)
    val Levantado = Marca.Verde
}
