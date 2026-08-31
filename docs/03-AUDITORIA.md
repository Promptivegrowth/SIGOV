# SIGOV · Auditoría y verificación

Resultado de las pruebas ejecutadas contra el proyecto Supabase real y contra la
aplicación compilada en modo producción.

---

## Resumen

| Suite | Pruebas | Resultado |
|---|---|---|
| Base de datos y reglas de negocio (`scripts/e2e.mjs`) | 67 | ✅ 67 / 67 |
| Interfaz en Chromium (`scripts/ui-test.mjs`) | 46 | ✅ 46 / 46 |
| `npm run build` | 23 rutas | ✅ sin errores |
| `npm run typecheck` | TypeScript estricto | ✅ sin errores |
| Errores de consola en el navegador | — | ✅ ninguno |
| Errores de red 5xx | — | ✅ ninguno |

---

## 1. Qué se verificó en la base de datos

### Autenticación y roles
Los 8 usuarios demo inician sesión con su contraseña; una contraseña incorrecta
es rechazada; cada perfil tiene el rol que le corresponde.

### Aislamiento multi-tenant (el punto más sensible)
Se probó explícitamente la **fuga de datos entre servicios** con el JWT real de
un jefe de cuadrilla del servicio Huaura consultando el servicio Red Vial 4:

| Consulta | Resultado |
|---|---|
| `pci_items` de otro servicio | 0 filas |
| `evidences` de otro servicio | 0 filas |
| `road_sections` de otro servicio | 0 filas |
| `sections_geojson()` de otro servicio | 0 features |
| `dashboard_kpis()` de otro servicio | excepción `sin acceso a este servicio` |
| Usuario anónimo sobre 6 tablas | 0 filas en todas |
| Visor intentando escribir | bloqueado con `42501` |
| Visor leyendo la auditoría | bloqueado |

### Evidencia inmutable
Se intentó alterar una evidencia **con la `service_role`**, que omite RLS:

| Intento | Resultado |
|---|---|
| Cambiar la latitud | ❌ bloqueado por trigger |
| Cambiar la fecha de captura | ❌ bloqueado por trigger |
| Cambiar el hash SHA-256 | ❌ bloqueado por trigger |
| Cambiar un metadato no protegido (caption) | ✅ permitido |
| Jefe de cuadrilla borrando una evidencia | ❌ bloqueado |

Además: **100 % de las evidencias** tienen coordenadas y hash de integridad.

### PCIs
- El semáforo cubre sus 5 estados y es coherente con la fecha límite en los 400
  ítems comprobados uno a uno.
- El PCI de alto volumen tiene **314 ítems** en una sola cabecera.
- **No se puede levantar un ítem sin evidencia** cuando ésta es obligatoria.
- Los contadores de las cabeceras coinciden con el conteo real en los 5 PCIs.

### Motor de reprogramación por PCI prioritario
| Verificación | Resultado |
|---|---|
| La simulación devuelve el diff completo | 8 a suspender · 314 candidatos a crear |
| La simulación **no modifica** nada | 0 cambios |
| Aplicar suspende y crea | 8 suspendidos · 60 creados |
| Los suspendidos conservan su fecha original | 8 con trazabilidad completa |
| Se registra el diff en `plan_suspensions` | 68 cambios registrados |
| Aplicar dos veces | rechazado (idempotente) |
| Se notifica a las cuadrillas | 3 notificaciones generadas |
| Revertir restaura el plan | 8 ítems restaurados, 0 residuos |

### Sincronización offline
- Un registro con `client_id` se crea correctamente.
- **Reenviarlo 4 veces produce 1 sola fila** — la idempotencia funciona.
- El avance del plan se recalcula solo: `159.7` = suma exacta de sus 3 registros.

### PostGIS
- `fmt_progresiva(12450)` → `12+450`; `parse_progresiva('12+450')` → `12450`.
- `progresiva_from_point()` calcula sobre la geometría real del tramo y devuelve
  un valor dentro del rango.
- Las 5 funciones GeoJSON devuelven `FeatureCollection` válido y **respetan RLS**.
- Las progresivas del inventario caen dentro del rango de su tramo (500 comprobadas).

---

## 2. Qué se verificó en el navegador

Chromium real, servidor de producción, tres perfiles de dispositivo.

### Escritorio (Supervisor)
Las 8 rutas cargan con 200; el dashboard muestra 4 KPIs con datos reales,
3 gráficos SVG y el mini-mapa WebGL; el tablero de PCIs muestra el semáforo;
el detalle virtualiza **22 filas en ventana** sobre 314 ítems; el diálogo de
reprogramación muestra el diff antes/después; el mapa carga MapLibre con su
panel de capas; ⌘K abre el buscador; el modo oscuro se aplica.

