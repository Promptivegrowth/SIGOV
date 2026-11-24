'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Eye, Search, Smartphone, Monitor, HardHat, User, Activity, Layers,
  WifiOff, Ban, ArrowLeftRight, Info, X, Laptop, FileText, Settings, ShieldCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { Kpi } from '@/components/gestion/gestion-nav'
import { cn, fmtDateTime, fmtNumber, fmtProgresiva } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { toast } from 'sonner'

/**
 * Gestión de sincronización de registros (ADMIN_Sincronizacion_WEB_V2 /
 * MOVIL_V2): cada equipo con su último contacto, última confirmación, cola
 * de registros y fotos, errores y conflictos; «Reintentar seleccionados»;
 * y el detalle del conflicto para comparar versiones sin sobrescribir.
 * Supervisor: sus cuadrillas; Residente y Administrador: el contrato.
 */
const ESTADO: Record<string, { t: string; c: string; i: any }> = {
  confirmado: { t: 'Confirmado', c: 'bg-success/12 text-success', i: CheckCircle2 },
  en_cola: { t: 'En cola', c: 'bg-warning/15 text-warning', i: Clock },
  error: { t: 'Error', c: 'bg-destructive/10 text-destructive', i: XCircle },
  conflicto: { t: 'Conflicto', c: 'bg-warning/15 text-warning', i: AlertTriangle },
  sin_conexion: { t: 'Sin conexión', c: 'bg-secondary text-muted-foreground', i: WifiOff },
}
const CAMPO: Record<string, string> = {
  quantity: 'Metrado', prog_start_m: 'Progresiva inicial', prog_end_m: 'Progresiva final', side: 'Lado', section_id: 'Tramo',
  observation: 'Observación', hora_inicio: 'Hora de inicio', hora_fin: 'Hora de fin', personas: 'Personas', longitud_m: 'Longitud (m)',
  ancho_m: 'Ancho (m)', espesor_m: 'Espesor (m)', activity_id: 'Actividad', exceso_motivo: 'Motivo del exceso', deleted_at: 'Dado de baja',
}
const valorCampo = (k: string, v: any) => (v == null || v === '' ? '—' : k.startsWith('prog_') ? fmtProgresiva(Number(v)) : k === 'deleted_at' ? fmtDateTime(v) : String(v))
const MODULO: Record<string, string> = { work_entries: 'Actividad ejecutada' }
const clave = (d: any) => `${d.profile_id}|${d.device_id}`
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
const hora = (d?: string | null) => (d ? fmtDateTime(d) : '—')

type Pestana = 'dispositivos' | 'sincronizaciones' | 'registros' | 'configuracion'

