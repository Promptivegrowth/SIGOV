'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, HardHat, UserCog, TriangleAlert, Search, Plus, Eye, Pencil, Clock, X, FileText, Layers, Save, UserPlus, CalendarDays, CheckCircle2, ExternalLink, Info } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, toISODate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { usuarioDeCorreo } from '@/lib/usuario'
import { GestionNav, Kpi } from './gestion-nav'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Cuadrillas» (A03/A04, SUB_A03–A06): jefe, supervisor, sectores y
 * vigencia; integrantes con Desde/Hasta (la pertenencia histórica nunca se
 * borra: se finaliza); asignaciones; historial de solo lectura con actor,
 * antes/después y motivo. El código de la base se toma de la base.
 */
type Tab = 'datos' | 'integrantes' | 'asignaciones' | 'historial'

export function GestionCuadrillas() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ q: '', estado: '', sup: '', sector: '' })
  const [sel, setSel] = React.useState('')
  const [tab, setTab] = React.useState<Tab>('datos')
  const [nueva, setNueva] = React.useState(false)
  const datos = useQuery({
    queryKey: ['gestion-crews', service.id],
    queryFn: async () => {
      const [{ data: c }, { data: m }, { data: s }] = await Promise.all([
        sb.from('crews').select('*').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('service_members').select('role, profiles(id, full_name, email)').eq('service_id', service.id),
        sb.from('service_sectors').select('code').eq('service_id', service.id).order('orden'),
      ])
      const personas = ((m ?? []) as any[]).map((x) => ({ ...x.profiles, rol: x.role }))
      return { crews: (c ?? []) as any[], personas, sectores: ((s ?? []) as any[]).map((x) => x.code as string) }
    },
  })
  const d = datos.data
  const nombre = (id?: string | null) => d?.personas.find((p) => p.id === id)
  const filas = (d?.crews ?? []).filter((c) => (!f.estado || (f.estado === 'activo') === !!c.is_active) && (!f.sup || (f.sup === 'sin' ? !c.supervisor_id : c.supervisor_id === f.sup))
    && (!f.sector || (f.sector === 'sin' ? !(c.sectores ?? []).length : (c.sectores ?? []).includes(f.sector)))
    && (!f.q || `${c.name} ${c.code} ${nombre(c.leader_id)?.full_name ?? ''} ${c.jefe_nombre ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  const pendientes = (d?.crews ?? []).filter((c) => !c.supervisor_id || !(c.sectores ?? []).length).length
  const c = d?.crews.find((x) => x.id === sel)
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['gestion-crews'] }); qc.invalidateQueries({ queryKey: ['crew-hist'] }); qc.invalidateQueries({ queryKey: ['crew-miembros'] }) }

  return (
    <>
      <PageHeader title="Cuadrillas" description="Administración de cuadrillas, sus jefes, supervisores y sectores" />
      <PageBody className="space-y-4">
        <GestionNav activo="/gestion/cuadrillas" />
        <div className="grid grid-cols-3 gap-3">
          <Kpi icono={Users} valor={d?.crews.length} etiqueta="Cuadrillas registradas" tono="azul" />
          <Kpi icono={HardHat} valor={d?.crews.filter((x) => x.leader_id).length} etiqueta="Jefes asignados" tono="verde" />
          <Kpi icono={UserCog} valor={d?.personas.filter((p) => p.rol === 'supervisor').length} etiqueta="Cuentas de supervisor" tono="ambar" />
        </div>
        {pendientes > 0 && (
          <p className="bg-warning/12 text-warning flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[12.5px] font-semibold">
            <span className="flex items-center gap-2"><TriangleAlert className="size-4" />{pendientes} {pendientes === 1 ? 'cuadrilla pendiente' : 'cuadrillas pendientes'} de asignar supervisor y sector</span>
            <button className="text-primary underline" onClick={() => setF({ ...f, sup: 'sin' })}>Ver detalle</button></p>
        )}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por cuadrilla o jefe (nombre o apellido)..." className="pl-8" /></div>
            <Elegir etiqueta="Estado:" valor={f.estado} cambiar={(v) => setF({ ...f, estado: v })} todos="Todos" opciones={[['activo', 'Activo'], ['inactivo', 'Inactivo']]} />
            <Elegir etiqueta="Supervisor:" valor={f.sup} cambiar={(v) => setF({ ...f, sup: v })} todos="Todos" opciones={[['sin', 'Por asignar'], ...(d?.personas ?? []).filter((p) => p.rol === 'supervisor').map((p) => [p.id, p.full_name] as [string, string])]} />
            <Elegir etiqueta="Sector:" valor={f.sector} cambiar={(v) => setF({ ...f, sector: v })} todos="Todos" opciones={[['sin', 'Por asignar'], ...(d?.sectores ?? []).map((s) => [s, `Sector ${s}`] as [string, string])]} />
            <Button onClick={() => setNueva(true)}><Plus className="size-4" />Crear cuadrilla</Button>
          </CardContent>
        </Card>
        <div className={cn('grid gap-4', c && 'xl:grid-cols-[1fr_460px]')}>
          <Card className="min-w-0">
            <CardContent className="overflow-x-auto p-0">
              {datos.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : (
                <table className="w-full text-[12.5px]">
                  <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                    <th className="w-8" />{['Cuadrilla', 'Jefe', 'Supervisor', 'Sector', 'Estado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
                  </tr></thead>
                  <tbody>
                    {filas.map((x) => {
                      const jefe = nombre(x.leader_id); const sup = nombre(x.supervisor_id)
                      return (
                        <tr key={x.id} onClick={() => setSel(x.id)} className={cn('cursor-pointer border-t border-border', sel === x.id && 'bg-info/[0.07]')}>
                          <td className="pl-3"><input type="radio" readOnly checked={sel === x.id} /></td>
                          <td className="px-3 py-2"><strong>{x.name}</strong><span className="text-muted-foreground block text-[11px]">{x.code}</span></td>
                          <td className="px-3">{jefe ? <><strong>{jefe.full_name}</strong><span className="text-muted-foreground block text-[11px]">{usuarioDeCorreo(jefe.email)}</span></> : <Chip>Por asignar</Chip>}</td>
                          <td className="px-3">{sup ? sup.full_name : <Chip>Por asignar</Chip>}</td>
                          <td className="px-3">{(x.sectores ?? []).length ? (x.sectores as string[]).map((s) => `Sector ${s}`).join(', ') : <Chip>Por asignar</Chip>}</td>
                          <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', x.is_active ? 'bg-success/12 text-success' : 'bg-secondary text-muted-foreground')}>● {x.is_active ? 'Activo' : 'Inactivo'}</span></td>
                          <td className="px-3"><span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="icon-sm" variant="outline" aria-label="Ver" onClick={() => { setSel(x.id); setTab('datos') }}><Eye className="size-3.5" /></Button>
                            <Button size="icon-sm" variant="outline" aria-label="Editar" onClick={() => { setSel(x.id); setTab('datos') }}><Pencil className="size-3.5" /></Button>
                            <Button size="icon-sm" variant="outline" aria-label="Historial" onClick={() => { setSel(x.id); setTab('historial') }}><Clock className="size-3.5" /></Button>
                          </span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <p className="text-muted-foreground border-t border-border px-3 py-2 text-[12px]">Mostrando {filas.length} de {d?.crews.length ?? 0} cuadrillas · <Info className="mr-1 inline size-3" />El código de la base se toma de la base. No inferir por orden de lista.</p>
            </CardContent>
          </Card>
          {c && d && (
            <Card className="h-fit">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[15px] font-bold">{c.name}</p><p className="text-muted-foreground text-[12px]">Código de la base: <strong className="text-info">{c.code}</strong> · Cuadrilla</p></div>
                  <button onClick={() => setSel('')} aria-label="Cerrar"><X className="size-4" /></button>
                </div>
                <div className="bg-secondary flex flex-wrap rounded-lg p-1">
                  {([['datos', 'Datos', FileText], ['integrantes', 'Integrantes', Users], ['asignaciones', 'Asignaciones', Layers], ['historial', 'Historial', Clock]] as const).map(([k, t, I]) => (
                    <button key={k} onClick={() => setTab(k)} className={cn('flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
                  ))}
                </div>
                {tab === 'datos' && <DatosCuadrilla key={c.id} c={c} personas={d.personas} sectores={d.sectores} alGuardar={refrescar} />}
                {tab === 'integrantes' && <Integrantes crew={c} personas={d.personas} alCambiar={refrescar} />}
                {tab === 'asignaciones' && <Asignaciones crew={c} />}
                {tab === 'historial' && <HistorialCuadrilla crew={c} />}
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
      {nueva && <NuevaCuadrilla cerrar={() => setNueva(false)} alCrear={(id) => { setNueva(false); refrescar(); setSel(id) }} />}
    </>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11.5px]">{children}</span>
}

function DatosCuadrilla({ c, personas, sectores, alGuardar }: { c: any; personas: any[]; sectores: string[]; alGuardar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ leader: c.leader_id ?? '', sup: c.supervisor_id ?? '', sectores: (c.sectores ?? []) as string[], desde: c.vigencia_desde ?? toISODate(new Date()), hasta: c.vigencia_hasta ?? '', motivo: '' })
  const [ocupado, setOcupado] = React.useState(false)
  const guardar = async () => {
    setOcupado(true)
    const { error } = await sb.rpc('cuadrilla_guardar' as any, { p_crew: c.id, p_leader: v.leader || null, p_supervisor: v.sup || null, p_sectores: v.sectores,
      p_desde: v.desde || null, p_hasta: v.hasta || null, p_motivo: v.motivo || null } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Cuadrilla guardada', { description: 'El cambio queda en el historial con su motivo.' })
    setV({ ...v, motivo: '' }); alGuardar()
  }
  return (
    <div className="space-y-2.5 text-[12.5px]">
      <Elegir etiqueta="Jefe de cuadrilla *" valor={v.leader} cambiar={(x) => setV({ ...v, leader: x })} todos="Por asignar"
        opciones={personas.filter((p) => p.rol === 'jefe_cuadrilla').map((p) => [p.id, `${p.full_name} (${usuarioDeCorreo(p.email)})`])} />
      <Elegir etiqueta="Supervisor *" valor={v.sup} cambiar={(x) => setV({ ...v, sup: x })} todos="Por asignar" opciones={personas.filter((p) => p.rol === 'supervisor').map((p) => [p.id, p.full_name])} />
      <div><p className="text-muted-foreground text-[12px]">Sector *</p>
        <div className="flex flex-wrap gap-1.5">{sectores.map((s) => (
          <label key={s} className={cn('flex items-center gap-1 rounded border px-2 py-0.5', v.sectores.includes(s) ? 'border-primary bg-primary/[0.07]' : 'border-border')}>
            <input type="checkbox" checked={v.sectores.includes(s)} onChange={(e) => setV({ ...v, sectores: e.target.checked ? [...v.sectores, s] : v.sectores.filter((x) => x !== s) })} />Sector {s}</label>
        ))}{!sectores.length && <span className="text-muted-foreground">El contrato no tiene sectores registrados.</span>}</div></div>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="text-muted-foreground block text-[12px]">Vigencia desde *</span><Input type="date" value={v.desde} onChange={(e) => setV({ ...v, desde: e.target.value })} className="h-9" /></label>
        <label><span className="text-muted-foreground block text-[12px]">Vigencia hasta</span><Input type="date" value={v.hasta} onChange={(e) => setV({ ...v, hasta: e.target.value })} className="h-9" /></label>
      </div>
      <label className="block"><span className="text-muted-foreground text-[12px]">Motivo {(v.leader !== (c.leader_id ?? '') || v.sup !== (c.supervisor_id ?? '')) && <span className="text-destructive">*</span>}</span>
        <Textarea rows={2} maxLength={300} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} placeholder="Asignación inicial de cuadrilla." /></label>
      <HistorialCuadrilla crew={c} corto />
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setV({ ...v, motivo: '' })}>Cancelar</Button>
        <Button onClick={guardar} loading={ocupado} disabled={!v.leader || !v.desde}><Save className="size-4" />Guardar cambios</Button></div>
    </div>
  )
}

function Integrantes({ crew, personas, alCambiar }: { crew: any; personas: any[]; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [q, setQ] = React.useState('')
  const [estado, setEstado] = React.useState('')
  const [agregar, setAgregar] = React.useState(false)
  const m = useQuery({
    queryKey: ['crew-miembros', crew.id],
    queryFn: async () => ((await sb.from('crew_members').select('*').eq('crew_id', crew.id).order('desde', { ascending: false })).data ?? []) as any[],
  })
  const hoy = toISODate(new Date())
  const activo = (x: any) => x.is_active && (!x.hasta || x.hasta >= hoy)
  const filas = (m.data ?? []).filter((x) => (!estado || (estado === 'activo') === activo(x)) && (!q || String(x.full_name).toLowerCase().includes(q.toLowerCase())))
  const vigencia = async (x: any, finalizar: boolean) => {
    const hasta = finalizar ? hoy : prompt('Nueva fecha Hasta (AAAA-MM-DD, vacío = sin fecha):', x.hasta ?? '')
    if (hasta === null) return
    const motivo = prompt(finalizar ? 'Motivo de la finalización (obligatorio):' : 'Motivo del cambio de vigencia (obligatorio):')?.trim()
    if (!motivo) return
    const { error } = await sb.rpc('integrante_vigencia' as any, { p_id: x.id, p_desde: null, p_hasta: hasta || null, p_motivo: motivo, p_finalizar: finalizar } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(finalizar ? 'Integrante finalizado (se conserva su historial)' : 'Vigencia actualizada'); alCambiar()
  }
  return (
    <div className="space-y-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAgregar(true)}><UserPlus className="size-4" />Agregar integrante</Button>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar integrante..." className="h-8 flex-1" />
        <Elegir etiqueta="" valor={estado} cambiar={setEstado} todos="Todos" opciones={[['activo', 'Activo'], ['finalizado', 'Finalizado']]} />
      </div>
      <table className="w-full">
        <thead className="text-muted-foreground text-[11px]"><tr><th className="py-1 text-left font-medium">Integrante</th><th className="text-left font-medium">Estado</th><th className="text-left font-medium">Desde</th><th className="text-left font-medium">Hasta</th><th /></tr></thead>
        <tbody>
          {filas.map((x) => (
            <tr key={x.id} className="border-t border-border">
              <td className="py-1.5">{x.full_name}</td>
              <td><span className={cn('rounded-full px-1.5 text-[11px] font-semibold', activo(x) ? 'bg-success/12 text-success' : 'bg-secondary text-muted-foreground')}>● {activo(x) ? 'Activo' : 'Finalizado'}</span></td>
              <td>{x.desde ? fmtDate(x.desde) : '—'}</td><td>{x.hasta ? fmtDate(x.hasta) : '—'}</td>
              <td className="text-right"><span className="flex justify-end gap-1">
                <Button size="icon-sm" variant="outline" aria-label="Editar vigencia" onClick={() => vigencia(x, false)}><CalendarDays className="size-3.5" /></Button>
                {activo(x) && <Button size="icon-sm" variant="outline" aria-label="Finalizar" onClick={() => vigencia(x, true)}><CheckCircle2 className="size-3.5" /></Button>}
              </span></td>
            </tr>
          ))}
          {!filas.length && <tr><td colSpan={5} className="text-muted-foreground py-3 text-center">Sin integrantes.</td></tr>}
        </tbody>
      </table>
      <p className="bg-info/[0.08] text-info rounded-md px-2.5 py-2 text-[12px]">La pertenencia histórica de los integrantes nunca se elimina, solo se actualiza su vigencia y estado.</p>
      {agregar && <AgregarIntegrante crew={crew} personas={personas} cerrar={() => setAgregar(false)} alGuardar={() => { setAgregar(false); alCambiar() }} />}
    </div>
  )
}

function AgregarIntegrante({ crew, personas, cerrar, alGuardar }: { crew: any; personas: any[]; cerrar: () => void; alGuardar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ persona: '', desde: toISODate(new Date()), hasta: '', motivo: '' })
  const guardar = async () => {
    const { error } = await sb.rpc('integrante_agregar' as any, { p_crew: crew.id, p_profile: v.persona, p_desde: v.desde, p_hasta: v.hasta || null, p_motivo: v.motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Integrante agregado'); alGuardar()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar integrante</DialogTitle><DialogDescription>Incorpore un personal existente a la cuadrilla {crew.name}.</DialogDescription></DialogHeader>
        <div className="space-y-2.5 text-[13px]">
          <p className="bg-info/[0.08] text-info rounded-md px-2.5 py-2 text-[12px] font-semibold">Vincula personal del maestro. No crea cuentas de acceso. Sin asignaciones incompatibles superpuestas.</p>
          <Elegir etiqueta="Personal existente *" valor={v.persona} cambiar={(x) => setV({ ...v, persona: x })} todos="Seleccione persona del maestro..."
            opciones={personas.filter((p) => p.rol !== 'visor').map((p) => [p.id, `${p.full_name} · ${p.rol}`])} />
          <div className="grid grid-cols-2 gap-2">
            <label><span className="text-muted-foreground block text-[12px]">Desde *</span><Input type="date" value={v.desde} onChange={(e) => setV({ ...v, desde: e.target.value })} /></label>
            <label><span className="text-muted-foreground block text-[12px]">Hasta</span><Input type="date" value={v.hasta} onChange={(e) => setV({ ...v, hasta: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-muted-foreground text-[12px]">Motivo *</span>
            <Textarea rows={2} maxLength={500} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} placeholder="Ingrese el motivo de la incorporación..." />
            <span className="text-muted-foreground block text-right text-[11px]">{v.motivo.length} / 500</span></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={guardar} disabled={!v.persona || !v.desde || !v.motivo.trim()}><Save className="size-4" />Guardar integrante</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Asignaciones({ crew }: { crew: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const a = useQuery({
    queryKey: ['crew-asig', crew.id],
    queryFn: async () => {
      const [{ data: v }, { data: e }, { data: dsg }] = await Promise.all([
        sb.from('crew_vehicle_assignments').select('kind, start_on, end_on, vehicles(plate, code)').eq('crew_id', crew.id).order('start_on', { ascending: false }).limit(10),
        sb.from('safety_equipment').select('kind, code, status, expires_on').eq('crew_id', crew.id).is('deleted_at', null),
        sb.from('pci_designaciones' as any).select('desde, hasta, estado, pcis(code)').eq('crew_id', crew.id).order('creada_at', { ascending: false }).limit(5),
      ])
      return { v: (v ?? []) as any[], e: (e ?? []) as any[], d: (dsg ?? []) as any[] }
    },
  })
  return (
    <div className="space-y-2 text-[12.5px]">
      <p className="font-semibold">Vehículos</p>
      {(a.data?.v ?? []).map((x, i) => <p key={i} className="text-muted-foreground">{x.vehicles?.code ?? x.vehicles?.plate} · {x.kind} · {fmtDate(x.start_on)} – {x.end_on ? fmtDate(x.end_on) : 'vigente'}</p>)}
      {!a.data?.v.length && <p className="text-muted-foreground">Sin vehículos asignados.</p>}
      <p className="font-semibold">Equipos</p>
      {(a.data?.e ?? []).map((x, i) => <p key={i} className="text-muted-foreground">{x.kind} {x.code ?? ''} · {x.status}{x.expires_on ? ` · vence ${fmtDate(x.expires_on)}` : ''}</p>)}
      {!a.data?.e.length && <p className="text-muted-foreground">Sin equipos asignados.</p>}
      <p className="font-semibold">Designaciones de PCI</p>
      {(a.data?.d ?? []).map((x, i) => <p key={i} className="text-muted-foreground">{x.pcis?.code} · {x.estado} · {fmtDate(x.desde)} – {fmtDate(x.hasta)}</p>)}
      {!a.data?.d.length && <p className="text-muted-foreground">Sin designaciones.</p>}
      <Link href="/vencimientos" className="text-primary inline-flex items-center gap-1 underline"><ExternalLink className="size-3" />Abrir asignaciones de recursos</Link>
    </div>
  )
}

function HistorialCuadrilla({ crew, corto }: { crew: any; corto?: boolean }) {
  const sb = React.useMemo(() => createClient(), [])
  const [sel, setSel] = React.useState<any | null>(null)
  const h = useQuery({
    queryKey: ['crew-hist', crew.id],
    queryFn: async () => ((await sb.rpc('cuadrilla_historial' as any, { p_crew: crew.id } as any)).data ?? []) as any[],
  })
  const ev = (h.data ?? []).slice(0, corto ? 3 : 100)
  const txt = (o: any) => !o ? '—' : Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : k === 'desde' || k === 'hasta' ? fmtDate(String(v)) : v}`).join(' · ') || '—'
  return (
    <div className="space-y-2 text-[12.5px]">
      <p className="font-semibold">Historial de cambios</p>
      {ev.length === 0 && <p className="text-muted-foreground">Sin cambios registrados.</p>}
      <ul className="space-y-1.5 border-l-2 border-success/40 pl-3">
        {ev.map((e: any) => (
          <li key={e.id} className="relative cursor-pointer" onClick={() => setSel(sel?.id === e.id ? null : e)}>
            <span className="bg-success absolute top-1.5 -left-[17px] size-2.5 rounded-full" />
            <p><strong>{e.accion}</strong> · {e.entidad}</p>
            <p className="text-muted-foreground text-[11.5px]">{fmtDateTime(e.cuando)} · por {e.actor}{e.motivo ? ` · ${e.motivo}` : ''}</p>
            {sel?.id === e.id && (
              <div className="bg-secondary/60 mt-1 rounded-md p-2 text-[12px]">
                <p><span className="text-muted-foreground">Antes:</span> {txt(e.antes)}</p>
                <p className="text-success"><span className="text-muted-foreground">Después:</span> {txt(e.despues)}</p>
                <p className="text-muted-foreground">Solo lectura · no se edita ni se borra.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function NuevaCuadrilla({ cerrar, alCrear }: { cerrar: () => void; alCrear: (id: string) => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ code: '', name: '' })
  const crear = async () => {
    const { data, error } = await sb.from('crews').insert({ service_id: service.id, code: v.code.trim(), name: v.name.trim(), is_active: true } as any).select('id').single()
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Cuadrilla creada: asigna jefe, supervisor y sector'); alCrear((data as any).id)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Crear cuadrilla</DialogTitle><DialogDescription>El código es el de la base (no el orden de la lista).</DialogDescription></DialogHeader>
        <div className="space-y-2"><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="Código (p. ej. CUA_08)" />
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Nombre (p. ej. Cuadrilla 8 · Ilo)" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={crear} disabled={!v.code.trim() || !v.name.trim()}><Plus className="size-4" />Crear</Button></div></div>
      </DialogContent>
    </Dialog>
  )
}
