# SIGOV · Plan Maestro de Desarrollo (Web PWA)

**Cliente:** ETS VALERIA (RUC 20600222393) · **Ejecuta:** Promptive · Luciérnaga & Asociados S.A.C.
**Ref. propuesta:** 046 · Junio 2026 · S/ 15,500 sin IGV · 75 días · 5 hitos
**Cambio de arquitectura acordado:** App nativa Android (React Native + SQLite) → **PWA instalable (Next.js + Supabase + Vercel)**
**Modo de trabajo:** desarrollo **directo contra producción** (Supabase real + repositorio + Vercel).

---

## 1. Lectura del documento — qué exige realmente SIGOV

### 1.1 Tres frentes operativos (deben coexistir en UNA sola plataforma)

| Frente | Actor | Necesidad |
|---|---|---|
| **1 · Oficina** | Administrador | Configuración, importación Excel (programación / PCIs / inventario), sincronización hacia campo |
| **2 · Campo** | Jefe de cuadrilla | Registro de actividades, foto + GPS + marca de agua, SSOMA, PCIs por ítem — **SIN INTERNET** |
| **3 · Control** | Supervisor / Coordinación | Validación, dashboard con mapa, reportes, trazabilidad |

### 1.2 Reglas de negocio críticas (extraídas del documento)

1. **PCI prioritario suspende o reordena automáticamente la programación semanal.** Es EL requisito crítico declarado en la propuesta. No es un filtro: es un motor de reprogramación.
2. **PCIs de alto volumen**: cientos de ítems por PCI, cada uno con su propio plazo → obliga a virtualización de listas, importación masiva y semáforo **por ítem**, no por PCI.
3. **Evidencia protegida contra edición**: GPS y fecha sellados en la foto y en BD, inmutables.
4. **Multi-servicio (multi-tenant)**: un mismo sistema, varios contratos, datos separados. Algunos servicios completos (PCI + programación), otros solo programación semanal → los módulos deben poder **apagarse por servicio**.
5. **Inventario vial georreferenciado por progresiva** (alcantarillas, guardavías, señales, postes SOS) ligado al mapa y al historial de intervenciones.
6. **Cero pérdida de registros** al recuperar señal.

### 1.3 Los 12 módulos y su mapeo a hitos (según la propuesta)

| # | Módulo | Hito |
|---|---|---|
| 01 | Configuración y usuarios (5 roles, catálogos, tramos, progresivas) | H1 |
| 04 | App de campo offline-first | H1 |
| 05 | Evidencia georreferenciada | H1 |
| 02 | Carga e importación Excel | H2 |
| 03 | Programación semanal + suspensión por PCI | H2 |
| 06 | Gestión de PCIs (OSITRAN) | H3 |
| 08 | Inventario vial georreferenciado | H3 |
| 07 | SSOMA | H4 |
| 11 | Multi-servicio (multi-tenant) | H4 |
| 12 | Seguridad y respaldos | H4 |
| 09 | Dashboard y mapa interactivo | H5 |
| 10 | Reportes y salidas PDF/Excel | H5 |

---

## 2. Traducción Android nativo → PWA (qué cambia y qué NO se pierde)

| Capacidad prometida | Nativo (propuesta original) | **PWA (esta implementación)** | Paridad |
|---|---|---|---|
| Instalable en el celular | APK / AAB | `manifest.json` + install prompt (A2HS). También instalable en **escritorio** Windows/Mac | Mejor: 1 build, móvil + escritorio |
| BD local | SQLite | **IndexedDB vía Dexie 4** | Equivalente |
| Cola de sync con reintentos | Custom | **Outbox pattern + Background Sync API + backoff exponencial** | Equivalente |
| Cámara | API nativa | `getUserMedia` + `<input capture>` como fallback | Equivalente |
| GPS alta precisión | API nativa | `Geolocation.watchPosition({enableHighAccuracy:true})` | Equivalente (con app abierta) |
| Marca de agua en foto | Canvas nativo | **Canvas 2D en cliente**, sellado antes de persistir | Equivalente |
| Push | FCM | **Web Push (VAPID)** — Android/Chrome/Edge/Escritorio OK; **iOS exige instalar la PWA** | Ver 2.1 |
| Trabajo prolongado sin señal | Sí | Sí: precache de la app + datos locales | Equivalente |
| Distribución | APK por WhatsApp o Play Store (USD 25) | **URL** — sin store, sin costo, actualización instantánea para todos | Mejor |

