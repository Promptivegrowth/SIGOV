'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Handshake, Users, Layers, Calendar, Pencil, KeyRound, ShieldCheck, TriangleAlert, RefreshCw, Info, CheckCircle2,
  Ban, CalendarCheck, ArrowLeftRight, History, Camera, Cone,
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
import { cn, fmtDateTime, fmtNumber, fmtRelative } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Apoyo temporal entre cuadrillas» (maquetas 10/11; guía 3.4).
 *
 * El Supervisor de la cuadrilla titular autoriza a otra cuadrilla a
 * consultar y registrar evidencias en ítems de un PCI, entre dos fechas y
 * horas. No cambia titular, cuadrilla permanente, roles ni vencimientos;
 * validar o publicar nunca se concede. Caduca solo; revocar pide motivo y
 * conserva la autoría. Lo cargado sin conexión fuera de la vigencia queda
 * pendiente de autorización (aquí se autoriza o no), y no se borra solo.
 */
const ahoraLocal = (h: number) => {
  const d = new Date(Date.now() + h * 3600_000)
  d.setMinutes(0, 0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const ESTADO: Record<string, { t: string; v: any }> = {
  vigente: { t: 'Vigente', v: 'success' }, programado: { t: 'Programado', v: 'info' },
  caducado: { t: 'Caducado', v: 'outline' }, revocado: { t: 'Revocado', v: 'warning' },
}

export function ApoyoClient() {
  const { service, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const pciId = sp.get('pci') ?? ''
  const tab = sp.get('tab') === 'historial' ? 'historial' : 'datos'
  const fijar = (c: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(c)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const [origen, setOrigen] = React.useState('')
  const [destino, setDestino] = React.useState('')
  const [alcance, setAlcance] = React.useState<'pci' | 'items'>('pci')
  const [items, setItems] = React.useState<string[]>([])
  const [desde, setDesde] = React.useState(ahoraLocal(1))
  const [hasta, setHasta] = React.useState(ahoraLocal(35))
  const [motivo, setMotivo] = React.useState('')
  const [verItems, setVerItems] = React.useState(false)
  const [ocupado, setOcupado] = React.useState(false)

  const pcis = useQuery({
    queryKey: ['apoyo-pcis', service.id],
    queryFn: async () => ((await sb.from('pcis').select('id, code').eq('service_id', service.id).is('deleted_at', null)
      .not('published_at', 'is', null).order('code', { ascending: false })).data ?? []) as any[],
  })
  const cuadrillas = useQuery({
    queryKey: ['apoyo-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name, supervisor_id, lider:profiles!crews_leader_id_fkey(full_name)')
      .eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  const todas = cuadrillas.data ?? []
  const destinos = todas.filter((c) => role !== 'supervisor' || c.supervisor_id === profile.id)
  const nombre = (id: string) => { const c = todas.find((x) => x.id === id); return c ? `${c.name}${c.lider?.full_name ? ` · ${c.lider.full_name}` : ''}` : '—' }
  const isoDe = (local: string) => local ? new Date(local).toISOString() : null

  const itemsDestino = useQuery({
    queryKey: ['apoyo-items', pciId, destino],
    enabled: !!pciId && !!destino && alcance === 'items',
    queryFn: async () => ((await sb.from('pci_items').select('id, item_number, term_days, status').eq('pci_id', pciId)
      .eq('assigned_crew_id', destino).is('deleted_at', null).order('item_number')).data ?? []) as any[],
  })
  const ver = useQuery({
    queryKey: ['apoyo-verificar', pciId, origen, destino, alcance, items, desde, hasta],
    enabled: !!pciId && !!origen && !!destino,
    queryFn: async () => {
      const { data, error } = await sb.rpc('apoyo_verificar' as any, {
        p_pci: pciId, p_origen: origen, p_destino: destino, p_alcance: alcance, p_items: alcance === 'items' ? items : [],
        p_desde: isoDe(desde), p_hasta: isoDe(hasta),
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const lista = useQuery({
    queryKey: ['apoyo-lista', service.id, pciId],
    queryFn: async () => ((await sb.rpc('apoyos_lista' as any, { p_service: service.id, p_pci: pciId || null } as any)).data ?? []) as any[],
  })
  const v = ver.data
  const vigenteDelPar = (lista.data ?? []).find((a) => a.estado === 'vigente' && a.origen_id === origen && a.destino_id === destino && a.pci_id === pciId)
  const refrescar = () => { for (const k of ['apoyo-lista', 'apoyo-verificar']) qc.invalidateQueries({ queryKey: [k] }) }

  const autorizar = async () => {
    setOcupado(true)
    const { data, error } = await sb.rpc('apoyo_autorizar' as any, {
      p_pci: pciId, p_origen: origen, p_destino: destino, p_alcance: alcance, p_items: alcance === 'items' ? items : [],
      p_desde: isoDe(desde), p_hasta: isoDe(hasta), p_motivo: motivo,
    } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Apoyo autorizado', { description: `${(data as any).items} ítems para consultar y registrar evidencias. Caduca solo al terminar la vigencia.` })
    setMotivo(''); refrescar()
  }
  const revocar = async (id: string) => {
    const m = prompt('Motivo de la revocación (obligatorio):')?.trim()
    if (!m) return
    const { error } = await sb.rpc('apoyo_revocar' as any, { p_apoyo: id, p_motivo: m } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Apoyo revocado', { description: 'Se conservan la autoría y el historial de evidencias.' })
    refrescar()
  }

  const falta = !origen ? 'Elige la cuadrilla de origen' : !destino ? 'Elige la cuadrilla de destino' : origen === destino ? 'Origen y destino deben ser distintos'
    : !pciId ? 'Elige el PCI' : alcance === 'items' && !items.length ? 'Elige los ítems' : !desde || !hasta || hasta <= desde ? 'Revisa la vigencia'
    : !motivo.trim() ? 'Escribe el motivo' : (v?.solapamientos ?? []).length ? 'Se solapa con otro apoyo vigente' : null
  const plazosTxt = (v?.por_plazo ?? []).map((x: any) => `${etiquetaPlazo(x.plazo)}:${x.n}`).join(' · ')
  const sync = v?.sincronizacion
  const syncOk = sync?.ultimo && new Date(sync.ultimo).getTime() > Date.now() - 24 * 3600_000 && !(sync.fallos_ultima > 0)

  return (
    <>
      <PageHeader title="Apoyo temporal entre cuadrillas" description="Autorización puntual para actividades del PCI"
        actions={
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {([['datos', 'Datos del apoyo', Calendar], ['historial', 'Historial', History]] as const).map(([k, t, I]) => (
              <button key={k} onClick={() => fijar({ tab: k === 'datos' ? '' : k })} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
                tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
            ))}
          </div>
        } />
      <PageBody className="space-y-4">
        {tab === 'historial' ? (
          <Historial lista={lista.data ?? []} cargando={lista.isLoading} revocar={revocar} refrescar={refrescar} />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
              <Card>
                <CardContent className="space-y-3 p-5 text-[13px]">
                  <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><Info className="size-4" />
                    Titular conservado: {destino ? nombre(destino) : 'elige la cuadrilla de destino'}.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo t="Origen (cuadrilla que apoya)">
                      <Select value={origen || '__'} onValueChange={(x) => setOrigen(x === '__' ? '' : x)}>
                        <SelectTrigger className="h-9"><Users className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="__">Elegir</SelectItem>
                          {todas.filter((c) => c.id !== destino).map((c) => <SelectItem key={c.id} value={c.id}>{nombre(c.id)}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo t="Destino (cuadrilla titular)">
                      <Select value={destino || '__'} onValueChange={(x) => { setDestino(x === '__' ? '' : x); setItems([]) }}>
                        <SelectTrigger className="h-9"><Users className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="__">Elegir</SelectItem>
                          {destinos.filter((c) => c.id !== origen).map((c) => <SelectItem key={c.id} value={c.id}>{nombre(c.id)}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo t="PCI">
                      <Select value={pciId || '__'} onValueChange={(x) => { fijar({ pci: x === '__' ? '' : x }); setItems([]) }}>
                        <SelectTrigger className="h-9"><Cone className="text-success size-3.5" /><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="__">Elegir PCI publicado</SelectItem>
                          {(pcis.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo t="Alcance del PCI">
                      <div className="bg-secondary inline-flex rounded-lg p-1">
                        {([['pci', 'PCI completo'], ['items', 'Ítems seleccionados']] as const).map(([k, t]) => (
                          <button key={k} onClick={() => setAlcance(k)} className={cn('rounded-md px-3 py-1 text-[12.5px] font-semibold',
                            alcance === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{t}</button>
                        ))}
                      </div>
                    </Campo>
                  </div>
                  {alcance === 'items' && destino && pciId && (
                    <div className="max-h-44 overflow-y-auto rounded-md border border-border p-2">
                      {(itemsDestino.data ?? []).length === 0 && <p className="text-muted-foreground text-[12px]">La cuadrilla titular no tiene ítems en este PCI.</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {(itemsDestino.data ?? []).map((i) => (
                          <label key={i.id} className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-[12px]', items.includes(i.id) ? 'border-primary bg-primary/[0.07]' : 'border-border')}>
                            <input type="checkbox" className="size-3.5" checked={items.includes(i.id)}
                              onChange={(e) => setItems(e.target.checked ? [...items, i.id] : items.filter((x) => x !== i.id))} />Ítem {i.item_number}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 font-semibold"><Layers className="size-4" />
                    Alcance: {v ? `${fmtNumber(v.items)} ítems${plazosTxt ? ` · ${plazosTxt}` : ''}` : '—'}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo t="Desde"><Input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9" /></Campo>
                    <Campo t="Hasta"><Input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9" /></Campo>
                  </div>
                  <Campo t="Motivo">
                    <div>
                      <div className="relative"><Pencil className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                        <Textarea rows={2} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="pl-8" placeholder="Apoyo para completar evidencias." /></div>
                      <p className="text-muted-foreground text-right text-[11px]">{motivo.length} / 200</p>
                    </div>
                  </Campo>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><KeyRound className="size-4" />Permiso temporal</CardTitle>
                    <CardDescription>Acciones habilitadas únicamente para los ítems y el período indicado.</CardDescription></CardHeader>
                  <CardContent className="space-y-2 text-[12.5px]">
                    {[
                      [true, 'Consultar ítems asignados', `Ver el detalle, estado y evidencias de los ${v ? fmtNumber(v.items) : 'N'} ítems.`],
                      [true, 'Registrar evidencias', `Cargar y gestionar evidencias en los ${v ? fmtNumber(v.items) : 'N'} ítems autorizados.`],
                      [false, 'Validar o publicar', 'No permitido en el apoyo temporal.'],
                    ].map(([ok, t, dsc]) => (
                      <label key={String(t)} className={cn('flex items-start gap-2 rounded-md px-3 py-2', ok ? 'bg-success/10' : 'bg-secondary text-muted-foreground')}>
                        <input type="checkbox" checked={!!ok} disabled readOnly className="mt-0.5 size-4" />
                        <span><strong className="block">{t}</strong>{dsc}</span>
                      </label>
                    ))}
                    <p className="bg-info/[0.08] text-info flex items-start gap-2 rounded-md px-3 py-2"><Info className="mt-0.5 size-4 shrink-0" />
                      <span><strong>Solo se permite la consulta temporal y el registro de evidencias.</strong> No cambia titular, cuadrilla permanente, roles globales ni vencimientos PCI.</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><ShieldCheck className="size-4" />Validaciones</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-[12.5px]">
                    {!v ? <p className="text-muted-foreground">Elige origen, destino y PCI para comprobar.</p> : (
                      <>
                        <p className={cn('flex items-start gap-2 rounded-md px-3 py-2', v.solapamientos.length ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                          {v.solapamientos.length ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
                          <span><strong>Disponibilidad y solapamientos:</strong> {v.solapamientos.length
                            ? `se solapa con ${v.solapamientos.map((x: any) => `${x.pci} (${x.destino})`).join(', ')}.`
                            : 'sin apoyos solapados.'} {v.carga_origen > 0 && `La cuadrilla de origen tiene ${v.carga_origen} ítems propios que vencen en el período.`}</span>
                        </p>
                        <p className={cn('flex items-start gap-2 rounded-md px-3 py-2', syncOk ? 'bg-success/10 text-success' : 'bg-warning/12 text-warning')}>
                          <RefreshCw className="mt-0.5 size-4 shrink-0" />
                          <span><strong>Sincronización:</strong> {sync?.ultimo ? `último contacto del jefe de origen ${fmtRelative(new Date(sync.ultimo))}${sync.fallos_ultima > 0 ? ', con error en el último envío' : ''}.` : 'el jefe de origen aún no sincroniza; recibirá el permiso al conectarse.'}</span>
                        </p>
                      </>
                    )}
                    <p className="text-muted-foreground flex items-start gap-2 px-1"><Info className="mt-0.5 size-4 shrink-0" />Supervisor concede y revoca; el apoyo caduca automáticamente.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
            <p className="bg-warning/12 text-warning flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]"><Info className="mt-0.5 size-4 shrink-0" />
              La revocación requiere un motivo; conserva la autoría y el historial de evidencias. Las cargas fuera de la vigencia (por trabajo sin conexión) se mantienen y quedarán pendientes de revisión y autorización; no se eliminan de forma automática.</p>
            {verItems && v && (
              <p className="bg-secondary/60 rounded-md px-3 py-2 text-[12.5px]">
                {fmtNumber(v.items)} ítems de {v.titular?.cuadrilla} en el alcance ({plazosTxt || 'sin plazos'}). Titular: {v.titular?.jefe ?? '—'}; apoyo: {v.origen?.cuadrilla} · {v.origen?.jefe ?? '—'}.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {falta && <span className="text-muted-foreground mr-auto text-[12px]">{falta}</span>}
              <Button variant="outline" onClick={() => setVerItems(!verItems)} disabled={!v}><Layers className="size-4" />Ver ítems ({v ? fmtNumber(v.items) : 0})</Button>
              <Button variant="outline" onClick={() => ver.refetch()} disabled={!v}><CalendarCheck className="size-4" />Revisar disponibilidad</Button>
              <Button variant="outline" onClick={() => fijar({ tab: 'historial' })}><ArrowLeftRight className="size-4" />Revisar cambios</Button>
              {role === 'supervisor' && (
                <Button onClick={autorizar} loading={ocupado} disabled={!!falta}><CheckCircle2 className="size-4" />Autorizar apoyo</Button>
              )}
              <Button variant="outline" className="border-warning/50 text-warning" disabled={!vigenteDelPar?.puedo_revocar}
                onClick={() => vigenteDelPar && revocar(vigenteDelPar.id)}><Ban className="size-4" />Revocar apoyo</Button>
              <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-[12px] font-medium">{t} <span className="text-destructive">*</span></span>{children}</label>
}

function Historial({ lista, cargando, revocar, refrescar }: { lista: any[]; cargando: boolean; revocar: (id: string) => void; refrescar: () => void }) {
  const [abierto, setAbierto] = React.useState('')
  if (cargando) return <SkeletonList rows={4} />
  return (
    <Card>
      <CardHeader><CardTitle className="text-[14px]">Apoyos temporales</CardTitle>
        <CardDescription>Cada autorización, revocación y caducidad, con sus fotos. Nada se borra.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {lista.length === 0 && <p className="text-muted-foreground text-[13px]">Sin apoyos registrados.</p>}
        {lista.map((a) => (
          <div key={a.id} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
            <p className="flex flex-wrap items-center gap-2">
              <Handshake className="text-muted-foreground size-4" />
              <Badge variant={ESTADO[a.estado]?.v}>{ESTADO[a.estado]?.t ?? a.estado}</Badge>
              <strong>{a.origen}</strong> apoya a <strong>{a.destino}</strong> · {a.pci} · {a.items} ítems
              <span className="text-muted-foreground">· {fmtDateTime(a.desde)} – {fmtDateTime(a.hasta)}</span>
              <span className="ml-auto flex gap-2">
                {a.fotos > 0 && <Button size="sm" variant="outline" onClick={() => setAbierto(abierto === a.id ? '' : a.id)}>
                  <Camera className="size-3.5" />{a.fotos} fotos{a.pendientes ? ` · ${a.pendientes} por autorizar` : ''}</Button>}
                {a.puedo_revocar && <Button size="sm" variant="outline" className="text-warning" onClick={() => revocar(a.id)}><Ban className="size-3.5" />Revocar</Button>}
              </span>
            </p>
            <p className="text-muted-foreground mt-0.5">Autorizó {a.por ?? '—'} el {fmtDateTime(a.cuando)} · Motivo: {a.motivo}</p>
            {a.revocado_at && <p className="text-warning mt-0.5">Revocó {a.revocado_por ?? '—'} el {fmtDateTime(a.revocado_at)} · Motivo: {a.motivo_revocacion}</p>}
            {abierto === a.id && <FotosDelApoyo apoyoId={a.id} alCambiar={refrescar} />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function FotosDelApoyo({ apoyoId, alCambiar }: { apoyoId: string; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const fotos = useQuery({
    queryKey: ['apoyo-fotos', apoyoId],
    queryFn: async () => {
      const { data } = await sb.from('evidences').select('id, phase, storage_path, thumb_path, taken_at, autorizacion_pendiente, pci_items(item_number)')
        .eq('apoyo_id' as any, apoyoId).is('deleted_at', null).order('taken_at')
      const filas = (data ?? []) as any[]
      const rutas = filas.map((f) => f.thumb_path ?? f.storage_path).filter(Boolean)
      const { data: s } = rutas.length ? await sb.storage.from('evidencias').createSignedUrls(rutas, 3600) : { data: [] as any[] }
      const urls = new Map((s ?? []).map((x: any) => [x.path, x.signedUrl]))
      return filas.map((f) => ({ ...f, url: urls.get(f.thumb_path ?? f.storage_path) }))
    },
  })
  const decidir = async (id: string, ok: boolean) => {
    const m = ok ? null : prompt('¿Por qué no se autoriza? (obligatorio)')?.trim()
    if (!ok && !m) return
    const { error } = await sb.rpc('evidencia_autorizar' as any, { p_ev: id, p_aceptar: ok, p_motivo: m } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(ok ? 'Foto autorizada: ya cuenta como evidencia' : 'Foto no autorizada')
    qc.invalidateQueries({ queryKey: ['apoyo-fotos', apoyoId] }); alCambiar()
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {(fotos.data ?? []).map((f) => (
        <div key={f.id} className={cn('overflow-hidden rounded-md border', f.autorizacion_pendiente ? 'border-warning' : 'border-border')}>
          {f.url ? <img src={f.url} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="bg-secondary aspect-[4/3]" />}
          <div className="space-y-1 p-1.5 text-[11px]">
            <p>Ítem {f.pci_items?.item_number} · {f.phase} · {f.taken_at ? fmtDateTime(f.taken_at) : ''}</p>
            {f.autorizacion_pendiente && (
              <div className="flex gap-1">
                <Button size="sm" className="h-6 flex-1 px-1 text-[11px]" onClick={() => decidir(f.id, true)}>Autorizar</Button>
                <Button size="sm" variant="outline" className="h-6 flex-1 px-1 text-[11px]" onClick={() => decidir(f.id, false)}>No</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
