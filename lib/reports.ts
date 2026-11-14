'use client'

import { fmtDate, fmtNumber, fmtProgresiva } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Generación de reportes (Módulo 10)
// PDF con jsPDF + autotable · Excel con ExcelJS. Ambas librerías se cargan
// bajo demanda para no pesar en el bundle inicial.
// ═══════════════════════════════════════════════════════════════════════════

export interface ReportMeta {
  titulo: string
  subtitulo?: string
  servicio: string
  cliente?: string | null
  contrato?: string | null
  periodo: string
  generadoPor: string
  /** Datos de la organizacion emisora, para la portada */
  organizacion?: string
  ruc?: string
  /** Lo que el usuario filtró, legible: «Observadas · Señalización · AQP-01» (OBS 9). */
  filtros?: string
  cuadrilla?: string | null
  supervisor?: string | null
  tramo?: string | null
  /** Cantidad de registros; si falta, se cuentan las filas de la tabla. */
  registros?: number
}

export const ORG_DEFAULT = { nombre: 'Grupo Servicon V&D EIRL', ruc: '' }

/** «COVINCA» → «COVINCA S.A.»: como lo nombra el contrato (OBS 9). */
export function nombreCliente(c?: string | null) {
  const v = (c ?? '').trim()
  if (!v || /^covinca$/i.test(v)) return 'COVINCA S.A.'
  return v
}

const ahora = () =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date())

/** Las líneas de contexto que lleva toda exportación (OBS 9). */
function contexto(meta: ReportMeta, filas?: number) {
  const n = meta.registros ?? filas
  return {
    generado: `Generado el ${ahora()} por ${meta.generadoPor || '—'}${n != null ? ` · ${fmtNumber(n)} registro${n === 1 ? '' : 's'}` : ''}`,
    filtros: meta.filtros ? `Filtros: ${meta.filtros}` : null,
    alcance: [
      meta.cuadrilla && `Cuadrilla: ${meta.cuadrilla}`,
      meta.supervisor && `Supervisor: ${meta.supervisor}`,
      meta.tramo && `Tramo: ${meta.tramo}`,
    ].filter(Boolean).join(' · ') || null,
  }
}

/** El logo de SERVICON, una vez por sesión, listo para jsPDF y ExcelJS. */
let logoCache: Promise<{ data: string; w: number; h: number } | null> | null = null
/** El ya cargado: las páginas de fotos y firmas lo usan sin esperarlo. */
let logoListo: { data: string; w: number; h: number } | null = null
function logoServicon() {
  if (!logoCache) {
    logoCache = (async () => {
      try {
        const blob = await fetch('/marca/logo-servicon.png').then((r) => (r.ok ? r.blob() : Promise.reject()))
        const data = await new Promise<string>((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(String(fr.result))
          fr.onerror = rej
          fr.readAsDataURL(blob)
        })
        const bmp = await createImageBitmap(blob)
        const out = { data, w: bmp.width, h: bmp.height }
        bmp.close?.()
        logoListo = out
        return out
      } catch {
        return null
      }
    })()
  }
  return logoCache
}

/* Los colores del logotipo de Grupo Servicon, que es lo que el cliente ve
   impreso: azul #072D70 y naranja #F96414. */
const BRAND = { r: 7, g: 45, b: 112 }
const ACCENT = { r: 249, g: 100, b: 20 }

async function jspdf() {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then((m) => m.default),
  ])
  return { jsPDF, autoTable }
}

/**
 * Portada del informe. Marca SIGOV, el contrato, el periodo y quien lo emite:
 * es lo primero que ve el cliente y lo que hace que el PDF se lea como un
 * entregable formal y no como un volcado de tabla.
 */