export function GestionSincronizacion({ esteEquipo }: { esteEquipo: React.ReactNode }) {
  const { service, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [pestana, setPestana] = React.useState<Pestana>('dispositivos')
  const [f, setF] = React.useState({ q: '', crew: '', usuario: '', plataforma: '', modulo: '', estado: '' })
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [comparar, setComparar] = React.useState<any | null>(null)
  const [porPagina, setPorPagina] = React.useState(25)
  const [pagina, setPagina] = React.useState(0)

  const q = useQuery({
    queryKey: ['sync-dispositivos', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('sincronizacion_dispositivos' as any, { p_service: service.id } as any)
      if (error) throw error
      return data as any
    },
    refetchInterval: 60_000,
  })
  const d = q.data
  const todos: any[] = d?.dispositivos ?? []
  const conflictos: any[] = d?.conflictos ?? []
  const filas = todos.filter((x) => (!f.crew || x.crew_code === f.crew) && (!f.usuario || x.profile_id === f.usuario)
    && (!f.plataforma || x.plataforma === f.plataforma) && (!f.estado || x.estado === f.estado)
    && (!f.modulo || conflictos.some((k) => k.profile_id === x.profile_id && k.tabla === f.modulo))
    && (!f.q || `${x.nombre} ${x.usuario} ${x.crew_code ?? ''} ${x.crew_name ?? ''} ${x.device_label ?? ''} ${x.device_id}
      ${conflictos.filter((k) => k.profile_id === x.profile_id).map((k) => k.referencia).join(' ')}`.toLowerCase().includes(f.q.toLowerCase())))
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina))
  const visibles = filas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  React.useEffect(() => setPagina(0), [f, porPagina])
  const elegido = todos.find((x) => clave(x) === abierto) ?? null
  const r = d?.resumen ?? {}
  const titulo = role === 'supervisor' ? 'Sincronización de mis cuadrillas' : 'Gestión de sincronización de registros'
  const quien = role === 'admin' ? 'Administrador' : role === 'residente' ? 'Residente' : 'Supervisor'

  const reintentar = async (equipos: any[]) => {
    if (!equipos.length) return
    const { data, error } = await sb.rpc('sync_reintentar' as any, { p_service: service.id, p_equipos: equipos.map((x) => ({ profile_id: x.profile_id, device_id: x.device_id })) } as any)
    if (error) { toast.error(mensajeAmigable(error, 'No se pudo pedir el reintento')); return }
    const res = data as any
    toast.success(`Reintento pedido a ${res.solicitados} ${res.solicitados === 1 ? 'equipo' : 'equipos'}`, {
      description: (res.ya_pendientes ? `${res.ya_pendientes} ya lo tenía pendiente. ` : '') + 'Cada equipo lo recibe en su próximo contacto; repetirlo no duplica registros.',
    })
    setSel(new Set())
    qc.invalidateQueries({ queryKey: ['sync-dispositivos', service.id] })
  }

  const opciones = (xs: [string, string][]) => [...new Map(xs).entries()].sort((a, b) => a[1].localeCompare(b[1]))

  return (
    <>
      <PageHeader title={titulo} description={`${quien} · Monitoreo, confirmación y resolución de registros de campo`}
        actions={<span className="text-muted-foreground text-[12px]">Actualizado: {hora(d?.actualizado)}</span>} />
      <PageBody className="space-y-4">
        <div className="bg-secondary flex flex-wrap gap-1 rounded-lg p-1">
          {([['dispositivos', 'Dispositivos', Laptop], ['sincronizaciones', 'Sincronizaciones', Layers], ['registros', 'Registros', FileText], ['configuracion', 'Configuración', Settings]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => setPestana(k)} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
              pestana === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <I className="size-3.5" />{t}{k === 'registros' && conflictos.filter((c) => c.estado === 'abierto').length > 0 && <span className="bg-warning ml-1 rounded-full px-1.5 text-[10.5px] text-white">{conflictos.filter((c) => c.estado === 'abierto').length}</span>}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={CheckCircle2} valor={fmtNumber(r.confirmados ?? 0)} etiqueta="Confirmados" tono="verde" />
          <Kpi icono={Clock} valor={fmtNumber(r.en_cola ?? 0)} etiqueta="En cola" tono="ambar" />
          <Kpi icono={XCircle} valor={fmtNumber(r.error ?? 0)} etiqueta="Error" tono="rojo" />
          <Kpi icono={AlertTriangle} valor={fmtNumber(r.conflicto ?? 0)} etiqueta="Conflicto" tono="ambar" />
        </div>
        {(r.sin_conexion ?? 0) > 0 && (
          <p className="text-muted-foreground flex items-center gap-2 text-[12.5px]"><WifiOff className="size-4" />{r.sin_conexion} {r.sin_conexion === 1 ? 'equipo' : 'equipos'} sin conexión hace más de 24 horas. Desconectado no equivale a error: puede tener registros locales pendientes.</p>
        )}

        {pestana === 'dispositivos' && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Filtro i={HardHat} t="Cuadrilla" v={f.crew} set={(v) => setF({ ...f, crew: v })} ops={opciones(todos.filter((x) => x.crew_code).map((x) => [x.crew_code, `${x.crew_code} · ${x.crew_name}`]))} todos="Todas" />
                <Filtro i={User} t="Usuario" v={f.usuario} set={(v) => setF({ ...f, usuario: v })} ops={opciones(todos.map((x) => [x.profile_id, x.nombre]))} />
                <Filtro i={Monitor} t="Dispositivo" v={f.plataforma} set={(v) => setF({ ...f, plataforma: v })} ops={[['android', 'Android'], ['web', 'Web']]} />
                <Filtro i={Layers} t="Módulo" v={f.modulo} set={(v) => setF({ ...f, modulo: v })} ops={[['work_entries', 'Actividad ejecutada']]} />
                <Filtro i={Activity} t="Estado" v={f.estado} set={(v) => setF({ ...f, estado: v })} ops={Object.entries(ESTADO).map(([k, e]) => [k, e.t])} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar registro por usuario, PCI, cuadrilla o módulo..." className="pl-9" /></div>
                {sel.size > 0 && <span className="bg-secondary rounded-full px-2.5 py-1 text-[12px]">Seleccionados: {sel.size}</span>}
                <Button onClick={() => reintentar(todos.filter((x) => sel.has(clave(x))))} disabled={!sel.size}><RefreshCw className="size-4" />Reintentar seleccionados</Button>
                <Button variant="outline" disabled={sel.size !== 1} onClick={() => setAbierto([...sel][0])}><Eye className="size-4" />Ver detalle</Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  {q.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : q.isError ? <p className="text-destructive p-5 text-[13px]">{mensajeAmigable(q.error, 'No se pudo cargar')}</p> : filas.length === 0 ? (
                    <p className="text-muted-foreground p-6 text-[13px]">Sin equipos con estos filtros. Cada celular aparece aquí al sincronizar por primera vez con la versión 1.16.0 o superior.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <thead className="bg-secondary/50 text-left"><tr>
                          <th className="w-9 px-3 py-2"><input type="checkbox" aria-label="Seleccionar todo" checked={filas.length > 0 && filas.every((x) => sel.has(clave(x)))}
                            onChange={(e) => setSel(e.target.checked ? new Set(filas.map(clave)) : new Set())} /></th>
                          <th className="px-3 py-2 font-semibold">Usuario</th><th className="px-3 py-2 font-semibold">Dispositivo</th>
                          <th className="px-3 py-2 font-semibold">Último contacto</th><th className="px-3 py-2 font-semibold">Última confirmación</th>
                          <th className="px-3 py-2 text-center font-semibold">Registros</th><th className="px-3 py-2 text-center font-semibold">Fotos</th>
                          <th className="px-3 py-2 font-semibold">Estado</th><th className="px-3 py-2 text-center font-semibold">Acciones</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border">
                          {visibles.map((x) => {
                            const e = ESTADO[x.estado] ?? ESTADO.confirmado
                            const k = clave(x)
                            return (
                              <tr key={k} className={cn('hover:bg-secondary/30', (sel.has(k) || abierto === k) && 'bg-primary/5')}>
                                <td className="px-3 py-2"><input type="checkbox" aria-label="Seleccionar" checked={sel.has(k)} onChange={() => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n) }} /></td>
                                <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold">{iniciales(x.nombre)}</span>
                                  <div><p className="font-semibold">{x.nombre}</p><p className="text-muted-foreground">{x.crew_code ? `Cuadrilla ${x.crew_code}` : x.usuario}</p></div></div></td>
                                <td className="px-3 py-2"><p className="flex items-center gap-1.5">{x.plataforma === 'web' ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />}{x.plataforma === 'web' ? 'Web' : 'Android'}{x.app_version ? ` v${x.app_version}` : ''}</p>
                                  <p className="text-muted-foreground max-w-40 truncate">{x.device_label ?? x.device_id}</p></td>
                                <td className="px-3 py-2 whitespace-nowrap">{hora(x.ultimo_contacto)}</td>
                                <td className="px-3 py-2 whitespace-nowrap"><span className="flex items-center gap-1.5"><e.i className={cn('size-3.5', x.estado === 'confirmado' ? 'text-success' : x.estado === 'error' ? 'text-destructive' : x.estado === 'sin_conexion' ? 'text-muted-foreground' : 'text-warning')} />{hora(x.ultima_confirmacion)}</span></td>
                                <td className="px-3 py-2 text-center tabular-nums">{x.registros}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{x.fotos}</td>
                                <td className="px-3 py-2"><span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', e.c)}>● {e.t}</span>
                                  {x.reintento_pendiente && <p className="text-info mt-0.5 text-[11px]">Reintento pedido</p>}</td>
                                <td className="px-3 py-2"><div className="flex justify-center gap-1">
                                  <button title="Ver detalle" onClick={() => setAbierto(abierto === k ? null : k)} className="hover:bg-secondary grid size-8 place-items-center rounded-md border border-border"><Eye className="size-4" /></button>
                                  <button title="Reintentar" onClick={() => reintentar([x])} className="hover:bg-secondary grid size-8 place-items-center rounded-md border border-border"><RefreshCw className="size-4" /></button>
                                </div></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                <span>Mostrando {fmtNumber(visibles.length)} de {fmtNumber(filas.length)} registros</span>
                <span className="flex items-center gap-2">Filas por página:
                  <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-card rounded-md border border-border px-2 py-1">{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select>
                  <button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className="px-2 disabled:opacity-40">‹</button>
                  <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-0.5">{pagina + 1}</span>
                  <button disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)} className="px-2 disabled:opacity-40">›</button>
                </span>
              </div>
            </div>
            <DetalleEquipo equipo={elegido} conflictos={conflictos} d={d} cerrar={() => setAbierto(null)} comparar={setComparar} />
          </div>
        )}

        {pestana === 'sincronizaciones' && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Sincronizaciones de los últimos 7 días</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(d?.sesiones ?? []).length === 0 ? <p className="text-muted-foreground px-4 pb-5 text-[13px]">Sin sincronizaciones registradas en la semana.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
                  <thead className="bg-secondary/50 text-left"><tr><th className="px-3 py-2">Fecha y hora</th><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Dispositivo</th>
                    <th className="px-3 py-2 text-center">Enviados</th><th className="px-3 py-2 text-center">Recibidos</th><th className="px-3 py-2 text-center">Fallidos</th><th className="px-3 py-2">Resultado</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {(d?.sesiones ?? []).slice(0, 150).map((s: any, i: number) => {
                      const eq = todos.find((x) => x.profile_id === s.profile_id && x.device_id === s.device_id)
                      return (
                        <tr key={i}><td className="px-3 py-2 whitespace-nowrap">{hora(s.at)}</td><td className="px-3 py-2">{eq?.nombre ?? '—'}</td><td className="px-3 py-2">{eq?.device_label ?? s.device_id}</td>
                          <td className="px-3 py-2 text-center">{s.enviados}</td><td className="px-3 py-2 text-center">{s.recibidos}</td><td className="px-3 py-2 text-center">{s.fallidos}</td>
                          <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', s.fallidos ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success')}>● {s.fallidos ? 'Con errores' : 'Confirmado'}</span></td></tr>
                      )
                    })}
                  </tbody>
                </table></div>
              )}
            </CardContent>
          </Card>
        )}

        {pestana === 'registros' && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Registros con conflicto de versiones</CardTitle></CardHeader>
            <CardContent className="p-0">
              {conflictos.length === 0 ? <p className="text-muted-foreground px-4 pb-5 text-[13px]">Sin conflictos. Un conflicto aparece si un celular manda un cambio sobre un registro que otra persona modificó después; nunca se sobrescribe solo.</p> : (
                <ul className="divide-y divide-border">
                  {conflictos.map((k) => {
                    const eq = todos.find((x) => x.profile_id === k.profile_id)
                    return (
                      <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12.5px]">
                        <AlertTriangle className={cn('size-5', k.estado === 'abierto' ? 'text-warning' : 'text-muted-foreground')} />
                        <div className="min-w-56 flex-1"><p className="font-semibold">{k.referencia ?? MODULO[k.tabla] ?? k.tabla}</p>
                          <p className="text-muted-foreground">{MODULO[k.tabla] ?? k.tabla} · {eq?.nombre ?? '—'} · local v{k.version_local} · servidor v{k.version_servidor} · {k.campos.map((c: string) => CAMPO[c] ?? c).join(', ')}</p></div>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', k.estado === 'abierto' ? 'bg-warning/15 text-warning' : k.estado === 'aplicado' ? 'bg-info/10 text-info' : 'bg-success/12 text-success')}>
                          ● {k.estado === 'abierto' ? 'Conflicto' : k.estado === 'aplicado' ? 'Versión del dispositivo aplicada' : 'No sobrescrito'}</span>
                        <Button size="sm" variant="outline" onClick={() => setComparar(k)}><ArrowLeftRight className="size-3.5" />Comparar versiones</Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {pestana === 'configuracion' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><ShieldCheck className="text-primary size-4" />Reglas de sincronización</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-[12.5px]">
                <p>· <strong>No borrar pendientes:</strong> lo que un equipo aún no envía solo existe en él; desde aquí no se descarta.</p>
                <p>· <strong>Desconectado no equivale a error:</strong> «Sin conexión» es su propio estado (más de 24 h sin contacto).</p>
                <p>· <strong>Idempotencia:</strong> la confirmación es segura de repetir y no genera duplicados (cada registro lleva su client_id).</p>
                <p>· <strong>Sin sobrescritura automática:</strong> si dos personas cambian el mismo avance, queda en «Conflicto» hasta que el supervisor, el residente o el administrador decide, con motivo.</p>
                <p>· Los originales de las fotos suben por Wi-Fi por omisión; el reintento automático espacia los intentos de 2 s a 5 min.</p>
              </CardContent>
            </Card>
            {esteEquipo}
          </div>
        )}
      </PageBody>

      <CompararVersiones k={comparar} cerrar={() => setComparar(null)} alResolver={() => { setComparar(null); qc.invalidateQueries({ queryKey: ['sync-dispositivos', service.id] }) }} />
    </>
  )
}

function Filtro({ i: I, t, v, set, ops, todos = 'Todos' }: { i: any; t: string; v: string; set: (v: string) => void; ops: [string, string][]; todos?: string }) {
  return (
    <label className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px]">
      <I className="text-muted-foreground size-4" /><span className="font-semibold">{t}:</span>
      <select value={v} onChange={(e) => set(e.target.value)} className="max-w-40 bg-transparent outline-none"><option value="">{todos}</option>{ops.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select>
    </label>
  )
}

function DetalleEquipo({ equipo: x, conflictos, d, cerrar, comparar }: { equipo: any; conflictos: any[]; d: any; cerrar: () => void; comparar: (k: any) => void }) {
  if (!x) {
    return (
      <Card className="h-fit"><CardContent className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-[12.5px]">
        <Eye className="size-6" />Elige un equipo para ver su detalle, sus conflictos y su historial.
      </CardContent></Card>
    )
  }
  const suyos = conflictos.filter((k) => k.profile_id === x.profile_id && (!k.device_id || k.device_id === x.device_id))
  const abiertos = suyos.filter((k) => k.estado === 'abierto')
  const e = ESTADO[x.estado] ?? ESTADO.confirmado
  const historial = [
    ...(d?.sesiones ?? []).filter((s: any) => s.profile_id === x.profile_id && s.device_id === x.device_id).slice(0, 6)
      .map((s: any) => ({ at: s.at, ok: !s.fallidos, t: s.fallidos ? 'Con errores' : 'Confirmado', det: `${s.enviados} enviados${s.fallidos ? ` · ${s.fallidos} con error` : ''}` })),
    ...suyos.map((k) => ({ at: k.carga_at, ok: false, aviso: true, t: 'Conflicto detectado', det: `Diferencias entre versiones (local: v${k.version_local}, servidor: v${k.version_servidor}) · ${k.referencia ?? ''}` })),
    ...suyos.filter((k) => k.resuelto_at).map((k) => ({ at: k.resuelto_at, ok: true, t: k.estado === 'aplicado' ? 'Versión del dispositivo aplicada' : 'No sobrescrito', det: `${k.resuelto_por ?? ''}${k.motivo ? ` · ${k.motivo}` : ''}` })),
    ...(d?.reintentos ?? []).filter((r: any) => r.profile_id === x.profile_id && r.device_id === x.device_id)
      .flatMap((r: any) => [{ at: r.solicitado_at, ok: true, t: 'Reintento solicitado', det: `por ${r.por}` }, ...(r.atendido_at ? [{ at: r.atendido_at, ok: true, t: 'Reintento recibido por el equipo', det: 'La cola volvió a enviarse' }] : [])]),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10)

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div><CardTitle className="text-[15px]">Detalle del registro</CardTitle><p className="text-muted-foreground text-[12px]">Información del equipo y gestión del conflicto</p></div>
        <button onClick={cerrar} aria-label="Cerrar" className="hover:bg-secondary rounded-md p-1"><X className="size-4" /></button>
      </CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
          {x.plataforma === 'web' ? <Monitor className="text-primary size-5" /> : <Smartphone className="text-primary size-5" />}
          <div className="flex-1"><p className="font-semibold">{x.nombre}</p><p className="text-muted-foreground">{x.device_label ?? x.device_id}{x.app_version ? ` · v${x.app_version}` : ''}</p></div>
          <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', e.c)}>● {e.t}</span>
        </div>
        {abiertos.map((k) => (
          <div key={k.id} className="space-y-2 rounded-lg border border-warning/40 p-2.5">
            <p className="font-semibold">{k.referencia ?? MODULO[k.tabla]}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span>Versión local: <strong>{k.version_local}</strong></span><span>Captura: {hora(k.servidor_at)}</span>
              <span>Versión servidor: <strong>{k.version_servidor}</strong></span><span>Carga: {hora(k.carga_at)}</span>
              <span>Campos: {k.campos.map((c: string) => CAMPO[c] ?? c).join(', ')}</span>
              <span>Última sync: <strong className="text-success">{x.ultima_confirmacion ? `Confirmada ${new Date(x.ultima_confirmacion).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}` : '—'}</strong></span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => comparar(k)}><ArrowLeftRight className="size-3.5" />Comparar versiones</Button>
              <NoSobrescribir k={k} />
            </div>
          </div>
        ))}
        {x.ultimo_error && <p className="bg-destructive/8 text-destructive rounded-lg p-2">Último error: {x.ultimo_error}</p>}
        <div className="bg-warning/10 rounded-lg p-2.5">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="text-warning size-4" />Antes de actuar</p>
          <p className="text-destructive">● <strong>No borrar pendientes;</strong> podrían contener registros no sincronizados.</p>
          <p className="text-destructive">● <strong>Desconectado no equivale a error;</strong> el equipo puede tener registros locales pendientes.</p>
        </div>
        <div>
          <p className="mb-1 flex items-center justify-between font-semibold">Historial del registro<span className="text-muted-foreground font-normal">{historial.length} eventos</span></p>
          {historial.length === 0 ? <p className="text-muted-foreground">Sin eventos en la semana.</p> : (
            <ul className="space-y-2">
              {historial.map((h: any, i) => (
                <li key={i} className="flex gap-2">
                  {h.aviso ? <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" /> : h.ok ? <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" /> : <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />}
                  <div><p><span className="text-muted-foreground">{hora(h.at)}</span> · <strong>{h.t}</strong></p><p className="text-muted-foreground">{h.det}</p></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="bg-info/8 text-info flex gap-2 rounded-lg p-2.5"><Info className="mt-0.5 size-4 shrink-0" /><span><strong>Idempotencia:</strong> la confirmación es segura de repetir y no genera duplicados.</span></p>
      </CardContent>
    </Card>
  )
}

function NoSobrescribir({ k, alHecho }: { k: any; alHecho?: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [ocupado, setOcupado] = React.useState(false)
  return (
    <Button size="sm" variant="outline" loading={ocupado} onClick={async () => {
      const motivo = window.prompt('No sobrescribir: se conserva la versión del servidor. Motivo (opcional):') ?? null
      if (motivo === null) return
      setOcupado(true)
      const { error } = await sb.rpc('sync_conflicto_resolver' as any, { p_id: k.id, p_accion: 'no_sobrescribir', p_motivo: motivo } as any)
      setOcupado(false)
      if (error) { toast.error(mensajeAmigable(error, 'No se pudo resolver')); return }
      toast.success('Se conservó la versión del servidor; el equipo recibe el aviso')
      qc.invalidateQueries({ queryKey: ['sync-dispositivos', service.id] })
      alHecho?.()
    }}><Ban className="size-3.5" />No sobrescribir</Button>
  )
}

function CompararVersiones({ k, cerrar, alResolver }: { k: any | null; cerrar: () => void; alResolver: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [motivo, setMotivo] = React.useState('')
  // El tramo y la actividad por su nombre, no por su identificador
  const nombres = useQuery({
    queryKey: ['sync-nombres', service.id],
    enabled: !!k,
    queryFn: async () => {
      const [t, a] = await Promise.all([
        sb.from('road_sections').select('id, code, name').eq('service_id', service.id),
        sb.from('activities_catalog').select('id, code, name').eq('service_id', service.id),
      ])
      return new Map<string, string>([...((t.data ?? []) as any[]).map((x) => [x.id, `${x.code} · ${x.name}`] as [string, string]),
        ...((a.data ?? []) as any[]).map((x) => [x.id, `${x.code} · ${x.name}`] as [string, string])])
    },
    staleTime: 10 * 60_000,
  })
  const ver = (c: string, v: any) => (c === 'section_id' || c === 'activity_id' ? nombres.data?.get(String(v)) ?? valorCampo(c, v) : valorCampo(c, v))
  const [ocupado, setOcupado] = React.useState(false)
  React.useEffect(() => setMotivo(''), [k?.id])
  if (!k) return null
  const campos = Object.keys(CAMPO).filter((c) => c in (k.datos_local ?? {}) || c in (k.datos_servidor ?? {}))
  const aplicar = async () => {
    setOcupado(true)
    const { error } = await sb.rpc('sync_conflicto_resolver' as any, { p_id: k.id, p_accion: 'aplicar', p_motivo: motivo } as any)
    setOcupado(false)
    if (error) { toast.error(mensajeAmigable(error, 'No se pudo aplicar')); return }
    toast.success('Se aplicó la versión del dispositivo; queda en la bitácora con su motivo')
    alResolver()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comparar versiones</DialogTitle>
          <DialogDescription>{k.referencia ?? MODULO[k.tabla]} · versión local {k.version_local} · versión servidor {k.version_servidor}{k.servidor_por ? ` (último cambio: ${k.servidor_por}, ${hora(k.servidor_at)})` : ''}</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
          <thead className="bg-secondary/50 text-left"><tr><th className="px-3 py-2">Campo</th><th className="px-3 py-2">Servidor (v{k.version_servidor})</th><th className="px-3 py-2">Dispositivo (v{k.version_local} + cambio)</th></tr></thead>
          <tbody className="divide-y divide-border">
            {campos.map((c) => {
              const dif = k.campos.includes(c)
              return (
                <tr key={c} className={cn(dif && 'bg-warning/8')}>
                  <td className="px-3 py-1.5 font-semibold">{CAMPO[c]}{dif && <span className="text-warning ml-1">●</span>}</td>
                  <td className="px-3 py-1.5">{ver(c, k.datos_servidor?.[c])}</td>
                  <td className={cn('px-3 py-1.5', dif && 'font-semibold')}>{ver(c, k.datos_local?.[c])}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {k.estado === 'abierto' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-[12px]">Nada se sobrescribe solo. «No sobrescribir» conserva la versión del servidor; aplicar la del dispositivo exige motivo y queda en la bitácora.</p>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para aplicar la versión del dispositivo" />
            <div className="flex flex-wrap justify-end gap-2">
              <NoSobrescribir k={k} alHecho={alResolver} />
              <Button onClick={aplicar} disabled={!motivo.trim()} loading={ocupado}>Aplicar versión del dispositivo</Button>
            </div>
          </div>
        ) : (
          <p className="text-[12.5px]">Resuelto: <strong>{k.estado === 'aplicado' ? 'se aplicó la versión del dispositivo' : 'no se sobrescribió'}</strong> · {k.resuelto_por} · {hora(k.resuelto_at)}{k.motivo ? ` · ${k.motivo}` : ''}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
