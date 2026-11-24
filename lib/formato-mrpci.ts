/**
 * Exportes de «Programación MR + PCI» (láminas MRPCI_01–03, los tres
 * modelos COVINCA y SIGOV_Muestra_Exportaciones.xlsx): programación
 * semanal, requerimiento de recursos, resumen y planilla de metrado,
 * resumen de insumos por periodo y kardex diario. Mismo contenido en PDF y
 * en Excel: banda título azul marino, línea de metadatos, bloque de datos y
 * cabecera de varios niveles con sus celdas combinadas, en el orden de
 * columnas del modelo.
 *
 * En Excel las celdas calculadas llevan su fórmula (y el valor ya calculado,
 * para visores que no recalculan) y las hojas se vinculan entre sí como en
 * la muestra: Planilla → Resumen de metrado → Requerimiento, y Kardex diario
 * → Resumen de insumos. «Excel conserva filtros y fórmulas» (MRPCI_03).
 */

export interface Celda { t: string; cs?: number; rs?: number; fondo?: string }

/**
 * Celda de datos. `f` es la fórmula de Excel sin «=»; admite las marcas
 * {r} (fila de esta celda), {r:i} (fila de la fila de datos i de la misma
 * hoja) y {r:i@Hoja} (fila de datos i de otra hoja del libro).
 */
export interface Calc { v: string | number | null; f?: string; fmt?: string; negrita?: boolean; fondo?: string; color?: string }
export type Valor = string | number | null | Calc

export interface Tabla {
  titulo: string
  meta: string
  /** Bloque de datos bajo la meta (PROYECTO, RESIDENTE / SUPERVISOR / INSPECTOR…): cada fila, sus tramos. */
  datos?: string[][]
  cabecera: Celda[][]
  filas: Valor[][]
  /** Filas de datos (índice) que son banda de familia o de bloque: una sola celda a todo el ancho. */
  bandas?: number[]
  /** Columnas (base 0) con relleno de captura: Metrado por día, pedido práctico, stock real… */
  resaltadas?: Record<number, string>
  anchos?: number[]
  pie?: string[]
  /** Hoja A4 vertical (Resumen de insumos por periodo). */
  vertical?: boolean
  /** Columnas que quedan fijas al desplazarse en Excel. */
  fijas?: number
}

const AZUL = '17365D'
const hex = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [number, number, number]

/** Letra de columna de Excel (base 0): 0 → A, 26 → AA. */
export function L(j: number): string {
  let s = ''
  for (let n = j + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const esCalc = (v: Valor): v is Calc => v != null && typeof v === 'object'
const decimales = (fmt?: string) => (fmt?.includes('.') ? fmt.split('.')[1].replace(/[^0#]/g, '').length : 0)
/** Texto de una celda para el PDF (y para el valor de respaldo en Excel). */
function texto(v: Valor): string {
  if (v == null) return ''
  if (!esCalc(v)) return String(v)
  if (v.v == null || v.v === '') return ''
  if (typeof v.v !== 'number') return String(v.v)
  if (v.fmt?.includes('%')) return `${Math.round(v.v * 100)}%`
  if (v.v === 0 && v.fmt?.endsWith(';""')) return ''
  return num(v.v, v.fmt ? Math.min(decimales(v.fmt), 2) : 2)
}

async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await fetch('/marca/logo-servicon.png').then((r) => (r.ok ? r.blob() : Promise.reject()))
    const data: string = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob) })
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = data })
    // A 90 pt de ancho basta con ~400 px: el original pesaba megas en cada PDF
    const w = Math.min(400, img.naturalWidth), h = Math.round((img.naturalHeight * w) / img.naturalWidth)
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    cv.getContext('2d')?.drawImage(img, 0, 0, w, h)
    return { data: cv.toDataURL('image/png'), w, h }
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

