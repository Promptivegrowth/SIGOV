'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { History, Plus, FileDown, FileSpreadsheet, ArrowRight, Info, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ObservacionesPorProgramar } from '@/components/observaciones/observaciones-por-programar'
import { tablaPdf, tablaXlsx, num, type Celda, type Tabla } from '@/lib/formato-mrpci'
import { cn, fmtDate, fmtDateTime, fmtProgresiva, addDays, toISODate } from '@/lib/utils'

/**
 * «Grilla semanal editable» (MRPCI_01 y el modelo de programación semanal).
 *
 * Una fila por partida —no una por día—: N°, código, ST, PCI, origen,
 * código y descripción de partida, unidad e ítem; por cada día de lunes a
 * sábado Lado · Metrado · Progresiva De/A, y el Total (metrado sumado de
 * esa misma partida y unidad; De la menor, A la mayor). Nunca se suman
 * unidades distintas: cada fila es una partida con su unidad. Las
 * progresivas de cada día conservan sus tramos; el rango total no
 * representa continuidad.
 */
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export interface LineaSemana {
  clave: string; n: number; codigo: string; st: string; pci: string; origen: string; codPartida: string; descripcion: string
  und: string; item: string; crew: string; dias: ({ id: string; lado: string; metrado: number; de: number | null; a: number | null; row: any } | null)[]
  total: number; de: number | null; a: number | null; ids: string[]
}

export function agruparSemana(rows: any[], monday: Date): { lineas: LineaSemana[]; domingo: number } {
  const lunes = toISODate(monday)
  const dia = (f: string) => Math.round((new Date(f + 'T12:00:00Z').getTime() - new Date(lunes + 'T12:00:00Z').getTime()) / 86400000)
  const orden = [...rows].filter((r) => r.status !== 'cancelado').sort((a, b) =>
    (a.origen === 'PCI' ? 0 : 1) - (b.origen === 'PCI' ? 0 : 1) || String(a.pci_item_pci_code ?? '').localeCompare(String(b.pci_item_pci_code ?? ''))
    || a.scheduled_on.localeCompare(b.scheduled_on) || String(a.activity_code).localeCompare(String(b.activity_code)))
  const lineas: LineaSemana[] = []
  let domingo = 0
  for (const r of orden) {
    const d = dia(r.scheduled_on)
    if (d < 0 || d > 5) { domingo++; continue }
    const clave = [r.activity_id, r.pci_item_id ?? 'mr', r.crew_id ?? '', r.section_id ?? '', r.origen ?? 'MR'].join('|')
    let l = lineas.find((x) => x.clave === clave && !x.dias[d])
    if (!l) {
      l = {
        clave, n: 0, codigo: r.activity_code ?? '', st: r.section_code ?? '', pci: r.pci_item_pci_code ? String(r.pci_item_pci_code).replace(/^PCI-\d{4}-0*/, '') : '—',
        origen: r.origen ?? 'MR', codPartida: r.activity_numero != null ? String(r.activity_numero) : '—', descripcion: r.activity_name ?? '',
        und: r.unit_symbol ?? '', item: r.pci_item_number != null ? String(r.pci_item_number) : '—', crew: r.crew_name ?? '',
        dias: [null, null, null, null, null, null], total: 0, de: null, a: null, ids: [],
      }
      lineas.push(l)
    }
    l.dias[d] = { id: r.id, lado: r.lado ?? '', metrado: Number(r.target_qty ?? 0), de: r.prog_start_m, a: r.prog_end_m, row: r }
    l.total += Number(r.target_qty ?? 0)
    if (r.prog_start_m != null) l.de = l.de == null ? r.prog_start_m : Math.min(l.de, r.prog_start_m)
    const fin = r.prog_end_m ?? r.prog_start_m
    if (fin != null) l.a = l.a == null ? fin : Math.max(l.a, fin)
    l.ids.push(r.id)
  }
  lineas.forEach((l, i) => { l.n = i + 1 })
  return { lineas, domingo }
}