### 2.1 Limitaciones honestas de la PWA (hay que declararlas al cliente)

- **iOS / Safari**: el push funciona **solo si el usuario añade la app a la pantalla de inicio**. Se resuelve con un onboarding guiado obligatorio en el primer login desde iPhone.
- **Background Sync API**: soportada en Chromium (Android/Chrome/Edge). En iOS se hace *foreground sync* al abrir la app y al recuperar red (evento `online`). En la práctica el operario abre la app al volver a señal y sincroniza.
- **GPS en segundo plano**: no existe en web. SIGOV captura GPS en el momento del registro —que es lo que el negocio necesita— no tracking continuo.
- **Cuota de almacenamiento**: se solicita `navigator.storage.persist()` y se comprime la foto a WebP ~1600px (~250 KB). Con 500 MB caben ~2,000 evidencias offline. Se implementa purga de lo ya sincronizado.

**Mitigación total:** si el cliente exige paridad 100% en iOS, el mismo código se empaqueta con Capacitor a APK/IPA **sin reescribir nada**. La puerta queda abierta desde el día 1.

---

## 3. Stack definitivo

### 3.1 Frontend
- **Next.js 15.5** (App Router, Server Components, Server Actions) + **React 19.2**
- **TypeScript 5** en modo estricto
- **Tailwind CSS v4** (motor Oxide, config CSS-first) + **tw-animate-css**
- **shadcn/ui** sobre **Radix UI** — accesible, sin vendor lock, el código es nuestro
- **Motion 13** (ex Framer Motion) — transiciones, gestos, layout animations
- **Lucide React** — iconografía · **next-themes** — dark/light real

### 3.2 Estado y datos
- **TanStack Query 5** — caché, revalidación, optimistic updates, `persistQueryClient` a IndexedDB
- **Zustand 5** — estado UI global (servicio activo, filtros de mapa, estado de red)
- **React Hook Form 7 + Zod 4** — formularios y validación compartida cliente/servidor
- **TanStack Table 8** — tablas virtualizadas (crítico para PCIs de cientos de ítems)

### 3.3 Offline / PWA
- **Serwist 9.5** (`@serwist/next`) — service worker moderno, sucesor de next-pwa/Workbox
- **Dexie 4 + dexie-react-hooks** — IndexedDB reactiva (el equivalente al SQLite prometido)
- **Web Push + VAPID** (`web-push`)
- Estrategias de caché: `NetworkFirst` para lecturas de API, `CacheFirst` para tiles de mapa y assets, `StaleWhileRevalidate` para catálogos

### 3.4 Backend
- **Supabase**: PostgreSQL + **PostGIS**, Auth (JWT), Storage (evidencias), Realtime, Edge Functions
- **RLS (Row Level Security)** en TODAS las tablas, con `service_id` como eje del multi-tenant
- **Vercel**: hosting, Edge Network, cron jobs (semáforo de PCIs diario, respaldos)

### 3.5 Mapas y geo
- **MapLibre GL JS 5** — open source, sin licencia, WebGL, 60 fps con miles de puntos
- Capas base: **OpenStreetMap** (vector) + **Esri World Imagery** (satelital, gratuito, sin API key) + Google Satellite como opción configurable
- **Turf.js 7** — progresivas, distancias, buffers, snap a tramo
- Clustering nativo de MapLibre para inventario vial de alto volumen

### 3.6 Salidas
- **ExcelJS** — export con formato, logos y celdas protegidas
- **xlsx (SheetJS)** — import de las plantillas del cliente
- **jsPDF + autotable** — reportes diarios, PCI, SSOMA, metrados
- **signature_pad** — firma digital SSOMA

