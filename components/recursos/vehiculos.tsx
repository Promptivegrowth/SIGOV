'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'
import {
  Truck, CheckCircle2, XCircle, Wrench, Search, Plus, Eye, UserPlus, History, X, MapPin, Gauge, ShieldCheck, Info, AlertTriangle, Ban,
  ArrowLeftRight, CalendarDays, Users, Activity, FileText, Layers, Download, Clock, MoreVertical, Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Kpi } from '@/components/gestion/gestion-nav'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate } from '@/lib/utils'
import { descargarExcel } from '@/lib/reports'

/**
 * Recursos operativos › Vehículos y Asignaciones (ADMIN_Recursos_Asignaciones
 * V2 y SUB_Asignaciones): el estado mecánico y el documental van por
 * separado —operativo mecánico no significa apto para circular—; con SOAT o
 * revisión técnica vencidos el vehículo es «No apto». Las asignaciones de
 * vehículos y equipos en una sola lista: Vigente, Programada, Finalizada.
 */
const hoy = () => toISODate(new Date())
export function aptitud(v: any) {
  const h = hoy()
  if (v.soat_expires_on && v.soat_expires_on < h) return { apto: false, motivo: 'SOAT vencido' }
  if (v.inspection_expires_on && v.inspection_expires_on < h) return { apto: false, motivo: 'Revisión técnica vencida' }
  if (['inoperativo', 'dado_de_baja'].includes(v.status)) return { apto: false, motivo: v.status === 'inoperativo' ? 'Inoperativo' : 'Dado de baja' }
  return { apto: true, motivo: null as string | null }
}
const mecanico = (v: any) => (v.status === 'taller' ? 'taller' : v.status === 'operativo' ? 'operativo' : 'inoperativo')
const estadoV = (v: any) => (v.status === 'taller' ? 'mantenimiento' : aptitud(v).apto ? 'apto' : 'no_apto')
const EST: Record<string, [string, string]> = { apto: ['Apto', 'bg-success/12 text-success'], no_apto: ['No apto', 'bg-destructive/10 text-destructive'], mantenimiento: ['Mantenimiento', 'bg-warning/15 text-warning'] }
const MEC: Record<string, [string, string]> = { operativo: ['● Operativo', 'text-success'], taller: ['🔧 Taller', 'text-info'], inoperativo: ['● Inoperativo', 'text-destructive'] }

function Sel({ i: I, t, v, set, ops, todos = 'Todos' }: { i: any; t: string; v: string; set: (v: string) => void; ops: [string, string][]; todos?: string }) {
  return <label className="bg-card flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px]"><I className="text-muted-foreground size-4" /><span className="font-semibold">{t}:</span>
    <select value={v} onChange={(e) => set(e.target.value)} className="max-w-36 bg-transparent outline-none"><option value="">{todos}</option>{ops.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
}
function Paginar({ total, pagina, setPagina, porPagina, setPorPagina, etiqueta }: { total: number; pagina: number; setPagina: (n: number) => void; porPagina: number; setPorPagina: (n: number) => void; etiqueta: string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[12.5px]">
      <span>Mostrando {Math.min(porPagina, Math.max(0, total - pagina * porPagina))} de {total} {etiqueta}</span>
      <span className="flex items-center gap-2">Filas por página: <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(0) }} className="bg-card rounded-md border border-border px-2 py-0.5">{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select>
        <button disabled={pagina === 0} onClick={() => setPagina(0)} className="px-1 disabled:opacity-40">«</button><button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className="px-1 disabled:opacity-40">‹</button>
        <span className="bg-primary text-primary-foreground rounded-md px-2">{pagina + 1}</span>
        <button disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)} className="px-1 disabled:opacity-40">›</button><button disabled={pagina >= paginas - 1} onClick={() => setPagina(paginas - 1)} className="px-1 disabled:opacity-40">»</button></span>
    </div>
  )
}
function useHistorial(tablas: string[], ids: string[], activo: boolean) {
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['rec-hist', tablas.join(), ids.join()],
    enabled: activo && ids.length > 0,
    queryFn: async () => ((await sb.from('audit_log').select('id, created_at, actor_email, action, motivo, table_name').in('table_name', tablas).in('record_id', ids).order('created_at', { ascending: false }).limit(40)).data ?? []) as any[],
  })
}

