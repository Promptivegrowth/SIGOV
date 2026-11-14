/**
 * El reporte diario FOR:001 «Reporte diario de ejecución – Mantenimiento
 * rutinario», tal como lo mandó Elvis (13/10/2026): A4 apaisado, dos
 * páginas, logo de SERVICON.
 *
 * Página 1: I) datos generales y II) datos de ejecución por actividad (acta
 * PCI, horas, personas, ubicación y avance con longitud, ancho y espesor).
 * Página 2: III) materiales por partida, IV) equipos, V) otros recursos,
 * observaciones generales y las firmas del jefe de cuadrilla y del
 * ingeniero supervisor o residente.
 *
 * Uno por día y cuadrilla (P15). Sin fotos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeLado } from './lados'
import { fmtProgresiva } from './utils'

const AZUL: [number, number, number] = [7, 45, 112]
const VERDE: [number, number, number] = [0, 128, 64]
const FONDO: [number, number, number] = [226, 239, 218]
const CABECERA: [number, number, number] = [221, 235, 247]

type Datos = {
  parte: any
  cuadrilla: any
  jefe: string | null
  supervisor: string | null
  validador: string | null
  cliente: string | null
  registros: any[]
  materiales: { registro: string | null; codigo: string; nombre: string; cantidad: number; unidad: string }[]
  recursos: any[]
  /** Lo que falta para la versión oficial: con algo, sale como borrador (OBS 4, CASO 15). */
  incompleto: string[]
}

const TIPO_RECURSO: Record<string, string> = {
  equipo: 'Equipo', herramienta: 'Herramienta', epp: 'EPP', epc: 'EPC', material: 'Material', otro: 'Otro',
}
/** Lo que existe físicamente: no se suma entre actividades (OBS 3). */
const FISICO = new Set(['equipo', 'herramienta', 'epp', 'epc'])

export type RecursoConsolidado = {
  tipo: string
  codigo: string | null
  descripcion: string
  unidad: string | null
  cantidad: number | null
  horas: number | null
  actividades: number
  detalle: string | null
  observacion: string | null
}

/**
 * El consolidado del día (OBS 3, CASOS 16 y 17): el material de dos
 * actividades se suma; la hidrolavadora usada en dos actividades sigue
 * siendo 1 und. (la mayor cantidad física), con sus horas de uso sumadas.
 */
export function consolidarRecursos(recursos: any[]): RecursoConsolidado[] {
  const grupos = new Map<string, any[]>()
  for (const r of recursos) {
    const k = [r.tipo, String(r.descripcion ?? '').trim().toLowerCase(), String(r.unidad ?? '').trim().toLowerCase()].join('|')
    grupos.set(k, [...(grupos.get(k) ?? []), r])
  }
  return [...grupos.values()].map((g) => {
    const x = g[0]
    const cant = g.map((r) => r.cantidad).filter((v) => v != null).map(Number)
    const horas = g.map((r) => r.horas_uso).filter((v) => v != null).map(Number)
    const pct = g.map((r) => r.participacion_pct).filter((v) => v != null).map(Number)
    const detalle = [
      horas.length > 1 ? horas.map((h) => `${cifra(h)} h`).join(' + ') : null,
      pct.length ? `Participación ${pct.map((p) => `${cifra(p)} %`).join(' / ')}` : null,
      x.tipo === 'epp' || x.tipo === 'epc' ? 'EPP/EPC por jornada' : null,
    ].filter(Boolean).join(' · ')
    return {
      tipo: x.tipo,
      codigo: g.find((r) => r.codigo)?.codigo ?? null,
      descripcion: String(x.descripcion ?? '').trim(),
      unidad: x.unidad ?? null,
      cantidad: cant.length ? (FISICO.has(x.tipo) ? Math.max(...cant) : cant.reduce((a, b) => a + b, 0)) : null,
      horas: horas.length ? horas.reduce((a, b) => a + b, 0) : null,
      actividades: g.length,
      detalle: detalle || null,
      observacion: [...new Set(g.map((r) => r.observacion?.trim()).filter(Boolean))].join(' · ') || null,
    }
  })
}

