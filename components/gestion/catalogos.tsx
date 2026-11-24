'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { List, Gauge, Layers, Box, Image as ImageIcon, Search, Lock, Save, Plus, Pencil, Copy, Trash2, Clock, Info, Users, Eye, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDateTime, fmtNumber } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { GestionNav } from './gestion-nav'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Catálogos oficiales» (A05/A06, SUB_A01/A02): Actividades (código y
 * descripción oficiales con candado; fuente, unidad, método y estado con
 * motivo; los cambios no reescriben reportes anteriores), Rendimientos por
 * jornada (general o por cuadrilla; el de la cuadrilla prevalece),
 * Unidades, Materiales (consumo referencial por partida) y Evidencias
 * (reglas por contrato).
 */
type Tab = 'actividades' | 'rendimientos' | 'unidades' | 'materiales' | 'evidencias'
const METODOS = ['Manual', 'Mecánico', 'Mixto']

export function GestionCatalogos() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState<Tab>('actividades')
  const base = useQuery({
    queryKey: ['cat-base', service.id],
    queryFn: async () => {
      const [{ data: a }, { data: u }, { data: c }] = await Promise.all([
        sb.from('activities_catalog').select('*').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('units').select('*').or(`service_id.is.null,service_id.eq.${service.id}`).order('code'),
        sb.from('crews').select('id, name').eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      return { acts: (a ?? []) as any[], units: (u ?? []) as any[], crews: (c ?? []) as any[] }
    },
  })
  const d = base.data
  return (
    <>
      <PageHeader title="Catálogos oficiales" description="Base oficial de actividades y recursos" />
      <PageBody className="space-y-4">
        <GestionNav activo="/gestion/catalogos" />
        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {([['actividades', 'Actividades', List], ['rendimientos', 'Rendimientos', Gauge], ['unidades', 'Unidades', Layers], ['materiales', 'Materiales', Box], ['evidencias', 'Evidencias', ImageIcon]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold', tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
          ))}
        </div>
        {!d ? <SkeletonList rows={6} /> : tab === 'actividades' ? <Actividades d={d} ir={setTab} /> : tab === 'rendimientos' ? <Rendimientos d={d} />
          : tab === 'unidades' ? <Unidades d={d} /> : tab === 'materiales' ? <Materiales d={d} /> : <Evidencias />}
        <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]"><Info className="size-4" />El reporte diario se genera de forma digital en el sistema, no se carga como archivo.</p>
        <p className="text-muted-foreground flex items-center gap-2 text-[12px]"><Users className="size-3.5" />La configuración por cuadrilla es específica y prevalece sobre la configuración general.</p>
      </PageBody>
    </>
  )
}

