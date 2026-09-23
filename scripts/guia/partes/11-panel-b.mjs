/**
 * El panel administrativo, segunda mitad: caja, materiales, evidencias,
 * mapa, inventario, SSOMA, alertas, auditoría y todo lo que sale del
 * sistema (reportes, formatos, paquete, archivo, importación) más la
 * configuración.
 */

export const PANEL_B = [
  {
    titulo: 'Panel web · Caja chica',
    entrada:
      'Cada cuadrilla maneja una caja con dinero para gastos del día: combustible, peajes, materiales menores. La cuadrilla registra el gasto desde el celular con foto del comprobante, y aquí se revisa, se aprueba o se observa, y se atienden los pedidos de reposición.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Caja chica        ·        /caja' },
      {
        tipo: 'ojo',
        titulo: 'Atención',
        texto: 'Este apartado **no existe para el Visor (COVINCA)**. Es información económica interna de Servicon. Si el Visor lo ve, es una observación grave.',
      },
      { tipo: 'subtitulo', titulo: 'Qué hay en pantalla' },
      {
        tipo: 'controles',
        items: [
          ['**Gastos** / **Depósitos**', 'Las dos pestañas del apartado. En Gastos están los movimientos; en Depósitos, las solicitudes de reposición.'],
          ['Saldos por cuadrilla', 'Una tarjeta por caja abierta, con el saldo disponible en soles.'],
          ['Lista de movimientos', 'Cada gasto o ingreso, con fecha, cuadrilla, categoría, concepto, importe y estado.'],
          ['**Comprobante**', 'La foto de la boleta o factura que tomó la cuadrilla. Se pulsa para verla en grande.'],
          ['**Sin comprobante**', 'Marca un gasto que llegó sin foto. Es motivo válido para observarlo.'],
          ['**Revisar**', 'Abre el movimiento para decidir. Ofrece **Aprobar**, **Observar** y **Rechazar**.'],
          ['**Aprobar**', 'Da el gasto por bueno. Deja de estar pendiente y cuenta en el saldo definitivo.'],
          ['**Observar**', 'Lo devuelve con una nota: falta comprobante, el monto no cuadra, la categoría es otra.'],
          ['**Rechazar**', 'Lo anula. No se descuenta del saldo.'],
          ['**Responder solicitud**', 'Atiende un pedido de reposición de la cuadrilla. Pide los datos del depósito.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Campos al responder una solicitud de depósito' },
      {
        tipo: 'tabla',
        columnas: ['Campo', 'Qué se escribe'],
        filas: [
          ['**Monto depositado**', 'Cuánto se depositó realmente. Puede ser distinto de lo que pidió la cuadrilla.'],
          ['**Número de operación**', 'El código del depósito bancario, para que la cuadrilla lo pueda verificar.'],
          ['**Motivo**', 'Por qué se aprueba o se recorta el monto.'],
          ['**Nota**', 'Cualquier aclaración adicional para la cuadrilla.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-18',
        titulo: 'Revisar y aprobar un gasto',
        rol: 'Administrador',
        previo: 'Debe existir al menos un gasto pendiente. Si no hay, registra uno desde el celular (prueba A-09) y vuelve.',
        pasos: [
          'Entra a **Caja chica**.',
          'Ubica un movimiento en estado pendiente.',
          'Pulsa sobre el **comprobante** para ver la foto de la boleta.',
          'Cierra la foto y pulsa **Revisar**.',
          'Pulsa **Aprobar**.',
        ],
        esperado: [
          'La foto del comprobante se abre y se lee.',
          'Al aprobar, el movimiento cambia de estado y aparece la confirmación.',
          'El saldo de la cuadrilla refleja el gasto.',
          'En el celular de la cuadrilla, el gasto figura como aprobado.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-19',
        titulo: 'Observar un gasto sin comprobante',
        rol: 'Administrador',
        pasos: [
          'Ubica un movimiento marcado **Sin comprobante**, o cualquiera pendiente.',
          'Pulsa **Revisar** y luego **Observar**.',
          'Escribe: `Falta la foto del comprobante`.',
          'Confirma.',
        ],
        esperado: [
          'El movimiento queda observado y muestra la nota escrita.',
          'La cuadrilla ve esa observación desde su celular.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-20',
        titulo: 'Atender un pedido de depósito',
        rol: 'Administrador',
        previo: 'Debe haber una solicitud de depósito pendiente. Si no la hay, pídela desde el celular (prueba A-10).',
        pasos: [
          'Entra a **Caja chica** y ubica la solicitud pendiente.',
          'Pulsa **Responder solicitud**.',
          'Escribe **Monto depositado** `500`.',
          'Escribe **Número de operación** `OP-PRUEBA-001`.',
          'Escribe el motivo: `Reposición aprobada para la semana`.',
          'Confirma.',
        ],
        esperado: [
          'La solicitud pasa a atendida y muestra el número de operación.',
          'El saldo de la caja de esa cuadrilla sube en 500 soles.',
          'La cuadrilla ve el depósito reflejado en su saldo desde el celular.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Materiales e insumos',
    entrada:
      'El almacén del contrato y los pedidos que hacen las cuadrillas. La cuadrilla pide lo que va a necesitar, aquí se aprueba o se rechaza, y se entrega descontando del stock.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Materiales / Insumos        ·        /materiales' },
      {
        tipo: 'controles',
        items: [
          ['**Pedidos** / **Almacén**', 'Las dos pestañas. En Pedidos están las solicitudes de las cuadrillas; en Almacén, el stock.'],
          ['**Almacén**', 'Cada insumo con su código, unidad y cuánto queda.'],
          ['Lista de pedidos', 'Las solicitudes de las cuadrillas, con fecha de necesidad, ítems pedidos y estado.'],
          ['**Aprobar**', 'Acepta el pedido. Queda listo para entregarse.'],
          ['**Rechazar**', 'Niega el pedido. Conviene dejar una nota explicando por qué.'],
          ['**Nota**', 'El comentario que acompaña la decisión y que la cuadrilla verá.'],
          ['Entrega', 'Al entregar, el stock del almacén baja en la cantidad entregada.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-21',
        titulo: 'Aprobar un pedido de materiales',
        rol: 'Supervisor',
        previo: 'Debe existir un pedido pendiente. Si no lo hay, créalo desde el celular (prueba A-11).',
        pasos: [
          'Entra a **Materiales / Insumos**.',
          'Ubica el pedido pendiente y ábrelo.',
          'Revisa los ítems pedidos y las cantidades.',
          'Pulsa **Aprobar** y escribe la nota: `Aprobado, retirar en almacén el lunes`.',
        ],
        esperado: [
          'El pedido cambia de estado a aprobado.',
          'La nota queda visible para la cuadrilla.',
          'En el celular, el estado del pedido se actualiza.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-22',
        titulo: 'El stock baja al entregar',
        rol: 'Supervisor',
        pasos: [
          'En la pestaña **Almacén**, anota el stock de un insumo cualquiera.',
          'Entrega un pedido aprobado que incluya ese insumo.',
          'Vuelve a **Almacén** y revisa el stock del mismo insumo.',
        ],
        esperado: [
          'El stock bajó exactamente en la cantidad entregada.',
          'No quedan cantidades negativas; si el pedido supera el stock, el sistema avisa.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Fotos y evidencias',
    entrada:
      'El panel fotográfico: todas las fotos que las cuadrillas tomaron en campo, agrupadas por día y clasificadas por fase. Es lo que se entrega al cliente como sustento, así que lo importante es poder encontrar rápido la foto de un trabajo concreto.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Fotos / Evidencias        ·        /evidencias' },
      {
        tipo: 'controles',
        items: [
          ['**Buscar por actividad, tramo o PCI**', 'El buscador. Escribe parte del nombre de la actividad, del tramo o un código de PCI.'],
          ['**Todas las fases / Antes / Durante / Después / General**', 'Filtra por el momento del trabajo en que se tomó la foto.'],
          ['**7 / 30 / 90 días / Este año**', 'El periodo.'],
          ['Agrupación por día', 'Las fotos se ordenan por fecha, con el total de cada día.'],
          ['Etiqueta azul sobre la miniatura', 'La fase de esa foto.'],
          ['Escudo verde en la esquina', 'La foto lleva sello de agua. Sin escudo, la foto no fue sellada.'],
          ['Al pulsar una foto', 'Se abre en grande con actividad, tramo, progresiva, código de PCI, fecha, hora y coordenada GPS.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-23',
        titulo: 'Buscar la evidencia de un trabajo',
        rol: 'Supervisor',
        pasos: [
          'Entra a **Fotos / Evidencias** con el periodo en **90 días**.',
          'Escribe en el buscador `cuneta`.',
          'Pulsa el filtro **Antes**.',
          'Abre una foto.',
        ],
        esperado: [
          'Solo quedan las fotos de actividades que contienen esa palabra.',
          'Al filtrar por **Antes**, solo se ven fotos de esa fase.',
          'La foto ampliada muestra la fecha, la hora, la progresiva y las coordenadas.',
          'La imagen tiene el sello impreso encima (no es un texto del sistema, está dentro de la foto).',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-24',
        titulo: 'El jefe de cuadrilla solo ve lo suyo',
        rol: 'Jefe de cuadrilla',
        previo: 'Entra al panel web con `cuadrilla1@sigov.dev`.',
        pasos: [
          'Entra a **Fotos / Evidencias**.',
          'Revisa de qué cuadrillas son las fotos que se ven.',
        ],
        esperado: [
          'Solo aparecen fotos de la **Cuadrilla 1 · Calzada y Drenaje**.',
          'No se ve ni una sola foto de las cuadrillas 2, 3 o 4.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Mapa',
    entrada:
      'Todo el contrato sobre la carretera: los tramos, lo ejecutado, los PCIs, el inventario vial y las evidencias, cada cosa en su progresiva real. El mapa no necesita licencia ni clave: usa cartografía abierta.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Mapa        ·        /mapa' },
      {
        tipo: 'controles',
        items: [
          ['**Calles / Satélite / Relieve**', 'El fondo del mapa. Satélite muestra la imagen aérea; relieve, la topografía.'],
          ['**Capas del mapa** (panel izquierdo)', 'Enciende y apaga cada capa. Junto a cada nombre se ve cuántos elementos tiene.'],
          ['**Tramos viales**', 'Las líneas de los cuatro tramos del contrato.'],
          ['**Ejecución en campo**', 'Dónde trabajó cada cuadrilla, con el color de su cuadrilla.'],
          ['**Ítems de PCI**', 'Cada ítem en su progresiva, con el color del semáforo de vencimiento.'],
          ['**Inventario vial**', 'Alcantarillas, guardavías, señales y postes SOS. El relleno indica el tipo y el borde, su estado de conservación.'],
          ['**Evidencias GPS**', 'Dónde se tomó cada fotografía.'],
          ['**PERIODO (7 / 30 / 90 días / Este año)**', 'Acota las capas que dependen de fechas: ejecución y evidencias.'],
          ['Los botones + y − , y la mira', 'Acercar, alejar y centrar en tu ubicación.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-25',
        titulo: 'Las cinco capas cargan y están en el sitio correcto',
        rol: 'Supervisor',
        pasos: [
          'Entra a **Mapa** y espera a que cargue.',
          'Enciende las cinco capas una por una desde el panel de la izquierda.',
          'Aleja el mapa hasta ver todo el contrato.',
          'Cambia el fondo a **Satélite**.',
        ],
        esperado: [
          'Las cinco capas muestran un número de elementos mayor que cero.',
          'Todo aparece en el **sur del Perú**: entre Camaná, Arequipa, Moquegua y Tacna. Si algo se dibuja en otra región, es una observación.',
          'Los puntos caen **sobre la carretera**, no en el desierto ni en el mar.',
          'El fondo satelital carga sin errores.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-26',
        titulo: 'Un PCI en el mapa lleva a su detalle',
        rol: 'Supervisor',
        pasos: [
          'Con la capa **Ítems de PCI** encendida, acerca el mapa hasta ver puntos separados.',
          'Pulsa uno.',
        ],
        esperado: [
          'Se abre una ficha con el código del PCI, el número de ítem, la descripción, la progresiva y los días que faltan para vencer.',
          'El color del punto corresponde al semáforo indicado en la ficha.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Inventario vial y vehículos',
    entrada:
      'El catálogo de todo lo que está en la vía y hay que conservar: alcantarillas, guardavías, señales, postes SOS. Cada elemento con su progresiva, su lado y su estado.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Inventario / Vehículos        ·        /inventario' },
      {
        tipo: 'controles',
        items: [
          ['**Todos los tipos**', 'Filtra por tipo de elemento.'],
          ['**Todos los estados**', 'Filtra por estado de conservación: bueno, regular, malo, crítico.'],
          ['Columnas de la lista', 'Código, Elemento, Tramo, Progresiva, Lado, Estado e Inspección (última revisión).'],
          ['**Editar elemento**', 'Cambia los datos del elemento, incluido su estado de conservación.'],
          ['**Eliminar elemento**', 'Lo da de baja. Queda registrado en la auditoría.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-27',
        titulo: 'Filtrar y localizar un elemento en el mapa',
        rol: 'Supervisor',
        pasos: [
          'Entra a **Inventario / Vehículos**.',
          'Filtra por **Estado: crítico**.',
          'Anota el código y la progresiva de un elemento.',
          'Ve a **Mapa**, enciende **Inventario vial** y búscalo en esa progresiva.',
        ],
        esperado: [
          'La lista filtrada solo muestra elementos en estado crítico.',
          'El elemento aparece en el mapa, en la progresiva anotada.',
          'Al pulsarlo en el mapa, la ficha muestra el mismo código.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · SSOMA',
    entrada:
      'Seguridad, salud ocupacional y medio ambiente. Reúne las charlas de cinco minutos con su asistencia firmada, los checklists, los ATS/IPERC y el control de los equipos de seguridad.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → SSOMA        ·        /ssoma' },
      { tipo: 'subtitulo', titulo: 'Las pestañas' },
      {
        tipo: 'controles',
        items: [
          ['**Charlas**', 'Las charlas de seguridad dictadas, con tema, expositor, duración y cuántos firmaron.'],
          ['**Checklists**', 'Las listas de verificación respondidas, con su porcentaje de cumplimiento y si hubo hallazgos.'],
          ['**ATS / IPERC**', 'Los análisis de trabajo seguro, con los peligros identificados, el riesgo máximo y las firmas.'],
          ['**Registrar asistencia**', 'Agrega asistentes a una charla y recoge su firma.'],
          ['**Firma del responsable**', 'La firma del expositor o del supervisor que aprueba.'],
          ['**Todas las cuadrillas**', 'Filtra por cuadrilla.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Campos de una charla' },
      {
        tipo: 'tabla',
        columnas: ['Campo', 'Obligatorio', 'Qué se escribe'],
        filas: [
          ['**Fecha**', 'Sí', 'El día de la charla. Por defecto hoy.'],
          ['**Cuadrilla**', 'Sí', 'A qué cuadrilla se le dictó.'],
          ['**Tema de la charla**', 'Sí', 'El asunto tratado: «Trabajos junto a vía con tránsito».'],
          ['**Expositor**', 'Sí', 'Quién la dictó.'],
          ['**Duración (minutos)**', 'No', 'De 1 a 120 minutos. Por defecto 5.'],
          ['**Hora de inicio**', 'No', 'Por defecto 07:05.'],
          ['**Lugar**', 'No', 'Dónde se dictó: «Frente de trabajo · km 12+400».'],
          ['**Contenido tratado**', 'No', 'El detalle de lo que se habló.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-28',
        titulo: 'Registrar una charla con asistencia firmada',
        rol: 'Ing. de seguridad',
        previo: 'Entra con `ssoma@sigov.dev`.',
        pasos: [
          'Entra a **SSOMA**, pestaña **Charlas**.',
          'Crea una charla nueva con fecha de hoy, cuadrilla **Cuadrilla 1**, tema `Prueba de charla de seguridad`, expositor `Paola Ríos Mendoza`, duración 5.',
          'Guarda.',
          'Abre la charla creada y pulsa **Registrar asistencia**.',
          'Agrega un asistente con nombre y DNI, y recoge su firma trazándola con el ratón.',
          'Guarda la firma.',
        ],
        esperado: [
          'La charla aparece en la lista con el contador de asistentes en 1.',
          'La firma trazada se guarda y se ve al abrir el asistente.',
          'La charla se puede descargar como formato oficial SIG-SST-F03 desde el apartado **Formatos**.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-29',
        titulo: 'Revisar un ATS/IPERC llegado del campo',
        rol: 'Ing. de seguridad',
        pasos: [
          'Entra a **SSOMA**, pestaña **ATS / IPERC**.',
          'Abre uno de los registros.',
          'Revisa los peligros, los controles y las firmas.',
        ],
        esperado: [
          'Se ven los peligros identificados con su riesgo y el control aplicado a cada uno.',
          'Aparece el **riesgo máximo** del documento.',
          'Se ve la cantidad de firmas recogidas y, al abrirlas, el trazo de cada una.',
          'Si el ATS es de conductor, se ve si quedó **apto** o **no apto**.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Vencimientos y Alertas',
    entrada:
      'Dos apartados que responden a la misma pregunta desde ángulos distintos: qué está por vencerse y qué requiere atención hoy.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Vencimientos        ·        /vencimientos' },
      {
        tipo: 'controles',
        items: [
          ['**Equipos**', 'Extintores, botiquines y kits antiderrame con su fecha de vencimiento y su próxima inspección.'],
          ['**Flota**', 'Los vehículos con el vencimiento del SOAT, la revisión técnica y demás papeles.'],
          ['**Servicio**', 'Los vencimientos propios del contrato.'],
          ['**Qué vence**', 'La columna que dice exactamente qué documento o elemento caduca.'],
          ['**Renovar**', 'Registra la renovación con la nueva fecha.'],
          ['**Ver PCI**', 'Cuando el vencimiento corresponde a un PCI, salta a su detalle.'],
        ],
      },
      { tipo: 'ruta', texto: 'Menú lateral → Alertas        ·        /alertas' },
      {
        tipo: 'controles',
        items: [
          ['**Alertas**', 'Lo que está abierto en la operación: PCIs por vencer, partes sin validar, gastos sin revisar.'],
          ['**Notificaciones**', 'Los avisos dirigidos a ti personalmente.'],
          ['«La operación está al día»', 'El mensaje que aparece cuando no hay nada pendiente. Si lo ves, no es un error.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-30',
        titulo: 'Los vencimientos ordenan por urgencia',
        rol: 'Ing. de seguridad',
        pasos: [
          'Entra a **Vencimientos**.',
          'Revisa las tres pestañas: Equipos, Flota y Servicio.',
        ],
        esperado: [
          'Lo que vence antes aparece primero.',
          'Lo ya vencido se distingue de lo que está por vencer.',
          'Cada fila dice qué vence y cuándo, no solo el nombre del elemento.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-31',
        titulo: 'El contador de alertas coincide con la lista',
        rol: 'Supervisor',
        pasos: [
          'Mira el número rojo junto a **Alertas** en el menú de la izquierda.',
          'Entra a **Alertas** y cuenta las filas.',
        ],
        esperado: [
          'El número del menú coincide con la cantidad de alertas abiertas.',
          'Al atender una alerta, el contador baja.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Auditoría',
    entrada:
      'El registro de quién cambió qué, cuándo y desde dónde. No se puede editar ni borrar desde el sistema: una bitácora que se puede tocar no sirve como bitácora. Es el único apartado reservado exclusivamente al Administrador.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Auditoría        ·        /auditoria' },
      {
        tipo: 'controles',
        items: [
          ['**Buscar por usuario o registro**', 'Filtra por el correo de quien hizo el cambio o por el identificador del registro.'],
          ['**Todos los módulos**', 'Filtra por qué tabla se tocó: parte diario, ítem de PCI, movimiento de caja, usuario…'],
          ['**Toda acción / Creaciones / Modificaciones / Eliminaciones**', 'Filtra por tipo de cambio.'],
          ['**7 / 30 / 90 días / Este año**', 'El periodo.'],
          ['Cada fila', 'Un cambio. Muestra la acción, el módulo, quién y hace cuánto.'],
          ['Al desplegar una fila', 'Se ve el **Antes** y el **Después** campo por campo, y la dirección IP desde donde se hizo.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-32',
        titulo: 'La auditoría registra un cambio real',
        rol: 'Administrador',
        pasos: [
          'Entra a **Inventario** y edita el estado de conservación de un elemento cualquiera. Anota su código.',
          'Ve a **Auditoría**.',
          'Filtra por el módulo correspondiente y busca el cambio.',
          'Despliega la fila.',
        ],
        esperado: [
          'El cambio aparece en la lista, con tu correo y la hora.',
          'Al desplegar se ve el valor **antes** y el valor **después**.',
          'No hay ningún botón para editar ni borrar el registro de auditoría.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-33',
        titulo: 'Nadie más entra a la auditoría',
        rol: 'Supervisor',
        pasos: [
          'Entra con `supervisor@sigov.dev`.',
          'Comprueba que **Auditoría** no aparece en el menú.',
          'Escribe a mano la dirección `https://sigov.vercel.app/auditoria`.',
        ],
        esperado: [
          'El apartado no está en el menú.',
          'Al escribir la dirección, el sistema **te devuelve al Dashboard**. No se alcanza a ver ningún registro.',
          'Repite con `ssoma@sigov.dev` y con `visor@sigov.dev`: el resultado debe ser el mismo.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Reportes, Formatos y Entregables',
    entrada:
      'Tres maneras de sacar la información del sistema: los reportes en PDF y Excel, los ocho formatos oficiales de Servicon, y el paquete completo que se entrega al cliente.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Reportes        ·        /reportes' },
      {
        tipo: 'parrafo',
        texto: 'Siete informes, cada uno con dos botones: **PDF** y **Excel**. Todos se generan en el navegador con los datos del periodo elegido arriba a la derecha.',
      },
      {
        tipo: 'tabla',
        columnas: ['Informe', 'Qué contiene'],
        filas: [
          ['**Reporte diario de ejecución**', 'Actividades ejecutadas por cuadrilla, con progresivas, metrados y conteo de evidencias.'],
          ['**Resumen de metrados**', 'Metrado acumulado por actividad y unidad, contra la meta programada.'],
          ['**Reporte de PCIs**', 'Ítems con su plazo, semáforo, responsable y estado de levantamiento.'],
          ['**Reporte SSOMA**', 'Charlas, asistencia firmada, checklists con hallazgos y ATS/IPERC del periodo.'],
          ['**Inventario vial**', 'Elementos por tipo, tramo y progresiva, con estado de conservación.'],
          ['**Caja chica**', 'Movimientos por cuadrilla y categoría, con comprobante y estado. **Solo lo ve el Administrador.**'],
          ['**Materiales e insumos**', 'Solicitudes con fecha de necesidad, cuadrilla, ítems y estado de atención.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-34',
        titulo: 'Descargar los siete informes en los dos formatos',
        rol: 'Administrador',
        pasos: [
          'Entra a **Reportes** con el periodo en **30 días**.',
          'Pulsa **PDF** en cada uno de los siete informes, uno por uno.',
          'Pulsa **Excel** en cada uno de los siete.',
          'Abre al menos dos PDF y dos Excel descargados.',
        ],
        esperado: [
          'Los 14 archivos se descargan sin error.',
          'Cada PDF lleva la marca SIGOV, el nombre del contrato, el cliente (COVINCA) y el periodo.',
          'Cada Excel tiene una hoja de **Portada** con los datos del informe y otra con los datos.',
          'Las tildes y la letra ñ se ven bien, no como símbolos raros.',
          'El informe de **Caja chica** aparece solo si entraste como Administrador.',
        ],
      },
      { tipo: 'ruta', texto: 'Menú lateral → Formatos        ·        /formatos' },
      {
        tipo: 'parrafo',
        texto: 'Los ocho formatos oficiales de Servicon, armados con lo que ya está registrado. Cada uno tiene su código de documento:',
      },
      {
        tipo: 'tabla',
        columnas: ['Código', 'Formato'],
        filas: [
          ['`SIG-OP-F01`', 'Reporte diario de actividades'],
          ['`SIG-SST-F02`', 'Análisis de Trabajo Seguro (ATS)'],
          ['`SIG-SST-F03`', 'Registro de inducción, capacitación y charla'],
          ['`SIG-SST-F04`', 'Check list de vehículo'],
          ['`SIG-SST-F05`', 'Check list de kit antiderrame'],
          ['`SIG-SST-F06`', 'Inspección de extintores'],
          ['`SIG-SST-F07`', 'Inspección de botiquín'],
          ['`SIG-SST-F08`', 'Registro de elementos de higiene'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-35',
        titulo: 'Ver, imprimir y descargar un formato oficial',
        rol: 'Ing. de seguridad',
        pasos: [
          'Entra a **Formatos**.',
          'Elige el formato **Reporte diario de actividades**.',
          'En la lista de documentos disponibles, elige uno.',
          'Pulsa la opción de **ver** (vista previa).',
          'Cierra y pulsa la de **descargar PDF**.',
          'Pulsa la de **imprimir**.',
          'Repite con el formato **Análisis de Trabajo Seguro**.',
        ],
        esperado: [
          'La vista previa abre el documento dentro del sistema.',
          'El PDF descargado lleva el código del formato arriba a la derecha (`SIG-OP-F01`), la versión y la fecha.',
          'Lleva el recuadro de marca SERVICON a la izquierda del título.',
          'Al final tiene el espacio de firmas.',
          'Imprimir abre el diálogo de impresión del navegador.',
        ],
      },
      { tipo: 'ruta', texto: 'Menú lateral → Entregables        ·        /paquetes' },
      {
        tipo: 'parrafo',
        texto: 'El paquete de entrega al cliente: un archivo ZIP con la estructura de carpetas que COVINCA espera y un índice en Excel que declara qué contiene.',
      },
      {
        tipo: 'controles',
        items: [
          ['Las ocho tarjetas de contenido', '`01_PROGRAMACION`, `02_REPORTES_DIARIOS`, `03_PCI`, `04_FOTOGRAFIAS`, `05_SSOMA`, `06_MATERIALES`, `07_INVENTARIO` y `08_GASTOS`. Se marcan y desmarcan pulsando la tarjeta.'],
          ['**08_GASTOS**', 'Solo aparece para el Administrador. Es la economía interna que el cliente no debe ver.'],
          ['**INDICE.xlsx**', 'Va siempre. Declara archivo por archivo qué contiene el paquete, con tipo, fecha y peso.'],
          ['**Desde / Hasta**', 'El periodo del paquete.'],
          ['**Sector**', 'Agrupa tramos por código de ruta. Solo aparece si el contrato tiene más de un sector.'],
          ['**Cuadrilla**', 'Limita el paquete a una cuadrilla.'],
          ['**Tramo**', 'Limita a un tramo. Si elegiste sector, solo se ofrecen los tramos de ese sector.'],
          ['**Subtramo (km)**', 'Dos casillas: desde y hasta, en kilómetros. Deja el tramo entero si se dejan vacías.'],
          ['**Programación**', 'Limita a una semana programada concreta.'],
          ['**PCI**', 'Limita a un documento PCI concreto.'],
          ['**Actividad**', 'Limita a una actividad del catálogo.'],
          ['**Armar paquete**', 'Genera el ZIP. Muestra el avance paso a paso mientras trabaja.'],
          ['**Cómo queda**', 'El recuadro de la derecha que dibuja el árbol de carpetas que tendrá el ZIP.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-36',
        titulo: 'Armar el paquete de entrega completo',
        rol: 'Administrador',
        pasos: [
          'Entra a **Entregables**.',
          'Comprueba que se ven las ocho tarjetas de contenido.',
          'Pon **Desde** en el primer día del mes pasado y **Hasta** en hoy.',
          'Deja todos los filtros en «Todas» / «Todos».',
          'Pulsa **Armar paquete** y espera. Puede tardar varios minutos.',
          'Cuando termine, abre el archivo ZIP descargado.',
        ],
        esperado: [
          'Mientras arma, se ve una barra de avance con el paso actual («Programación», «Partes diarios», «Panel fotográfico»…).',
          'Se descarga un ZIP con nombre `SUR_ENTREGA_<fecha>_a_<fecha>.zip`.',
          'Dentro hay ocho carpetas numeradas y el archivo `INDICE.xlsx`.',
          'La carpeta `04_FOTOGRAFIAS` tiene subcarpetas por día.',
          'El `INDICE.xlsx` lista los archivos con su carpeta, tipo, fecha y peso.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-37',
        titulo: 'El paquete del Visor no lleva gastos',
        rol: 'Visor',
        previo: 'Entra con `visor@sigov.dev`.',
        pasos: [
          'Entra a **Entregables**.',
          'Cuenta las tarjetas de contenido.',
          'Arma un paquete de los últimos 7 días.',
          'Abre el ZIP.',
        ],
        esperado: [
          'Se ven **siete** tarjetas, no ocho: no aparece `08_GASTOS`.',
          'El ZIP generado **no contiene** la carpeta `08_GASTOS`.',
          'El resto de carpetas sí está.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-38',
        titulo: 'Los filtros del paquete funcionan',
        rol: 'Administrador',
        pasos: [
          'En **Entregables**, elige la **Cuadrilla 1 · Calzada y Drenaje**.',
          'Marca solo la tarjeta **Reportes diarios**.',
          'Arma el paquete.',
          'Abre el ZIP y revisa los nombres de los archivos.',
        ],
        esperado: [
          'El ZIP trae únicamente la carpeta `02_REPORTES_DIARIOS` y el `INDICE.xlsx`.',
          'Todos los partes del ZIP son de la Cuadrilla 1; no hay ninguno de otra cuadrilla.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Documentos (archivo) e Importación',
    entrada:
      'El archivo guarda el papeleo del contrato y permite recorrerlo de dos maneras: como lista de documentos para buscar uno concreto, o como carpetas para revisar un mes completo. La importación carga información masiva desde Excel.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Documentos        ·        /archivo' },
      { tipo: 'subtitulo', titulo: 'Vista «Documentos»' },
      {
        tipo: 'controles',
        items: [
          ['**Buscar por nombre, archivo o descripción**', 'El buscador de documentos.'],
          ['Los atajos de colores', 'Contrato, PCI · OSITRAN, Programación, Reporte, SSOMA, Plano, Acta, Panel fotográfico, Normativa y Otro. Cada uno con su cantidad.'],
          ['**Subir documento**', 'Carga un archivo nuevo al archivo del contrato.'],
          ['Acciones de cada fila', 'Ver (vista previa), Descargar, Editar los datos y Eliminar.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Vista «Carpetas»' },
      { tipo: 'parrafo', texto: 'Cinco ramas que reproducen la estructura de archivo que pidió Servicon. Cada rama se abre por niveles, y al final de cada rama hay algo que se puede abrir o descargar.' },
      {
        tipo: 'tabla',
        columnas: ['Rama', 'Niveles', 'Qué hay al final'],
        filas: [
          ['**PROGRAMACION**', 'Semana → Sector → Cuadrilla → Fecha', 'La actividad con su meta, lo ejecutado y su estado.'],
          ['**PCI**', 'Código PCI → Ítem → Fecha → Antes/Durante/Después', 'Las fotografías, con botón **Ver**.'],
          ['**SSOMA**', 'Fecha → Cuadrilla → Tipo de documento', 'Charlas, ATS, checks de vehículo, higiene y equipos. Con botón **PDF** donde aplica.'],
          ['**GASTOS**', 'Fecha → Cuadrilla', 'Los movimientos con su importe. **Solo Administrador.**'],
          ['**REPORTES**', 'Fecha → Cuadrilla', 'El reporte diario, con botón **PDF**.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-39',
        titulo: 'Recorrer el archivo por carpetas',
        rol: 'Administrador',
        pasos: [
          'Entra a **Documentos** y pulsa la pestaña **Carpetas**.',
          'Pon el periodo en **90 días**.',
          'Pulsa la rama **PROGRAMACION** y abre una semana, luego un sector, luego una cuadrilla, luego una fecha.',
          'Cambia a la rama **PCI** y baja hasta ver una fotografía; pulsa **Ver**.',
          'Cambia a **REPORTES**, baja hasta un reporte y pulsa **PDF**.',
        ],
        esperado: [
          'Cada carpeta muestra a la derecha cuántos elementos tiene dentro.',
          'Al abrir una carpeta se despliegan sus hijas, con sangría.',
          'La fotografía se abre en grande.',
          'El **PDF** del reporte se descarga y es el formato `SIG-OP-F01`.',
          'La rama **GASTOS** solo aparece si entraste como Administrador.',
        ],
      },
      { tipo: 'ruta', texto: 'Menú lateral → Importación        ·        /importar' },
      {
        tipo: 'controles',
        items: [
          ['**Tipo**', 'Qué se va a importar: programación, ítems de PCI, inventario vial, etc.'],
          ['**Archivo** / «Arrastra el archivo o haz clic para elegirlo»', 'El Excel a cargar.'],
          ['**Mapeo de columnas**', 'El sistema detecta las columnas del Excel y las empareja con los campos. Aquí se corrige si se equivocó.'],
          ['**Validación**', 'Revisa fila por fila y muestra **Filas leídas**, **Válidas para importar** y **Con errores**.'],
          ['**¿A qué PCI pertenecen estos ítems?**', 'Cuando se importan ítems, hay que decir de qué documento son.'],
          ['**Resultado**', 'Lo que se importó al confirmar.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-40',
        titulo: 'La importación avisa antes de romper nada',
        rol: 'Supervisor',
        pasos: [
          'Entra a **Importación**.',
          'Elige un tipo y sube un archivo que no sea Excel (por ejemplo una foto).',
          'Observa qué dice el sistema.',
        ],
        esperado: [
          'El sistema rechaza el archivo con un mensaje claro y no importa nada.',
          'Si el archivo es un Excel con columnas que no corresponden, muestra el mapeo para corregir en vez de fallar en silencio.',
          'Las filas con error se listan indicando qué fila y qué problema tiene.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Configuración',
    entrada:
      'Donde se da de alta a la gente, se arman las cuadrillas, se declaran los tramos con sus progresivas, se mantiene el catálogo de actividades y se ajusta cómo se comporta el sistema en este contrato.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Configuración        ·        /configuracion' },
      { tipo: 'subtitulo', titulo: 'Las pestañas' },
      {
        tipo: 'controles',
        items: [
          ['**Usuarios**', 'Las personas del contrato. Campos: Nombre completo, Correo electrónico, Rol en el servicio, DNI, Teléfono, Cargo, Cuadrilla que lidera y Usuario activo.'],
          ['**Cuadrillas**', 'Las cuadrillas. Campos: Código, Nombre, Jefe de cuadrilla, Color en el mapa, Cuadrilla activa, y **Agregar integrante**.'],
          ['**Tramos**', 'Los tramos con su progresiva inicial y final, carriles y color. Es lo que valida las progresivas en todo el sistema.'],
          ['**Actividades**', 'El catálogo. Campos: Código, Nombre de la actividad, Categoría, unidad de medida, **Exige evidencia fotográfica**, **Fotos mínimas exigidas** y Actividad activa.'],
          ['**Servicios**', 'Los contratos y los **módulos habilitados** en cada uno.'],
          ['**Ajustes**', 'Cómo se sella la fotografía: qué datos se imprimen encima.'],
          ['**Dispositivo**', 'Los equipos que han sincronizado con este contrato.'],
          ['**Seguridad**', 'Los cinco roles y cómo se llaman en obra.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Qué se puede imprimir en el sello de la foto' },
      {
        tipo: 'tabla',
        columnas: ['Dato del sello', 'Qué imprime'],
        filas: [
          ['**Fecha**', 'El día de la toma, en hora de Perú.'],
          ['**Hora**', 'La hora exacta, junto a la fecha.'],
          ['**Coordenadas**', 'Latitud, longitud y precisión del GPS.'],
          ['**Progresiva**', 'El kilometraje, como `322+073`.'],
          ['**Tramo**', 'El nombre del tramo donde se tomó.'],
          ['**Actividad**', 'Qué trabajo documenta la foto.'],
          ['**Cuadrilla**', 'Quién ejecutó el trabajo.'],
          ['**Código de PCI**', 'Cuando la foto sustenta un levantamiento.'],
          ['**Firma SERVICON**', 'El sello de la empresa en la esquina.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-41',
        titulo: 'Cambiar el sello de la fotografía',
        rol: 'Administrador',
        pasos: [
          'Entra a **Configuración**, pestaña **Ajustes**.',
          'Apaga **Coordenadas** y **Código de PCI**; deja el resto encendido.',
          'Guarda.',
          'En el celular de `cuadrilla1@sigov.dev`, cierra y vuelve a abrir la aplicación para que baje los ajustes.',
          'Toma una foto de evidencia.',
          'Mira el sello impreso en la foto.',
        ],
        esperado: [
          'Aparece el aviso «Ajustes guardados» y la nota de que las cuadrillas los reciben al sincronizar.',
          'La foto nueva **no** lleva coordenadas ni código de PCI en el sello.',
          'Sí lleva fecha, hora, progresiva, tramo, actividad y cuadrilla.',
          'Las fotos tomadas **antes** del cambio conservan su sello original: no se modifican.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-42',
        titulo: 'Crear una actividad y verla en el celular',
        rol: 'Administrador',
        pasos: [
          'Entra a **Configuración**, pestaña **Actividades**.',
          'Crea una actividad nueva: código `PRU-01`, nombre `Actividad de prueba`, categoría cualquiera, unidad **metro**.',
          'Marca **Exige evidencia fotográfica** y pon **Fotos mínimas exigidas** en 2.',
          'Guarda.',
          'En el celular, cierra y vuelve a abrir la aplicación.',
          'Entra a **Reporte Diario** → **Registrar actividad** y despliega la lista de actividades.',
        ],
        esperado: [
          'La actividad aparece en la lista del celular.',
          'Al registrarla, el sistema exige las dos fotos antes de dar por completo el registro.',
        ],
      },
    ],
  },
]