/** Qué le falta a un parte para ser la versión oficial. */
export function faltantesDelParte(registros: any[]): string[] {
  if (!registros.length) return ['sin actividades registradas']
  return registros
    .filter((r) => !(Number(r.quantity) > 0))
    .map((r) => `«${r.activity_name ?? 'Actividad'}» sin metrado`)
}

/** Trae todo lo que el FOR:001 necesita de un parte. */
export async function datosFor001(sb: SupabaseClient<any>, parteId: string): Promise<Datos> {
  const { data: parte, error } = await sb.from('work_orders')
    .select('id, service_id, crew_id, work_date, status, weather, start_time, end_time, headcount, notes, review_notes, reviewed_by')
    .eq('id', parteId).single()
  if (error) throw error
  const [crew, servicio, registros, movimientos, recursos] = await Promise.all([
    sb.from('crews').select('code, name, numero, sede, subtramo, leader_id, supervisor_id').eq('id', parte.crew_id).single(),
    sb.from('services').select('client_name').eq('id', parte.service_id).single(),
    sb.from('v_work_entries').select('*').eq('work_order_id', parteId).order('created_at'),
    sb.from('movimientos_cuadrilla')
      .select('qty, work_entry_id, supplies(code, name, units(symbol))')
      .eq('crew_id', parte.crew_id).eq('occurred_on', parte.work_date).eq('tipo', 'consumo').is('deleted_at', null),
    sb.from('parte_recursos').select('tipo, codigo, descripcion, unidad, cantidad, observacion, horas_uso, participacion_pct')
      .eq('work_order_id', parteId).is('deleted_at', null).order('created_at'),
  ])
  const ids = [crew.data?.leader_id, crew.data?.supervisor_id, parte.reviewed_by].filter(Boolean) as string[]
  const { data: personas } = ids.length
    ? await sb.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as any[] }
  const nombre = (id?: string | null) => (personas ?? []).find((p: any) => p.id === id)?.full_name ?? null
  // «Datos del día» ya no se piden a mano (SEG-V2-OBS-13): si el capataz no
  // los puso, salen de lo registrado (la primera y la última hora de las
  // actividades y el mayor número de personas en una de ellas)
  const regs = (registros.data ?? []) as any[]
  const horasIni = regs.map((r) => r.hora_inicio).filter(Boolean).sort()
  const horasFin = regs.map((r) => r.hora_fin).filter(Boolean).sort()
  const personasMax = Math.max(0, ...regs.map((r) => Number(r.personas) || 0))
  const parteCompleto = {
    ...parte,
    start_time: parte.start_time ?? horasIni[0] ?? null,
    end_time: parte.end_time ?? horasFin[horasFin.length - 1] ?? null,
    headcount: parte.headcount ?? (personasMax || null),
  }
  return {
    parte: parteCompleto,
    cuadrilla: crew.data,
    jefe: nombre(crew.data?.leader_id),
    supervisor: nombre(crew.data?.supervisor_id),
    validador: parte.status === 'validado' ? nombre(parte.reviewed_by) : null,
    cliente: servicio.data?.client_name ?? null,
    registros: registros.data ?? [],
    materiales: (movimientos.data ?? []).map((m: any) => ({
      registro: m.work_entry_id,
      codigo: m.supplies?.code ?? '',
      nombre: m.supplies?.name ?? 'Material',
      cantidad: Number(m.qty) || 0,
      unidad: m.supplies?.units?.symbol ?? '',
    })),
    recursos: recursos.data ?? [],
    incompleto: faltantesDelParte(registros.data ?? []),
  }
}

