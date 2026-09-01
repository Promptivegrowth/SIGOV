#!/usr/bin/env node
/**
 * SIGOV · Generador de la guía de uso en Word.
 *
 * El contenido vive aparte, en `guia-contenido.mjs`, escrito con bloques
 * simples (títulos, párrafos, tablas, cajas). Este archivo solo se encarga de
 * convertirlo en un .docx con la identidad del proyecto.
 *
 *   node scripts/gen-guia-docx.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, PageBreak, TabStopType, convertInchesToTwip,
} from 'docx'
import { CONTENIDO, PORTADA } from './guia-contenido.mjs'

// ─── Identidad ────────────────────────────────────────────────────────────
const AZUL = '1B31A0'        // el azul del sello SIGOV
const AZUL_CLARO = 'E8ECFA'
const AMBAR = 'C67700'
const AMBAR_SUAVE = 'FFF6E5'
const GRIS = '4B5563'
const GRIS_LINEA = 'D6DAE3'
const GRIS_FONDO = 'F4F6FA'
const TINTA = '111827'

const FUENTE = 'Segoe UI'

const sinBorde = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const linea = (color = GRIS_LINEA) => ({ style: BorderStyle.SINGLE, size: 4, color })

/** Texto con formato: **negrita**, `código`. */
function runs(texto, base = {}) {
  const out = []
  const partes = String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  for (const p of partes) {
    if (!p) continue
    if (p.startsWith('**') && p.endsWith('**')) {
      out.push(new TextRun({ text: p.slice(2, -2), bold: true, font: FUENTE, ...base }))
    } else if (p.startsWith('`') && p.endsWith('`')) {
      out.push(new TextRun({
        text: p.slice(1, -1), font: 'Consolas', size: 19, color: AZUL, ...base,
      }))
    } else {
      out.push(new TextRun({ text: p, font: FUENTE, ...base }))
    }
  }
  return out
}

const parrafo = (texto, opts = {}) =>
  new Paragraph({
    children: runs(texto, opts.run ?? {}),
    spacing: { after: opts.after ?? 140, line: 280 },
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    ...opts.extra,
  })

const vinheta = (texto, nivel = 0) =>
  new Paragraph({
    children: runs(texto),
    bullet: { level: nivel },
    spacing: { after: 70, line: 270 },
  })

const numerada = (texto, referencia, nivel = 0) =>
  new Paragraph({
    children: runs(texto),
    numbering: { reference: referencia, level: nivel },
    spacing: { after: 70, line: 270 },
  })

// ─── Títulos ──────────────────────────────────────────────────────────────
function h1(texto, numero) {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: numero ? `${numero}  ` : '', bold: true, size: 30, color: AMBAR, font: FUENTE }),
        new TextRun({ text: texto, bold: true, size: 30, color: AZUL, font: FUENTE }),
      ],
      spacing: { before: 360, after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: AZUL, space: 6 } },
      keepNext: true,
    }),
    new Paragraph({ text: '', spacing: { after: 60 } }),
  ]
}

const h2 = (texto, numero) =>
  new Paragraph({
    children: [
      new TextRun({ text: numero ? `${numero}  ` : '', bold: true, size: 23, color: AMBAR, font: FUENTE }),
      new TextRun({ text: texto, bold: true, size: 23, color: AZUL, font: FUENTE }),
    ],
    spacing: { before: 260, after: 100 },
    keepNext: true,
  })

const h3 = (texto) =>
  new Paragraph({
    children: [new TextRun({ text: texto, bold: true, size: 21, color: TINTA, font: FUENTE })],
    spacing: { before: 180, after: 80 },
    keepNext: true,
  })

// ─── Tablas ───────────────────────────────────────────────────────────────
function celda(texto, { cabecera = false, fondo, ancho, negrita = false } = {}) {
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: cabecera
      ? { type: ShadingType.CLEAR, fill: AZUL, color: 'auto' }
      : fondo ? { type: ShadingType.CLEAR, fill: fondo, color: 'auto' } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    borders: {
      top: linea(), bottom: linea(), left: linea(), right: linea(),
    },
    children: [
      new Paragraph({
        children: runs(texto, cabecera
          ? { bold: true, color: 'FFFFFF', size: 18 }
          : { size: 19, color: TINTA, bold: negrita }),
        spacing: { after: 0, line: 250 },
      }),
    ],
  })
}

function tabla(cabeceras, filas, anchos) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: cabeceras.map((c, i) => celda(c, { cabecera: true, ancho: anchos?.[i] })),
    }),
    ...filas.map((f, idx) =>
      new TableRow({
        children: f.map((c, i) =>
          celda(c, { fondo: idx % 2 ? GRIS_FONDO : undefined, ancho: anchos?.[i], negrita: i === 0 })
        ),
      })
    ),
  ]
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

// ─── Cajas destacadas ─────────────────────────────────────────────────────
function caja(titulo, lineas, { fondo, color, icono }) {
  const hijos = [
    new Paragraph({
      children: [
        new TextRun({ text: `${icono}  ${titulo}`, bold: true, size: 18, color, font: FUENTE }),
      ],
      spacing: { after: 80 },
    }),
    ...lineas.map((l, i) =>
      new Paragraph({
        children: runs(l, { size: 19, color: TINTA }),
        spacing: { after: i === lineas.length - 1 ? 0 : 70, line: 265 },
      })
    ),
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: fondo, color: 'auto' },
            margins: { top: 150, bottom: 150, left: 180, right: 180 },
            borders: {
              top: sinBorde, bottom: sinBorde, right: sinBorde,
              left: { style: BorderStyle.SINGLE, size: 18, color },
            },
            children: hijos,
          }),
        ],
      }),
    ],
  })
}