function cover(doc: any, meta: ReportMeta, kpis?: { label: string; value: string }[]) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // Fondo superior de marca
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
  doc.rect(0, 0, W, H * 0.42, 'F')
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.rect(0, H * 0.42, W, 2, 'F')

  // Marca SIGOV: escudo con la calzada en perspectiva
  const cx = W / 2
  const top = H * 0.11
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(255, 255, 255)
  // calzada (trapecio)
  doc.triangle(cx - 4, top + 34, cx + 4, top + 34, cx + 1.6, top + 8, 'F')
  doc.triangle(cx - 4, top + 34, cx - 1.6, top + 8, cx + 1.6, top + 8, 'F')
  // marcas centrales ambar
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.roundedRect(cx - 0.55, top + 12, 1.1, 3.2, 0.5, 0.5, 'F')
  doc.roundedRect(cx - 0.7, top + 19, 1.4, 4, 0.6, 0.6, 'F')
  doc.roundedRect(cx - 0.9, top + 27, 1.8, 5, 0.8, 0.8, 'F')
  // horizonte
  doc.roundedRect(cx - 6, top + 5.6, 12, 1.8, 0.9, 0.9, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.text('SIGOV', cx, top + 52, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text('SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL', cx, top + 59, { align: 'center' })

  // Titulo del informe
  let y = H * 0.42 + 22
  doc.setTextColor(20, 26, 48)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  const titleLines = doc.splitTextToSize(meta.titulo, W - 50)
  doc.text(titleLines, cx, y, { align: 'center' })
  y += titleLines.length * 8

  if (meta.subtitulo) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(90, 96, 112)
    const subLines = doc.splitTextToSize(meta.subtitulo, W - 60)
    doc.text(subLines, cx, y + 2, { align: 'center' })
    y += subLines.length * 5.5
  }

  // Linea ambar decorativa
  y += 8
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.setLineWidth(1.2)
  doc.line(cx - 18, y, cx + 18, y)
  doc.setLineWidth(0.2)

  // Ficha del contrato
  y += 14
  const rows: [string, string][] = [
    ['Servicio', meta.servicio],
    ['Cliente', meta.cliente || '-'],
    ['Contrato', meta.contrato || '-'],
    ['Periodo', meta.periodo],
    ['Emitido por', meta.organizacion || ORG_DEFAULT.nombre],
    ['Elaborado por', meta.generadoPor],
    ['Fecha de emision', new Date().toLocaleString('es-PE')],
  ]
  const boxW = W - 60
  doc.setFillColor(246, 248, 252)
  doc.roundedRect(30, y - 6, boxW, rows.length * 8 + 10, 3, 3, 'F')
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(120, 126, 142)
    doc.text(k.toUpperCase(), 36, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(28, 34, 56)
    doc.text(doc.splitTextToSize(String(v), boxW - 60)[0] ?? '-', 78, y)
    y += 8
  }

  // KPIs de portada
  if (kpis?.length) {
    y += 12
    const cardW = (W - 60 - (kpis.length - 1) * 5) / kpis.length
    kpis.forEach((kp, i) => {
      const x = 30 + i * (cardW + 5)
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
      doc.roundedRect(x, y, cardW, 20, 2.5, 2.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')
      doc.text(kp.label.toUpperCase(), x + 4, y + 7)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(kp.value, x + 4, y + 15.5)
    })
  }

  // Pie de portada
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(140, 146, 160)
  doc.text(
    'Documento generado automaticamente por SIGOV. Los datos provienen de los registros de campo',
    cx, H - 22, { align: 'center' }
  )
  doc.text(
    'con evidencia georreferenciada e inmutable. Desarrollado por Promptive.',
    cx, H - 18, { align: 'center' }
  )

  doc.addPage()
}

function header(doc: any, meta: ReportMeta, logo?: { data: string; w: number; h: number } | null, filas?: number) {
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
  doc.rect(0, 0, W, 30, 'F')
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.rect(0, 30, W, 1.4, 'F')

  // El logo de SERVICON en su recuadro blanco, y SIGOV al lado (OBS 9)
  logo = logo ?? logoListo
  let x0 = 14
  if (logo) {
    const alto = 14
    const ancho = Math.min(40, (logo.w * alto) / logo.h)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(10, 6, ancho + 8, alto + 4, 1.5, 1.5, 'F')
    doc.addImage(logo.data, 'PNG', 14, 8, ancho, alto)
    x0 = 10 + ancho + 8 + 5
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('SIGOV', x0, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text('SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL', x0, 18.5)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(meta.titulo, W - 14, 12, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(meta.periodo, W - 14, 17.5, { align: 'right' })
  if (meta.contrato) doc.text(meta.contrato, W - 14, 22, { align: 'right' })

  // Bloque de contexto
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(8.5)
  let y = 40
  doc.setFont('helvetica', 'bold')
  doc.text(meta.servicio, 14, y)
  doc.setFont('helvetica', 'normal')
  y += 4.5
  doc.text(`Cliente: ${nombreCliente(meta.cliente)}`, 14, y)
  if (meta.subtitulo) {
    y += 4.5
    doc.text(meta.subtitulo, 14, y)
  }
  const c = contexto(meta, filas)
  doc.setFontSize(7.8)
  doc.setTextColor(95, 100, 115)
  for (const l of [c.generado, c.filtros, c.alcance].filter(Boolean) as string[]) {
    y += 4.2
    doc.text(doc.splitTextToSize(l, W - 28).slice(0, 1), 14, y)
  }
  return y + 6
}

function footer(doc: any, meta: ReportMeta, conPortada = true) {
  const pages = doc.internal.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  // La portada no lleva pie ni numeracion; sin portada, todas lo llevan
  const desde = conPortada ? 2 : 1
  for (let i = desde; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(215, 218, 226)
    doc.line(14, H - 14, W - 14, H - 14)
    doc.setFontSize(7)
    doc.setTextColor(120, 124, 136)
    doc.text(
      `${meta.titulo} · ${nombreCliente(meta.cliente)} · Generado por ${meta.generadoPor} · ${ahora()} · SIGOV`,
      14,
      H - 9
    )
    doc.text(`Página ${i - desde + 1} de ${pages - desde + 1}`, W - 14, H - 9, { align: 'right' })
  }
}

// ─── Reporte genérico de tabla ────────────────────────────────────────────
/**
 * Descarga una imagen y la deja lista para incrustarla en el PDF.
 *
 * Se pasa por un canvas a propósito: las evidencias se guardan en WebP y jsPDF
 * no lo admite en todas las versiones, y de paso se limita el tamaño para que
 * un parte con veinte fotos no produzca un archivo de 40 MB.
 */
async function imagenParaPdf(
  url: string,
  maxLado = 900
): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * escala))
    const h = Math.max(1, Math.round(bitmap.height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    return { data: canvas.toDataURL('image/jpeg', 0.82), w, h }
  } catch {
    return null
  }
}

export interface FotoInforme {
  url: string
  titulo?: string
  pie?: string
}

export interface FirmaInforme {
  url?: string | null
  nombre: string
  detalle?: string | null
}

/** Panel fotográfico: las fotos en cuadrícula, dos por fila. */
async function panelFotografico(doc: any, fotos: FotoInforme[], meta: ReportMeta) {
  const cargadas = await Promise.all(fotos.slice(0, 24).map((f) => imagenParaPdf(f.url)))
  const utiles = cargadas.map((img, i) => ({ img, info: fotos[i] })).filter((x) => x.img)
  if (!utiles.length) return

  doc.addPage()
  let y = header(doc, meta)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
  doc.text('Panel fotográfico', 14, y)
  y += 7

  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const cols = 2
  const gap = 6
  const cellW = (W - 28 - gap) / cols
  const imgH = 52
  const cellH = imgH + 16

  utiles.forEach((x, i) => {
    const col = i % cols
    if (col === 0 && y + cellH > H - 22) {
      doc.addPage()
      y = header(doc, meta)
    }
    const px = 14 + col * (cellW + gap)

    // La foto, centrada y sin deformar dentro de su recuadro
    const rel = x.img!.w / x.img!.h
    let dw = cellW
    let dh = dw / rel
    if (dh > imgH) { dh = imgH; dw = dh * rel }
    const offsetX = px + (cellW - dw) / 2

    doc.setFillColor(244, 246, 250)
    doc.rect(px, y, cellW, imgH, 'F')
    doc.addImage(x.img!.data, 'JPEG', offsetX, y + (imgH - dh) / 2, dw, dh)
    doc.setDrawColor(224, 227, 235)
    doc.rect(px, y, cellW, imgH)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(20, 26, 48)
    doc.text(doc.splitTextToSize(x.info.titulo ?? '', cellW).slice(0, 1), px, y + imgH + 4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    doc.setTextColor(110, 116, 132)
    doc.text(doc.splitTextToSize(x.info.pie ?? '', cellW).slice(0, 2), px, y + imgH + 8)

    if (col === cols - 1) y += cellH
  })

  if (utiles.length % cols !== 0) y += cellH
}

/** Bloque de firmas: la rúbrica de cada persona con su nombre debajo. */
async function bloqueFirmas(doc: any, firmas: FirmaInforme[], meta: ReportMeta, startY: number) {
  if (!firmas.length) return
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const cols = 3
  const gap = 6
  const cellW = (W - 28 - gap * (cols - 1)) / cols
  const firmaH = 22
  const cellH = firmaH + 14

  let y = startY
  if (y + cellH + 12 > H - 22) {
    doc.addPage()
    y = header(doc, meta)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
  doc.text('Firmas', 14, y)
  y += 6

  const cargadas = await Promise.all(
    firmas.map((f) => (f.url ? imagenParaPdf(f.url, 500) : Promise.resolve(null)))
  )

  firmas.forEach((f, i) => {
    const col = i % cols
    if (col === 0 && i > 0) y += cellH
    if (y + cellH > H - 22) {
      doc.addPage()
      y = header(doc, meta)
    }
    const px = 14 + col * (cellW + gap)
    const img = cargadas[i]

    if (img) {
      const rel = img.w / img.h
      let dh = firmaH
      let dw = dh * rel
      if (dw > cellW) { dw = cellW; dh = dw / rel }
      doc.addImage(img.data, 'JPEG', px + (cellW - dw) / 2, y + (firmaH - dh), dw, dh)
    } else {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(150, 155, 168)
      doc.text('sin firma registrada', px + 2, y + firmaH - 4)
    }

    doc.setDrawColor(150, 155, 168)
    doc.line(px, y + firmaH + 1, px + cellW, y + firmaH + 1)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(20, 26, 48)
    doc.text(doc.splitTextToSize(f.nombre, cellW).slice(0, 1), px, y + firmaH + 5)

    if (f.detalle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.6)
      doc.setTextColor(110, 116, 132)
      doc.text(doc.splitTextToSize(f.detalle, cellW).slice(0, 1), px, y + firmaH + 9)
    }
  })
}

export async function reportePdf(
  meta: ReportMeta,
  columns: { header: string; key: string; align?: 'left' | 'right' | 'center'; width?: number }[],
  rows: any[],
  options?: {
    kpis?: { label: string; value: string }[]
    landscape?: boolean
    /** false para omitir la portada (informes de una sola hoja) */
    cover?: boolean
    /** Nota al pie del cuerpo, antes de la tabla */
    intro?: string
    /** Fotografías que acompañan al informe, en un panel al final */
    fotos?: FotoInforme[]
    /** Firmas que cierran el documento */
    firmas?: FirmaInforme[]
    /**
     * Una foto dentro de la tabla, en la columna `key` (la última, casi
     * siempre): `urls[i]` es la de la fila i. Elvis (26/10): «en la última
     * columna, la fotografía de referencia».
     */
    fotosEnTabla?: { key: string; urls: (string | null)[] }
  }
) {
  const { jsPDF, autoTable } = await jspdf()
  const doc = new jsPDF({ orientation: options?.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

  if (options?.cover !== false) cover(doc, meta, options?.kpis)

  const logo = await logoServicon()
  let y = header(doc, meta, logo, rows.length)

  // KPIs en tarjetas
  if (options?.kpis?.length) {
    const W = doc.internal.pageSize.getWidth()
    const cardW = (W - 28 - (options.kpis.length - 1) * 4) / options.kpis.length
    options.kpis.forEach((k, i) => {
      const x = 14 + i * (cardW + 4)
      doc.setFillColor(244, 246, 251)
      doc.roundedRect(x, y, cardW, 16, 2, 2, 'F')
      doc.setTextColor(110, 114, 128)
      doc.setFontSize(6.8)
      doc.text(k.label.toUpperCase(), x + 3, y + 5.5)
      doc.setTextColor(20, 26, 48)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(k.value, x + 3, y + 12)
      doc.setFont('helvetica', 'normal')
    })
    y += 22
  }

  if (options?.intro) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(90, 96, 112)
    const lines = doc.splitTextToSize(options.intro, doc.internal.pageSize.getWidth() - 28)
    doc.text(lines, 14, y)
    y += lines.length * 4.5 + 4
  }

  const enTabla = options?.fotosEnTabla
  const colFoto = enTabla ? columns.findIndex((c) => c.key === enTabla.key) : -1
  const fotosFila = colFoto >= 0
    ? await Promise.all(enTabla!.urls.map((u) => (u ? imagenParaPdf(u, 420) : Promise.resolve(null))))
    : []

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((r, i) => columns.map((c, k) => (k === colFoto ? (fotosFila[i] ? '' : 'Sin foto') : r[c.key] ?? '—'))),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [224, 227, 235], lineWidth: 0.1 },
    headStyles: {
      fillColor: [BRAND.r, BRAND.g, BRAND.b],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, {
        halign: c.align ?? 'left',
        ...(c.width ? { cellWidth: c.width } : {}),
        ...(i === colFoto ? { minCellHeight: 24 } : {}),
      }])
    ),
    margin: { left: 14, right: 14, bottom: 20 },
    rowPageBreak: 'avoid',
    // La foto, encajada en su celda sin deformarse
    didDrawCell: (d: any) => {
      if (d.section !== 'body' || d.column.index !== colFoto) return
      const img = fotosFila[d.row.index]
      if (!img) return
      const maxW = d.cell.width - 2
      const maxH = d.cell.height - 2
      const k = Math.min(maxW / img.w, maxH / img.h)
      const w = img.w * k
      const h = img.h * k
      doc.addImage(img.data, 'JPEG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h)
    },
  })

  // Las firmas cierran el documento, justo debajo de la tabla
  if (options?.firmas?.length) {
    const finTabla = (doc as any).lastAutoTable?.finalY ?? y
    await bloqueFirmas(doc, options.firmas, meta, finTabla + 10)
  }

  // Las fotos van en su propio panel, al final
  if (options?.fotos?.length) await panelFotografico(doc, options.fotos, meta)

  // El pie se pinta al final, con el documento ya completo: si se numerara
  // antes, el panel fotográfico saldría con la numeración equivocada.
  footer(doc, meta, options?.cover !== false)

  return doc
}

