package pe.servicon.sigov.datos

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * El punto de una progresiva sobre el trazado oficial del tramo, calculado
 * en el teléfono y sin señal. Sigue la misma regla que la base
 * (`ST_LineInterpolatePoint` con `fraccion_calibrada`, 0122): entre dos
 * hitos kilométricos, la progresiva se reparte según dónde caen los hitos
 * sobre la línea. Sin hitos, el reparto es parejo del inicio al fin.
 */
object Trazado {

    /** (latitud, longitud) de la progresiva, o null si el tramo no trae trazado. */
    fun punto(tramo: Tramo, metros: Double): Pair<Double, Double>? {
        val coordenadas = ((tramo.geom as? JsonObject)?.get("coordinates") as? JsonArray) ?: return null
        val puntos = coordenadas.mapNotNull { c ->
            val par = runCatching { c.jsonArray }.getOrNull() ?: return@mapNotNull null
            val lng = par.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val lat = par.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            lng to lat
        }
        if (puntos.size < 2 || tramo.progresivaFin <= tramo.progresivaInicio) return null
        val fraccion = fraccion(tramo, metros).coerceIn(0.001, 0.999)

        // Como la base: longitudes en grados, sobre el plano
        val tramos = puntos.zipWithNext { a, b -> sqrt((b.first - a.first).let { it * it } + (b.second - a.second).let { it * it }) }
        var falta = tramos.sum() * fraccion
        tramos.forEachIndexed { i, largo ->
            if (falta <= largo || i == tramos.lastIndex) {
                val t = if (largo == 0.0) 0.0 else (falta / largo).coerceIn(0.0, 1.0)
                val (a, b) = puntos[i] to puntos[i + 1]
                return (a.second + (b.second - a.second) * t) to (a.first + (b.first - a.first) * t)
            }
            falta -= largo
        }
        return null
    }

    /** La fracción del trazo que corresponde a la progresiva, calibrada con los hitos. */
    fun fraccion(tramo: Tramo, metros: Double): Double {
        val calibracion = (tramo.calibracion as? JsonArray)?.mapNotNull { p ->
            val par = runCatching { p.jsonArray }.getOrNull() ?: return@mapNotNull null
            val progresiva = par.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val fraccion = par.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            progresiva to fraccion
        }.orEmpty()
        if (calibracion.size < 2 || metros <= calibracion.first().first || metros >= calibracion.last().first) {
            return ((metros - tramo.progresivaInicio) / (tramo.progresivaFin - tramo.progresivaInicio)).coerceIn(0.0, 1.0)
        }
        // El último punto con progresiva <= metros, y el siguiente
        var bajo = 0
        var alto = calibracion.lastIndex
        while (alto - bajo > 1) {
            val medio = (bajo + alto) / 2
            if (calibracion[medio].first <= metros) bajo = medio else alto = medio
        }
        val (pa, fa) = calibracion[bajo]
        val (pb, fb) = calibracion[alto]
        if (pb == pa) return fa
        return (fa + (fb - fa) * (metros - pa) / (pb - pa)).coerceIn(0.0, 1.0)
    }

    /** Metros entre dos puntos (haversine). */
    fun distancia(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }
}
