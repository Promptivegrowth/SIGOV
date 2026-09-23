package pe.servicon.sigov.datos.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import javax.inject.Singleton

@Dao
interface ColaDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun encolar(envio: EnvioPendiente)

    @Update
    suspend fun actualizar(envio: EnvioPendiente)

    @Query("SELECT * FROM cola WHERE clientId = :id")
    suspend fun porId(id: String): EnvioPendiente?

    /** Lo que toca intentar ahora: pendientes y fallidos cuya espera ya pasó. */
    @Query(
        """
        SELECT * FROM cola
        WHERE estado IN ('PENDIENTE', 'ERROR')
          AND proximoIntento <= :ahora
          AND intentos < :maxIntentos
        ORDER BY creadoEn ASC
        """
    )
    suspend fun porEnviar(ahora: Long, maxIntentos: Int = 8): List<EnvioPendiente>

    @Query("SELECT COUNT(*) FROM cola WHERE estado IN ('PENDIENTE', 'ERROR')")
    fun cuantosPendientes(): Flow<Int>

    @Query("SELECT clientId FROM cola WHERE estado = 'ENVIADO'")
    suspend fun yaEnviados(): List<String>

    /** Lo que todavía no llegó a la nube para una tabla concreta. */
    @Query("SELECT * FROM cola WHERE tabla = :tabla AND estado <> 'ENVIADO' ORDER BY creadoEn")
    suspend fun sinConfirmarDe(tabla: String): List<EnvioPendiente>

    @Query("DELETE FROM cola WHERE estado = 'ENVIADO' AND enviadoEn < :antesDe")
    suspend fun limpiarViejos(antesDe: Long)

    /** Lo que sigue esperando, para poder enseñárselo al capataz. */
    @Query("SELECT * FROM cola WHERE estado IN ('PENDIENTE','ERROR') ORDER BY creadoEn")
    fun enEspera(): Flow<List<EnvioPendiente>>

    /** Cuándo subió algo por última vez. */
    @Query("SELECT MAX(enviadoEn) FROM cola WHERE estado = 'ENVIADO'")
    fun ultimoEnvio(): Flow<Long?>

    @Query("SELECT COUNT(*) FROM cola WHERE estado = 'ERROR'")
    fun cuantosConError(): Flow<Int>

    /**
     * Devuelve a la cola lo que ya se había rendido.
     *
     * El reintento automático se detiene tras varios fallos para no golpear
     * una red que no está. Pero cuando es la persona la que pulsa
     * «Sincronizar ahora», ya no es un reintento ciego: puede haber llegado
     * al campamento con wifi, o el supervisor puede haber corregido en
     * oficina lo que hacía fallar el registro.
     */
    @Query("UPDATE cola SET intentos = 0, proximoIntento = :ahora WHERE estado = 'ERROR'")
    suspend fun revivirFallidos(ahora: Long)
}

@Dao
interface ArchivoDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun agregar(archivo: ArchivoPendiente)

    @Query("SELECT * FROM archivos WHERE clientId = :id AND subido = 0")
    suspend fun pendiente(id: String): ArchivoPendiente?

    @Query("UPDATE archivos SET subido = 1 WHERE clientId = :id")
    suspend fun marcarSubido(id: String)

    @Query("SELECT COUNT(*) FROM archivos WHERE subido = 0")
    fun cuantosSinSubir(): Flow<Int>
}

