/**
 * La guía de pruebas en Word, editable.
 *
 * Sale del mismo `contenido.mjs` que el PDF: quien corrija un paso lo corrige
 * una vez y las dos versiones quedan iguales. Lo que cambia aquí es solo cómo
 * se dibuja, porque Word no entiende de hojas de estilo.
 *
 *   node scripts/guia/generar-docx.mjs
 *
 * Produce GUIA-DE-PRUEBAS-SIGOV.docx en la raíz del proyecto.
 *
 * La tipografía es Calibri a propósito: el documento está hecho para que lo
 * abran y lo editen, y una fuente que el equipo no tenga instalada Word la
 * sustituye sin avisar y descuadra el maquetado. La identidad la sostienen el
 * logotipo, los colores y la estructura, que sí viajan dentro del archivo.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { GUIA } from './contenido.mjs'

const require = createRequire(import.meta.url)
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  VerticalAlign, PageBreak, TableOfContents, LevelFormat, convertMillimetersToTwip,
} = require('docx')

const RAIZ = process.cwd()
const SALIDA = path.join(RAIZ, 'GUIA-DE-PRUEBAS-SIGOV.docx')

// ═══ La paleta de Servicon ════════════════════════════════════════════

const C = {
  azul: '013C77',
  azulHondo: '012A55',
  verde: '0B8637',
  verdeClaro: '6BB43B',
  naranja: 'F36B21',
  tinta: '16202E',
  suave: '4A5565',
  borde: 'D8DDE5',
  fondoSuave: 'F4F6F9',
  fondoVerde: 'F1F9F3',
  fondoNaranja: 'FFF6F0',
  blanco: 'FFFFFF',
}

const LETRA = 'Calibri'
const MONO = 'Consolas'

// A4 con márgenes de 18 mm: lo que queda de ancho para las tablas
const ANCHO = convertMillimetersToTwip(210 - 36)

// ═══ Texto con negritas y código ══════════════════════════════════════

/**
 * Convierte el texto de `contenido.mjs` en trozos con formato.
 *
 * Se admite lo mismo que en el PDF: `**negrita**` y `` `código` ``. Word no
 * entiende markdown, así que hay que partir la cadena a mano.
 */
function trozos(texto, base = {}) {
  const partes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let ultimo = 0
  let m
  while ((m = re.exec(String(texto ?? '')))) {
    if (m.index > ultimo) {
      partes.push(new TextRun({ text: texto.slice(ultimo, m.index), font: LETRA, ...base }))
    }
    const t = m[0]
    if (t.startsWith('**')) {
      partes.push(new TextRun({ text: t.slice(2, -2), font: LETRA, bold: true, ...base }))
    } else {
      partes.push(new TextRun({
        text: t.slice(1, -1), font: MONO, size: (base.size ?? 21) - 2,
        color: base.color ?? C.azulHondo, ...base, bold: false,
      }))
    }
    ultimo = m.index + t.length
  }
  if (ultimo < String(texto ?? '').length) {
    partes.push(new TextRun({ text: texto.slice(ultimo), font: LETRA, ...base }))
  }
  return partes.length ? partes : [new TextRun({ text: '', font: LETRA, ...base })]
}

const parrafo = (texto, opciones = {}) =>
  new Paragraph({
    children: trozos(texto, opciones.base ?? {}),
    spacing: { after: opciones.after ?? 120, line: 264 },
    ...opciones.parrafo,
  })

// ═══ Las tablas ═══════════════════════════════════════════════════════

const celda = (hijos, opciones = {}) =>
  new TableCell({
    children: hijos,
    width: { size: opciones.ancho, type: WidthType.DXA },
    shading: opciones.fondo
      ? { type: ShadingType.CLEAR, fill: opciones.fondo, color: 'auto' }
      : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    verticalAlign: VerticalAlign.TOP,
    ...opciones.extra,
  })

