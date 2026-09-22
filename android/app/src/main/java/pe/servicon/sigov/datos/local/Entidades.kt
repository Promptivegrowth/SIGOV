package pe.servicon.sigov.datos.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Lo que la aplicación guarda en el propio equipo.
 *
 * En carretera la señal va y viene, así que **nada se registra contra la nube
 * directamente**: todo entra primero aquí y una cola se encarga de subirlo
 * cuando hay conexión. Si el celular se queda sin batería a mitad de la
 * jornada, el trabajo del día sigue estando al encenderlo.
 */

/** Estado de un envío pendiente. */
enum class EstadoEnvio { PENDIENTE, ENVIANDO, ENVIADO, ERROR }

/**
 * La cola de envío.
 *
 * Cada fila es «esto hay que subirlo a tal tabla». El `clientId` viaja con el
 * registro y es lo que evita duplicados: si el envío se repite por un corte,
 * en la nube queda una sola fila.
 */
@Entity(
    tableName = "cola",
    indices = [Index("estado"), Index("creadoEn")],
)
data class EnvioPendiente(
    @PrimaryKey val clientId: String,
    val tabla: String,
    val cuerpo: String,                     // el registro, en JSON
    val etiqueta: String,                   // lo que se le muestra al usuario
    val dependeDe: String? = null,          // el padre que debe subir antes
    val estado: EstadoEnvio = EstadoEnvio.PENDIENTE,
    val intentos: Int = 0,
    val proximoIntento: Long = 0,
    val ultimoError: String? = null,
    val idEnServidor: String? = null,
    val creadoEn: Long = System.currentTimeMillis(),
    val enviadoEn: Long? = null,
)

/**
 * Un archivo que acompaña a un envío: la foto de una evidencia, la firma de
 * un ATS. Se sube después de que su registro exista en la nube.
 */
@Entity(tableName = "archivos", indices = [Index("clientId")])
data class ArchivoPendiente(
    @PrimaryKey val clientId: String,
    val bucket: String,
    val rutaDestino: String,
    val rutaLocal: String,                  // dónde está el archivo en el equipo
    val tipoMime: String = "image/webp",
    val tamano: Long = 0,
    val subido: Boolean = false,
)

/** El parte del día de la cuadrilla. */
@Entity(tableName = "partes")
data class ParteLocal(
    @PrimaryKey val clientId: String,
    val idEnServidor: String? = null,
    val servicioId: String,
    val cuadrillaId: String?,
    val fecha: String,                      // AAAA-MM-DD
    val estado: String = "borrador",
    val clima: String? = null,
    val horaInicio: String? = null,
    val horaFin: String? = null,
    val personal: Int? = null,
    val notas: String? = null,
    val actualizadoEn: Long = System.currentTimeMillis(),
)

/** Una actividad ejecutada dentro del parte. */
@Entity(tableName = "registros", indices = [Index("parteClientId")])
data class RegistroLocal(
    @PrimaryKey val clientId: String,
    val idEnServidor: String? = null,
    val parteClientId: String,
    val servicioId: String,
    val actividadId: String,
    val actividadNombre: String,
    val tramoId: String?,
    val tramoNombre: String?,
    val progresivaInicio: Double?,
    val progresivaFin: Double?,
    val lado: String = "derecho",
    val cantidad: Double,
    val unidad: String?,
    val observacion: String? = null,
    // De dónde nace el trabajo: "programacion", "pci" o "emergencia".
    // Sin esto el metrado llega a la nube suelto, y el avance de la partida
    // programada se queda en cero aunque la cuadrilla la haya terminado.
    val origen: String = "emergencia",
    val planItemId: String? = null,
    val pciItemId: String? = null,
    // El código del PCI se copia aquí porque se imprime en el sello de la
    // foto, y eso ocurre en la quebrada: no puede depender de consultarlo.
    val pciCodigo: String? = null,
    val creadoEn: Long = System.currentTimeMillis(),
)

/** Una fotografía sellada, con todo lo que la hace válida como evidencia. */
@Entity(tableName = "evidencias", indices = [Index("registroClientId")])
data class EvidenciaLocal(
    @PrimaryKey val clientId: String,
    val registroClientId: String?,
    val servicioId: String,
    val fase: String = "general",           // antes · durante · después · general
    val rutaLocal: String,
    val rutaDestino: String,
    val latitud: Double,
    val longitud: Double,
    val precision: Float,
    val tomadaEn: Long,
    val sha256: String,
    val conMarcaDeAgua: Boolean = true,
    val progresiva: Double? = null,
    val leyenda: String? = null,
    val ancho: Int = 0,
    val alto: Int = 0,
    val pesoBytes: Long = 0,
)

/** Catálogos copiados de la nube para poder trabajar sin señal. */
@Entity(tableName = "catalogo", primaryKeys = ["tabla", "id"])
data class FilaCatalogo(
    val tabla: String,
    val id: String,
    val servicioId: String?,
    val datos: String,                      // la fila completa, en JSON
    val bajadoEn: Long = System.currentTimeMillis(),
)

/**
 * Una foto del equipo con el contexto de su actividad.
 *
 * Es lo que la galería necesita para enseñar lo que todavía no ha subido
 * con el mismo aspecto que lo que ya está en la nube.
 */
data class EvidenciaConContexto(
    val clientId: String,
    val servicioId: String,
    val fase: String,
    val rutaLocal: String,
    val rutaDestino: String,
    val tomadaEn: Long,
    val latitud: Double,
    val longitud: Double,
    val precision: Float,
    val sha256: String,
    val conMarcaDeAgua: Boolean,
    val progresiva: Double?,
    val leyenda: String?,
    val actividad: String?,
    val tramo: String?,
    val pciCodigo: String?,
    val fecha: String?,
)

/** Cuántas fotos lleva cada actividad: lo que la lista del parte necesita saber. */
data class ConteoEvidencias(
    val registroClientId: String,
    val cuantas: Int,
)
