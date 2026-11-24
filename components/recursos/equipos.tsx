'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, CheckCircle2, XCircle, Search, Plus, Download, Eye, UserPlus, History, X, Save, Layers, Settings2, Network, Box, Clock,
  AlertTriangle, CalendarDays, Info, User, Users, Activity, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kpi } from '@/components/gestion/gestion-nav'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate } from '@/lib/utils'
import { descargarExcel } from '@/lib/reports'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Recursos operativos › Equipos (ADMIN_SUB_Recursos_Equipos_WEB / MOVIL):
 * equipos menores con serie, modelo, responsable, estado y mantenimiento;
 * ficha con el uso acumulado (las horas se suman entre asignaciones; la
 * cantidad física no: sigue siendo 1), edición, asignación sin solapes e
 * historial. Uso interno, solo gestión operativa: sin control SOAT.
 */
const ESTADO: Record<string, [string, string]> = {
  operativo: ['Operativo', 'bg-success/12 text-success'], no_operativo: ['No operativo', 'bg-destructive/10 text-destructive'], mantenimiento: ['En mantenimiento', 'bg-warning/15 text-warning'],
}
const MANT: Record<string, [string, string]> = {
  vigente: ['Vigente', 'text-success'], proximo: ['Próx. mantenimiento', 'text-warning'], vencido: ['Vencido', 'text-destructive'], sin_fecha: ['Sin fecha', 'text-muted-foreground'],
}

