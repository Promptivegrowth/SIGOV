/**
 * Exportes de «Programación MR + PCI» (láminas MRPCI_01–03 y los tres
 * modelos: programación semanal, requerimiento de recursos y resumen de
 * insumos por periodo). Mismo contenido en PDF y en Excel: banda título azul
 * marino, línea de metadatos y cabecera de varios niveles con sus celdas
 * combinadas, en el orden de columnas del modelo.
 */

export interface Celda { t: string; cs?: number; rs?: number; fondo?: string }
export interface Tabla {
  titulo: string
  meta: string
  cabecera: Celda[][]
  filas: (string | number | null)[][]
  /** Columnas (base 0) con relleno de captura: Metrado por día, pedido práctico, stock real… */
  resaltadas?: Record<number, string>
  anchos?: number[]
  pie?: string[]
}

const AZUL = '17365D'
const hex = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number]

async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await fetch('/marca/logo-servicon.png').then((r) => (r.ok ? r.blob() : Promise.reject()))
    const data: string = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob) })
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = data })
    return { data, w: img.naturalWidth, h: img.naturalHeight }
  } catch { return null }
}

/** Celdas por columna de la cabecera ya resueltas (para combinar en Excel). */
function rejilla(cab: Celda[][]) {
  const ocupada: boolean[][] = cab.map(() => [])
  const merges: { r: number; c: number; r2: number; c2: number; t: string; fondo?: string }[] = []
  cab.forEach((fila, r) => {
    let c = 0
    for (const celda of fila) {
      while (ocupada[r][c]) c++
      const cs = celda.cs ?? 1, rs = celda.rs ?? 1
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { ocupada[r + i] = ocupada[r + i] ?? []; ocupada[r + i][c + j] = true }
      merges.push({ r, c, r2: r + rs - 1, c2: c + cs - 1, t: celda.t, fondo: celda.fondo })
      c += cs
    }
  })
  const columnas = Math.max(...merges.map((m) => m.c2 + 1))
  return { merges, columnas }
}

export async function tablaPdf(nombre: string, tablas: Tabla[]) {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable').then((m) => m.default)])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const lg = await logo()
  const W = doc.internal.pageSize.getWidth()
  tablas.forEach((t, k) => {
    if (k > 0) doc.addPage()
    if (lg) doc.addImage(lg.data, 'PNG', 24, 16, 90, (90 * lg.h) / lg.w)
    doc.setFillColor(...hex(AZUL)); doc.rect(124, 16, W - 148, 22, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(t.titulo, 124 + (W - 148) / 2, 31, { align: 'center' })
    doc.setTextColor(23, 54, 93); doc.setFontSize(7.5)
    doc.text(t.meta, 124, 50, { maxWidth: W - 148 })
    const { columnas } = rejilla(t.cabecera)
    // Los anchos del modelo se escalan para que la tabla entre completa en la página
    const disponible = W - 48
    const suma = (t.anchos ?? []).reduce((a, b) => a + b, 0)
    const factor = suma > disponible ? disponible / suma : 1
    const anchos = (t.anchos ?? []).map((a) => a * factor)
    autoTable(doc, {
      startY: 60, margin: { left: 24, right: 24 },
      head: t.cabecera.map((f) => f.map((c) => ({ content: c.t, colSpan: c.cs, rowSpan: c.rs,
        styles: c.fondo ? { fillColor: hex(c.fondo), textColor: [23, 54, 93] as [number, number, number] } : undefined }))),
      body: t.filas.map((f) => f.map((v) => (v == null ? '' : String(v)))),
      theme: 'grid',
      styles: { fontSize: columnas > 24 ? 4.8 : 6.5, cellPadding: 1.6, lineColor: [160, 180, 205], lineWidth: 0.3, halign: 'center', valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: hex(AZUL), textColor: [255, 255, 255], fontStyle: 'bold' },
      tableWidth: anchos.length ? anchos.reduce((a, b) => a + b, 0) : 'auto',
      columnStyles: Object.fromEntries(Array.from({ length: columnas }, (_, c) => [c, {
        ...(anchos[c] ? { cellWidth: anchos[c] } : {}),
        ...(t.resaltadas?.[c] ? { fillColor: hex(t.resaltadas[c]) } : {}),
      }])),
    })
    let y = (doc as any).lastAutoTable.finalY + 12
    doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    for (const p of t.pie ?? []) { doc.text(p, 24, y, { maxWidth: W - 48 }); y += 10 }
  })
  doc.save(nombre + '.pdf')
}

export async function tablaXlsx(nombre: string, tablas: (Tabla & { hoja: string })[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SIGOV'
  for (const t of tablas) {
    const ws = wb.addWorksheet(t.hoja.slice(0, 30), { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    const { merges, columnas } = rejilla(t.cabecera)
    const borde = { style: 'thin' as const, color: { argb: 'FF9FB4CD' } }
    const bordes = { top: borde, left: borde, bottom: borde, right: borde }
    ws.mergeCells(1, 1, 1, columnas)
    Object.assign(ws.getCell(1, 1), { value: t.titulo })
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + AZUL } }
    ws.getCell(1, 1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 }
    ws.getCell(1, 1).alignment = { horizontal: 'center' }
    ws.mergeCells(2, 1, 2, columnas)
    ws.getCell(2, 1).value = t.meta
    ws.getCell(2, 1).font = { bold: true, size: 9, color: { argb: 'FF' + AZUL } }
    const base = 3
    for (const m of merges) {
      if (m.r2 > m.r || m.c2 > m.c) ws.mergeCells(base + m.r, m.c + 1, base + m.r2, m.c2 + 1)
      const c = ws.getCell(base + m.r, m.c + 1)
      c.value = m.t
      c.font = { bold: true, size: 9, color: { argb: m.fondo ? 'FF' + AZUL : 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (m.fondo ?? AZUL) } }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = bordes
    }
    const inicio = base + t.cabecera.length
    t.filas.forEach((f, i) => {
      const row = ws.getRow(inicio + i)
      f.forEach((v, j) => {
        const c = row.getCell(j + 1)
        c.value = v as any
        c.border = bordes
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.font = { size: 9 }
        const fondo = t.resaltadas?.[j]
        if (fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fondo } }
      })
    })
    for (let j = 1; j <= columnas; j++) ws.getColumn(j).width = Math.max(6, Math.round((t.anchos?.[j - 1] ?? 40) / 5))
    // Filtros sobre la última fila de cabecera
    ws.autoFilter = { from: { row: inicio - 1, column: 1 }, to: { row: inicio - 1 + Math.max(t.filas.length, 1), column: columnas } }
    let y = inicio + t.filas.length + 1
    for (const p of t.pie ?? []) { ws.getCell(y, 1).value = p; ws.getCell(y, 1).font = { italic: true, size: 9 }; y++ }
  }
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre + '.xlsx'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Número con coma decimal y los decimales que tenga (máx. 3), como en las láminas. */
export const num = (v: number | null | undefined, d = 2) =>
  v == null || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 3) })