function tablaDeDatos(columnas, filas, anchos) {
  const reparto = anchos ?? columnas.map(() => Math.floor(ANCHO / columnas.length))

  const cabecera = new TableRow({
    tableHeader: true,
    children: columnas.map((c, i) =>
      celda(
        [new Paragraph({
          children: [new TextRun({
            text: String(c).toUpperCase(), font: LETRA, bold: true,
            color: C.blanco, size: 17,
          })],
          spacing: { after: 0 },
        })],
        { ancho: reparto[i], fondo: C.azul }
      )
    ),
  })

  const cuerpo = filas.map((f, n) =>
    new TableRow({
      children: f.map((c, i) =>
        celda(
          [new Paragraph({
            children: trozos(c, { size: 19, color: C.tinta }),
            spacing: { after: 0, line: 252 },
          })],
          { ancho: reparto[i], fondo: n % 2 ? 'FAFBFD' : undefined }
        )
      ),
    })
  )

  return new Table({
    rows: [cabecera, ...cuerpo],
    columnWidths: reparto,
    width: { size: ANCHO, type: WidthType.DXA },
    borders: bordesFinos(),
  })
}

const bordesFinos = () => {
  const b = { style: BorderStyle.SINGLE, size: 3, color: C.borde }
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b }
}

const sinBordes = () => {
  const b = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b }
}

/** Una tabla de una sola celda: así se dibujan los recuadros de color. */
function recuadro(hijos, { fondo, barra, ancho = ANCHO }) {
  return new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: hijos,
            width: { size: ancho, type: WidthType.DXA },
            shading: fondo ? { type: ShadingType.CLEAR, fill: fondo, color: 'auto' } : undefined,
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            borders: barra
              ? {
                  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  left: { style: BorderStyle.SINGLE, size: 18, color: barra },
                }
              : sinBordes(),
          }),
        ],
      }),
    ],
    columnWidths: [ancho],
    width: { size: ancho, type: WidthType.DXA },
    borders: sinBordes(),
  })
}

const aire = (alto = 120) => new Paragraph({ text: '', spacing: { after: alto } })

// ═══ Cada tipo de bloque ══════════════════════════════════════════════

function avisoDocx(b) {
  const titulos = { nota: 'Ten en cuenta', ojo: 'Atención', dato: 'Dato' }
  const color = b.tipo === 'ojo' ? C.naranja : b.tipo === 'dato' ? C.verde : C.azul
  const fondo = b.tipo === 'ojo' ? C.fondoNaranja : b.tipo === 'dato' ? C.fondoVerde : C.fondoSuave

  return [
    recuadro(
      [
        new Paragraph({
          children: [new TextRun({
            text: (b.titulo ?? titulos[b.tipo] ?? 'Nota').toUpperCase(),
            font: LETRA, bold: true, size: 16, color,
          })],
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: trozos(b.texto, { size: 20, color: C.tinta }),
          spacing: { after: 0, line: 264 },
        }),
      ],
      { fondo, barra: color }
    ),
    aire(140),
  ]
}

function listaDocx(b) {
  return b.items.map((it, i) =>
    new Paragraph({
      children: trozos(it, { size: 21, color: C.tinta }),
      numbering: { reference: b.orden ? 'numerada' : 'vinetas', level: 0 },
      spacing: { after: 70, line: 264 },
    })
  )
}

function controlesDocx(b) {
  const anchos = [Math.round(ANCHO * 0.33), Math.round(ANCHO * 0.67)]
  return [
    tablaDeDatos(['Elemento en pantalla', 'Qué hace'],
      b.items.map(([n, q]) => [n, q]), anchos),
    aire(160),
  ]
}

/**
 * El recuadro de una prueba: cabecera, pasos, qué debe ocurrir y el registro.
 *
 * Todo va en una sola fila de una sola celda. Repartirlo en dos filas dejaba
 * la cabecera azul sola al pie de una página y el cuerpo en la siguiente:
 * Word solo garantiza que no se parta una fila, no un grupo de ellas.
 */