// ═══ Vehículos ════════════════════════════════════════════════════════════
export function VehiculosTab({ v, a, c, onEditar, onAsignar }: { v: any[]; a: any[]; c: any[]; onEditar: (x: any) => void; onAsignar: (x: any) => void }) {
  const [f, setF] = React.useState({ q: '', crew: '', mec: '', doc: '', est: '' })
  const [pagina, setPagina] = React.useState(0)
  const [porPagina, setPorPagina] = React.useState(10)
  const [abierto, setAbierto] = React.useState<{ id: string; tab: 'detalle' | 'asignacion' | 'historial' } | null>(null)
  const [menu, setMenu] = React.useState<string | null>(null)
  const crew = (id: string | null) => c.find((x) => x.id === id)
  const filas = v.filter((x) => (!f.crew || x.crew_id === f.crew) && (!f.mec || mecanico(x) === f.mec) && (!f.doc || (aptitud(x).apto ? 'apto' : 'no_apto') === f.doc)
    && (!f.est || estadoV(x) === f.est) && (!f.q || `${x.code ?? ''} ${x.plate ?? ''} ${x.kind ?? ''} ${x.brand ?? ''} ${x.model ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  React.useEffect(() => setPagina(0), [f])
  const visibles = filas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const sel = v.find((x) => x.id === abierto?.id)
  const nFiltros = [f.crew, f.mec, f.doc, f.est].filter(Boolean).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={Truck} valor={fmtNumber(v.length)} etiqueta="Vehículos (total)" tono="azul" />
        <Kpi icono={CheckCircle2} valor={fmtNumber(v.filter((x) => estadoV(x) === 'apto').length)} etiqueta="Aptos para circular" tono="verde" />
        <Kpi icono={XCircle} valor={fmtNumber(v.filter((x) => estadoV(x) === 'no_apto').length)} etiqueta="No apto" tono="rojo" />
        <Kpi icono={Wrench} valor={fmtNumber(v.filter((x) => estadoV(x) === 'mantenimiento').length)} etiqueta="En mantenimiento" tono="ambar" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por placa o recurso (ej. DEM001, camión...)" className="pl-9" /></div>
        <Button onClick={() => onEditar({ status: 'operativo', kind: 'camioneta' })}><Plus className="size-4" />Registrar recurso</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-card rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold">Filtros ({nFiltros})</span>
        <Sel i={Users} t="Cuadrilla" v={f.crew} set={(x) => setF({ ...f, crew: x })} ops={c.map((x) => [x.id, `${x.code} · ${x.name}`])} todos="Todas" />
        <Sel i={Wrench} t="Mecánico" v={f.mec} set={(x) => setF({ ...f, mec: x })} ops={[['operativo', 'Operativo'], ['taller', 'Taller'], ['inoperativo', 'Inoperativo']]} />
        <Sel i={FileText} t="Documental" v={f.doc} set={(x) => setF({ ...f, doc: x })} ops={[['apto', 'Apto'], ['no_apto', 'No apto']]} />
        <Sel i={Activity} t="Estado" v={f.est} set={(x) => setF({ ...f, est: x })} ops={Object.entries(EST).map(([k, [t]]) => [k, t])} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0"><CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
            <thead className="bg-secondary/50 text-left"><tr>{['Recurso / Placa', 'Tipo', 'Base / Cuadrilla', 'Mecánico', 'Documental', 'Estado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 font-semibold">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {visibles.length === 0 && <tr><td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">Sin vehículos con estos filtros.</td></tr>}
              {visibles.map((x) => {
                const ap = aptitud(x)
                const e = EST[estadoV(x)]
                const cr = crew(x.crew_id)
                return (
                  <tr key={x.id} className={cn('hover:bg-secondary/30', abierto?.id === x.id && 'bg-primary/5')}>
                    <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="bg-info/10 text-info grid size-8 place-items-center rounded-md"><Truck className="size-4" /></span>
                      <span><strong>{x.plate ?? x.code}</strong><span className="text-muted-foreground block">{[x.kind, x.brand, x.model].filter(Boolean).join(' ')}</span></span></span></td>
                    <td className="px-3"><span className="bg-secondary rounded-md px-2 py-0.5">Vehículo</span></td>
                    <td className="px-3"><MapPin className="text-muted-foreground mr-1 inline size-3.5" /><strong>{cr?.name?.split('·').pop()?.trim() ?? 'Sin base'}</strong><span className="text-muted-foreground block">{cr ? `Cuadrilla ${cr.code}` : '—'}</span></td>
                    <td className={cn('px-3 font-semibold whitespace-nowrap', MEC[mecanico(x)][1])}>{MEC[mecanico(x)][0]}</td>
                    <td className="px-3 whitespace-nowrap">{ap.apto ? <span className="text-success font-semibold">✓ Apto</span> : <span className="text-destructive font-bold">⊗ NO APTO<span className="block text-[11.5px] font-normal">{ap.motivo}</span></span>}</td>
                    <td className="px-3"><span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', e[1])}>● {e[0]}</span></td>
                    <td className="relative px-3 py-1.5"><div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setAbierto({ id: x.id, tab: 'detalle' })}><Eye className="size-3.5" />Ver ficha</Button>
                      <Button size="sm" variant="outline" onClick={() => onAsignar({ vehicle_id: x.id })}><UserPlus className="size-3.5" />Asignar</Button>
                      <Button size="sm" variant="outline" onClick={() => setAbierto({ id: x.id, tab: 'historial' })}><History className="size-3.5" />Historial</Button>
                      <button onClick={() => setMenu(menu === x.id ? null : x.id)} className="hover:bg-secondary grid size-8 place-items-center rounded-md" aria-label="Más"><MoreVertical className="size-4" /></button>
                    </div>
                      {menu === x.id && (<>
                        <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} aria-label="Cerrar" />
                        <div className="bg-popover absolute right-2 z-20 w-40 rounded-lg border border-border p-1 shadow-lg">
                          <button onClick={() => { setMenu(null); onEditar(x) }} className="hover:bg-secondary flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px]"><Pencil className="size-3.5" />Editar datos</button>
                        </div>
                      </>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <Paginar total={filas.length} pagina={pagina} setPagina={setPagina} porPagina={porPagina} setPorPagina={setPorPagina} etiqueta="vehículos" />
        </CardContent></Card>
        {sel ? <FichaVehiculo v={sel} a={a.filter((x) => x.vehicle_id === sel.id)} c={c} tab={abierto!.tab} setTab={(t) => setAbierto({ id: sel.id, tab: t })} cerrar={() => setAbierto(null)} onAsignar={onAsignar} />
          : <Card className="h-fit"><CardContent className="text-muted-foreground p-8 text-center text-[12.5px]">Elige «Ver ficha» para ver la documentación, la asignación vigente y el historial.</CardContent></Card>}
      </div>
    </div>
  )
}

function FichaVehiculo({ v, a, c, tab, setTab, cerrar, onAsignar }: { v: any; a: any[]; c: any[]; tab: 'detalle' | 'asignacion' | 'historial'; setTab: (t: 'detalle' | 'asignacion' | 'historial') => void; cerrar: () => void; onAsignar: (x: any) => void }) {
  const ap = aptitud(v)
  const h = hoy()
  const cr = c.find((x) => x.id === v.crew_id)
  const ordenadas = [...a].sort((x, y) => String(y.start_on).localeCompare(String(x.start_on)))
  const vigente = ordenadas.find((x) => !x.end_on || x.end_on >= h)
  const anterior = vigente ? ordenadas.find((x) => x.id !== vigente.id && String(x.start_on) <= String(vigente.start_on)) : null
  const hist = useHistorial(['vehicles', 'crew_vehicle_assignments'], [v.id, ...a.map((x) => x.id)], tab === 'historial')
  const doc = (t: string, f: string | null, aviso = 0) => {
    const venc = f && f < h
    const prox = f && !venc && aviso && f <= toISODate(new Date(Date.now() + aviso * 86400000))
    return (
      <p className={cn('flex items-center justify-between rounded-md px-2.5 py-1.5', !f ? 'bg-secondary' : venc ? 'bg-destructive/10 text-destructive' : prox ? 'bg-warning/12 text-warning' : 'bg-success/10 text-success')}>
        <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />{t}</span><strong>{!f ? 'Sin dato' : venc ? `Vencido (${fmtDate(f)})` : `${aviso ? '' : 'Vigente '}(${fmtDate(f)})`}</strong></p>
    )
  }
  return (
    <Card className="h-fit"><CardContent className="space-y-3 p-4 text-[12.5px]">
      <div className="flex items-start gap-2">
        <span className="bg-info/10 text-info grid size-10 place-items-center rounded-lg"><Truck className="size-5" /></span>
        <div className="flex-1"><p className="text-[15px] font-bold">{v.plate ?? v.code}</p><p className="text-muted-foreground">{[v.kind, v.brand, v.model].filter(Boolean).join(' ')}</p></div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', EST[estadoV(v)][1])}>{ap.apto ? '● ' : '⊗ '}{EST[estadoV(v)][0]}</span>
        <button onClick={cerrar} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button>
      </div>
      <div className="bg-secondary flex gap-1 rounded-lg p-1">
        {([['detalle', 'Detalle'], ['asignacion', 'Asignación'], ['historial', 'Historial']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 rounded-md py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{t}</button>
        ))}
      </div>
      {tab === 'detalle' && (<>
        <p className="font-semibold">Información del recurso</p>
        <div className="grid grid-cols-2 gap-2">
          <p><span className="text-muted-foreground block text-[11px]">Placa</span><strong>{v.plate ?? '—'}</strong></p>
          <p><span className="text-muted-foreground block text-[11px]">Tipo</span><strong>Vehículo · {v.kind}</strong></p>
          <p><span className="text-muted-foreground block text-[11px]">Base / Cuadrilla</span><strong>{cr ? `${cr.name} / ${cr.code}` : 'Sin asignar'}</strong></p>
          <p><span className="text-muted-foreground block text-[11px]"><Gauge className="mr-1 inline size-3" />Kilometraje</span><strong>{v.odometer_km != null ? `${fmtNumber(v.odometer_km)} km` : '—'}</strong></p>
          <p><span className="text-muted-foreground block text-[11px]">Mecánico</span><strong className={MEC[mecanico(v)][1]}>{MEC[mecanico(v)][0]}</strong></p>
        </div>
        <p className="font-semibold">Documentación y control</p>
        <div className="space-y-1">{doc('SOAT', v.soat_expires_on)}{doc('Revisión técnica', v.inspection_expires_on)}{doc('Póliza', v.policy_expires_on)}{doc('Próx. mantenimiento', v.next_service_on, 15)}</div>
        <p className="bg-info/8 text-info flex gap-1.5 rounded-lg p-2"><Info className="mt-0.5 size-4 shrink-0" />Operativo mecánico <strong>no significa apto para circular.</strong></p>
        <p className="flex items-center gap-2 font-semibold">Asignación vigente {vigente && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', vigente.start_on > h ? 'bg-warning/15 text-warning' : 'bg-success/12 text-success')}>● {vigente.start_on > h ? 'Programada' : 'Vigente'}</span>}</p>
        {vigente ? (
          <div className="grid grid-cols-2 gap-2">
            <p><span className="text-muted-foreground block text-[11px]"><MapPin className="mr-1 inline size-3" />Origen</span><strong>{anterior?.crews?.name ?? 'Base'}</strong></p>
            <p><span className="text-muted-foreground block text-[11px]"><ArrowLeftRight className="mr-1 inline size-3" />Destino</span><strong>{vigente.crews?.name ?? '—'}</strong></p>
            <p><span className="text-muted-foreground block text-[11px]"><CalendarDays className="mr-1 inline size-3" />Desde</span><strong>{fmtDate(vigente.start_on)}</strong></p>
            <p><span className="text-muted-foreground block text-[11px]"><CalendarDays className="mr-1 inline size-3" />Hasta</span><strong>{vigente.end_on ? fmtDate(vigente.end_on) : 'Sin fecha'}</strong></p>
            <p className="col-span-2"><span className="text-muted-foreground block text-[11px]">Motivo</span><strong>{vigente.reason ?? '—'}</strong></p>
          </div>
        ) : <p className="text-muted-foreground">Sin asignación vigente.</p>}
        {!ap.apto && (<>
          <p className="bg-warning/12 text-warning flex items-center gap-1.5 rounded-lg p-2"><AlertTriangle className="size-4" />Pendiente de habilitación documental</p>
          <p className="bg-destructive/8 text-destructive flex items-center gap-1.5 rounded-lg p-2"><Ban className="size-4" />No permite circular mientras {ap.motivo?.toLowerCase()}.</p>
        </>)}
        <div className="flex gap-2"><Button onClick={() => onAsignar({ vehicle_id: v.id })}>Revisar asignación</Button><Button variant="outline" onClick={() => setTab('historial')}><History className="size-4" />Ver historial</Button></div>
      </>)}
      {tab === 'asignacion' && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ordenadas.map((x) => <li key={x.id} className="p-2"><strong>{x.crews?.name ?? '—'}</strong> · {fmtDate(x.start_on)} – {x.end_on ? fmtDate(x.end_on) : 'vigente'} · {x.kind}<p className="text-muted-foreground">{x.reason}</p></li>)}
          {!ordenadas.length && <li className="text-muted-foreground p-2">Sin asignaciones.</li>}
        </ul>
      )}
      {tab === 'historial' && (
        <ul className="space-y-1.5 border-l-2 border-border pl-3">
          {(hist.data ?? []).map((x) => <li key={x.id}><span className="text-muted-foreground">{fmtDateTime(x.created_at)}</span> · <strong>{x.table_name === 'vehicles' ? (x.action === 'INSERT' ? 'Alta del vehículo' : 'Cambio de datos') : 'Asignación'}</strong> · {(x.actor_email ?? 'Sistema').split('@')[0]}{x.motivo ? ` · ${x.motivo}` : ''}</li>)}
          {!hist.isLoading && !(hist.data ?? []).length && <li className="text-muted-foreground">Sin eventos registrados.</li>}
        </ul>
      )}
    </CardContent></Card>
  )
}

// ═══ Asignaciones (vehículos y equipos) ═══════════════════════════════════
export function AsignacionesTab({ a, c, onNueva }: { a: any[]; c: any[]; onNueva: () => void }) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const eq = useQuery({
    queryKey: ['rec-eq-asig', service.id],
    queryFn: async () => ((await sb.from('equipo_asignaciones' as any).select('*, equipos(codigo, nombre), crews(name, code)').eq('service_id', service.id).order('desde', { ascending: false })).data ?? []) as any[],
  })
  const h = hoy()
  const estado = (desde: string, hasta: string | null) => (hasta && hasta < h ? 'finalizada' : desde > h ? 'programada' : 'vigente')
  const todas = React.useMemo((): any[] => {
    const out: any[] = [
      ...a.map((x) => ({ id: x.id, tabla: 'crew_vehicle_assignments', tipo: 'vehiculo', codigo: x.vehicles?.code ?? x.vehicles?.plate, recurso: x.vehicles?.plate ?? x.vehicles?.code, rid: x.vehicle_id,
        crew_id: x.crew_id, destino: x.crews?.name, desde: x.start_on, hasta: x.end_on, motivo: x.reason, kind: x.kind })),
      ...((eq.data ?? []) as any[]).map((x) => ({ id: x.id, tabla: 'equipo_asignaciones', tipo: 'equipo', codigo: x.equipos?.codigo, recurso: x.equipos?.nombre, rid: x.equipo_id,
        crew_id: x.crew_id, destino: x.crews?.name, desde: x.desde, hasta: x.hasta, motivo: x.motivo, horas: x.horas })),
    ]
    return out.map((x) => {
      const previas = out.filter((y) => y.rid === x.rid && y.id !== x.id && String(y.desde) < String(x.desde)).sort((p, q) => String(q.desde).localeCompare(String(p.desde)))
      const choque = out.some((y) => y.rid === x.rid && y.id !== x.id && y.crew_id !== x.crew_id && String(y.desde) <= String(x.hasta ?? '9999') && String(x.desde) <= String(y.hasta ?? '9999'))
      return { ...x, origen: previas[0]?.destino ?? 'Base', estado: choque ? 'conflicto' : estado(x.desde, x.hasta) }
    })
  }, [a, eq.data, h])
  const [f, setF] = React.useState({ q: '', tipo: '', crew: '', desde: '', est: '' })
  const [pagina, setPagina] = React.useState(0)
  const [porPagina, setPorPagina] = React.useState(10)
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const filas = todas.filter((x) => (!f.tipo || x.tipo === f.tipo) && (!f.crew || x.crew_id === f.crew) && (!f.est || x.estado === f.est) && (!f.desde || String(x.hasta ?? '9999') >= f.desde)
    && (!f.q || `${x.codigo ?? ''} ${x.recurso ?? ''} ${x.destino ?? ''} ${x.origen ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  React.useEffect(() => setPagina(0), [f])
  const visibles = filas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const sel = todas.find((x) => x.id === abierto)
  const hist = useHistorial([sel?.tabla ?? 'crew_vehicle_assignments'], sel ? [sel.id] : [], !!sel)
  const E: Record<string, [string, string, any]> = { vigente: ['Vigente', 'bg-success/12 text-success', CheckCircle2], programada: ['Programada', 'bg-warning/15 text-warning', Clock],
    finalizada: ['Finalizada', 'bg-secondary text-muted-foreground', CheckCircle2], conflicto: ['Conflicto', 'bg-destructive/10 text-destructive', AlertTriangle] }
  const exportar = () => descargarExcel(`Asignaciones_${toISODate(new Date())}`, { titulo: 'Asignaciones de recursos', subtitulo: 'Uso interno SERVICON', servicio: service.name, periodo: `Al ${fmtDate(new Date())}`, generadoPor: profile.full_name },
    [{ name: 'Asignaciones', columns: [{ header: 'Asignación', key: 'codigo', width: 14 }, { header: 'Recurso', key: 'recurso', width: 22 }, { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Origen', key: 'origen', width: 20 }, { header: 'Destino', key: 'destino', width: 20 }, { header: 'Desde', key: 'd', width: 12 }, { header: 'Hasta', key: 'h', width: 12 },
      { header: 'Estado', key: 'e', width: 12 }, { header: 'Motivo', key: 'motivo', width: 30 }],
      rows: filas.map((x) => ({ ...x, d: fmtDate(x.desde), h: x.hasta ? fmtDate(x.hasta) : '—', e: E[x.estado][0] })) }])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={CalendarDays} valor={fmtNumber(todas.length)} etiqueta="Asignaciones (total)" tono="azul" />
        <Kpi icono={CheckCircle2} valor={fmtNumber(todas.filter((x) => x.estado === 'vigente').length)} etiqueta="Asignación vigente" tono="verde" />
        <Kpi icono={Clock} valor={fmtNumber(todas.filter((x) => x.estado === 'programada').length)} etiqueta="Programada" tono="ambar" />
        <Kpi icono={AlertTriangle} valor={fmtNumber(todas.filter((x) => x.estado === 'conflicto').length)} etiqueta="Con conflicto" tono="rojo" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar asignación (recurso, cuadrilla, destino...)" className="pl-9" /></div>
        <Button onClick={onNueva}><Plus className="size-4" />Nueva asignación</Button>
        <Button variant="outline" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-card rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold">Filtros ({[f.tipo, f.crew, f.desde, f.est].filter(Boolean).length})</span>
        <Sel i={Layers} t="Recurso" v={f.tipo} set={(x) => setF({ ...f, tipo: x })} ops={[['vehiculo', 'Vehículos'], ['equipo', 'Equipos']]} />
        <Sel i={Users} t="Cuadrilla" v={f.crew} set={(x) => setF({ ...f, crew: x })} ops={c.map((x) => [x.id, `${x.code} · ${x.name}`])} todos="Todas" />
        <label className="bg-card flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px]"><CalendarDays className="text-muted-foreground size-4" /><span className="font-semibold">Fecha:</span>
          <input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="bg-transparent outline-none" /></label>
        <Sel i={Activity} t="Estado" v={f.est} set={(x) => setF({ ...f, est: x })} ops={Object.entries(E).map(([k, [t]]) => [k, t])} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0"><CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
            <thead className="bg-secondary/50 text-left"><tr>{['Asignación', 'Recurso', 'Origen', 'Destino', 'Desde', 'Hasta', 'Estado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 font-semibold">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {visibles.length === 0 && <tr><td colSpan={8} className="text-muted-foreground px-3 py-8 text-center">Sin asignaciones con estos filtros.</td></tr>}
              {visibles.map((x) => {
                const e = E[x.estado]
                const Ic = e[2]
                return (
                  <tr key={x.id} className={cn('hover:bg-secondary/30', abierto === x.id && 'bg-primary/5')}>
                    <td className="px-3 py-2 font-semibold"><Layers className="text-muted-foreground mr-1 inline size-3.5" />{x.codigo}</td>
                    <td className="px-3">{x.tipo === 'vehiculo' ? <Truck className="text-muted-foreground mr-1 inline size-3.5" /> : <Wrench className="text-muted-foreground mr-1 inline size-3.5" />}{x.recurso}<span className="text-muted-foreground block">{x.codigo}</span></td>
                    <td className="px-3"><MapPin className="text-muted-foreground mr-1 inline size-3.5" />{x.origen}</td>
                    <td className="px-3"><MapPin className="text-muted-foreground mr-1 inline size-3.5" /><strong>{x.destino ?? '—'}</strong></td>
                    <td className="px-3 whitespace-nowrap">{fmtDate(x.desde)}</td><td className="px-3 whitespace-nowrap">{x.hasta ? fmtDate(x.hasta) : 'Sin fecha'}</td>
                    <td className="px-3"><span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', e[1])}><Ic className="size-3" />{e[0]}</span></td>
                    <td className="px-3"><Button size="sm" variant="outline" onClick={() => setAbierto(x.id)}><Eye className="size-3.5" />Ver</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <Paginar total={filas.length} pagina={pagina} setPagina={setPagina} porPagina={porPagina} setPorPagina={setPorPagina} etiqueta="asignaciones" />
        </CardContent></Card>
        {sel ? (
          <Card className="h-fit"><CardContent className="space-y-3 p-4 text-[12.5px]">
            <div className="flex items-start gap-2">
              <span className="bg-info/10 text-info grid size-10 place-items-center rounded-lg">{sel.tipo === 'vehiculo' ? <Truck className="size-5" /> : <Wrench className="size-5" />}</span>
              <div className="flex-1"><p className="text-[15px] font-bold">{sel.codigo}</p><p className="text-muted-foreground">{sel.recurso}</p></div>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', E[sel.estado][1])}>● {E[sel.estado][0]}</span>
              <button onClick={() => setAbierto(null)} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button>
            </div>
            <p className="font-semibold">Detalle de la asignación</p>
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-muted-foreground block text-[11px]">Origen</span><strong>{sel.origen}</strong></p>
              <p><span className="text-muted-foreground block text-[11px]">Destino</span><strong>{sel.destino ?? '—'}</strong></p>
              <p><span className="text-muted-foreground block text-[11px]">Desde</span><strong>{fmtDate(sel.desde)}</strong></p>
              <p><span className="text-muted-foreground block text-[11px]">Hasta</span><strong>{sel.hasta ? fmtDate(sel.hasta) : 'Sin fecha'}</strong></p>
              <p className="col-span-2"><span className="text-muted-foreground block text-[11px]">Motivo</span><strong>{sel.motivo ?? '—'}</strong></p>
              {sel.tipo === 'equipo' && <p><span className="text-muted-foreground block text-[11px]">Horas de uso</span><strong>{fmtNumber(sel.horas, 1)} h</strong></p>}
            </div>
            {sel.estado === 'conflicto' && <p className="bg-destructive/8 text-destructive rounded-lg p-2"><strong>Conflicto de horario: revisar disponibilidad.</strong> El recurso tiene otra asignación en el mismo rango.</p>}
            {(!sel.hasta || sel.hasta >= hoy()) && <FinalizarAsignacion sel={sel} />}
            <p className="text-muted-foreground">Las asignaciones registradas no se editan: se finalizan con fecha y motivo, o se registra una nueva (queda en el historial).</p>
            <p className="font-semibold">Historial</p>
            <ul className="space-y-1.5 border-l-2 border-border pl-3">
              {(hist.data ?? []).map((x) => <li key={x.id}><span className="text-muted-foreground">{fmtDateTime(x.created_at)}</span> · <strong>{x.action === 'INSERT' ? 'Asignación registrada' : 'Cambio'}</strong> · {(x.actor_email ?? 'Sistema').split('@')[0]}{x.motivo ? ` · ${x.motivo}` : ''}</li>)}
              {!hist.isLoading && !(hist.data ?? []).length && <li className="text-muted-foreground">Sin eventos registrados.</li>}
            </ul>
          </CardContent></Card>
        ) : <Card className="h-fit"><CardContent className="text-muted-foreground p-8 text-center text-[12.5px]">Elige «Ver» para el detalle y el historial de la asignación.</CardContent></Card>}
      </div>
    </div>
  )
}

/** Finalizar una asignación vigente (sin «Hasta» deja el recurso bloqueado), con fecha y motivo. */
function FinalizarAsignacion({ sel }: { sel: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [v, setV] = React.useState<{ fin: string; motivo: string } | null>(null)
  const guardar = async () => {
    if (!v) return
    const { error } = await sb.rpc('asignacion_finalizar' as any, { p_tipo: sel.tipo, p_id: sel.id, p_fin: v.fin, p_motivo: v.motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Asignación finalizada', { description: 'El recurso queda libre después de esa fecha.' })
    setV(null); qc.invalidateQueries()
  }
  if (!v) return <Button size="sm" variant="outline" onClick={() => setV({ fin: hoy(), motivo: '' })}>Finalizar asignación</Button>
  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <p className="font-semibold">Finalizar {sel.codigo}</p>
      <label className="block"><span className="text-muted-foreground text-[12px]">Fecha de fin *</span><Input type="date" value={v.fin} min={sel.desde} onChange={(e) => setV({ ...v, fin: e.target.value })} className="h-9" /></label>
      <label className="block"><span className="text-muted-foreground text-[12px]">Motivo *</span><Textarea rows={2} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} /></label>
      <div className="flex gap-2"><Button size="sm" onClick={guardar} disabled={!v.fin || !v.motivo.trim()}>Finalizar</Button><Button size="sm" variant="outline" onClick={() => setV(null)}>Cancelar</Button></div>
    </div>
  )
}
