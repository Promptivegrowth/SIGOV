# SIGOV · Manual de usuario

Guía práctica por rol. Todo lo que aparece aquí funciona tal cual en el sistema.

---

## Instalar SIGOV en tu equipo

SIGOV se usa desde el navegador, pero conviene **instalarla** para trabajar sin
conexión, abrirla con su icono y recibir notificaciones.

**Celular Android** · Abre la app en Chrome → toca *Instalar aplicación* cuando
aparezca, o el menú ⋮ → *Instalar aplicación*.

**iPhone / iPad** · Abre la app en Safari → botón Compartir → *Añadir a
pantalla de inicio* → *Añadir*. **En iPhone este paso es obligatorio** para
recibir notificaciones.

**Computadora** · Chrome o Edge → icono de instalar en la barra de direcciones.

---

## Ingresar

Escribe tu correo y contraseña. Si estás en un entorno de demostración verás
además tarjetas de **acceso rápido**: un clic entra con ese rol, útil para
mostrar el sistema sin escribir credenciales.

Arriba a la derecha están el buscador (**⌘K** o **Ctrl+K**), las notificaciones,
el cambio de tema claro/oscuro y tu perfil.

Si trabajas en más de un contrato, el **selector de servicio** está arriba a la
izquierda del menú lateral. Cada servicio mantiene su información completamente
separada.

---

## Jefe de cuadrilla · trabajo en campo

Tu app arranca en **modo campo**: botones grandes, barra inferior de cinco
destinos y alto contraste, pensada para usarse de pie, con guantes y bajo el sol.

### Abrir el parte del día

1. Entra en **Campo**.
2. Toca **Abrir parte de hoy**. Se crea el parte diario de tu cuadrilla.
3. La tarjeta azul de arriba te lleva siempre al parte del día en curso.

### Registrar una actividad

1. Dentro del parte, toca **Registrar actividad**.
2. Elige la **actividad** del catálogo y el **tramo**.
3. En *Progresiva inicio* puedes escribirla (formato `12+450`) o tocar el botón
   de ubicación: **el sistema la calcula con el GPS** sobre la geometría del tramo.
4. Indica el **metrado ejecutado** y, si hace falta, una observación.
5. Guardar.

> El registro se guarda **primero en tu celular**. Si no hay señal, queda en
> cola y se envía solo cuando la recuperes. No pierdes nada.

### Tomar la evidencia fotográfica

1. En el registro, toca **+ Foto**.
2. Elige la fase: **Antes**, **Durante** o **Después**.
3. Espera a que el indicador de GPS se ponga verde (precisión menor a 50 m).
4. Toma la foto y confirma.

La foto sale **sellada**: coordenadas, precisión, fecha y hora, tramo,
progresiva, actividad, cuadrilla y fase quedan quemados en la imagen. Ni tú ni
nadie puede cambiarlos después: así se sustenta lo ejecutado ante el cliente y
ante OSITRAN.

### Enviar el parte

Cuando termines la jornada, toca **Enviar a validación**. El supervisor lo
revisa y lo aprueba u observa. Si lo observa, verás el motivo en rojo y podrás
corregir.

### Trabajar sin señal

Una franja oscura te avisa *«Trabajando sin conexión»*. Sigue registrando
normalmente. Cuando vuelva la señal aparece una franja ámbar con los registros
pendientes; se envían solos, pero puedes forzarlo con **Sincronizar**.

El estado de cada registro es visible en todo momento en el menú lateral:
**pendiente → sincronizando → sincronizado → error**. Si algo falla, el sistema
reintenta solo, y también puedes reintentar a mano.

---

## Supervisor · control y validación

### Dashboard

Al entrar ves el estado real de tu contrato:

- **Metrado ejecutado**, con su tendencia de los últimos 14 días.
- **Cumplimiento del plan** contra la meta programada.
- **Ítems de PCI vencidos** y cuántos vencen en 7 días.
- **Evidencias capturadas** y partes diarios.

Debajo, las **alertas accionables**: partes por validar, registros sin las fotos
mínimas, programación suspendida por PCI, ítems vencidos. Cada una lleva
directo a donde se resuelve.

Cambia el periodo con los botones *7 días · 30 días · 90 días · Este año*.

### Validar partes

**Campo** lista los partes de todas las cuadrillas. Los que están *Por validar*
esperan tu revisión. Ábrelos, revisa registros y evidencias, y usa **Revisar
parte**:

- **Validar** si la ejecución y la evidencia son conformes.
- **Observar** indicando qué debe corregirse (el motivo es obligatorio).

### Programación semanal