### Móvil (Jefe de cuadrilla · Pixel 7)
La barra inferior tiene 5 destinos con **objetivos táctiles de 64 px** (por
encima de los 56 px exigidos para uso con guantes); la vista de campo lista los
partes de su cuadrilla; el detalle muestra registros y evidencias; el menú
**no muestra** Importación ni Configuración.

### Sin conexión
Al caer la red aparece el aviso *«Trabajando sin conexión»*; al recuperarla
desaparece; la base local IndexedDB `sigov` queda inicializada.

### PWA
Manifiesto con 11 iconos (incluidos maskable) y 3 accesos directos; service
worker de 49 KB publicado; los 4 iconos clave se sirven; la pantalla sin
conexión existe; `/api/health` responde en 249 ms.

### Protección de rutas
Sin sesión, las 5 rutas protegidas redirigen al login.

---

## 3. Hallazgos corregidos durante la auditoría

La auditoría no fue un trámite: encontró **seis defectos reales**, todos
corregidos y vueltos a verificar.

| # | Hallazgo | Impacto | Corrección |
|---|---|---|---|
| 1 | `evidence_guard()` fallaba con `operator is not unique: geometry = geometry`. El trigger abortaba **cualquier** UPDATE sobre evidencias, incluso los legítimos. | Alto | Comparar `ST_AsEWKT()` en vez del operador ambiguo (`0014`) |
| 2 | `dashboard_daily_series()` agotaba el `statement_timeout`: 120 subconsultas correlacionadas. El gráfico del dashboard nunca cargaba. | Alto | Reescrita con CTEs agregadas + `LEFT JOIN`, y 6 índices nuevos (`0014`) |
| 3 | El preloader se eliminaba del árbol que React hidrata → `Failed to execute 'insertBefore' on 'Node'`. **La app quedaba en blanco tras el login.** | Crítico | El overlay se construye desde un script inline y cuelga de `<html>`, fuera del árbol de React |
| 4 | El servicio activo por defecto era el secundario (orden alfabético: HUA antes que RV4), así que el cliente veía el contrato equivocado al entrar. | Alto | Ordenar por fecha de creación: el contrato principal manda |
| 5 | Un módulo apagado para un servicio seguía siendo alcanzable escribiendo la URL. | Medio | Guardia de módulo y rol en `AppShell`, con redirección |
| 6 | La cuadrilla del usuario se resolvía siempre a la primera, sin filtrar por el servicio activo. | Medio | Filtrado por `service_id` del servicio activo |

También se corrigió que las rutas `/api/*` fueran redirigidas al login por el
middleware, lo que rompía a cualquier cliente que esperara JSON.

---

## 4. Volumen de datos verificado

| Tabla | Filas |
|---|---|
| `road_assets` (inventario vial) | 3 632 |
| `evidences` | 2 151 |
| `work_entries` | 625 |
| `pci_items` | 538 |
| `talk_attendance` | 714 |
| `checklist_responses` | 324 |
| `work_orders` | 210 |
| `safety_talks` | 168 |
| `plan_items` | 254 |
| `ats_iperc` | 108 |
| `audit_log` | 10 412 |
| **Total operativo** | **~8 930** |

Integridad comprobada: ningún registro de campo huérfano, 100 % de evidencias
con GPS y hash, todo el inventario georreferenciado.

---

## 5. Segunda ronda: las altas que faltaban

La primera auditoría dejó una lista de funciones que se podían **ver** pero no
**hacer**. Todas están implementadas, probadas en navegador y verificadas
contra la base real.

