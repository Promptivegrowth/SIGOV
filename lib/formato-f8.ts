/**
 * Formato 8 «Seguimiento diario de materiales por cuadrilla».
 *
 * Un libro por mes —`AAAA-MM_SEGUIMIENTO-DIARIO-DE-MATERIALES_7-CUADRILLAS.xlsx`
 * en la estructura documental— con una hoja por cuadrilla y un Resumen.
 * Como el formato de Elvis: por cada día, el par Entrada / Salida; a la
 * izquierda los totales y el stock. Cambios respecto al original, ya
 * conversados en el análisis: el saldo anterior va en su propia columna (no
 * como «entrada» del día 1), las cantidades se ven con decimales (0,125 gal
 * no aparece como 0) y el Resumen trae el TOTAL de todas las cuadrillas.
 *
 * Fuente: v_kardex_cuadrilla (entregas del almacén, devoluciones, saldo
 * inicial, consumo en campo, traslados, mermas y ajustes).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const AMBAR = 'FFFFC000'
const AMBAR_OSCURO = 'FFFFBF00'
const STOCK = 'FFFFFFCC'
const DIA = 'FFEEECE1'
const VERDE = 'FFC6EFCE'
const VERDE_TXT = 'FF006100'
const ROSA = 'FFFFC7CE'
const ROSA_TXT = 'FF9C0006'

const fuente = (size: number, bold = false, color?: string) => ({ name: 'Times New Roman', size, bold, color: color ? { argb: color } : undefined })
const relleno = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } }) as any
const fino = { style: 'thin', color: { argb: 'FF7F7F7F' } }
const borde = { top: fino, left: fino, bottom: fino, right: fino }

type Mov = {
  crew_id: string; crew_code: string; crew_name: string; crew_numero: number | null; crew_sede: string | null
  supply_id: string; supply_code: string; supply_name: string; supply_category: string | null; unit_symbol: string | null
  occurred_on: string; entrada: number; salida: number
}

export async function f8Xlsx(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  mes: string // AAAA-MM
  cuadrillaId?: string | null
  logo?: ArrayBuffer | null
}): Promise<{ buffer: ArrayBuffer; nombre: string; cuadrillas: number; movimientos: number }> {
  const { sb, servicioId, mes } = opciones
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const desde = `${mes}-01`
  const hasta = `${mes}-${String(ultimo).padStart(2, '0')}`

  // Todo hasta fin de mes: lo anterior al mes es el saldo anterior
  const movs: Mov[] = []
  for (let i = 0; ; i += 1000) {
    let c = sb.from('v_kardex_cuadrilla')
      .select('crew_id, crew_code, crew_name, crew_numero, crew_sede, supply_id, supply_code, supply_name, supply_category, unit_symbol, occurred_on, entrada, salida')
      .eq('service_id', servicioId).lte('occurred_on', hasta)
      .order('occurred_on').range(i, i + 999)
    if (opciones.cuadrillaId) c = c.eq('crew_id', opciones.cuadrillaId)
    const { data, error } = await c
    if (error) throw error
    movs.push(...((data ?? []) as any[]).map((x) => ({ ...x, entrada: Number(x.entrada), salida: Number(x.salida) })))
    if (!data || data.length < 1000) break
  }

  let cq = sb.from('crews').select('id, code, name, numero, sede, leader:profiles!crews_leader_id_fkey(full_name), section_id')
    .eq('service_id', servicioId).is('deleted_at', null).eq('is_active', true).order('numero')
  if (opciones.cuadrillaId) cq = cq.eq('id', opciones.cuadrillaId)
  const { data: crews } = await cq
  const { data: sectores } = await sb.from('service_sectors').select('section_id, code').eq('service_id', servicioId)
  const subtramo = new Map<string, string>()
  for (const s of sectores ?? []) if (s.section_id && /^\d/.test(s.code) && !subtramo.has(s.section_id)) subtramo.set(s.section_id, s.code.split('.')[0])

  // Solo las cuadrillas con número COVINCA (C01–C07); las demás, si movieron material
  const cuadrillas = (crews ?? []).filter((c: any) => c.numero != null || movs.some((x) => x.crew_id === c.id))

  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV'
  const logoId = opciones.logo ? wb.addImage({ buffer: opciones.logo, extension: 'png' }) : null

  const dias = Array.from({ length: ultimo }, (_, i) => new Date(Date.UTC(a, m - 1, i + 1, 12)))
  const PRIMERA = 11 // K: primera columna de día
  const colEntr = (d: number) => PRIMERA + d * 2
  const letra = (n: number, ws: any) => ws.getColumn(n).letter

  // Por cuadrilla: material → { saldo, entradas[día], salidas[día] }
  type Fila = { id: string; codigo: string; nombre: string; categoria: string; unidad: string; saldo: number; e: number[]; s: number[] }
  const porCuadrilla = new Map<string, Map<string, Fila>>()
  for (const x of movs) {
    const mapa = porCuadrilla.get(x.crew_id) ?? new Map<string, Fila>()
    porCuadrilla.set(x.crew_id, mapa)
    const f = mapa.get(x.supply_id) ?? {
      id: x.supply_id, codigo: x.supply_code, nombre: x.supply_name, categoria: (x.supply_category ?? 'OTROS').toUpperCase(),
      unidad: x.unit_symbol ?? '', saldo: 0, e: new Array(ultimo).fill(0), s: new Array(ultimo).fill(0),
    }
    mapa.set(x.supply_id, f)
    if (x.occurred_on < desde) f.saldo += x.entrada - x.salida
    else {
      const d = Number(x.occurred_on.slice(8, 10)) - 1
      f.e[d] += x.entrada
      f.s[d] += x.salida
    }
  }
  const ordenar = (filas: Fila[]) => filas.sort((p, q) => p.categoria.localeCompare(q.categoria) || p.nombre.localeCompare(q.nombre))

  const resumen: { crew: any; filas: Map<string, { e: number; s: number; st: number }> }[] = []

  for (const crew of cuadrillas as any[]) {
    // Como el F8 de Elvis: «ST1-Santos»; sin subtramo asignado, «C01-Marco»
    const st = subtramo.get(crew.section_id)
    const cc = crew.numero ? `C${String(crew.numero).padStart(2, '0')}` : crew.code
    const nombreHoja = ((st ? `ST${st}-` : `${cc}-`) + (crew.leader?.full_name?.split(' ')[0] ?? crew.sede ?? crew.code)).slice(0, 31)
    const ws = wb.addWorksheet(nombreHoja, {
      views: [{ state: 'frozen', xSplit: 9, ySplit: 8, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 },
    })
    const anchos: Record<number, number> = { 1: 1.8, 2: 7.3, 3: 41.4, 4: 9.5, 5: 1.8, 6: 11.5, 7: 11.5, 8: 11.5, 9: 11.5, 10: 1.8 }
    Object.entries(anchos).forEach(([c, w]) => { ws.getColumn(Number(c)).width = w })
    for (let d = 0; d < ultimo; d++) { ws.getColumn(colEntr(d)).width = 5.2; ws.getColumn(colEntr(d) + 1).width = 5.2 }
    ws.getRow(1).height = 52.95

    if (logoId != null) ws.addImage(logoId, { tl: { col: 1, row: 0.1 }, ext: { width: 190, height: 58 } })
    ws.getCell('C2').value = (st ? `Subtramo ${st}  - ` : '') + `Cuadrilla ${crew.numero ?? crew.code}${crew.sede ? ' · ' + crew.sede : ''}`
    ws.getCell('C2').font = fuente(11, true)
    ws.getCell('D2').value = crew.numero ? `C${String(crew.numero).padStart(2, '0')}` : crew.code
    ws.getCell('D2').font = fuente(11, true)
    ws.getCell('F2').value = 'Fecha:'
    ws.getCell('F2').font = fuente(10, true)
    ws.mergeCells('G2:H2')
    ws.getCell('G2').value = new Date(`${desde}T12:00:00`)
    ws.getCell('G2').numFmt = 'dd/mm/yyyy'
    ws.getCell('G2').alignment = { horizontal: 'left' }
    ws.getCell('C3').value = `${crew.name}${crew.leader?.full_name ? ' · Jefe: ' + crew.leader.full_name : ''}`
    ws.getCell('C3').font = fuente(9.5)
    ws.getCell('G5').fill = relleno('FFEBF1DE'); ws.getCell('H5').value = 'Entrada'
    ws.getCell('G6').fill = relleno('FFF2DCDB'); ws.getCell('H6').value = 'Salida'

    const cab = ['ITEM', 'DESCRIPCIÓN DE MATERIAL', 'UNIDAD']
    cab.forEach((t, i) => { const c = ws.getCell(8, 2 + i); c.value = t })
    ;['SALDO ANT.', 'ENTRADA', 'SALIDA', 'STOCK'].forEach((t, i) => { ws.getCell(8, 6 + i).value = t })
    for (const col of [2, 3, 4, 6, 7, 8, 9]) {
      const c = ws.getCell(8, col)
      c.font = fuente(10, true)
      c.fill = relleno(AMBAR_OSCURO)
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = borde
    }
    ws.getRow(8).height = 25.95

    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
    const DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    dias.forEach((f, d) => {
      const c = colEntr(d)
      ws.mergeCells(4, c, 4, c + 1); ws.getCell(4, c).value = MESES[f.getUTCMonth()]
      ws.mergeCells(5, c, 5, c + 1)
      const primeroDelAnio = new Date(Date.UTC(f.getUTCFullYear(), 0, 1))
      ws.getCell(5, c).value = Math.ceil(((f.getTime() - primeroDelAnio.getTime()) / 86400000 + primeroDelAnio.getUTCDay() + 1) / 7)
      ws.mergeCells(6, c, 6, c + 1); ws.getCell(6, c).value = DS[f.getUTCDay()]
      ws.mergeCells(7, c, 7, c + 1); ws.getCell(7, c).value = f; ws.getCell(7, c).numFmt = 'dd/mm'
      ws.getCell(8, c).value = 'Entr'
      ws.getCell(8, c + 1).value = 'Sali'
      for (let r = 4; r <= 8; r++) for (const k of [c, c + 1]) {
        const cel = ws.getCell(r, k)
        cel.font = fuente(8, r === 8)
        cel.alignment = { horizontal: 'center', vertical: 'middle' }
        cel.border = borde
        if (r === 8) cel.fill = relleno(k === c ? VERDE : ROSA)
        if (f.getUTCDay() === 0) cel.fill = { type: 'pattern', pattern: 'lightGray' } as any
      }
    })

    const mapa = porCuadrilla.get(crew.id) ?? new Map<string, Fila>()
    const filas = ordenar([...mapa.values()])
    const ultimaCol = colEntr(ultimo - 1) + 1
    const L = (n: number) => letra(n, ws)
    let r = 9
    let n = 0
    let categoria = ''
    const res = new Map<string, { e: number; s: number; st: number }>()
    for (const f of filas) {
      if (f.categoria !== categoria) {
        categoria = f.categoria
        ws.getCell(r, 3).value = categoria
        for (let col = 2; col <= 9; col++) { ws.getCell(r, col).fill = relleno(AMBAR); ws.getCell(r, col).font = fuente(9.5, true); ws.getCell(r, col).border = borde }
        r++
      }
      n++
      const row = ws.getRow(r)
      row.getCell(2).value = n
      row.getCell(3).value = f.nombre
      row.getCell(4).value = f.unidad
      row.getCell(6).value = Number(f.saldo.toFixed(3))
      let te = 0, ts = 0
      f.e.forEach((v, d) => {
        if (v) row.getCell(colEntr(d)).value = Number(v.toFixed(3))
        if (f.s[d]) row.getCell(colEntr(d) + 1).value = Number(f.s[d].toFixed(3))
        te += v; ts += f.s[d]
      })
      const rango = `${L(PRIMERA)}${r}:${L(ultimaCol)}${r}`
      const etiquetas = `$${L(PRIMERA)}$8:$${L(ultimaCol)}$8`
      row.getCell(7).value = { formula: `SUMIF(${etiquetas},"Entr",${rango})`, result: Number(te.toFixed(3)) }
      row.getCell(8).value = { formula: `SUMIF(${etiquetas},"Sali",${rango})`, result: Number(ts.toFixed(3)) }
      const st = f.saldo + te - ts
      row.getCell(9).value = { formula: `F${r}+G${r}-H${r}`, result: Number(st.toFixed(3)) }
      res.set(f.id, { e: f.saldo + te, s: ts, st })
      for (let col = 2; col <= ultimaCol; col++) {
        if (col === 5 || col === 10) continue
        const c = row.getCell(col)
        c.font = fuente(col >= PRIMERA ? 8 : 9.5, col === 9)
        c.border = borde
        c.alignment = { horizontal: col === 3 ? 'left' : 'center', vertical: 'middle', wrapText: col === 3 }
        if (col >= 6) c.numFmt = 'General;[Red]-General;""'
        if (col >= PRIMERA) c.fill = relleno(DIA)
      }
      row.getCell(9).fill = relleno(STOCK)
      r++
    }
    if (!filas.length) {
      ws.getCell(r, 3).value = 'Sin movimientos de material en el mes'
      ws.getCell(r, 3).font = fuente(9.5, false, 'FF7F7F7F')
      r++
    }
    const fin = Math.max(r - 1, 9)
    // Entradas en verde, salidas en rosa, stock negativo en rojo
    ws.addConditionalFormatting({
      ref: `${L(PRIMERA)}9:${L(ultimaCol)}${fin}`,
      rules: [
        { type: 'expression', formulae: [`AND(${L(PRIMERA)}$8="Entr",${L(PRIMERA)}9>0)`], style: { fill: relleno(VERDE), font: { color: { argb: VERDE_TXT } } } },
        { type: 'expression', formulae: [`AND(${L(PRIMERA)}$8="Sali",${L(PRIMERA)}9>0)`], style: { fill: relleno(ROSA), font: { color: { argb: ROSA_TXT } } } },
      ],
    })
    ws.addConditionalFormatting({
      ref: `I9:I${fin}`,
      rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { fill: relleno(ROSA), font: { color: { argb: ROSA_TXT } } } }],
    })
    r += 1
    ws.getCell(r, 3).value = 'LEYENDA'; ws.getCell(r, 3).fill = relleno(AMBAR); ws.getCell(r, 3).font = fuente(9.5, true)
    ws.getCell(r + 1, 3).value = 'Salidas'; ws.getCell(r + 1, 3).fill = relleno('FFF2DCDB')
    ws.getCell(r + 2, 3).value = 'Entradas'; ws.getCell(r + 2, 3).fill = relleno('FFEBF1DE')
    ws.pageSetup.printArea = `A1:${L(ultimaCol)}${r + 2}`
    resumen.push({ crew, filas: res })
  }

  // ─── Resumen: las cuadrillas lado a lado, y el TOTAL ─────────────────
  const rs = wb.addWorksheet('Resumen', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 6, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  })
  rs.getColumn(1).width = 1.8; rs.getColumn(2).width = 7.3; rs.getColumn(3).width = 41.4; rs.getColumn(4).width = 7.8
  const bloques = [...resumen.map((x) => ({ titulo: `C${String(x.crew.numero ?? '').padStart(2, '0')} ${x.crew.sede ?? ''} · ${x.crew.leader?.full_name ?? x.crew.name}`, x })), { titulo: 'TOTAL', x: null as any }]
  rs.mergeCells(2, 2, 2, 4 + bloques.length * 5)
  rs.getCell(2, 2).value = `RESUMEN DE INSUMOS · ${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}`
  rs.getCell(2, 2).font = fuente(11, true)
  rs.getCell(2, 2).fill = relleno(AMBAR)
  rs.getCell(2, 2).alignment = { horizontal: 'center' }
  ;['ITEM', 'DESCRIPCIÓN DE MATERIAL', 'UNIDAD'].forEach((t, i) => {
    const c = rs.getCell(6, 2 + i); c.value = t; c.font = fuente(9.5, true); c.fill = relleno(AMBAR_OSCURO); c.border = borde
  })
  const todos = new Map<string, Fila>()
  for (const mapa of porCuadrilla.values()) for (const f of mapa.values()) if (!todos.has(f.id)) todos.set(f.id, f)
  const materiales = ordenar([...todos.values()])
  bloques.forEach((b, i) => {
    const c0 = 6 + i * 5
    rs.mergeCells(4, c0, 4, c0 + 3)
    rs.getCell(4, c0).value = b.titulo
    rs.getCell(4, c0).font = fuente(9, true)
    rs.getCell(4, c0).fill = relleno(AMBAR)
    rs.getCell(4, c0).alignment = { horizontal: 'center', wrapText: true }
    ;['ENTRADA', 'SALIDA', 'STOCK', 'STOCK REAL INSITU'].forEach((t, k) => {
      const c = rs.getCell(6, c0 + k); c.value = t; c.font = fuente(8, true); c.fill = relleno(AMBAR_OSCURO); c.border = borde
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      rs.getColumn(c0 + k).width = 9
    })
    rs.getColumn(c0 + 4).width = 1.8
  })
  rs.getRow(4).height = 28; rs.getRow(6).height = 40
  let rr = 7
  let cat = ''
  let k = 0
  for (const f of materiales) {
    if (f.categoria !== cat) {
      cat = f.categoria
      rs.getCell(rr, 3).value = cat
      for (let col = 2; col <= 4; col++) { rs.getCell(rr, col).fill = relleno(AMBAR); rs.getCell(rr, col).font = fuente(9.5, true) }
      rr++
    }
    k++
    rs.getCell(rr, 2).value = k
    rs.getCell(rr, 3).value = f.nombre
    rs.getCell(rr, 4).value = f.unidad
    let te = 0, ts = 0
    bloques.forEach((b, i) => {
      const c0 = 6 + i * 5
      let e: number, s: number
      if (b.x) {
        const v = b.x.filas.get(f.id)
        e = v?.e ?? 0; s = v?.s ?? 0
        te += e; ts += s
      } else { e = te; s = ts }
      rs.getCell(rr, c0).value = Number(e.toFixed(3))
      rs.getCell(rr, c0 + 1).value = Number(s.toFixed(3))
      rs.getCell(rr, c0 + 2).value = Number((e - s).toFixed(3))
      for (let q = 0; q < 4; q++) {
        const c = rs.getCell(rr, c0 + q)
        c.numFmt = 'General;[Red]-General;""'
        c.border = borde
        c.font = fuente(9.5, q >= 2)
        if (q === 2) c.fill = relleno(STOCK)
        if (q === 3) c.fill = relleno('FFC3D69B')
      }
    })
    for (let col = 2; col <= 4; col++) { rs.getCell(rr, col).border = borde; rs.getCell(rr, col).font = fuente(9.5) }
    rr++
  }

  const nombre = `${mes}_SEGUIMIENTO-DIARIO-DE-MATERIALES_${cuadrillas.length}-CUADRILLAS.xlsx`
  return { buffer: await wb.xlsx.writeBuffer(), nombre, cuadrillas: cuadrillas.length, movimientos: movs.length }
}