const ejemplo = (lineas) =>
  caja('EJEMPLO PARA PROBAR', lineas, { fondo: AMBAR_SUAVE, color: AMBAR, icono: '▶' })

const debesVer = (lineas) =>
  caja('QUÉ DEBE PASAR', lineas, { fondo: AZUL_CLARO, color: AZUL, icono: '✓' })

const aviso = (lineas) =>
  caja('TEN EN CUENTA', lineas, { fondo: GRIS_FONDO, color: GRIS, icono: '!' })

// ─── Traducción de los bloques del contenido ──────────────────────────────
let listaNumerada = 0

function render(bloques) {
  const hijos = []
  for (const b of bloques) {
    switch (b.t) {
      case 'h1': hijos.push(...h1(b.x, b.n)); break
      case 'h2': hijos.push(h2(b.x, b.n)); break
      case 'h3': hijos.push(h3(b.x)); break
      case 'p': hijos.push(parrafo(b.x)); break
      case 'ul': for (const li of b.x) hijos.push(vinheta(li)); hijos.push(new Paragraph({ text: '', spacing: { after: 90 } })); break
      case 'ol': {
        // Cada lista estrena su propia numeración: si compartieran una sola,
        // los pasos del capítulo 6 seguirían contando desde los del capítulo 1.
        const ref = `pasos-${listaNumerada++}`
        for (const li of b.x) hijos.push(numerada(li, ref))
        hijos.push(new Paragraph({ text: '', spacing: { after: 90 } }))
        break
      }
      case 'tabla':
        hijos.push(tabla(b.cab, b.filas, b.anchos))
        hijos.push(new Paragraph({ text: '', spacing: { after: 160 } }))
        break
      case 'ejemplo': hijos.push(ejemplo(b.x)); hijos.push(new Paragraph({ text: '', spacing: { after: 160 } })); break
      case 'ver': hijos.push(debesVer(b.x)); hijos.push(new Paragraph({ text: '', spacing: { after: 160 } })); break
      case 'aviso': hijos.push(aviso(b.x)); hijos.push(new Paragraph({ text: '', spacing: { after: 160 } })); break
      case 'salto': hijos.push(new Paragraph({ children: [new PageBreak()] })); break
      default: throw new Error(`Bloque desconocido: ${b.t}`)
    }
  }
  return hijos
}

// ─── Portada ──────────────────────────────────────────────────────────────
function portada() {
  const banda = (texto, size, color, bold = true, after = 100) =>
    new Paragraph({
      children: [new TextRun({ text: texto, size, color, bold, font: FUENTE })],
      spacing: { after },
      alignment: AlignmentType.LEFT,
    })

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: AZUL, color: 'auto' },
              margins: { top: 700, bottom: 700, left: 500, right: 500 },
              borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
              children: [
                banda('SIGOV', 96, 'FFFFFF', true, 60),
                banda('Sistema Integral de Gestión Operativa Vial', 26, 'C7D0F5', false, 300),
                new Paragraph({
                  children: [new TextRun({ text: PORTADA.titulo, size: 40, color: 'FFFFFF', bold: true, font: FUENTE })],
                  spacing: { after: 120 },
                }),
                banda(PORTADA.subtitulo, 22, 'C7D0F5', false, 0),
              ],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ text: '', spacing: { after: 500 } }),

    tabla(
      ['Dato', 'Detalle'],
      PORTADA.datos,
      [30, 70]
    ),

    new Paragraph({ text: '', spacing: { after: 700 } }),

    new Paragraph({
      children: [
        new TextRun({ text: PORTADA.autor, bold: true, size: 20, color: AZUL, font: FUENTE }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: PORTADA.pie, size: 18, color: GRIS, font: FUENTE })],
      spacing: { after: 0 },
    }),

    new Paragraph({ children: [new PageBreak()] }),
  ]
}

// ─── Documento ────────────────────────────────────────────────────────────
const doc = new Document({
  creator: PORTADA.autor,
  title: PORTADA.titulo,
  description: PORTADA.subtitulo,
  styles: {
    default: {
      document: {
        run: { font: FUENTE, size: 20, color: TINTA },
        paragraph: { spacing: { line: 280 } },
      },
    },
  },
  numbering: {
    config: CONTENIDO.filter((b) => b.t === 'ol').map((_, i) => ({
      reference: `pasos-${i}`,
      levels: [
        {
          level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.22) } } },
        },
      ],
    })),
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1100, right: 1000, bottom: 1100, left: 1000 },
        },
        // La portada va limpia: sin encabezado ni numeración encima
        titlePage: true,
      },
      headers: {
        first: new Header({ children: [new Paragraph({ text: '' })] }),
        default: new Header({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GRIS_LINEA, space: 6 } },
              children: [
                new TextRun({ text: 'SIGOV · Guía de uso', size: 16, color: AZUL, bold: true, font: FUENTE }),
                new TextRun({ text: '\t' + PORTADA.cliente, size: 16, color: GRIS, font: FUENTE }),
              ],
            }),
          ],
        }),
      },
      footers: {
        first: new Footer({ children: [new Paragraph({ text: '' })] }),
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: PORTADA.autor + '  ·  ', size: 15, color: GRIS, font: FUENTE }),
                new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 15, color: GRIS, font: FUENTE }),
              ],
            }),
          ],
        }),
      },
      children: [...portada(), ...render(CONTENIDO)],
    },
  ],
})

const destino = path.join(process.cwd(), PORTADA.archivo)
const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(destino, buffer)

const kb = (buffer.length / 1024).toFixed(0)
console.log(`\n  \x1b[32m✓\x1b[0m Guía generada`)
console.log(`  \x1b[90m${destino} · ${kb} KB · ${CONTENIDO.length} bloques\x1b[0m\n`)
