package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.ZoomOutMap
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.Point
import pe.servicon.sigov.ui.theme.Marca

/**
 * Los dos botones de los mapas de campo (Elvis, 26/10): «Mi ubicación»,
 * como en Google Maps, para saber si uno está cerca del punto, y «Ver
 * todo», para volver a encuadrar después de acercarse a un elemento.
 */
@Composable
fun ControlesDeMapa(
    buscando: Boolean,
    alMiUbicacion: () -> Unit,
    alVerTodo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SmallFloatingActionButton(onClick = alMiUbicacion, shape = CircleShape, containerColor = Color.White, contentColor = Marca.Azul) {
            if (buscando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Marca.Azul)
            else Icon(Icons.Outlined.MyLocation, contentDescription = "Mi ubicación")
        }
        SmallFloatingActionButton(onClick = alVerTodo, shape = CircleShape, containerColor = Color.White, contentColor = Marca.Azul) {
            Icon(Icons.Outlined.ZoomOutMap, contentDescription = "Ver todo")
        }
    }
}

private const val FUENTE_YO = "src-yo"

/** El punto azul de donde está el teléfono, y la cámara hacia él. */
fun MapLibreMap.mostrarMiUbicacion(lat: Double, lng: Double, acercar: Boolean = true) {
    getStyle { estilo ->
        val rasgo = Feature.fromGeometry(Point.fromLngLat(lng, lat))
        val fuente = estilo.getSourceAs<GeoJsonSource>(FUENTE_YO)
        if (fuente == null) {
            estilo.addSource(GeoJsonSource(FUENTE_YO, rasgo))
            estilo.addLayer(CircleLayer("capa-yo-halo", FUENTE_YO).withProperties(
                PropertyFactory.circleRadius(18f),
                PropertyFactory.circleColor("#2563EB"),
                PropertyFactory.circleOpacity(0.18f),
            ))
            estilo.addLayer(CircleLayer("capa-yo", FUENTE_YO).withProperties(
                PropertyFactory.circleRadius(7f),
                PropertyFactory.circleColor("#2563EB"),
                PropertyFactory.circleStrokeWidth(3f),
                PropertyFactory.circleStrokeColor("#FFFFFF"),
            ))
        } else fuente.setGeoJson(rasgo)
    }
    if (acercar) animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), 15.0), 700)
}

/** Acercarse a un elemento elegido en la lista. */
fun MapLibreMap.irA(lat: Double, lng: Double) =
    animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), 16.0), 700)

/**
 * Lo que la pantalla le pide al mapa desde fuera: acercarse a un elemento
 * de la lista, volver a encuadrar todo o mostrar dónde está uno.
 */
class ControlDeMapa {
    var mapa: MapLibreMap? = null
    /** Lo que se está mostrando, para «Ver todo». */
    var limites: org.maplibre.android.geometry.LatLngBounds? = null

    fun irA(lat: Double, lng: Double) { mapa?.irA(lat, lng) }

    fun verTodo() {
        val m = mapa ?: return
        limites?.let { runCatching { m.animateCamera(CameraUpdateFactory.newLatLngBounds(it, 50), 700) } }
    }

    fun miUbicacion(lat: Double, lng: Double) { mapa?.mostrarMiUbicacion(lat, lng) }
}
