# SIGOV · Sistema Integral de Gestión Operativa Vial

**Cliente:** ETS VALERIA · RUC 20600222393
**Desarrollado por:** Promptive · Luciérnaga & Asociados S.A.C. · RUC 20609213770
**Referencia:** Propuesta 046 · Junio 2026

Plataforma web instalable (PWA) para el mantenimiento rutinario vial: programación semanal,
ejecución en campo **sin conexión**, evidencia fotográfica georreferenciada e inmutable,
atención de PCIs de OSITRAN, SSOMA, inventario vial y reportes.

---

## Qué es y qué resuelve

Reemplaza el flujo disperso actual (WhatsApp, Excel, fotos sueltas y carpetas en Drive)
por una sola plataforma trazable de extremo a extremo:

| Frente | Actor | Qué hace en SIGOV |
|---|---|---|
| **Oficina** | Administrador | Configura el sistema, importa Excel (programación, PCIs, inventario) y publica a campo |
| **Campo** | Jefe de cuadrilla | Registra actividades, metrados y fotos con GPS **sin señal**; firma SSOMA |
| **Control** | Supervisor / Coordinación | Valida partes, gestiona PCIs, ve el mapa y emite reportes |

### Los 12 módulos de la propuesta

| # | Módulo | Estado | Dónde vive |
|---|---|---|---|
| 01 | Configuración y usuarios | ✅ | `/configuracion` |
| 02 | Carga e importación Excel | ✅ | `/importar` |
| 03 | Programación semanal | ✅ | `/programacion` |
| 04 | App de campo offline-first | ✅ | `/campo` |
| 05 | Evidencia georreferenciada | ✅ | `lib/camera.ts` + `/campo/[id]` |
| 06 | Gestión de PCIs (OSITRAN) | ✅ | `/pci` |
| 07 | SSOMA | ✅ | `/ssoma` |
| 08 | Inventario vial | ✅ | `/inventario` |
| 09 | Dashboard y mapa interactivo | ✅ | `/dashboard`, `/mapa` |
| 10 | Reportes y salidas PDF/Excel | ✅ | `/reportes` |
| 11 | Multi-servicio (multi-tenant) | ✅ | RLS por `service_id` + `service_modules` |
| 12 | Seguridad y respaldos | ✅ | RLS, auditoría, cron de respaldo |

---

## Arranque rápido

```bash
npm install
cp .env.example .env.local     # y completa las credenciales
npm run dev                    # http://localhost:3000
```

### Acceso rápido de desarrollo

La pantalla de login muestra **seis tarjetas de un clic**, una por rol.
Se activan con `NEXT_PUBLIC_DEMO_MODE=true` y se apagan poniéndolo en `false`.

| Usuario | Correo | Rol | Contraseña |
|---|---|---|---|
| Luis Bravo Camus | `admin@sigov.dev` | Administrador | `Sigov2026!` |
| Elvis Dueñas Cabrera | `supervisor@sigov.dev` | Supervisor | `Sigov2026!` |
| Marco Quispe Ramos | `cuadrilla1@sigov.dev` | Jefe de cuadrilla A | `Sigov2026!` |
| Rosa Huamán Ticona | `cuadrilla2@sigov.dev` | Jefe de cuadrilla B | `Sigov2026!` |
| Paola Ríos Mendoza | `ssoma@sigov.dev` | Ing. de seguridad | `Sigov2026!` |
| Supervisión OSITRAN | `visor@sigov.dev` | Visor (solo lectura) | `Sigov2026!` |

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15.5** (App Router, Server Components) + **React 19** |
| Lenguaje | **TypeScript 5** estricto |
| Estilos | **Tailwind CSS v4** + tokens `oklch` + **shadcn/Radix** |
| Animación | **Motion 13** |
| Estado / datos | **TanStack Query 5**, **TanStack Table/Virtual**, Zustand, React Hook Form + Zod |
| Offline | **Dexie 4** (IndexedDB) + outbox propio + **Serwist 9** (service worker) |
| Mapas | **MapLibre GL 5** + OpenStreetMap + satelital Esri + **Turf 7** — sin API key ni licencia |
| Backend | **Supabase**: PostgreSQL 17 + **PostGIS**, Auth, Storage, Realtime |
| Salidas | ExcelJS, SheetJS, jsPDF + autotable, signature_pad |
| Push | **Web Push (VAPID)** |
| Hosting | **Vercel** + cron jobs |

---

## Estructura

```
app/
  (app)/                  Rutas autenticadas (comparten el shell)
    dashboard/            KPIs, gráficos, alertas, mini-mapa
    programacion/         Tablero semanal y vista de lista
    campo/                Partes diarios + captura offline
    pci/                  PCIs y motor de reprogramación
    mapa/                 Mapa interactivo con capas
    inventario/           Elementos viales virtualizados
    ssoma/                Charlas, checklists, ATS/IPERC
    reportes/             PDF y Excel
    importar/             Importador con mapeo de columnas
    configuracion/        Usuarios, servicios, catálogos, seguridad
  api/
    push/                 Suscripción y envío de notificaciones
    cron/                 Vencimientos de PCI y respaldos
    health/               Sonda de salud
  login/                  Acceso + acceso rápido por rol
  sw.ts                   Service worker (Serwist)
  manifest.ts             Manifiesto PWA

components/
  ui/                     Primitivas (button, card, dialog, select, table…)
  layout/                 Sidebar, topbar, bottom nav, sync, install prompt
  dashboard/              Gráficos y mini-mapa
  campo/                  Cámara y galería de evidencias
  pci/                    Diálogo del motor de reprogramación
  mapa/                   Lienzo MapLibre
  shared/                 Logo, preloader, KPIs, utilidades visuales

lib/
  supabase/               Clientes de navegador, servidor y admin
  offline/db.ts           Dexie: outbox, blobs, espejo local
  offline/sync.ts         Motor de sincronización
  camera.ts               Captura, GPS y sellado de evidencia
  reports.ts              Generación de PDF y Excel
  import-schemas.ts       Esquemas y validación de importación

supabase/
  migrations/             14 migraciones versionadas
  seed/                   Datos sembrados

scripts/
  sql.mjs                 Ejecutor de SQL contra el proyecto
  e2e.mjs                 67 pruebas de base de datos y reglas de negocio
  ui-test.mjs             46 pruebas de interfaz en Chromium
  gen-icons.mjs           Generador de iconos PWA
  gen-vapid.mjs           Generador de claves push
```

