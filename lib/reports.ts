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
}

export const ORG_DEFAULT = { nombre: 'ETS VALERIA', ruc: '20600222393' }

const BRAND = { r: 27, g: 49, b: 160 }
const ACCENT = { r: 245, g: 163, b: 20 }

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

function header(doc: any, meta: ReportMeta) {
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
  doc.rect(0, 0, W, 30, 'F')
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b)
  doc.rect(0, 30, W, 1.4, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('SIGOV', 14, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text('SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL', 14, 18.5)

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
  if (meta.cliente) {
    y += 4.5
    doc.text(`Cliente: ${meta.cliente}`, 14, y)
  }
  if (meta.subtitulo) {
    y += 4.5
    doc.text(meta.subtitulo, 14, y)
  }
  return y + 6
}

function footer(doc: any, meta: ReportMeta) {
  const pages = doc.internal.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  // La portada no lleva pie ni numeracion
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(215, 218, 226)
    doc.line(14, H - 14, W - 14, H - 14)
    doc.setFontSize(7)
    doc.setTextColor(120, 124, 136)
    doc.text(
      `Generado por ${meta.generadoPor} · ${new Date().toLocaleString('es-PE')} · SIGOV`,
      14,
      H - 9
    )
    doc.text(`Pagina ${i - 1} de ${pages - 1}`, W - 14, H - 9, { align: 'right' })
  }
}

// ─── Reporte genérico de tabla ────────────────────────────────────────────
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
  }
) {
  const { jsPDF, autoTable } = await jspdf()
  const doc = new jsPDF({ orientation: options?.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

  if (options?.cover !== false) cover(doc, meta, options?.kpis)

  let y = header(doc, meta)

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

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => r[c.key] ?? '—')),
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
      columns.map((c, i) => [i, { halign: c.align ?? 'left', ...(c.width ? { cellWidth: c.width } : {}) }])
    ),
    margin: { left: 14, right: 14, bottom: 20 },
  })

  footer(doc, meta)
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
  sheets: { name: string; columns: { header: string; key: string; width?: number }[]; rows: any[] }[]
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
  t0.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B31A0' } }
  portada.getRow(1).height = 26
  portada.getRow(2).height = 20

  portada.mergeCells('A3:B3')
  const t1 = portada.getCell('A3')
  t1.value = 'SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL'
  t1.font = { size: 8.5, color: { argb: 'FFFFFFFF' } }
  t1.alignment = { horizontal: 'center' }
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B31A0' } }

  portada.addRow([])
  const tt = portada.addRow(['', meta.titulo])
  tt.getCell(2).font = { bold: true, size: 16, color: { argb: 'FF141A30' } }
  if (meta.subtitulo) {
    const ss = portada.addRow(['', meta.subtitulo])
    ss.getCell(2).font = { size: 10, color: { argb: 'FF6B7280' } }
  }
  portada.addRow([])

  const ficha: [string, string][] = [
    ['Servicio', meta.servicio],
    ['Cliente', meta.cliente || '-'],
    ['Contrato', meta.contrato || '-'],
    ['Periodo', meta.periodo],
    ['Emitido por', meta.organizacion || ORG_DEFAULT.nombre],
    ['Elaborado por', meta.generadoPor],
    ['Fecha de emision', new Date().toLocaleString('es-PE')],
  ]
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
    t.font = { bold: true, size: 14, color: { argb: 'FF1B31A0' } }
    t.alignment = { vertical: 'middle' }
    ws.getRow(1).height = 22

    ws.mergeCells('A2', `${String.fromCharCode(64 + Math.max(s.columns.length, 3))}2`)
    ws.getCell('A2').value = `${meta.servicio}${meta.cliente ? ` · ${meta.cliente}` : ''} · ${meta.periodo}`
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF6B7280' } }

    ws.addRow([])

    ws.columns = s.columns.map((c) => ({ key: c.key, width: c.width ?? 18 }))
    const headerRow = ws.addRow(s.columns.map((c) => c.header))
    headerRow.eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B31A0' } }
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