export function tablaSemana(lineas: LineaSemana[], monday: Date, meta: string, semana: string): Tabla {
  const cab: Celda[][] = [
    [...['N°', 'CODIGO', 'ST', 'PCI', 'Origen de Partida', 'Código de Partida', 'Descripción de Partida', 'UND (Unidad de trabajo)', 'ITEM'].map((t) => ({ t, rs: 3 })),
      ...DIAS.map((d, i) => ({ t: `${d} ${String(addDays(monday, i).getDate()).padStart(2, '0')}`, cs: 4 })), { t: 'Total', cs: 3 }],
    [...DIAS.flatMap(() => [{ t: 'Lado', rs: 2 }, { t: 'Metrado', rs: 2, fondo: 'DCE6F1' }, { t: 'Progresiva', cs: 2 }]), { t: 'Metrado', rs: 2 }, { t: 'Progresiva', cs: 2 }],
    [...DIAS.flatMap(() => [{ t: 'De' }, { t: 'A' }]), { t: 'De' }, { t: 'A' }],
  ]
  const filas = lineas.map((l) => [
    String(l.n).padStart(2, '0'), l.codigo, l.st, l.pci, l.origen, l.codPartida, l.descripcion, l.und, l.item,
    ...l.dias.flatMap((d) => d ? [d.lado, num(d.metrado), d.de != null ? fmtProgresiva(d.de) : '', d.a != null ? fmtProgresiva(d.a) : ''] : ['', '', '', '']),
    num(l.total), l.de != null ? fmtProgresiva(l.de) : '', l.a != null ? fmtProgresiva(l.a) : '',
  ])
  const resaltadas: Record<number, string> = {}
  DIAS.forEach((_, i) => { resaltadas[9 + i * 4 + 1] = 'DCE6F1' })
  return {
    titulo: `PROGRAMACIÓN SEMANAL · SEMANA ${semana}`, meta, cabecera: cab, filas, resaltadas,
    anchos: [14, 40, 26, 16, 22, 22, 80, 22, 18, ...DIAS.flatMap(() => [16, 24, 27, 27]), 26, 27, 27],
    pie: ['Totales por metrado y unidad. Las progresivas de cada día conservan sus tramos; el rango total no representa continuidad.'],
  }
}