export async function descargarPdf(
  nombre: string,
  meta: ReportMeta,
  columns: any[],
  rows: any[],
  options?: any
) {
  const doc = await reportePdf(meta, columns, rows, options)
  doc.save(`${nombre}.pdf`)
}

// ─── Excel con formato ────────────────────────────────────────────────────
export async function descargarExcel(
  nombre: string,
  meta: ReportMeta,
  sheets: {
    name: string
    columns: { header: string; key: string; width?: number }[]
    rows: any[]
    /** Una foto por fila dentro de la columna `key` (la URL de la fila i). */
    fotos?: { key: string; urls: (string | null)[] }
  }[]
) {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV'
  wb.created = new Date()

  // Hoja de portada con la identidad del informe
  const portada = wb.addWorksheet('Portada', { views: [{ showGridLines: false }] })
  portada.columns = [{ width: 26 }, { width: 62 }]
  portada.mergeCells('A1:B2')
  const t0 = portada.getCell('A1')
  t0.value = 'SIGOV'
  t0.font = { bold: true, size: 26, color: { argb: 'FFFFFFFF' } }
  t0.alignment = { vertical: 'middle', horizontal: 'center' }
  t0.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF072D70' } }
  portada.getRow(1).height = 26
  portada.getRow(2).height = 20

  portada.mergeCells('A3:B3')
  const t1 = portada.getCell('A3')
  t1.value = 'SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL'
  t1.font = { size: 8.5, color: { argb: 'FFFFFFFF' } }
  t1.alignment = { horizontal: 'center' }
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF072D70' } }

  const logo = await logoServicon()
  if (logo) {
    const id = wb.addImage({ base64: logo.data, extension: 'png' })
    const alto = 46
    portada.addImage(id, { tl: { col: 1.02, row: 0.1 }, ext: { width: (logo.w * alto) / logo.h, height: alto }, editAs: 'absolute' })
  }
  portada.addRow([])
  const tt = portada.addRow(['', meta.titulo])
  tt.getCell(2).font = { bold: true, size: 16, color: { argb: 'FF141A30' } }
  if (meta.subtitulo) {
    const ss = portada.addRow(['', meta.subtitulo])
    ss.getCell(2).font = { size: 10, color: { argb: 'FF6B7280' } }
  }
  portada.addRow([])

  const total = meta.registros ?? sheets.reduce((s, x) => s + x.rows.length, 0)
  const ficha: [string, string][] = ([
    ['Servicio', meta.servicio],
    ['Cliente', nombreCliente(meta.cliente)],
    ['Contrato', meta.contrato || '-'],
    ['Periodo', meta.periodo],
    ['Filtros aplicados', meta.filtros || 'Sin filtros'],
    ['Cantidad de registros', fmtNumber(total)],
    ['Cuadrilla', meta.cuadrilla || ''],
    ['Supervisor', meta.supervisor || ''],
    ['Tramo / subtramo', meta.tramo || ''],
    ['Emitido por', meta.organizacion || ORG_DEFAULT.nombre],
    ['Elaborado por', meta.generadoPor],
    ['Fecha y hora de emisión', ahora()],
  ] as [string, string][]).filter(([k, v]) => v || !['Cuadrilla', 'Supervisor', 'Tramo / subtramo'].includes(k))
  for (const [k, v] of ficha) {
    const r = portada.addRow([k.toUpperCase(), v])
    r.getCell(1).font = { size: 8.5, bold: true, color: { argb: 'FF787E8E' } }
    r.getCell(2).font = { size: 10, color: { argb: 'FF1C2238' } }
    r.height = 16
  }
  portada.addRow([])
  const hojas = portada.addRow(['HOJAS', sheets.map((x) => x.name).join(' - ')])
  hojas.getCell(1).font = { size: 8.5, bold: true, color: { argb: 'FF787E8E' } }
  hojas.getCell(2).font = { size: 10, color: { argb: 'FF1C2238' } }

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 4 }],
    })

    // Encabezado de marca
    ws.mergeCells('A1', `${String.fromCharCode(64 + Math.max(s.columns.length, 3))}1`)
    const t = ws.getCell('A1')
    t.value = `SIGOV · ${meta.titulo}`
    t.font = { bold: true, size: 14, color: { argb: 'FF072D70' } }
    t.alignment = { vertical: 'middle' }
    ws.getRow(1).height = 22

    ws.mergeCells('A2', `${String.fromCharCode(64 + Math.max(s.columns.length, 3))}2`)
    const c = contexto(meta, s.rows.length)
    ws.getCell('A2').value = [
      `${meta.servicio} · Cliente: ${nombreCliente(meta.cliente)} · ${meta.periodo}`,
      c.generado, c.filtros, c.alcance,
    ].filter(Boolean).join(' · ')
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF6B7280' } }
    ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(2).height = 26

    ws.addRow([])

    ws.columns = s.columns.map((c) => ({ key: c.key, width: c.width ?? 18 }))
    const headerRow = ws.addRow(s.columns.map((c) => c.header))
    headerRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF072D70' } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } }
    })
    headerRow.height = 18

    s.rows.forEach((r, i) => {
      const row = ws.addRow(s.columns.map((c) => r[c.key] ?? ''))
      row.eachCell((cell: any) => {
        cell.font = { size: 9 }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FC' } }
      })
    })

    // Las fotos dentro de su celda; la fila crece para mostrarlas
    // La foto queda anclada a su celda (twoCellAnchor, «mover y cambiar de
    // tamaño con las celdas»): acompaña a su fila al ordenar y al filtrar (OBS 9)
    const col = s.fotos ? s.columns.findIndex((c) => c.key === s.fotos!.key) : -1
    if (col >= 0) {
      const imgs = await Promise.all(s.fotos!.urls.map((u) => (u ? imagenParaPdf(u, 420) : Promise.resolve(null))))
      const anchoPx = (s.columns[col].width ?? 18) * 7 + 5
      const altoPx = 90 * (96 / 72)
      imgs.forEach((img, i) => {
        const fila = ws.getRow(5 + i)
        if (!img) { fila.getCell(col + 1).value = 'Sin foto'; return }
        fila.height = 90
        const k = Math.min((anchoPx * 0.9) / img.w, (altoPx * 0.9) / img.h)
        const fw = (img.w * k) / anchoPx
        const fh = (img.h * k) / altoPx
        const id = wb.addImage({ base64: img.data, extension: 'jpeg' })
        ws.addImage(id, {
          tl: { col: col + (1 - fw) / 2, row: 4 + i + (1 - fh) / 2 },
          br: { col: col + (1 + fw) / 2, row: 4 + i + (1 + fh) / 2 },
          editAs: 'twoCell',
        })
      })
    }

    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: s.columns.length },
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