export function EquiposOperativos() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ q: '', crew: '', responsable: '', estado: '', mant: '' })
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [nuevo, setNuevo] = React.useState(false)
  const [porPagina, setPorPagina] = React.useState(10)
  const [pagina, setPagina] = React.useState(0)
  const d = useQuery({
    queryKey: ['equipos', service.id],
    queryFn: async () => {
      const [e, c, m] = await Promise.all([
        sb.from('v_equipos' as any).select('*').eq('service_id', service.id).order('codigo'),
        sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('service_members').select('profile_id, role, profiles(full_name, email)').eq('service_id', service.id),
      ])
      return { e: (e.data ?? []) as any[], c: (c.data ?? []) as any[], m: (m.data ?? []) as any[] }
    },
  })
  const todos = d.data?.e ?? []
  const filas = todos.filter((x) => (!f.crew || x.crew_id === f.crew) && (!f.responsable || x.responsable_id === f.responsable) && (!f.estado || x.estado === f.estado)
    && (!f.mant || x.mantenimiento_estado === f.mant)
    && (!f.q || `${x.codigo} ${x.nombre} ${x.serie ?? ''} ${x.modelo ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina))
  const visibles = filas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  React.useEffect(() => setPagina(0), [f, porPagina])
  const nFiltros = [f.crew, f.responsable, f.estado, f.mant].filter(Boolean).length
  const elegido = todos.find((x) => x.id === abierto) ?? null
  const refrescar = () => qc.invalidateQueries({ queryKey: ['equipos', service.id] })
  const personas = (d.data?.m ?? []).filter((m) => m.role !== 'visor').map((m) => [m.profile_id, m.profiles?.full_name ?? m.profile_id] as [string, string])

  const exportar = () => descargarExcel(`Equipos_${toISODate(new Date())}`, { titulo: 'Equipos operativos', subtitulo: 'Uso interno SERVICON', servicio: service.name, periodo: `Al ${fmtDate(new Date())}`, generadoPor: profile.full_name },
    [{ name: 'Equipos', columns: [
      { header: 'Código', key: 'codigo', width: 12 }, { header: 'Equipo', key: 'nombre', width: 20 }, { header: 'Tipo', key: 'tipo', width: 10 }, { header: 'Serie', key: 'serie', width: 14 },
      { header: 'Modelo', key: 'modelo', width: 22 }, { header: 'Cuadrilla', key: 'crew_name', width: 18 }, { header: 'Responsable', key: 'responsable_nombre', width: 20 },
      { header: 'Estado', key: 'est', width: 16 }, { header: 'Mantenimiento', key: 'mant', width: 14 }, { header: 'Cantidad física', key: 'cantidad_fisica', width: 10 }, { header: 'Uso (h)', key: 'uso_horas', width: 10 },
    ], rows: filas.map((x) => ({ ...x, est: ESTADO[x.estado]?.[0], mant: x.mantenimiento_on ? fmtDate(x.mantenimiento_on) : '—' })) }])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={Wrench} valor={fmtNumber(todos.length)} etiqueta="Equipos (total)" tono="azul" />
        <Kpi icono={CheckCircle2} valor={fmtNumber(todos.filter((x) => x.estado === 'operativo').length)} etiqueta="Operativos" tono="verde" />
        <Kpi icono={XCircle} valor={fmtNumber(todos.filter((x) => x.estado === 'no_operativo').length)} etiqueta="No operativos" tono="rojo" />
        <Kpi icono={Settings2} valor={fmtNumber(todos.filter((x) => x.estado === 'mantenimiento').length)} etiqueta="En mantenimiento" tono="ambar" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar equipo (ej. EQ-DEMO01, hidrolavadora, serie...)" className="pl-9" /></div>
        <Button onClick={() => { setNuevo(true); setAbierto(null) }}><Plus className="size-4" />Registrar equipo</Button>
        <Button variant="outline" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="bg-card rounded-lg border border-border px-3 py-1.5 font-semibold">Filtros ({nFiltros})</span>
        <Sel i={Users} t="Cuadrilla" v={f.crew} set={(v) => setF({ ...f, crew: v })} ops={(d.data?.c ?? []).map((c) => [c.id, `${c.code} · ${c.name}`])} todos="Todas" />
        <Sel i={User} t="Responsable" v={f.responsable} set={(v) => setF({ ...f, responsable: v })} ops={personas} />
        <Sel i={Activity} t="Estado" v={f.estado} set={(v) => setF({ ...f, estado: v })} ops={Object.entries(ESTADO).map(([k, [t]]) => [k, t])} />
        <Sel i={CalendarDays} t="Mantenimiento" v={f.mant} set={(v) => setF({ ...f, mant: v })} ops={Object.entries(MANT).map(([k, [t]]) => [k, t])} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="min-w-0"><CardContent className="p-0">
          {d.isLoading ? <p className="text-muted-foreground p-6 text-[13px]">Cargando…</p> : filas.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-[13px]">{todos.length ? 'Sin equipos con estos filtros.' : 'Aún no hay equipos registrados. Registra el primero (hidrolavadora, desbrozadora, compactadora…).'}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
              <thead className="bg-secondary/50 text-left"><tr>{['Equipo', 'Tipo', 'Serie', 'Modelo', 'Responsable', 'Estado', 'Mantenimiento', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 font-semibold">{t}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {visibles.map((x) => (
                  <tr key={x.id} className={cn('hover:bg-secondary/30', abierto === x.id && 'bg-primary/5')}>
                    <td className="px-3 py-2"><p className="font-semibold">{x.codigo}</p><p className="text-muted-foreground">{x.nombre}</p></td>
                    <td className="px-3 py-2"><span className="bg-secondary rounded-md px-2 py-0.5">{x.tipo}</span></td>
                    <td className="px-3 py-2">{x.serie ?? '—'}</td><td className="px-3 py-2">{x.modelo ?? '—'}</td>
                    <td className="px-3 py-2"><User className="mr-1 inline size-3.5" />{x.responsable_usuario ?? x.responsable_nombre ?? '—'}</td>
                    <td className="px-3 py-2"><span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', ESTADO[x.estado]?.[1])}>● {ESTADO[x.estado]?.[0]}</span></td>
                    <td className={cn('px-3 py-2 whitespace-nowrap', MANT[x.mantenimiento_estado]?.[1])}><CalendarDays className="mr-1 inline size-3.5" />{MANT[x.mantenimiento_estado]?.[0]}{x.mantenimiento_on ? ` (${fmtDate(x.mantenimiento_on)})` : ''}</td>
                    <td className="px-3 py-2"><div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setAbierto(x.id); setNuevo(false) }}><Eye className="size-3.5" />Ver ficha</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAbierto(x.id + '|asignacion'); setNuevo(false) }}><UserPlus className="size-3.5" />Asignar</Button>
                      <Button size="sm" variant="outline" onClick={() => { setAbierto(x.id + '|historial'); setNuevo(false) }}><History className="size-3.5" />Historial</Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {filas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[12.5px]">
              <span>Mostrando {visibles.length} de {filas.length} equipos</span>
              <span className="flex items-center gap-2">Filas por página: <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-card rounded-md border border-border px-2 py-0.5">{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select>
                <button disabled={pagina === 0} onClick={() => setPagina(0)} className="px-1 disabled:opacity-40">«</button><button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className="px-1 disabled:opacity-40">‹</button>
                <span className="bg-primary text-primary-foreground rounded-md px-2">{pagina + 1}</span>
                <button disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)} className="px-1 disabled:opacity-40">›</button><button disabled={pagina >= paginas - 1} onClick={() => setPagina(paginas - 1)} className="px-1 disabled:opacity-40">»</button></span>
            </div>
          )}
        </CardContent></Card>
        {nuevo ? <NuevoEquipo cuadrillas={d.data?.c ?? []} personas={personas} cerrar={() => setNuevo(false)} alGuardar={(id) => { setNuevo(false); refrescar(); setAbierto(id) }} />
          : elegido || abierto ? <FichaEquipo key={abierto} e={elegido ?? todos.find((x) => abierto?.startsWith(x.id))} pestana={(abierto?.split('|')[1] as any) ?? 'detalle'}
              cuadrillas={d.data?.c ?? []} personas={personas} cerrar={() => setAbierto(null)} alGuardar={refrescar} />
          : <Card className="h-fit"><CardContent className="text-muted-foreground p-8 text-center text-[12.5px]">Elige «Ver ficha» para ver el uso acumulado, editar o asignar un equipo.</CardContent></Card>}
      </div>
      <p className="text-muted-foreground text-[12px]"><Info className="mr-1 inline size-3.5" />Uso interno. Solo para gestión operativa (sin control SOAT). Los extintores, botiquines y demás equipos de seguridad se gestionan en <Link href="/vencimientos" className="text-primary underline"><ExternalLink className="mr-0.5 inline size-3" />SSOMA › Vencimientos</Link>.</p>
    </div>
  )
}

function Sel({ i: I, t, v, set, ops, todos = 'Todos' }: { i: any; t: string; v: string; set: (v: string) => void; ops: [string, string][]; todos?: string }) {
  return <label className="bg-card flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5"><I className="text-muted-foreground size-4" /><span className="font-semibold">{t}:</span>
    <select value={v} onChange={(e) => set(e.target.value)} className="max-w-36 bg-transparent outline-none"><option value="">{todos}</option>{ops.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>
}

function NuevoEquipo({ cuadrillas, personas, cerrar, alGuardar }: { cuadrillas: any[]; personas: [string, string][]; cerrar: () => void; alGuardar: (id: string) => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [x, setX] = React.useState({ codigo: '', nombre: '', tipo: 'Equipo', serie: '', modelo: '', mantenimiento_on: '', crew_id: '', responsable_id: '', estado: 'operativo' })
  const [g, setG] = React.useState(false)
  const guardar = async () => {
    setG(true)
    const { data, error } = await sb.rpc('equipo_guardar' as any, { p_service: service.id, p_id: null, p_datos: x, p_motivo: 'Alta de equipo' } as any)
    setG(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Equipo registrado'); alGuardar((data as any).id)
  }
  return (
    <Card className="h-fit"><CardContent className="space-y-2.5 p-4 text-[12.5px]">
      <p className="flex items-center justify-between text-[15px] font-semibold">Registrar equipo<button onClick={cerrar} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button></p>
      <div className="grid grid-cols-2 gap-2">
        <L t="Código *"><Input value={x.codigo} onChange={(e) => setX({ ...x, codigo: e.target.value })} placeholder="EQ-01" className="h-9" /></L>
        <L t="Nombre *"><Input value={x.nombre} onChange={(e) => setX({ ...x, nombre: e.target.value })} placeholder="Hidrolavadora" className="h-9" /></L>
        <L t="Serie *"><Input value={x.serie} onChange={(e) => setX({ ...x, serie: e.target.value })} className="h-9" /></L>
        <L t="Modelo *"><Input value={x.modelo} onChange={(e) => setX({ ...x, modelo: e.target.value })} className="h-9" /></L>
        <L t="Mantenimiento *"><Input type="date" value={x.mantenimiento_on} onChange={(e) => setX({ ...x, mantenimiento_on: e.target.value })} className="h-9" /></L>
        <L t="Estado"><select value={x.estado} onChange={(e) => setX({ ...x, estado: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">{Object.entries(ESTADO).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></L>
        <L t="Cuadrilla"><select value={x.crew_id} onChange={(e) => setX({ ...x, crew_id: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2"><option value="">Sin asignar</option>{cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></L>
        <L t="Responsable"><select value={x.responsable_id} onChange={(e) => setX({ ...x, responsable_id: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2"><option value="">—</option>{personas.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></L>
      </div>
      <p className="bg-info/8 text-info rounded-lg p-2"><Info className="mr-1 inline size-3.5" />Uso interno. Solo para gestión operativa (sin control SOAT).</p>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button onClick={guardar} loading={g} disabled={!x.codigo.trim() || !x.nombre.trim() || !x.serie.trim() || !x.modelo.trim() || !x.mantenimiento_on}><Save className="size-4" />Guardar</Button></div>
    </CardContent></Card>
  )
}

function FichaEquipo({ e, pestana, cuadrillas, personas, cerrar, alGuardar }: { e: any; pestana: 'detalle' | 'asignacion' | 'historial'; cuadrillas: any[]; personas: [string, string][]; cerrar: () => void; alGuardar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState(pestana)
  const [ed, setEd] = React.useState({ serie: e?.serie ?? '', modelo: e?.modelo ?? '', mantenimiento_on: e?.mantenimiento_on ?? '', estado: e?.estado ?? 'operativo' })
  const [as, setAs] = React.useState({ crew: e?.crew_id ?? '', responsable: e?.responsable_id ?? '', desde: toISODate(new Date()), hasta: '', horas: '', motivo: '' })
  const [g, setG] = React.useState(false)
  // El equipo recién creado llega después: el formulario toma sus datos al llegar
  React.useEffect(() => {
    if (!e) return
    setEd({ serie: e.serie ?? '', modelo: e.modelo ?? '', mantenimiento_on: e.mantenimiento_on ?? '', estado: e.estado ?? 'operativo' })
    setAs((x) => ({ ...x, crew: e.crew_id ?? '', responsable: e.responsable_id ?? '' }))
  }, [e?.id, e?.serie, e?.modelo, e?.mantenimiento_on, e?.estado])
  const extra = useQuery({
    queryKey: ['equipo-extra', e?.id],
    enabled: !!e,
    queryFn: async () => {
      const [a, h] = await Promise.all([
        sb.from('equipo_asignaciones' as any).select('*, crews(code, name), profiles:responsable_id(full_name)').eq('equipo_id', e.id).order('desde', { ascending: false }),
        sb.from('audit_log').select('id, created_at, actor_email, action, motivo, table_name, after_data').in('table_name', ['equipos', 'equipo_asignaciones']).or(`record_id.eq.${e.id},after_data->>equipo_id.eq.${e.id}`).order('created_at', { ascending: false }).limit(30),
      ])
      return { a: (a.data ?? []) as any[], h: (h.data ?? []) as any[] }
    },
  })
  if (!e) return null
  const horas: number[] = (e.horas_por_asignacion ?? []).map(Number)
  const guardar = async () => {
    setG(true)
    const { error } = await sb.rpc('equipo_guardar' as any, { p_service: service.id, p_id: e.id, p_datos: ed, p_motivo: 'Edición de datos del equipo' } as any)
    setG(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Equipo actualizado'); alGuardar()
  }
  const asignar = async () => {
    setG(true)
    const { error } = await sb.rpc('equipo_asignar' as any, { p_equipo: e.id, p_crew: as.crew || null, p_responsable: as.responsable || null, p_desde: as.desde, p_hasta: as.hasta || null, p_horas: Number(as.horas || 0), p_motivo: as.motivo } as any)
    setG(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Asignación registrada', { description: 'Las horas se suman al uso; la cantidad física del equipo no cambia.' })
    setAs({ ...as, horas: '', motivo: '' }); alGuardar(); extra.refetch()
  }
  return (
    <Card className="h-fit"><CardContent className="space-y-3 p-4 text-[12.5px]">
      <div className="flex items-start gap-2">
        <span className="bg-info/10 text-info grid size-10 place-items-center rounded-lg"><Wrench className="size-5" /></span>
        <div className="flex-1"><p className="text-[15px] font-bold">{e.codigo}</p><p className="text-muted-foreground">{e.nombre}</p></div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', ESTADO[e.estado]?.[1])}>● {ESTADO[e.estado]?.[0]}</span>
        <button onClick={cerrar} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button>
      </div>
      <div className="bg-secondary flex gap-1 rounded-lg p-1">
        {([['detalle', 'Detalle'], ['asignacion', 'Asignación'], ['historial', 'Historial']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 rounded-md py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{t}</button>
        ))}
      </div>
      {tab === 'detalle' && (<>
        <p className="font-semibold">Información del equipo</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <D i={Layers} t="Código" v={e.codigo} /><D i={Settings2} t="Tipo" v={e.tipo} />
          <D i={Network} t="Cuadrilla" v={e.crew_code ?? 'Sin asignar'} /><D i={User} t="Responsable" v={e.responsable_nombre ?? '—'} />
          <D i={Box} t="Cantidad física" v="1" /><D i={Clock} t="Uso" v={horas.length ? `${horas.map((h) => `${fmtNumber(h, h % 1 ? 1 : 0)} h`).join(' + ')} = ${fmtNumber(e.uso_horas, Number(e.uso_horas) % 1 ? 1 : 0)} h` : '0 h'} />
        </div>
        {e.asignaciones > 1 && <p className="bg-destructive/8 text-destructive flex items-center gap-1.5 rounded-lg p-2"><AlertTriangle className="size-4" />Cantidad física no suma {e.asignaciones}: es 1 equipo con {e.asignaciones} asignaciones.</p>}
        <p className="font-semibold">Datos del equipo (editar)</p>
        <div className="grid grid-cols-3 gap-2">
          <L t="Serie *"><Input value={ed.serie} onChange={(x) => setEd({ ...ed, serie: x.target.value })} className="h-9" /></L>
          <L t="Modelo *"><Input value={ed.modelo} onChange={(x) => setEd({ ...ed, modelo: x.target.value })} className="h-9" /></L>
          <L t="Mantenimiento *"><Input type="date" value={ed.mantenimiento_on} onChange={(x) => setEd({ ...ed, mantenimiento_on: x.target.value })} className="h-9" /></L>
        </div>
        <L t="Estado"><select value={ed.estado} onChange={(x) => setEd({ ...ed, estado: x.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">{Object.entries(ESTADO).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></L>
        <p className="bg-info/8 text-info rounded-lg p-2"><Info className="mr-1 inline size-3.5" />Uso interno. Solo para gestión operativa (sin control SOAT).</p>
        <div className="flex gap-2"><Button onClick={guardar} loading={g} disabled={!ed.serie.trim() || !ed.modelo.trim() || !ed.mantenimiento_on}><Save className="size-4" />Guardar</Button>
          <Button variant="outline" onClick={() => setEd({ serie: e.serie ?? '', modelo: e.modelo ?? '', mantenimiento_on: e.mantenimiento_on ?? '', estado: e.estado })}><X className="size-4" />Cancelar</Button></div>
      </>)}
      {tab === 'asignacion' && (<>
        <div className="grid grid-cols-2 gap-2">
          <L t="Cuadrilla"><select value={as.crew} onChange={(x) => setAs({ ...as, crew: x.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2"><option value="">—</option>{cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></L>
          <L t="Responsable"><select value={as.responsable} onChange={(x) => setAs({ ...as, responsable: x.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2"><option value="">—</option>{personas.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></L>
          <L t="Desde *"><Input type="date" value={as.desde} onChange={(x) => setAs({ ...as, desde: x.target.value })} className="h-9" /></L>
          <L t="Hasta"><Input type="date" value={as.hasta} onChange={(x) => setAs({ ...as, hasta: x.target.value })} className="h-9" /></L>
          <L t="Horas de uso"><Input type="number" step="0.5" value={as.horas} onChange={(x) => setAs({ ...as, horas: x.target.value })} className="h-9" /></L>
          <L t="Motivo *"><Input value={as.motivo} onChange={(x) => setAs({ ...as, motivo: x.target.value })} className="h-9" /></L>
        </div>
        <Button onClick={asignar} loading={g} disabled={!as.desde || !as.motivo.trim()}><UserPlus className="size-4" />Asignar</Button>
        <p className="text-muted-foreground">Una asignación que se cruza en fechas con otra cuadrilla no se guarda. Las horas se suman al uso; la cantidad física sigue siendo 1.</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(extra.data?.a ?? []).map((a) => <li key={a.id} className="p-2"><strong>{a.crews?.code ?? '—'}</strong> · {fmtDate(a.desde)}{a.hasta ? ` – ${fmtDate(a.hasta)}` : ' – vigente'} · {fmtNumber(a.horas, 1)} h · {a.profiles?.full_name ?? ''}<p className="text-muted-foreground">{a.motivo}</p></li>)}
          {!(extra.data?.a ?? []).length && <li className="text-muted-foreground p-2">Sin asignaciones todavía.</li>}
        </ul>
      </>)}
      {tab === 'historial' && (
        <ul className="space-y-1.5 border-l-2 border-border pl-3">
          {(extra.data?.h ?? []).map((h) => <li key={h.id}><span className="text-muted-foreground">{fmtDateTime(h.created_at)}</span> · <strong>{h.table_name === 'equipos' ? (h.action === 'INSERT' ? 'Alta del equipo' : 'Edición del equipo') : 'Asignación'}</strong> · {(h.actor_email ?? 'Sistema').split('@')[0]}{h.motivo ? ` · ${h.motivo}` : ''}</li>)}
          {!(extra.data?.h ?? []).length && <li className="text-muted-foreground">Sin eventos.</li>}
        </ul>
      )}
    </CardContent></Card>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) { return <label className="block space-y-1"><span className="font-semibold">{t}</span>{children}</label> }
function D({ i: I, t, v }: { i: any; t: string; v: React.ReactNode }) { return <p className="flex items-start gap-1.5"><I className="text-muted-foreground mt-0.5 size-4" /><span><span className="text-muted-foreground block text-[11px]">{t}</span><strong>{v}</strong></span></p> }