**Programación** muestra la semana en un tablero: una fila por cuadrilla, una
columna por día. Cada tarjeta lleva la actividad, el tramo, la progresiva y su
avance. Navega entre semanas con las flechas.

- Las tarjetas con borde ámbar vienen de un PCI.
- Las tarjetas atenuadas con el rayo están **suspendidas** por un PCI prioritario.

Cambia a vista de **Lista** para ver metas, avances y estados en tabla.

### PCIs de OSITRAN

**PCIs** lista las cabeceras con su barra de semáforo: cuántos ítems están en
plazo, por vencer, críticos, vencidos y levantados.

Al abrir un PCI verás sus ítems con:
- Filtros rápidos por color de semáforo, arriba.
- Búsqueda por descripción, número o tramo.
- Selección múltiple para **asignar cuadrilla en bloque**.

Aunque el PCI tenga cientos de ítems, la tabla se desplaza sin trabarse: solo
dibuja las filas visibles.

### Reprogramar por un PCI prioritario

Cuando entra un PCI de prioridad **alta** o **crítica**, el sistema te avisa en
el listado. Al abrirlo, el botón rojo **Reprogramar semana** abre la simulación:

- A la izquierda, **qué se suspende y a qué fecha se mueve** (con la fecha
  anterior tachada).
- A la derecha, **qué se agrega** para atender el PCI, con su fecha propuesta y
  su vencimiento.

Nada cambia hasta que pulsas **Aplicar reprogramación**. Al aplicarlo:
- Se suspenden y reprograman los ítems en conflicto, guardando su fecha original.
- Se crean los ítems del PCI con prioridad máxima.
- Se registra todo en el historial de suspensiones.
- Se **notifica por push** a las cuadrillas afectadas.

Es **reversible**: el mismo diálogo ofrece *Revertir reprogramación* y devuelve
el plan a como estaba.

### Mapa interactivo

**Mapa** dibuja los tramos sobre la carretera real. En el panel izquierdo
enciendes y apagas capas:

| Capa | Qué muestra |
|---|---|
| Tramos viales | El corredor coloreado por tramo, con sus progresivas |
| Ejecución en campo | Dónde trabajó cada cuadrilla, agrupado por densidad |
| Ítems de PCI | Cada ítem en su punto, **coloreado por semáforo** |
| Inventario vial | Alcantarillas, guardavías, señales, postes SOS… |
| Evidencias GPS | Cada foto en el punto exacto donde se tomó |

Haz clic en cualquier elemento para ver su ficha. Los círculos con números son
agrupaciones: haz clic para acercarte. Arriba puedes cambiar entre **Calles**,
**Satélite** y **Relieve**.

### Inventario vial

**Inventario** lista todos los elementos del corredor: alcantarillas,
guardavías, señales, postes SOS, badenes, puentes. Se filtra por tipo y por
estado de conservación, y el buscador encuentra por código, tramo o progresiva.

- **Nuevo elemento** — eliges el tipo y el tramo, y el sistema **sugiere el
  código correlativo**. Cada tipo pide sus propios datos técnicos (una
  alcantarilla su diámetro y su porcentaje de obstrucción; una señal su código
  MTC y su retroreflectividad). El pin toma tu ubicación y calcula la
  progresiva; si escribes una progresiva fuera del tramo, te avisa.
- **Ficha del elemento** — al tocarlo se abre con sus datos, sus atributos y el
  **historial de intervenciones**.
- **Registrar intervención** — qué se hizo (limpieza, descolmatación,
  reposición…), qué cuadrilla, y en qué estado queda. El estado del elemento se
  actualiza solo con esa última intervención.

### Reportes

**Reportes** genera cinco salidas, cada una en **PDF** con formato o **Excel**
con filtros:

- Reporte diario de ejecución
- Resumen de metrados
- Reporte de PCIs
- Reporte SSOMA
- Inventario vial

El PDF lleva la marca SIGOV, el contrato, el periodo y el pie con quién y cuándo
lo generó. Se produce en tu propio navegador, así que sale en segundos.

---

## Ingeniero de seguridad · SSOMA

**SSOMA** tiene tres pestañas:

**Charlas** — la charla diaria de 5 minutos con su tema, expositor, cuadrilla y
la **asistencia firmada** de cada integrante. Al abrir una charla ves la lista
completa con DNI, cargo y hora de firma.

**Checklists** — las plantillas configurables respondidas desde el celular
(EPP, vehículo, señalización de zona de trabajo, herramientas). Las que tienen
**hallazgos** aparecen marcadas en ámbar con la observación a la vista.

