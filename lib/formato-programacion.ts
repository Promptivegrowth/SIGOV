/**
 * El formato «PROGRAMACION SEMANAL» de COVINCA (hoja PS-ST04-SERVICON).
 *
 * Reproduce el Excel que hoy se llena a mano (C07, semana 05–11/10/2026):
 * cabecera con residente, supervisor, inspector y fecha; tabla con N°,
 * CODIGO, ST, PCI, origen, n.º y descripción de partida, unidad,
 * observación; por cada día de lunes a sábado Lado · Metrado · De · A; y el
 * total. Debajo, las partidas subcontratadas y las observaciones.
 *
 * Se arma desde la programación de SIGOV: el supervisor deja de copiar a
 * mano lo que ya registró.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { semanaDe } from './covinca'

const AZUL = 'FF17375E'
const AZUL_CLARO = 'FFDCE6F2'
const ROSADO = 'FFF2DCDB'
const MARRON = 'FF9C5700'
const VERDE = 'FF006100'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
/** Primera columna de cada día (K, O, S, W, AA, AE) */
const COL_DIA = [11, 15, 19, 23, 27, 31]

const LADO: Record<string, string> = { derecho: 'LD', izquierdo: 'LI', ambos: 'LD/LI', eje: 'EJE' }

export type CabeceraProgramacion = {
  residente?: string | null
  supervisor?: string | null
  inspector?: string | null
  semana?: number | null
  emitido?: string | null
}

/** «1334+600», como se escribe en campo. */
function prog(m: number | null | undefined): string {
  if (m == null) return ''
  const v = Math.round(Number(m))
  return `${Math.floor(v / 1000)}+${String(v % 1000).padStart(3, '0')}`
}