/** El PNG en base64, por tramos: un logo grande desborda String.fromCharCode(...bytes). */
function aBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** `2026-10-01` → `01/10/2026` */
function fecha(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** `07:30:00` → `07:30` */
function hora(t: string | null | undefined) {
  return t ? t.slice(0, 5) : ''
}

/** Minutos entre dos horas, como `4 h 30 min`. */
function duracion(ini?: string | null, fin?: string | null) {
  if (!ini || !fin) return ''
  const a = Number(ini.slice(0, 2)) * 60 + Number(ini.slice(3, 5))
  const b = Number(fin.slice(0, 2)) * 60 + Number(fin.slice(3, 5))
  if (!(b > a)) return ''
  const h = Math.floor((b - a) / 60)
  const m = (b - a) % 60
  return h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`
}

function cifra(n: number | null | undefined, decimales = 2) {
  if (n == null || !Number.isFinite(Number(n))) return ''
  const v = Number(n)
  return v % 1 === 0 ? String(v) : v.toFixed(decimales).replace(/0+$/, '').replace(/\.$/, '')
}

/** El PDF del FOR:001. `logo` es el PNG de SERVICON. */
export async function for001Pdf(datos: Datos, logo?: ArrayBuffer | null) {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then((m) => m.default),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 10
  const { parte, cuadrilla, registros } = datos
  const logoB64 = logo ? 'data:image/png;base64,' + aBase64(logo) : null

  // ── Encabezado de cada página ────────────────────────────────────────
  const encabezado = () => {
    doc.setDrawColor(...AZUL)
    doc.setLineWidth(0.4)
    doc.rect(M, M, W - 2 * M, 16)
    doc.line(M + 42, M, M + 42, M + 16)
    doc.line(W - M - 52, M, W - M - 52, M + 16)
    doc.line(W - M - 52, M + 8, W - M, M + 8)
    if (logoB64) doc.addImage(logoB64, 'PNG', M + 3, M + 2.5, 36, 11)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...VERDE)
    doc.text('FORMATO', M + 46, M + 5)
    doc.setFontSize(10)
    doc.setTextColor(...AZUL)
    doc.text('REPORTE DIARIO DE EJECUCIÓN - MANTENIMIENTO RUTINARIO', M + 46, M + 11.5)
    doc.text('FOR:001', W - M - 26, M + 5.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(fecha(parte.work_date), W - M - 26, M + 13.5, { align: 'center' })
    doc.setDrawColor(...VERDE)
    doc.setLineWidth(0.8)
    doc.line(M, M + 17, W - M, M + 17)
  }

  /** «BORRADOR – REPORTE INCOMPLETO», cruzado sobre la hoja y en una banda (OBS 4). */
  const borrador = () => {
    if (!datos.incompleto.length) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(46)
    doc.setTextColor(244, 199, 199)
    doc.text('BORRADOR – REPORTE INCOMPLETO', W / 2, H / 2 + 20, { align: 'center', angle: 24 })
    doc.setFillColor(253, 236, 236)
    doc.rect(M, H - 15.5, W - 2 * M, 5.5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(185, 28, 28)
    doc.text(('BORRADOR – REPORTE INCOMPLETO · No es la versión oficial: ' + datos.incompleto.join('; ')).slice(0, 190), M + 2, H - 11.8)
  }

  const pie = (pagina: number) => {
    borrador()
    doc.setDrawColor(...VERDE)
    doc.setLineWidth(0.4)
    doc.line(M, H - 9, W - M, H - 9)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...AZUL)
    doc.text('GRUPO SERVICON V&D EIRL', M, H - 5)
    doc.setFont('helvetica', 'normal')
    doc.text(`PÁGINA ${pagina} DE 2`, W - M, H - 5, { align: 'right' })
  }

  const seccion = (texto: string, x: number, y: number, ancho: number, tamano = 9) => {
    doc.setFillColor(...FONDO)
    doc.rect(x, y, ancho, 5.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(tamano)
    doc.setTextColor(...AZUL)
    doc.text(texto, x + 1.5, y + 4)
  }

  // ═══ Página 1 ═════════════════════════════════════════════════════
  encabezado()
  let y = M + 20
  seccion('I) DATOS GENERALES', M, y, W - 2 * M)
  y += 8

  // Proceso: MR, PCI, AT. EMERG., OTROS (según de dónde salió cada actividad)
  const origenes = new Set(registros.map((r) => r.origen))
  const proceso = [
    ['MR', origenes.has('programacion')],
    ['PCI', origenes.has('pci')],
    ['AT. EMERG.', origenes.has('emergencia')],
    ['OTROS', origenes.has('no_programado')],
  ] as const
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(0)
  doc.text('PROCESO', M + 4, y + 4)
  proceso.forEach(([k, marcado], i) => {
    const x = M + 24 + i * 15
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(k, x + 7, y - 0.5, { align: 'center' })
    doc.setDrawColor(150)
    doc.setLineWidth(0.2)
    doc.rect(x, y + 0.5, 14, 4.5)
    if (marcado) { doc.setFontSize(9); doc.text('X', x + 7, y + 4.2, { align: 'center' }) }
  })

  const componentes = [...new Set(registros.map((r) => r.activity_category).filter(Boolean))].join(', ')
  const sectores = [...new Set(registros.map((r) => r.sector_code).filter(Boolean))].join(', ')
  const campos: [string, string, number, number][] = [
    ['FECHA', fecha(parte.work_date), M + 4, y + 10],
    ['SUB TRAMO', cuadrilla?.subtramo ? `SUBTRAMO ${cuadrilla.subtramo}` : '', M + 4, y + 16],
    ['CLIENTE', datos.cliente ?? 'COVINCA', M + 96, y + 4],
    ['COMPONENTE', componentes, M + 96, y + 10],
    ['ING. SUPERVISOR', datos.supervisor ?? '', M + 96, y + 16],
    ['CUADRILLA', cuadrilla ? `${cuadrilla.code} · ${cuadrilla.name}` : '', M + 188, y + 4],
    ['CAPATAZ', datos.jefe ?? '', M + 188, y + 10],
    ['SECTOR', sectores, M + 188, y + 16],
  ]
  for (const [rotulo, valor, x, yy] of campos) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(rotulo, x, yy)
    doc.setDrawColor(190)
    doc.rect(x + 28, yy - 3.5, 56, 4.8)
    doc.setFontSize(7.5)
    doc.text(doc.splitTextToSize(valor, 54)[0] ?? '', x + 29, yy)
  }
  y += 22

  seccion('II) DATOS DE EJECUCIÓN', M, y, W - 2 * M)
  y += 6.5

  const filas = registros.map((r, i) => [
    r.activity_code ?? '',
    String(r.activity_numero ?? i + 1),
    r.pci_code ?? '',
    r.pci_item_number != null ? String(r.pci_item_number) : '',
    r.unit_symbol ?? '',
    r.activity_name ?? '',
    hora(r.hora_inicio),
    hora(r.hora_fin),
    duracion(r.hora_inicio, r.hora_fin),
    r.personas != null ? String(r.personas) : '',
    r.prog_start_m != null ? fmtProgresiva(r.prog_start_m) : '',
    r.prog_end_m != null ? fmtProgresiva(r.prog_end_m) : '',
    r.side ? codigoDeLado(r.side) : '',
    cifra(r.longitud_m),
    cifra(r.ancho_m),
    cifra(r.espesor_m, 3),
    cifra(r.quantity),
    r.unit_symbol ?? '',
    r.observation ?? '',
  ])
  // Al menos 8 filas, como el formato impreso
  while (filas.length < 8) filas.push(Array(19).fill(''))

  autoTable(doc, {
    startY: y,
    // Si la tabla sigue en otra hoja, empieza debajo del encabezado
    margin: { left: M, right: M, bottom: 14, top: M + 20 },
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1, lineColor: [170, 170, 170], lineWidth: 0.15, textColor: 20, valign: 'middle', minCellHeight: 7 },
    headStyles: { fillColor: CABECERA, textColor: AZUL, fontStyle: 'bold', halign: 'center', fontSize: 5.5 },
    head: [
      [
        { content: 'COD. PARTIDA', rowSpan: 2 }, { content: 'N°', rowSpan: 2 },
        { content: 'ACTA PCI', colSpan: 2 }, { content: 'DESCRIPCIÓN', colSpan: 2 },
        { content: 'HORA DE EJECUCIÓN', colSpan: 4 }, { content: 'UBICACIÓN', colSpan: 3 },
        { content: 'AVANCE EJECUTADO', colSpan: 5 }, { content: 'OBSERVACIONES', rowSpan: 2 },
      ],
      ['N° PCI', 'ÍTEM', 'UND', 'ACTIVIDAD', 'INICIO', 'FIN', 'DURAC.', 'CANT.\nPERS.',
        'PROG.\nINICIAL', 'PROG.\nFINAL', 'LD/LI/\nEJE', 'LONGITUD\n(m)', 'ANCHO\n(m)', 'ESPESOR\n(m)', 'METRADO', 'UND'],
    ],
    body: filas,
    columnStyles: {
      0: { cellWidth: 20 }, 1: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 15 }, 3: { cellWidth: 9, halign: 'center' },
      4: { cellWidth: 9, halign: 'center' }, 5: { cellWidth: 40 }, 6: { cellWidth: 11, halign: 'center' },
      7: { cellWidth: 11, halign: 'center' }, 8: { cellWidth: 12, halign: 'center' }, 9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 15, halign: 'center' }, 11: { cellWidth: 15, halign: 'center' }, 12: { cellWidth: 11, halign: 'center' },
      13: { cellWidth: 13, halign: 'right' }, 14: { cellWidth: 11, halign: 'right' }, 15: { cellWidth: 11, halign: 'right' },
      16: { cellWidth: 13, halign: 'right' }, 17: { cellWidth: 9, halign: 'center' }, 18: { cellWidth: 'auto' },
    },
    didDrawPage: () => {
      if (doc.getNumberOfPages() > 1 && (doc as any).internal.getCurrentPageInfo().pageNumber > 1) encabezado()
    },
  })
  pie(1)

  // ═══ Página 2 ═════════════════════════════════════════════════════
  doc.addPage()
  encabezado()
  y = M + 20
  const anchoMat = 128
  const anchoEq = 64
  const anchoOtros = W - 2 * M - anchoMat - anchoEq - 8
  const xEq = M + anchoMat + 4
  const xOtros = xEq + anchoEq + 4
  seccion('III) MATERIALES', M, y, anchoMat)
  seccion('IV) EQUIPOS', xEq, y, anchoEq)
  seccion('V) OTROS RECURSOS (HERRAMIENTAS, EPC, ETC)', xOtros, y, anchoOtros, 7.5)
  y += 6.5

  const nombreDe = new Map(registros.map((r) => [r.id, r]))
  const mat = datos.materiales.map((m) => {
    const r = m.registro ? nombreDe.get(m.registro) : null
    return [r?.activity_code ?? '', r ? String(r.activity_numero ?? '') : '', r?.activity_name ?? '', m.nombre, cifra(m.cantidad, 3), m.unidad]
  })
  // Consolidado (OBS 3): la plantilla no tiene columna de horas, van con la descripción
  const consolidado = consolidarRecursos(datos.recursos)
  const equipos = consolidado.filter((x) => x.tipo === 'equipo')
    .map((x, i) => [x.codigo ?? '', String(i + 1), x.descripcion + (x.horas != null ? ` · ${cifra(x.horas)} h` : ''), x.unidad ?? '', cifra(x.cantidad)])
  const otros = consolidado.filter((x) => x.tipo !== 'equipo')
    .map((x) => [x.descripcion, x.unidad ?? '', cifra(x.cantidad),
      [TIPO_RECURSO[x.tipo] ?? 'Otro', x.horas != null ? `Uso: ${cifra(x.horas)} h` : null, x.detalle, x.observacion].filter(Boolean).join(' · ')])
  const relleno = (f: string[][], n: number, ancho: number) => { while (f.length < n) f.push(Array(ancho).fill('')); return f }
  const estilo = {
    theme: 'grid' as const,
    styles: { fontSize: 6.5, cellPadding: 1, lineColor: [170, 170, 170] as [number, number, number], lineWidth: 0.15, textColor: 20, minCellHeight: 5 },
    headStyles: { fillColor: CABECERA, textColor: AZUL, fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 6.5 },
  }
  autoTable(doc, {
    ...estilo, startY: y, margin: { left: M }, tableWidth: anchoMat,
    head: [['COD. PARTIDA', 'N°', 'ACTIVIDAD', 'MATERIALES', 'CANT', 'UND']],
    body: relleno(mat, 16, 6),
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 36 }, 3: { cellWidth: 40 }, 4: { cellWidth: 13, halign: 'right' }, 5: { cellWidth: 11, halign: 'center' } },
  })
  const finMat = (doc as any).lastAutoTable.finalY
  autoTable(doc, {
    ...estilo, startY: y, margin: { left: xEq }, tableWidth: anchoEq,
    head: [['CÓDIGO', 'N°', 'DESCRIPCIÓN EQUIPO', 'UND', 'CANT']],
    body: relleno(equipos, 16, 5),
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 7, halign: 'center' }, 2: { cellWidth: 25 }, 3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 10, halign: 'right' } },
  })
  autoTable(doc, {
    ...estilo, startY: y, margin: { left: xOtros }, tableWidth: anchoOtros,
    head: [['DESCRIPCIÓN', 'UND', 'CANT', 'OBSERVACIONES']],
    body: relleno(otros, 16, 4),
    columnStyles: { 0: { cellWidth: anchoOtros * 0.36 }, 1: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 10, halign: 'right' }, 3: { cellWidth: 'auto' } },
  })

  // Observaciones generales
  y = Math.max(finMat, (doc as any).lastAutoTable.finalY) + 4
  seccion('OBSERVACIONES GENERALES', M, y, W - 2 * M)
  const observaciones = [
    parte.notes,
    parte.start_time && `Jornada: ${hora(parte.start_time)} a ${hora(parte.end_time)}`,
    parte.headcount && `Personal: ${parte.headcount}`,
    parte.review_notes && `Revisión: ${parte.review_notes}`,
  ].filter(Boolean).join(' · ')
  doc.setDrawColor(190)
  doc.setLineWidth(0.2)
  doc.rect(M, y + 5.5, W - 2 * M, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(20)
  doc.text(doc.splitTextToSize(observaciones || ' ', W - 2 * M - 4).slice(0, 4), M + 2, y + 10)

  // Firmas
  const yf = Math.min(y + 26, H - 32)
  const firma = (titulo: string, nombre: string | null, x: number) => {
    const ancho = 100
    doc.setFillColor(...CABECERA)
    doc.setDrawColor(150)
    doc.setLineWidth(0.2)
    doc.rect(x, yf, ancho, 5, 'FD')
    doc.rect(x, yf + 5, ancho, 14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...AZUL)
    doc.text(titulo, x + ancho / 2, yf + 3.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20)
    doc.text('Firma:', x + 2, yf + 10)
    doc.text('Nombre: ' + (nombre ?? ''), x + 2, yf + 16)
  }
  firma('JEFE DE CUADRILLA / CAPATAZ', datos.jefe, M + 30)
  firma('INGENIERO SUPERVISOR / RESIDENTE', datos.validador ?? datos.supervisor, W - M - 130)
  pie(2)
  return doc
}

/**
 * El FOR:001 en Excel, con las columnas de la plantilla (REV3-OBS-19): la
 * ejecución en su hoja y materiales, equipos y otros recursos en las suyas.
 * No se agregan columnas ajenas al formato oficial.
 */
export async function for001Excel(datos: Datos, nombre: string) {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV'
  const { parte, cuadrilla, registros } = datos
  const azul = 'FF072D70'
  const celeste = 'FFDDEBF7'

  const hoja = (titulo: string, columnas: [string, number][], filas: (string | number)[][], ficha: [string, string][]) => {
    const ws = wb.addWorksheet(titulo)
    ws.columns = columnas.map(([, w]) => ({ width: w }))
    const t = ws.addRow(['REPORTE DIARIO DE EJECUCIÓN - MANTENIMIENTO RUTINARIO · FOR:001'])
    t.getCell(1).font = { bold: true, size: 12, color: { argb: azul } }
    for (const [k, v] of ficha) {
      const r = ws.addRow([k, v])
      r.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF555555' } }
      r.getCell(2).font = { size: 9 }
    }
    ws.addRow([])
    const cab = ws.addRow(columnas.map(([c]) => c))
    cab.eachCell((c: any) => {
      c.font = { bold: true, size: 8, color: { argb: azul } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: celeste } }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })
    cab.height = 28
    for (const f of filas) {
      const r = ws.addRow(f)
      r.eachCell({ includeEmpty: true }, (c: any) => {
        c.font = { size: 9 }
        c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
      })
    }
    ws.views = [{ state: 'frozen', ySplit: ficha.length + 3 }]
  }

  const origenes = new Set(registros.map((r) => r.origen))
  const ficha: [string, string][] = [
    ...(datos.incompleto.length ? [['ESTADO', 'BORRADOR – REPORTE INCOMPLETO: ' + datos.incompleto.join('; ')] as [string, string]] : []),
    ['FECHA', fecha(parte.work_date)],
    ['PROCESO', ([['MR', 'programacion'], ['PCI', 'pci'], ['AT. EMERG.', 'emergencia'], ['OTROS', 'no_programado']] as const)
      .filter(([, k]) => origenes.has(k)).map(([n]) => n).join(', ')],
    ['CLIENTE', datos.cliente ?? 'COVINCA'],
    ['COMPONENTE', [...new Set(registros.map((r) => r.activity_category).filter(Boolean))].join(', ')],
    ['ING. SUPERVISOR', datos.supervisor ?? ''],
    ['CUADRILLA', cuadrilla ? `${cuadrilla.code} · ${cuadrilla.name}` : ''],
    ['CAPATAZ', datos.jefe ?? ''],
    ['SUB TRAMO', cuadrilla?.subtramo ? `SUBTRAMO ${cuadrilla.subtramo}` : ''],
    ['SECTOR', [...new Set(registros.map((r) => r.sector_code).filter(Boolean))].join(', ')],
  ]
  hoja('II Ejecución', [
    ['COD. PARTIDA', 13], ['N°', 5], ['N° PCI', 9], ['ÍTEM', 6], ['UND', 6], ['ACTIVIDAD', 36], ['HORA INICIO', 9], ['HORA FIN', 9],
    ['DURACIÓN', 9], ['CANT. PERS.', 8], ['PROG. INICIAL', 11], ['PROG. FINAL', 11], ['LD/LI/EJE', 9], ['LONGITUD (m)', 10],
    ['ANCHO (m)', 9], ['ESPESOR (m)', 9], ['METRADO', 10], ['UND', 6], ['OBSERVACIONES', 40],
  ], registros.map((r, i) => [
    r.activity_code ?? '', r.activity_numero ?? i + 1, r.pci_code ?? '', r.pci_item_number ?? '', r.unit_symbol ?? '',
    r.activity_name ?? '', hora(r.hora_inicio), hora(r.hora_fin), duracion(r.hora_inicio, r.hora_fin), r.personas ?? '',
    r.prog_start_m != null ? fmtProgresiva(r.prog_start_m) : '', r.prog_end_m != null ? fmtProgresiva(r.prog_end_m) : '',
    r.side ? codigoDeLado(r.side) : '', r.longitud_m ?? '', r.ancho_m ?? '', r.espesor_m ?? '', r.quantity ?? '',
    r.unit_symbol ?? '', r.observation ?? '',
  ]), ficha)
  const porId = new Map(registros.map((r) => [r.id, r]))
  hoja('III Materiales', [['COD. PARTIDA', 13], ['N°', 5], ['ACTIVIDAD', 34], ['MATERIALES', 30], ['CANT', 9], ['UND', 7]],
    datos.materiales.map((m) => {
      const r = m.registro ? porId.get(m.registro) : null
      return [r?.activity_code ?? '', r?.activity_numero ?? '', r?.activity_name ?? '', m.nombre, m.cantidad, m.unidad]
    }), [['FECHA', fecha(parte.work_date)]])
  const consolidado = consolidarRecursos(datos.recursos)
  hoja('IV Equipos', [['CÓDIGO', 12], ['N°', 5], ['DESCRIPCIÓN EQUIPO', 34], ['UND', 7], ['CANT. FÍSICA', 11], ['HORAS DE USO', 11], ['DETALLE', 30]],
    consolidado.filter((x) => x.tipo === 'equipo').map((x, i) => [x.codigo ?? '', i + 1, x.descripcion, x.unidad ?? '', x.cantidad ?? '', x.horas ?? '', x.detalle ?? '']),
    [['FECHA', fecha(parte.work_date)]])
  hoja('V Otros recursos', [['TIPO', 12], ['DESCRIPCIÓN', 34], ['UND', 7], ['CANT', 9], ['HORAS DE USO', 11], ['OBSERVACIONES', 34]],
    consolidado.filter((x) => x.tipo !== 'equipo').map((x) => [TIPO_RECURSO[x.tipo] ?? 'Otro', x.descripcion, x.unidad ?? '', x.cantidad ?? '', x.horas ?? '',
      [x.detalle, x.observacion].filter(Boolean).join(' · ')]),
    [['FECHA', fecha(parte.work_date)]])

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
