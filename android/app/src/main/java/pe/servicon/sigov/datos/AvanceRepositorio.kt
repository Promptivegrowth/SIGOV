package pe.servicon.sigov.datos

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pe.servicon.sigov.datos.local.CatalogoDao
import pe.servicon.sigov.datos.local.FilaCatalogo
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import javax.inject.Inject
import javax.inject.Singleton

/** La programación del periodo, partida por partida según su estado. */
@Serializable
data class AvanceSemana(
    val asignadas: Int = 0,
    val ejecutadas: Int = 0,
    @SerialName("por_validar") val porValidar: Int = 0,
    @SerialName("en_ejecucion") val enEjecucion: Int = 0,
    val pendientes: Int = 0,
    val atrasadas: Int = 0,
    val suspendidas: Int = 0,
) {
    val porcentaje: Double get() = if (asignadas == 0) 0.0 else ejecutadas * 100.0 / asignadas
}

@Serializable
data class AvanceDia(val fecha: String, val asignadas: Int = 0, val ejecutadas: Int = 0)

/** Los ítems PCI de la cuadrilla: lo abierto, lo levantado y los plazos. */
@Serializable
data class AvancePci(
    val documentos: Int = 0,
    val items: Int = 0,
    val pendientes: Int = 0,
    @SerialName("en_atencion") val enAtencion: Int = 0,
    val observados: Int = 0,
    val levantados: Int = 0,
    val conformes: Int = 0,
    @SerialName("vence_hoy") val venceHoy: Int = 0,
    @SerialName("por_vencer") val porVencer: Int = 0,
    val vencidos: Int = 0,
    @SerialName("proximo_vencimiento") val proximoVencimiento: String? = null,
)

/** Los registros del periodo y si sus fotos alcanzan. */
@Serializable
data class AvanceEvidencias(
    val registros: Int = 0,
    val fotos: Int = 0,
    val completas: Int = 0,
    val incompletas: Int = 0,
    @SerialName("sin_fotos") val sinFotos: Int = 0,
    @SerialName("faltan_fotos") val faltanFotos: Int = 0,
    @SerialName("sin_despues") val sinDespues: Int = 0,
)

@Serializable
data class AvanceGastos(
    val total: Double = 0.0,
    val cantidad: Int = 0,
    @SerialName("por_revisar") val porRevisar: Int = 0,
    val observados: Int = 0,
    val depositos: Double = 0.0,
    val saldo: Double? = null,
)

@Serializable
data class AvanceSolicitudes(
    @SerialName("depositos_abiertas") val depositosAbiertas: Int = 0,
    @SerialName("depositos_observadas") val depositosObservadas: Int = 0,
    @SerialName("depositos_atendidas") val depositosAtendidas: Int = 0,
    @SerialName("materiales_abiertos") val materialesAbiertos: Int = 0,
    @SerialName("materiales_borrador") val materialesBorrador: Int = 0,
)

/** La respuesta de `mi_avance`: todo el resumen en una sola llamada. */
@Serializable
data class ResumenAvance(
    val desde: String,
    val hasta: String,
    val calculado: String? = null,
    val semana: AvanceSemana = AvanceSemana(),
    val dias: List<AvanceDia> = emptyList(),
    val pci: AvancePci = AvancePci(),
    val evidencias: AvanceEvidencias = AvanceEvidencias(),
    val gastos: AvanceGastos = AvanceGastos(),
    val solicitudes: AvanceSolicitudes = AvanceSolicitudes(),
)

/** El resumen y si viene de la nube o de la copia guardada. */
data class ResumenConOrigen(val resumen: ResumenAvance, val fresco: Boolean, val guardadoEn: Long)

/**
 * El resumen de Mi Avance (OBS-49).
 *
 * Una sola llamada a la base, y la última respuesta queda en el celular: el
 * capataz mira su avance donde no hay señal y prefiere ver el de hace un rato
 * —con su hora— a una pantalla en blanco.
 */
@Singleton
class AvanceRepositorio @Inject constructor(
    private val supabase: SupabaseClient,
    private val catalogo: CatalogoDao,
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    suspend fun resumen(servicioId: String, cuadrillaId: String, desde: LocalDate, hasta: LocalDate): ResumenConOrigen? =
        withContext(Dispatchers.IO) {
            val llave = "$cuadrillaId:$desde"
            runCatching {
                val fila: JsonObject = supabase.postgrest
                    .rpc("mi_avance", buildJsonObject {
                        put("p_crew_id", cuadrillaId)
                        put("p_desde", desde.toString())
                        put("p_hasta", hasta.toString())
                    })
                    .decodeAs()
                val ahora = System.currentTimeMillis()
                catalogo.guardar(listOf(FilaCatalogo("mi_avance", llave, servicioId, fila.toString(), ahora)))
                ResumenConOrigen(json.decodeFromString<ResumenAvance>(fila.toString()), fresco = true, guardadoEn = ahora)
            }.getOrElse {
                catalogo.de("mi_avance", servicioId)
                    .firstOrNull { it.id == llave }
                    ?.let { f ->
                        runCatching { json.decodeFromString<ResumenAvance>(f.datos) }.getOrNull()
                            ?.let { ResumenConOrigen(it, fresco = false, guardadoEn = f.bajadoEn) }
                    }
            }
        }

    companion object {
        /** La semana de programación: de lunes a domingo, como la de COVINCA. */
        fun semanaDe(dia: LocalDate): Pair<LocalDate, LocalDate> {
            val lunes = dia.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            return lunes to lunes.plusDays(6)
        }
    }
}
