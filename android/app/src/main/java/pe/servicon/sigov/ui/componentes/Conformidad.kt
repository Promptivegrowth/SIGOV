package pe.servicon.sigov.ui.componentes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import pe.servicon.sigov.ui.theme.Marca
import pe.servicon.sigov.ui.theme.Semaforo

/**
 * Conforme o no conforme, dicho con palabras.
 *
 * Un interruptor azul junto a «Marca lo que NO está conforme» se leía al
 * revés: encendido parecía «está bien» y quería decir lo contrario
 * (OBS-69). Dos botones con su texto y su color no admiten dos lecturas.
 */
@Composable
fun ConformeONo(
    conforme: Boolean,
    alCambiar: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilterChip(
            selected = conforme,
            onClick = { alCambiar(true) },
            label = { Text("Conforme") },
            leadingIcon = { Icon(Icons.Outlined.CheckCircle, null, Modifier.size(18.dp)) },
            shape = RoundedCornerShape(16.dp),
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = Marca.VerdeBandera.copy(alpha = 0.16f),
                selectedLabelColor = Marca.VerdeBandera,
                selectedLeadingIconColor = Marca.VerdeBandera,
            ),
        )
        FilterChip(
            selected = !conforme,
            onClick = { alCambiar(false) },
            label = { Text("No conforme") },
            leadingIcon = { Icon(Icons.Outlined.Cancel, null, Modifier.size(18.dp)) },
            shape = RoundedCornerShape(16.dp),
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = Semaforo.Urgente.copy(alpha = 0.14f),
                selectedLabelColor = Semaforo.Urgente,
                selectedLeadingIconColor = Semaforo.Urgente,
            ),
        )
    }
}
