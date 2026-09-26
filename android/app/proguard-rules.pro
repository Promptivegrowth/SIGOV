# ─────────────────────────────────────────────────────────────────────────
# Reglas de optimización (R8) de la versión de entrega.
#
# R8 renombra y quita lo que cree que no se usa. Lo que se lee por nombre
# —los modelos que llegan de Supabase en JSON, los guardados en el equipo—
# tiene que conservar sus nombres y sus serializadores.
# ─────────────────────────────────────────────────────────────────────────

# Para que los errores que lleguen del campo traigan líneas legibles
-keepattributes SourceFile,LineNumberTable,*Annotation*,InnerClasses,Signature,EnclosingMethod
-renamesourcefileattribute SourceFile

# kotlinx.serialization: los modelos @Serializable de la app y sus serializadores
-keepclassmembers @kotlinx.serialization.Serializable class pe.servicon.sigov.** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class pe.servicon.sigov.**$$serializer { *; }
-keepclasseswithmembers class pe.servicon.sigov.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep @kotlinx.serialization.Serializable class pe.servicon.sigov.** { *; }

# supabase-kt y Ktor: se configuran por reflexión y traen dependencias opcionales
-keep class io.github.jan.supabase.** { *; }
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# MapLibre: su parte nativa llama a clases Java por nombre
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**

# Room y WorkManager: los trabajadores se crean por nombre
-keep class * extends androidx.work.ListenableWorker { <init>(...); }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