function Actividades({ d, ir }: { d: any; ir: (t: Tab) => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const { service } = useSession()
  const [panel, setPanel] = React.useState<'ver' | 'editar' | 'asociaciones' | 'historial'>('editar')
  const qc = useQueryClient()
  const [f, setF] = React.useState({ q: '', estado: '', unidad: '' })
  const [sel, setSel] = React.useState<any | null>(null)
  const [v, setV] = React.useState<any>(null)
  const hist = useQuery({ queryKey: ['act-hist', sel?.id], enabled: !!sel, queryFn: async () => ((await sb.rpc('registro_historial' as any, { p_tabla: 'activities_catalog', p_id: sel.id } as any)).data ?? []) as any[] })
  const unidad = (id: string) => d.units.find((u: any) => u.id === id)?.symbol ?? '—'
  const filas = d.acts.filter((a: any) => (!f.estado || (f.estado === 'activo') === !!a.is_active) && (!f.unidad || a.unit_id === f.unidad)
    && (!f.q || `${a.code} ${a.name}`.toLowerCase().includes(f.q.toLowerCase())))
  const abrir = (a: any, modo: 'ver' | 'editar' | 'asociaciones' | 'historial' = 'editar') => { setPanel(modo); setSel(a); setV({ fuente: a.fuente ?? 'Anexo 7', unit: a.unit_id ?? '', metodo: a.metodo ?? 'Manual', activa: !!a.is_active, motivo: '' }) }
  // Asociaciones: materiales (consumo referencial), rendimiento por jornada e ítems PCI/partidas que la usan
  const asoc = useQuery({
    queryKey: ['act-asoc', sel?.id], enabled: !!sel && panel === 'asociaciones',
    queryFn: async () => {
      const [{ data: mats }, { data: rj }, { count: pci }, { count: plan }] = await Promise.all([
        sb.from('rendimientos').select('cantidad, supplies(name, units(symbol))').eq('activity_id', sel.id),
        sb.from('rendimientos_jornada').select('cantidad, metodo, crew_id').eq('activity_id', sel.id).is('deleted_at', null),
        sb.from('pci_items').select('id', { count: 'exact', head: true }).eq('service_id', service.id).eq('activity_id', sel.id).is('deleted_at', null),
        sb.from('plan_items').select('id', { count: 'exact', head: true }).eq('service_id', service.id).eq('activity_id', sel.id).is('deleted_at', null),
      ])
      return { mats: (mats ?? []) as any[], rj: (rj ?? []) as any[], pci: pci ?? 0, plan: plan ?? 0 }
    },
  })
  const guardar = async () => {
    const { error } = await sb.rpc('actividad_guardar' as any, { p_id: sel.id, p_fuente: v.fuente, p_unit: v.unit || null, p_metodo: v.metodo, p_activa: v.activa, p_motivo: v.motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Actividad actualizada', { description: 'Los cambios no reescriben reportes anteriores.' })
    qc.invalidateQueries({ queryKey: ['cat-base'] }); qc.invalidateQueries({ queryKey: ['act-hist'] }); setV({ ...v, motivo: '' })
  }
  return (
    <div className={cn('grid gap-4', sel && 'xl:grid-cols-[1fr_420px]')}>
      <Card className="min-w-0">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {([['unidades', 'Unidades de medida', 'Las unidades del contrato y la base del sistema.', Layers], ['rendimientos', 'Rendimientos', 'Rendimiento por jornada y consumo de materiales.', Gauge]] as const).map(([k, t, dsc, I]) => (
              <button key={k} onClick={() => ir(k)} className="hover:bg-secondary/50 flex items-center gap-3 rounded-lg border border-border p-3 text-left">
                <I className="text-info size-5" /><span className="flex-1"><strong className="block text-[13px]">{t}</strong><span className="text-muted-foreground text-[12px]">{dsc}</span></span><span className="text-primary font-semibold">Abrir ›</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-56 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar código o actividad" className="pl-8" /></div>
            <Elegir etiqueta="Estado:" valor={f.estado} cambiar={(x) => setF({ ...f, estado: x })} todos="Todos" opciones={[['activo', 'Activo'], ['inactivo', 'Inactivo']]} />
            <Elegir etiqueta="Unidad:" valor={f.unidad} cambiar={(x) => setF({ ...f, unidad: x })} todos="Todas" opciones={d.units.map((u: any) => [u.id, u.symbol])} />
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-secondary/60 text-muted-foreground sticky top-0 text-[11.5px]"><tr>{['', 'Código', 'Actividad', 'Unidad', 'Estado', 'Acciones'].map((t, i) => <th key={i} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead>
              <tbody>
                {filas.map((a: any) => (
                  <tr key={a.id} className={cn('border-t border-border', sel?.id === a.id && 'bg-info/[0.07]')}>
                    <td className="pl-3"><input type="radio" readOnly checked={sel?.id === a.id} onClick={() => abrir(a)} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-semibold">{a.code}{a.oficial && <Lock className="text-muted-foreground ml-1 inline size-3" />}</td>
                    <td className="px-3">{a.name}</td><td className="px-3">{unidad(a.unit_id)}</td>
                    <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', a.is_active ? 'bg-success/12 text-success' : 'bg-secondary text-muted-foreground')}>● {a.is_active ? 'Activo' : 'Inactivo'}</span></td>
                    <td className="px-3"><span className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => abrir(a, 'ver')}><Eye className="size-3.5" />Ver</Button>
                      <Button size="sm" variant="outline" onClick={() => abrir(a, 'editar')}><Pencil className="size-3.5" />Editar</Button>
                      <Button size="sm" variant="outline" onClick={() => abrir(a, 'asociaciones')}><Link2 className="size-3.5" />Asociaciones</Button>
                      <Button size="sm" variant="outline" onClick={() => abrir(a, 'historial')}><Clock className="size-3.5" />Historial</Button>
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-[12px]">{fmtNumber(filas.length)} actividades · {fmtNumber(d.acts.filter((a: any) => a.oficial).length)} oficiales COVINCA (candado)</p>
        </CardContent>
      </Card>
      {sel && v && (
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-[14px]">{sel.code} · {panel === 'ver' ? 'Detalle' : panel === 'editar' ? 'Editar' : panel === 'asociaciones' ? 'Asociaciones' : 'Historial'}
            <button onClick={() => setSel(null)} aria-label="Cerrar" className="text-muted-foreground text-[16px]">×</button></CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-[12.5px]">
            <div className="bg-secondary inline-flex rounded-md p-0.5 text-[12px]">
              {(['ver', 'editar', 'asociaciones', 'historial'] as const).map((k) => (
                <button key={k} onClick={() => setPanel(k)} className={cn('rounded px-2 py-0.5 font-semibold capitalize', panel === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{k === 'ver' ? 'Detalle' : k}</button>
              ))}
            </div>
            {panel === 'ver' && (
              <div className="space-y-1">
                {[['Código', sel.code], ['Descripción', sel.name], ['Unidad', unidad(sel.unit_id)], ['Fuente', sel.fuente ?? 'Anexo 7'], ['Método', sel.metodo ?? 'Manual'],
                  ['Estado', sel.is_active ? 'Activa' : 'Inactiva'], ['Oficial COVINCA', sel.oficial ? 'Sí (código bloqueado)' : 'No']].map(([k, x]) => (
                  <p key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><strong className="text-right">{x}</strong></p>
                ))}
              </div>
            )}
            {panel === 'asociaciones' && (
              <div className="space-y-2">
                <p className="font-semibold">Materiales (consumo referencial)</p>
                {(asoc.data?.mats ?? []).length === 0 && <p className="text-muted-foreground">Sin materiales asociados.</p>}
                {(asoc.data?.mats ?? []).map((m: any, i: number) => <p key={i} className="flex justify-between"><span>{m.supplies?.name}</span><span>{fmtNumber(Number(m.cantidad), 4)} {m.supplies?.units?.symbol ?? ''}/{unidad(sel.unit_id)}</span></p>)}
                <p className="pt-1 font-semibold">Rendimiento por jornada</p>
                {(asoc.data?.rj ?? []).length === 0 && <p className="text-muted-foreground">Por configurar.</p>}
                {(asoc.data?.rj ?? []).map((r: any, i: number) => <p key={i} className="flex justify-between"><span>{r.crew_id ? d.crews.find((c: any) => c.id === r.crew_id)?.name : 'General'} · {r.metodo}</span><span>{fmtNumber(Number(r.cantidad), 2)} {unidad(sel.unit_id)}/jornada</span></p>)}
                <p className="pt-1 font-semibold">Uso en el contrato</p>
                <p className="flex justify-between"><span>Ítems PCI</span><strong>{fmtNumber(asoc.data?.pci ?? 0)}</strong></p>
                <p className="flex justify-between"><span>Partidas programadas</span><strong>{fmtNumber(asoc.data?.plan ?? 0)}</strong></p>
                <div className="flex gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => ir('materiales')}>Editar materiales ›</Button><Button size="sm" variant="outline" onClick={() => ir('rendimientos')}>Editar rendimientos ›</Button></div>
              </div>
            )}
            {panel === 'editar' && (<>
            <label className="block"><span className="text-muted-foreground text-[12px]">Código</span><div className="relative"><Input value={sel.code} disabled={sel.oficial} readOnly className="h-9" />{sel.oficial && <Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-4" />}</div></label>
            <label className="block"><span className="text-muted-foreground text-[12px]">Descripción</span><div className="relative"><Input value={sel.name} disabled={sel.oficial} readOnly className="h-9" />{sel.oficial && <Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-4" />}</div></label>
            <Elegir etiqueta="Fuente" valor={v.fuente} cambiar={(x) => setV({ ...v, fuente: x || v.fuente })} opciones={[['Anexo 7', 'Anexo 7'], ['Contrato', 'Contrato'], ['Propia', 'Propia']]} />
            <Elegir etiqueta="Unidad" valor={v.unit} cambiar={(x) => setV({ ...v, unit: x })} opciones={d.units.map((u: any) => [u.id, `${u.symbol} (${u.name})`])} />
            <Elegir etiqueta="Método" valor={v.metodo} cambiar={(x) => setV({ ...v, metodo: x || v.metodo })} opciones={METODOS.map((m) => [m, m])} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.activa} onChange={(e) => setV({ ...v, activa: e.target.checked })} />Activa</label>
            <label className="block"><span className="text-muted-foreground text-[12px]">Motivo <span className="text-destructive">*</span></span>
              <Textarea rows={2} maxLength={300} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} placeholder="Ingrese el motivo del cambio" /></label>
            <p className="bg-info/[0.08] text-info rounded-md px-2.5 py-2 font-semibold">Los códigos oficiales y su descripción no se alteran desde este formulario. Los cambios no reescriben reportes anteriores.</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button><Button onClick={guardar} disabled={!v.motivo.trim()}><Save className="size-4" />Guardar cambios</Button></div>
            </>)}
            {panel === 'historial' && (
              <ul className="space-y-1.5 border-l-2 border-info/40 pl-3">
                {(hist.data ?? []).map((h: any, i: number) => <li key={i} className="text-[12px]"><strong>{h.accion}</strong><span className="text-muted-foreground block">{fmtDateTime(h.cuando)} · {h.actor}{h.motivo ? ` · ${h.motivo}` : ''}</span></li>)}
                {!(hist.data ?? []).length && <li className="text-muted-foreground">Sin cambios registrados.</li>}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Rendimientos({ d }: { d: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { service } = useSession()
  const [f, setF] = React.useState({ q: '', metodo: '', crew: '' })
  const [ed, setEd] = React.useState<any | null>(null)
  const r = useQuery({ queryKey: ['rend-jornada', service.id], queryFn: async () => ((await sb.from('rendimientos_jornada').select('*').eq('service_id', service.id).is('deleted_at', null)).data ?? []) as any[] })
  const act = (id: string) => d.acts.find((a: any) => a.id === id)
  // Lo configurado y, para cada actividad sin rendimiento general, una fila «Por configurar»
  const filas = [...(r.data ?? []), ...d.acts.filter((a: any) => a.is_active && !(r.data ?? []).some((x) => x.activity_id === a.id && !x.crew_id))
    .map((a: any) => ({ id: '', activity_id: a.id, crew_id: null, metodo: a.metodo ?? 'Manual', unit_id: a.unit_id, cantidad: null }))]
    .filter((x) => (!f.metodo || x.metodo === f.metodo) && (!f.crew || (f.crew === 'todas' ? !x.crew_id : x.crew_id === f.crew))
      && (!f.q || `${act(x.activity_id)?.code} ${act(x.activity_id)?.name}`.toLowerCase().includes(f.q.toLowerCase())))
  const guardar = async () => {
    const fila = { service_id: service.id, activity_id: ed.activity_id, crew_id: ed.crew_id || null, metodo: ed.metodo, unit_id: ed.unit_id || null, cantidad: Number(ed.cantidad) }
    const { error } = ed.id ? await sb.from('rendimientos_jornada').update(fila as any).eq('id', ed.id) : await sb.from('rendimientos_jornada').insert(fila as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Rendimiento guardado'); setEd(null); qc.invalidateQueries({ queryKey: ['rend-jornada'] })
  }
  const eliminar = async (x: any) => {
    if (!x.id || !confirm('¿Eliminar este rendimiento? Queda en la auditoría.')) return
    const { error } = await sb.from('rendimientos_jornada').update({ deleted_at: new Date().toISOString() } as any).eq('id', x.id)
    if (error) return toast.error(mensajeAmigable(error))
    qc.invalidateQueries({ queryKey: ['rend-jornada'] })
  }
  return (
    <div className={cn('grid gap-4', ed && 'xl:grid-cols-[1fr_380px]')}>
      <Card className="min-w-0"><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por actividad o código..." className="pl-8" /></div>
          <Elegir etiqueta="Método:" valor={f.metodo} cambiar={(x) => setF({ ...f, metodo: x })} todos="Todos" opciones={METODOS.map((m) => [m, m])} />
          <Elegir etiqueta="Cuadrilla:" valor={f.crew} cambiar={(x) => setF({ ...f, crew: x })} todos="Todas" opciones={[['todas', 'General (todas)'], ...d.crews.map((c: any) => [c.id, c.name] as [string, string])]} />
          <Button onClick={() => setEd({ id: '', activity_id: d.acts[0]?.id, crew_id: '', metodo: 'Manual', unit_id: d.acts[0]?.unit_id, cantidad: '' })}><Plus className="size-4" />Nuevo rendimiento</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/60 text-muted-foreground sticky top-0 text-[11.5px]"><tr>{['Código', 'Actividad', 'Método - Equipo', 'Rendimiento', 'Unidad', 'Cuadrilla', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead>
            <tbody>
              {filas.slice(0, 300).map((x, i) => (
                <tr key={x.id || `p${i}`} className="border-t border-border">
                  <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{act(x.activity_id)?.code}</td><td className="px-3">{act(x.activity_id)?.name}</td><td className="px-3">{x.metodo}</td>
                  <td className="px-3">{x.cantidad == null ? <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">Por configurar</span> : fmtNumber(Number(x.cantidad), 2)}</td>
                  <td className="px-3">{d.units.find((u: any) => u.id === x.unit_id)?.symbol ?? '—'}/jornada</td>
                  <td className="px-3">{x.crew_id ? d.crews.find((c: any) => c.id === x.crew_id)?.name : 'Todas'}</td>
                  <td className="px-3"><span className="flex gap-1">
                    <Button size="icon-sm" variant="outline" aria-label="Editar" onClick={() => setEd({ ...x, crew_id: x.crew_id ?? '', cantidad: x.cantidad ?? '' })}><Pencil className="size-3.5" /></Button>
                    <Button size="icon-sm" variant="outline" aria-label="Duplicar por cuadrilla" onClick={() => setEd({ ...x, id: '', crew_id: d.crews[0]?.id ?? '', cantidad: x.cantidad ?? '' })}><Copy className="size-3.5" /></Button>
                    {x.id && <Button size="icon-sm" variant="outline" aria-label="Eliminar" onClick={() => eliminar(x)}><Trash2 className="size-3.5" /></Button>}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      {ed && (
        <Card className="h-fit"><CardHeader className="pb-2"><CardTitle className="text-[14px]">{ed.id ? 'Editar rendimiento' : 'Nuevo rendimiento'}</CardTitle></CardHeader>
          <CardContent className="space-y-2.5 text-[12.5px]">
            {ed.id ? <label className="block"><span className="text-muted-foreground text-[12px]">Código</span><div className="relative"><Input value={act(ed.activity_id)?.code ?? ''} disabled readOnly className="h-9" /><Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-4" /></div></label>
              : <Elegir etiqueta="Actividad *" valor={ed.activity_id} cambiar={(x) => setEd({ ...ed, activity_id: x, unit_id: act(x)?.unit_id })} opciones={d.acts.map((a: any) => [a.id, `${a.code} · ${a.name}`])} />}
            <Elegir etiqueta="Método - Equipo *" valor={ed.metodo} cambiar={(x) => setEd({ ...ed, metodo: x || ed.metodo })} opciones={METODOS.map((m) => [m, m])} />
            <Elegir etiqueta="Unidad *" valor={ed.unit_id ?? ''} cambiar={(x) => setEd({ ...ed, unit_id: x })} opciones={d.units.map((u: any) => [u.id, `${u.symbol} (${u.name})`])} />
            <label className="block"><span className="text-muted-foreground text-[12px]">Rendimiento por jornada *</span><Input type="number" min={0} step="0.01" value={ed.cantidad} onChange={(e) => setEd({ ...ed, cantidad: e.target.value })} placeholder="Ingrese el rendimiento" className="h-9" /></label>
            <Elegir etiqueta="Cuadrilla *" valor={ed.crew_id} cambiar={(x) => setEd({ ...ed, crew_id: x })} todos="Todas (general)" opciones={d.crews.map((c: any) => [c.id, c.name])} />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEd(null)}>Cancelar</Button><Button onClick={guardar} disabled={!(Number(ed.cantidad) > 0)}><Save className="size-4" />Guardar cambios</Button></div>
          </CardContent></Card>
      )}
    </div>
  )
}

function Unidades({ d }: { d: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { service } = useSession()
  const [v, setV] = React.useState({ code: '', symbol: '', name: '' })
  const [ed, setEd] = React.useState<any | null>(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['cat-base'] })
  const crear = async () => {
    const { error } = await sb.from('units').insert({ service_id: service.id, code: v.code.trim().toUpperCase(), symbol: v.symbol.trim(), name: v.name.trim() } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Unidad creada'); setV({ code: '', symbol: '', name: '' }); refrescar()
  }
  const guardar = async () => {
    const { error } = await sb.from('units').update({ symbol: ed.symbol.trim(), name: ed.name.trim() } as any).eq('id', ed.id)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Unidad actualizada', { description: 'Los reportes anteriores conservan su unidad.' }); setEd(null); refrescar()
  }
  const eliminar = async (u: any) => {
    const usada = d.acts.some((a: any) => a.unit_id === u.id)
    if (usada) return toast.error('No se puede eliminar: hay actividades que usan esta unidad', { description: 'Cámbiales la unidad primero.' })
    if (!confirm(`¿Eliminar la unidad ${u.symbol}? Queda en la auditoría.`)) return
    const { error } = await sb.from('units').delete().eq('id', u.id)
    if (error) return toast.error(mensajeAmigable(error, 'No se pudo eliminar: la unidad está en uso'))
    toast.success('Unidad eliminada'); refrescar()
  }
  return (
    <Card><CardContent className="space-y-3 p-4 text-[12.5px]">
      <div className="flex flex-wrap items-end gap-2">
        <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="Código (p. ej. M2)" className="w-32" />
        <Input value={v.symbol} onChange={(e) => setV({ ...v, symbol: e.target.value })} placeholder="Símbolo (m²)" className="w-28" />
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Descripción" className="flex-1" />
        <Button size="sm" onClick={crear} disabled={!v.code || !v.symbol || !v.name}><Plus className="size-4" />Nueva unidad</Button>
      </div>
      <table className="w-full"><thead className="text-muted-foreground text-[11.5px]"><tr><th className="py-1 text-left font-medium">Unidad</th><th className="text-left font-medium">Descripción</th><th className="text-left font-medium">Alcance</th><th className="text-left font-medium">Acciones</th></tr></thead>
        <tbody>{d.units.map((u: any) => ed?.id === u.id ? (
          <tr key={u.id} className="border-t border-border">
            <td className="py-1"><Input value={ed.symbol} onChange={(e) => setEd({ ...ed, symbol: e.target.value })} className="h-8 w-24" /></td>
            <td><Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} className="h-8" /></td><td className="text-muted-foreground">Este contrato</td>
            <td><span className="flex gap-1"><Button size="sm" onClick={guardar} disabled={!ed.symbol.trim() || !ed.name.trim()}><Save className="size-3.5" />Guardar</Button><Button size="sm" variant="outline" onClick={() => setEd(null)}>Cancelar</Button></span></td>
          </tr>
        ) : (
          <tr key={u.id} className="border-t border-border"><td className="py-1.5 font-semibold">{u.symbol}</td><td>{u.name}</td><td className="text-muted-foreground">{u.service_id ? 'Este contrato' : 'Base del sistema (solo lectura)'}</td>
            <td>{u.service_id ? <span className="flex gap-1"><Button size="icon-sm" variant="outline" aria-label="Editar unidad" onClick={() => setEd({ id: u.id, symbol: u.symbol, name: u.name })}><Pencil className="size-3.5" /></Button>
              <Button size="icon-sm" variant="outline" aria-label="Eliminar unidad" onClick={() => eliminar(u)}><Trash2 className="size-3.5" /></Button></span> : <Lock className="text-muted-foreground size-3.5" />}</td></tr>
        ))}</tbody></table>
    </CardContent></Card>
  )
}

function Materiales({ d }: { d: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { service } = useSession()
  const [actId, setActId] = React.useState('')
  const [nuevo, setNuevo] = React.useState<{ activity_id: string; supply_id: string; cantidad: string } | null>(null)
  const [ed, setEd] = React.useState<{ id: string; cantidad: string } | null>(null)
  const r = useQuery({ queryKey: ['rend-mat', service.id], queryFn: async () => ((await sb.from('rendimientos').select('*, supplies(name, presentacion, units(symbol))').eq('service_id', service.id)).data ?? []) as any[] })
  const sup = useQuery({ queryKey: ['cat-supplies', service.id], queryFn: async () => ((await sb.from('supplies').select('id, code, name, presentacion, presentacion_nombre, units(symbol)').eq('service_id', service.id).is('deleted_at', null).order('name')).data ?? []) as any[] })
  const [pres, setPres] = React.useState<any | null>(null)
  const filas = (r.data ?? []).filter((x) => !actId || x.activity_id === actId)
  const act = (id: string) => d.acts.find((a: any) => a.id === id)
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['rend-mat'] }); qc.invalidateQueries({ queryKey: ['cat-supplies'] }) }
  const guardarNuevo = async () => {
    if (!nuevo) return
    const { error } = await sb.from('rendimientos').insert({ service_id: service.id, activity_id: nuevo.activity_id, supply_id: nuevo.supply_id, cantidad: Number(nuevo.cantidad) } as any)
    if (error) return toast.error(mensajeAmigable(error, 'No se pudo asociar: ese material ya está en la actividad'))
    toast.success('Material asociado a la actividad'); setNuevo(null); refrescar()
  }
  const guardarEd = async () => {
    if (!ed) return
    const { error } = await sb.from('rendimientos').update({ cantidad: Number(ed.cantidad), updated_at: new Date().toISOString() } as any).eq('id', ed.id)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Consumo referencial actualizado', { description: 'Los requerimientos ya guardados no cambian.' }); setEd(null); refrescar()
  }
  const quitar = async (x: any) => {
    if (!confirm(`¿Quitar ${x.supplies?.name} de «${act(x.activity_id)?.name}»? Queda en la auditoría.`)) return
    const { error } = await sb.from('rendimientos').delete().eq('id', x.id)
    if (error) return toast.error(mensajeAmigable(error))
    refrescar()
  }
  const guardarPres = async () => {
    const { error } = await sb.from('supplies').update({ presentacion: pres.presentacion === '' ? null : Number(pres.presentacion), presentacion_nombre: pres.presentacion_nombre || null } as any).eq('id', pres.id)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Presentación guardada', { description: 'El pedido práctico se redondea a su múltiplo.' }); setPres(null); refrescar()
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card className="min-w-0"><CardContent className="space-y-3 p-4 text-[12.5px]">
        <div className="flex flex-wrap items-end gap-2">
          <Elegir etiqueta="Actividad" valor={actId} cambiar={setActId} todos="Todas" opciones={d.acts.filter((a: any) => (r.data ?? []).some((x) => x.activity_id === a.id)).map((a: any) => [a.id, `${a.code} · ${a.name}`])} />
          <Button size="sm" onClick={() => setNuevo({ activity_id: actId || d.acts[0]?.id, supply_id: (sup.data ?? [])[0]?.id ?? '', cantidad: '' })}><Plus className="size-4" />Asociar material</Button>
        </div>
        {nuevo && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
            <Elegir etiqueta="Actividad" valor={nuevo.activity_id} cambiar={(x) => setNuevo({ ...nuevo, activity_id: x })} opciones={d.acts.map((a: any) => [a.id, `${a.code} · ${a.name}`])} />
            <Elegir etiqueta="Material" valor={nuevo.supply_id} cambiar={(x) => setNuevo({ ...nuevo, supply_id: x })} opciones={(sup.data ?? []).map((m: any) => [m.id, m.name])} />
            <label><span className="text-muted-foreground block text-[12px]">Consumo por unidad</span><Input type="number" step="0.0001" min={0} value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} className="h-9 w-32" /></label>
            <Button size="sm" onClick={guardarNuevo} disabled={!(Number(nuevo.cantidad) > 0) || !nuevo.supply_id || !nuevo.activity_id}><Save className="size-3.5" />Guardar</Button>
            <Button size="sm" variant="outline" onClick={() => setNuevo(null)}>Cancelar</Button>
          </div>
        )}
        <table className="w-full"><thead className="text-muted-foreground text-[11.5px]"><tr><th className="py-1 text-left font-medium">Material</th><th className="text-left font-medium">Asociado a la actividad</th><th className="text-left font-medium">Consumo referencial</th><th className="text-left font-medium">Acciones</th></tr></thead>
          <tbody>{filas.slice(0, 300).map((x) => <tr key={x.id} className="border-t border-border"><td className="py-1.5">{x.supplies?.name}</td><td>{act(x.activity_id)?.name}</td>
            <td>{ed?.id === x.id ? <Input type="number" step="0.0001" min={0} value={ed!.cantidad} onChange={(e) => setEd({ id: ed!.id, cantidad: e.target.value })} className="h-8 w-28" />
              : <>{fmtNumber(Number(x.cantidad), 4)} {x.supplies?.units?.symbol ?? ''} / {d.units.find((u: any) => u.id === act(x.activity_id)?.unit_id)?.symbol ?? 'und'}</>}</td>
            <td>{ed?.id === x.id ? <span className="flex gap-1"><Button size="sm" onClick={guardarEd} disabled={!(Number(ed!.cantidad) > 0)}>Guardar</Button><Button size="sm" variant="outline" onClick={() => setEd(null)}>Cancelar</Button></span>
              : <span className="flex gap-1"><Button size="icon-sm" variant="outline" aria-label="Editar consumo" onClick={() => setEd({ id: x.id, cantidad: String(x.cantidad) })}><Pencil className="size-3.5" /></Button>
                <Button size="icon-sm" variant="outline" aria-label="Quitar material" onClick={() => quitar(x)}><Trash2 className="size-3.5" /></Button></span>}</td></tr>)}</tbody></table>
        <p className="text-muted-foreground text-[12px]">El consumo referencial lo usa el requerimiento de insumos de Programación (pre-cantidad = metrado × consumo). Cambiarlo no altera requerimientos ya guardados.</p>
      </CardContent></Card>
      <Card className="h-fit"><CardHeader className="pb-2"><CardTitle className="text-[14px]">Presentación de despacho</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-[12.5px]">
          <p className="text-muted-foreground">El pedido práctico se redondea al múltiplo de la presentación (p. ej. 55 gal por cilindro de emulsión).</p>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {(sup.data ?? []).map((m: any) => pres?.id === m.id ? (
              <div key={m.id} className="space-y-1 rounded-md border border-border p-2">
                <p className="font-semibold">{m.name}</p>
                <div className="flex gap-1"><Input type="number" min={0} step="0.001" value={pres.presentacion} onChange={(e) => setPres({ ...pres, presentacion: e.target.value })} placeholder={`Cantidad (${m.units?.symbol ?? ''})`} className="h-8" />
                  <Input value={pres.presentacion_nombre} onChange={(e) => setPres({ ...pres, presentacion_nombre: e.target.value })} placeholder="cilindro, bolsa…" className="h-8" /></div>
                <div className="flex gap-1"><Button size="sm" onClick={guardarPres}>Guardar</Button><Button size="sm" variant="outline" onClick={() => setPres(null)}>Cancelar</Button></div>
              </div>
            ) : (
              <button key={m.id} onClick={() => setPres({ id: m.id, presentacion: m.presentacion ?? '', presentacion_nombre: m.presentacion_nombre ?? '' })} className="hover:bg-secondary/50 flex w-full justify-between rounded px-1.5 py-1 text-left">
                <span className="truncate">{m.name}</span><span className="text-muted-foreground whitespace-nowrap">{m.presentacion ? `${fmtNumber(Number(m.presentacion), 0)} ${m.units?.symbol ?? ''}${m.presentacion_nombre ? ` · ${m.presentacion_nombre}` : ''}` : 'Por unidad'}</span>
              </button>
            ))}
          </div>
        </CardContent></Card>
    </div>
  )
}

function Evidencias() {
  const sb = React.useMemo(() => createClient(), [])
  const { service } = useSession()
  const q = useQuery({ queryKey: ['reglas-ev', service.id], queryFn: async () => ((await sb.from('services').select('settings').eq('id', service.id).maybeSingle()).data as any)?.settings?.evidencias ?? null })
  const POR_DEFECTO: Record<string, string> = { fecha_hora: 'obligatoria', gps: 'opcional', sello: 'opcional', ats: 'minimo_1', charla: 'minimo_1', checklist: 'minimo_1' }
  const [v, setV] = React.useState<Record<string, string>>(POR_DEFECTO)
  const [motivo, setMotivo] = React.useState('')
  React.useEffect(() => { if (q.data) setV({ ...POR_DEFECTO, ...q.data }) }, [q.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async () => {
    const { error } = await sb.rpc('reglas_evidencia_guardar' as any, { p_service: service.id, p_reglas: v, p_motivo: motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Reglas de evidencia guardadas'); setMotivo('')
  }
  return (
    <Card className="max-w-xl"><CardContent className="space-y-2.5 p-4 text-[12.5px]">
      {[['fecha_hora', 'Fecha y hora'], ['gps', 'GPS'], ['sello', 'Sello'], ['ats', 'ATS'], ['charla', 'Charla'], ['checklist', 'Checklist']].map(([k, t]) => (
        <div key={k} className="flex items-center justify-between gap-3"><span className="font-semibold">{t}</span>
          <Elegir etiqueta="" valor={v[k]} cambiar={(x) => setV({ ...v, [k]: x || v[k] })} opciones={[['obligatoria', 'Obligatoria'], ['opcional', 'Opcional'], ['minimo_1', 'Mínimo 1']]} /></div>
      ))}
      <Textarea rows={2} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del cambio (obligatorio)" />
      <div className="flex justify-end"><Button onClick={guardar} disabled={!motivo.trim()}><Save className="size-4" />Guardar reglas</Button></div>
    </CardContent></Card>
  )
}