---

## Base de datos

**32 tablas · 4 vistas · 63 funciones · 117 políticas RLS.** Todas las tablas
tienen RLS activo; el eje del aislamiento es `service_id`.

### Piezas destacadas

**`apply_pci_suspension(pci_id)`** — el requisito crítico de la propuesta.
Detecta los ítems de la programación que colisionan con un PCI prioritario
(mismo tramo y solapamiento de progresivas), los suspende y reprograma, crea los
ítems necesarios para atenderlo con prioridad 1, registra el diff completo y
notifica a las cuadrillas. Todo en una transacción, con
`preview_pci_suspension()` para simular antes y `revert_pci_suspension()` para deshacer.

**`evidence_guard()`** — trigger que hace **imposible** editar la latitud,
longitud, fecha de captura, hash SHA-256 o ruta del archivo de una evidencia,
incluso con la `service_role`. Storage complementa: el bucket `evidencias` no
tiene políticas de UPDATE ni DELETE.

**`pci_item_semaforo(due, term, status)`** — el semáforo se **calcula**, nunca
se almacena desactualizado: verde (>50% del plazo), ámbar (≤50%), rojo (≤20%),
vencido, ok.

**`*_geojson(...)`** — cinco funciones que devuelven `FeatureCollection` listo
para MapLibre en una sola llamada, respetando RLS.

---

## Offline-first

```
UI ─ dexie-react-hooks ─→ IndexedDB (lectura instantánea)
                              ├── espejo (catálogos, semana, PCIs asignados)  ← PULL
                              ├── outbox (mutaciones pendientes)              → PUSH
                              └── blobs (fotos selladas)
                          ↕ SyncEngine
                     Service Worker (Background Sync)
                              ↕
                        Supabase + Storage
```

- **Idempotencia**: cada mutación lleva un `client_id` que es clave única en el
  servidor. Reintentar nunca duplica (verificado: 4 envíos → 1 fila).
- **Estados visibles**: `pendiente → sincronizando → sincronizado → error`.
- **Backoff exponencial** de 2 s a 5 min, con reintento manual desde la UI.
- **Orden garantizado**: la foto se sube después de su registro padre.
- **Purga automática** de lo sincronizado hace más de 7 días.

---

## Evidencia sellada

1. Captura con `getUserMedia` a resolución máxima.
2. GPS con `enableHighAccuracy`; se avisa si la precisión supera los 50 m.
3. **Canvas 2D** quema en el pixel: coordenadas, precisión, altitud, fecha y
   hora, tramo, progresiva, actividad, cuadrilla, fase y la marca SIGOV.
4. Se calcula el **SHA-256** del archivo final.
5. Se guarda en IndexedDB y entra al outbox; sube a Storage al haber señal.
6. En BD, un trigger bloquea cualquier edición posterior de esos campos.

---

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # compilación de producción
npm start            # servidor de producción
npm run typecheck    # TypeScript sin emitir
npm run lint         # ESLint

node scripts/sql.mjs file supabase/migrations/0001_....sql   # aplicar migración
node scripts/sql.mjs query "select 1"                        # consulta suelta
node scripts/e2e.mjs                                         # auditoría de BD (67 pruebas)
node scripts/ui-test.mjs http://localhost:3000               # UI en Chromium (46 pruebas)
node scripts/gen-icons.mjs                                   # regenerar iconos PWA
node scripts/gen-vapid.mjs                                   # nuevas claves push
```

---

## Verificación

| Suite | Cobertura | Resultado |
|---|---|---|
| `scripts/e2e.mjs` | Auth, RLS y fugas entre servicios, inmutabilidad de evidencia, semáforo, motor de reprogramación, idempotencia offline, PostGIS, dashboard, SSOMA, multi-servicio, auditoría, integridad | **67 / 67** |
| `scripts/ui-test.mjs` | Login y acceso rápido, dashboard con gráficos y mapa, las 8 rutas, PCI virtualizado, motor de reprogramación, modo campo móvil, offline, roles restringidos, PWA, protección de rutas | **46 / 46** |
| `npm run build` | Compilación de 23 rutas | ✅ sin errores |
| `npm run typecheck` | TypeScript estricto | ✅ sin errores |

Capturas del recorrido completo en [`docs/capturas/`](docs/capturas/).

---

## Documentación

- [`docs/00-PLAN-MAESTRO.md`](docs/00-PLAN-MAESTRO.md) — análisis de la propuesta, stack y ruta de desarrollo
- [`docs/01-DESPLIEGUE.md`](docs/01-DESPLIEGUE.md) — puesta en producción en Vercel y Supabase
- [`docs/02-MANUAL-USUARIO.md`](docs/02-MANUAL-USUARIO.md) — manual por rol
- [`docs/03-AUDITORIA.md`](docs/03-AUDITORIA.md) — resultados de las pruebas y hallazgos corregidos

---

## Licencia y propiedad

El código fuente y la documentación se entregan a **ETS VALERIA** como activo
propio, sin candados ni dependencias del proveedor, conforme a la propuesta 046.
