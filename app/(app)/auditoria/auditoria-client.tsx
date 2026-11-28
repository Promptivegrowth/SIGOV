'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
  FileText, CheckCircle2, AlertTriangle, XCircle, KeyRound, List, Search, Download, CalendarDays, User, Layers, MousePointerClick,
  Eye, X, Filter, Info, ShieldCheck, MapPin, MessageSquare, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { Kpi } from '@/components/gestion/gestion-nav'
import { descargarExcel } from '@/lib/reports'
import { moduloDeTabla } from '@/lib/bitacora'
import { fmtDateTime, fmtNumber, toISODate, addDays, cn } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Bitácora del sistema (ADMIN_Auditoria_WEB_V2 / MOVIL_V2; apartado 7.6).
 *
 * Eventos y accesos en una sola lista, con su resultado (Correcto,
 * Advertencia, Fallido), filtros por usuario, módulo, acción y resultado, y
 * el detalle del evento con lo que cambió (antes → después), el motivo y el
 * historial del registro. Inalterable y de solo lectura: no se edita ni se
 * borra desde aquí.
 */
const RES: Record<string, { t: string; c: string; i: any; tono: string }> = {
  correcto: { t: 'Correcto', c: 'bg-success/12 text-success', i: CheckCircle2, tono: 'text-success' },
  advertencia: { t: 'Advertencia', c: 'bg-warning/15 text-warning', i: AlertTriangle, tono: 'text-warning' },
  fallido: { t: 'Fallido', c: 'bg-destructive/10 text-destructive', i: XCircle, tono: 'text-destructive' },
}
type Pildora = 'todos' | 'correcto' | 'advertencia' | 'fallido' | 'accesos'
const OCULTOS = new Set(['updated_at', 'created_at', 'version', 'geom', 'search', 'tsv'])
const iniciales = (u: string) => (u || '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?'

export function AuditoriaClient() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const sp = useSearchParams()
  const [f, setF] = React.useState({ desde: toISODate(addDays(new Date(), -1)), hasta: toISODate(new Date()), q: '', usuario: '', modulo: '', accion: '', resultado: '' })
  const [pildora, setPildora] = React.useState<Pildora>('todos')
  const [abierto, setAbierto] = React.useState<string | null>(sp.get('evento'))
  // ADM-02: en el celular el detalle queda debajo de la tabla; al abrirlo se lleva la vista a él
  const detalleRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (abierto && window.innerWidth < 1280) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [abierto])
  const [porPagina, setPorPagina] = React.useState(25)
  const [pagina, setPagina] = React.useState(0)

  const q = useQuery({
    queryKey: ['bitacora', service.id, f.desde, f.hasta],
    queryFn: async () => {
      const { data, error } = await sb.rpc('bitacora_eventos' as any, { p_service: service.id, p_desde: f.desde, p_hasta: f.hasta } as any)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
  const todos = q.data ?? []
  const base = todos.filter((e) => (!f.usuario || e.usuario === f.usuario) && (!f.modulo || moduloDe(e) === f.modulo)
    && (!f.accion || e.accion === f.accion) && (!f.resultado || e.resultado === f.resultado)
    && (!f.q || `${e.codigo} ${e.usuario} ${e.accion} ${moduloDe(e)} ${e.referencia ?? ''} ${e.record_id ?? ''} ${e.motivo ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  const filas = base.filter((e) => pildora === 'todos' || (pildora === 'accesos' ? e.origen === 'acceso' : e.resultado === pildora))
  const cuenta = (r: string) => base.filter((e) => e.resultado === r).length
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina))
  const visibles = filas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  React.useEffect(() => setPagina(0), [f, pildora, porPagina])
  const elegido = todos.find((e) => e.id === abierto) ?? null
  const unicos = (k: (e: any) => string) => [...new Set(todos.map(k).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const hayFiltros = !!(f.q || f.usuario || f.modulo || f.accion || f.resultado)

  const exportar = () => descargarExcel(`Bitacora_filtrada_${f.desde}_${f.hasta}`,
    { titulo: 'Bitácora del sistema', servicio: service.name, periodo: `Del ${f.desde} al ${f.hasta}`, generadoPor: '',
      filtros: [f.usuario && `Usuario ${f.usuario}`, f.modulo && `Módulo ${f.modulo}`, f.accion && `Acción ${f.accion}`, f.resultado && `Resultado ${RES[f.resultado]?.t}`, pildora !== 'todos' && pildora, f.q && `«${f.q}»`].filter(Boolean).join(' · ') || undefined },
    [{ name: 'Bitácora', columns: [
      { header: 'Registro', key: 'codigo', width: 14 }, { header: 'Fecha y hora', key: 'fecha', width: 19 }, { header: 'Usuario', key: 'usuario', width: 20 },
      { header: 'Módulo', key: 'modulo', width: 24 }, { header: 'Acción', key: 'accion', width: 22 }, { header: 'Referencia', key: 'referencia', width: 30 },
      { header: 'Resultado', key: 'res', width: 13 }, { header: 'Motivo', key: 'motivo', width: 40 }, { header: 'Id del registro', key: 'record_id', width: 38 },
    ], rows: filas.map((e) => ({ ...e, fecha: fmtDateTime(e.at), modulo: moduloDe(e), res: RES[e.resultado]?.t })) }])

  return (
    <>
      <PageHeader title="Bitácora del sistema" description="Registro inalterable de eventos, acciones y accesos del SIGOV" />
      <PageBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={FileText} valor={fmtNumber(base.length)} etiqueta="Eventos" tono="azul" />
          <Kpi icono={CheckCircle2} valor={fmtNumber(cuenta('correcto'))} etiqueta="Correctos" tono="verde" />
          <Kpi icono={AlertTriangle} valor={fmtNumber(cuenta('advertencia'))} etiqueta="Advertencias" tono="ambar" />
          <Kpi icono={XCircle} valor={fmtNumber(cuenta('fallido'))} etiqueta="Fallidos" tono="rojo" />
        </div>
        <div className="flex flex-wrap gap-2">
          {([['todos', `Todos (${base.length})`, List, ''], ['correcto', `Correctos (${cuenta('correcto')})`, CheckCircle2, 'text-success'],
            ['advertencia', `Advertencias (${cuenta('advertencia')})`, AlertTriangle, 'text-warning'], ['fallido', `Fallidos (${cuenta('fallido')})`, XCircle, 'text-destructive'],
            ['accesos', 'Accesos', KeyRound, '']] as const).map(([k, t, I, c]) => (
            <button key={k} onClick={() => setPildora(k)} className={cn('flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
              pildora === k ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border hover:bg-secondary')}>
              <I className={cn('size-4', pildora !== k && c)} />{t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por evento o registro..." className="pl-9" /></div>
          <Button onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar filtrado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Campo i={CalendarDays} t="Fecha inicial"><input type="date" value={f.desde} max={f.hasta} onChange={(e) => e.target.value && setF({ ...f, desde: e.target.value })} className="bg-transparent outline-none" /></Campo>
          <Campo i={CalendarDays} t="Fecha final"><input type="date" value={f.hasta} min={f.desde} onChange={(e) => e.target.value && setF({ ...f, hasta: e.target.value })} className="bg-transparent outline-none" /></Campo>
          <Campo i={User} t="Usuario"><Sel v={f.usuario} set={(v) => setF({ ...f, usuario: v })} ops={unicos((e) => e.usuario)} /></Campo>
          <Campo i={Layers} t="Módulo"><Sel v={f.modulo} set={(v) => setF({ ...f, modulo: v })} ops={unicos(moduloDe)} /></Campo>
          <Campo i={MousePointerClick} t="Acción"><Sel v={f.accion} set={(v) => setF({ ...f, accion: v })} ops={unicos((e) => e.accion)} todos="Todas" /></Campo>
          <Campo i={CheckCircle2} t="Resultado"><Sel v={f.resultado} set={(v) => setF({ ...f, resultado: v })} ops={['correcto', 'advertencia', 'fallido']} nombre={(v) => RES[v].t} /></Campo>
          {hayFiltros && <button onClick={() => setF({ ...f, q: '', usuario: '', modulo: '', accion: '', resultado: '' })} className="text-info flex items-center gap-1 text-[12.5px] font-semibold"><Filter className="size-3.5" />Limpiar filtros</button>}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[14px]">Registros de bitácora ({fmtNumber(filas.length)} eventos)</CardTitle>
              <span className="text-muted-foreground text-[12px]">Mostrando {fmtNumber(visibles.length)} de {fmtNumber(filas.length)} eventos</span>
            </CardHeader>
            <CardContent className="p-0">
              {q.isLoading ? <div className="p-4"><SkeletonList rows={8} /></div> : q.isError ? <p className="text-destructive p-5 text-[13px]">{mensajeAmigable(q.error, 'No se pudo cargar la bitácora')}</p>
                : filas.length === 0 ? <p className="text-muted-foreground p-8 text-center text-[13px]">Sin eventos con estos filtros. Amplía el rango de fechas o quita filtros.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-secondary/50 text-left"><tr>
                      <th className="w-8 px-3 py-2"></th><th className="px-3 py-2 font-semibold">Fecha y hora</th><th className="px-3 py-2 font-semibold">Usuario</th>
                      <th className="px-3 py-2 font-semibold">Módulo</th><th className="px-3 py-2 font-semibold">Acción</th><th className="px-3 py-2 font-semibold">Registro</th>
                      <th className="px-3 py-2 font-semibold">Resultado</th><th className="px-3 py-2 text-center font-semibold">Acciones</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {visibles.map((e) => {
                        const R = RES[e.resultado] ?? RES.correcto
                        return (
                          <tr key={e.id} id={'evento-' + e.id} className={cn('scroll-mt-24 hover:bg-secondary/30', abierto === e.id && 'bg-primary/5 outline outline-1 outline-primary/40')}>
                            <td className="px-3 py-2"><span className="flex items-center gap-1.5"><R.i className={cn('size-4', R.tono)} />
                              {/* La acción visible sin desplazar la tabla en el celular */}
                              <Button size="sm" variant={abierto === e.id ? 'default' : 'outline'} className="h-7 px-2 xl:hidden" aria-label="Ver detalle" onClick={() => setAbierto(abierto === e.id ? null : e.id)}><Eye className="size-3.5" /></Button></span></td>
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(e.at)}</td>
                            <td className="px-3 py-2"><span className="flex items-center gap-1.5"><span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full text-[10px] font-bold">{iniciales(e.usuario)}</span>{e.usuario}</span></td>
                            <td className="px-3 py-2">{moduloDe(e)}</td>
                            <td className="px-3 py-2">{e.accion}</td>
                            <td className="px-3 py-2"><p className="font-semibold">{e.codigo}</p>{e.referencia && <p className="text-muted-foreground max-w-48 truncate">{e.referencia}</p>}</td>
                            <td className="px-3 py-2"><span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', R.c)}>● {R.t}</span></td>
                            <td className="px-3 py-2 text-center"><Button size="sm" variant={abierto === e.id ? 'default' : 'outline'} onClick={() => setAbierto(abierto === e.id ? null : e.id)}><Eye className="size-3.5" />Ver detalle</Button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
            {filas.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[12.5px]">
                <span className="flex items-center gap-2">Mostrar<select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-card rounded-md border border-border px-2 py-1">{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>por página</span>
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
                  <span className="px-2 tabular-nums">Página {pagina + 1} de {paginas}</span>
                  <Button size="sm" variant="outline" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
                </span>
              </div>
            )}
          </Card>
          <div ref={detalleRef} className="scroll-mt-24">
            <DetalleEvento e={elegido} cerrar={() => {
              const id = abierto
              setAbierto(null)
              if (window.innerWidth < 1280) setTimeout(() => document.getElementById('evento-' + id)?.scrollIntoView({ block: 'center' }), 60)
            }} />
          </div>
        </div>
      </PageBody>
    </>
  )
}

const moduloDe = (e: any) => (e.origen === 'acceso' ? 'Accesos' : moduloDeTabla(e.tabla))

function Campo({ i: I, t, children }: { i: any; t: string; children: React.ReactNode }) {
  return <label className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px]"><I className="text-muted-foreground size-4" /><span className="font-semibold">{t}:</span>{children}</label>
}
function Sel({ v, set, ops, todos = 'Todos', nombre }: { v: string; set: (v: string) => void; ops: string[]; todos?: string; nombre?: (v: string) => string }) {
  return <select value={v} onChange={(e) => set(e.target.value)} className="max-w-44 bg-transparent outline-none"><option value="">{todos}</option>{ops.map((o) => <option key={o} value={o}>{nombre ? nombre(o) : o}</option>)}</select>
}

function DetalleEvento({ e, cerrar }: { e: any | null; cerrar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const detalle = useQuery({
    queryKey: ['bitacora-detalle', e?.id],
    enabled: !!e,
    queryFn: async () => {
      if (e.origen === 'acceso') {
        const { data } = await sb.from('accesos' as any).select('*').eq('id', e.id).maybeSingle()
        return { fila: data, historial: [] as any[] }
      }
      const { data: fila } = await sb.from('audit_log').select('*').eq('id', Number(e.id)).maybeSingle()
      const { data: historial } = fila?.record_id
        ? await sb.from('audit_log').select('id, created_at, actor_email, action, motivo, after_data, before_data').eq('table_name', fila.table_name).eq('record_id', fila.record_id).order('created_at').limit(30)
        : { data: [] as any[] }
      return { fila, historial: historial ?? [] }
    },
  })
  // Para decir «Pedregal → Vítor» en vez de dos identificadores
  const nombres = useQuery({
    queryKey: ['bitacora-nombres', service.id],
    queryFn: async () => {
      const [c, m] = await Promise.all([
        sb.from('crews').select('id, code, name').eq('service_id', service.id),
        sb.from('service_members').select('profile_id, profiles(full_name)').eq('service_id', service.id),
      ])
      const mapa = new Map<string, string>()
      for (const x of (c.data ?? []) as any[]) mapa.set(x.id, `${x.code} · ${x.name}`)
      for (const x of (m.data ?? []) as any[]) mapa.set(x.profile_id, x.profiles?.full_name ?? x.profile_id)
      return mapa
    },
    staleTime: 10 * 60_000,
  })
  if (!e) {
    return <Card className="h-fit"><CardContent className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-[12.5px]"><Eye className="size-6" />Elige «Ver detalle» en un evento para ver qué cambió, el motivo y su historial.</CardContent></Card>
  }
  const R = RES[e.resultado] ?? RES.correcto
  const fila: any = detalle.data?.fila
  const valor = (v: any) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : nombres.data?.get(String(v)) ?? String(v))
  const cambios = e.origen === 'bitacora' && fila
    ? Object.keys({ ...(fila.before_data ?? {}), ...(fila.after_data ?? {}) })
        .filter((k) => !OCULTOS.has(k) && JSON.stringify(fila.before_data?.[k] ?? null) !== JSON.stringify(fila.after_data?.[k] ?? null))
    : []
  const titulo = (h: any) => `${h.action === 'INSERT' ? 'Registro creado' : h.action === 'DELETE' ? 'Registro eliminado' : 'Actualización del registro'}`

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-[15px]">Detalle del evento: {e.codigo}<span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', R.c)}>● {R.t}</span></CardTitle>
          <p className="text-muted-foreground text-[12px]">{e.accion} · {moduloDe(e)}</p>
        </div>
        <button onClick={cerrar} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button>
      </CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <div>
          <p className="mb-1.5 font-semibold">Información del evento</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Dato t="Módulo" v={moduloDe(e)} /><Dato t="Acción" v={e.accion} />
            <Dato t="Registro" v={<span className="bg-info/10 text-info rounded px-1.5 font-semibold">{e.codigo}</span>} /><Dato t="Versión" v={e.version ?? '—'} />
            <Dato t="Actor" v={e.usuario} /><Dato t="Fecha y hora" v={fmtDateTime(e.at)} />
            <Dato t="Origen del cambio" v={!e.usuario || /^sistema$/i.test(e.usuario) ? 'Automático (proceso del sistema, sin usuario)' : 'Manual (acción de un usuario)'} />
          </div>
          {e.referencia && <p className="mt-1.5"><span className="text-muted-foreground">Detalle:</span> <strong>{e.referencia}</strong></p>}
        </div>
        {detalle.isLoading ? <SkeletonList rows={3} /> : (
          <>
            {cambios.length > 0 && (
              <div>
                <p className="mb-1.5 font-semibold">Antes → Después</p>
                <ul className="space-y-1.5">
                  {cambios.slice(0, 12).map((k) => (
                    <li key={k} className="grid grid-cols-[110px_1fr_auto_1fr] items-center gap-1.5">
                      <span className="text-muted-foreground truncate" title={k}>{k}</span>
                      <span className="bg-info/8 flex items-center gap-1 truncate rounded px-1.5 py-1"><MapPin className="size-3 shrink-0" />{valor(fila.before_data?.[k])}</span>
                      <ArrowRight className="text-muted-foreground size-3.5" />
                      <span className="bg-success/10 truncate rounded px-1.5 py-1">{valor(fila.after_data?.[k])}</span>
                    </li>
                  ))}
                </ul>
                {cambios.length > 12 && <p className="text-muted-foreground mt-1">y {cambios.length - 12} campos más</p>}
              </div>
            )}
            {e.motivo && <p className="flex gap-2"><MessageSquare className="text-muted-foreground mt-0.5 size-4 shrink-0" /><span><strong>Motivo:</strong> {e.motivo}</span></p>}
            {e.origen === 'acceso' && fila && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Dato t="Dispositivo" v={fila.dispositivo ?? '—'} /><Dato t="Plataforma" v={fila.plataforma ?? '—'} />
                <Dato t="IP" v={fila.ip ?? '—'} /><Dato t="Usuario ingresado" v={fila.usuario ?? '—'} />
              </div>
            )}
            {e.origen === 'bitacora' && (
              <div>
                <p className="mb-1.5 flex items-center gap-2 font-semibold">Historial del evento (inalterable)<span className="bg-info/10 text-info flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"><Info className="size-3" />Solo lectura</span></p>
                <ul className="space-y-2 border-l-2 border-border pl-3">
                  {(detalle.data?.historial ?? []).map((h: any) => (
                    <li key={h.id} className="relative">
                      <span className={cn('absolute top-1 -left-[18px] size-2.5 rounded-full', String(h.id) === e.id ? 'bg-success' : 'bg-muted-foreground/50')} />
                      <p><span className="text-muted-foreground">{fmtDateTime(h.created_at)}</span> · <strong>{titulo(h)}</strong>{String(h.id) === e.id && <span className="text-success"> (este evento)</span>}</p>
                      <p className="text-muted-foreground">Actor: {(h.actor_email ?? 'Sistema').split('@')[0]} · EVT{String(h.id).padStart(6, '0')}{h.after_data?.version ? ` · Versión ${h.after_data.version}` : ''}{h.motivo ? ` · ${h.motivo}` : ''}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <p className="bg-secondary flex gap-2 rounded-lg p-2.5"><ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />La bitácora es inalterable y de solo lectura. No es posible editar ni eliminar registros.</p>
      </CardContent>
    </Card>
  )
}

function Dato({ t, v }: { t: string; v: React.ReactNode }) {
  return <p><span className="text-muted-foreground block text-[11px]">{t}</span><span className="font-semibold">{v}</span></p>
}
