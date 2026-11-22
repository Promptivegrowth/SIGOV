'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Layers, Users, User, Calendar, FileText, TriangleAlert, CheckCircle2, ListChecks, CalendarCheck, ArrowLeftRight,
  UserX, Eye, Info, History, Cone,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Asignar PCI completo» (maquetas 08/09; guía 3.3): designar todos los
 * ítems de un PCI a una cuadrilla y su jefe con vigencia operacional, y
 * retirar la designación. El retiro es exclusivo del Supervisor
 * autorizado, pide motivo y solo quita el acceso operativo: el PCI, sus
 * ítems, fotos, autoría y avance se conservan. Nada de esto toca los
 * vencimientos oficiales. Las reglas viven en el servidor
 * (pci_designar / pci_retirar_designacion).
 */
const MOTIVOS_RETIRO = ['Cambio de responsable', 'Redistribución de carga', 'Término de la vigencia', 'Designación por error', 'Otro']

export function AsignacionClient() {
  const { service, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const pciId = sp.get('pci') ?? ''
  const tab = sp.get('tab') === 'historial' ? 'historial' : 'designacion'
  const fijar = (c: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(c)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const [crew, setCrew] = React.useState('')
  const [jefe, setJefe] = React.useState('')
  const [desde, setDesde] = React.useState(toISODate(new Date()))
  const [hasta, setHasta] = React.useState(toISODate(addDays(new Date(), 8)))
  const [motivo, setMotivo] = React.useState('')
  const [motivoRetiro, setMotivoRetiro] = React.useState('')
  const [panel, setPanel] = React.useState<'' | 'items' | 'disponibilidad' | 'cambios' | 'impacto'>('')
  const [ocupado, setOcupado] = React.useState(false)

  const pcis = useQuery({
    queryKey: ['asig-pcis', service.id],
    queryFn: async () => ((await sb.from('pcis').select('id, code, title, published_at').eq('service_id', service.id)
      .is('deleted_at', null).order('code', { ascending: false })).data ?? []) as any[],
  })
  const cuadrillas = useQuery({
    queryKey: ['asig-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name, leader_id, supervisor_id, lider:profiles!crews_leader_id_fkey(full_name)')
      .eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  const { profile } = useSession()
  const misCuadrillas = (cuadrillas.data ?? []).filter((c) => role !== 'supervisor' || c.supervisor_id === profile.id)
  const integrantes = useQuery({
    queryKey: ['asig-miembros', crew],
    enabled: !!crew,
    queryFn: async () => ((await sb.from('crew_members').select('profile_id, profiles(full_name)').eq('crew_id', crew).eq('is_active', true)).data ?? []) as any[],
  })
  const c = (cuadrillas.data ?? []).find((x) => x.id === crew)
  const jefes = React.useMemo(() => {
    const m = new Map<string, string>()
    if (c?.leader_id) m.set(c.leader_id, c.lider?.full_name ?? 'Jefe de la cuadrilla')
    for (const x of integrantes.data ?? []) if (x.profile_id && !m.has(x.profile_id)) m.set(x.profile_id, x.profiles?.full_name ?? '—')
    return [...m.entries()]
  }, [c, integrantes.data])
  React.useEffect(() => { setJefe(c?.leader_id ?? '') }, [c?.leader_id])

  const r = useQuery({
    queryKey: ['asig-resumen', pciId, crew],
    enabled: !!pciId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('pci_designacion_resumen' as any, { p_pci: pciId, p_crew: crew || null } as any)
      if (error) throw error
      return data as any
    },
  })
  const d = r.data
  const act = d?.actual
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['asig-resumen'] }); qc.invalidateQueries({ queryKey: ['pci-items'] }) }

  const designar = async () => {
    setOcupado(true)
    const { data, error } = await sb.rpc('pci_designar' as any, { p_pci: pciId, p_crew: crew, p_jefe: jefe || null, p_desde: desde, p_hasta: hasta, p_motivo: motivo } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    const x = data as any
    toast.success('Designación confirmada', {
      description: `${x.asignados} ítems abiertos pasan a la cuadrilla · ${x.conservan_ejecucion} atendidos conservan quién los ejecutó${x.fuera_de_alcance ? ` · ${x.fuera_de_alcance} de cuadrillas fuera de tu cargo no se tocaron` : ''}.`,
    })
    setMotivo(''); refrescar()
  }
  const retirar = async () => {
    if (!confirm('¿Retirar la designación? La cuadrilla pierde el acceso operativo; se conservan PCI, ítems, fotos, autoría y avance.')) return
    setOcupado(true)
    const { data, error } = await sb.rpc('pci_retirar_designacion' as any, { p_pci: pciId, p_motivo: motivoRetiro } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Designación retirada', { description: `${(data as any).liberados} ítems abiertos quedan sin cuadrilla para reasignar.` })
    setMotivoRetiro(''); refrescar()
  }

  const falta = !pciId ? 'Elige el PCI' : !crew ? 'Elige la cuadrilla' : !jefe ? 'Elige el jefe' : !desde || !hasta || hasta < desde ? 'Revisa la vigencia'
    : !motivo.trim() ? 'Escribe el motivo' : act && act.crew_id !== crew ? 'Retira primero la designación actual' : null
  const pci = (pcis.data ?? []).find((x) => x.id === pciId)
  const resumenPlazos = (d?.por_plazo ?? []).map((x: any) => `${etiquetaPlazo(x.plazo)}: ${x.n}`).join(' · ')

  return (
    <>
      <PageHeader title="Asignar PCI completo" description="Retiro operativo exclusivo del Supervisor autorizado"
        actions={
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {([['designacion', 'Designación', Users], ['historial', 'Historial', History]] as const).map(([k, t, I]) => (
              <button key={k} onClick={() => fijar({ tab: k === 'designacion' ? '' : k })} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
                tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
            ))}
          </div>
        } />
      <PageBody className="space-y-4">
        {tab === 'historial' ? (
          <Card>
            <CardHeader><CardTitle className="text-[14px]">Historial de designaciones {pci ? `· ${pci.code}` : ''}</CardTitle>
              <CardDescription>Cada designación y cada retiro, con su motivo. Nada se borra.</CardDescription></CardHeader>
            <CardContent>
              {!pciId ? <ElegirPci pcis={pcis.data ?? []} valor={pciId} cambiar={(v) => fijar({ pci: v })} /> : r.isLoading ? <SkeletonList rows={4} /> : (
                <ul className="space-y-2">
                  {(d?.historial ?? []).length === 0 && <p className="text-muted-foreground text-[13px]">Este PCI aún no tiene designaciones.</p>}
                  {(d?.historial ?? []).map((h: any, k: number) => (
                    <li key={k} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge variant={h.estado === 'vigente' ? 'success' : h.estado === 'retirada' ? 'warning' : 'outline'}>
                          {h.estado === 'vigente' ? 'Vigente' : h.estado === 'retirada' ? 'Retirada' : 'Reemplazada'}</Badge>
                        <strong>{h.cuadrilla}</strong>{h.jefe && <span>· {h.jefe}</span>}
                        <span className="text-muted-foreground">· {fmtDate(h.desde)} – {fmtDate(h.hasta)}</span>
                      </p>
                      <p className="text-muted-foreground mt-0.5">Designó {h.por ?? '—'} el {fmtDateTime(h.cuando)} · {h.asignados} ítems asignados · {h.conservados} conservan ejecución · Motivo: {h.motivo}</p>
                      {h.retirada_at && <p className="text-warning mt-0.5">Retiró {h.retirada_por ?? '—'} el {fmtDateTime(h.retirada_at)} · {h.liberados} ítems liberados · Motivo: {h.motivo_retiro}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <Card>
              <CardContent className="space-y-3 p-5 text-[13px]">
                <Fila etiqueta="PCI" obligatorio>
                  <ElegirPci pcis={pcis.data ?? []} valor={pciId} cambiar={(v) => fijar({ pci: v })} />
                </Fila>
                <Fila etiqueta="Alcance">
                  <p className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><Layers className="size-4" />
                    PCI completo · {d ? `${fmtNumber(d.total)} ítems` : '—'}</p>
                </Fila>
                <Fila etiqueta="Cuadrilla" obligatorio>
                  <Select value={crew || '__'} onValueChange={(v) => setCrew(v === '__' ? '' : v)}>
                    <SelectTrigger className="h-9"><Users className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__">Elegir cuadrilla</SelectItem>
                      {misCuadrillas.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Fila>
                <Fila etiqueta="Jefe" obligatorio>
                  <Select value={jefe || '__'} onValueChange={(v) => setJefe(v === '__' ? '' : v)} disabled={!crew}>
                    <SelectTrigger className="h-9"><User className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__">Elegir jefe</SelectItem>
                      {jefes.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </Fila>
                <Fila etiqueta="Vigencia operacional" obligatorio>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5"><Calendar className="text-muted-foreground size-3.5" />Desde
                      <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-40" /></label>
                    <label className="flex items-center gap-1.5">Hasta
                      <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-40" /></label>
                  </div>
                </Fila>
                <Fila etiqueta="Motivo" obligatorio>
                  <div>
                    <Textarea rows={3} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Distribución de trabajo" />
                    <p className="text-muted-foreground text-right text-[11px]">{motivo.length} / 250</p>
                  </div>
                </Fila>
                {d && (
                  <div className="space-y-2">
                    <p className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><Layers className="size-4" />{resumenPlazos || 'Sin ítems'}</p>
                    <p className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><Layers className="size-4" />
                      {fmtNumber(d.total)} ítems del alcance · sin duplicar ejecución</p>
                  </div>
                )}
                <p className="bg-warning/12 text-warning flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><TriangleAlert className="size-4" />
                  La vigencia de designación no altera vencimientos oficiales</p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-4 text-[13px]">
                  {act ? (
                    <p className="bg-success/10 text-success flex items-center gap-2 rounded-md px-3 py-2 font-semibold">
                      <CheckCircle2 className="size-4" />Designación actual: {act.crew_name}{act.jefe_nombre ? ` · ${act.jefe_nombre}` : ''}
                      <Badge variant={act.vigencia === 'vigente' ? 'success' : 'warning'} className="ml-auto">
                        {act.vigencia === 'vigente' ? 'Vigente' : act.vigencia === 'vencida' ? 'Vencida' : 'Programada'}</Badge>
                    </p>
                  ) : <p className="bg-secondary text-muted-foreground rounded-md px-3 py-2">{pciId ? 'Sin designación vigente.' : 'Elige un PCI.'}</p>}
                  <div className="grid grid-cols-3 divide-x divide-border text-center">
                    <Metrica icono={Cone} t="PCI" v={pci?.code ?? '—'} />
                    <Metrica icono={Layers} t="Ítems del alcance" v={d ? fmtNumber(d.total) : '—'} />
                    <Metrica icono={Calendar} t="Vigencia operacional" v={act ? `${fmtDate(act.desde)} – ${fmtDate(act.hasta)}` : `${fmtDate(desde)} – ${fmtDate(hasta)}`} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setPanel(panel === 'items' ? '' : 'items')} disabled={!d}><ListChecks className="size-4" />Ver ítems ({d ? fmtNumber(d.total) : 0})</Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'disponibilidad' ? '' : 'disponibilidad')} disabled={!crew || !d}><CalendarCheck className="size-4" />Revisar disponibilidad</Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'cambios' ? '' : 'cambios')} disabled={!crew || !d}><ArrowLeftRight className="size-4" />Revisar cambios</Button>
                  </div>
                  {panel === 'items' && d && (
                    <div className="bg-secondary/50 space-y-1 rounded-md p-3 text-[12.5px]">
                      <p>{fmtNumber(d.abiertos)} abiertos · {fmtNumber(d.atendidos)} atendidos</p>
                      {(d.por_cuadrilla as any[]).map((x) => (
                        <p key={x.crew_id ?? 'sin'}>{x.nombre}: {x.abiertos} abiertos · {x.atendidos} atendidos{!x.gestionable && <span className="text-warning"> · fuera de tu cargo</span>}</p>
                      ))}
                      <Link className="text-primary underline" href={`/pci/${pciId}`}>Abrir los ítems del PCI</Link>
                    </div>
                  )}
                  {panel === 'disponibilidad' && d?.disponibilidad && (
                    <div className="bg-secondary/50 space-y-1 rounded-md p-3 text-[12.5px]">
                      <p>Ítems abiertos ya asignados a la cuadrilla: <strong>{fmtNumber(d.disponibilidad.abiertos_asignados)}</strong> ({fmtNumber(d.disponibilidad.vencen_7d)} vencen en 7 días)</p>
                      <p>Otras designaciones vigentes: {(d.disponibilidad.designaciones as any[]).length === 0 ? 'ninguna'
                        : (d.disponibilidad.designaciones as any[]).map((x) => `${x.pci} (${fmtDate(x.desde)} – ${fmtDate(x.hasta)})`).join(', ')}</p>
                    </div>
                  )}
                  {panel === 'cambios' && d?.cambios && (
                    <div className="bg-secondary/50 space-y-1 rounded-md p-3 text-[12.5px]">
                      <p><strong>{fmtNumber(d.cambios.pasan)}</strong> ítems abiertos pasan a la cuadrilla · {fmtNumber(d.cambios.ya_suyos)} ya eran suyos</p>
                      <p>{fmtNumber(d.cambios.conservan_ejecucion)} atendidos conservan quién los ejecutó (no se duplica ejecución)</p>
                      {d.cambios.fuera_de_alcance > 0 && <p className="text-warning">{fmtNumber(d.cambios.fuera_de_alcance)} de cuadrillas fuera de tu cargo no se tocan</p>}
                    </div>
                  )}
                  {['supervisor', 'admin'].includes(role) ? (
                    <>
                      <Button className="w-full" onClick={designar} loading={ocupado} disabled={!!falta}><CheckCircle2 className="size-4" />Confirmar designación</Button>
                      {falta && <p className="text-muted-foreground text-center text-[12px]">{falta}</p>}
                    </>
                  ) : <p className="text-muted-foreground text-[12px]">Designar un PCI es del Supervisor autorizado.</p>}
                </CardContent>
              </Card>

              <Card className="border-warning/50">
                <CardHeader className="pb-2"><CardTitle className="text-warning flex items-center gap-2 text-[14px]"><UserX className="size-4" />Retirar designación</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-[13px]">
                  <label className="block space-y-1"><span className="text-[12px] font-medium">Motivo de retiro *</span>
                    <Select value={motivoRetiro || '__'} onValueChange={(v) => setMotivoRetiro(v === '__' ? '' : v)} disabled={!act?.puedo_retirar}>
                      <SelectTrigger className="h-9"><FileText className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="__">Seleccione el motivo de retiro</SelectItem>
                        {MOTIVOS_RETIRO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </label>
                  <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]"><Info className="size-4 shrink-0" />
                    Retira acceso operativo; conserva PCI, ítems, fotos, autoría y avance.</p>
                  {panel === 'impacto' && d?.impacto && (
                    <p className="bg-secondary/50 rounded-md p-3 text-[12.5px]">
                      {fmtNumber(d.impacto.abiertos)} ítems abiertos quedan sin cuadrilla ({fmtNumber(d.impacto.con_fotos)} ya con fotos, que se conservan) ·
                      {' '}{fmtNumber(d.impacto.atendidos)} atendidos no cambian.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setPanel(panel === 'impacto' ? '' : 'impacto')} disabled={!act}><Eye className="size-4" />Ver impacto</Button>
                    <Button variant="outline" className="border-warning/50 text-warning bg-warning/5" onClick={retirar} loading={ocupado}
                      disabled={!act?.puedo_retirar || !motivoRetiro}><UserX className="size-4" />Retirar designación</Button>
                  </div>
                  {act && !act.puedo_retirar && <p className="text-muted-foreground text-[12px]">Solo el Supervisor de {act.crew_name} puede retirarla.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[12px]"><Info className="size-3.5" />
            Todas las acciones requieren el permiso específico aplicable. Los permisos de importación no otorgan la asignación automáticamente.</p>
          <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </PageBody>
    </>
  )
}

function Fila({ etiqueta, obligatorio, children }: { etiqueta: string; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-1 sm:grid-cols-[170px_1fr] sm:gap-3">
      <span className="text-[12.5px] font-medium">{etiqueta}{obligatorio && <span className="text-destructive"> *</span>}</span>
      {children}
    </div>
  )
}

function Metrica({ icono: I, t, v }: { icono: any; t: string; v: string }) {
  return (
    <div className="px-2">
      <I className="text-primary mx-auto size-4" />
      <p className="text-muted-foreground text-[11px]">{t}</p>
      <p className="text-[12.5px] font-bold">{v}</p>
    </div>
  )
}

function ElegirPci({ pcis, valor, cambiar }: { pcis: any[]; valor: string; cambiar: (v: string) => void }) {
  return (
    <Select value={valor || '__'} onValueChange={(v) => cambiar(v === '__' ? '' : v)}>
      <SelectTrigger className="h-9"><Cone className="text-success size-3.5" /><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="__">Elegir PCI</SelectItem>
        {pcis.map((p) => <SelectItem key={p.id} value={p.id}>{p.code}{p.published_at ? '' : ' (borrador)'}</SelectItem>)}</SelectContent>
    </Select>
  )
}