function pruebaDocx(b) {
  const SANGRIA = 200
  const dentro = []

  // ── La cabecera azul ───────────────────────────────────────────────
  dentro.push(new Paragraph({
    children: [
      new TextRun({ text: `${b.id}   `, font: LETRA, bold: true, size: 20, color: C.blanco }),
      new TextRun({ text: b.titulo, font: LETRA, bold: true, size: 22, color: C.blanco }),
      ...(b.rol
        ? [new TextRun({ text: `     ·  ${b.rol}`, font: LETRA, bold: true, size: 18, color: C.verdeClaro })]
        : []),
    ],
    shading: { type: ShadingType.CLEAR, fill: C.azul, color: 'auto' },
    spacing: { before: 60, after: 240, line: 300 },
    indent: { left: 140, right: 140 },
  }))

  if (b.previo) {
    dentro.push(new Paragraph({
      children: [
        new TextRun({ text: 'Antes de empezar: ', font: LETRA, bold: true, size: 19, color: C.suave }),
        ...trozos(b.previo, { size: 19, color: C.suave }),
      ],
      indent: { left: SANGRIA, right: SANGRIA },
      spacing: { after: 130, line: 258 },
    }))
  }

  b.pasos.forEach((p, i) => {
    dentro.push(new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}.  `, font: LETRA, bold: true, size: 21, color: C.azul }),
        ...trozos(p, { size: 21, color: C.tinta }),
      ],
      indent: { left: SANGRIA + 340, right: SANGRIA, hanging: 250 },
      spacing: { after: 70, line: 264 },
    }))
  })

  // ── Lo que debe ocurrir, sobre verde ───────────────────────────────
  dentro.push(new Paragraph({
    children: [new TextRun({ text: 'DEBE OCURRIR', font: LETRA, bold: true, size: 16, color: C.verde })],
    shading: { type: ShadingType.CLEAR, fill: C.fondoVerde, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.verde, space: 6 } },
    indent: { left: SANGRIA + 120, right: SANGRIA },
    spacing: { before: 180, after: 40, line: 240 },
  }))

  b.esperado.forEach((e, i) => {
    dentro.push(new Paragraph({
      children: [
        new TextRun({ text: '•  ', font: LETRA, size: 20, color: C.verde }),
        ...trozos(e, { size: 20, color: C.tinta }),
      ],
      shading: { type: ShadingType.CLEAR, fill: C.fondoVerde, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.verde, space: 6 } },
      indent: { left: SANGRIA + 360, right: SANGRIA, hanging: 240 },
      spacing: { after: i === b.esperado.length - 1 ? 120 : 50, line: 258 },
    }))
  })

  // ── El registro ────────────────────────────────────────────────────
  dentro.push(new Paragraph({
    children: [
      new TextRun({ text: 'RESULTADO     ', font: LETRA, bold: true, size: 16, color: C.suave }),
      new TextRun({ text: '☐', font: 'Segoe UI Symbol', size: 22, color: C.suave }),
      new TextRun({ text: ' Conforme        ', font: LETRA, size: 20, color: C.tinta }),
      new TextRun({ text: '☐', font: 'Segoe UI Symbol', size: 22, color: C.suave }),
      new TextRun({ text: ' Con observación        ', font: LETRA, size: 20, color: C.tinta }),
      new TextRun({ text: '☐', font: 'Segoe UI Symbol', size: 22, color: C.suave }),
      new TextRun({ text: ' No se pudo probar', font: LETRA, size: 20, color: C.tinta }),
    ],
    indent: { left: SANGRIA, right: SANGRIA },
    spacing: { before: 220, after: 160 },
    border: { top: { style: BorderStyle.DASHED, size: 3, color: C.borde, space: 8 } },
  }))

  for (let i = 0; i < 2; i++) {
    dentro.push(new Paragraph({
      text: '',
      indent: { left: SANGRIA, right: SANGRIA },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.borde, space: 1 } },
      spacing: { after: 180 },
    }))
  }

  return [
    new Table({
      rows: [
        new TableRow({
          // Una prueba no se parte: entera o en la página siguiente
          cantSplit: true,
          children: [
            new TableCell({
              children: dentro,
              width: { size: ANCHO, type: WidthType.DXA },
              margins: { top: 0, bottom: 60, left: 0, right: 0 },
            }),
          ],
        }),
      ],
      columnWidths: [ANCHO],
      width: { size: ANCHO, type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: C.borde },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: C.borde },
        left: { style: BorderStyle.SINGLE, size: 4, color: C.borde },
        right: { style: BorderStyle.SINGLE, size: 4, color: C.borde },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
    }),
    aire(220),
  ]
}

function claveDocx(b) {
  return [
    recuadro(
      [
        new Paragraph({
          children: [new TextRun({
            text: (b.titulo ?? 'Contraseña').toUpperCase(),
            font: LETRA, bold: true, size: 18, color: C.verde,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: b.valor, font: MONO, bold: true, size: 42, color: C.azulHondo })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        ...(b.nota
          ? [new Paragraph({
              children: trozos(b.nota, { size: 19, color: C.suave }),
              alignment: AlignmentType.CENTER,
              spacing: { after: 0, line: 258 },
            })]
          : []),
      ],
      { fondo: C.fondoVerde }
    ),
    aire(200),
  ]
}

function bloqueDocx(b) {
  if (typeof b === 'string') return [parrafo(b, { base: { size: 21, color: C.tinta } })]
  switch (b.tipo) {
    case 'parrafo':
      return [parrafo(b.texto, { base: { size: 21, color: C.tinta } })]
    case 'nota': case 'ojo': case 'dato':
      return avisoDocx(b)
    case 'lista':
      return [...listaDocx(b), aire(100)]
    case 'tabla':
      return [tablaDeDatos(b.columnas, b.filas), aire(180)]
    case 'controles':
      return controlesDocx(b)
    case 'prueba':
      return pruebaDocx(b)
    case 'clave':
      return claveDocx(b)
    case 'subtitulo':
      return [new Paragraph({
        children: [new TextRun({ text: b.titulo, font: LETRA, bold: true, size: 23, color: C.azulHondo })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 110 },
      })]
    case 'ruta':
      return [
        recuadro(
          [new Paragraph({
            children: [new TextRun({ text: b.texto.replace(/`/g, ''), font: MONO, size: 19, color: C.azul })],
            spacing: { after: 0 },
          })],
          { fondo: C.fondoSuave, barra: C.azul }
        ),
        aire(160),
      ]
    case 'salto':
      return [new Paragraph({ children: [new PageBreak()] })]
    default:
      return [parrafo(b.texto ?? '', { base: { size: 21, color: C.tinta } })]
  }
}

