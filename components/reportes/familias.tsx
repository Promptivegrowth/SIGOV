'use client'

import * as React from 'react'
import {
  Layers, Shield, CalendarDays, FileText, HardHat, Wallet, Search, MessageSquareWarning,
  MapPinned, Truck, Gauge, Package, CheckCircle2, XCircle, BarChart3, Clock, AlertTriangle, ListChecks,
} from 'lucide-react'
import { fetchAll } from '@/lib/supabase/client'
import { fmtDate, fmtDateTime, fmtNumber, fmtProgresiva, truncate } from '@/lib/utils'
import { codigoDeLado } from '@/lib/lados'
import { moduloDeTabla, ACCION_BITACORA } from '@/lib/bitacora'
import { usuarioDeCorreo } from '@/lib/usuario'
import { TIPOS_INSPECCION } from '@/components/ssoma/comun-ssoma'

/**
 * Las familias del Centro de reportes (ADMIN_Reportes_V2; guía, función 15).
 *
 * Cada familia es UNA consulta: la tabla de la pantalla, los KPIs, la vista
 * previa, el Excel, el PDF, el panel JPG y el mapa salen de las mismas
 * filas ya filtradas. Las filas llegan con los permisos de quien consulta
 * (RLS y funciones con alcance por rol): el formato nunca amplía permisos.
 */

export type Ctx = { sb: any; serviceId: string; desde: string; hasta: string; visor: boolean }
export type Tono = 'azul' | 'verde' | 'rojo' | 'ambar'
export interface Columna {
  k: string
  t: string
  /** Texto para Excel/PDF y para ordenar */
  v: (f: any) => string | number
  /** Cómo se pinta en pantalla (si no, el texto) */
  ver?: (f: any) => React.ReactNode
  orden?: boolean
  ancho?: number
  /** Solo en la exportación (la pantalla lleva las columnas esenciales) */
  soloExport?: boolean
  alinear?: 'right' | 'center'
}
export interface Selector { k: string; t: string; icono: any; valor: (f: any) => string | null; nombre?: (v: string) => string; orden?: 'num' }
export interface Familia {
  key: string
  label: string
  icono: any
  titulo: string
  /** «Más familias»: las de la guía que no van en la barra de la maqueta */
  extra?: boolean
  /** Desde cuándo mira por defecto (los PCI viven meses; el diario, semanas) */
  desdeDefecto?: () => string
  /** Registros maestros: no se filtran por fecha */
  sinFechas?: boolean
  buscar: string
  selectores: Selector[]
  /** Estado: filtro con significado (no solo un valor de columna) */
  estados?: [string, string, (f: any) => boolean][]
  cargar: (c: Ctx) => Promise<any[]>
  kpis: (filas: any[]) => { v: string; t: string; tono: Tono; i: any }[]
  columnas: Columna[]
  texto: (f: any) => string
  ver?: (f: any) => string | null
  editar?: (f: any) => string | null
  evidencias?: (f: any) => string | null
  /** Fotos para el panel JPG: solo si hay evidencias en lo filtrado */
  conFotos?: (f: any) => boolean
  fotos?: { tipo: 'pci' | 'parte' | 'entrada'; id: (f: any) => string; titulo: (f: any) => string; detalle: (f: any) => string }
  /** Mapa: solo con coordenadas autorizadas */
  conCoordenadas?: (f: any) => boolean
  /** El punto de la fila [lng, lat]; el PCI lo toma de sus fotos */
  punto?: (f: any) => [number, number] | null
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '0 %')
const corto = (c: string) => String(c ?? '').replace(/^PCI-\d{4}-0*/, '')
const n = (x: any) => Number(x) || 0