export function GrillaSemanal({ rows, monday, semana, plan, cuadrilla, canEdit, onEdit, onAgregar, onInsumos, meta }: {
  rows: any[]; monday: Date; semana: string; plan: any; cuadrilla: string; canEdit: boolean
  onEdit: (row: any) => void; onAgregar: () => void; onInsumos: () => void; meta: string
}) {
  const sb = React.useMemo(() => createClient(), [])
  const { lineas, domingo } = React.useMemo(() => agruparSemana(rows, monday), [rows, monday])
  const [sel, setSel] = React.useState<string>('')
  const [historial, setHistorial] = React.useState(false)
  const ids = React.useMemo(() => rows.map((r) => r.id), [rows])
  const vinculos = useQuery({
    queryKey: ['grilla-obs', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out: any[] = []
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await sb.from('v_observaciones_campo').select('id, codigo, plan_item_id').in('plan_item_id', ids.slice(i, i + 150))
        out.push(...(data ?? []))
      }
      return out
    },
  })
  const obsDe = (l: LineaSemana) => (vinculos.data ?? []).filter((o) => l.ids.includes(o.plan_item_id))
  const vinculadas = lineas.filter((l) => obsDe(l).length > 0).length
  const linea = lineas.find((l) => l.clave + l.n === sel) ?? null
  const hist = useQuery({
    queryKey: ['semana-historial', plan?.id],
    enabled: historial && !!plan?.id,
    queryFn: async () => ((await sb.rpc('semana_historial' as any, { p_plan: plan.id } as any)).data ?? []) as any[],
  })
  const estado = !plan ? 'Sin semana' : plan.status === 'publicado' ? (plan.cambios_sin_publicar ? 'Publicada con cambios' : `Publicada v${plan.version_publicada}`) : plan.status === 'borrador' ? 'Borrador' : plan.status
  const nombre = `Programacion_semana_${semana}${cuadrilla ? '_' + cuadrilla.replace(/\W+/g, '_') : ''}`
  const tabla = () => tablaSemana(lineas, monday, meta, semana)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['FILAS DE ACTIVIDAD', String(lineas.length), 'En la selección actual'],
          ['VINCULADAS', String(vinculadas), 'Desde el banco de observaciones'],
          ['ESTADO', estado, plan?.status === 'publicado' ? (plan.cambios_sin_publicar ? 'Hay cambios sin publicar a cuadrilla' : 'Publicado a cuadrilla') : 'No publicado a cuadrilla'],
        ].map(([e, v, d]) => (
          <div key={e} className="bg-card rounded-xl border border-border px-4 py-3">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide">{e}</p>
            <p className="mt-1 text-xl font-bold">{v}</p>
            <p className="text-muted-foreground text-[11px]">{d}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-[14px]">Grilla semanal editable</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => tablaPdf(nombre, [tabla()])} disabled={!lineas.length}><FileDown className="size-4" />PDF</Button>
            <Button size="sm" variant="outline" onClick={() => tablaXlsx(nombre, [{ ...tabla(), hoja: `Semana ${semana}` }])} disabled={!lineas.length}><FileSpreadsheet className="size-4" />Excel</Button>
            <Button size="sm" variant="outline" onClick={() => setHistorial(true)} disabled={!plan}><History className="size-4" />Historial</Button>
            {canEdit && <ObservacionesPorProgramar lunes={toISODate(monday)} />}
            {canEdit && <Button size="sm" onClick={onAgregar}><Plus className="size-4" />Agregar actividad</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <p className="bg-[#17365D] py-1.5 text-center text-[12.5px] font-bold text-white">PROGRAMACIÓN SEMANAL · SEMANA {semana}</p>
          <p className="px-3 py-1.5 text-[11px] font-bold text-[#17365D]">{meta}</p>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-[11px]">
              <thead className="bg-[#17365D] text-white">
                <tr>
                  {['N°', 'CODIGO', 'ST', 'PCI', 'Origen de Partida', 'Código de Partida', 'Descripción de Partida', 'UND (Unidad de trabajo)', 'ITEM'].map((t) => (
                    <th key={t} rowSpan={3} className={cn('border border-[#9FB4CD] px-1.5 py-1 font-bold', t.startsWith('Descripción') && 'min-w-52')}>{t}</th>
                  ))}
                  {DIAS.map((d, i) => <th key={d} colSpan={4} className="border border-[#9FB4CD] px-1 py-1">{d} {String(addDays(monday, i).getDate()).padStart(2, '0')}</th>)}
                  <th colSpan={3} className="border border-[#9FB4CD] px-1 py-1">Total</th>
                </tr>
                <tr>
                  {DIAS.map((d) => (
                    <React.Fragment key={d}>
                      <th rowSpan={2} className="border border-[#9FB4CD] px-1">Lado</th>
                      <th rowSpan={2} className="border border-[#9FB4CD] bg-[#DCE6F1] px-1 text-[#17365D]">Metrado</th>
                      <th colSpan={2} className="border border-[#9FB4CD] px-1">Progresiva</th>
                    </React.Fragment>
                  ))}
                  <th rowSpan={2} className="border border-[#9FB4CD] px-1">Metrado</th>
                  <th colSpan={2} className="border border-[#9FB4CD] px-1">Progresiva</th>
                </tr>
                <tr>
                  {[...DIAS, 'T'].map((d) => (
                    <React.Fragment key={d}><th className="border border-[#9FB4CD] px-1">De</th><th className="border border-[#9FB4CD] px-1">A</th></React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 && <tr><td colSpan={36} className="text-muted-foreground px-3 py-6 text-center">Sin actividades en la selección.</td></tr>}
                {lineas.map((l) => {
                  const activa = sel === l.clave + l.n
                  return (
                    <tr key={l.clave + l.n} onClick={() => setSel(activa ? '' : l.clave + l.n)}
                      className={cn('cursor-pointer text-center', activa ? 'bg-[#DCE6F1]/70' : 'hover:bg-secondary/60')}>
                      <td className="border border-[#C9D6E5] px-1">{String(l.n).padStart(2, '0')}</td>
                      <td className="border border-[#C9D6E5] px-1 whitespace-nowrap">{l.codigo}</td>
                      <td className="border border-[#C9D6E5] px-1">{l.st}</td>
                      <td className={cn('border border-[#C9D6E5] px-1', l.pci !== '—' && 'text-success font-semibold')}>{l.pci}</td>
                      <td className="border border-[#C9D6E5] px-1">{l.origen}</td>
                      <td className="border border-[#C9D6E5] px-1">{l.codPartida}</td>
                      <td className="border border-[#C9D6E5] px-1.5 text-left">{l.descripcion}{obsDe(l).length > 0 && <Link2 className="text-info ml-1 inline size-3" />}</td>
                      <td className="border border-[#C9D6E5] px-1">{l.und}</td>
                      <td className="border border-[#C9D6E5] px-1">{l.item}</td>
                      {l.dias.map((d, i) => (
                        <React.Fragment key={i}>
                          <td className="border border-[#C9D6E5] px-1">{d?.lado}</td>
                          <td className="border border-[#C9D6E5] bg-[#DCE6F1]/50 px-1 tabular-nums">
                            {d ? (canEdit ? <button className="hover:text-primary underline decoration-dotted" onClick={(e) => { e.stopPropagation(); onEdit(d.row) }}>{num(d.metrado)}</button> : num(d.metrado)) : ''}
                          </td>
                          <td className="border border-[#C9D6E5] px-1 whitespace-nowrap">{d?.de != null ? fmtProgresiva(d.de) : ''}</td>
                          <td className="border border-[#C9D6E5] px-1 whitespace-nowrap">{d?.a != null ? fmtProgresiva(d.a) : ''}</td>
                        </React.Fragment>
                      ))}
                      <td className="border border-[#C9D6E5] px-1 font-bold tabular-nums">{num(l.total)}</td>
                      <td className="border border-[#C9D6E5] px-1 whitespace-nowrap">{l.de != null ? fmtProgresiva(l.de) : ''}</td>
                      <td className="border border-[#C9D6E5] px-1 whitespace-nowrap">{l.a != null ? fmtProgresiva(l.a) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground px-3 py-2 text-[11.5px]">
            Totales por metrado y unidad. Las progresivas de cada día conservan sus tramos; el rango total no representa continuidad.
            {domingo > 0 && ` ${domingo} ${domingo === 1 ? 'actividad programada en domingo no entra' : 'actividades programadas en domingo no entran'} en la grilla de lunes a sábado.`}
            {canEdit && ' Pulsa un metrado para editar esa actividad del día.'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Detalle de actividad seleccionada</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-[12.5px]">
            {!linea ? <p className="text-muted-foreground">Elige una fila de la grilla.</p> : (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  {[
                    ['OBSERVACIONES', obsDe(linea).map((o) => o.codigo).join(' y ') || '—'],
                    ['METRADO PREVISTO', `${num(linea.total)} ${linea.und}`],
                    ['DÍAS', DIAS.filter((_, i) => linea.dias[i]).join(' y ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) || '—'],
                    ['CUADRILLA', linea.crew || '—'],
                  ].map(([e, v]) => (
                    <div key={e}><p className="text-muted-foreground text-[10.5px] font-semibold tracking-wide">{e}</p>
                      <p className="bg-secondary/60 mt-0.5 rounded-md px-2 py-1.5 font-medium">{v}</p></div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {linea.dias.map((d, i) => d && (
                    <Button key={i} size="sm" variant="outline" onClick={() => onEdit(d.row)}>{DIAS[i]} · {num(d.metrado)} {linea.und}</Button>
                  ))}
                  {obsDe(linea).map((o) => <Link key={o.id} href={`/observaciones?id=${o.id}`} className="text-primary self-center text-[12px] underline">{o.codigo}</Link>)}
                </div>
                <p className="text-primary text-[12px]">Abrir registro y evidencia originales desde el vínculo de cada fila.</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Paso siguiente</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[12.5px]">
            <p>Los insumos se calculan desde esta misma revisión de la semana.</p>
            <Button onClick={onInsumos}>Ir a Insumos<ArrowRight className="size-4" /></Button>
          </CardContent>
        </Card>
      </div>
      <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]"><Info className="size-4" />
        Para PDF y Excel se conserva la cabecera del modelo, sus grupos por día y el orden de las columnas.</p>

      <Dialog open={historial} onOpenChange={setHistorial}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Historial de la semana {semana}</DialogTitle>
            <DialogDescription>Borradores guardados y versiones publicadas, con lo que cambió entre una y otra.</DialogDescription></DialogHeader>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {(hist.data ?? []).length === 0 && <p className="text-muted-foreground text-[13px]">Aún no hay versiones guardadas.</p>}
            {(hist.data ?? []).map((h: any, k: number) => (
              <li key={k} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={h.tipo === 'publicada' ? 'success' : 'outline'}>{h.tipo === 'publicada' ? `Publicada v${h.version}` : `Borrador sobre v${h.version}`}</Badge>
                  <span>{h.filas} actividades</span>
                  <span className="text-muted-foreground">· {h.quien ?? '—'} · {fmtDateTime(h.cuando)}</span>
                </p>
                <p className="text-muted-foreground mt-0.5">+{h.agregadas} agregadas · −{h.retiradas} retiradas · {h.cambiadas} cambiadas{h.motivo ? ` · ${h.motivo}` : ''}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const metaSemana = (o: { semana: string; cuadrilla?: string; subtramo?: string; fecha: Date; cliente?: string }) =>
  `PROYECTO: COVINCA ${o.fecha.getFullYear()} · CLIENTE: ${o.cliente ?? 'COVINCA S.A.'} · SUBTRAMO: ${o.subtramo || 'TODOS'} · CUADRILLA: ${(o.cuadrilla || 'TODAS').toUpperCase()} · FECHA: ${fmtDate(o.fecha)}`