// ═══ La portada ═══════════════════════════════════════════════════════

const imagen = (ruta) => fs.readFileSync(path.join(RAIZ, ruta))

function portada() {
  const dentro = [
    new Paragraph({
      children: [new ImageRun({
        data: imagen('public/marca/logo-servicon-claro.png'),
        type: 'png',
        transformation: { width: 236, height: 53 },
      })],
      spacing: { after: 900 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Guía de pruebas', font: LETRA, bold: true, size: 76, color: C.blanco })],
      spacing: { after: 0 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'del sistema SIGOV', font: LETRA, bold: true, size: 76, color: C.verdeClaro })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Recorrido completo del panel administrativo y de la aplicación de campo, pantalla por pantalla, para probar el sistema y dejar por escrito qué funciona y qué hay que corregir.',
        font: LETRA, size: 23, color: 'C8D4E6',
      })],
      spacing: { after: 900, line: 300 },
    }),
  ]

  // La ficha de la portada, en dos columnas
  const mitad = Math.round((ANCHO - 700) / 2)
  const pares = []
  for (let i = 0; i < GUIA.ficha.length; i += 2) {
    pares.push(GUIA.ficha.slice(i, i + 2))
  }

  const fichaFilas = pares.map((par) =>
    new TableRow({
      children: [0, 1].map((i) => {
        const p = par[i]
        return new TableCell({
          children: p
            ? [
                new Paragraph({
                  children: [new TextRun({ text: p[0].toUpperCase(), font: LETRA, size: 15, color: '8FA6C4' })],
                  spacing: { after: 30 },
                }),
                new Paragraph({
                  children: [new TextRun({ text: p[1], font: LETRA, bold: true, size: 20, color: C.blanco })],
                  spacing: { after: 160 },
                }),
              ]
            : [new Paragraph({ text: '' })],
          width: { size: mitad, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: C.azulHondo, color: 'auto' },
          margins: { top: 0, bottom: 0, left: 0, right: 200 },
          borders: sinBordes(),
        })
      }),
    })
  )

  dentro.push(new Table({
    rows: fichaFilas,
    columnWidths: [mitad, mitad],
    width: { size: mitad * 2, type: WidthType.DXA },
    borders: sinBordes(),
  }))

  // A sangre: la portada usa su propia sección con márgenes mínimos, así
  // que el azul llega casi al borde del papel.
  const anchoPortada = ANCHO

  return [
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              children: dentro,
              width: { size: anchoPortada, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: C.azulHondo, color: 'auto' },
              margins: { top: 1100, bottom: 700, left: 800, right: 700 },
              borders: sinBordes(),
            }),
          ],
          // No llega al borde: Word deja siempre un párrafo detrás de una
          // tabla, y si la tabla llena la página ese párrafo se lleva una
          // hoja en blanco consigo.
          height: { value: convertMillimetersToTwip(258), rule: 'atLeast' },
        }),
      ],
      columnWidths: [anchoPortada],
      width: { size: anchoPortada, type: WidthType.DXA },
      borders: sinBordes(),
    }),
  ]
}

