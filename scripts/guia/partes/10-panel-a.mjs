/**
 * El panel administrativo, primera mitad: ingreso, tablero, programación,
 * PCIs y reportes diarios.
 */

export const PANEL_A = [
  {
    titulo: 'Panel web · Ingreso y primeras impresiones',
    entrada:
      'Lo primero que se prueba es entrar. Parece obvio, pero aquí se comprueban cosas que después no se vuelven a mirar: que la contraseña equivocada avise bien, que la sesión se mantenga al recargar y que nadie pueda saltarse el ingreso escribiendo una dirección a mano.',
    bloques: [
      { tipo: 'ruta', texto: 'https://sigov.vercel.app/login' },
      { tipo: 'subtitulo', titulo: 'Qué hay en la pantalla de ingreso' },
      {
        tipo: 'controles',
        items: [
          ['Logotipo animado (arriba)', 'Las tres figuras del logotipo de Servicon giran una detrás de otra mientras la pantalla está abierta. Es el indicador de que el sistema está vivo; no es un botón.'],
          ['**Correo electrónico**', 'El correo de la cuenta. Acepta cualquier correo válido; el sistema no avisa si no existe hasta que se pulsa Ingresar (a propósito: decir «ese correo no existe» le confirmaría a un extraño qué cuentas hay).'],
          ['**Contraseña**', 'Se escribe oculta. El ojo de la derecha la muestra mientras se mantiene activado.'],
          ['**¿Olvidaste tu contraseña?**', 'Muestra un aviso indicando que el restablecimiento lo hace el Administrador del contrato. Por seguridad no hay auto-servicio.'],
          ['**Ingresar**', 'Valida y entra. Mientras verifica, el botón muestra un giro y queda deshabilitado para evitar doble envío.'],
          ['**Entrar con un rol de prueba**', 'Despliega la lista de las seis cuentas de demostración con un clic para cada una. Existe solo mientras el sistema esté en modo demostración; en producción real no aparece.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-01',
        titulo: 'Ingreso correcto',
        rol: 'Administrador',
        pasos: [
          'Abre `https://sigov.vercel.app/login` en el navegador.',
          'Escribe `admin@sigov.dev` en **Correo electrónico**.',
          'Escribe `Sigov2026!` en **Contraseña**.',
          'Pulsa el ojo de la derecha y comprueba que la contraseña se ve; vuelve a pulsarlo para ocultarla.',
          'Pulsa **Ingresar**.',
        ],
        esperado: [
          'Aparece un aviso verde arriba a la derecha que dice «Bienvenido a SIGOV».',
          'La pantalla pasa al **Dashboard** y la dirección del navegador termina en `/dashboard`.',
          'Arriba a la izquierda se lee tu nombre, **Luis Bravo Camus**, y debajo el rol **Administrador**.',
          'El menú de la izquierda muestra todos los apartados, incluida **Auditoría**.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-02',
        titulo: 'Contraseña equivocada',
        rol: 'Cualquiera',
        pasos: [
          'Si estás dentro, cierra sesión (arriba a la derecha, tu nombre → Cerrar sesión).',
          'En el ingreso escribe `admin@sigov.dev` y la contraseña `1234`.',
          'Pulsa **Ingresar**.',
        ],
        esperado: [
          'Aparece un recuadro rojo bajo los campos que dice: «Credenciales incorrectas. Verifica el correo y la contraseña».',
          'El mensaje **no** dice si el correo existe o si solo falló la contraseña.',
          'Sigues en la pantalla de ingreso; no entra al sistema.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-03',
        titulo: 'Nadie entra sin sesión escribiendo la dirección',
        rol: 'Sin sesión',
        previo: 'Tienes que estar **fuera** del sistema. Cierra sesión antes de empezar.',
        pasos: [
          'Escribe directamente en el navegador `https://sigov.vercel.app/caja` y pulsa Enter.',
          'Prueba también con `/auditoria` y con `/configuracion`.',
        ],
        esperado: [
          'En los tres casos el sistema te lleva a la pantalla de ingreso.',
          'No se alcanza a ver ningún dato, ni siquiera por un instante.',
          'Después de ingresar, el sistema te lleva a la pantalla que habías pedido y no al Dashboard.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-04',
        titulo: 'La sesión se mantiene al recargar',
        rol: 'Administrador',
        pasos: [
          'Con la sesión abierta, pulsa F5 o el botón de recargar del navegador.',
          'Cierra la pestaña del navegador y vuelve a abrir `https://sigov.vercel.app`.',
        ],
        esperado: [
          'Al recargar, aparece brevemente la pantalla de carga con el logotipo girando y el texto «Cargando tu contrato».',
          'Vuelves al mismo sitio sin que te pida la contraseña otra vez.',
          'Al abrir la dirección principal, entra directo al Dashboard.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Dashboard',
    entrada:
      'El tablero es la primera pantalla después de entrar. Resume el periodo elegido en cifras, gráficos y un mapa. Cambia según el rol: el Supervisor ve un tablero pensado para controlar cuadrillas, y el Jefe de cuadrilla ve el suyo propio.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Dashboard        ·        /dashboard' },
      { tipo: 'subtitulo', titulo: 'Qué hay en pantalla' },
      {
        tipo: 'controles',
        items: [
          ['Saludo con tu nombre', 'Cambia según la hora: «Buenos días», «Buenas tardes» o «Buenas noches», seguido de tu primer nombre.'],
          ['**7 días / 30 días / 90 días / Este año**', 'El periodo del que se calcula **todo** lo que está debajo. Es el control más importante de la pantalla: si los números salen en cero, lo primero es revisar si el periodo elegido tiene datos.'],
          ['**Indicadores principales**', 'Cuatro cifras grandes: Cumplimiento del plan, Metrado ejecutado, Evidencias capturadas e Ítems de PCI vencidos.'],
          ['**Partes por validar**', 'Cuántos reportes diarios enviaron las cuadrillas y todavía nadie revisó. Se puede pulsar para ir directo a la lista.'],
          ['**Actividad georreferenciada**', 'Un mapa pequeño con lo ejecutado en el periodo. Al pulsarlo se abre el mapa completo.'],
          ['**Cumplimiento SSOMA**', 'Porcentaje de charlas, checklists y ATS al día.'],
          ['**Estado del inventario vial**', 'Cómo está la conservación de los elementos de la vía: bueno, regular, malo o crítico.'],
          ['**En vivo desde las cuadrillas**', 'Los últimos registros que llegaron de campo, con hora.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-05',
        titulo: 'Los indicadores responden al periodo',
        rol: 'Administrador',
        pasos: [
          'Entra al Dashboard.',
          'Anota las cuatro cifras de **Indicadores principales** con el periodo en **30 días**.',
          'Cambia a **7 días** y espera a que termine de cargar.',
          'Cambia a **Este año**.',
        ],
        esperado: [
          'Con 7 días, las cifras de metrado y evidencias son **menores o iguales** que con 30 días.',
          'Con «Este año» son **mayores o iguales** que con 30 días.',
          'Ninguna cifra queda en blanco ni muestra «NaN», «undefined» o «null».',
          'Mientras carga se ven bloques grises animados, no la pantalla vacía.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-06',
        titulo: 'El tablero lleva a donde dice',
        rol: 'Administrador',
        pasos: [
          'En el Dashboard, pulsa la tarjeta **Partes por validar**.',
          'Vuelve atrás con el botón del navegador.',
          'Pulsa el mapa pequeño de **Actividad georreferenciada**.',
        ],
        esperado: [
          'La primera te lleva a **Reportes Diarios** con la lista filtrada por partes pendientes de validar.',
          'La segunda abre el apartado **Mapa** completo.',
          'La cantidad que mostraba la tarjeta coincide con la cantidad de filas que se ven en la lista.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-07',
        titulo: 'El tablero del Supervisor es distinto',
        rol: 'Supervisor',
        previo: 'Cierra sesión y entra con `supervisor@sigov.dev`.',
        pasos: [
          'Entra y observa el Dashboard.',
          'Compara con lo que viste como Administrador.',
        ],
        esperado: [
          'Se ve un tablero orientado al control de cuadrillas, con el estado de cada una.',
          'En el menú de la izquierda **no aparece Auditoría**.',
          'El resto de apartados sí aparece: Programación, PCIs, Campo, Caja chica, Mapa, SSOMA, Reportes, Configuración.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Programación semanal',
    entrada:
      'Aquí el Supervisor reparte el trabajo de la semana: qué actividad, en qué tramo, entre qué progresivas, qué cuadrilla y qué día. Es el punto de partida de todo lo demás: lo que la cuadrilla ve en su celular sale de esta pantalla.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Programación        ·        /programacion' },
      { tipo: 'subtitulo', titulo: 'Qué hay en pantalla' },
      {
        tipo: 'controles',
        items: [
          ['**Semana anterior / Semana siguiente**', 'Las dos flechas mueven la semana mostrada. Entre ellas se lee la semana y sus fechas.'],
          ['**Todas las cuadrillas**', 'Filtra la vista por una cuadrilla. Útil para revisar la carga de una sola.'],
          ['**Todos los estados**', 'Filtra por el estado de las partidas: Pendiente, En ejecución, Por validar, Culminada, Observada, Reprogramada o Anulada.'],
          ['**Importar programación**', 'Sube la programación desde un Excel en vez de cargarla a mano. Lleva a la pantalla de Importación.'],
          ['Vista de calendario / lista', 'Cambia entre ver la semana en cuadrícula por día o como lista ordenada.'],
          ['**Editar**', 'Abre la partida para cambiar actividad, tramo, progresivas, cuadrilla, fecha o meta.'],
          ['**Validar: la doy por culminada**', 'El Supervisor acepta que la partida está terminada. Solo aparece cuando la cuadrilla la marcó como terminada.'],
          ['**Devolver a campo**', 'Rechaza el trabajo y la partida vuelve a la cuadrilla con la observación.'],
          ['**Retirar de la programación**', 'Anula la partida. No la borra: queda anulada y con registro en la auditoría.'],
        ],
      },
      {
        tipo: 'nota',
        titulo: 'Ten en cuenta',
        texto: 'Las progresivas se escriben en **metros** y se muestran en formato de carretera. 18 400 metros se ve como **18+400**. Es el lenguaje de obra: el kilómetro 18 más 400 metros.',
      },
      {
        tipo: 'prueba',
        id: 'P-08',
        titulo: 'Crear una partida programada',
        rol: 'Supervisor',
        pasos: [
          'Entra a **Programación**.',
          'Sitúate en la semana actual con las flechas.',
          'Pulsa el botón de agregar (el de más, **+**) en el día de mañana.',
          'Elige la **Actividad** «Limpieza de cunetas».',
          'Elige el **Tramo** «AQP-02 · San Camilo – Montalvo – Moquegua».',
          'Escribe **Progresiva inicio** `150000` y **fin** `150500`.',
          'Elige la **Cuadrilla** «Cuadrilla 1 · Calzada y Drenaje».',
          'Escribe la **meta** (cantidad programada) `500`.',
          'Guarda.',
        ],
        esperado: [
          'La partida aparece en el día de mañana con estado **Pendiente**.',
          'La progresiva se muestra como **150+000 → 150+500**, no como 150000.',
          'La unidad de medida aparece sola según la actividad (metros para cunetas); no hay que elegirla.',
          'Si escribes una progresiva fuera del rango del tramo, el sistema avisa antes de guardar.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-09',
        titulo: 'La partida llega al celular de la cuadrilla',
        rol: 'Supervisor + Jefe de cuadrilla',
        previo: 'Haber hecho la prueba P-08. Necesitas el celular con la aplicación instalada y sesión de `cuadrilla1@sigov.dev`.',
        pasos: [
          'En el celular, abre la aplicación SIGOV.',
          'Entra a **Programación** desde el menú principal.',
          'Ubica el día de mañana.',
        ],
        esperado: [
          'Aparece la partida «Limpieza de cunetas» que acabas de crear.',
          'Muestra el tramo, la progresiva 150+000 → 150+500 y la meta de 500 m.',
          'Si no aparece, baja la pantalla para refrescar y vuelve a mirar.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-10',
        titulo: 'Duplicar la semana',
        rol: 'Supervisor',
        pasos: [
          'En **Programación**, sitúate en una semana que ya tenga partidas cargadas.',
          'Busca la opción de **duplicar semana** y úsala hacia la semana siguiente.',
          'Ve a la semana siguiente con la flecha.',
        ],
        esperado: [
          'Todas las partidas de la semana original aparecen copiadas en la semana siguiente, con las mismas actividades, tramos, progresivas y cuadrillas.',
          'Las copias están en estado **Pendiente**, aunque las originales estuvieran culminadas.',
          'No se duplicó el avance ni las evidencias: solo la programación.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · PCIs de OSITRAN',
    entrada:
      'Un PCI es un Pedido de Corrección de Incumplimiento que el regulador (OSITRAN) notifica a la concesionaria. Cada PCI trae ítems, y cada ítem tiene su propio plazo. Este apartado los administra: los registra, los reparte a las cuadrillas, avisa cuando están por vencer y guarda la evidencia del levantamiento.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → PCIs        ·        /pci' },
      { tipo: 'subtitulo', titulo: 'La lista de PCIs' },
      {
        tipo: 'controles',
        items: [
          ['**Ítems totales / abiertos / críticos / vencidos**', 'Las cuatro cifras de arriba. «Crítico» es lo que vence en pocos días; «vencido» es lo que ya pasó su plazo.'],
          ['**Todas las prioridades**', 'Filtra por prioridad del documento: alta, media o baja.'],
          ['**Nuevo PCI**', 'Registra a mano un PCI recibido. Abre el formulario que se describe abajo.'],
          ['**Importar Excel**', 'Carga varios PCIs de golpe desde la planilla que envía el regulador.'],
          ['Cada fila de la lista', 'Un documento PCI. Se pulsa para abrir su detalle con todos los ítems.'],
          ['El semáforo de colores', 'Verde: en plazo. Amarillo: por vencer. Rojo: crítico. Rojo oscuro: vencido. Celeste: levantado.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Los campos del formulario «Nuevo PCI»' },
      {
        tipo: 'tabla',
        columnas: ['Campo', 'Obligatorio', 'Qué se escribe'],
        filas: [
          ['**Código del PCI**', 'Sí', 'El código del documento, por ejemplo `PCI-2026-048`.'],
          ['**Título**', 'Sí', 'El asunto en una línea: «Deficiencias en el sistema de drenaje transversal».'],
          ['**Fuente**', 'Sí', 'Quién lo emite. Por defecto OSITRAN.'],
          ['**Prioridad**', 'Sí', 'Alta, media o baja. Por defecto media.'],
          ['**Fecha de notificación**', 'Sí', 'El día en que el regulador notificó. Por defecto hoy.'],
          ['**Fecha de recepción**', 'No', 'El día en que la empresa lo recibió, si es distinto.'],
          ['**Plazo base (días)**', 'Sí', 'Días de plazo para levantar los ítems. Por defecto 15; se admite de 1 a 365.'],
          ['**Descripción del incumplimiento**', 'No', 'El detalle de lo observado, el alcance y qué exige el regulador.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-11',
        titulo: 'Registrar un PCI nuevo',
        rol: 'Supervisor',
        pasos: [
          'Entra a **PCIs** y pulsa **Nuevo PCI**.',
          'Escribe el código `PCI-2026-PRUEBA`.',
          'Título: `Prueba de registro de PCI`.',
          'Deja Fuente en OSITRAN y Prioridad en media.',
          'Deja la fecha de notificación de hoy y el plazo en 15 días.',
          'Escribe en la descripción: `Registro creado durante las pruebas del sistema`.',
          'Guarda.',
        ],
        esperado: [
          'El PCI aparece en la lista con su código.',
          'El contador de **Ítems totales** no cambia todavía: el documento existe pero aún no tiene ítems.',
          'Al abrirlo se ve el detalle con la descripción que escribiste.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-12',
        titulo: 'El semáforo y el orden por vencimiento',
        rol: 'Supervisor',
        pasos: [
          'Entra a **PCIs** y abre cualquier documento con varios ítems.',
          'Mira la columna del semáforo de los ítems.',
          'Vuelve a la lista y observa el orden.',
        ],
        esperado: [
          'Los ítems vencidos aparecen en rojo y los levantados en otro color, claramente distinguibles.',
          'Junto a cada ítem se ve su fecha de vencimiento y cuántos días faltan (o cuántos pasaron).',
          'Lo más urgente aparece primero, no lo más reciente.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-13',
        titulo: 'Asignar un ítem de PCI a una cuadrilla',
        rol: 'Supervisor',
        pasos: [
          'Abre un PCI que tenga ítems sin asignar.',
          'Marca la casilla de uno o varios ítems (o usa **Seleccionar todos**).',
          'Asigna la **Cuadrilla 1 · Calzada y Drenaje**.',
          'Guarda.',
        ],
        esperado: [
          'Los ítems quedan con la cuadrilla asignada visible en la fila.',
          'En el celular de `cuadrilla1@sigov.dev`, apartado **PCIs**, aparecen esos ítems.',
          'El contador de PCIs del menú lateral y el del celular reflejan el cambio.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-14',
        titulo: 'El tablero de PCI',
        rol: 'Supervisor',
        pasos: [
          'Entra a **PCIs** y abre la vista de **tablero** (`/pci/tablero`).',
          'Revisa las columnas y los filtros.',
        ],
        esperado: [
          'Los ítems están agrupados por estado o por urgencia, en columnas.',
          'Se puede filtrar por cuadrilla y por tramo.',
          'Las cantidades de cada columna suman el total de ítems del contrato.',
        ],
      },
    ],
  },

  {
    titulo: 'Panel web · Reportes diarios (Campo)',
    entrada:
      'Aquí llega lo que las cuadrillas registran desde el celular. Cada parte diario es de una cuadrilla y un día, y dentro lleva las actividades ejecutadas con su metrado, sus progresivas y sus fotos. El Supervisor los revisa y los valida u observa.',
    bloques: [
      { tipo: 'ruta', texto: 'Menú lateral → Reportes Diarios (Administrador) / Campo (Supervisor)        ·        /campo' },
      { tipo: 'subtitulo', titulo: 'Qué hay en pantalla' },
      {
        tipo: 'controles',
        items: [
          ['Las cuatro cifras de arriba', 'Registros del periodo, Metrado ejecutado, Evidencias y Partes por validar.'],
          ['**Todos los estados**', 'Filtra por Borrador, Por validar, Validado u Observado.'],
          ['**Todas las cuadrillas**', 'Filtra por cuadrilla.'],
          ['**7 / 30 / 90 días / Este año**', 'El periodo mostrado.'],
          ['**Abrir parte de hoy**', 'Crea o abre el parte del día. Es la vía por la que el Supervisor puede registrar en nombre de una cuadrilla cuando hace falta.'],
          ['Cada fila', 'Un parte diario. Muestra fecha, cuadrilla, estado y cuántos registros lleva. Se pulsa para abrirlo.'],
        ],
      },
      { tipo: 'subtitulo', titulo: 'Dentro de un parte diario' },
      {
        tipo: 'controles',
        items: [
          ['Lista de actividades ejecutadas', 'Cada una con actividad, tramo, progresivas, lado, cantidad y las fotos que se le tomaron.'],
          ['**Editar registro**', 'Cambia los datos de una actividad ejecutada. Abre los campos Actividad, Tramo, Progresiva inicio, Progresiva fin, Lado, Cantidad y Observación.'],
          ['**Calcular con GPS**', 'Rellena las progresivas a partir de la coordenada de las fotos del registro, en vez de escribirlas a mano.'],
          ['**Eliminar registro**', 'Quita una actividad del parte. Queda registrado en la auditoría.'],
          ['**Ver este registro en el informe**', 'Salta al mismo registro dentro del informe imprimible.'],
          ['**Validar**', 'El Supervisor da el parte por bueno. Cambia el estado a Validado.'],
          ['**Observar**', 'Lo devuelve a la cuadrilla con una observación escrita.'],
          ['**Observación del supervisor**', 'El texto que se le deja a la cuadrilla al observar el parte.'],
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-15',
        titulo: 'Revisar y validar un parte diario',
        rol: 'Supervisor',
        previo: 'Debe existir al menos un parte en estado «Por validar». Si no hay, haz primero la prueba E-01.',
        pasos: [
          'Entra a **Campo** y filtra por estado **Por validar**.',
          'Abre el primer parte de la lista.',
          'Revisa las actividades: comprueba que cada una tenga tramo, progresivas y cantidad.',
          'Abre una foto de evidencia pulsando sobre ella.',
          'Cierra la foto y pulsa **Validar**.',
        ],
        esperado: [
          'La foto se abre en grande y muestra el sello con fecha, hora y coordenada.',
          'Al validar, el estado del parte cambia a **Validado** y aparece un aviso de confirmación.',
          'El contador de **Partes por validar** baja en uno.',
          'En el celular de la cuadrilla, el parte figura como validado.',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-16',
        titulo: 'Observar un parte y devolverlo',
        rol: 'Supervisor',
        pasos: [
          'Abre otro parte en estado **Por validar**.',
          'Pulsa **Observar**.',
          'Escribe en la observación: `Falta la foto del después en la primera actividad`.',
          'Confirma.',
        ],
        esperado: [
          'El parte queda en estado **Observado** y se ve la observación escrita.',
          'La cuadrilla puede ver esa observación desde su celular.',
          'El parte deja de contar como «Por validar».',
        ],
      },
      {
        tipo: 'prueba',
        id: 'P-17',
        titulo: 'Corregir una progresiva mal escrita',
        rol: 'Supervisor',
        pasos: [
          'Abre cualquier parte diario.',
          'En una actividad, pulsa **Editar registro**.',
          'Cambia la **Progresiva fin** a un valor mayor que el inicio.',
          'Guarda.',
          'Repite y esta vez escribe una progresiva **fuera del rango del tramo** (por ejemplo `999000`).',
        ],
        esperado: [
          'El primer cambio se guarda y la progresiva se muestra en formato de carretera.',
          'El segundo cambio muestra una advertencia indicando que esa progresiva queda fuera del tramo y su rango declarado.',
          'La advertencia dice entre qué progresivas va el tramo.',
        ],
      },
    ],
  },
]
