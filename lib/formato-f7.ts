/**
 * El Formato 7 «REQUERIMIENTO DE RECURSOS» (hoja A.-REQ. RECURSOS del Excel
 * de COVINCA), uno por semana y cuadrilla.
 *
 * Encabezado (Elvis, P36): el contrato, Proyecto = subtramo, Empresa =
 * GRUPO SERVICON V&D E.I.R.L, logo de SERVICON y la fecha.
 *
 * Por cada partida programada y cada material de su rendimiento (P12):
 *   Pre-cantidad      = metrado × rendimiento
 *   Cantidad a requerir = Pre-cantidad − stock en cuadrilla (nunca negativa)
 *   Por practicidad   = la cantidad a requerir redondeada hacia arriba
 *   Remanente         = por practicidad − a requerir
 * % Afectado y % Desperdicio quedan en blanco (P35). Una partida sin
 * rendimiento sale con el recurso vacío, para llenarlo a mano.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { semanaDe, codigoCuadrilla } from './covinca'

const AZUL = 'FF17375E'
const AZUL_CLARO = 'FFDCE6F2'

const CONTRATO = 'CONTRATO DE CONCESIÓN DEL TRAMO VÍAL DV. QUILCA - DV. AREQUIPA (Repartición) - DV. MATARANI - DV. MOQUEGUA - DV. TACNA - LA CONCORDIA'

function redondeo(n: number, d = 3) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export async function f7Xlsx(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  fecha: string
  cuadrillaId: string
  logo?: ArrayBuffer | null
}): Promise<{ buffer: ArrayBuffer; nombre: string; filas: number; sinRendimiento: number }> {
  const { sb, servicioId, cuadrillaId } = opciones
  const { lunes, domingo } = semanaDe(opciones.fecha)

  const [itemsR, crewR, stockR] = await Promise.all([
    sb.from('v_plan_items').select('activity_id, activity_code, activity_name, unit_symbol, target_qty, origen, scheduled_on')
      .eq('service_id', servicioId).eq('crew_id', cuadrillaId)
      .gte('scheduled_on', lunes).lte('scheduled_on', domingo).order('scheduled_on'),
    sb.from('crews').select('code, name, numero, sede, subtramo').eq('id', cuadrillaId).single(),
    sb.from('v_stock_cuadrilla').select('supply_id, stock').eq('service_id', servicioId).eq('crew_id', cuadrillaId),
  ])
  if (itemsR.error) throw itemsR.error
  if (crewR.error) throw crewR.error

  // La partida de la semana: el metrado de todos sus días junto
  const partidas = new Map<string, { codigo: string; nombre: string; unidad: string; metrado: number; origen: string }>()
  for (const it of itemsR.data ?? []) {
    const k = it.activity_id
    const p = partidas.get(k) ?? { codigo: it.activity_code ?? '', nombre: it.activity_name ?? '', unidad: it.unit_symbol ?? '', metrado: 0, origen: it.origen ?? 'MR' }
    p.metrado += Number(it.target_qty) || 0
    partidas.set(k, p)
  }

  const ids = [...partidas.keys()]
  // La unidad de la partida sale del catálogo si la programación no la trae
  if (ids.length) {
    const { data: acts } = await sb.from('activities_catalog').select('id, units(symbol)').in('id', ids)
    for (const a of acts ?? []) {
      const p = partidas.get((a as any).id)
      if (p && !p.unidad) p.unidad = (a as any).units?.symbol ?? ''
    }
  }
  const { data: rends, error: errR } = ids.length
    ? await sb.from('rendimientos').select('activity_id, supply_id, cantidad, supplies(name, codigo_covinca, code, units(symbol))').in('activity_id', ids)
    : { data: [] as any[], error: null }
  if (errR) throw errR
  const stock = new Map<string, number>((stockR.data ?? []).map((s: any) => [s.supply_id, Number(s.stock) || 0]))
  // El stock se consume en orden: dos partidas con el mismo material no lo cuentan dos veces
  const queda = new Map(stock)

  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV · Grupo Servicon V&D EIRL'
  const ws = wb.addWorksheet('A.-REQ. RECURSOS', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  const anchos = [5, 34, 8, 10, 9, 9, 40, 9, 9, 12, 11, 12, 12, 11, 14, 12, 18, 12, 20]
  anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const delgado = { style: 'thin', color: { argb: 'FF9E9E9E' } }
  const borde = { top: delgado, left: delgado, bottom: delgado, right: delgado }

  if (opciones.logo) {
    const id = wb.addImage({ buffer: opciones.logo, extension: 'png' })
    ws.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: 200, height: 60 } })
  }
  ws.mergeCells('C1:S1')
  ws.getCell('C1').value = 'REQUERIMIENTO DE RECURSOS'
  ws.getCell('C1').font = { bold: true, size: 14, color: { argb: AZUL } }
  ws.getCell('C1').alignment = { horizontal: 'center' }
  const crew = crewR.data as any
  const filasCab: [string, string][] = [
    ['Contrato :', CONTRATO],
    ['Proyecto :', crew?.subtramo ? `SUBTRAMO ${crew.subtramo}` : ''],
    ['Empresa :', 'GRUPO SERVICON V&D E.I.R.L'],
    ['Cuadrilla :', `${crew?.code ?? ''} · ${crew?.name ?? ''}`],
  ]
  filasCab.forEach(([rot, val], i) => {
    const f = 3 + i
    ws.getCell(`C${f}`).value = rot
    ws.getCell(`C${f}`).font = { bold: true, size: 9 }
    ws.mergeCells(`D${f}:P${f}`)
    ws.getCell(`D${f}`).value = val
    ws.getCell(`D${f}`).font = { size: 9 }
  })
  ws.getCell('Q3').value = 'Fecha :'
  ws.getCell('Q3').font = { bold: true, size: 9 }
  ws.getCell('R3').value = new Date(lunes + 'T00:00:00Z')
  ws.getCell('R3').numFmt = 'dd/mm/yyyy'
  ws.getCell('Q4').value = 'Semana :'
  ws.getCell('Q4').font = { bold: true, size: 9 }
  ws.getCell('R4').value = `${lunes.split('-').reverse().join('/')} al ${domingo.split('-').reverse().join('/')}`

  // Encabezado de la tabla (dos filas, como el F7)
  const h1 = 8
  const h2 = 9
  const cab1 = ['N°', 'Partida', 'Unid. part.', 'Metrado', 'Unid. rend.', 'Rendi.', 'Recursos (mano de obra, materiales y/o equipos)', 'Unid. recurso', 'MR / PCI / E', 'Materiales', '', '', '', '', '', '', '', '', 'Nota']
  const cab2 = ['', '', '', '', '', '', '', '', '', 'Pre-cantidad a requerir', 'Stock en cuadrilla', 'Cantidad a requerir', 'Cantidad a pedir por practicidad', 'Remanente', 'Almacén de retiro', 'Fecha de retiro', 'Encargado de retiro', 'Nota de salida', '']
  cab1.forEach((t, i) => { ws.getRow(h1).getCell(i + 1).value = t })
  cab2.forEach((t, i) => { if (t) ws.getRow(h2).getCell(i + 1).value = t })
  for (let c = 1; c <= 9; c++) ws.mergeCells(h1, c, h2, c)
  ws.mergeCells(h1, 10, h1, 18)
  ws.mergeCells(h1, 19, h2, 19)
  for (const f of [h1, h2]) {
    const row = ws.getRow(f)
    row.height = f === h1 ? 18 : 34
    for (let c = 1; c <= 19; c++) {
      const cell = row.getCell(c)
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = borde
    }
  }

  let fila = h2 + 1
  let n = 0
  let sinRendimiento = 0
  const poner = (valores: any[], tenue = false) => {
    const row = ws.getRow(fila++)
    valores.forEach((v, i) => {
      const cell = row.getCell(i + 1)
      cell.value = v
      cell.font = { size: 8.5, italic: tenue }
      cell.border = borde
      cell.alignment = { vertical: 'middle', wrapText: i === 1 || i === 6, horizontal: typeof v === 'number' ? 'right' : 'left' }
      if (typeof v === 'number' && i >= 3) cell.numFmt = '#,##0.###'
    })
  }

  for (const [actividadId, p] of partidas) {
    const deLaPartida = (rends ?? []).filter((r: any) => r.activity_id === actividadId)
    if (!deLaPartida.length) {
      sinRendimiento++
      poner([++n, `${p.codigo} · ${p.nombre}`, p.unidad, redondeo(p.metrado), '', '', 'Sin rendimiento: llenar a mano', '', p.origen, '', '', '', '', '', '', '', '', '', ''], true)
      continue
    }
    for (const r of deLaPartida) {
      const rend = Number(r.cantidad)
      const pre = redondeo(p.metrado * rend)
      const enCuadrilla = queda.get(r.supply_id) ?? 0
      const usado = Math.min(enCuadrilla, pre)
      queda.set(r.supply_id, enCuadrilla - usado)
      const aRequerir = redondeo(Math.max(0, pre - enCuadrilla))
      const practico = Math.ceil(aRequerir)
      const unidadRec = r.supplies?.units?.symbol ?? ''
      poner([
        ++n, `${p.codigo} · ${p.nombre}`, p.unidad, redondeo(p.metrado), `${unidadRec}/${p.unidad}`, rend,
        r.supplies?.name ?? '', unidadRec, p.origen,
        pre, redondeo(enCuadrilla), aRequerir, practico, redondeo(practico - aRequerir), '', '', '', '', '',
      ])
    }
  }
  if (!partidas.size) poner(['', 'Sin partidas programadas en la semana', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], true)

  ws.views = [{ state: 'frozen', ySplit: h2 }]
  const buffer = await wb.xlsx.writeBuffer()
  const cc = codigoCuadrilla(crew?.numero ?? 0)
  return {
    buffer,
    nombre: `${lunes}_al_${domingo}_${cc}_PROGRAMACION-RECURSOS.xlsx`,
    filas: n,
    sinRendimiento,
  }
}