> **Responder uno**: botón *Responder checklist*. Eliges la plantilla y marcas
> punto por punto: **Conforme**, **No conforme** o **No aplica**. Si algo sale
> no conforme, el sistema te obliga a describir el hallazgo antes de enviar.
> Las preguntas de foto abren la cámara o la galería y la imagen queda sellada
> con GPS, fecha y hash. Al final firmas con el dedo. Sin señal se guarda en el
> equipo y se envía solo cuando vuelve el Starlink.

> **Crear tus propias listas**: botón *Plantillas* (solo administrador y
> supervisor). Cada punto puede ser conforme/no conforme, texto, número o foto,
> y se marca si es obligatorio.

**ATS / IPERC** — el Análisis de Trabajo Seguro con su **matriz de riesgos**:
cada peligro con su riesgo, probabilidad, severidad, nivel y medidas de control,
más el EPP exigido y las firmas del equipo.

> **Registrar uno**: botón *Nuevo ATS*. Escribes la tarea, eliges cuadrilla,
> tramo y progresiva (o tocas el pin para que la tome del GPS) y agregas los
> peligros. Los cinco peligros típicos de un frente vial están como atajo: un
> toque y entran con sus controles ya redactados. El nivel de riesgo se calcula
> solo al cruzar probabilidad y severidad, y el riesgo máximo del documento sale
> del peor de todos. Después marcas el EPP obligatorio y firman el supervisor y
> cada integrante.

El capataz llega a ambos formularios desde **Campo**, con los botones *ATS* y
*Checklist*: es lo que se llena antes de empezar el frente.

---

## Administrador · configuración

**Configuración** reúne siete pestañas:

- **Usuarios** — quién pertenece al servicio, con qué rol, su estado y última
  actividad. Abajo, la explicación de los 5 roles del sistema.
- **Servicios** — los contratos y **qué módulos tiene encendido cada uno**. Así
  conviven un contrato completo (con PCI y SSOMA) y otro más simple. Con *Nuevo
  servicio* se da de alta otro contrato eligiendo sus módulos; quien lo crea
  queda dentro como administrador.
- **Tramos** — código, nombre, ruta, progresivas, longitud, superficie, carriles
  y si tiene geometría trazada. El icono de ruta permite **cargar el trazo**
  desde un KML, KMZ, GeoJSON o GPX: se ve la vista previa y la longitud antes de
  guardar, y avisa si no cuadra con las progresivas declaradas.
- **Actividades** — el catálogo con su unidad, rendimiento por día y cuántas
  fotos exige cada partida.
- **Cuadrillas** — composición completa de cada cuadrilla con sus integrantes.
- **Dispositivo** — cuánto espacio usa la app en este equipo y el estado de las
  notificaciones push.
- **Seguridad** — el registro de auditoría: cada alta, cambio y baja con quién,
  qué y cuándo.

### Importar desde Excel

**Importación** acepta los archivos tal como los maneja ETS VALERIA:

1. Elige el tipo: programación, PCIs, inventario o catálogo de actividades.
2. Arrastra el Excel. El sistema lee la primera hoja.
3. **Mapeo de columnas** — reconoce automáticamente lo que puede; corriges el resto.
4. **Validación** — te muestra cuántas filas son válidas y **el error exacto de
   cada fila problemática**, con su número de fila.
5. **Importar** — solo entonces se escribe en la base.

Puedes descargar una **plantilla** de ejemplo para cada tipo desde el botón
superior. El historial de importaciones queda a la vista.

---

## Visor

Acceso de solo lectura: dashboard, mapa y reportes. No verás botones de crear,
editar ni importar. Pensado para el cliente, la supervisión externa o auditorías.

---

## Preguntas frecuentes

**¿Necesito internet para trabajar en campo?**
No. Registra todo normalmente; se guarda en tu celular y se envía cuando vuelva
la señal. Lo que sí necesitas es haber abierto la app al menos una vez con
conexión ese día, para descargar tu programación.

**¿Puedo corregir una foto mal tomada?**
Puedes tomar otra, pero **no puedes borrar ni editar una evidencia ya
registrada**. Es a propósito: eso es lo que le da valor probatorio ante el
cliente y el regulador.

**¿Por qué no recibo notificaciones en mi iPhone?**
Porque en iPhone hay que **instalar la app en la pantalla de inicio** primero.
La propia app te guía en el proceso.

**¿Qué pasa si dos personas editan lo mismo?**
En datos operativos gana el último cambio. En configuración gana el servidor y
se te avisa.

**¿Cuánto espacio ocupa la app en mi celular?**
Puedes verlo en Configuración → Dispositivo. Las evidencias ya sincronizadas se
borran solas del celular a los 7 días; quedan guardadas en el servidor.
