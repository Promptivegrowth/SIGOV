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

    @Query("DELETE FROM cola WHERE estado = 'ENVIADO' AND enviadoEn < :antesDe")
    suspend fun limpiarViejos(antesDe: Long)
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

    @Query("DELETE FROM registros WHERE clientId = :id")
    suspend fun borrarRegistro(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardarEvidencia(evidencia: EvidenciaLocal)

    @Query("SELECT * FROM evidencias WHERE registroClientId = :registroId ORDER BY tomadaEn")
    fun evidenciasDe(registroId: String): Flow<List<EvidenciaLocal>>

    @Query("SELECT COUNT(*) FROM evidencias WHERE registroClientId = :registroId")
    suspend fun cuantasEvidencias(registroId: String): Int
}

@Dao
interface CatalogoDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardar(filas: List<FilaCatalogo>)

    @Query("SELECT * FROM catalogo WHERE tabla = :tabla AND (:servicioId IS NULL OR servicioId = :servicioId)")
    suspend fun de(tabla: String, servicioId: String?): List<FilaCatalogo>

    @Query("SELECT COUNT(*) FROM catalogo WHERE tabla = :tabla")
    suspend fun cuantas(tabla: String): Int
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
    version = 1,
    exportSchema = false,
)
abstract class SigovDb : RoomDatabase() {
    abstract fun cola(): ColaDao
    abstract fun archivos(): ArchivoDao
    abstract fun partes(): ParteDao
    abstract fun catalogo(): CatalogoDao
}

@Module
@InstallIn(SingletonComponent::class)
object BaseLocalModule {

    @Provides
    @Singleton
    fun proveerBase(@ApplicationContext contexto: Context): SigovDb =
        Room.databaseBuilder(contexto, SigovDb::class.java, "sigov.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides fun cola(db: SigovDb) = db.cola()
    @Provides fun archivos(db: SigovDb) = db.archivos()
    @Provides fun partes(db: SigovDb) = db.partes()
    @Provides fun catalogo(db: SigovDb) = db.catalogo()
}