export async function programacionSemanalXlsx(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  cliente?: string | null
  fecha: string
  cuadrillaId: string
  logo?: ArrayBuffer | null
}): Promise<{ buffer: ArrayBuffer; nombre: string; filas: number }> {
  const { sb, servicioId, cuadrillaId } = opciones
  const { lunes, domingo } = semanaDe(opciones.fecha)

  const [planR, itemsR, crewR, sectoresR] = await Promise.all([
    sb.from('weekly_plans').select('residente, supervisor, inspector, semana_contrato, emitido_on, week')
      .eq('service_id', servicioId).eq('starts_on', lunes).is('deleted_at', null).maybeSingle(),
    sb.from('v_plan_items').select('*')
      .eq('service_id', servicioId).eq('crew_id', cuadrillaId)
      .gte('scheduled_on', lunes).lte('scheduled_on', domingo)
      .not('status', 'in', '(cancelado)')
      .order('scheduled_on').order('sort_order'),
    sb.from('crews').select('code, name, numero, sede, section_id, leader:profiles!crews_leader_id_fkey(full_name), road_sections(code, name)')
      .eq('id', cuadrillaId).maybeSingle(),
    sb.from('service_sectors').select('section_id, code').eq('service_id', servicioId),
  ])
  if (itemsR.error) throw itemsR.error
  const plan: any = planR.data ?? {}
  const items: any[] = itemsR.data ?? []
  const crew: any = crewR.data ?? {}

  // El subtramo de un tramo: el primer dígito de sus sectores (1.1 → 1)
  const subtramo = new Map<string, string>()
  for (const s of sectoresR.data ?? []) {
    if (s.section_id && !subtramo.has(s.section_id) && /^\d/.test(s.code)) subtramo.set(s.section_id, s.code.split('.')[0])
  }
  const stDe = (sectionId: string | null) => (sectionId && subtramo.get(sectionId)) ? 'ST' + subtramo.get(sectionId) : ''
  const stCuadrilla = subtramo.get(crew.section_id) ?? (items[0] ? subtramo.get(items[0].section_id) : undefined)

  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV'
  const ws = wb.addWorksheet('PS-ST' + String(stCuadrilla ?? '').padStart(2, '0') + '-SERVICON', {
    views: [{ showGridLines: false, zoomScale: 70 }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.39, right: 0, top: 0.59, bottom: 0, header: 0.59, footer: 0 },
    },
  })

  const anchos = [10.4, 16.8, 9.7, 6.2, 10.1, 10.9, 41.3, 17.3, 17.4, 1.3,
    10.1, 10.6, 12.4, 12.9, 12.3, 10.4, 13.0, 11.7, 12.3, 8.9, 13.0, 11.2,
    12.3, 8.9, 11.2, 10.9, 10.6, 8.9, 10.9, 10.9, 10.6, 8.7, 11.2, 11.2,
    1.6, 10.1, 10.9, 11.2, 1.2, 0.1]
  anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const medio = { style: 'medium', color: { argb: 'FF000000' } }
  const fino = { style: 'hair', color: { argb: 'FF000000' } }
  const relleno = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const rotulo = (rango: string, texto: string, opts: any = {}) => {
    ws.mergeCells(rango)
    const c = ws.getCell(rango.split(':')[0])
    c.value = texto
    c.font = { name: opts.font ?? 'Arial', size: opts.size ?? 12, bold: opts.bold ?? true, color: { argb: opts.color ?? 'FF000000' } }
    c.alignment = opts.ajustar
      ? { horizontal: opts.h ?? 'center', vertical: 'middle', shrinkToFit: true }
      : { horizontal: opts.h ?? 'center', vertical: 'middle', wrapText: true }
    if (opts.fill) c.fill = relleno(opts.fill)
    if (opts.border !== false) c.border = { top: medio, left: medio, bottom: medio, right: medio }
    return c
  }

  // ── Cabecera (filas 1–10) ──────────────────────────────────────────
  ws.mergeCells('A1:D6')
  ws.getCell('A1').border = { top: medio, left: medio, bottom: medio, right: medio }
  if (opciones.logo) {
    const id = wb.addImage({ buffer: opciones.logo, extension: 'png' })
    ws.addImage(id, { tl: { col: 0.05, row: 1.1 }, ext: { width: 258, height: 78 } })
  }
  rotulo('E1:AM4', 'PROGRAMACION SEMANAL', { size: 20, color: 'FFFFFFFF', fill: AZUL })
  rotulo('E5:I5', 'RESIDENTE', { font: 'Aptos Narrow' })
  rotulo('J5:T5', 'SUPERVISOR', { font: 'Aptos Narrow' })
  rotulo('U5:AI5', 'INSPECTOR', { font: 'Aptos Narrow' })
  rotulo('AJ5:AM5', 'FECHA', { font: 'Aptos Narrow' })
  rotulo('E6:I6', plan.residente ?? '', { font: 'Aptos Narrow' })
  rotulo('J6:T6', plan.supervisor ?? items[0]?.supervisor_name ?? '', { font: 'Aptos Narrow' })
  rotulo('U6:AI6', plan.inspector ?? '', { font: 'Aptos Narrow' })
  const fechaCell = rotulo('AJ6:AM6', '', { font: 'Aptos Narrow' })
  fechaCell.value = new Date((plan.emitido_on ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00')
  fechaCell.numFmt = 'd/mm/yyyy'
  ws.getRow(6).height = 29.4
  ws.getRow(7).height = 11.4

  const campo = (celdaRotulo: string, texto: string, rangoValor: string, valor: string) => {
    const r = ws.getCell(celdaRotulo.split(':')[0])
    if (celdaRotulo.includes(':')) ws.mergeCells(celdaRotulo)
    r.value = texto
    r.font = { name: 'Arial', size: 12, bold: true }
    r.alignment = { horizontal: 'right', vertical: 'middle' }
    if (rangoValor.includes(':')) ws.mergeCells(rangoValor)
    const v = ws.getCell(rangoValor.split(':')[0])
    v.value = valor
    v.font = { name: 'Aptos Narrow', size: 12, color: { argb: MARRON } }
    v.alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true }
    v.border = { bottom: fino }
  }
  const anio = lunes.slice(0, 4)
  campo('A8:B8', ' PROYECTO :', 'C8:D8', `${(opciones.cliente ?? 'COVINCA').toUpperCase()} - ${anio}`)
  campo('F8', 'CLIENTE :', 'G8', opciones.cliente ? `${opciones.cliente.toUpperCase()} S.A.` : '')
  campo('H8:J8', 'SUB TRAMO - CUADRILLA :', 'K8:N8', (crew.leader?.full_name ?? crew.name ?? '').toUpperCase())
  campo('A9:B9', 'COMPONENTE :', 'C9:D9', '')
  campo('F9', 'SUB TRAMO : ', 'G9', stCuadrilla ? `SUBTRAMO-${String(stCuadrilla).padStart(2, '0')}` : (crew.road_sections?.code ?? ''))

  // ── Cabecera de la tabla (filas 11–15) ─────────────────────────────
  const cab = { color: 'FFFFFFFF', fill: AZUL }
  rotulo('A11:A15', 'N°', cab)
  rotulo('B11:B15', 'CODIGO', cab)
  rotulo('C11:C15', 'ST', cab)
  rotulo('D11:D15', 'PCI', cab)
  rotulo('E11:E15', 'Origen de la Partida', cab)
  rotulo('F11:F15', 'Código de Partida', cab)
  rotulo('G11:G15', 'Descripción de Partida', cab)
  rotulo('H11:H15', 'UND\n(Unidad de trabajo)', cab)
  rotulo('I11:I15', 'Observacion', cab)
  ws.mergeCells('J11:J15'); ws.getCell('J11').fill = relleno(AZUL)
  const semana = rotulo('K11:AH11', '', cab)
  semana.value = plan.semana_contrato ?? plan.week ?? null
  semana.numFmt = '"SEMANA" 00'
  const letra = (n: number) => ws.getColumn(n).letter
  const fechas = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(lunes + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return d
  })
  COL_DIA.forEach((c, i) => {
    rotulo(`${letra(c)}12:${letra(c + 3)}12`, DIAS[i], cab)
    const f = rotulo(`${letra(c)}13:${letra(c + 3)}13`, '', cab)
    f.value = fechas[i]
    f.numFmt = 'dd'
    rotulo(`${letra(c)}14:${letra(c)}15`, 'Lado', cab)
    rotulo(`${letra(c + 1)}14:${letra(c + 1)}15`, 'Metrado', { ...cab, ajustar: true })
    rotulo(`${letra(c + 2)}14:${letra(c + 3)}14`, 'Progresiva', cab)
    rotulo(`${letra(c + 2)}15`, 'De', cab)
    rotulo(`${letra(c + 3)}15`, 'A', cab)
  })
  ws.mergeCells('AI11:AI15'); ws.getCell('AI11').fill = relleno(AZUL)
  rotulo('AJ11:AL11', '', cab)
  rotulo('AJ12:AL13', 'Total', cab)
  rotulo('AJ14:AJ15', 'Metrado', cab)
  rotulo('AK14:AL14', 'Progresiva', cab)
  rotulo('AK15', 'De', cab)
  rotulo('AL15', 'A', cab)
  ws.mergeCells('AM11:AM15'); ws.getCell('AM11').fill = relleno(AZUL)
  for (let r = 11; r <= 14; r++) ws.getRow(r).height = 16.2
  ws.getRow(15).height = 29.4

  // ── Detalle ────────────────────────────────────────────────────────
  const propias = items.filter((i) => !i.subcontratada)
  const subcontratadas = items.filter((i) => i.subcontratada)

  const escribirFila = (fila: number, n: number, it: any | null) => {
    const row = ws.getRow(fila)
    const valores: Record<number, any> = {}
    if (it) {
      const diaIdx = Math.round((new Date(it.scheduled_on + 'T12:00:00').getTime() - new Date(lunes + 'T12:00:00').getTime()) / 86400000)
      Object.assign(valores, {
        1: n,
        2: it.activity_code ?? '',
        3: stDe(it.section_id),
        4: it.pci_item_pci_code ? `${it.pci_item_pci_code.match(/\d+$/)?.[0] ?? it.pci_item_pci_code}-${it.pci_item_number ?? ''}` : '',
        5: it.origen ?? 'MR',
        6: it.activity_numero ?? '',
        7: it.activity_name ?? '',
        8: it.unit_symbol ?? '',
        9: it.notes ?? '',
        36: Number(it.target_qty ?? 0),
        37: prog(it.prog_start_m),
        38: prog(it.prog_end_m ?? it.prog_start_m),
      })
      if (diaIdx >= 0 && diaIdx < 6) {
        const c = COL_DIA[diaIdx]
        valores[c] = it.lado ?? LADO[it.side] ?? ''
        valores[c + 1] = Number(it.target_qty ?? 0)
        valores[c + 2] = prog(it.prog_start_m)
        valores[c + 3] = prog(it.prog_end_m ?? it.prog_start_m)
      }
    } else {
      valores[1] = n
    }
    for (let col = 1; col <= 38; col++) {
      if (col === 10 || col === 35) continue
      const cell = row.getCell(col)
      if (valores[col] !== undefined) cell.value = valores[col]
      cell.font = { name: col === 1 ? 'Calibri' : col === 4 ? 'Aptos Narrow' : 'Arial', size: 12, color: col === 4 ? { argb: VERDE } : undefined }
      cell.alignment = { horizontal: col === 7 ? 'left' : 'center', vertical: 'middle', wrapText: col === 7 }
      const inicioDia = COL_DIA.includes(col)
      const finDia = COL_DIA.some((c) => c + 3 === col)
      cell.border = {
        top: fino, bottom: fino,
        left: inicioDia || col === 1 || col === 36 ? medio : fino,
        right: finDia || col === 9 || col === 38 ? medio : fino,
      }
      if (COL_DIA.some((c) => c + 1 === col)) {
        cell.fill = relleno(col === COL_DIA[3] + 1 ? ROSADO : AZUL_CLARO)
        cell.numFmt = '0.00'
      }
      if (col === 36) cell.numFmt = '#,##0.00'
      // Lo obligatorio que falta, en amarillo (como el formato original)
      if (it && [2, 3, 5, 6, 7, 8].includes(col) && (valores[col] === '' || valores[col] == null)) cell.fill = relleno('FFFFFF99')
    }
    ws.getCell(`J${fila}`).fill = relleno(AZUL)
    ws.getCell(`AI${fila}`).fill = relleno(AZUL)
    ws.getCell(`AM${fila}`).fill = relleno(AZUL)
    const largo = String(valores[7] ?? '').length
    row.height = largo > 70 ? 45 : largo > 35 ? 30 : 15.6
  }

  let fila = 16
  const filasDetalle = Math.max(propias.length, 1)
  for (let i = 0; i < filasDetalle; i++) escribirFila(fila++, i + 1, propias[i] ?? null)

  // ── Partidas subcontratadas ────────────────────────────────────────
  rotulo(`A${fila}:AM${fila}`, 'PARTIDAS  SUBCONTRATADAS', { color: 'FFFFFFFF', fill: AZUL, h: 'left' })
  fila++
  const filasSub = Math.max(subcontratadas.length, 5)
  for (let i = 0; i < filasSub; i++) escribirFila(fila++, i + 1, subcontratadas[i] ?? null)
  ws.mergeCells(`A${fila}:AL${fila}`)
  ws.getCell(`A${fila}`).fill = relleno(AZUL)
  ws.getRow(fila).height = 8.4
  fila++

  // ── Observaciones ──────────────────────────────────────────────────
  rotulo(`A${fila}:B${fila + 4}`, 'OBSERVACIONES', { border: true })
  ws.getCell(`A${fila}`).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  ws.mergeCells(`C${fila}:AN${fila + 4}`)
  ws.getCell(`C${fila}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  ws.pageSetup.printArea = `A1:AN${fila + 4}`

  const n = crew.numero ?? Number(String(crew.code ?? '').match(/\d+/)?.[0] ?? 0)
  const nombre = `${lunes}_al_${domingo}_C${String(n).padStart(2, '0')}_PROGRAMACION-ACTIVIDADES.xlsx`
  return { buffer: await wb.xlsx.writeBuffer(), nombre, filas: items.length }
}