---

## 4. Modelo de datos propuesto

### 4.1 Núcleo multi-tenant
```
organizations           ETS VALERIA
services                contratos ("Red Vial 4", "Tramo X")  ← EJE DEL MULTI-TENANT
service_modules         qué módulos están activos por servicio (pci on/off, ssoma on/off…)
profiles                usuario ↔ auth.users, rol global
service_members         usuario ↔ servicio ↔ rol dentro de ese servicio
```

### 4.2 Configuración (Mód. 01)
```
road_sections           tramos: nombre, prog_inicio, prog_fin, geometry LINESTRING
activities_catalog      código, nombre, unidad, rendimiento
units                   unidades de medida
crews / crew_members    cuadrillas y su composición
audit_log               quién, qué, cuándo, antes/después
```

### 4.3 Programación (Mód. 03)
```
weekly_plans            semana, servicio, estado (borrador/publicado/suspendido)
plan_items              actividad, tramo, prog_ini, prog_fin, cuadrilla, fecha, meta, estado
plan_suspensions        suspensión automática por PCI: motivo, pci_id, ítems movidos
```

### 4.4 Campo (Mód. 04, 05)
```
work_orders             parte diario de cuadrilla: fecha, cuadrilla, servicio, estado
work_entries            ejecución: actividad, progresiva, metrado, observación, plan_item_id
evidences               foto: storage_path, gps POINT, accuracy, taken_at,
                        fase (antes/durante/después), hash SHA-256, device_id
sync_queue              outbox — vive SOLO en el cliente (IndexedDB), no en Postgres
```

### 4.5 PCIs (Mód. 06)
```
pcis                    cabecera: código OSITRAN, fecha de notificación, tipo, prioridad, servicio
pci_items               ítem: descripción, tramo, progresiva, plazo_dias, fecha_limite,
                        responsable, estado, semáforo (verde/ámbar/rojo/vencido)
pci_item_evidences      evidencia obligatoria de levantamiento
pci_triggers            regla: PCI de prioridad alta → suspende plan semanal
```

### 4.6 Inventario vial (Mód. 08)
```
asset_types             alcantarilla, guardavía, señal, poste SOS… (extensible por el admin)
road_assets             tipo, código, tramo, progresiva, lado, geom POINT, estado, atributos JSONB
asset_interventions     historial: qué se hizo, cuándo, quién, work_entry_id
```

### 4.7 SSOMA (Mód. 07)
```
safety_talks            charla de 5 minutos: tema, expositor, fecha, servicio
talk_attendance         asistente, firma (Storage), hora
checklist_templates     plantillas configurables (JSONB de preguntas)
checklist_responses     respuestas + fotos
ats_iperc               peligros, riesgos, medidas de control, firmas
```

### 4.8 Sistema
```
push_subscriptions      endpoint, keys, usuario, dispositivo
notifications           tipo, destinatarios, payload, leído
backups_log             respaldos automáticos
```

**Todas las tablas** llevan `id uuid`, `service_id uuid`, `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete) y **RLS** por pertenencia en `service_members`.

---

## 5. Motor offline-first (el corazón del sistema)

### 5.1 Arquitectura
```
UI (React)
  ↕ dexie-react-hooks — lectura reactiva instantánea, latencia 0
IndexedDB local (Dexie)
  ├── tablas espejo (catálogos, plan de la semana, PCIs asignados)   ← PULL
  ├── outbox (mutaciones pendientes)                                  ← PUSH
  └── blobs (fotos comprimidas y ya selladas)
  ↕ SyncEngine
Service Worker (Serwist) → Background Sync API
  ↕
