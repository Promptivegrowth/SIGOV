'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet, Save, RefreshCw, ListChecks, Ruler, Info, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { tablaPdf, tablaXlsx, num, type Tabla } from '@/lib/formato-mrpci'
import { cn, fmtDate, fmtDateTime, fmtProgresiva } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Insumos» (MRPCI_02 y el modelo de requerimiento de recursos).
 *
 * Derivado de la misma semana: pre-cantidad = metrado × rendimiento del
 * catálogo; a requerir = máx(0; pre − stock en cuadrilla); el Supervisor
 * ajusta el «pedido por practicidad» con motivo; remanente = stock + pedido
 * − pre. Guardar el requerimiento es una versión y no modifica existencias
 * ni la constante administrada.
 */
type Linea = Record<string, any>
const CAMPOS_LIBRES = ['almacen', 'fecha_retiro', 'encargado', 'nota_salida', 'nota'] as const

export function InsumosSemana({ plan, crewId, crewNombre, semana, rows, canEdit }: {
  plan: any; crewId: string; crewNombre: string; semana: string; rows: any[]; canEdit: boolean
}) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [lineas, setLineas] = React.useState<Linea[]>([])
  const [sel, setSel] = React.useState(0)
  const [guardando, setGuardando] = React.useState(false)
  const [vista, setVista] = React.useState<'' | 'resumen' | 'planilla'>('')
  const q = useQuery({
    queryKey: ['requerimiento', plan?.id, crewId],
    enabled: !!plan?.id && !!crewId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('requerimiento_calcular' as any, { p_plan: plan.id, p_crew: crewId } as any)
      if (error) throw error
      return data as any
    },
  })
  const generar = React.useCallback((usarGuardado: boolean) => {
    const d = q.data
    if (!d) return
    const previas: Linea[] = usarGuardado ? (d.guardado?.lineas ?? []) : []
    setLineas((d.lineas as Linea[]).map((l) => {
      const p = previas.find((x) => x.activity_id === l.activity_id && x.supply_id === l.supply_id)
      const practica = p ? Number(p.practica) : Number(l.practica)
      return { ...l, sugerido: l.sugerido ?? l.practica, practica, motivo: p?.motivo ?? '', ...Object.fromEntries(CAMPOS_LIBRES.map((k) => [k, p?.[k] ?? ''])) }
    }))
  }, [q.data])
  React.useEffect(() => { generar(true) }, [generar])

  const fijar = (i: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, ...c } : l)))
  const remanente = (l: Linea) => Number(l.stock) + Number(l.practica || 0) - Number(l.pre)
  const ajustada = (l: Linea) => Math.abs(Number(l.practica) - Number(l.sugerido ?? l.requerir)) > 0.0005
  const faltaMotivo = lineas.some((l) => ajustada(l) && !String(l.motivo ?? '').trim())
  const guardar = async () => {
    setGuardando(true)
    const p_lineas = lineas.map((l) => ({ ...l, remanente: Math.round(remanente(l) * 1000) / 1000 }))
    const { data, error } = await sb.rpc('requerimiento_guardar' as any, { p_plan: plan.id, p_crew: crewId, p_lineas, p_nota: null } as any)
    setGuardando(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Requerimiento guardado · versión ${String((data as any).version).padStart(2, '0')}`, { description: 'El pedido no modifica existencias.' })
    qc.invalidateQueries({ queryKey: ['requerimiento', plan.id, crewId] })
  }

  const d = q.data
  const l = lineas[sel]
  const primera = lineas[0]
  const version = d?.guardado ? String(d.guardado.version).padStart(2, '0') : 'sin guardar'
  const meta = `PROYECTO: COVINCA ${new Date().getFullYear()} · EMPRESA: GRUPO SERVICON V&D E.I.R.L. · CUADRILLA: ${crewNombre.toUpperCase()} · SEMANA ${semana} · FECHA: ${fmtDate(new Date())}`
  const misRows = rows.filter((r) => r.crew_id === crewId && r.status !== 'cancelado')
  const porPartida = React.useMemo(() => {
    const m = new Map<string, { partida: string; und: string; lado: Set<string>; de: number | null; a: number | null; total: number; det: any[] }>()
    for (const r of misRows) {
      const k = r.activity_id
      const x = m.get(k) ?? { partida: r.activity_name, und: r.unit_symbol ?? '', lado: new Set<string>(), de: null as number | null, a: null as number | null, total: 0, det: [] as any[] }
      if (r.lado) x.lado.add(r.lado)
      x.de = x.de == null ? r.prog_start_m : Math.min(x.de, r.prog_start_m ?? x.de)
      x.a = x.a == null ? (r.prog_end_m ?? r.prog_start_m) : Math.max(x.a, r.prog_end_m ?? r.prog_start_m ?? x.a)
      x.total += Number(r.target_qty ?? 0); x.det.push(r); m.set(k, x)
    }
    return [...m.values()]
  }, [misRows])

  const tablaReq = (): Tabla => ({
    titulo: 'REQUERIMIENTO DE RECURSOS', meta,
    cabecera: [[
      ...['N°', 'Partida', 'Unid. part.', 'Metrado', 'Unid. rend.', 'Rendi.', 'Recursos (mano de obra, materiales y/o equipos)', 'Unid. recurso', 'MR / PCI / E'].map((t) => ({ t, rs: 2 })),
      { t: 'Materiales', cs: 9 }, { t: 'Nota', rs: 2 },
    ], ['Pre-cantidad a requerir', 'Stock en cuadrilla', 'Cantidad a requerir', 'Cantidad a pedir por practicidad', 'Remanente', 'Almacén de retiro', 'Fecha de retiro', 'Encargado de retiro', 'Nota de salida'].map((t) => ({ t }))],
    filas: lineas.map((x, i) => [String(i + 1).padStart(2, '0'), x.partida, x.unidad_partida, num(x.metrado), x.unidad_rend, num(x.rendimiento, 2), x.recurso, x.unidad_recurso, x.origen,
      num(x.pre), num(x.stock), num(x.requerir), num(x.practica), num(remanente(x)), x.almacen || '—', x.fecha_retiro ? fmtDate(x.fecha_retiro) : '—', x.encargado || 'Por asignar', x.nota_salida || '—',
      [x.motivo, x.nota, x.codigo_recurso ? `Código: ${x.codigo_recurso}` : ''].filter(Boolean).join(' · ')]),
    resaltadas: { 12: 'DCE6F1' }, anchos: [16, 70, 24, 30, 28, 26, 90, 24, 22, 32, 30, 30, 34, 28, 34, 30, 40, 30, 70],
  })
  const tablaResumen = (): Tabla => ({
    titulo: 'RESUMEN DE METRADO', meta,
    cabecera: [['N°', 'Partida', 'Prog. inicial [km]', 'Prog. final [km]', 'Lado', 'Unidad', 'Total'].map((t) => ({ t }))],
    filas: porPartida.map((p, i) => [`MR ${i + 1}`, p.partida, p.de != null ? fmtProgresiva(p.de) : '', p.a != null ? fmtProgresiva(p.a) : '', [...p.lado].join('/'), p.und, num(p.total)]),
  })
  const tablaPlanilla = (): Tabla => ({
    titulo: 'PLANILLA DE METRADO', meta,
    cabecera: [['N°', 'Partida', 'Prog. inicial [km]', 'Prog. final [km]', 'Lado', 'Unid.', 'Fecha', 'Total'].map((t) => ({ t }))],
    filas: porPartida.flatMap((p, i) => [
      [`MR ${i + 1}`, p.partida, '', '', '', p.und, '', num(p.total)],
      ...p.det.map((r: any, k: number) => [`${i + 1}.${k + 1}`, '', fmtProgresiva(r.prog_start_m), r.prog_end_m != null ? fmtProgresiva(r.prog_end_m) : '', r.lado ?? '', p.und, fmtDate(r.scheduled_on), num(Number(r.target_qty))]),
    ]),
  })
  const nombre = `Requerimiento_semana_${semana}_${crewNombre.replace(/\W+/g, '_')}`

  if (!crewId) return <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Elige una cuadrilla en el filtro: el requerimiento es por cuadrilla.</CardContent></Card>
  if (!plan) return <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Esta semana aún no tiene programación.</CardContent></Card>
  if (q.isLoading) return <SkeletonList rows={5} />
  if (q.error) return <p className="text-destructive text-[13px]">{mensajeAmigable(q.error)}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[12.5px]">Derivado de la programación semanal · Semana {semana} · versión {version} · {crewNombre}.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!lineas.length} onClick={() => tablaPdf(nombre, [tablaReq(), tablaResumen(), tablaPlanilla()])}><FileDown className="size-4" />PDF</Button>
          <Button size="sm" variant="outline" disabled={!lineas.length} onClick={() => tablaXlsx(nombre, [{ ...tablaReq(), hoja: 'Requerimiento' }, { ...tablaResumen(), hoja: 'Resumen de metrado' }, { ...tablaPlanilla(), hoja: 'Planilla de metrado' }])}><FileSpreadsheet className="size-4" />Excel</Button>
          {canEdit && <Button size="sm" onClick={guardar} loading={guardando} disabled={!lineas.length || faltaMotivo}><Save className="size-4" />Guardar requerimiento</Button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['ACTIVIDAD ORIGEN', primera ? `${num(primera.metrado)} ${primera.unidad_partida ?? ''}` : '—', primera?.partida ?? 'Sin partidas con rendimiento'],
          ['CATÁLOGO BASE', `${d?.catalogo?.rendimientos ?? 0} rendimientos`, `Administración · vigente al cálculo${d?.catalogo?.actualizado ? ` (${fmtDate(d.catalogo.actualizado)})` : ''}`],
          ['ESTADO', d?.guardado ? `Guardado v${version}` : 'Borrador', 'Aún no modifica existencias'],
        ].map(([e, v, s]) => (
          <div key={e} className="bg-card rounded-xl border border-border px-4 py-3">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide">{e}</p>
            <p className="mt-1 text-xl font-bold">{v}</p><p className="text-muted-foreground truncate text-[11px]">{s}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-[14px]">Requerimiento de insumos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setVista('resumen')}><ListChecks className="size-4" />Resumen de metrado</Button>
            <Button size="sm" variant="outline" onClick={() => setVista('planilla')}><Ruler className="size-4" />Planilla de metrado</Button>
            <Button size="sm" onClick={() => { q.refetch().then(() => generar(false)) }}><RefreshCw className="size-4" />Generar desde Semana</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <p className="bg-[#17365D] py-1.5 text-center text-[12.5px] font-bold text-white">REQUERIMIENTO DE RECURSOS</p>
          <p className="px-3 py-1.5 text-[11px] font-bold text-[#17365D]">{meta}</p>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-[11px]">
              <thead className="bg-[#17365D] text-white"><tr>
                {['N°', 'Partida', 'Unid. part.', 'Metrado', 'Unid. rend.', 'Rendi.', 'Recursos (mano de obra, materiales y/o equipos)', 'Unid. recurso', 'MR / PCI / E', 'Pre-cantidad a requerir', 'Stock en cuadrilla', 'Cantidad a requerir', 'Cantidad a pedir por practicidad', 'Remanente', 'Almacén de retiro', 'Fecha de retiro', 'Encargado de retiro', 'Nota de salida', 'Nota'].map((t) => (
                  <th key={t} className={cn('border border-[#9FB4CD] px-1.5 py-1 font-bold', t.includes('practicidad') && 'bg-[#DCE6F1] text-[#17365D]')}>{t}</th>
                ))}
              </tr></thead>
              <tbody>
                {lineas.length === 0 && <tr><td colSpan={19} className="text-muted-foreground px-3 py-6 text-center">La semana de esta cuadrilla no tiene partidas con rendimiento en el catálogo.</td></tr>}
                {lineas.map((x, i) => (
                  <tr key={i} onClick={() => setSel(i)} className={cn('cursor-pointer text-center', sel === i ? 'bg-[#DCE6F1]/70' : 'hover:bg-secondary/60')}>
                    <td className="border border-[#C9D6E5] px-1">{String(i + 1).padStart(2, '0')}</td>
                    <td className="border border-[#C9D6E5] px-1 text-left">{x.partida}</td>
                    <td className="border border-[#C9D6E5] px-1">{x.unidad_partida}</td>
                    <td className="border border-[#C9D6E5] px-1 tabular-nums">{num(x.metrado)}</td>
                    <td className="border border-[#C9D6E5] px-1">{x.unidad_rend}</td>
                    <td className="border border-[#C9D6E5] px-1 tabular-nums">{num(x.rendimiento, 2)}</td>
                    <td className="border border-[#C9D6E5] px-1 text-left">{x.recurso}</td>
                    <td className="border border-[#C9D6E5] px-1">{x.unidad_recurso}</td>
                    <td className="border border-[#C9D6E5] px-1">{x.origen}</td>
                    <td className="border border-[#C9D6E5] px-1 tabular-nums">{num(x.pre)}</td>
                    <td className="border border-[#C9D6E5] px-1 text-destructive tabular-nums">{num(x.stock)}</td>
                    <td className="border border-[#C9D6E5] px-1 tabular-nums">{num(x.requerir)}</td>
                    <td className="border border-[#C9D6E5] bg-[#DCE6F1]/60 px-1 font-bold tabular-nums">{num(x.practica)}</td>
                    <td className="border border-[#C9D6E5] px-1 tabular-nums">{num(remanente(x))}</td>
                    {CAMPOS_LIBRES.map((k) => (
                      <td key={k} className="border border-[#C9D6E5] px-0.5" onClick={(e) => e.stopPropagation()}>
                        <input type={k === 'fecha_retiro' ? 'date' : 'text'} disabled={!canEdit} value={x[k] ?? ''} onChange={(e) => fijar(i, { [k]: e.target.value })}
                          className="text-info w-24 bg-transparent px-1 text-center outline-none" placeholder={k === 'encargado' ? 'Por asignar' : '—'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(d?.sin_rendimiento ?? []).length > 0 && (
            <p className="text-warning flex items-start gap-2 px-3 py-2 text-[12px]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Sin rendimiento en el catálogo (no generan insumos): {(d.sin_rendimiento as any[]).map((s) => `${s.codigo} · ${s.partida}`).join('; ')}.</p>
          )}
        </CardContent>
      </Card>

      {l && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Ajuste del supervisor · {l.recurso}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <div className="grid gap-2 sm:grid-cols-5">
                {[['BASE DEL CATÁLOGO', `${num(l.rendimiento, 2)} ${l.unidad_rend}`], ['PRE-CANTIDAD', `${num(l.pre)} ${l.unidad_recurso}`],
                  ['STOCK', `${num(l.stock)} ${l.unidad_recurso}`], ['NECESIDAD NETA', `${num(l.requerir)} ${l.unidad_recurso}`]].map(([e, v]) => (
                  <div key={e}><p className="text-muted-foreground text-[10.5px] font-semibold">{e}</p><p className="bg-secondary/60 mt-0.5 rounded-md px-2 py-1.5">{v}</p></div>
                ))}
                <label><span className="text-muted-foreground text-[10.5px] font-semibold">PEDIDO PRÁCTICO</span>
                  <Input type="number" min={0} step="0.01" disabled={!canEdit} value={l.practica} onChange={(e) => fijar(sel, { practica: e.target.value === '' ? 0 : Number(e.target.value) })} className="border-primary mt-0.5 h-8" /></label>
              </div>
              <label className="block"><span className="text-muted-foreground text-[10.5px] font-semibold">MOTIVO DE AJUSTE{ajustada(l) ? ' *' : ''}</span>
                <Input disabled={!canEdit} value={l.motivo ?? ''} onChange={(e) => fijar(sel, { motivo: e.target.value })} placeholder="Presentación de despacho y margen operativo" className="mt-0.5 h-8" /></label>
              <p className="text-muted-foreground">El ajuste se registra en esta versión y no modifica la constante administrada.</p>
              {faltaMotivo && <p className="text-warning text-[12px]">Hay pedidos ajustados (distintos del redondeo sugerido) sin motivo: complétalos para guardar.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Resultado previsto</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <p>{num(l.stock)} de stock + {num(l.practica)} de pedido − {num(l.pre)} de consumo previsto = <strong>{num(remanente(l))} {l.unidad_recurso}</strong> de remanente.</p>
              <p className="bg-warning/12 text-warning flex items-center gap-2 rounded-md px-3 py-2"><Info className="size-4" />El pedido no modifica existencias.</p>
              {d?.guardado && <p className="text-muted-foreground text-[11.5px]">Última versión: v{version} · {d.guardado.quien ?? '—'} · {fmtDateTime(d.guardado.cuando)}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!vista} onOpenChange={(v) => !v && setVista('')}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{vista === 'resumen' ? 'Resumen de metrado' : 'Planilla de metrado'}</DialogTitle>
            <DialogDescription>{crewNombre} · Semana {semana}. Sale de la misma programación; es lo que alimenta el metrado del requerimiento.</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <TablaSimple t={vista === 'resumen' ? tablaResumen() : tablaPlanilla()} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function TablaSimple({ t }: { t: Tabla }) {
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead className="bg-[#17365D] text-white">
        {t.cabecera.map((f, i) => <tr key={i}>{f.map((c, j) => <th key={j} colSpan={c.cs} rowSpan={c.rs} className="border border-[#9FB4CD] px-1.5 py-1">{c.t}</th>)}</tr>)}
      </thead>
      <tbody>
        {t.filas.map((f, i) => <tr key={i} className={cn(String(f[0]).startsWith('MR') && 'bg-[#DCE6F1]/60 font-semibold')}>{f.map((v, j) => <td key={j} className="border border-[#C9D6E5] px-1.5 py-0.5 text-center">{v}</td>)}</tr>)}
        {t.filas.length === 0 && <tr><td colSpan={12} className="text-muted-foreground px-3 py-4 text-center">Sin datos.</td></tr>}
      </tbody>
    </table>
  )
}