| Función | Dónde | Cómo se probó |
|---|---|---|
| Responder un checklist | SSOMA › Checklists › **Responder checklist** | 10 pasos: puntos conformes, foto sellada, hallazgo obligatorio, firma y envío |
| Crear plantillas de checklist | SSOMA › Checklists › **Plantillas** | alta con constructor de puntos, edición y baja |
| Registrar un ATS / IPERC | SSOMA › ATS › **Nuevo ATS** | matriz de riesgos con nivel calculado, EPP, firma del supervisor y del equipo |
| Alta de elemento del inventario | Inventario › **Nuevo elemento** | atributos dinámicos por tipo, código sugerido, progresiva validada contra el tramo |
| Registrar una intervención | Ficha del elemento › **Registrar intervención** | el estado del elemento se actualiza y queda en su historial |
| Crear un contrato | Configuración › Servicios › **Nuevo servicio** | alta con módulos seleccionables; el creador queda dentro como administrador |
| Cargar el trazo de un tramo | Configuración › Tramos › icono de ruta | KML, KMZ, GeoJSON y GPX con vista previa; 60 puntos = 9,93 km sobre el mapa |
| Firma manuscrita | Checklists, ATS y asistencia a charlas | trazo con el dedo en pantalla de 390 px, guardado en el bucket privado |
| Borrar cuadrilla, tramo y actividad | Configuración | baja lógica: dejan de ofrecerse y el historial se conserva |
| Checklist y ATS sin señal | Frente de trabajo | se cortó la red de verdad: se llenan, se encolan y suben solos al volver la conexión |

Todo se comprueba con:

```bash
node scripts/altas-test.mjs http://localhost:3100     # 53 pruebas
```

El script crea de verdad cada registro contra la base de producción y **borra
al final** lo que creó —filas y archivos— dejando la base como estaba
(`scripts/limpiar-pruebas.mjs`).

### Defectos encontrados en esta ronda (y corregidos)

1. **El inventario mostraba solo 1 000 de 3 632 elementos.** PostgREST corta en
   1 000 filas sin avisar y nadie lo notaba porque la tabla se veía llena. Se
   añadió `fetchAll()`, que pagina hasta agotar el resultado; se aplicó también
   a los ítems de PCI y al parte diario de reportes, que podían sufrir lo mismo
   con periodos largos.
2. **Borrar un servicio fallaba** por una llave foránea de `audit_log`: al
   borrar en cascada, el trigger de auditoría insertaba una fila apuntando a un
   servicio ya inexistente. La traza debe sobrevivir a lo que audita, así que se
   quitó la FK (migración `0019`) y el `service_id` queda como dato histórico.
3. **Las asistencias a charlas decían tener firma y no la tenían**: se guardaba
   una ruta a un archivo que nunca se subía. Ahora la firma se traza de verdad
   y solo se guarda la ruta cuando existe; las 714 asistencias sembradas se
   completaron con firmas reales (`scripts/gen-firmas.mjs`) y se muestran en el
   acta.
4. **Los tramos, cuadrillas y actividades no se podían eliminar**, solo
   desactivar. Se añadió la baja lógica con su confirmación.

### Tercera pasada: probar de verdad el modo sin señal

Se afirmaba que el checklist y el ATS funcionaban sin conexión, pero eso no se
había ejercitado. Al cortar la red en el navegador aparecieron dos defectos que
habrían salido recién en obra:

5. **La firma no cargaba sin señal.** El componente traía `signature_pad` bajo
   demanda; sin internet el trozo de código nunca llegaba y el capataz no podía
   firmar. Ahora va dentro del paquete de la página.
6. **El ATS no se podía llenar sin señal**: sus catálogos (cuadrillas, tramos,
   personal) solo venían de la nube y el formulario salía vacío. Ahora caen al
   espejo local que la sincronización ya deja en el dispositivo, y se agregó
   `crew_members` a ese espejo para poder firmar el ATS en el frente.
7. **Los formularios se vaciaban solos.** `FormDialog` reconstruía sus valores
   cada vez que el componente padre volvía a dibujarse — algo que pasa con
   cualquier refresco en segundo plano —, así que a un usuario escribiendo un
   tramo nuevo se le podía borrar todo lo tipeado. El formulario ahora solo se
   rellena al abrirse o al cambiar el registro que edita.

El recorrido sin señal quedó cubierto por la suite: se corta la red, se llenan
checklist y ATS con foto y firmas, vuelve la conexión y se comprueba en la base
que llegaron ambos documentos, que las firmas quedaron colgadas de su ATS y que
los archivos subieron al bucket.

---

## 6. Cómo reproducir

```bash
# Base de datos y reglas de negocio          → 67 pruebas
node scripts/e2e.mjs

# Interfaz en navegador real (servidor levantado)
node scripts/ui-test.mjs http://localhost:3100        # 46 pruebas
node scripts/flow-test.mjs http://localhost:3100      # 40 pasos
node scripts/altas-test.mjs http://localhost:3100     # 53 pruebas
node scripts/responsive-test.mjs http://localhost:3100
node scripts/audit-ui.mjs                             # navegación y botones muertos
```

Las capturas del recorrido completo quedan en `docs/capturas/`; las de esta
segunda ronda, en `docs/capturas/altas/`.