Supabase (Postgres + Storage)
```

### 5.2 Reglas del SyncEngine
- Cada mutación se escribe **primero** en IndexedDB con un `client_id` (UUID generado en el dispositivo) y entra al **outbox** en estado `pending`.
- Estados visibles al usuario: `pendiente → sincronizando → sincronizado → error` — exactamente lo prometido en la propuesta.
- **Idempotencia**: el `client_id` es clave única en el servidor → reintentar nunca duplica.
- **Backoff exponencial** (2s, 4s, 8s… máx 5 min) + reintento manual desde la UI.
- **Orden garantizado**: las fotos suben después de su `work_entry` padre (grafo de dependencias en el outbox).
- **Conflictos**: Last-Write-Wins por `updated_at` en datos operativos; en configuración gana el servidor y se avisa al usuario.
- **Pull selectivo**: el operario descarga solo su servicio + su cuadrilla + la semana actual + sus PCIs. Nunca la BD completa.
- **Purga**: las evidencias sincronizadas hace más de 7 días se borran del dispositivo (permanecen en Storage).

### 5.3 Evidencia sellada (Mód. 05)
1. Captura con `getUserMedia` a resolución máxima.
2. Lectura de GPS con `enableHighAccuracy`; se rechaza si `accuracy > 50 m` (con override justificado y registrado).
3. **Canvas 2D** quema en el pixel: coordenadas, progresiva calculada, fecha/hora, servicio, cuadrilla, actividad y logo.
4. Se calcula **SHA-256** del blob final y se guarda en BD.
5. Se sube a Storage con path inmutable; **políticas de Storage sin UPDATE ni DELETE** para roles de campo → físicamente no editable.
6. El punto va a una columna `geography(POINT)` de PostGIS con un trigger que **bloquea el UPDATE del campo GPS**.

---

## 6. Roles, permisos y acceso rápido de desarrollo

### 6.1 Los 5 roles del documento

| Rol | Alcance | Puede |
|---|---|---|
| **Administrador** | Todos los servicios | Todo: configuración, usuarios, importaciones, servicios, respaldos |
| **Supervisor** | Sus servicios | Validar/rechazar partes, programar, gestionar PCIs, ver todo, reportes |
| **Jefe de cuadrilla** | Su cuadrilla | App de campo: registrar, fotografiar, SSOMA, atender PCIs asignados |
| **Ing. de seguridad** | Sus servicios | SSOMA completo, checklists, ATS/IPERC; campo en solo lectura |
| **Visor** | Sus servicios | Solo lectura: dashboard, mapa, reportes. Sin escritura |

Se implementa en **3 capas**: RLS en Postgres (fuente de verdad) → middleware de rutas en Next.js → guardas de UI.

### 6.2 Acceso rápido en el login (requerimiento del cliente interno)

Panel **"Acceso rápido · desarrollo"** en la pantalla de login, visible solo si `NEXT_PUBLIC_DEMO_MODE=true`. Seis tarjetas de un clic:

| Usuario demo | Email | Rol |
|---|---|---|
| Luis Admin | admin@sigov.dev | Administrador |
| Elvis Dueñas | supervisor@sigov.dev | Supervisor |
| Marco Quispe | cuadrilla1@sigov.dev | Jefe de cuadrilla (Cuadrilla A) |
| Rosa Huamán | cuadrilla2@sigov.dev | Jefe de cuadrilla (Cuadrilla B) |
| Ing. Paola Ríos | ssoma@sigov.dev | Ing. de seguridad |
| Cliente / OSITRAN | visor@sigov.dev | Visor |

Contraseña única `Sigov2026!`, sembrada por script (`npm run db:seed`). Un clic entra directo. Cada usuario arranca con datos sembrados coherentes con su rol.

> **Nota de producción:** como el desarrollo va directo contra el Supabase real, estos usuarios se crean en un **servicio (tenant) llamado `DEMO`**, aislado por RLS del servicio real de ETS VALERIA. Se apagan con la variable de entorno y se eliminan con un script `db:demo:purge` antes del go-live. Ver sección 8.

---

## 7. UI/UX — sistema de diseño

### 7.1 Identidad
- **Base**: escala neutra fría (zinc/slate) — sobria, de sala de control.
- **Primario**: azul profundo institucional — confianza, ingeniería.
- **Acento**: ámbar de señalización vial — CTA de campo y alertas.
- **Semáforo PCI** (color con significado, nunca decorativo): verde > 50% del plazo · ámbar ≤ 50% · rojo ≤ 20% · gris oscuro vencido.
- Dark mode real: los supervisores trabajan de noche y el mapa se lee mejor.

### 7.2 Principios de interacción
- **Latencia percibida cero**: se lee primero de IndexedDB, el servidor confirma después.
- **Skeletons por sección**, nunca spinners a pantalla completa. Cada card, tabla y mapa tiene un skeleton con la forma real de su contenido.
- **Lazy loading agresivo**: mapa, gráficos, generador de PDF, importador de Excel y cámara se cargan con `next/dynamic` (`ssr:false`) — no pesan en el bundle inicial.
- **Prefetch de rutas** + `loading.tsx` por segmento del App Router → navegación instantánea.
- **Virtualización obligatoria** en PCIs, inventario y tablas de metrados.
- **Optimistic UI** en todo lo que escribe el operario: aparece hecho al instante y se sincroniza detrás.
- **Micro-interacciones con Motion**: transición de página, entrada escalonada de listas, sheet de detalle, y feedback háptico (`navigator.vibrate`) al guardar en campo.
- **Command palette (⌘K)** para supervisores y administradores.

### 7.3 Dos experiencias, una sola app
- **Modo Oficina** (≥1024 px): sidebar colapsable, tablas densas, mapa a pantalla completa, atajos de teclado.
- **Modo Campo** (móvil): navegación inferior de 5 destinos, **botones ≥ 56 px** (se usa con guantes y bajo el sol), alto contraste, indicador de red/sync siempre visible, captura en 3 toques.
- La app detecta el rol y arranca en el modo correcto.

### 7.4 Rendimiento — objetivos medibles
- LCP < 1.8 s en 4G · TTI < 2.5 s · bundle inicial < 180 KB gzip
- Lighthouse: PWA 100 · Performance ≥ 90 · Accesibilidad ≥ 95
- Mapa fluido con 5,000 elementos de inventario (clustering WebGL)

---

## 8. Modo de trabajo: desarrollo directo a producción

Como las credenciales de Supabase y el repositorio son los reales, el desarrollo va **directo a producción**. Eso exige disciplina explícita:

### 8.1 Entornos
| Entorno | Rama | Supabase | Vercel |
|---|---|---|---|
| **Producción** | `main` | Proyecto real | Dominio de producción |
| **Preview** | `dev` y ramas de feature | El mismo proyecto, **servicio `DEMO`** aislado por RLS | Preview deploy automático por PR |

Si en algún momento decides tener un segundo proyecto Supabase de staging, el código no cambia: solo las variables de entorno.

### 8.2 Reglas no negociables
1. **Migraciones versionadas** en `supabase/migrations/`, numeradas y aplicadas con `supabase db push`. Nunca cambios a mano en el panel sin volcarlos a una migración.
2. **Cero migraciones destructivas**: nada de `DROP COLUMN` / `DROP TABLE` sobre datos reales. Los cambios de esquema son aditivos; lo obsoleto se marca `deprecated_` y se limpia en una ventana acordada.
3. **RLS activo desde la primera tabla.** Ninguna tabla se crea sin su política. Una tabla sin RLS en un Supabase de producción es una filtración de datos.
4. **La `SERVICE_ROLE_KEY` nunca toca el cliente.** Vive solo en variables de entorno de servidor (Vercel) y en scripts locales. `.env.local` en `.gitignore` desde el commit 1.
5. **Datos demo aislados**: todo lo sembrado cuelga del servicio `DEMO`. Un script `db:demo:purge` lo borra completo antes del go-live.
6. **Respaldo antes de cada migración de hito**: `pg_dump` a Storage, automatizado.
7. **Feature flags** por servicio (`service_modules`) para publicar módulos incompletos sin exponerlos al cliente.

### 8.3 Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo servidor
NEXT_PUBLIC_DEMO_MODE=true        # false en producción real
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=                # solo servidor
CRON_SECRET=                      # protege los cron de Vercel
NEXT_PUBLIC_MAP_STYLE=            # estilo MapLibre
```