export function Chip({ tono, children }: { tono: Tono | 'gris'; children: React.ReactNode }) {
  const c = { verde: 'bg-success/12 text-success', rojo: 'bg-destructive/10 text-destructive', ambar: 'bg-warning/15 text-warning', azul: 'bg-info/10 text-info', gris: 'bg-secondary text-muted-foreground' }[tono]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${c}`}>● {children}</span>
}

const EVIDENCIA = (f: any) => {
  if (f.requiere_evidencia === false) return 'No requiere'
  const fal: string[] = f.faltantes ?? []
  if (!fal.length) return 'Completa'
  if (fal.length === 3) return 'No adjunta'
  return 'Falta ' + fal.map((x) => (x === 'antes' ? 'antes' : x === 'durante' ? 'durante' : 'después')).join(' y ')
}
const PARTE: Record<string, [string, Tono | 'gris']> = {
  borrador: ['Borrador', 'gris'], enviado: ['Por validar', 'azul'], validado: ['Validado', 'verde'], observado: ['Observado', 'rojo'],
}
const PLAN: Record<string, [string, Tono | 'gris']> = {
  programado: ['Programado', 'azul'], en_curso: ['En curso', 'ambar'], por_validar: ['Por validar', 'azul'], ejecutado: ['Ejecutado', 'verde'],
  suspendido: ['Suspendido', 'rojo'], reprogramado: ['Reprogramado', 'gris'], cancelado: ['Cancelado', 'gris'],
}
const CAJA: Record<string, [string, Tono | 'gris']> = {
  registrado: ['Registrado', 'azul'], observado: ['Observado', 'rojo'], aprobado: ['Aprobado', 'verde'], anulado: ['Anulado', 'gris'],
}
const MOV: Record<string, string> = { apertura: 'Apertura', deposito: 'Depósito', gasto: 'Gasto', devolucion: 'Devolución', ajuste: 'Ajuste' }

// ═══ PCI ════════════════════════════════════════════════════════════════
const pci: Familia = {
  key: 'pci', label: 'PCI', icono: Layers, titulo: 'Reporte PCI', buscar: 'Buscar ítem / progresiva...',
  desdeDefecto: () => `${new Date().getFullYear()}-01-01`,
  selectores: [
    { k: 'pci', t: 'PCI', icono: Layers, valor: (f) => f.pci, nombre: corto },
    { k: 'plazo', t: 'Plazo', icono: Clock, valor: (f) => String(f.plazo), nombre: (v) => `${v} ${v === '1' ? 'día' : 'días'}`, orden: 'num' },
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crew ?? 'Sin asignar' },
    { k: 'sector', t: 'Sector', icono: MapPinned, valor: (f) => f.sector ?? 'Sin sector' },
  ],
  estados: [
    ['atendido', 'Atendido', (f) => f.ejecucion === 'atendido'],
    ['sin_atencion', 'Sin atención', (f) => f.ejecucion === 'sin_atencion'],
    ['completa', 'Evidencia completa', (f) => !(f.faltantes ?? []).length],
    ['incompleta', 'Evidencia incompleta', (f) => (f.faltantes ?? []).length > 0],
    ['pendiente', 'Conformidad pendiente', (f) => f.conformidad === 'pendiente'],
    ['conforme', 'Conforme', (f) => f.conformidad === 'conforme'],
    ['observado', 'Observado por COVINCA', (f) => f.conformidad === 'observado'],
  ],
  cargar: async (c) => {
    const { data, error } = await c.sb.rpc('reporte_pci', { p_service: c.serviceId, p_desde: c.desde, p_hasta: c.hasta })
    if (error) throw error
    return (data ?? []) as any[]
  },
  kpis: (fs) => {
    const at = fs.filter((f) => f.ejecucion === 'atendido').length
    return [
      { v: fmtNumber(fs.length), t: 'Registros', tono: 'azul', i: Layers },
      { v: fmtNumber(at), t: 'Atendidos', tono: 'verde', i: CheckCircle2 },
      { v: fmtNumber(fs.length - at), t: 'Sin atención', tono: 'rojo', i: XCircle },
      { v: pct(at, fs.length), t: 'Avance', tono: 'verde', i: BarChart3 },
    ]
  },
  columnas: [
    { k: 'pci', t: 'PCI', v: (f) => corto(f.pci), soloExport: true, ancho: 8 },
    { k: 'item', t: 'Ítem', v: (f) => n(f.item), ver: (f) => <strong>{f.item}</strong>, orden: true, ancho: 7 },
    { k: 'plazo', t: 'Plazo', v: (f) => n(f.plazo), ver: (f) => `${f.plazo} ${f.plazo === 1 ? 'día' : 'días'}`, orden: true, ancho: 8 },
    { k: 'vence', t: 'Vencimiento', v: (f) => fmtDate(f.vencimiento), soloExport: true, ancho: 12 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crew ?? 'Sin asignar', orden: true, ancho: 16 },
    { k: 'sector', t: 'Sector', v: (f) => f.sector ?? '—', soloExport: true, ancho: 9 },
    { k: 'prog', t: 'Progresiva', v: (f) => (f.prog_inicio != null ? `${fmtProgresiva(f.prog_inicio)}${f.prog_fin != null ? ' – ' + fmtProgresiva(f.prog_fin) : ''}` : '—'), soloExport: true, ancho: 18 },
    { k: 'actividad', t: 'Actividad', v: (f) => truncate(f.actividad ?? f.description ?? '—', 60), soloExport: true, ancho: 30 },
    { k: 'ejecucion', t: 'Ejecución', v: (f) => (f.ejecucion === 'atendido' ? 'Atendido' : 'Sin atención'), orden: true, ancho: 12,
      ver: (f) => <Chip tono={f.ejecucion === 'atendido' ? 'verde' : 'rojo'}>{f.ejecucion === 'atendido' ? 'Atendido' : 'Sin atención'}</Chip> },
    { k: 'evidencia', t: 'Evidencia', v: EVIDENCIA, orden: true, ancho: 18 },
    { k: 'fotos', t: 'Fotos', v: (f) => n(f.fotos), soloExport: true, ancho: 7, alinear: 'center' },
    { k: 'conformidad', t: 'Conformidad', v: (f) => (f.conformidad === 'conforme' ? 'Conforme' : f.conformidad === 'observado' ? 'Observado' : 'Pendiente'), orden: true, ancho: 12,
      ver: (f) => <Chip tono={f.conformidad === 'conforme' ? 'verde' : f.conformidad === 'observado' ? 'rojo' : 'ambar'}>{f.conformidad === 'conforme' ? 'Conforme' : f.conformidad === 'observado' ? 'Observado' : 'Pendiente'}</Chip> },
  ],
  texto: (f) => `${f.item} ${f.pci} ${f.crew ?? ''} ${f.sector ?? ''} ${f.actividad ?? ''} ${f.description ?? ''} ${f.prog_inicio != null ? fmtProgresiva(f.prog_inicio) : ''}`,
  ver: (f) => `/pci/${f.pci_id}/item/${f.item_id}?tab=historial`,
  editar: (f) => `/pci/${f.pci_id}`,
  evidencias: (f) => `/pci/${f.pci_id}/item/${f.item_id}?tab=evidencia`,
  conFotos: (f) => n(f.fotos) > 0,
  fotos: { tipo: 'pci', id: (f) => f.item_id, titulo: (f) => `Ítem ${f.item}`, detalle: (f) => `PCI ${corto(f.pci)} · ${f.plazo} días · ${f.crew ?? 'Sin asignar'} · ${EVIDENCIA(f)}` },
  conCoordenadas: (f) => !!f.con_coordenadas,
}

// ═══ Niveles de servicio (intervenciones por sector y actividad) ═════════
const niveles: Familia = {
  key: 'niveles', label: 'Niveles de servicio', icono: Shield, titulo: 'Reporte de niveles de servicio', buscar: 'Buscar actividad / progresiva...',
  selectores: [
    { k: 'sector', t: 'Sector', icono: MapPinned, valor: (f) => f.sector_code ?? 'Sin sector' },
    { k: 'actividad', t: 'Actividad', icono: ListChecks, valor: (f) => f.activity_name },
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crew_name ?? '—' },
  ],
  estados: [
    ['con', 'Con evidencia', (f) => n(f.evidence_count) > 0], ['sin', 'Sin evidencia', (f) => n(f.evidence_count) === 0],
    ['validado', 'Parte validado', (f) => f.order_status === 'validado'], ['por_validar', 'Parte por validar', (f) => f.order_status === 'enviado'],
  ],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('v_work_entries')
    .select('id, work_order_id, work_date, crew_name, sector_code, activity_code, activity_name, unit_symbol, quantity, prog_start_m, prog_end_m, side, evidence_count, order_status, lat, lng')
    .eq('service_id', c.serviceId).gte('work_date', c.desde).lte('work_date', c.hasta).is('pci_item_id', null)
    .order('work_date', { ascending: false }).order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Intervenciones', tono: 'azul', i: Layers },
    { v: fmtNumber(new Set(fs.map((f) => f.activity_code)).size), t: 'Actividades', tono: 'verde', i: ListChecks },
    { v: fmtNumber(new Set(fs.map((f) => f.sector_code).filter(Boolean)).size), t: 'Sectores', tono: 'ambar', i: MapPinned },
    { v: pct(fs.filter((f) => n(f.evidence_count) > 0).length, fs.length), t: 'Con evidencia', tono: 'verde', i: BarChart3 },
  ],
  columnas: [
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.work_date), orden: true, ancho: 11 },
    { k: 'sector', t: 'Sector', v: (f) => f.sector_code ?? '—', orden: true, ancho: 9 },
    { k: 'codigo', t: 'Código', v: (f) => f.activity_code ?? '—', soloExport: true, ancho: 10 },
    { k: 'actividad', t: 'Actividad', v: (f) => f.activity_name, orden: true, ancho: 34 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crew_name ?? '—', ancho: 16 },
    { k: 'prog', t: 'Progresiva', v: (f) => `${fmtProgresiva(f.prog_start_m)}${f.prog_end_m != null ? ' – ' + fmtProgresiva(f.prog_end_m) : ''}`, ancho: 18 },
    { k: 'lado', t: 'Lado', v: (f) => codigoDeLado(f.side) ?? '—', soloExport: true, ancho: 7 },
    { k: 'metrado', t: 'Metrado', v: (f) => `${fmtNumber(f.quantity, 2)} ${f.unit_symbol ?? ''}`, alinear: 'right', ancho: 12 },
    { k: 'fotos', t: 'Fotos', v: (f) => n(f.evidence_count), alinear: 'center', ancho: 7 },
  ],
  texto: (f) => `${f.activity_code} ${f.activity_name} ${f.crew_name ?? ''} ${f.sector_code ?? ''} ${fmtProgresiva(f.prog_start_m)}`,
  ver: (f) => `/campo/${f.work_order_id}`,
  evidencias: (f) => `/campo/${f.work_order_id}`,
  conFotos: (f) => n(f.evidence_count) > 0,
  fotos: { tipo: 'entrada', id: (f) => f.id, titulo: (f) => `${f.activity_code ?? ''} · ${fmtDate(f.work_date)}`,
    detalle: (f) => `${f.activity_name} · ${f.sector_code ?? 'Sin sector'} · ${fmtProgresiva(f.prog_start_m)} · ${f.crew_name ?? ''}` },
  conCoordenadas: (f) => f.lat != null,
  punto: (f) => (f.lat != null ? [f.lng, f.lat] : null),
}

// ═══ Programación MR ════════════════════════════════════════════════════
const programacion: Familia = {
  key: 'programacion', label: 'Programación', icono: CalendarDays, titulo: 'Reporte de programación MR', buscar: 'Buscar actividad / progresiva...',
  selectores: [
    { k: 'semana', t: 'Semana', icono: CalendarDays, valor: (f) => (f.weekly_plans ? `S${String(f.weekly_plans.week).padStart(2, '0')}-${f.weekly_plans.year}` : '—') },
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crews?.name ?? 'Sin asignar' },
    { k: 'actividad', t: 'Actividad', icono: ListChecks, valor: (f) => f.activities_catalog?.name ?? '—' },
  ],
  estados: Object.entries(PLAN).map(([k, [t]]) => [k, t, (f: any) => f.status === k] as [string, string, (f: any) => boolean]),
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('plan_items')
    .select('id, scheduled_on, status, target_qty, executed_qty, prog_start_m, prog_end_m, lado, pci_item_id, weekly_plans!inner(id, week, year, status), crews(name), activities_catalog(code, name), units(symbol)')
    .eq('service_id', c.serviceId).is('deleted_at', null).gte('scheduled_on', c.desde).lte('scheduled_on', c.hasta)
    .order('scheduled_on').order('id').range(a, b)),
  kpis: (fs) => {
    const vivas = fs.filter((f) => !['cancelado', 'reprogramado'].includes(f.status))
    const hechas = vivas.filter((f) => f.status === 'ejecutado').length
    return [
      { v: fmtNumber(vivas.length), t: 'Programadas', tono: 'azul', i: CalendarDays },
      { v: fmtNumber(hechas), t: 'Ejecutadas', tono: 'verde', i: CheckCircle2 },
      { v: fmtNumber(vivas.length - hechas), t: 'Pendientes', tono: 'rojo', i: Clock },
      { v: pct(hechas, vivas.length), t: 'Avance', tono: 'verde', i: BarChart3 },
    ]
  },
  columnas: [
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.scheduled_on), orden: true, ancho: 11 },
    { k: 'semana', t: 'Semana', v: (f) => (f.weekly_plans ? `S${String(f.weekly_plans.week).padStart(2, '0')}` : '—'), soloExport: true, ancho: 8 },
    { k: 'actividad', t: 'Actividad', v: (f) => (f.pci_item_id ? 'PCI · ' : '') + (f.activities_catalog?.name ?? '—'), orden: true, ancho: 34 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crews?.name ?? 'Sin asignar', orden: true, ancho: 16 },
    { k: 'prog', t: 'Progresiva', v: (f) => (f.prog_start_m != null ? `${fmtProgresiva(f.prog_start_m)}${f.prog_end_m != null ? ' – ' + fmtProgresiva(f.prog_end_m) : ''}` : '—'), ancho: 18 },
    { k: 'programado', t: 'Programado', v: (f) => `${fmtNumber(f.target_qty, 2)} ${f.units?.symbol ?? ''}`, alinear: 'right', ancho: 12 },
    { k: 'ejecutado', t: 'Ejecutado', v: (f) => `${fmtNumber(f.executed_qty, 2)} ${f.units?.symbol ?? ''}`, alinear: 'right', ancho: 12 },
    { k: 'estado', t: 'Estado', v: (f) => PLAN[f.status]?.[0] ?? f.status, orden: true, ancho: 12, ver: (f) => <Chip tono={PLAN[f.status]?.[1] ?? 'gris'}>{PLAN[f.status]?.[0] ?? f.status}</Chip> },
  ],
  texto: (f) => `${f.activities_catalog?.code ?? ''} ${f.activities_catalog?.name ?? ''} ${f.crews?.name ?? ''} ${f.prog_start_m != null ? fmtProgresiva(f.prog_start_m) : ''}`,
  ver: (f) => `/programacion?fecha=${f.scheduled_on}`,
}

// ═══ Diario (partes) ════════════════════════════════════════════════════
const diario: Familia = {
  key: 'diario', label: 'Diario', icono: FileText, titulo: 'Reporte diario', buscar: 'Buscar cuadrilla / fecha...',
  selectores: [{ k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.cuadrilla ?? '—' }],
  estados: Object.entries(PARTE).map(([k, [t]]) => [k, t, (f: any) => f.status === k] as [string, string, (f: any) => boolean]),
  cargar: async (c) => {
    const filas = await fetchAll((a: number, b: number) => c.sb.from('v_work_entries')
      .select('work_order_id, work_date, crew_name, order_status, quantity, evidence_count, lat, lng')
      .eq('service_id', c.serviceId).gte('work_date', c.desde).lte('work_date', c.hasta).order('work_date', { ascending: false }).order('id').range(a, b))
    const partes = new Map<string, any>()
    for (const w of filas as any[]) {
      const p = partes.get(w.work_order_id) ?? { id: w.work_order_id, work_date: w.work_date, cuadrilla: w.crew_name, status: w.order_status, actividades: 0, fotos: 0, coords: false }
      p.actividades += 1
      p.fotos += n(w.evidence_count)
      if (!p.coords && w.lat != null) { p.coords = true; p.lat = w.lat; p.lng = w.lng }
      partes.set(w.work_order_id, p)
    }
    // Los partes sin actividades también existen (se envían en blanco o se observan)
    const { data: vacios } = await c.sb.from('work_orders').select('id, work_date, status, crews(name)')
      .eq('service_id', c.serviceId).is('deleted_at', null).gte('work_date', c.desde).lte('work_date', c.hasta)
    for (const o of (vacios ?? []) as any[]) if (!partes.has(o.id)) partes.set(o.id, { id: o.id, work_date: o.work_date, cuadrilla: o.crews?.name, status: o.status, actividades: 0, fotos: 0, coords: false })
    return [...partes.values()].sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))
  },
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Partes', tono: 'azul', i: FileText },
    { v: fmtNumber(fs.filter((f) => f.status === 'validado').length), t: 'Validados', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => f.status === 'enviado').length), t: 'Por validar', tono: 'ambar', i: Clock },
    { v: fmtNumber(fs.filter((f) => f.status === 'observado').length), t: 'Observados', tono: 'rojo', i: XCircle },
  ],
  columnas: [
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.work_date), orden: true, ancho: 12 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.cuadrilla ?? '—', orden: true, ancho: 22 },
    { k: 'actividades', t: 'Actividades', v: (f) => f.actividades, alinear: 'center', orden: true, ancho: 11 },
    { k: 'fotos', t: 'Fotos', v: (f) => f.fotos, alinear: 'center', orden: true, ancho: 9 },
    { k: 'estado', t: 'Estado', v: (f) => PARTE[f.status]?.[0] ?? f.status, orden: true, ancho: 13, ver: (f) => <Chip tono={PARTE[f.status]?.[1] ?? 'gris'}>{PARTE[f.status]?.[0] ?? f.status}</Chip> },
  ],
  texto: (f) => `${f.cuadrilla ?? ''} ${fmtDate(f.work_date)} ${f.work_date}`,
  ver: (f) => `/campo/${f.id}`,
  evidencias: (f) => `/campo/${f.id}`,
  conFotos: (f) => f.fotos > 0,
  fotos: { tipo: 'parte', id: (f) => f.id, titulo: (f) => `${fmtDate(f.work_date)} · ${f.cuadrilla ?? ''}`, detalle: (f) => `${f.actividades} actividades · ${PARTE[f.status]?.[0] ?? f.status}` },
  conCoordenadas: (f) => f.coords,
  punto: (f) => (f.coords ? [f.lng, f.lat] : null),
}

// ═══ SSOMA ══════════════════════════════════════════════════════════════
const TIPO_SSOMA = (t: string) => TIPOS_INSPECCION[t]?.t ?? t
const ssoma: Familia = {
  key: 'ssoma', label: 'SSOMA', icono: HardHat, titulo: 'Reporte SSOMA', buscar: 'Buscar código / objeto...',
  selectores: [
    { k: 'tipo', t: 'Tipo', icono: ListChecks, valor: (f) => f.tipo, nombre: TIPO_SSOMA },
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crew_name ?? '—' },
    { k: 'vigencia', t: 'Vigencia', icono: Clock, valor: (f) => f.vigencia ?? '—' },
    { k: 'revision', t: 'Última revisión', icono: CheckCircle2, valor: (f) => f.ultima_revision ?? 'Sin revisar' },
    { k: 'responsable', t: 'Responsable', icono: Search, valor: (f) => f.inspector_nombre ?? '—' },
  ],
  estados: [
    ['abiertos', 'Con hallazgos abiertos', (f) => n(f.hallazgos_abiertos) > 0], ['sin', 'Sin hallazgos abiertos', (f) => n(f.hallazgos_abiertos) === 0],
    ['apto', 'Apto', (f) => f.aptitud === 'apto'], ['no_apto', 'No apto', (f) => f.aptitud === 'no_apto'],
  ],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('v_ssoma_inspecciones')
    .select('id, codigo, tipo, fecha, objeto, crew_name, inspector_nombre, estado_mecanico, aptitud, vigencia, ultima_revision, hallazgos, hallazgos_abiertos')
    .eq('service_id', c.serviceId).gte('fecha', c.desde).lte('fecha', c.hasta).order('fecha', { ascending: false }).order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Inspecciones', tono: 'azul', i: ListChecks },
    { v: fmtNumber(fs.filter((f) => f.ultima_revision === 'conforme').length), t: 'Conformes', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => f.ultima_revision === 'observado' || f.ultima_revision === 'observada').length), t: 'Observadas', tono: 'ambar', i: AlertTriangle },
    { v: fmtNumber(fs.reduce((s, f) => s + n(f.hallazgos_abiertos), 0)), t: 'Hallazgos abiertos', tono: 'rojo', i: XCircle },
  ],
  columnas: [
    { k: 'codigo', t: 'Código', v: (f) => f.codigo, orden: true, ancho: 11 },
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.fecha), orden: true, ancho: 11 },
    { k: 'tipo', t: 'Tipo', v: (f) => TIPO_SSOMA(f.tipo), orden: true, ancho: 12 },
    { k: 'objeto', t: 'Objeto', v: (f) => f.objeto ?? '—', ancho: 24 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crew_name ?? '—', ancho: 14 },
    { k: 'responsable', t: 'Responsable', v: (f) => f.inspector_nombre ?? '—', soloExport: true, ancho: 20 },
    { k: 'vigencia', t: 'Vigencia', v: (f) => f.vigencia ?? '—', ancho: 11 },
    { k: 'revision', t: 'Última revisión', v: (f) => f.ultima_revision ?? 'Sin revisar', ancho: 13 },
    { k: 'hallazgos', t: 'Hallazgos', v: (f) => `${n(f.hallazgos_abiertos)} / ${n(f.hallazgos)}`, alinear: 'center', ancho: 10,
      ver: (f) => <Chip tono={n(f.hallazgos_abiertos) ? 'rojo' : 'verde'}>{n(f.hallazgos_abiertos)} abiertos</Chip> },
  ],
  texto: (f) => `${f.codigo} ${f.objeto ?? ''} ${f.crew_name ?? ''} ${f.inspector_nombre ?? ''}`,
  ver: (f) => `/ssoma/inspecciones/${f.id}`,
}

// ═══ Caja (interna: nunca para COVINCA) ═════════════════════════════════
const caja: Familia = {
  key: 'caja', label: 'Caja', icono: Wallet, titulo: 'Reporte de caja', buscar: 'Buscar concepto / proveedor...',
  selectores: [
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crew_name ?? 'Caja del contrato' },
    { k: 'tipo', t: 'Tipo', icono: Wallet, valor: (f) => f.kind, nombre: (v) => MOV[v] ?? v },
    { k: 'categoria', t: 'Categoría', icono: Package, valor: (f) => f.category ?? '—' },
  ],
  estados: Object.entries(CAJA).map(([k, [t]]) => [k, t, (f: any) => f.status === k] as [string, string, (f: any) => boolean]),
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('v_cash_movements').select('*')
    .eq('service_id', c.serviceId).gte('occurred_on', c.desde).lte('occurred_on', c.hasta).order('occurred_on', { ascending: false }).order('id').range(a, b)),
  kpis: (fs) => {
    const vivos = fs.filter((f) => f.status !== 'anulado')
    const ing = vivos.filter((f) => n(f.signed_amount) > 0).reduce((s, f) => s + n(f.signed_amount), 0)
    const egr = vivos.filter((f) => n(f.signed_amount) < 0).reduce((s, f) => s - n(f.signed_amount), 0)
    return [
      { v: fmtNumber(fs.length), t: 'Movimientos', tono: 'azul', i: Wallet },
      { v: `S/ ${fmtNumber(ing, 2)}`, t: 'Ingresos', tono: 'verde', i: CheckCircle2 },
      { v: `S/ ${fmtNumber(egr, 2)}`, t: 'Egresos', tono: 'rojo', i: XCircle },
      { v: `S/ ${fmtNumber(ing - egr, 2)}`, t: 'Saldo del período', tono: 'verde', i: BarChart3 },
    ]
  },
  columnas: [
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.occurred_on), orden: true, ancho: 11 },
    { k: 'caja', t: 'Caja', v: (f) => f.box_code ?? '—', soloExport: true, ancho: 12 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crew_name ?? 'Caja del contrato', orden: true, ancho: 16 },
    { k: 'tipo', t: 'Tipo', v: (f) => MOV[f.kind] ?? f.kind, ancho: 11 },
    { k: 'categoria', t: 'Categoría', v: (f) => f.category ?? '—', ancho: 14 },
    { k: 'concepto', t: 'Concepto', v: (f) => truncate(f.description ?? '—', 70), ancho: 32 },
    { k: 'comprobante', t: 'Comprobante', v: (f) => [f.receipt_kind, f.receipt_number].filter(Boolean).join(' ') || '—', soloExport: true, ancho: 16 },
    { k: 'importe', t: 'Importe', v: (f) => n(f.signed_amount ?? f.amount), ver: (f) => <span className={n(f.signed_amount) < 0 ? 'text-destructive' : 'text-success'}>S/ {fmtNumber(f.signed_amount, 2)}</span>, alinear: 'right', orden: true, ancho: 12 },
    { k: 'estado', t: 'Estado', v: (f) => CAJA[f.status]?.[0] ?? f.status, ancho: 12, ver: (f) => <Chip tono={CAJA[f.status]?.[1] ?? 'gris'}>{CAJA[f.status]?.[0] ?? f.status}</Chip> },
  ],
  texto: (f) => `${f.description ?? ''} ${f.supplier ?? ''} ${f.crew_name ?? ''} ${f.receipt_number ?? ''}`,
  ver: () => '/caja',
}

// ═══ Auditoría ══════════════════════════════════════════════════════════
const auditoria: Familia = {
  key: 'auditoria', label: 'Auditoría', icono: Search, titulo: 'Reporte de auditoría', buscar: 'Buscar usuario / registro...',
  selectores: [
    { k: 'usuario', t: 'Usuario', icono: Search, valor: (f) => usuarioDeCorreo(f.actor_email) || 'Sistema' },
    { k: 'modulo', t: 'Módulo', icono: Layers, valor: (f) => moduloDeTabla(f.table_name) },
    { k: 'accion', t: 'Acción', icono: ListChecks, valor: (f) => ACCION_BITACORA[f.action] ?? f.action },
  ],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('audit_log')
    .select('id, created_at, actor_email, table_name, action, record_id, motivo, ip_address')
    .eq('service_id', c.serviceId).gte('created_at', `${c.desde}T00:00:00`).lte('created_at', `${c.hasta}T23:59:59`)
    .order('created_at', { ascending: false }).order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Eventos', tono: 'azul', i: Layers },
    { v: fmtNumber(fs.filter((f) => f.action === 'INSERT').length), t: 'Creaciones', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => f.action === 'UPDATE').length), t: 'Modificaciones', tono: 'ambar', i: Gauge },
    { v: fmtNumber(fs.filter((f) => f.action === 'DELETE').length), t: 'Eliminaciones', tono: 'rojo', i: XCircle },
  ],
  columnas: [
    { k: 'fecha', t: 'Fecha y hora', v: (f) => fmtDateTime(f.created_at), orden: true, ancho: 17 },
    { k: 'usuario', t: 'Usuario', v: (f) => usuarioDeCorreo(f.actor_email) || 'Sistema', orden: true, ancho: 18 },
    { k: 'modulo', t: 'Módulo', v: (f) => moduloDeTabla(f.table_name), orden: true, ancho: 22 },
    { k: 'accion', t: 'Acción', v: (f) => ACCION_BITACORA[f.action] ?? f.action, ancho: 13,
      ver: (f) => <Chip tono={f.action === 'INSERT' ? 'verde' : f.action === 'DELETE' ? 'rojo' : 'azul'}>{ACCION_BITACORA[f.action] ?? f.action}</Chip> },
    { k: 'registro', t: 'Registro', v: (f) => String(f.record_id ?? '—').slice(0, 8), ancho: 11 },
    { k: 'motivo', t: 'Motivo', v: (f) => f.motivo ?? '—', ancho: 30 },
  ],
  texto: (f) => `${f.actor_email ?? ''} ${f.table_name} ${moduloDeTabla(f.table_name)} ${f.record_id ?? ''} ${f.motivo ?? ''}`,
  ver: (f) => `/auditoria?evento=${f.id}`,
}

// ═══ Más familias (guía, función 15) ════════════════════════════════════
const OBS: Record<string, [string, Tono]> = { pendiente: ['Pendiente', 'ambar'], programada: ['Programada', 'azul'], atendida: ['Atendida', 'verde'] }
const observaciones: Familia = {
  key: 'observaciones', label: 'Observaciones', icono: MessageSquareWarning, titulo: 'Reporte de observaciones de campo', extra: true, buscar: 'Buscar descripción / progresiva...',
  selectores: [{ k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crews?.name ?? 'Sin asignar' }],
  estados: Object.entries(OBS).map(([k, [t]]) => [k, t, (f: any) => f.estado === k] as [string, string, (f: any) => boolean]),
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('observaciones_campo')
    .select('id, numero, observado_on, descripcion, estado, progresiva_m, progresiva_fin_m, side, metrado, programada_on, atendida_at, lat, lng, crews(name), activities_catalog(name)')
    .eq('service_id', c.serviceId).is('deleted_at', null).gte('observado_on', c.desde).lte('observado_on', c.hasta).order('observado_on', { ascending: false }).order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Observaciones', tono: 'azul', i: MessageSquareWarning },
    { v: fmtNumber(fs.filter((f) => f.estado === 'atendida').length), t: 'Atendidas', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => f.estado === 'programada').length), t: 'Programadas', tono: 'ambar', i: CalendarDays },
    { v: fmtNumber(fs.filter((f) => f.estado === 'pendiente').length), t: 'Pendientes', tono: 'rojo', i: Clock },
  ],
  columnas: [
    { k: 'numero', t: 'N.º', v: (f) => n(f.numero), orden: true, ancho: 7 },
    { k: 'fecha', t: 'Fecha', v: (f) => fmtDate(f.observado_on), orden: true, ancho: 11 },
    { k: 'descripcion', t: 'Descripción', v: (f) => truncate(f.descripcion ?? '—', 80), ancho: 36 },
    { k: 'actividad', t: 'Actividad', v: (f) => f.activities_catalog?.name ?? '—', ancho: 24 },
    { k: 'prog', t: 'Progresiva', v: (f) => (f.progresiva_m != null ? fmtProgresiva(f.progresiva_m) : '—'), ancho: 12 },
    { k: 'crew', t: 'Responsable', v: (f) => f.crews?.name ?? 'Sin asignar', ancho: 16 },
    { k: 'estado', t: 'Estado', v: (f) => OBS[f.estado]?.[0] ?? f.estado, ancho: 12, ver: (f) => <Chip tono={OBS[f.estado]?.[1] ?? 'gris'}>{OBS[f.estado]?.[0] ?? f.estado}</Chip> },
  ],
  texto: (f) => `${f.numero} ${f.descripcion ?? ''} ${f.crews?.name ?? ''} ${f.progresiva_m != null ? fmtProgresiva(f.progresiva_m) : ''}`,
  ver: () => '/observaciones',
  conCoordenadas: (f) => f.lat != null,
  punto: (f) => (f.lat != null ? [f.lng, f.lat] : null),
}
const inventario: Familia = {
  key: 'inventario', label: 'Inventario', icono: MapPinned, titulo: 'Inventario vial georreferenciado', extra: true, buscar: 'Buscar código / elemento...',
  sinFechas: true,
  selectores: [
    { k: 'tipo', t: 'Tipo', icono: Layers, valor: (f) => f.type_name ?? '—' },
    { k: 'tramo', t: 'Tramo', icono: MapPinned, valor: (f) => f.section_name ?? '—' },
    { k: 'estado', t: 'Condición', icono: Gauge, valor: (f) => f.condition ?? '—' },
  ],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('v_road_assets')
    .select('id, code, type_name, name, section_name, progresiva_txt, progresiva_m, side, condition, last_inspected_on, lat, lng')
    .eq('service_id', c.serviceId).order('section_name').order('progresiva_m').order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Elementos', tono: 'azul', i: MapPinned },
    { v: fmtNumber(fs.filter((f) => f.condition === 'bueno').length), t: 'En buen estado', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => f.condition === 'regular').length), t: 'Regulares', tono: 'ambar', i: AlertTriangle },
    { v: fmtNumber(fs.filter((f) => f.condition === 'malo' || f.condition === 'critico').length), t: 'Malos o críticos', tono: 'rojo', i: XCircle },
  ],
  columnas: [
    { k: 'codigo', t: 'Código', v: (f) => f.code, orden: true, ancho: 14 },
    { k: 'tipo', t: 'Tipo', v: (f) => f.type_name ?? '—', orden: true, ancho: 20 },
    { k: 'nombre', t: 'Elemento', v: (f) => f.name ?? '—', ancho: 24 },
    { k: 'tramo', t: 'Tramo', v: (f) => f.section_name ?? '—', ancho: 18 },
    { k: 'prog', t: 'Progresiva', v: (f) => f.progresiva_txt ?? '—', ancho: 12 },
    { k: 'lado', t: 'Lado', v: (f) => codigoDeLado(f.side) ?? '—', ancho: 7 },
    { k: 'estado', t: 'Condición', v: (f) => f.condition ?? '—', ancho: 11 },
    { k: 'inspeccion', t: 'Últ. inspección', v: (f) => (f.last_inspected_on ? fmtDate(f.last_inspected_on) : '—'), ancho: 13 },
  ],
  texto: (f) => `${f.code} ${f.type_name ?? ''} ${f.name ?? ''} ${f.progresiva_txt ?? ''}`,
  ver: () => '/inventario',
  conCoordenadas: (f) => f.lat != null,
  punto: (f) => (f.lat != null ? [f.lng, f.lat] : null),
}
const recursos: Familia = {
  key: 'recursos', label: 'Recursos', icono: Truck, titulo: 'Reporte de recursos operativos', extra: true, buscar: 'Buscar placa / código...',
  sinFechas: true,
  selectores: [
    { k: 'clase', t: 'Recurso', icono: Truck, valor: (f) => f.clase },
    { k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.cuadrilla ?? 'Sin asignar' },
    { k: 'estado', t: 'Estado', icono: Gauge, valor: (f) => f.estado ?? '—' },
  ],
  cargar: async (c) => {
    const [v, e] = await Promise.all([
      c.sb.from('vehicles').select('id, code, plate, kind, brand, model, status, soat_expires_on, inspection_expires_on, next_service_on, crews(name)').eq('service_id', c.serviceId).is('deleted_at', null),
      c.sb.from('safety_equipment').select('id, code, kind, brand, description, status, next_check_on, expires_on, crews(name)').eq('service_id', c.serviceId).is('deleted_at', null),
    ])
    return [
      ...((v.data ?? []) as any[]).map((x) => ({ id: x.id, clase: 'Vehículo', codigo: x.plate ?? x.code, descripcion: [x.kind, x.brand, x.model].filter(Boolean).join(' '), cuadrilla: x.crews?.name, estado: x.status,
        vence: x.soat_expires_on, mantenimiento: x.next_service_on })),
      ...((e.data ?? []) as any[]).map((x) => ({ id: x.id, clase: 'Equipo', codigo: x.code, descripcion: [x.kind, x.brand, x.description].filter(Boolean).join(' '), cuadrilla: x.crews?.name, estado: x.status,
        vence: x.expires_on, mantenimiento: x.next_check_on })),
    ]
  },
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Recursos', tono: 'azul', i: Truck },
    { v: fmtNumber(fs.filter((f) => f.clase === 'Vehículo').length), t: 'Vehículos', tono: 'verde', i: Truck },
    { v: fmtNumber(fs.filter((f) => f.clase === 'Equipo').length), t: 'Equipos', tono: 'ambar', i: Gauge },
    { v: fmtNumber(fs.filter((f) => !f.cuadrilla).length), t: 'Sin asignar', tono: 'rojo', i: AlertTriangle },
  ],
  columnas: [
    { k: 'clase', t: 'Recurso', v: (f) => f.clase, orden: true, ancho: 10 },
    { k: 'codigo', t: 'Placa / código', v: (f) => f.codigo ?? '—', orden: true, ancho: 14 },
    { k: 'descripcion', t: 'Descripción', v: (f) => f.descripcion || '—', ancho: 30 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.cuadrilla ?? 'Sin asignar', ancho: 16 },
    { k: 'estado', t: 'Estado', v: (f) => f.estado ?? '—', ancho: 13 },
    { k: 'vence', t: 'Vence (SOAT / equipo)', v: (f) => (f.vence ? fmtDate(f.vence) : '—'), ancho: 14 },
    { k: 'mant', t: 'Próx. mantenimiento', v: (f) => (f.mantenimiento ? fmtDate(f.mantenimiento) : '—'), ancho: 14 },
  ],
  texto: (f) => `${f.codigo ?? ''} ${f.descripcion ?? ''} ${f.cuadrilla ?? ''}`,
  ver: () => '/recursos',
}
const rendimientos: Familia = {
  key: 'rendimientos', label: 'Rendimientos', icono: Gauge, titulo: 'Reporte de rendimientos por jornada', extra: true, buscar: 'Buscar actividad...',
  sinFechas: true,
  selectores: [{ k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crews?.name ?? 'Base del contrato' }],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('rendimientos_jornada')
    .select('id, cantidad, metodo, nota, crews(name), activities_catalog(code, name), units(symbol)')
    .eq('service_id', c.serviceId).is('deleted_at', null).order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Rendimientos', tono: 'azul', i: Gauge },
    { v: fmtNumber(new Set(fs.map((f) => f.activities_catalog?.code)).size), t: 'Actividades', tono: 'verde', i: ListChecks },
    { v: fmtNumber(fs.filter((f) => f.crews).length), t: 'Por cuadrilla', tono: 'ambar', i: HardHat },
    { v: fmtNumber(fs.filter((f) => !f.crews).length), t: 'Base del contrato', tono: 'azul', i: Layers },
  ],
  columnas: [
    { k: 'codigo', t: 'Código', v: (f) => f.activities_catalog?.code ?? '—', orden: true, ancho: 10 },
    { k: 'actividad', t: 'Actividad', v: (f) => f.activities_catalog?.name ?? '—', orden: true, ancho: 36 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crews?.name ?? 'Base del contrato', ancho: 18 },
    { k: 'cantidad', t: 'Por jornada', v: (f) => `${fmtNumber(f.cantidad, 2)} ${f.units?.symbol ?? ''}`, alinear: 'right', ancho: 14 },
    { k: 'metodo', t: 'Método', v: (f) => f.metodo ?? '—', ancho: 14 },
  ],
  texto: (f) => `${f.activities_catalog?.code ?? ''} ${f.activities_catalog?.name ?? ''} ${f.crews?.name ?? ''}`,
  ver: () => '/gestion/catalogos',
}
const materiales: Familia = {
  key: 'materiales', label: 'Materiales', icono: Package, titulo: 'Materiales e insumos', extra: true, buscar: 'Buscar código / motivo...',
  selectores: [{ k: 'crew', t: 'Cuadrilla', icono: HardHat, valor: (f) => f.crew_name ?? '—' }, { k: 'estado', t: 'Estado', icono: Gauge, valor: (f) => f.status }],
  cargar: async (c) => fetchAll((a: number, b: number) => c.sb.from('v_supply_requests').select('*')
    .eq('service_id', c.serviceId).gte('needed_on', c.desde).lte('needed_on', c.hasta).order('needed_on').order('id').range(a, b)),
  kpis: (fs) => [
    { v: fmtNumber(fs.length), t: 'Solicitudes', tono: 'azul', i: Package },
    { v: fmtNumber(fs.filter((f) => f.status === 'entregado').length), t: 'Entregadas', tono: 'verde', i: CheckCircle2 },
    { v: fmtNumber(fs.filter((f) => ['solicitado', 'aprobado_residente', 'aprobado', 'parcial'].includes(f.status)).length), t: 'En curso', tono: 'ambar', i: Clock },
    { v: fmtNumber(fs.reduce((s, f) => s + n(f.item_count), 0)), t: 'Ítems', tono: 'azul', i: ListChecks },
  ],
  columnas: [
    { k: 'fecha', t: 'Necesario para', v: (f) => (f.needed_on ? fmtDate(f.needed_on) : '—'), orden: true, ancho: 13 },
    { k: 'codigo', t: 'Código', v: (f) => f.code ?? '—', ancho: 14 },
    { k: 'crew', t: 'Cuadrilla', v: (f) => f.crew_name ?? '—', ancho: 18 },
    { k: 'items', t: 'Ítems', v: (f) => n(f.item_count), alinear: 'center', ancho: 8 },
    { k: 'motivo', t: 'Motivo', v: (f) => truncate(f.reason ?? '—', 80), ancho: 36 },
    { k: 'estado', t: 'Estado', v: (f) => f.status, ancho: 12 },
  ],
  texto: (f) => `${f.code ?? ''} ${f.reason ?? ''} ${f.crew_name ?? ''}`,
  ver: () => '/materiales',
}

export const FAMILIAS: Familia[] = [pci, niveles, programacion, diario, ssoma, caja, auditoria, observaciones, inventario, recursos, rendimientos, materiales]
