/**
 * SIGOV · Contenido de la guía de uso.
 *
 * Todo lo que está aquí describe funciones que existen en el sistema. Si algo
 * no está construido, aparece en el capítulo «Estado de la implementación» y
 * no antes: una guía que promete de más se vuelve en contra en la primera
 * reunión.
 *
 * Bloques disponibles:
 *   { t:'h1', x, n }   título de capítulo con su número
 *   { t:'h2', x, n }   subtítulo
 *   { t:'h3', x }      encabezado menor
 *   { t:'p',  x }      párrafo (admite **negrita** y `código`)
 *   { t:'ul', x:[] }   lista con viñetas
 *   { t:'ol', x:[] }   lista numerada (pasos)
 *   { t:'tabla', cab:[], filas:[[]], anchos:[] }
 *   { t:'ejemplo', x:[] }   caja ámbar: qué hacer para probarlo
 *   { t:'ver', x:[] }       caja azul: qué debe pasar
 *   { t:'aviso', x:[] }     caja gris: advertencias
 *   { t:'salto' }      salto de página
 */

export const PORTADA = {
  titulo: 'Guía de uso del sistema',
  subtitulo: 'Plataforma web y aplicación móvil (PWA) para la gestión del mantenimiento vial rutinario',
  cliente: 'ETS VALERIA S.A.C.',
  autor: 'Promptive · Luciérnaga & Asociados S.A.C.',
  pie: 'Documento de entrega al cliente. Uso interno de ETS VALERIA.',
  archivo: 'SIGOV - Guia de uso del sistema.docx',
  datos: [
    ['Cliente', 'ETS VALERIA S.A.C. · RUC 20600222393'],
    ['Sistema', 'SIGOV · Sistema Integral de Gestión Operativa Vial'],
    ['Dirección de acceso', 'https://sigov.vercel.app'],
    ['Tipo de aplicación', 'Aplicación web instalable (PWA) para celular, tablet y computadora'],
    ['Versión del sistema', '1.0.0'],
    ['Fecha del documento', new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Elaborado por', 'Promptive · Luciérnaga & Asociados S.A.C.'],
  ],
}

export const CONTENIDO = [

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Contenido' },
  { t: 'tabla', anchos: [8, 44, 8, 40], cab: ['N.º', 'Capítulo', 'N.º', 'Capítulo'], filas: [
    ['1', 'Antes de empezar', '9', 'Mapa'],
    ['2', 'Los cinco roles', '10', 'Reportes'],
    ['3', 'Tablero de control', '11', 'Archivo documental'],
    ['4', 'Programación semanal', '12', 'Importación desde Excel'],
    ['5', 'Campo · el parte diario', '13', 'Configuración'],
    ['6', 'PCI · requerimientos de OSITRAN', '14', 'Mi perfil'],
    ['7', 'SSOMA', '15', 'Trabajar sin señal'],
    ['8', 'Inventario vial', '16', 'Seguridad y trazabilidad'],
    ['', '', '17', 'Ejercicios guiados'],
    ['', '', '18', 'Estado de la implementación'],
    ['', '', '19', 'Glosario'],
  ]},

  { t: 'p', x: 'Esta guía recorre el sistema pantalla por pantalla. En cada módulo se explica para qué sirve, qué muestra, qué hace cada botón y qué se escribe en cada campo. Al final de cada apartado hay un ejemplo concreto para probarlo con los datos que hoy están cargados.' },

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Antes de empezar', n: '1' },

  { t: 'h2', x: 'Qué es SIGOV', n: '1.1' },
  { t: 'p', x: 'SIGOV es el sistema donde ETS VALERIA registra y controla el mantenimiento rutinario de la vía: lo que se programa, lo que la cuadrilla ejecuta cada día, la evidencia fotográfica de ese trabajo, los requerimientos del supervisor del contrato, la seguridad y salud en obra, y el inventario de los elementos de la carretera.' },
  { t: 'p', x: 'Toda la información vive en una base de datos en la nube, no en archivos sueltos ni en carpetas compartidas. Cada dato queda asociado a un contrato, a una cuadrilla, a un tramo y a una progresiva, y con el nombre de quién lo registró y a qué hora.' },
  { t: 'p', x: 'El sistema es una **aplicación web instalable**: se abre en el navegador, pero se puede instalar en el celular y en la computadora como si fuera una aplicación normal, y **sigue funcionando cuando no hay señal**. Eso último es la razón de ser del diseño: en carretera la conexión va y viene.' },

  { t: 'h2', x: 'Cómo se entra', n: '1.2' },
  { t: 'p', x: 'Se abre `https://sigov.vercel.app` en cualquier navegador moderno (Chrome, Edge, Safari). La pantalla de ingreso tiene dos campos:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se escribe', 'Obligatorio'], filas: [
    ['Correo electrónico', 'El correo que le asignó el administrador del contrato.', 'Sí'],
    ['Contraseña', 'Su contraseña personal. El ícono del ojo, a la derecha, permite verla mientras la escribe para comprobar que no hay error.', 'Sí'],
  ]},
  { t: 'p', x: 'El botón **Ingresar** valida las credenciales y lleva al tablero. Si el correo o la contraseña no coinciden, aparece un mensaje en rojo y no se avanza.' },
  { t: 'p', x: 'Debajo hay una sección **Acceso rápido · desarrollo** con seis tarjetas, una por rol. Sirven para recorrer el sistema durante la etapa de pruebas: un clic entra con ese rol usando una contraseña común. Esa sección se desactiva antes del uso real (ver el capítulo 18).' },

  { t: 'h2', x: 'Instalar la aplicación en el celular', n: '1.3' },
  { t: 'p', x: 'Instalarla no es obligatorio, pero conviene: se abre desde el ícono, ocupa toda la pantalla sin la barra del navegador, y guarda mejor la información cuando no hay señal.' },
  { t: 'h3', x: 'En Android (Chrome)' },
  { t: 'ol', x: [
    'Abrir `https://sigov.vercel.app` en Chrome e ingresar con su usuario.',
    'Tocar los tres puntos del navegador, arriba a la derecha.',
    'Elegir **Instalar aplicación** o **Agregar a la pantalla de inicio**.',
    'Confirmar. El ícono de SIGOV queda entre las demás aplicaciones del celular.',
  ]},
  { t: 'h3', x: 'En iPhone (Safari)' },
  { t: 'ol', x: [
    'Abrir la dirección en **Safari** (en iPhone debe ser Safari, no Chrome).',
    'Tocar el botón de compartir, el cuadrado con la flecha hacia arriba.',
    'Bajar y elegir **Agregar a inicio**.',
    'Confirmar con **Agregar**.',
  ]},
  { t: 'h3', x: 'En la computadora (Chrome o Edge)' },
  { t: 'p', x: 'En la barra de direcciones aparece un ícono de instalación a la derecha; también se puede desde el menú del navegador, en **Instalar SIGOV**. Queda como un programa más, con su ventana propia.' },
  { t: 'aviso', x: [
    'La primera vez que entra, el navegador pedirá permiso para usar la **ubicación**. Hay que aceptarlo: sin ubicación no se pueden sellar las fotos ni calcular progresivas.',
    'En el celular pedirá también permiso de **cámara** la primera vez que tome una foto.',
  ]},

  { t: 'h2', x: 'Lo que está siempre en pantalla', n: '1.4' },
  { t: 'p', x: 'Estos elementos acompañan al usuario en todo el sistema:' },
  { t: 'tabla', anchos: [26, 74], cab: ['Elemento', 'Para qué sirve'], filas: [
    ['Menú lateral', 'La lista de módulos. En computadora está siempre a la izquierda y se puede contraer; en celular se abre con el ícono de las tres rayas.'],
    ['Selector de contrato', 'Arriba del menú. Si el usuario pertenece a más de un contrato, aquí cambia de uno a otro. Toda la información de la pantalla cambia con él.'],
    ['Buscador global', 'La lupa de arriba, o las teclas Ctrl + K. Busca al mismo tiempo en ítems de PCI, inventario, catálogo de actividades y personas.'],
    ['Campana de avisos', 'Notificaciones del sistema: PCI por vencer, partes por validar y avisos de la operación.'],
    ['Modo claro / oscuro', 'El ícono de la luna cambia el tema. El oscuro se agradece de noche y ahorra batería.'],
    ['Estado de sincronización', 'Al pie del menú. Dice **Todo sincronizado** y cuándo fue la última vez, o cuántos registros están esperando señal.'],
    ['Su avatar', 'Arriba a la derecha. Da acceso a su perfil y a cerrar sesión.'],
    ['Barra inferior (celular)', 'En el teléfono, los módulos de uso diario quedan a mano abajo: Inicio, Campo, Programación, PCIs y SSOMA.'],
  ]},

  { t: 'ejemplo', x: [
    '**Pruebe el buscador.** Presione `Ctrl + K` y escriba `alcantarilla`.',
    'Verá resultados agrupados por origen: ítems de PCI, inventario vial y catálogo de actividades. Escriba ahora un apellido, por ejemplo `quispe`: también encuentra personas.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Los cinco roles', n: '2' },
  { t: 'p', x: 'Cada usuario entra con un rol, y el rol decide qué módulos ve y qué puede hacer dentro de ellos. No es una cortesía visual: el servidor rechaza cualquier operación que el rol no tenga permitida, aunque alguien intente forzarla.' },

  { t: 'tabla', anchos: [22, 24, 54], cab: ['Rol en el sistema', 'Como se le llama en obra', 'Qué puede hacer'], filas: [
    ['Administrador', 'Coordinador de contrato', 'Todo: crear contratos, usuarios, cuadrillas, tramos y actividades; programar; validar partes; gestionar PCI y SSOMA; importar y emitir reportes.'],
    ['Supervisor', 'Inspector', 'Programa la semana, valida los partes de las cuadrillas, gestiona los PCI, administra los catálogos y emite reportes.'],
    ['Jefe de cuadrilla', 'Capataz', 'Registra el trabajo de su cuadrilla: parte diario, metrados, fotos, checklists y ATS. Es el único rol pensado para trabajar sin señal.'],
    ['Ing. de seguridad', 'Ingeniero SSOMA', 'Charlas de cinco minutos con asistencia firmada, checklists y sus plantillas, ATS/IPERC, y los reportes de seguridad.'],
    ['Visor', 'Cliente / COVINCA · solo lectura', 'Consulta el tablero, el mapa y los reportes. No puede crear, editar ni borrar absolutamente nada.'],
  ]},

  { t: 'h3', x: 'Qué módulo ve cada rol' },
  { t: 'tabla', anchos: [28, 14.4, 14.4, 14.4, 14.4, 14.4], cab: ['Módulo', 'Admin', 'Supervisor', 'Capataz', 'SSOMA', 'Visor'], filas: [
    ['Tablero de control', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí'],
    ['Campo', 'Sí', 'Sí', 'Sí', '—', '—'],
    ['Programación', 'Sí', 'Sí', 'Sí', '—', 'Sí'],
    ['PCIs', 'Sí', 'Sí', 'Sí', '—', 'Sí'],
    ['Mapa', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí'],
    ['Inventario', 'Sí', 'Sí', 'Sí', '—', 'Sí'],
    ['SSOMA', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí'],
    ['Reportes', 'Sí', 'Sí', '—', 'Sí', 'Sí'],
    ['Archivo documental', 'Sí', 'Sí', '—', 'Sí', 'Sí'],
    ['Importación', 'Sí', 'Sí', '—', '—', '—'],
    ['Configuración', 'Sí', 'Sí', '—', '—', '—'],
  ]},

  { t: 'aviso', x: [
    'El módulo también depende del contrato. Cada contrato tiene sus módulos encendidos o apagados: un contrato sin supervisión de OSITRAN no muestra PCIs a nadie, ni siquiera al administrador.',
  ]},

  { t: 'ejemplo', x: [
    '**Compruebe el modo solo lectura.** Entre con la tarjeta **Visor**.',
    'El menú se reduce a Tablero, Programación, PCIs, Mapa, Inventario, SSOMA, Reportes y Archivo. En todas esas pantallas no encontrará ningún botón de crear, editar ni eliminar: el visor solo mira.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Tablero de control', n: '3' },
  { t: 'p', x: 'Es la pantalla de inicio. Responde de un vistazo a tres preguntas: cuánto se ha producido, si se está cumpliendo el plan y qué está por vencer.' },

  { t: 'h2', x: 'El filtro de periodo', n: '3.1' },
  { t: 'p', x: 'Arriba hay cuatro botones: **7 días · 30 días · 90 días · Este año**. Todo lo que muestra el tablero se recalcula con el periodo elegido, y debajo del saludo se indica el rango exacto de fechas que se está mirando.' },

  { t: 'h2', x: 'Los indicadores', n: '3.2' },
  { t: 'tabla', anchos: [30, 70], cab: ['Indicador', 'Qué está midiendo'], filas: [
    ['Metrado ejecutado', 'La suma de todo lo ejecutado en el periodo y cuántos registros de campo la componen. Debajo, una curva con la producción día por día.'],
    ['Cumplimiento del plan', 'Qué porcentaje de lo programado se ha ejecutado, con el número de ítems cumplidos sobre el total programado.'],
    ['Ítems de PCI vencidos', 'Cuántos requerimientos pasaron su fecha límite sin levantarse. Si hay alguno, la tarjeta se pinta de rojo.'],
    ['Partes por validar', 'Cuántos partes enviaron las cuadrillas y siguen esperando la revisión del supervisor.'],
  ]},

  { t: 'h2', x: 'Los gráficos', n: '3.3' },
  { t: 'ul', x: [
    '**Producción diaria**: la evolución del metrado día por día dentro del periodo.',
    '**Producción por cuadrilla**: barras comparando lo ejecutado por cada cuadrilla.',
    '**Producción por actividad**: qué partidas concentran el trabajo del periodo.',
    '**Semáforo de PCI**: un anillo con la distribución de los ítems entre en plazo, por vencer, crítico y vencido.',
    '**Mini mapa**: la vista geográfica del contrato, con acceso directo al mapa completo.',
  ]},
  { t: 'p', x: 'Arriba puede aparecer una **franja de alerta** cuando hay ítems de PCI vencidos o partes esperando validación, con un enlace directo para atenderlos.' },

  { t: 'ejemplo', x: [
    '**Lea el tablero.** Entre como **Supervisor**. Con el periodo en 30 días, anote el metrado ejecutado. Cambie a 7 días: el número baja y la curva se acorta, porque está mirando una ventana más chica.',
    'Si la tarjeta de PCI vencidos está en rojo, tóquela: lo lleva a la lista de esos ítems.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Programación semanal', n: '4' },
  { t: 'p', x: 'Aquí se define qué va a hacer cada cuadrilla, en qué tramo, en qué progresivas y qué meta debe alcanzar. Lo programado es contra lo que después se compara la ejecución real.' },

  { t: 'h2', x: 'La pantalla', n: '4.1' },
  { t: 'ul', x: [
    'Arriba, la **semana** que se está viendo, con flechas de **Semana anterior** y **Semana siguiente**.',
    'Un **buscador** por actividad o tramo, y filtros por **cuadrilla** y por **estado**.',
    'La lista de ítems programados de esa semana, agrupados por día.',
    'Indicadores de la semana: ítems programados, ejecutados y porcentaje de cumplimiento.',
  ]},

  { t: 'h2', x: 'Programar una actividad', n: '4.2' },
  { t: 'p', x: 'El botón **Nueva actividad** abre el formulario. Estos son sus campos:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Actividad', 'La partida del catálogo que se va a ejecutar. Se elige de la lista; no se escribe libre.', 'Sí'],
    ['Tramo', 'El tramo de la vía donde se hará el trabajo.', 'Sí'],
    ['Progresiva inicio', 'Dónde empieza el trabajo, en formato kilómetro + metros. Por ejemplo `12+450`.', 'Sí'],
    ['Progresiva fin', 'Dónde termina, en el mismo formato. Debe ser mayor que la de inicio.', 'No'],
    ['Cuadrilla', 'Qué cuadrilla lo ejecuta. Puede dejarse sin asignar y decidirlo después.', 'No'],
    ['Fecha programada', 'El día en que debe ejecutarse.', 'Sí'],
    ['Meta', 'Cuánto se espera producir, en la unidad de la actividad (metros, unidades, metros cuadrados…).', 'Sí'],
    ['Estado', 'Programado, En curso, Ejecutado, Suspendido, Reprogramado o Cancelado.', 'Sí'],
    ['Nota', 'Cualquier indicación para la cuadrilla.', 'No'],
  ]},

  { t: 'h2', x: 'Los estados de un ítem programado', n: '4.3' },
  { t: 'tabla', anchos: [24, 76], cab: ['Estado', 'Qué significa'], filas: [
    ['Programado', 'Está previsto y todavía no se empieza.'],
    ['En curso', 'La cuadrilla está trabajando en él.'],
    ['Ejecutado', 'Terminado y registrado en un parte de campo.'],
    ['Suspendido', 'Se detuvo, normalmente porque un PCI tomó prioridad.'],
    ['Reprogramado', 'Se movió a otra fecha. Ocurre solo, cuando entra un PCI prioritario y se aplica la reprogramación.'],
    ['Cancelado', 'Ya no se hará.'],
  ]},
  { t: 'p', x: 'Cada ítem tiene además el botón de **Editar** y el de **Retirar de la programación**.' },

  { t: 'ejemplo', x: [
    '**Programe un trabajo.** Como Supervisor, entre a **Programación** y toque **Nueva actividad**.',
    'Actividad: cualquiera del catálogo. Tramo: `T-01 · Pativilca – Huarmey`. Progresivas: `18+000` a `18+400`. Cuadrilla A. Fecha: mañana. Meta: `400`.',
    'Guarde y búsquelo en el día que le corresponde.',
  ]},
  { t: 'ver', x: [
    'El ítem aparece en la fecha programada, con su cuadrilla, sus progresivas y su meta, en estado **Programado**.',
    'El contador de la semana sube en uno, y el porcentaje de cumplimiento baja, porque ahora hay un ítem más pendiente de ejecutar.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Campo · el parte diario', n: '5' },
  { t: 'p', x: 'Este es el módulo que usa el capataz todos los días, y es el que alimenta a todos los demás. Cada jornada de una cuadrilla es un **parte**: dentro van los trabajos ejecutados con su metrado, y de cada trabajo cuelgan sus fotos.' },

  { t: 'h2', x: 'La pantalla del capataz', n: '5.1' },
  { t: 'p', x: 'Al entrar, el capataz ve **Mi trabajo en campo**: sus partes recientes, con el estado de cada uno. Arriba tiene tres botones:' },
  { t: 'tabla', anchos: [26, 74], cab: ['Botón', 'Qué hace'], filas: [
    ['ATS', 'Abre directamente el formulario del Análisis de Trabajo Seguro, que se llena antes de tocar la vía.'],
    ['Checklist', 'Abre directamente el formulario para responder un checklist (EPP, vehículo, herramientas, señalización).'],
    ['Abrir parte de hoy', 'Crea el parte del día para su cuadrilla y entra en él. Solo aparece si todavía no existe.'],
  ]},
  { t: 'p', x: 'El supervisor y el administrador ven esta misma pantalla como **Ejecución en campo**, con los partes de todas las cuadrillas y filtros por estado, cuadrilla y periodo.' },

  { t: 'h2', x: 'Los estados de un parte', n: '5.2' },
  { t: 'tabla', anchos: [24, 76], cab: ['Estado', 'Qué significa'], filas: [
    ['Borrador', 'El capataz lo está llenando. Solo él lo ve y lo puede modificar.'],
    ['Por validar', 'Fue enviado. Ya no se puede editar y espera la revisión del supervisor.'],
    ['Validado', 'El supervisor lo aprobó. Cuenta para la producción y para la valorización.'],
    ['Observado', 'El supervisor lo devolvió con una observación escrita. El capataz puede corregirlo y volver a enviarlo.'],
  ]},

  { t: 'h2', x: 'Registrar una actividad ejecutada', n: '5.3' },
  { t: 'p', x: 'Dentro del parte, el botón **Registrar actividad** abre el formulario del trabajo hecho:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Actividad', 'La partida ejecutada, del catálogo del contrato.', 'Sí'],
    ['Tramo', 'El tramo donde se trabajó.', 'Sí'],
    ['Progresiva inicio', 'Desde dónde, en formato `12+450`.', 'Sí'],
    ['Progresiva fin', 'Hasta dónde, en el mismo formato.', 'No'],
    ['Lado', 'Derecho, izquierdo, ambos o eje.', 'Sí'],
    ['Metrado ejecutado', 'Cuánto se hizo. La unidad la pone el sistema según la actividad elegida y se muestra al lado del campo.', 'Sí'],
    ['Observación', 'Condiciones encontradas, incidencias, materiales retirados.', 'No'],
  ]},
  { t: 'p', x: 'Cada registro guardado muestra su actividad, tramo, progresivas, lado y metrado, y debajo su galería de fotos. A la derecha tiene tres botones: **Ver** (abre el informe del parte), **Editar** y **Eliminar** — los dos últimos solo mientras el parte esté en borrador y solo para quien lo creó.' },

  { t: 'h2', x: 'La evidencia fotográfica', n: '5.4' },
  { t: 'p', x: 'Debajo de cada registro hay tres formas de aportar fotos:' },
  { t: 'tabla', anchos: [22, 78], cab: ['Vía', 'Cuándo se usa'], filas: [
    ['Cámara', 'Tomar la foto en ese momento. El sistema captura la ubicación en vivo mientras se toma.'],
    ['Subir', 'Elegir fotos ya existentes de la galería del celular o del explorador de la computadora. Admite varias a la vez.'],
    ['Galería', 'Reutilizar una foto que ya está en el sistema, sin volver a subirla ni duplicar el archivo.'],
  ]},
  { t: 'p', x: 'Cada foto se **sella** en el momento de guardarla: se le graba encima una marca de agua con el contrato, la cuadrilla, la actividad, el tramo, la progresiva, la fecha y hora exactas y las coordenadas, y se le calcula una huella digital (hash SHA-256). Además se clasifica por fase: **Antes**, **Durante**, **Después** o **General**.' },
  { t: 'p', x: 'Para verlas: tocar cualquier miniatura, o el enlace **Ver las N fotos en grande**. Dentro del visor se pasa de una a otra con las flechas, y se muestran la fase, la fecha de captura, las coordenadas, la precisión del GPS, la progresiva, el dispositivo, el peso del archivo y la huella digital completa.' },
  { t: 'h3', x: 'Acercar la foto' },
  { t: 'p', x: 'En una foto de obra el detalle es lo que importa: si la alcantarilla quedó limpia, si el operario lleva el barbiquejo puesto. Por eso el visor permite **acercar**:' },
  { t: 'tabla', anchos: [30, 70], cab: ['Cómo', 'Dónde'], filas: [
    ['Rueda del mouse', 'En la computadora, sobre la foto. Acerca justo en el punto donde está el cursor.'],
    ['Doble clic o doble toque', 'Acerca de una vez; repitiendo, vuelve al tamaño original.'],
    ['Pellizcar con dos dedos', 'En el celular y la tablet, como en la galería del teléfono.'],
    ['Botones + y −', 'Abajo a la derecha, con el porcentaje de acercamiento a la vista.'],
    ['Arrastrar', 'Con la foto acercada, se mueve por ella arrastrando.'],
    ['Descargar', 'El botón de la flecha guarda la foto en el equipo.'],
  ]},
  { t: 'p', x: 'El mismo visor se usa en el informe del parte, en las fotos de los checklists, en el archivo documental y en la galería de reutilización.' },
  { t: 'aviso', x: [
    'La evidencia es **inmutable**: ni el administrador puede cambiarle la fecha, las coordenadas o la imagen. La base de datos bloquea la modificación y el almacenamiento no acepta reemplazos. Es lo que le da valor probatorio ante una fiscalización.',
    'Algunas actividades exigen un mínimo de fotos. Si faltan, el registro queda marcado y el sistema lo advierte.',
  ]},

  { t: 'h2', x: 'Ver el parte como informe', n: '5.5' },
  { t: 'p', x: 'El botón **Ver informe**, arriba del parte, arma el documento completo en una sola pantalla: cabecera con cuadrilla, estado, jornada, personal, clima y totales; y debajo cada actividad con su tramo, sus progresivas, su metrado, su observación y sus fotos. Los registros sin evidencia salen señalados.' },
  { t: 'p', x: 'Dentro del informe, el botón **Descargar el informe en PDF** genera el documento con la portada del contrato, los indicadores del día, la tabla de actividades y, al final, el **panel fotográfico**: cada foto impresa con su pie de datos sellados —tramo, progresiva, fecha, hora y coordenadas—. Es lo que se adjunta a la valorización o se entrega al supervisor.' },

  { t: 'h2', x: 'Enviar y validar', n: '5.6' },
  { t: 'p', x: 'Cuando el parte está completo, el capataz toca **Enviar a validación**. El parte pasa a **Por validar** y deja de ser editable. El botón está deshabilitado si el parte no tiene ningún registro.' },
  { t: 'p', x: 'El supervisor abre ese parte y toca **Revisar parte**. Ahí decide:' },
  { t: 'ul', x: [
    '**Validar** — el parte queda aprobado y cuenta para la producción.',
    '**Observar** — se devuelve al capataz. Exige escribir la observación: sin texto, el botón no se activa. El capataz verá esa observación en rojo al abrir su parte.',
  ]},

  { t: 'ejemplo', x: [
    '**Haga un parte completo.** Entre como **Jefe de cuadrilla** (Cuadrilla A) y toque **Abrir parte de hoy**.',
    'Registre una actividad: `Limpieza de cunetas`, tramo `T-01`, de `18+000` a `18+400`, lado derecho, metrado `400`, observación `Se retiró material de arrastre`.',
    'Adjunte dos fotos con **Subir**: una como *Antes* y otra como *Después*. Luego toque **Enviar a validación**.',
    'Cambie al usuario **Supervisor**, abra ese parte, toque **Ver informe**, revise las fotos y finalmente **Revisar parte → Validar**.',
  ]},
  { t: 'ver', x: [
    'El parte pasa de **Borrador** a **Por validar** y luego a **Validado**.',
    'En el tablero, el metrado del periodo sube en 400 y aparece un registro más.',
    'En el mapa, encendiendo la capa **Evidencias GPS**, las dos fotos aparecen sobre el kilómetro 18 del tramo T-01.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'PCI · requerimientos de OSITRAN', n: '6' },
  { t: 'p', x: 'Un PCI es un documento del supervisor del contrato que enumera incumplimientos que hay que levantar en un plazo determinado. Cada uno trae decenas o cientos de ítems, cada ítem con su propio plazo. Este módulo los controla uno por uno.' },

  { t: 'h2', x: 'La lista de PCI', n: '6.1' },
  { t: 'p', x: 'Muestra cuatro indicadores —**PCIs abiertos**, **ítems totales**, **ítems críticos** e **ítems vencidos**— y debajo la lista de documentos con su código, título, fecha de notificación, prioridad y el avance del levantamiento. Hay buscador por código o título.' },

  { t: 'h2', x: 'Registrar un PCI', n: '6.2' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código del PCI', 'El código del documento recibido, por ejemplo `PCI-2026-047`.', 'Sí'],
    ['Fuente', 'Quién lo emite: OSITRAN, el concesionario u otra entidad.', 'Sí'],
    ['Título', 'El asunto del documento.', 'Sí'],
    ['Descripción del incumplimiento', 'El detalle de lo observado, tal como llegó.', 'No'],
    ['Fecha de notificación', 'Cuándo fue notificado. De aquí se cuentan los plazos.', 'Sí'],
    ['Fecha de recepción', 'Cuándo lo recibió efectivamente ETS VALERIA.', 'No'],
    ['Prioridad', 'Baja, Media, Alta o Crítica.', 'Sí'],
    ['Plazo base (días)', 'Los días de plazo que aplican por defecto a sus ítems.', 'Sí'],
  ]},
  { t: 'p', x: 'Los ítems se cargan normalmente desde el Excel que acompaña al documento (capítulo 12), no uno por uno.' },

  { t: 'h2', x: 'El semáforo', n: '6.3' },
  { t: 'p', x: 'Cada ítem se pinta según cuánto le queda de plazo:' },
  { t: 'tabla', anchos: [24, 76], cab: ['Color', 'Significado'], filas: [
    ['En plazo (verde)', 'Tiene tiempo suficiente.'],
    ['Por vencer (ámbar)', 'El plazo se acerca.'],
    ['Crítico (rojo)', 'Quedan pocos días.'],
    ['Vencido (rojo oscuro)', 'Pasó la fecha límite sin levantarse.'],
    ['Levantado (verde)', 'Ya se atendió.'],
  ]},

  { t: 'h2', x: 'Trabajar un ítem', n: '6.4' },
  { t: 'p', x: 'Al abrir un PCI se ve su lista completa de ítems, con buscador y filtros por semáforo y por estado. La lista está preparada para cientos de ítems sin ponerse lenta.' },
  { t: 'p', x: 'Al tocar un ítem se abre su ficha, con la descripción, el tramo y progresiva, el plazo, los días restantes y su evidencia. Ahí se puede asignar la **cuadrilla responsable**, escribir **notas** y adjuntar fotos del levantamiento con las mismas tres vías del módulo de campo.' },
  { t: 'p', x: 'Los botones cambian según el estado y el rol:' },
  { t: 'tabla', anchos: [26, 24, 50], cab: ['Botón', 'Quién lo ve', 'Qué hace'], filas: [
    ['Marcar en atención', 'Capataz y superiores', 'El ítem pasa de Pendiente a En atención: alguien ya lo está trabajando.'],
    ['Levantar ítem', 'Capataz y superiores', 'Declara el trabajo hecho. Queda a la espera de validación.'],
    ['Validar', 'Supervisor y administrador', 'Confirma el levantamiento. El ítem queda cerrado.'],
    ['Rechazar', 'Supervisor y administrador', 'Devuelve el ítem con el motivo, normalmente por evidencia insuficiente.'],
  ]},
  { t: 'aviso', x: [
    'Un ítem no se puede levantar sin evidencia fotográfica: el sistema lo exige. Es la regla que evita cerrar requerimientos en el papel y no en la vía.',
  ]},

  { t: 'h2', x: 'Reprogramación por PCI prioritario', n: '6.5' },
  { t: 'p', x: 'Cuando entra un PCI que obliga a soltar lo programado, el sistema lo resuelve en tres pasos, sin tocar la base de datos a mano:' },
  { t: 'ol', x: [
    '**Vista previa** — muestra qué ítems de la programación se suspenderían, cuántos son y a qué fechas se moverían. No cambia nada todavía.',
    '**Aplicar** — ejecuta la suspensión y la reprogramación completa de una sola vez.',
    '**Revertir** — deshace la operación y devuelve todo a como estaba.',
  ]},

  { t: 'h2', x: 'Exportar', n: '6.6' },
  { t: 'p', x: 'Desde el detalle del PCI se descarga el listado completo de ítems en **PDF** con formato o en **Excel** para trabajarlo aparte.' },

  { t: 'ejemplo', x: [
    '**Recorra un PCI.** Como Supervisor, entre a **PCIs** y abra `PCI-2026-047`.',
    'Filtre por semáforo **Vencido** y abra un ítem. Asígnele la Cuadrilla A, escriba una nota y adjunte una foto con **Subir**. Toque **Levantar ítem**.',
    'El ítem queda como levantado, pendiente de validación; con su usuario de supervisor puede validarlo o rechazarlo indicando el motivo.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'SSOMA', n: '7' },
  { t: 'p', x: 'Seguridad y salud ocupacional. Son los documentos que se llenan todas las mañanas antes de que nadie toque la vía, y lo primero que pide una auditoría. El módulo tiene tres pestañas: **Charlas**, **Checklists** y **ATS / IPERC**.' },
  { t: 'p', x: 'Los indicadores de arriba resumen el periodo: charlas dictadas, asistencias firmadas, checklists respondidos, cuántos tuvieron hallazgos y cuántos ATS se registraron.' },

  { t: 'h2', x: 'Charlas de cinco minutos', n: '7.1' },
  { t: 'p', x: 'El botón **Nueva charla** abre el formulario:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Tema de la charla', 'El asunto tratado. Por ejemplo: prevención de atropellos en la berma.', 'Sí'],
    ['Fecha', 'El día en que se dictó. Viene con la fecha de hoy.', 'Sí'],
    ['Hora de inicio', 'La hora en que se dio, en formato `07:05`.', 'No'],
    ['Cuadrilla', 'A qué cuadrilla se le dictó.', 'Sí'],
    ['Duración (minutos)', 'Cuánto duró. Por defecto 5.', 'No'],
    ['Expositor', 'Quién la dictó. Viene con el nombre del usuario.', 'Sí'],
    ['Lugar', 'Dónde se dictó, por ejemplo el frente de trabajo y la progresiva.', 'No'],
    ['Contenido tratado', 'Los puntos cubiertos, los controles reforzados y los compromisos del equipo.', 'No'],
  ]},
  { t: 'p', x: 'Al guardar, el sistema abre **solo** la ventana de asistencia, porque después de registrar la charla siempre toca firmar.' },

  { t: 'h3', x: 'Registrar la asistencia' },
  { t: 'p', x: 'La ventana lista a los integrantes de esa cuadrilla con su cargo y su DNI. Se marca a quienes asistieron —hay un botón **Marcar todos**— y junto a cada nombre hay un **lápiz** que abre el recuadro de firma: la persona firma con el dedo en la pantalla y se confirma. Al final, **Firmar asistencia** guarda todo.' },
  { t: 'p', x: 'Al abrir una charla ya registrada se ve el tema, el contenido, el expositor y la lista de asistentes con **la firma dibujada** de cada uno y la hora exacta. El botón **Descargar el acta en PDF** genera el acta de asistencia para el expediente.' },

  { t: 'h2', x: 'Checklists', n: '7.2' },
  { t: 'p', x: 'Son listas de verificación configurables. Hoy están cargadas cuatro plantillas:' },
  { t: 'tabla', anchos: [30, 46, 24], cab: ['Plantilla', 'Para qué', '¿Pide foto?'], filas: [
    ['Verificación de EPP', 'El equipo de protección de cada integrante.', 'Sí'],
    ['Check list de vehículo', 'Inspección preoperacional de la unidad.', 'No'],
    ['Inspección de herramientas', 'Estado de las herramientas antes de usarlas.', 'No'],
    ['Señalización de zona de trabajo', 'Conos, banderilleros y señalización del frente.', 'Sí'],
  ]},

  { t: 'h3', x: 'Responder un checklist' },
  { t: 'p', x: 'El botón **Responder checklist** abre el formulario. Primero se elige la cabecera:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Plantilla', 'Qué lista se va a llenar. Al elegirla aparecen sus puntos.', 'Sí'],
    ['Cuadrilla', 'A qué cuadrilla corresponde.', 'No'],
    ['Fecha', 'El día de la inspección. Viene con hoy.', 'Sí'],
    ['Ubicación', 'Un botón que toma la posición del GPS. Muestra la precisión en metros.', 'No'],
  ]},
  { t: 'p', x: 'Después vienen los puntos. Cada uno se responde según su tipo:' },
  { t: 'tabla', anchos: [24, 76], cab: ['Tipo de punto', 'Cómo se responde'], filas: [
    ['Conforme / No conforme', 'Tres botones grandes: **Conforme**, **No conforme** y **No aplica**. Son grandes a propósito: se tocan con guantes y bajo el sol.'],
    ['Texto libre', 'Un recuadro para escribir.'],
    ['Número', 'Un campo numérico, por ejemplo el kilometraje del vehículo.'],
    ['Foto', 'Un botón que abre la cámara o la galería. La foto queda sellada igual que la evidencia de campo.'],
  ]},
  { t: 'p', x: 'Mientras se responde, arriba se actualiza solo el **cumplimiento en porcentaje** y el conteo de respondidas. Los puntos marcados como *No aplica* no bajan el porcentaje: se excluyen del cálculo.' },
  { t: 'p', x: 'Si algún punto sale **No conforme**, aparece el campo **Hallazgos detectados** y pasa a ser obligatorio: el sistema no deja enviar sin explicar qué se encontró y qué acción inmediata se tomó. El botón **Firmar** abre el recuadro de firma del responsable. Al final, **Enviar checklist**.' },
  { t: 'p', x: 'En la lista, los checklists con hallazgos se distinguen con borde ámbar. Al abrir uno se ve cada punto con su resultado —Conforme en verde, No conforme en rojo, No aplica en gris—, las fotos (que se abren en grande y se pueden acercar) y la firma del responsable. El botón **Descargar el informe en PDF** produce el documento con los puntos, el hallazgo, las fotografías y la firma.' },

  { t: 'h3', x: 'Crear sus propias plantillas' },
  { t: 'p', x: 'El botón **Plantillas** (para administrador y supervisor) permite armar listas nuevas sin depender del proveedor. En el editor se define:' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código', 'Un código corto, por ejemplo `CHK-SEN`.', 'Sí'],
    ['Nombre', 'El nombre de la lista.', 'Sí'],
    ['Categoría', 'EPP, Vehículo, Herramientas, Área de trabajo, Señalización u Otros.', 'No'],
    ['Frecuencia', 'Diaria, semanal, quincenal, mensual o por evento.', 'No'],
    ['Descripción', 'Para qué sirve la lista y cuándo se llena.', 'No'],
    ['Puntos de verificación', 'Con **Agregar punto** se añaden uno a uno. Cada punto tiene su texto, su tipo (conforme/no, texto, número o foto) y si es obligatorio.', 'Sí'],
    ['Plantilla activa', 'Si está apagada, deja de ofrecerse al responder.', 'No'],
  ]},
  { t: 'p', x: 'Las plantillas se pueden editar y eliminar; los checklists ya respondidos con ellas se conservan.' },

  { t: 'h2', x: 'ATS / IPERC', n: '7.3' },
  { t: 'p', x: 'El Análisis de Trabajo Seguro se llena antes de iniciar el frente: qué se va a hacer, qué puede salir mal y cómo se controla. El botón **Nuevo ATS** abre el formulario.' },
  { t: 'tabla', anchos: [24, 56, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Fecha', 'El día del trabajo. Viene con hoy.', 'Sí'],
    ['Cuadrilla', 'Qué cuadrilla ejecuta. Al elegirla se carga su personal para las firmas.', 'Sí'],
    ['Tramo', 'El tramo donde se trabajará.', 'No'],
    ['Progresiva de inicio', 'Se escribe, o se toma del GPS con el botón del pin.', 'No'],
    ['Tarea a ejecutar', 'Qué se va a hacer, en una frase.', 'Sí'],
    ['Lugar / referencia', 'Una referencia del frente, por ejemplo el kilómetro y el lado.', 'No'],
  ]},

  { t: 'h3', x: 'La matriz de peligros' },
  { t: 'p', x: 'Se agregan los peligros del frente, cada uno con su riesgo, su probabilidad, su severidad y sus controles. Hay cinco **atajos** con los peligros que aparecen casi siempre en una vía —tránsito vehicular, exposición al sol, herramientas manuales, trabajo en talud y polvo en suspensión—: un toque y entran con sus controles ya redactados, listos para ajustar.' },
  { t: 'tabla', anchos: [24, 76], cab: ['Campo del peligro', 'Qué se pone'], filas: [
    ['Peligro identificado', 'La fuente de daño. Por ejemplo: tránsito vehicular en la vía.'],
    ['Riesgo asociado', 'Qué puede pasar. Por ejemplo: atropello o colisión.'],
    ['Probabilidad', 'Baja, Media, Alta o Muy alta.'],
    ['Severidad', 'Ligero, Dañino, Extremadamente dañino o Fatal.'],
    ['Nivel de riesgo', 'Lo calcula el sistema cruzando probabilidad y severidad: trivial, tolerable, moderado, importante o intolerable.'],
    ['Responsable', 'Quién responde por los controles.'],
    ['Controles', 'Qué se hará antes y durante la tarea para evitar el daño. Es obligatorio: sin controles, el ATS no se guarda.'],
  ]},
  { t: 'p', x: 'El **riesgo máximo** del documento, que se muestra arriba, es el peor de todos los peligros listados y se recalcula solo.' },

  { t: 'h3', x: 'EPP y firmas' },
  { t: 'p', x: 'Debajo se marca el equipo de protección obligatorio para la tarea (casco, chaleco, botines, guantes, lentes, protector auditivo, respirador, arnés, bloqueador solar, cortaviento). Vienen marcados los cuatro básicos.' },
  { t: 'p', x: 'Al final firman el **supervisor que aprueba** y **cada integrante** de la cuadrilla, tocando el lápiz junto a su nombre. Con **Registrar ATS** se guarda todo junto.' },
  { t: 'p', x: 'Al abrir un ATS registrado se ve la matriz completa, el EPP exigido y las firmas dibujadas de quienes participaron. El botón **Descargar el informe en PDF** genera el documento con la matriz de riesgos y **las firmas impresas**, listo para el expediente o una fiscalización.' },

  { t: 'ejemplo', x: [
    '**Llene el SSOMA de una mañana.** Entre como **Ing. de seguridad**.',
    'Registre la charla del día para la Cuadrilla A y firme la asistencia de dos integrantes.',
    'En **Checklists**, responda `Verificación de EPP`: marque todo conforme salvo un punto, suba la foto que pide, describa el hallazgo, firme y envíe.',
    'En **ATS / IPERC**, cree uno para `Limpieza de cunetas`, agregue los atajos de tránsito vehicular y exposición al sol, firme como supervisor y registre.',
  ]},
  { t: 'ver', x: [
    'La charla muestra su etiqueta verde con el número de firmas, y al abrirla se ven las firmas dibujadas.',
    'El checklist aparece con borde ámbar y su porcentaje de cumplimiento; el punto observado se lee **No conforme** en rojo.',
    'El ATS encabeza la lista con su nivel de riesgo en color y el número de firmas.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Inventario vial', n: '8' },
  { t: 'p', x: 'El catastro de todo lo que hay en la carretera y hay que conservar: alcantarillas, guardavías, señales, postes SOS, badenes, puentes. Cada elemento está ubicado por tramo y progresiva, aparece en el mapa y guarda su historial de intervenciones.' },

  { t: 'h2', x: 'Los tipos de elemento cargados', n: '8.1' },
  { t: 'tabla', anchos: [22, 30, 48], cab: ['Código', 'Tipo', 'Categoría y datos propios'], filas: [
    ['ALC', 'Alcantarilla', 'Drenaje · tipo, diámetro, longitud, % de obstrucción'],
    ['BAD', 'Badén', 'Drenaje · ancho, material'],
    ['CUN', 'Cuneta revestida', 'Drenaje'],
    ['SOS', 'Poste SOS', 'Emergencia · número de poste, si está operativo, tipo de energía'],
    ['MUR', 'Muro de contención', 'Estructuras'],
    ['PUE', 'Puente', 'Estructuras · luz, tipo, año de construcción'],
    ['GUA', 'Guardavía metálica', 'Seguridad vial · longitud, número de postes, tipo de terminal'],
    ['HIT', 'Hito kilométrico', 'Señalización'],
    ['PDL', 'Poste delineador', 'Señalización · material'],
    ['SEV', 'Señal vertical', 'Señalización · código MTC, tipo, dimensión, retroreflectividad'],
  ]},
  { t: 'p', x: 'Cada tipo pide sus propios datos técnicos: el formulario cambia solo según el tipo elegido.' },

  { t: 'h2', x: 'La pantalla', n: '8.2' },
  { t: 'ul', x: [
    'Cuatro indicadores: elementos registrados, en estado malo, en estado crítico e inspecciones vencidas.',
    'Una barra de **estado de conservación** con la distribución del inventario. Cada color se puede tocar para filtrar por ese estado.',
    'Buscador por código, tramo o progresiva, y filtros por tipo y por estado.',
    'La tabla de elementos, preparada para miles de filas sin ponerse lenta.',
  ]},
  { t: 'p', x: 'Los cinco estados de conservación son: **Bueno**, **Regular**, **Malo**, **Crítico** y **No evaluado**.' },

  { t: 'h2', x: 'Dar de alta un elemento', n: '8.3' },
  { t: 'p', x: 'El botón **Nuevo elemento** abre el formulario:' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Tipo de elemento', 'Qué es. Al elegirlo aparecen abajo sus datos técnicos propios.', 'Sí'],
    ['Tramo', 'En qué tramo está.', 'Sí'],
    ['Código', 'El identificador del elemento. **El sistema lo sugiere solo** según el tramo y el tipo, con su correlativo; se puede cambiar.', 'Sí'],
    ['Nombre o denominación', 'Un nombre reconocible. Si se deja vacío se usa el tipo y la progresiva.', 'No'],
    ['Progresiva', 'Dónde está, en formato `18+320`. El botón del pin la calcula desde el GPS si está parado junto al elemento.', 'No'],
    ['Lado de la vía', 'Derecho, izquierdo, ambos o eje.', 'No'],
    ['Estado de conservación', 'Bueno, Regular, Malo, Crítico o No evaluado.', 'No'],
    ['Año de instalación', 'El año en que se instaló, si se conoce.', 'No'],
    ['Última inspección', 'Cuándo se revisó por última vez.', 'No'],
    ['Próxima inspección', 'Cuándo toca revisarlo. Si esa fecha pasa, el elemento cuenta como inspección vencida.', 'No'],
    ['Latitud y longitud', 'Las coordenadas. Se llenan solas con el botón del pin.', 'No'],
    ['Atributos técnicos', 'Los datos propios del tipo elegido (diámetro, obstrucción, código MTC, etc.).', 'No'],
    ['Observaciones', 'Cualquier detalle relevante.', 'No'],
  ]},
  { t: 'aviso', x: [
    'Si escribe una progresiva que no cae dentro del tramo elegido, el sistema no lo deja guardar y le recuerda entre qué progresivas va ese tramo.',
    'Si toma la ubicación estando lejos del tramo, tampoco calcula la progresiva: le avisa a cuántos kilómetros está, para que revise si eligió el tramo correcto.',
  ]},

  { t: 'h2', x: 'La ficha y las intervenciones', n: '8.4' },
  { t: 'p', x: 'Al tocar un elemento se abre su ficha: tramo, progresiva, lado, estado, año de instalación, fechas de inspección, número de intervenciones, coordenadas y sus atributos técnicos. Debajo, el **historial de intervenciones**.' },
  { t: 'p', x: 'El botón **Registrar intervención** anota un mantenimiento hecho sobre ese elemento:' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Fecha', 'Cuándo se intervino.', 'Sí'],
    ['Qué se hizo', 'Limpieza, descolmatación, reposición, reparación, pintado, reemplazo, inspección o señalización.', 'Sí'],
    ['Cuadrilla que intervino', 'Qué cuadrilla lo hizo.', 'No'],
    ['Estado en que queda', 'Cómo quedó el elemento después del trabajo. **Actualiza la ficha del elemento.**', 'Sí'],
    ['Notas', 'Material retirado, repuestos usados, coordinaciones.', 'No'],
  ]},
  { t: 'p', x: 'Antes de guardar, el formulario muestra el cambio que va a producir, por ejemplo *Regular → Bueno*. La ficha también tiene los botones de **Editar** y **Eliminar** el elemento; al eliminarlo deja de figurar en el inventario y en el mapa, pero su historial se conserva.' },

  { t: 'ejemplo', x: [
    '**Registre una alcantarilla nueva y su limpieza.** Como Supervisor, entre a **Inventario** y toque **Nuevo elemento**.',
    'Tipo `Alcantarilla`, tramo `T-01`. Fíjese en que el código se llena solo. Nombre `Alcantarilla 18+320`, progresiva `18+320`, estado `Regular`, diámetro `1.2`, obstrucción `35`.',
    'Guarde, búsquelo por su código y ábralo. Toque **Registrar intervención**: descolmatación, Cuadrilla A, estado final `Bueno`.',
  ]},
  { t: 'ver', x: [
    'Al elegir el tipo cambian los campos técnicos de abajo: una alcantarilla pide diámetro y obstrucción; una señal pediría código MTC y retroreflectividad.',
    'Después de la intervención, el estado del elemento en la tabla pasa a **Bueno** y la ficha muestra la intervención en su historial.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Mapa', n: '9' },
  { t: 'p', x: 'La vista geográfica del contrato. Muestra el corredor completo y, encima, lo que se elija ver.' },

  { t: 'h2', x: 'Las capas', n: '9.1' },
  { t: 'p', x: 'El botón **Capas**, arriba a la izquierda, enciende y apaga cinco conjuntos de información:' },
  { t: 'tabla', anchos: [26, 50, 24], cab: ['Capa', 'Qué dibuja', 'Estado inicial'], filas: [
    ['Tramos viales', 'La línea de la carretera, un color por tramo, con su nombre.', 'Encendida'],
    ['Ejecución en campo', 'Un punto por cada trabajo registrado en el periodo.', 'Encendida'],
    ['Ítems de PCI', 'Los requerimientos, pintados según su semáforo de vencimiento.', 'Apagada'],
    ['Inventario vial', 'Los elementos del catastro, con el color de su tipo.', 'Apagada'],
    ['Evidencias GPS', 'Cada fotografía en el punto exacto donde fue tomada.', 'Apagada'],
  ]},
  { t: 'p', x: 'Al encender una capa aparece abajo su **leyenda**, explicando qué significa cada color.' },

  { t: 'h2', x: 'Los círculos con números', n: '9.2' },
  { t: 'p', x: 'Cuando hay muchos puntos juntos, el mapa los agrupa en un círculo con un número. **Ese número es cuántos registros hay agrupados ahí**, no una progresiva ni un metrado. Al tocarlo, el mapa se acerca y el grupo se reparte; al seguir acercándose los puntos quedan sueltos y cada uno abre su ficha. Los números cambian con el zoom y con el periodo elegido.' },

  { t: 'h2', x: 'Controles', n: '9.3' },
  { t: 'ul', x: [
    '**Calles · Satélite · Relieve** — el fondo del mapa.',
    '**+ y −** — acercar y alejar.',
    '**Botón de ubicación** — centra el mapa donde está usted.',
    'Tocar una **línea de tramo** abre su ficha con progresivas y longitud.',
  ]},

  { t: 'ejemplo', x: [
    '**Ubique el trabajo del día.** Abra **Mapa** y encienda la capa **Evidencias GPS**.',
    'Acérquese al tramo donde su cuadrilla trabajó hoy: las fotos aparecen sobre la vía, en el punto exacto donde se tomaron.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Reportes', n: '10' },
  { t: 'p', x: 'Cinco reportes, cada uno disponible en **PDF** con la marca del contrato o en **Excel** para trabajarlo aparte. Todos respetan el periodo de fechas elegido arriba.' },
  { t: 'tabla', anchos: [28, 72], cab: ['Reporte', 'Qué contiene'], filas: [
    ['Reporte diario de ejecución', 'Actividades ejecutadas por cuadrilla, con progresivas, metrados y conteo de evidencias.'],
    ['Resumen de metrados', 'Metrado acumulado por actividad y unidad, contra la meta programada, con su porcentaje de cumplimiento.'],
    ['Reporte de PCIs', 'Ítems con su plazo, semáforo de vencimiento, responsable y estado de levantamiento.'],
    ['Reporte SSOMA', 'Charlas, asistencia firmada, checklists con hallazgos y ATS/IPERC del periodo.'],
    ['Inventario vial', 'Elementos por tipo, tramo y progresiva, con estado de conservación e inspecciones.'],
  ]},
  { t: 'p', x: 'El PDF lleva portada con el contrato, el cliente, el periodo y quién lo generó, más los indicadores del periodo en tarjetas. El Excel incluye una hoja de portada con los mismos datos. Ambos se generan en el propio equipo, en segundos.' },
  { t: 'p', x: 'Además, cada documento del sistema tiene su propia descarga desde su ficha: el **parte diario** con su panel fotográfico, el **checklist** con sus fotos y su firma, el **ATS** con su matriz y las firmas del equipo, y el **acta de la charla** con la asistencia firmada.' },

  { t: 'ejemplo', x: [
    '**Emita el reporte del mes.** Entre a **Reportes**, elija el periodo de 30 días y descargue el **Reporte diario de ejecución** en PDF y luego en Excel.',
    'Compare: el PDF sirve para entregar; el Excel, para filtrar y sumar por su cuenta.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Archivo documental', n: '11' },
  { t: 'p', x: 'El lugar donde vive la documentación del contrato, para no depender de carpetas compartidas. Admite PDF, Excel, Word e imágenes.' },
  { t: 'h2', x: 'Categorías', n: '11.1' },
  { t: 'p', x: 'Contrato · PCI · OSITRAN · Programación · Reporte · SSOMA · Plano · Acta · Panel fotográfico · Normativa · Otro.' },

  { t: 'h2', x: 'Subir un documento', n: '11.2' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Archivo', 'Se arrastra o se elige del equipo.', 'Sí'],
    ['Nombre del documento', 'Con qué nombre se va a encontrar después.', 'Sí'],
    ['Tipo', 'La categoría de la lista anterior.', 'Sí'],
    ['Fecha del documento', 'La fecha propia del documento, que puede no ser la de hoy.', 'No'],
    ['PCI relacionado', 'Si el documento pertenece a un PCI, se vincula aquí y queda accesible desde ese PCI.', 'No'],
    ['Descripción', 'Qué contiene y para qué sirve.', 'No'],
    ['Etiquetas', 'Palabras separadas por coma para encontrarlo después, por ejemplo `ositran, drenaje, 2026`.', 'No'],
  ]},
  { t: 'p', x: 'Cada documento de la lista tiene cuatro acciones: **Previsualizar** (se abre sin descargarlo), **Descargar**, **Editar datos** y **Eliminar**. Hay buscador por nombre y filtro por tipo.' },

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Importación desde Excel', n: '12' },
  { t: 'p', x: 'Para cargar en bloque lo que hoy vive en hojas de cálculo. Hay cuatro tipos de importación:' },
  { t: 'tabla', anchos: [30, 70], cab: ['Importación', 'Columnas que espera'], filas: [
    ['Programación semanal', 'Actividad, Tramo, Progresiva inicio, Progresiva fin, Cuadrilla, Fecha, Meta.'],
    ['PCIs · ítems OSITRAN', 'N.º de ítem, Descripción, Tramo, Progresiva, Plazo en días, Actividad, Cantidad.'],
    ['Inventario vial', 'Código, Tipo de elemento, Tramo, Progresiva, Lado, Estado.'],
    ['Catálogo de actividades', 'Las partidas con su unidad y rendimiento.'],
  ]},
  { t: 'h2', x: 'Cómo funciona', n: '12.1' },
  { t: 'ol', x: [
    'Elegir qué se va a importar. El sistema muestra las columnas que espera y permite **descargar una plantilla** con esos encabezados.',
    'Arrastrar el archivo. Se lee en el propio equipo, sin subirlo todavía.',
    'Revisar la **vista previa**: el sistema valida fila por fila, convierte las progresivas al formato interno y busca los códigos de actividad, tramo y cuadrilla en los catálogos.',
    'Corregir lo que salga marcado en rojo. Las filas con error se señalan con el motivo; las correctas quedan en verde.',
    'Confirmar la importación. Solo entran las filas válidas.',
  ]},
  { t: 'aviso', x: [
    'La importación no duplica: si una fila ya existe, se actualiza en lugar de crear otra.',
    'Cada importación queda registrada con quién la hizo, cuándo, cuántas filas entraron y cuántas se rechazaron.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Configuración', n: '13' },
  { t: 'p', x: 'Solo para administrador y supervisor. Siete pestañas.' },

  { t: 'h2', x: 'Usuarios', n: '13.1' },
  { t: 'p', x: 'Quiénes pertenecen al contrato, con su rol, su estado y su última actividad. El botón **Nuevo usuario** crea la cuenta y le da acceso:' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Nombre completo', 'Nombre y apellidos de la persona.', 'Sí'],
    ['Correo electrónico', 'Con este correo entrará al sistema.', 'Sí'],
    ['Rol en el servicio', 'Uno de los cinco roles del capítulo 2.', 'Sí'],
    ['DNI', 'Documento de identidad.', 'No'],
    ['Teléfono', 'Número de contacto.', 'No'],
    ['Cargo', 'Su cargo en la obra.', 'No'],
    ['Cuadrilla que lidera', 'Solo aparece si el rol es jefe de cuadrilla: indica cuál dirige.', 'No'],
    ['Usuario activo', 'Si se apaga, la persona deja de poder entrar sin borrar su historial.', 'No'],
  ]},
  { t: 'p', x: 'Al crear el usuario, el sistema genera una **contraseña inicial y la muestra una sola vez**: hay que copiarla y entregarla. Cada usuario de la tabla tiene además los botones de **Editar**, **Restablecer contraseña** y **Quitar del servicio**.' },

  { t: 'h2', x: 'Cuadrillas', n: '13.2' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código', 'Un código corto, por ejemplo `CUA-E`.', 'Sí'],
    ['Nombre', 'Cómo se le llama, por ejemplo `Cuadrilla E · Drenaje`.', 'Sí'],
    ['Jefe de cuadrilla', 'Qué usuario la dirige.', 'No'],
    ['Color en el mapa', 'El color con que se distingue su trabajo.', 'No'],
    ['Vehículo y placa', 'La unidad asignada.', 'No'],
    ['Cuadrilla activa', 'Si se apaga, deja de ofrecerse al programar.', 'No'],
  ]},
  { t: 'p', x: 'Dentro de cada cuadrilla, el botón **+ Integrante** agrega personal con su **nombre completo**, **DNI** y **cargo** (jefe de cuadrilla, operario, oficial, peón, conductor o vigía). Los obreros **no necesitan cuenta de usuario**: se registran solo para poder firmar asistencias y ATS. Cada cuadrilla se puede editar o eliminar.' },

  { t: 'h2', x: 'Tramos', n: '13.3' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código', 'Por ejemplo `T-07`.', 'Sí'],
    ['Ruta', 'La ruta nacional, por ejemplo `PE-1N`.', 'No'],
    ['Nombre del tramo', 'De dónde a dónde va.', 'Sí'],
    ['Progresiva inicial', 'En formato `356+000`.', 'Sí'],
    ['Progresiva final', 'Debe ser mayor que la inicial; el sistema lo verifica.', 'Sí'],
    ['Superficie', 'Asfalto, afirmado, concreto o trocha.', 'No'],
    ['Carriles', 'Cuántos carriles tiene.', 'No'],
    ['Color en el mapa', 'Con qué color se dibuja.', 'No'],
    ['Tramo activo', 'Si se apaga, deja de ofrecerse en los formularios.', 'No'],
  ]},
  { t: 'p', x: 'La tabla muestra la longitud calculada y si el tramo tiene su línea dibujada (**Trazada** o **Sin geometría**). Cada tramo tiene tres botones: **cargar el trazo**, **editar** y **eliminar**.' },

  { t: 'h3', x: 'Cargar el trazo de un tramo' },
  { t: 'p', x: 'Un tramo creado a mano nace sin línea en el mapa. El ícono de ruta abre la carga: se arrastra un archivo **KML**, **KMZ**, **GeoJSON** o **GPX** —los formatos que exporta Google Earth o un GPS de campo— y antes de guardar se ve la **vista previa** del trazo con cuántos puntos trae y cuántos kilómetros mide. Si la longitud no cuadra con las progresivas declaradas, el sistema lo advierte. También se puede **quitar el trazo**.' },

  { t: 'h2', x: 'Actividades', n: '13.4' },
  { t: 'p', x: 'El catálogo de partidas que las cuadrillas pueden ejecutar.' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código', 'Por ejemplo `MR-21`.', 'Sí'],
    ['Categoría', 'Calzada, Drenaje, Señalización, Seguridad vial, Derecho de vía o Emergencias.', 'Sí'],
    ['Nombre de la actividad', 'Cómo se llama la partida.', 'Sí'],
    ['Unidad de medida', 'En qué se mide: metros, unidades, metros cuadrados, etc.', 'Sí'],
    ['Rendimiento por día', 'Cuánto hace una cuadrilla en una jornada. Sirve para programar con criterio.', 'No'],
    ['Fotos mínimas exigidas', 'Cuántas fotos pide el sistema al registrar esta actividad.', 'No'],
    ['Exige evidencia fotográfica', 'Si está encendido, el registro sin fotos queda observado.', 'No'],
    ['Actividad activa', 'Si se apaga, deja de ofrecerse.', 'No'],
  ]},

  { t: 'h2', x: 'Servicios', n: '13.5' },
  { t: 'p', x: 'Los contratos y qué módulos tiene encendido cada uno. El botón **Nuevo servicio** (solo administrador) da de alta otro contrato:' },
  { t: 'tabla', anchos: [26, 54, 20], cab: ['Campo', 'Qué se pone', 'Obligatorio'], filas: [
    ['Código corto', 'Tres o cuatro letras; es lo que se ve en el selector de contrato.', 'Sí'],
    ['Color', 'El color que identifica al contrato en la interfaz.', 'No'],
    ['Nombre del servicio', 'El nombre completo del contrato.', 'Sí'],
    ['Cliente', 'A quién se le presta el servicio.', 'No'],
    ['Código de contrato', 'El número del contrato.', 'No'],
    ['Inicio y fin del contrato', 'Las fechas de vigencia. El fin debe ser posterior al inicio.', 'No'],
    ['Módulos habilitados', 'Qué módulos tendrá: programación, campo, PCI, SSOMA, inventario, reportes y mapa. Se apagan los que no correspondan.', 'No'],
  ]},
  { t: 'p', x: 'Quien crea el contrato queda dentro como administrador, y el sistema lo cambia automáticamente al contrato nuevo. Toda la información de un contrato está aislada de la de los demás.' },

  { t: 'h2', x: 'Dispositivo', n: '13.6' },
  { t: 'p', x: 'Cuánto espacio ocupa la aplicación en ese equipo, cuántos registros están esperando señal y el estado de las notificaciones. Desde aquí se activan los avisos push y se puede vaciar la información guardada localmente.' },

  { t: 'h2', x: 'Seguridad', n: '13.7' },
  { t: 'p', x: 'El registro de auditoría: cada alta, cambio y baja en las tablas sensibles, con quién lo hizo, qué tabla tocó, qué acción fue y cuándo. Solo lo ve el administrador y el supervisor; el visor no tiene acceso.' },

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Mi perfil', n: '14' },
  { t: 'p', x: 'Desde el avatar, arriba a la derecha. Permite actualizar los datos de contacto, ver el rol asignado en cada contrato, revisar los dispositivos desde los que se ha sincronizado y cerrar sesión.' },

  { t: 'h1', x: 'Trabajar sin señal', n: '15' },
  { t: 'p', x: 'Es la parte del sistema pensada específicamente para la carretera, donde el Starlink va y viene.' },

  { t: 'h2', x: 'Qué se puede hacer sin conexión', n: '15.1' },
  { t: 'ul', x: [
    'Abrir el parte del día y registrar actividades con sus metrados.',
    'Tomar fotos con la cámara o subirlas de la galería: se sellan igual, con GPS, fecha y huella digital.',
    'Responder un checklist completo, con foto y firma.',
    'Llenar un ATS con su matriz de riesgos y las firmas del equipo.',
    'Consultar los catálogos: cuadrillas, tramos, actividades, plantillas y personal.',
  ]},

  { t: 'h2', x: 'Cómo funciona', n: '15.2' },
  { t: 'p', x: 'Todo lo que se registra se guarda primero **en el propio dispositivo**, en una cola de envío. Cuando vuelve la señal, la cola se vacía sola: primero los registros, después las fotos y las firmas. El usuario no tiene que hacer nada ni acordarse de sincronizar.' },
  { t: 'p', x: 'Al pie del menú, el indicador dice **Todo sincronizado** y cuándo fue la última vez, o cuántos elementos están esperando. Si algo falla, el sistema reintenta solo, espaciando los intentos.' },
  { t: 'p', x: 'Un envío repetido **nunca duplica**: cada registro lleva un identificador propio, así que si se manda dos veces por un corte, en la nube queda uno solo.' },

  { t: 'ejemplo', x: [
    '**Pruebe el modo sin señal.** En el celular, active el modo avión.',
    'Abra un checklist, respóndalo completo, suba una foto, firme y envíelo. El sistema responde: *«Checklist guardado en el equipo · Se enviará solo cuando vuelva la señal»*.',
    'Desactive el modo avión y espere unos segundos, sin tocar nada.',
  ]},
  { t: 'ver', x: [
    'El indicador del menú pasa a **Todo sincronizado** y el checklist aparece en la lista, con su foto y su firma, como si lo hubiera enviado con conexión.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Seguridad y trazabilidad', n: '16' },
  { t: 'tabla', anchos: [30, 70], cab: ['Mecanismo', 'Qué garantiza'], filas: [
    ['Aislamiento por contrato', 'Cada tabla del sistema filtra por contrato en el servidor. Un usuario no puede ver datos de un contrato al que no pertenece, ni forzándolo.'],
    ['Permisos por rol', 'Las operaciones se validan en el servidor, no en la pantalla. Un visor no puede escribir aunque intente saltarse la interfaz.'],
    ['Evidencia inmutable', 'Las fotografías no se pueden modificar ni borrar: ni su imagen, ni su fecha, ni sus coordenadas. El almacenamiento no acepta reemplazos.'],
    ['Sello de integridad', 'Cada foto lleva una huella digital SHA-256. Si el archivo cambiara un solo bit, la huella dejaría de coincidir.'],
    ['Registro de auditoría', 'Cada alta, cambio y baja queda anotada con el usuario, la fecha y el antes y el después.'],
    ['Copias de seguridad', 'La base de datos se respalda de forma automática todos los días.'],
    ['Hora del Perú', 'El sistema trabaja en horario peruano. Un parte abierto a las ocho de la noche lleva la fecha de ese día, no la del siguiente.'],
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Ejercicios guiados', n: '17' },
  { t: 'p', x: 'Cuatro recorridos cortos para probar el sistema de punta a punta con los datos que hoy están cargados. La contraseña de las cuentas de prueba es la que aparece al pie de la pantalla de ingreso.' },

  { t: 'h2', x: 'Ejercicio 1 · Un día de la cuadrilla (8 minutos)', n: '17.1' },
  { t: 'ol', x: [
    'Entrar como **Jefe de cuadrilla · Cuadrilla A**.',
    'En **Campo**, tocar **ATS**: tarea `Limpieza de cunetas`, tramo T-01, agregar los atajos de tránsito vehicular y exposición al sol, firmar y registrar.',
    'Volver a **Campo** y tocar **Checklist**: plantilla `Verificación de EPP`, marcar un punto como no conforme, subir la foto, describir el hallazgo, firmar y enviar.',
    'Tocar **Abrir parte de hoy** y registrar la actividad: tramo T-01, de `18+000` a `18+400`, metrado `400`.',
    'Adjuntar dos fotos con **Subir**, una como *Antes* y otra como *Después*.',
    'Tocar **Enviar a validación**.',
  ]},

  { t: 'h2', x: 'Ejercicio 2 · La validación del supervisor (3 minutos)', n: '17.2' },
  { t: 'ol', x: [
    'Cerrar sesión y entrar como **Supervisor**.',
    'En **Campo**, abrir el parte que acaba de enviar la cuadrilla.',
    'Tocar **Ver informe** y revisar la cabecera, las actividades y las fotos.',
    'Tocar una foto: comprobar que muestra el sello, la fecha, las coordenadas y la progresiva.',
    'Descargar el informe en PDF.',
    'Cerrar el informe y tocar **Revisar parte → Validar**.',
  ]},

  { t: 'h2', x: 'Ejercicio 3 · Levantar un requerimiento (4 minutos)', n: '17.3' },
  { t: 'ol', x: [
    'Como Supervisor, entrar a **PCIs** y abrir un PCI de la lista.',
    'Filtrar por semáforo **Vencido** y abrir un ítem.',
    'Asignarle una cuadrilla responsable y escribir una nota.',
    'Adjuntar una foto del levantamiento con **Subir**.',
    'Tocar **Levantar ítem** y después **Validar**.',
  ]},

  { t: 'h2', x: 'Ejercicio 4 · Inventario y mapa (4 minutos)', n: '17.4' },
  { t: 'ol', x: [
    'Entrar a **Inventario** y tocar **Nuevo elemento**: alcantarilla en el tramo T-01, progresiva `18+320`, estado regular.',
    'Buscarla por su código y abrir su ficha.',
    'Tocar **Registrar intervención**: descolmatación, estado final bueno.',
    'Ir a **Mapa**, encender la capa **Inventario vial** y acercarse al kilómetro 18 del tramo T-01.',
  ]},

  { t: 'salto' },

  // ══════════════════════════════════════════════════════════════════════
  { t: 'h1', x: 'Estado de la implementación', n: '18' },
  { t: 'p', x: 'Todo lo descrito en esta guía está construido y probado. Para que la puesta en marcha no traiga sorpresas, conviene tener claro lo que todavía falta:' },
  { t: 'tabla', anchos: [32, 68], cab: ['Pendiente', 'Qué implica'], filas: [
    ['Datos reales del contrato', 'La información que hoy se ve es de demostración: personal, tramos, metrados y fotografías inventados para poder mostrar el sistema. Al arrancar hay que cargar los datos reales y retirar los de prueba.'],
    ['Importar los archivos de ETS VALERIA', 'El importador funciona y valida, pero todavía no se ha probado con los Excel que la empresa usa hoy. Es la primera tarea de la puesta en marcha.'],
    ['Notificaciones push en obra', 'Están configuradas, pero ningún celular de campo ha concedido aún el permiso. Falta probarlo en los equipos reales.'],
    ['Accesos rápidos del ingreso', 'Las seis tarjetas de acceso por rol deben desactivarse antes del uso real: mientras estén, cualquiera con la dirección entra con un clic.'],
    ['Prueba en carretera', 'El modo sin señal está verificado cortando la red en el navegador. Falta la prueba en la vía, con el Starlink yendo y viniendo.'],
  ]},

  { t: 'h1', x: 'Glosario', n: '19' },
  { t: 'tabla', anchos: [26, 74], cab: ['Término', 'Qué significa'], filas: [
    ['Progresiva', 'La forma de decir en qué punto de la carretera está algo, contando desde el inicio del tramo. Se escribe kilómetro + metros: `18+320` es el kilómetro 18 más 320 metros.'],
    ['Tramo', 'Un pedazo de vía con nombre y con un rango de progresivas. El contrato se divide en tramos.'],
    ['Metrado', 'Cuánto se hizo, en la unidad de la actividad: metros de cuneta limpiada, unidades de señal repuesta, metros cuadrados pintados.'],
    ['Partida o actividad', 'Cada tipo de trabajo del catálogo del contrato.'],
    ['Cuadrilla', 'El grupo de personas que ejecuta el trabajo en campo, con su jefe y su vehículo.'],
    ['Parte diario', 'El registro de la jornada de una cuadrilla: qué hizo, dónde, cuánto y con qué evidencia.'],
    ['PCI', 'El documento con el que el supervisor del contrato comunica incumplimientos que deben levantarse en un plazo.'],
    ['Levantar un ítem', 'Corregir lo observado y documentarlo con evidencia.'],
    ['ATS', 'Análisis de Trabajo Seguro. El documento que se llena antes de empezar: qué se hará, qué puede salir mal y cómo se controla.'],
    ['IPERC', 'Identificación de Peligros, Evaluación de Riesgos y Controles. Es la matriz que va dentro del ATS.'],
    ['EPP', 'Equipo de Protección Personal: casco, chaleco, botines, guantes y lo que la tarea exija.'],
    ['Evidencia sellada', 'Una fotografía con la fecha, la hora, las coordenadas y una huella digital grabadas de forma que no se pueden alterar.'],
    ['PWA', 'Aplicación web instalable. Se abre en el navegador, se instala como una aplicación y funciona sin conexión.'],
    ['Sincronizar', 'Enviar a la nube lo que quedó guardado en el celular mientras no había señal.'],
  ]},
]