### 8.4 Lo que necesito de ti para arrancar
1. `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY` (para el seed y los scripts de servidor)
3. URL del repositorio Git (y si ya está conectado a Vercel)
4. Confirmación de que puedo **habilitar la extensión PostGIS** en ese proyecto
5. Si el proyecto ya tiene tablas, dímelo: las migraciones se escriben respetando lo existente

---

## 9. Ruta de desarrollo — 5 hitos / 75 días

> Cada hito = 15 días = **3 sprints de 5 días**. Al cierre de cada hito: demo grabada, checklist de criterios de aceptación y deploy en Vercel para revisión del cliente.

### HITO 0 · Fundación (días -3 a 0 — es la "demo gratuita" de la propuesta)
- Scaffolding, design system, layout, login con acceso rápido, seed de usuarios y roles, PWA instalable.
- **Entregable**: URL navegable con los 6 usuarios y el shell completo funcionando.

### HITO 1 · Campo offline + configuración base (Mód. 1, 4, 5) — días 1-15
| Sprint | Entrega |
|---|---|
| S1 | Esquema Postgres + PostGIS + RLS + Auth + seed. Módulo de usuarios, roles, cuadrillas, tramos, progresivas, catálogo de actividades y unidades. |
| S2 | Motor offline: Dexie, outbox, SyncEngine, service worker Serwist, indicador de estado, instalación PWA (móvil y escritorio). |
| S3 | Captura de campo: parte diario, registro de actividad con metrado, cámara + GPS + marca de agua + hash, fases antes/durante/después, cola de sync visible. |

