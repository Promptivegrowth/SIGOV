package pe.servicon.sigov.ui.acceso

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pe.servicon.sigov.R
import pe.servicon.sigov.ui.theme.Marca

/**
 * El acceso a SIGOV.
 *
 * Campos grandes y botón alto: esta pantalla se abre a las seis de la mañana,
 * a la intemperie y muchas veces con guantes puestos.
 */
@Composable
fun PantallaAcceso(
    vm: AccesoViewModel = hiltViewModel(),
    alEntrar: () -> Unit,
) {
    val estado by vm.estado.collectAsStateWithLifecycle()
    val teclado = LocalSoftwareKeyboardController.current
    val foco = LocalFocusManager.current
    var verContrasena by remember { mutableStateOf(false) }

    LaunchedEffect(estado.entro) {
        if (estado.entro) alEntrar()
    }

    Surface(color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(64.dp))

            Image(
                painter = painterResource(R.drawable.logo_servicon),
                contentDescription = "Grupo Servicon",
                modifier = Modifier.fillMaxWidth(0.76f),
            )

            Spacer(Modifier.height(28.dp))

            Text(
                "SIGOV",
                style = MaterialTheme.typography.displayMedium,
                color = Marca.Azul,
            )
            Text(
                "Gestión operativa vial",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(36.dp))

            OutlinedTextField(
                value = estado.correo,
                onValueChange = vm::correoCambio,
                label = { Text("Correo") },
                leadingIcon = { Icon(Icons.Outlined.Mail, contentDescription = null) },
                singleLine = true,
                enabled = !estado.cargando,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(onNext = { foco.moveFocus(FocusDirection.Down) }),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 62.dp),
            )

            Spacer(Modifier.height(14.dp))

            OutlinedTextField(
                value = estado.contrasena,
                onValueChange = vm::contrasenaCambio,
                label = { Text("Contraseña") },
                leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
                trailingIcon = {
                    IconButton(onClick = { verContrasena = !verContrasena }) {
                        Icon(
                            if (verContrasena) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (verContrasena) "Ocultar" else "Ver la contraseña",
                        )
                    }
                },
                singleLine = true,
                enabled = !estado.cargando,
                visualTransformation = if (verContrasena) VisualTransformation.None
                    else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { teclado?.hide(); vm.entrar() }),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 62.dp),
            )

            if (estado.error != null) {
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.errorContainer,
                            RoundedCornerShape(12.dp),
                        )
                        .padding(14.dp),
                ) {
                    Text(
                        estado.error!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = { teclado?.hide(); vm.entrar() },
                enabled = !estado.cargando && estado.correo.isNotBlank() && estado.contrasena.isNotBlank(),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),
            ) {
                if (estado.cargando) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.5.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Entrar", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(32.dp))

            Text(
                "Grupo Servicon V&D EIRL",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
