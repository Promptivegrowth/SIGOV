/**
 * Lo que hay que saber antes de tocar el sistema: para qué sirve esta guía,
 * cómo se anota una observación, dónde está cada cosa y con qué usuario se
 * entra.
 */

export const PRELIMINARES = [
  {
    titulo: 'Para qué sirve esta guía y cómo se usa',
    entrada:
      'Esta guía sirve para probar SIGOV de punta a punta y dejar por escrito qué funcionó y qué no. No es un manual de venta ni un resumen: es la lista de todo lo que el sistema hace hoy, pantalla por pantalla, botón por botón y campo por campo.',
    bloques: [
      { tipo: 'parrafo', texto: 'La guía está armada para que la use alguien que **no conoce el sistema**. Cada prueba dice con qué usuario entrar, qué tocar, en qué orden, y qué debe pasar. Si lo que pasa es distinto, eso es una observación y hay que anotarla.' },
      {
        tipo: 'parrafo',
        texto: 'El documento tiene tres partes que conviene recorrer en orden: primero el **panel administrativo web**, después la **aplicación de campo (Android)**, y al final los **recorridos completos**, que son los que cruzan las dos: se registra algo en el celular y se comprueba que llega al panel.',
      },
      { tipo: 'subtitulo', titulo: 'Cómo se lee una prueba' },
      { tipo: 'parrafo', texto: 'Cada prueba viene en un recuadro con esta forma:' },
      {
        tipo: 'controles',
        items: [
          ['El código (P-01, A-03…)', 'Sirve para citarla al reportar. **P-** son pruebas del panel web, **A-** de la aplicación Android, **E-** los recorridos de extremo a extremo y **R-** las de permisos por rol.'],
          ['La etiqueta verde de la derecha', 'Con qué usuario hay que estar dentro para hacerla. Si dice «Administrador», hay que salir y entrar con esa cuenta.'],
          ['Antes de empezar', 'Lo que tiene que existir para que la prueba tenga sentido. Si no se cumple, la prueba no vale.'],
          ['Los pasos numerados', 'Se hacen en ese orden exacto. Si un paso no se puede hacer, se detiene ahí y se anota.'],
          ['Debe ocurrir', 'El resultado correcto. Todo lo que está en esa lista tiene que cumplirse; basta que falle uno para marcar «Con observación».'],
          ['Resultado', 'Se marca una de las tres casillas y, si hay observación, se escribe en las dos líneas de abajo.'],
        ],
      },
      {
        tipo: 'ojo',
        titulo: 'Importante',
        texto: 'Marca **Conforme** solo si se cumplió **todo** lo que dice «Debe ocurrir». Si algo se ve raro pero funciona, igual se marca «Con observación» y se describe: el detalle estético también cuenta.',
      },
      { tipo: 'subtitulo', titulo: 'Cómo anotar una observación' },
      { tipo: 'parrafo', texto: 'Para que una observación se pueda corregir, necesita cuatro cosas. Sin ellas, quien la reciba no puede reproducirla:' },
      {
        tipo: 'lista',
        orden: true,
        items: [
          '**Código de la prueba y paso**, por ejemplo «P-14, paso 3».',
          '**Con qué usuario** estabas (correo) y en qué equipo: navegador de escritorio o celular, y qué modelo.',
          '**Qué esperabas y qué pasó**, en una línea cada uno. «Debía guardar el gasto y apareció un error rojo que decía…».',
          '**Captura de pantalla.** En el celular: botón de encendido y volumen abajo a la vez. En la computadora: tecla `Impr Pant`, o `Win + Shift + S` para recortar.',
        ],
      },
      {
        tipo: 'dato',
        titulo: 'Sugerencia',
        texto: 'Si una misma falla aparece en varias pantallas, anótala una sola vez y menciona en cuáles. Ahorra tiempo a todos.',
      },
      { tipo: 'subtitulo', titulo: 'Qué necesitas tener a la mano' },
      {
        tipo: 'lista',
        items: [
          'Una **computadora** con Chrome, Edge o Firefox actualizado, e internet.',
          'Un **celular Android** con la aplicación SIGOV instalada, o el emulador si se prueba en oficina.',
          'Esta guía **impresa** o en otra pantalla, para ir marcando.',
          'Un lapicero. Las casillas están pensadas para marcarse a mano.',
        ],
      },
    ],
  },

  {
    titulo: 'Accesos, direcciones y usuarios de prueba',
    entrada:
      'Todas las pruebas de esta guía se hacen sobre el contrato de demostración «Conservación Vial · Arequipa – Moquegua – Tacna», cuyo cliente es COVINCA. Los datos que verás son de prueba, pero el sistema es el real.',
    bloques: [
      { tipo: 'subtitulo', titulo: 'Dónde está cada cosa' },
      {
        tipo: 'tabla',
        columnas: ['Qué', 'Dónde', 'Para quién'],
        filas: [
          ['Panel administrativo web', '`https://sigov.vercel.app`', 'Administrador, Supervisor, Ing. de seguridad, Visor COVINCA y Jefe de cuadrilla'],
          ['Aplicación de campo (Android)', 'Archivo `app-debug.apk`, se instala en el celular', 'Solo Jefe de cuadrilla'],
          ['Pantalla de ingreso', '`https://sigov.vercel.app/login`', 'Todos'],
        ],
      },
      {
        tipo: 'nota',
        titulo: 'Ten en cuenta',
        texto: 'El panel web también abre en el celular y se adapta a la pantalla, pero la aplicación de campo es la que funciona **sin señal**. Para las pruebas de campo hay que usar la aplicación, no el navegador del celular.',
      },
      { tipo: 'subtitulo', titulo: 'Usuarios de prueba' },
      { tipo: 'parrafo', texto: 'Todas las cuentas usan la **misma contraseña**. Escríbela tal cual, respetando la mayúscula inicial y el signo de admiración del final:' },
      {
        tipo: 'ruta',
        texto: 'Contraseña de todas las cuentas:  Sigov2026!',
      },
      {
        tipo: 'tabla',
        columnas: ['Correo', 'Nombre', 'Puesto', 'Rol en el sistema', 'Cuadrilla'],
        filas: [
          ['`admin@sigov.dev`', 'Luis Bravo Camus', 'Director de Operaciones', 'Administrador', '—'],
          ['`supervisor@sigov.dev`', 'Elvis Dueñas Cabrera', 'Coordinador de Contrato', 'Supervisor', '—'],
          ['`cuadrilla1@sigov.dev`', 'Marco Quispe Ramos', 'Jefe de Cuadrilla A', 'Jefe de cuadrilla', 'CUA-01 · Calzada y Drenaje'],
          ['`cuadrilla2@sigov.dev`', 'Rosa Huamán Ticona', 'Jefe de Cuadrilla B', 'Jefe de cuadrilla', 'CUA-02 · Señalización'],
          ['`cuadrilla3@sigov.dev`', 'Julio Cárdenas Vega', 'Jefe de Cuadrilla C', 'Jefe de cuadrilla', 'CUA-03 · Derecho de vía'],
          ['`ssoma@sigov.dev`', 'Paola Ríos Mendoza', 'Ing. de Seguridad y Salud', 'Ing. de seguridad', '—'],
          ['`visor@sigov.dev`', 'Supervisión OSITRAN', 'Visor externo', 'Visor (solo lectura)', '—'],
        ],
      },
      {
        tipo: 'ojo',
        titulo: 'Atención',
        texto: 'Existe una séptima cuenta, `cuadrilla4@sigov.dev` (Nélida Sánchez Poma), que pertenece a **otro contrato** (Conservación Huaura – Sayán). Sirve para la prueba R-05, que comprueba que un jefe de cuadrilla no puede ver la información de un contrato ajeno. No la uses para el resto de pruebas.',
      },
      { tipo: 'subtitulo', titulo: 'Para la aplicación Android' },
      { tipo: 'parrafo', texto: 'La aplicación de campo **solo acepta cuentas de Jefe de cuadrilla**. Si intentas entrar con el Administrador o el Supervisor, la aplicación te dejará pasar pero no encontrará ninguna cuadrilla y las pantallas saldrán vacías: eso es correcto, no es una falla.' },
      {
        tipo: 'tabla',
        columnas: ['Correo para el celular', 'Contraseña', 'Qué cuadrilla dirige'],
        filas: [
          ['`cuadrilla1@sigov.dev`', '`Sigov2026!`', 'CUA-01 · Cuadrilla 1 · Calzada y Drenaje'],
          ['`cuadrilla2@sigov.dev`', '`Sigov2026!`', 'CUA-02 · Cuadrilla 2 · Señalización'],
          ['`cuadrilla3@sigov.dev`', '`Sigov2026!`', 'CUA-03 · Cuadrilla 3 · Derecho de vía'],
        ],
      },
      {
        tipo: 'dato',
        titulo: 'Recomendación',
        texto: 'Haz las pruebas de la aplicación con **`cuadrilla1@sigov.dev`**. Es la cuadrilla que tiene programación, PCIs asignados, caja abierta y fotos cargadas, así que todas las pantallas tendrán contenido que revisar.',
      },
    ],
  },

  {
    titulo: 'Los seis roles y qué puede hacer cada uno',
    entrada:
      'SIGOV no muestra lo mismo a todos. Cada rol ve un menú distinto y tiene permisos distintos. Conviene entender esto antes de probar, porque buena parte de las pruebas consiste justamente en comprobar que nadie ve lo que no le toca.',
    bloques: [
      {
        tipo: 'tabla',
        columnas: ['Rol', 'Cómo se le llama en obra', 'Qué hace en el sistema'],
        filas: [
          ['**Administrador**', 'Coordinador de contrato', 'Control total: usuarios, catálogos, configuración, auditoría y los gastos de caja chica. Es el único que ve la economía interna.'],
          ['**Supervisor**', 'Inspector', 'Programa la semana, valida los partes diarios, gestiona los PCIs y emite los reportes.'],
          ['**Jefe de cuadrilla**', 'Capataz', 'Registra en campo lo ejecutado, las fotos, los gastos y el SSOMA. Es el único que usa la aplicación del celular.'],
          ['**Ing. de seguridad**', 'Ingeniero SSOMA', 'Charlas, checklists, ATS/IPERC, equipos de seguridad y vencimientos.'],
          ['**Visor**', 'Cliente COVINCA · solo lectura', 'Mira y descarga. No puede escribir nada, y **no ve la caja chica ni los gastos**.'],
        ],
      },
      {
        tipo: 'ojo',
        titulo: 'Regla que se prueba varias veces',
        texto: 'El cliente (COVINCA, usuario **Visor**) **no debe ver en ninguna parte** la información económica interna de Servicon: caja chica, gastos, montos ni saldos. Si en algún momento un Visor ve un importe en soles de caja, eso es una observación grave y hay que anotarla de inmediato.',
      },
      { tipo: 'subtitulo', titulo: 'Qué menú ve cada rol' },
      { tipo: 'parrafo', texto: 'El menú de la izquierda cambia según quién entra, y algunos apartados **cambian de nombre** según el rol. No es un error: el jefe de cuadrilla no llama «Campo» a su reporte diario.' },
      {
        tipo: 'tabla',
        columnas: ['Apartado', 'Administrador', 'Supervisor', 'Jefe de cuadrilla', 'Ing. seguridad', 'Visor'],
        filas: [
          ['Dashboard / Inicio', 'Sí', 'Sí', 'Sí («Inicio»)', 'Sí', 'Sí'],
          ['Mi Jornada', 'No', 'No', 'Sí', 'No', 'No'],
          ['Programación', 'Sí', 'Sí', 'Sí', 'No', 'Sí'],
          ['PCIs', 'Sí', 'Sí', 'Sí', 'No', 'Sí'],
          ['Campo / Reportes Diarios', 'Sí («Reportes Diarios»)', 'Sí («Campo»)', 'Sí («Reporte Diario»)', 'No', 'Sí («Ejecución / Campo»)'],
          ['Caja chica', 'Sí', 'Sí', 'Sí («Registro de Gastos / Mi Caja»)', 'No', '**No**'],
          ['Materiales / Insumos', 'Sí', 'Sí', 'Sí', 'No', 'Sí'],
          ['Fotos / Evidencias', 'Sí', 'Sí', 'Sí', 'Sí («Evidencias SSOMA»)', 'Sí («Fotografías»)'],
          ['Mi Avance', 'No', 'No', 'Sí', 'No', 'No'],
          ['Sincronización', 'No', 'No', 'Sí', 'No', 'No'],
          ['Alertas', 'Sí', 'Sí', 'No', 'Sí', 'No'],
          ['Mapa', 'Sí', 'Sí', 'No', 'Sí', 'Sí'],
          ['Inventario / Vehículos', 'Sí', 'Sí', 'No', 'Sí', 'Sí'],
          ['SSOMA', 'Sí', 'Sí', 'No', 'Sí', 'Sí'],
          ['Vencimientos', 'Sí', 'Sí', 'No', 'Sí', 'No'],
          ['Auditoría', '**Solo él**', 'No', 'No', 'No', 'No'],
          ['Reportes', 'Sí', 'Sí', 'No', 'Sí', 'Sí'],
          ['Formatos', 'Sí', 'Sí', 'No', 'Sí', 'No'],
          ['Entregables (paquete)', 'Sí', 'Sí', 'No', 'No', 'Sí'],
          ['Documentos / Archivo', 'Sí', 'Sí', 'No', 'Sí', 'Sí'],
          ['Importación', 'Sí', 'Sí', 'No', 'No', 'No'],
          ['Configuración', 'Sí', 'Sí', 'No', 'No', 'No'],
        ],
      },
      {
        tipo: 'nota',
        titulo: 'Ten en cuenta',
        texto: 'Esta tabla es la que se comprueba en las pruebas **R-01 a R-06**. Tenla a la mano cuando llegues a ese capítulo.',
      },
    ],
  },
]
