# SIGOV · Guía de despliegue

Todo lo necesario para llevar SIGOV a producción y mantenerlo.

---

## 1. Variables de entorno

`.env.local` en desarrollo; en Vercel, **Project Settings → Environment Variables**.

| Variable | Ámbito | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente | Clave anónima (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | Omite RLS. Nunca exponer al navegador |
| `SUPABASE_ACCESS_TOKEN` | scripts | Token personal para aplicar migraciones |
| `SUPABASE_PROJECT_REF` | scripts | Referencia del proyecto |
| `NEXT_PUBLIC_DEMO_MODE` | cliente | `true` muestra el acceso rápido por rol. **`false` en producción real** |
| `DEMO_PASSWORD` | scripts | Contraseña de los usuarios demo |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | cliente | Clave pública de Web Push |
| `VAPID_PRIVATE_KEY` | **solo servidor** | Clave privada de Web Push |
| `CRON_SECRET` | servidor | Protege los endpoints de cron |
| `NEXT_PUBLIC_APP_URL` | ambos | URL pública, usada por los cron para llamarse a sí mismos |

> `.env.local` está en `.gitignore` desde el primer commit. Las credenciales
> nunca deben llegar al repositorio.

---

## 2. Supabase

### 2.1 Extensiones

PostGIS se habilita en la migración `0001`. Si el proyecto es nuevo:

```bash
node scripts/sql.mjs query "create extension if not exists postgis with schema extensions;"
```

### 2.2 Migraciones

Se aplican **en orden** y son idempotentes:

```bash
for f in supabase/migrations/*.sql; do node scripts/sql.mjs file "$f"; done
```

| Migración | Contenido |
|---|---|
| `0001` | Extensiones, tipos, núcleo multi-tenant, funciones de autorización |
| `0002` | Catálogos, tramos con geometría, cuadrillas |
| `0003` | Programación semanal |
| `0004` | Campo y evidencias (con el trigger de inmutabilidad) |
| `0005` | PCIs, semáforo y regla de evidencia obligatoria |
| `0006` | Inventario vial |
| `0007` | SSOMA |
| `0008` | Auditoría, push, importaciones, respaldos |
| `0009` | **Motor de reprogramación por PCI prioritario** |
| `0010` | Row Level Security en todas las tablas |
| `0011` | Vistas y RPCs del dashboard |
| `0012` | Buckets de Storage y sus políticas |
| `0013` | RPCs GeoJSON del mapa |
| `0014` | Correcciones y optimizaciones de la auditoría |

### 2.3 Datos sembrados

Solo para demostración o para arrancar el entorno de pruebas:

```bash
for f in supabase/seed/*.sql; do node scripts/sql.mjs file "$f"; done
```

Siembra 2 servicios, 8 usuarios, 6 tramos reales de la Panamericana Norte,
3 632 elementos de inventario, 538 ítems de PCI, 625 registros de campo y
2 151 evidencias.

### 2.4 Retirar los datos demo antes del go-live

```sql
-- Desactiva el acceso rápido
-- (NEXT_PUBLIC_DEMO_MODE=false en Vercel)

-- Y elimina el tenant de demostración
delete from auth.users where email like '%@sigov.dev';
delete from public.services where is_demo = true;   -- arrastra en cascada
```

### 2.5 Storage

Cinco buckets creados por la migración `0012`:

| Bucket | Público | Límite | Notas |
|---|---|---|---|
| `evidencias` | no | 15 MB | **Sin políticas de UPDATE ni DELETE**: la foto es inmutable |
| `firmas` | no | 1 MB | Firmas digitales de SSOMA |
| `documentos` | no | 25 MB | PCIs, Excel importados, adjuntos |
| `avatars` | sí | 2 MB | Solo la carpeta propia del usuario |
| `respaldos` | no | 500 MB | Solo `service_role` y administradores |

---

## 3. Vercel

### 3.1 Conexión

1. **New Project → Import Git Repository** y elige el repositorio de SIGOV.
2. Framework: Next.js (autodetectado). Build: `npm run build`.
3. Añade todas las variables de la sección 1.
4. Deploy.

### 3.2 Cron jobs

`vercel.json` ya los declara:

| Ruta | Horario (UTC) | Qué hace |
|---|---|---|
| `/api/cron/pci-deadlines` | `0 12 * * *` (07:00 Perú) | Evalúa vencimientos de PCI, crea notificaciones y envía push |
| `/api/cron/backup` | `0 6 * * *` (01:00 Perú) | Exporta las tablas operativas a JSON en el bucket `respaldos` |

Ambos exigen `CRON_SECRET` o la cabecera `user-agent: vercel-cron`.
Para probarlos a mano:

```bash
curl "https://TU-DOMINIO/api/cron/pci-deadlines?secret=$CRON_SECRET"
curl "https://TU-DOMINIO/api/cron/backup?secret=$CRON_SECRET"
```

### 3.3 Sonda de salud

```bash
curl https://TU-DOMINIO/api/health
# {"ok":true,"db":"up","services":2,"latency_ms":249,"version":"1.0.0"}
```

---

## 4. Notificaciones push

```bash
node scripts/gen-vapid.mjs
```

Copia el par de claves a `.env.local` y a Vercel. La pública puede ser visible;
**la privada nunca sale del servidor**.

### Comportamiento por plataforma

| Plataforma | Push | Requisito |
|---|---|---|
| Android · Chrome/Edge | ✅ | Solo conceder el permiso |
| Escritorio · Chrome/Edge/Firefox | ✅ | Solo conceder el permiso |
| **iOS · Safari** | ⚠️ | **Obligatorio instalar la PWA** en la pantalla de inicio |

La app detecta iOS y muestra la guía de instalación paso a paso en el primer uso.

---

## 5. Instalación en los dispositivos

**Android / Chrome de escritorio**: la app ofrece el botón *Instalar aplicación*
al cuarto minuto de uso. También desde el menú del navegador → *Instalar*.

**iPhone / iPad**: Compartir → *Añadir a pantalla de inicio* → *Añadir*.
La app guía este flujo automáticamente.

Una vez instalada funciona a pantalla completa, sin barra de navegador, con su
icono propio y acceso sin conexión.

---

## 6. Rendimiento

Medido en el build de producción:

| Ruta | Bundle propio | First Load JS |
|---|---|---|
| Compartido por todas | — | 105 kB |
| `/login` | 10.8 kB | 244 kB |
| `/dashboard` | 7.7 kB | 286 kB |
| `/pci` | 6.9 kB | 320 kB |
| `/campo` | 7.4 kB | 330 kB |
| `/mapa` | 287 kB | 592 kB |

El mapa carga MapLibre solo al entrar en `/mapa` (import dinámico). Recharts,
jsPDF, ExcelJS, SheetJS y la cámara también se cargan bajo demanda.

### Estrategias de caché del service worker

| Recurso | Estrategia | Retención |
|---|---|---|
| Tiles del mapa | `CacheFirst` | 900 entradas · 30 días |
| Evidencias en Storage | `CacheFirst` | 400 entradas · 14 días |
| Lecturas de API | `NetworkFirst` (6 s) | 200 entradas · 24 h |
| Fuentes | `CacheFirst` | 1 año |

---

## 7. Reglas de trabajo contra producción

1. **Migraciones versionadas.** Ningún cambio de esquema a mano en el panel sin
   volcarlo a un archivo en `supabase/migrations/`.
2. **Cero migraciones destructivas** sobre datos reales. Los cambios son
   aditivos; lo obsoleto se marca y se limpia en una ventana acordada.
3. **RLS desde la primera tabla.** Una tabla sin política es una filtración.
4. **`SERVICE_ROLE_KEY` jamás en el cliente.**
5. **Respaldo antes de cada migración de hito**: `/api/cron/backup` a mano.
6. **Feature flags por servicio** (`services.modules`) para publicar módulos
   incompletos sin exponerlos al cliente.

---

## 8. Costos recurrentes (a cargo del cliente)

| Servicio | Costo | Cuándo se activa |
|---|---|---|
| Supabase Free → Pro | USD 25/mes | Al superar 500 MB de BD o 1 GB de Storage (~4 000 fotos) |
| Vercel Hobby → Pro | USD 25/mes | Al superar el ancho de banda o necesitar más cron jobs |
| Mapas | **USD 0** | MapLibre + OpenStreetMap + Esri: sin API key ni licencia |

Con fotos de ~250 KB, 1 GB de Storage cubre unas 4 000 evidencias. A ritmo de
70 evidencias diarias eso es aproximadamente **2 meses** de operación real:
conviene presupuestar el paso a Supabase Pro desde el inicio del contrato.