**Aceptación:** un jefe de cuadrilla registra 10 actividades con fotos en **modo avión** y, al recuperar señal, se sincronizan las 10 sin pérdidas ni duplicados.

### HITO 2 · Importación Excel + programación semanal (Mód. 2, 3) — días 16-30
| Sprint | Entrega |
|---|---|
| S4 | Importador universal: subida de Excel, mapeo visual de columnas, validación fila a fila, previsualización de errores, importación transaccional con rollback. Plantillas descargables para programación, PCIs e inventario. |
| S5 | Programación semanal: vista calendario/Gantt, asignación por arrastre (actividad × tramo × cuadrilla × fecha), metas y estados, publicación a campo. |
| S6 | **Motor de reprogramación por PCI prioritario**: al ingresar un PCI de alta prioridad el sistema suspende los ítems en conflicto, propone el reordenamiento, muestra el diff antes/después, registra la suspensión y notifica por push a las cuadrillas. |

**Aceptación:** se importa la programación real del cliente desde su Excel; se ingresa un PCI prioritario y el plan se reordena con trazabilidad completa.

### HITO 3 · PCIs OSITRAN + inventario vial (Mód. 6, 8) — días 31-45
| Sprint | Entrega |
|---|---|
| S7 | PCIs: cabecera + ítems, importación masiva (cientos de ítems), plazos diferenciados, cálculo automático de fecha límite, semáforo por ítem, asignación de responsable. |
| S8 | Tablero de PCIs virtualizado con filtros, agrupación y acciones masivas; flujo de levantamiento en campo con evidencia obligatoria (no se cierra un ítem sin foto). |
| S9 | Inventario vial: tipos de elemento configurables, alta desde campo con GPS, cálculo de progresiva por snap al tramo (Turf), historial de intervenciones, capa en el mapa con clustering. |

**Aceptación:** se importa un PCI de 300 ítems, el semáforo es correcto por ítem, se levantan 5 con evidencia y se genera el sustento.

### HITO 4 · SSOMA + multi-servicio + seguridad (Mód. 7, 11, 12) — días 46-60
| Sprint | Entrega |
|---|---|
| S10 | SSOMA: charla de 5 minutos, asistencia con firma digital, checklists con plantillas configurables, ATS/IPERC con matriz de riesgos y firmas. Todo offline. |
| S11 | Multi-servicio: selector de servicio, aislamiento por RLS verificado, activación de módulos por servicio, usuarios con rol distinto por contrato. |
| S12 | Seguridad: auditoría completa (quién/qué/cuándo/antes/después), políticas de Storage inmutables, respaldos automáticos programados (cron de Vercel → export a Storage), gestión de sesiones. |