@Dao
interface ParteDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardar(parte: ParteLocal)

    @Query("SELECT * FROM partes WHERE fecha = :fecha AND cuadrillaId = :cuadrillaId LIMIT 1")
    suspend fun delDia(fecha: String, cuadrillaId: String?): ParteLocal?

    @Query("SELECT * FROM partes ORDER BY fecha DESC LIMIT 30")
    fun recientes(): Flow<List<ParteLocal>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardarRegistro(registro: RegistroLocal)

    @Query("SELECT * FROM registros WHERE parteClientId = :parteId ORDER BY creadoEn")
    fun registrosDe(parteId: String): Flow<List<RegistroLocal>>

    @Query("SELECT * FROM registros WHERE clientId = :id")
    suspend fun registro(id: String): RegistroLocal?

    /** Los registros del parte, de una vez y no como flujo. */
    @Query("SELECT * FROM registros WHERE parteClientId = :parteId ORDER BY creadoEn")
    suspend fun registrosDelParte(parteId: String): List<RegistroLocal>

    @Query("DELETE FROM registros WHERE clientId = :id")
    suspend fun borrarRegistro(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardarEvidencia(evidencia: EvidenciaLocal)

    @Query("SELECT * FROM evidencias WHERE registroClientId = :registroId ORDER BY tomadaEn")
    fun evidenciasDe(registroId: String): Flow<List<EvidenciaLocal>>

    @Query("SELECT COUNT(*) FROM evidencias WHERE registroClientId = :registroId")
    suspend fun cuantasEvidencias(registroId: String): Int

    /**
     * Todo lo fotografiado en el equipo, con el dato de la actividad a la
     * que pertenece. La galería lo necesita para enseñar lo que aún no ha
     * subido: si solo mostrara lo que está en la nube, el capataz toma una
     * foto sin señal, entra a «Fotos» y no la encuentra.
     */
    @Query(
        """
        SELECT e.clientId AS clientId, e.servicioId AS servicioId, e.fase AS fase,
               e.rutaLocal AS rutaLocal, e.rutaDestino AS rutaDestino,
               e.tomadaEn AS tomadaEn, e.latitud AS latitud, e.longitud AS longitud,
               e.precision AS precision, e.sha256 AS sha256,
               e.conMarcaDeAgua AS conMarcaDeAgua, e.progresiva AS progresiva,
               e.leyenda AS leyenda,
               r.actividadNombre AS actividad, r.tramoNombre AS tramo,
               r.pciCodigo AS pciCodigo, p.fecha AS fecha
        FROM evidencias e
        LEFT JOIN registros r ON r.clientId = e.registroClientId
        LEFT JOIN partes p ON p.clientId = r.parteClientId
        WHERE e.servicioId = :servicioId
        ORDER BY e.tomadaEn DESC
        """
    )
    suspend fun evidenciasEnElEquipo(servicioId: String): List<EvidenciaConContexto>

    /** Cuántas fotos tiene cada actividad del parte, para pintarlo en la lista. */
    @Query(
        """
        SELECT e.registroClientId AS registroClientId, COUNT(*) AS cuantas
        FROM evidencias e
        JOIN registros r ON r.clientId = e.registroClientId
        WHERE r.parteClientId = :parteId
        GROUP BY e.registroClientId
        """
    )
    fun conteoEvidencias(parteId: String): Flow<List<ConteoEvidencias>>
}

@Dao
interface CatalogoDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardar(filas: List<FilaCatalogo>)

    @Query("SELECT * FROM catalogo WHERE tabla = :tabla AND (:servicioId IS NULL OR servicioId = :servicioId)")
    suspend fun de(tabla: String, servicioId: String?): List<FilaCatalogo>

    @Query("SELECT COUNT(*) FROM catalogo WHERE tabla = :tabla")
    suspend fun cuantas(tabla: String): Int

    /**
     * Borra del espejo lo que ya no vino de la nube: un tramo dado de baja o
     * una partida retirada del contrato tienen que dejar de ofrecerse en el
     * formulario, o el capataz seguirá registrando contra algo que no existe.
     */
    @Query("DELETE FROM catalogo WHERE tabla = :tabla AND id NOT IN (:vigentes)")
    suspend fun borrarLosQueYaNoEstan(tabla: String, vigentes: List<String>)

    /**
     * Vacía una tabla del espejo antes de volver a llenarla.
     *
     * El inventario se baja entero cada vez —son miles de filas pero pesan
     * poco— y así un elemento dado de baja desaparece del mapa en lugar de
     * quedarse dibujado para siempre.
     */
    @Query("DELETE FROM catalogo WHERE tabla = :tabla AND (:servicioId IS NULL OR servicioId = :servicioId)")
    suspend fun borrarTabla(tabla: String, servicioId: String?)
}

@Database(
    entities = [
        EnvioPendiente::class,
        ArchivoPendiente::class,
        ParteLocal::class,
        RegistroLocal::class,
        EvidenciaLocal::class,
        FilaCatalogo::class,
    ],
    version = 3,
    exportSchema = false,
)
abstract class SigovDb : RoomDatabase() {
    abstract fun cola(): ColaDao
    abstract fun archivos(): ArchivoDao
    abstract fun partes(): ParteDao
    abstract fun catalogo(): CatalogoDao
}

/**
 * De la versión 1 a la 2: el registro guarda de dónde nace el trabajo.
 *
 * Se migra en vez de recrear la base. Destruirla borraría la cola de envíos
 * de un capataz que lleva tres días sin señal, que es justo el dato que esta
 * aplicación existe para no perder.
 */
private val DE_1_A_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE registros ADD COLUMN origen TEXT NOT NULL DEFAULT 'emergencia'")
        db.execSQL("ALTER TABLE registros ADD COLUMN planItemId TEXT")
        db.execSQL("ALTER TABLE registros ADD COLUMN pciItemId TEXT")
    }
}

/** De la 2 a la 3: el registro guarda el código del PCI para el sello. */
private val DE_2_A_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE registros ADD COLUMN pciCodigo TEXT")
    }
}

@Module
@InstallIn(SingletonComponent::class)
object BaseLocalModule {

    @Provides
    @Singleton
    fun proveerBase(@ApplicationContext contexto: Context): SigovDb =
        Room.databaseBuilder(contexto, SigovDb::class.java, "sigov.db")
            .addMigrations(DE_1_A_2, DE_2_A_3)
            .build()

    @Provides fun cola(db: SigovDb) = db.cola()
    @Provides fun archivos(db: SigovDb) = db.archivos()
    @Provides fun partes(db: SigovDb) = db.partes()
    @Provides fun catalogo(db: SigovDb) = db.catalogo()
}
