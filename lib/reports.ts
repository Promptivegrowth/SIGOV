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
}

const BRAND = { r: 27, g: 49, b: 160 }
const ACCENT = { r: 245, g: 163, b: 20 }

async function jspdf() {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then((m) => m.default),
  ])
  return { jsPDF, autoTable }
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
  for (let i = 1; i <= pages; i++) {
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
    doc.text(`Página ${i} de ${pages}`, W - 14, H - 9, { align: 'right' })
  }
}

// ─── Reporte genérico de tabla ────────────────────────────────────────────
export async function reportePdf(
  meta: ReportMeta,
  columns: { header: string; key: string; align?: 'left' | 'right' | 'center'; width?: number }[],
  rows: any[],
  options?: { kpis?: { label: string; value: string }[]; landscape?: boolean }
) {
  const { jsPDF, autoTable } = await jspdf()
  const doc = new jsPDF({ orientation: options?.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

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
