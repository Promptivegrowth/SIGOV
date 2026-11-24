'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert, Clock, CheckCircle2, Bell, List, Search, Calendar, Tag, Hash, Eye, Check, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { Kpi } from './gestion-nav'

/**
 * «Alertas del sistema» (A09): sincronización fallida, usuario bloqueado,
 * caja con saldo bajo, cuadrilla sin supervisor, ítems PCI vencidos,
 * evidencia incompleta, mantenimiento de vehículo, ausencia de rendición,
 * programación duplicada o con cruce y datos inconsistentes; se filtran por
 * área/cuadrilla, rol/origen y período.
 * Se calculan de los datos (no se escriben a mano); cada una lleva a su
 * acción, y «Marcar como atendida» queda registrado con quién y cuándo.
 */
const SEV: Record<string, { t: string; c: string; i: any }> = {
  critica: { t: 'Crítica', c: 'bg-destructive/12 text-destructive', i: TriangleAlert }, pendiente: { t: 'Pendiente', c: 'bg-warning/15 text-warning', i: Clock },
  informativa: { t: 'Informativa', c: 'bg-info/12 text-info', i: Bell }, resuelta: { t: 'Resuelta', c: 'bg-success/12 text-success', i: CheckCircle2 },
}

export function AlertasSistema() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [filtro, setFiltro] = React.useState('todas')
  const [q, setQ] = React.useState('')
  const [abierta, setAbierta] = React.useState('')
  const [verFiltros, setVerFiltros] = React.useState(false)
  const vacio = { area: '', origen: '', periodo: '' }
  const [b, setB] = React.useState(vacio)
  const [ff, setFf] = React.useState(vacio)
  const datos = useQuery({ queryKey: ['alertas-sistema', service.id], queryFn: async () => ((await sb.rpc('alertas_sistema' as any, { p_service: service.id } as any)).data ?? []) as any[] })
  const todas = datos.data ?? []
  const n = (s: string) => todas.filter((a) => a.severidad === s).length
  const desdePeriodo = ff.periodo === 'hoy' ? Date.now() - 86400000 : ff.periodo === '7d' ? Date.now() - 7 * 86400000 : ff.periodo === '30d' ? Date.now() - 30 * 86400000 : 0
  const filas = todas.filter((a) => (filtro === 'todas' || a.severidad === filtro) && (!q || `${a.titulo} ${a.descripcion} ${a.referencia}`.toLowerCase().includes(q.toLowerCase()))
    && (!ff.area || a.area === ff.area || String(a.referencia ?? '').includes(ff.area)) && (!ff.origen || a.origen === ff.origen)
    && (!desdePeriodo || (a.cuando && new Date(a.cuando).getTime() >= desdePeriodo)))
  const opciones = (k: string) => [...new Set(todas.map((a) => a[k]).filter(Boolean))].sort() as string[]
  const crewsEnAlertas = [...new Set(todas.flatMap((a) => String(a.referencia ?? '').match(/CUA_\d+/g) ?? []))].sort()
  const atender = async (a: any) => {
    const { error } = await sb.rpc('alerta_atender' as any, { p_service: service.id, p_clave: a.clave, p_nota: null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Alerta marcada como atendida'); qc.invalidateQueries({ queryKey: ['alertas-sistema'] })
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={TriangleAlert} valor={n('critica')} etiqueta="Críticas" tono="rojo" />
        <Kpi icono={Clock} valor={n('pendiente')} etiqueta="Pendientes" tono="ambar" />
        <Kpi icono={CheckCircle2} valor={n('resuelta')} etiqueta="Resueltas" tono="verde" />
        <Kpi icono={Bell} valor={todas.length} etiqueta="Total alertas" tono="azul" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[['todas', `Todas (${todas.length})`, List], ['critica', `Críticas (${n('critica')})`, TriangleAlert], ['pendiente', `Pendientes (${n('pendiente')})`, Clock], ['resuelta', `Resueltas (${n('resuelta')})`, CheckCircle2]].map(([k, t, I]: any) => (
          <button key={k} onClick={() => setFiltro(k)} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold', filtro === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}><I className="size-3.5" />{t}</button>
        ))}
        <div className="relative min-w-56 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar alerta por título, contexto o referencia..." className="pl-8" /></div>
        <Button variant="outline" onClick={() => setVerFiltros(!verFiltros)}><SlidersHorizontal className="size-4" />Filtros{Object.values(ff).some(Boolean) ? ' ●' : ''}</Button>
      </div>
      {verFiltros && (
        <Card><CardContent className="flex flex-wrap items-end gap-3 p-3 text-[12.5px]">
          <label><span className="text-muted-foreground block">Área / Cuadrilla</span>
            <select value={b.area} onChange={(e) => setB({ ...b, area: e.target.value })} className="bg-card h-9 min-w-44 rounded-md border border-border px-2">
              <option value="">Todas</option>{opciones('area').map((x) => <option key={x} value={x}>{x}</option>)}{crewsEnAlertas.map((x) => <option key={x} value={x}>Cuadrilla {x}</option>)}</select></label>
          <label><span className="text-muted-foreground block">Rol / Origen</span>
            <select value={b.origen} onChange={(e) => setB({ ...b, origen: e.target.value })} className="bg-card h-9 min-w-44 rounded-md border border-border px-2">
              <option value="">Todos</option>{opciones('origen').map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          <label><span className="text-muted-foreground block">Periodo</span>
            <select value={b.periodo} onChange={(e) => setB({ ...b, periodo: e.target.value })} className="bg-card h-9 min-w-36 rounded-md border border-border px-2">
              <option value="">Todo</option><option value="hoy">Últimas 24 h</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option></select></label>
          <Button size="sm" onClick={() => setFf(b)}>Aplicar</Button>
          <Button size="sm" variant="outline" onClick={() => { setB(vacio); setFf(vacio) }}>Limpiar</Button>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Alertas registradas</CardTitle><span className="text-muted-foreground text-[12px]">{filas.length} alertas</span></CardHeader>
        <CardContent className="space-y-2">
          {filas.length === 0 && <p className="text-muted-foreground text-[13px]">Sin alertas en este filtro.</p>}
          {filas.map((a) => {
            const s = SEV[a.severidad] ?? SEV.informativa
            return (
              <div key={a.clave} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3 text-[12.5px]">
                <span className={cn('grid size-9 place-items-center rounded-lg', s.c)}><s.i className="size-4" /></span>
                <div className="min-w-60 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{a.titulo}<span className={cn('rounded-full px-2 py-0.5 text-[11px]', s.c)}>{s.t}</span></p>
                  <p className="text-muted-foreground">{a.descripcion}</p>
                  <p className="text-muted-foreground mt-1 flex flex-wrap gap-3 text-[11.5px]"><span><Calendar className="mr-1 inline size-3" />{a.cuando ? fmtDateTime(a.cuando) : '—'}</span>
                    <span><Tag className="mr-1 inline size-3" />{a.tipo} · {a.area}</span><span><Hash className="mr-1 inline size-3" />{a.referencia}</span><span>Origen: {a.origen}</span></p>
                  {abierta === a.clave && <p className="bg-secondary/60 mt-2 rounded-md p-2">{a.atendida_at ? `Atendida el ${fmtDateTime(a.atendida_at)}. ` : ''}Se calcula de los datos del sistema: desaparece sola cuando la causa se corrige.</p>}
                </div>
                <span className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setAbierta(abierta === a.clave ? '' : a.clave)}><Eye className="size-3.5" />Ver detalle</Button>
                  {a.severidad === 'resuelta' ? <span className="text-success flex items-center gap-1 px-2"><Check className="size-3.5" />Atendida</span> : (
                    <>
                      <Link href={a.url}><Button size="sm">{a.accion}</Button></Link>
                      <Button size="sm" variant="outline" className="border-success/50 text-success" onClick={() => atender(a)}><Check className="size-3.5" />Marcar como atendida</Button>
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