// ═══ El documento ═════════════════════════════════════════════════════

const hijos = [...portada()]

// El índice, que Word rehace al actualizar los campos
hijos.push(new Paragraph({
  children: [new TextRun({ text: 'Contenido', font: LETRA, bold: true, size: 44, color: C.azul })],
  pageBreakBefore: true,
  spacing: { after: 80 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.verde, space: 4 } },
}))
hijos.push(aire(200))
hijos.push(new Paragraph({
  children: [new TextRun({
    text: 'Para actualizar la numeración después de editar: pulsa dentro del índice y presiona F9.',
    font: LETRA, size: 18, color: C.suave, italics: true,
  })],
  spacing: { after: 200 },
}))
hijos.push(new TableOfContents('Contenido', { hyperlinks: true, headingStyleRange: '1-2' }))
hijos.push(new Paragraph({ children: [new PageBreak()] }))

GUIA.secciones.forEach((s, i) => {
  hijos.push(new Paragraph({
    children: [
      new TextRun({ text: `${i + 1}.  `, font: LETRA, bold: true, size: 30, color: C.verde }),
      new TextRun({ text: s.titulo, font: LETRA, bold: true, size: 36, color: C.azul }),
    ],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 90 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.verde, space: 4 } },
  }))
  hijos.push(aire(180))

  if (s.entrada) {
    hijos.push(parrafo(s.entrada, { base: { size: 22, color: C.suave }, after: 260 }))
  }
  ;(s.bloques ?? []).forEach((b) => hijos.push(...bloqueDocx(b)))

  if (i < GUIA.secciones.length - 1) {
    hijos.push(new Paragraph({ children: [new PageBreak()] }))
  }
})

const doc = new Document({
  creator: 'Grupo Servicon V&D EIRL',
  title: GUIA.titulo,
  description: 'Guía de pruebas del sistema SIGOV',
  styles: {
    default: {
      document: { run: { font: LETRA, size: 21, color: C.tinta } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: LETRA, size: 36, bold: true, color: C.azul },
        paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: LETRA, size: 23, bold: true, color: C.azulHondo },
        paragraph: { outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'vinetas',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 240 } },
                   run: { color: C.azul, font: LETRA } },
        }],
      },
      {
        reference: 'numerada',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 260 } },
                   run: { color: C.azul, bold: true, font: LETRA } },
        }],
      },
    ],
  },
  sections: [
    {
      properties: {
        // Word llama «primera página diferente» a lo que aquí sirve para que
        // el encabezado y el pie no pisen el azul de la portada. Se resuelve
        // con una sola sección: dos secciones dejaban una hoja en blanco
        // detrás de la portada.
        titlePage: true,
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: {
            top: convertMillimetersToTwip(16),
            bottom: convertMillimetersToTwip(16),
            left: convertMillimetersToTwip(18),
            right: convertMillimetersToTwip(18),
          },
        },
      },
      headers: {
        first: new (require('docx').Header)({ children: [new Paragraph({ text: '' })] }),
        default: new (require('docx').Header)({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'SIGOV · Sistema de Gestión Operativa Vial', font: LETRA, size: 15, color: '9AA3B0' }),
              new TextRun({ text: '\t\tGuía de pruebas', font: LETRA, size: 15, color: '9AA3B0' }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: 'E5E8EE', space: 2 } },
            spacing: { after: 120 },
          })],
        }),
      },
      footers: {
        first: new (require('docx').Footer)({ children: [new Paragraph({ text: '' })] }),
        default: new (require('docx').Footer)({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${GUIA.titulo} · ${GUIA.version}`, font: LETRA, size: 15, color: '6B7280' }),
              new TextRun({ text: '\t\tGrupo Servicon V&D EIRL', font: LETRA, size: 15, color: '6B7280' }),
            ],
            spacing: { before: 100 },
          })],
        }),
      },
      children: hijos,
    },
  ],
})

const bytes = await Packer.toBuffer(doc)
fs.writeFileSync(SALIDA, bytes)
console.log(`Word listo: ${SALIDA} (${(bytes.length / 1024).toFixed(0)} KB)`)