/** Las fuentes estándar del PDF no traen «−», «≥»…: se cambian por sus equivalentes ASCII. */
const pdfTxt = (s: string) => s.replace(/[−–]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=')

export async function tablaPdf(nombre: string, tablas: Tabla[]) {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable').then((m) => m.default)])
  const doc = new jsPDF({ orientation: tablas[0]?.vertical ? 'portrait' : 'landscape', unit: 'pt', format: 'a4' })
  const lg = await logo()
  tablas.forEach((t, k) => {
    if (k > 0) doc.addPage('a4', t.vertical ? 'portrait' : 'landscape')
    const W = doc.internal.pageSize.getWidth()
    if (lg) doc.addImage(lg.data, 'PNG', 24, 16, 90, (90 * lg.h) / lg.w)
    doc.setFillColor(...hex(AZUL)); doc.rect(124, 16, W - 148, 22, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(pdfTxt(t.titulo), 124 + (W - 148) / 2, 31, { align: 'center' })
    doc.setTextColor(23, 54, 93); doc.setFontSize(7.5)
    const metaL = doc.splitTextToSize(pdfTxt(t.meta), W - 148)
    doc.text(metaL, 124, 48)
    let y0 = Math.max(60, 48 + metaL.length * 9)
    for (const fila of t.datos ?? []) {
      const ancho = (W - 48) / Math.max(fila.length, 1)
      const lineas = fila.map((s) => doc.splitTextToSize(pdfTxt(s), ancho - 6) as string[])
      const alto = 3 + 9 * Math.max(...lineas.map((l) => l.length), 1)
      doc.setFillColor(247, 251, 253); doc.rect(24, y0 - 1, W - 48, alto, 'F')
      lineas.forEach((l, i) => doc.text(l, 26 + i * ancho, y0 + 7))
      y0 += alto + 1
    }
    const { columnas } = rejilla(t.cabecera)
    // Los anchos del modelo se escalan para que la tabla entre completa en la página
    const disponible = W - 48
    const suma = (t.anchos ?? []).reduce((a, b) => a + b, 0)
    const factor = suma > disponible ? disponible / suma : 1
    const anchos = (t.anchos ?? []).map((a) => a * factor)
    const bandas = new Set(t.bandas ?? [])
    autoTable(doc, {
      startY: y0 + 2, margin: { left: 24, right: 24 },
      head: t.cabecera.map((f) => f.map((c) => ({ content: pdfTxt(c.t), colSpan: c.cs, rowSpan: c.rs,
        styles: c.fondo ? { fillColor: hex(c.fondo), textColor: [23, 54, 93] as [number, number, number] } : undefined }))),
      body: t.filas.map((f, i) => bandas.has(i)
        ? [{ content: pdfTxt(texto(f[0]) || texto(f[1])), colSpan: columnas, styles: { fillColor: hex(AZUL), textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, halign: 'left' as const } }]
        : f.map((v) => esCalc(v) && (v.fondo || v.negrita || v.color)
          ? { content: pdfTxt(texto(v)), styles: { ...(v.fondo ? { fillColor: hex(v.fondo) } : {}), ...(v.negrita ? { fontStyle: 'bold' as const } : {}), ...(v.color ? { textColor: hex(v.color) } : {}) } }
          : pdfTxt(texto(v)))),
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
    for (const p of t.pie ?? []) { const l = doc.splitTextToSize(pdfTxt(p), W - 48); doc.text(l, 24, y); y += 9 * l.length + 2 }
  })
  doc.save(nombre + '.pdf')
}

/** Fila de Excel donde empiezan los datos de una tabla (título, meta, datos y cabecera antes). */
const inicioDatos = (t: Tabla) => 3 + (t.datos?.length ?? 0) + t.cabecera.length

export async function tablaXlsx(nombre: string, tablas: (Tabla & { hoja: string })[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SIGOV'
  wb.calcProperties = { fullCalcOnLoad: true }
  const inicioDe = new Map(tablas.map((t) => [t.hoja.slice(0, 30), inicioDatos(t)]))
  for (const t of tablas) {
    const hoja = t.hoja.slice(0, 30)
    const inicio = inicioDatos(t)
    const ws = wb.addWorksheet(hoja, {
      pageSetup: { orientation: t.vertical ? 'portrait' : 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${inicio - 1}` },
      views: [{ state: 'frozen', xSplit: t.fijas ?? 0, ySplit: inicio - 1 }],
    })
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
    // Bloque de datos: cada tramo ocupa una parte igual del ancho
    ;(t.datos ?? []).forEach((fila, i) => {
      const r = 3 + i
      const paso = Math.floor(columnas / Math.max(fila.length, 1))
      fila.forEach((s, k) => {
        const c1 = 1 + k * paso, c2 = k === fila.length - 1 ? columnas : c1 + paso - 1
        if (c2 > c1) ws.mergeCells(r, c1, r, c2)
        const c = ws.getCell(r, c1)
        c.value = s
        c.font = { bold: true, size: 9, color: { argb: 'FF152D45' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FBFD' } }
        c.alignment = { vertical: 'middle', wrapText: true }
      })
    })
    const base = 3 + (t.datos?.length ?? 0)
    for (const m of merges) {
      if (m.r2 > m.r || m.c2 > m.c) ws.mergeCells(base + m.r, m.c + 1, base + m.r2, m.c2 + 1)
      const c = ws.getCell(base + m.r, m.c + 1)
      c.value = m.t
      c.font = { bold: true, size: 9, color: { argb: m.fondo ? 'FF' + AZUL : 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (m.fondo ?? AZUL) } }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = bordes
    }
    const resolver = (f: string, fila: number) => f.replace(/\{r(?::(\d+))?(?:@([^}]+))?\}/g, (_, i, otra) => {
      if (i == null) return String(fila)
      const ini = otra ? inicioDe.get(String(otra).slice(0, 30)) : inicio
      if (ini == null) throw new Error(`Hoja no encontrada para la fórmula: ${otra}`)
      return String(ini + Number(i))
    })
    const bandas = new Set(t.bandas ?? [])
    t.filas.forEach((f, i) => {
      const r = inicio + i
      const row = ws.getRow(r)
      if (bandas.has(i)) {
        ws.mergeCells(r, 1, r, columnas)
        const c = row.getCell(1)
        c.value = texto(f[0]) || texto(f[1])
        c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF21537C' } }
        c.border = bordes
        return
      }
      f.forEach((v, j) => {
        const c = row.getCell(j + 1)
        if (esCalc(v)) {
          c.value = v.f ? { formula: resolver(v.f, r), result: (v.v ?? undefined) as any } : (v.v as any)
          if (typeof v.v === 'number' || v.f) c.numFmt = v.fmt ?? '#,##0.00'
        } else {
          c.value = v as any
          if (typeof v === 'number') c.numFmt = '#,##0.00'
        }
        c.border = bordes
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.font = { size: 9, bold: esCalc(v) && v.negrita ? true : undefined, color: esCalc(v) && v.color ? { argb: 'FF' + v.color } : undefined }
        const fondo = (esCalc(v) && v.fondo) || t.resaltadas?.[j]
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

/** Texto de una celda (con o sin fórmula) para mostrarla en pantalla. */
export const textoCelda = (v: Valor) => texto(v)