**Aceptación:** se crea un segundo servicio "solo programación"; un usuario de ese servicio no ve ni un byte del primero (prueba de RLS documentada).

### HITO 5 · Dashboard, mapa y reportes (Mód. 9, 10) — días 61-75
| Sprint | Entrega |
|---|---|
| S13 | Dashboard gerencial: avance diario/semanal, producción por cuadrilla, PCIs por vencer, partes sin foto, cumplimiento SSOMA. KPIs en tiempo real con Supabase Realtime. |
| S14 | Mapa interactivo: tramos coloreados por avance/estado, capas de inventario, evidencias y PCIs, filtros por fecha/cuadrilla/actividad, línea de tiempo y capa satelital. |
| S15 | Reportes: diario, de PCI, SSOMA y metrados → PDF con logo y firma, y Excel con formato. Generación programada y envío automático. **Cierre, documentación, manual y capacitación.** |

**Aceptación:** el supervisor genera el reporte diario del cliente en PDF en menos de 10 segundos, con las fotos georreferenciadas embebidas.

### Post-entrega
1 mes de acompañamiento gratuito · 12 meses de garantía · mantenimiento opcional S/ 750/mes.
Entrega de código fuente + documentación técnica + manual de usuario + video-tutoriales por rol.

---

## 10. Notificaciones push (Web Push · VAPID)

| Evento | Destinatario |
|---|---|
| PCI prioritario ingresado → plan suspendido | Jefes de cuadrilla afectados |
| Ítem de PCI a 48 h de vencer | Responsable + Supervisor |
| Ítem de PCI vencido | Supervisor + Administrador |
| Parte diario rechazado por el supervisor | Jefe de cuadrilla |
| Programación semanal publicada | Toda la cuadrilla |
| Charla SSOMA pendiente de firma | Asistentes |
| Sincronización fallida por más de 1 h | El propio usuario |

Un cron diario en Vercel evalúa vencimientos y dispara la cola de push.

---

## 11. Riesgos y decisiones abiertas

| # | Tema | Decisión propuesta |
|---|---|---|
| R1 | Push en iPhone | Onboarding obligatorio de instalación en el primer login desde iOS. Si el cliente exige más, se empaqueta con Capacitor (fuera del alcance actual). |
| R2 | Formato real de los Excel del cliente | **Necesito los archivos reales** de programación, PCI e inventario antes del Sprint 4. Mientras tanto el importador se construye genérico, con mapeo de columnas. |
| R3 | Capa satelital | Arrancamos con Esri World Imagery (gratuito, sin API key). Google Satellite queda como opción configurable si el cliente lo pide y asume el costo. |
| R4 | Definición de "progresiva" | Confirmar el formato exacto (km+m, ej. `12+450`) y si los tramos tienen geometría real (KMZ/shapefile) o solo rangos numéricos. |
| R5 | Volumen de evidencias | Supabase Free = 1 GB de Storage ≈ 4,000 fotos. Hay que pasar a Pro (USD 25/mes) antes de los 3 meses de operación real. Ya advertido en la propuesta. |
| R6 | Dispositivos de campo | Confirmar la gama y versión de Android de los celulares de las cuadrillas para fijar el objetivo de compatibilidad. |
| R7 | Desarrollo directo a producción | Mitigado con las reglas de la sección 8: migraciones versionadas, cero destructivas, RLS desde el día 1, datos demo aislados en un tenant `DEMO`. |

---

## 12. Estado actual

- [x] Documento analizado por completo (14 páginas)
- [x] Stack definido y **841 paquetes instalados** en `c:\Users\LUIGI\Desktop\SIGOV`
- [ ] **Aprobación de este plan ← estamos aquí**
- [ ] Credenciales de Supabase + repositorio
- [ ] Hito 0 · Fundación
