'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PackageSearch, Check, X, Truck, Plus, Ban, Trash2, CircleDot, AlertTriangle, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/primitives'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  PEDIDO_ESTADO, cifra, leerCifra, paraBuscar, hoyLima, estadoDeStock,
  useInsumos, useCuadrillas, useUnidades, useCategorias, Selector, InsumoPicker,
} from './comun'

const FILTROS = [
  { key: 'abiertos', label: 'Abiertos', estados: ['solicitado', 'aprobado', 'parcial'] },
  { key: 'revisar',  label: 'Por revisar', estados: ['solicitado'] },
  { key: 'entregar', label: 'Por entregar', estados: ['aprobado', 'parcial'] },
  { key: 'cerrados', label: 'Cerrados', estados: ['entregado', 'rechazado', 'anulado'] },
  { key: 'todos',    label: 'Todos', estados: null },
] as const

/**
 * Los pedidos de materiales.
 *
 * La cuadrilla pide desde el celular; el residente o el supervisor también
 * pueden pedir desde aquí —para una cuadrilla que llamó por radio o para el
 * stock de la semana— y lo que ellos piden ya va autorizado. Cada pedido
 * guarda quién lo pidió, quién lo autorizó y quién entregó qué y cuándo.
 */
export function PedidosTab({ serviceId, can, profileId }: {
  serviceId: string
  can: { write: boolean; manage: boolean }
  profileId: string
}) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]['key']>('abiertos')
  const [q, setQ] = React.useState('')
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [nuevo, setNuevo] = React.useState(false)

  const pedidos = useQuery({
    queryKey: ['pedidos-insumo', serviceId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_supply_requests')
        .select('*')
        .eq('service_id', serviceId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  const cuenta = (key: string) => {
    const f = FILTROS.find((x) => x.key === key)!
    return (pedidos.data ?? []).filter((p: any) => !f.estados || (f.estados as readonly string[]).includes(p.status)).length
  }

  const visibles = React.useMemo(() => {
    const f = FILTROS.find((x) => x.key === filtro)!
    const t = paraBuscar(q)
    return (pedidos.data ?? [])
      .filter((p: any) => !f.estados || (f.estados as readonly string[]).includes(p.status))
      .filter((p: any) => !t || [p.code, p.crew_name, p.reason, p.created_by_name, p.activity_name]
        .some((x) => paraBuscar(x).includes(t)))
  }, [pedidos.data, filtro, q])

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['pedidos-insumo'] })
    qc.invalidateQueries({ queryKey: ['insumos'] })
    qc.invalidateQueries({ queryKey: ['kardex'] })
    qc.invalidateQueries({ queryKey: ['pedido'] })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filtro === f.key ? 'default' : 'outline'}
              onClick={() => setFiltro(f.key)}
            >
              {f.label} <span className="opacity-70 tabular-nums">{cuenta(f.key)}</span>
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, cuadrilla, motivo…" className="pl-9" />
        </div>
        {can.write && (
          <Button onClick={() => setNuevo(true)}>
            <Plus /> Nuevo pedido
          </Button>
        )}
      </div>

      {pedidos.isLoading && <SkeletonList rows={5} />}

      {!pedidos.isLoading && visibles.length === 0 && (
        <EmptyState
          icon={PackageSearch}
          title={pedidos.data?.length ? 'Ningún pedido en este filtro' : 'Sin pedidos'}
          description={pedidos.data?.length
            ? 'Prueba con «Todos» o con otra búsqueda.'
            : 'Los pedidos de las cuadrillas llegan aquí desde el celular. También puedes crear uno.'}
        />
      )}

      {visibles.map((p: any) => {
        const estado = PEDIDO_ESTADO[p.status as keyof typeof PEDIDO_ESTADO]
        const firmas = [
          p.created_by_name && `Pidió ${p.created_by_name} el ${fmtDate(p.created_at)}`,
          p.reviewed_by_name && `${p.status === 'rechazado' ? 'Rechazó' : 'Autorizó'} ${p.reviewed_by_name}`,
          p.delivered_at && `Última entrega ${fmtDate(p.delivered_at)}`,
          p.cancelled_by_name && `Anuló ${p.cancelled_by_name}`,
        ].filter(Boolean)
        return (
          <Card
            key={p.id}
            className="hover:border-primary/40 cursor-pointer transition-colors"
            onClick={() => setAbierto(p.id)}
          >
            <CardContent className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.code ?? 'Sin número'}</p>
                  <Badge variant={estado?.variant ?? 'outline'}>{estado?.label ?? p.status}</Badge>
                  {Number(p.items_fuera_de_catalogo) > 0 && (
                    <Badge variant="warning"><AlertTriangle /> {p.items_fuera_de_catalogo} fuera del catálogo</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-[13px]">
                  {[
                    p.crew_name ?? 'Sin cuadrilla',
                    `para el ${fmtDate(p.needed_on)}`,
                    `${p.item_count} insumo${Number(p.item_count) === 1 ? '' : 's'}`,
                    p.activity_name,
                    p.section_name,
                  ].filter(Boolean).join(' · ')}
                </p>
                {p.reason && <p className="mt-1 text-[13px]">«{p.reason}»</p>}
                <p className="text-muted-foreground mt-1 text-[12px]">{firmas.join(' · ')}</p>
              </div>
              {can.manage && ['solicitado', 'aprobado', 'parcial'].includes(p.status) && (
                <Button size="sm" onClick={(e) => { e.stopPropagation(); setAbierto(p.id) }}>
                  {p.status === 'solicitado' ? 'Revisar' : <><Truck /> Entregar</>}
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}

      {abierto && (
        <DetallePedido
          pedidoId={abierto}
          serviceId={serviceId}
          can={can}
          profileId={profileId}
          onClose={() => setAbierto(null)}
          onCambio={refrescar}
        />
      )}

      {nuevo && (
        <NuevoPedido
          serviceId={serviceId}
          puedeAprobar={can.manage}
          onClose={() => setNuevo(false)}
          onCreado={(id) => { setNuevo(false); refrescar(); setAbierto(id) }}
        />
      )}
    </div>
  )
}

// ─── El detalle ─────────────────────────────────────────────────────────

const PASO = {
  solicitado: { label: 'Pedido', color: 'text-foreground' },
  aprobado:   { label: 'Autorizado', color: 'text-info' },
  rechazado:  { label: 'Rechazado', color: 'text-destructive' },
  entregado:  { label: 'Entregado', color: 'text-success' },
  devolucion: { label: 'Devuelto', color: 'text-warning' },
  anulado:    { label: 'Anulado', color: 'text-muted-foreground' },
} as Record<string, { label: string; color: string }>

function DetallePedido({ pedidoId, serviceId, can, profileId, onClose, onCambio }: {
  pedidoId: string
  serviceId: string
  can: { write: boolean; manage: boolean }
  profileId: string
  onClose: () => void
  onCambio: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const insumos = useInsumos(serviceId)
  const [nota, setNota] = React.useState('')
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({})
  const [fecha, setFecha] = React.useState(hoyLima())
  const [enviando, setEnviando] = React.useState(false)
  const [adoptando, setAdoptando] = React.useState<any>(null)
  const [confirmarAnular, setConfirmarAnular] = React.useState(false)

  const pedido = useQuery({
    queryKey: ['pedido', pedidoId],
    queryFn: async () => {
      const [p, r, h] = await Promise.all([
        sb.from('v_supply_requests').select('*').eq('id', pedidoId).single(),
        sb.from('v_renglones_de_pedido').select('*').eq('request_id', pedidoId),
        sb.from('v_historial_de_pedido').select('*').eq('request_id', pedidoId).order('ocurrio'),
      ])
      if (p.error) throw p.error
      if (r.error) throw r.error
      if (h.error) throw h.error
      return { p: p.data as any, renglones: (r.data ?? []) as any[], historial: (h.data ?? []) as any[] }
    },
  })

  const recargar = () => { pedido.refetch(); onCambio() }

  React.useEffect(() => { setCantidades({}); setNota('') }, [pedido.data?.p?.status])

  const p = pedido.data?.p
  const renglones = pedido.data?.renglones ?? []
  const stockDe = (supplyId: string | null) =>
    supplyId ? insumos.data?.find((s: any) => s.id === supplyId) : null

  const esRevision = p?.status === 'solicitado'
  const esEntrega = p && ['aprobado', 'parcial'].includes(p.status)
  const fueraDeCatalogo = renglones.filter((r) => r.fuera_de_catalogo)
  const puedeAnular = p && (
    (can.manage && ['solicitado', 'aprobado', 'parcial'].includes(p.status)) ||
    (p.created_by === profileId && p.status === 'solicitado')
  )

  const valor = (r: any) => {
    const escrito = cantidades[r.id]
    if (escrito != null && escrito !== '') return leerCifra(escrito)
    if (esRevision) return Number(r.qty_requested)
    return Math.max(0, Number(r.qty_approved ?? r.qty_requested) - Number(r.qty_delivered))
  }

  const revisar = async (aprobar: boolean) => {
    if (!aprobar && !nota.trim()) {
      toast.error('Escribe por qué se rechaza: la cuadrilla necesita saberlo')
      return
    }
    setEnviando(true)
    const { error } = await sb.rpc('revisar_pedido', {
      p_request_id: pedidoId,
      p_aprobar: aprobar,
      p_nota: nota.trim(),
      p_cantidades: Object.fromEntries(renglones.map((r) => [r.id, valor(r)])),
    })
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(aprobar ? 'Pedido autorizado' : 'Pedido rechazado')
    recargar()
  }

  const entregar = async () => {
    if (fueraDeCatalogo.length) {
      toast.error(`Antes de entregar, añade al catálogo: ${fueraDeCatalogo.map((r) => r.nombre).join(', ')}`)
      return
    }
    const envio = Object.fromEntries(renglones.map((r) => [r.id, valor(r)]).filter(([, v]) => Number(v) > 0))
    if (!Object.keys(envio).length) { toast.error('No hay nada que entregar'); return }
    setEnviando(true)
    const { data, error } = await sb.rpc('entregar_pedido', {
      p_request_id: pedidoId,
      p_cantidades: envio,
      p_nota: nota.trim() || undefined,
      p_fecha: fecha || undefined,
    })
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(data === 'parcial' ? 'Entrega parcial registrada' : 'Pedido entregado')
    recargar()
  }

  const anular = async () => {
    setEnviando(true)
    const { error } = await sb
      .from('supply_requests')
      .update({ status: 'anulado', review_note: nota.trim() || p.review_note })
      .eq('id', pedidoId)
    setEnviando(false)
    setConfirmarAnular(false)
    if (error) { toast.error(error.message); return }
    toast.success('Pedido anulado')
    recargar()
  }

  const estado = p ? PEDIDO_ESTADO[p.status as keyof typeof PEDIDO_ESTADO] : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Pedido {p?.code ?? ''}
            {estado && <Badge variant={estado.variant}>{estado.label}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {p ? [p.crew_name ?? 'Sin cuadrilla', `para el ${fmtDate(p.needed_on)}`, p.activity_name, p.section_name]
              .filter(Boolean).join(' · ') : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        {pedido.isLoading && <SkeletonList rows={4} />}

        {p && (
          <div className="space-y-5">
            {p.reason && <p className="text-[13px]">«{p.reason}»</p>}

            {/* Renglones */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="bg-secondary/50 text-muted-foreground text-left text-[11.5px]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Insumo</th>
                    <th className="px-2 py-2 text-right font-medium">Pedido</th>
                    <th className="px-2 py-2 text-right font-medium">Autorizado</th>
                    <th className="px-2 py-2 text-right font-medium">Entregado</th>
                    <th className="px-2 py-2 text-right font-medium">En almacén</th>
                    {(can.manage && (esRevision || esEntrega)) && (
                      <th className="px-3 py-2 text-right font-medium">{esRevision ? 'Autorizar' : 'Entregar ahora'}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r) => {
                    const s = stockDe(r.supply_id)
                    // Al revisar importa lo libre (sin lo ya comprometido con otros
                    // pedidos); al entregar, lo que hay físicamente.
                    const disponible = s ? (esEntrega ? Number(s.stock) : estadoDeStock(s).disponible) : null
                    const falta = esEntrega && disponible != null && valor(r) > disponible
                    return (
                      <tr key={r.id} className={cn('border-t', r.fuera_de_catalogo && 'bg-warning/5')}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.nombre}</p>
                          <p className="text-muted-foreground text-[11.5px]">
                            {r.fuera_de_catalogo ? 'Escrito por la cuadrilla · no está en el catálogo' : r.codigo}
                          </p>
                          {r.fuera_de_catalogo && can.manage && !['rechazado', 'anulado', 'entregado'].includes(p.status) && (
                            <Button size="sm" variant="outline" className="mt-1.5" onClick={() => setAdoptando(r)}>
                              <Plus /> Añadir al catálogo
                            </Button>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{cifra(r.qty_requested)} {r.unidad ?? ''}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.qty_approved != null ? cifra(r.qty_approved) : '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{cifra(r.qty_delivered)}</td>
                        <td className={cn('px-2 py-2 text-right tabular-nums', disponible != null && disponible <= 0 && 'text-destructive')}>
                          {disponible != null ? cifra(disponible) : '—'}
                        </td>
                        {(can.manage && (esRevision || esEntrega)) && (
                          <td className="px-3 py-2 text-right">
                            <Input
                              value={cantidades[r.id] ?? String(valor(r))}
                              onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
                              inputMode="decimal"
                              disabled={r.fuera_de_catalogo && esEntrega}
                              className={cn('ml-auto h-8 w-24 text-right', falta && 'border-warning')}
                              aria-label={`Cantidad de ${r.nombre}`}
                            />
                            {falta && <p className="text-warning mt-1 text-[11px]">No alcanza el stock</p>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Acciones */}
            {can.manage && (esRevision || esEntrega) && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Nota" hint={esRevision ? 'Obligatoria si rechazas' : 'Guía, quién recibió…'}>
                    <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
                  </Field>
                  {esEntrega && (
                    <Field label="Fecha de entrega">
                      <Input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} />
                    </Field>
                  )}
                </div>
                {esEntrega && renglones.some((r) => {
                  const s = stockDe(r.supply_id)
                  return s && valor(r) > Number(s.stock)
                }) && (
                  <p className="bg-warning/10 text-warning rounded-md px-3 py-2 text-[12.5px]">
                    Algún insumo no tiene stock suficiente en el sistema. Si el material sí está en el almacén,
                    falta registrar su ingreso; la entrega se registra igual y el stock quedará en negativo.
                  </p>
                )}
              </div>
            )}

            {/* Historial */}
            <div>
              <p className="text-muted-foreground mb-2 text-[11.5px] font-semibold tracking-wide uppercase">Trazabilidad</p>
              <ol className="space-y-2.5">
                {(pedido.data?.historial ?? []).map((h, i) => {
                  const paso = PASO[h.paso] ?? { label: h.paso, color: '' }
                  return (
                    <li key={i} className="flex gap-3 text-[13px]">
                      <CircleDot className={cn('mt-0.5 size-4 shrink-0', paso.color)} />
                      <div className="min-w-0">
                        <p>
                          <span className="font-medium">{paso.label}</span>
                          {h.cantidad != null && <> · {cifra(h.cantidad)} de {h.insumo}</>}
                          {h.quien && <> · {h.quien}</>}
                        </p>
                        <p className="text-muted-foreground text-[12px]">
                          {fmtDateTime(h.ocurrio)}{h.detalle ? ` · ${h.detalle}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {puedeAnular && (
            confirmarAnular ? (
              <Button variant="destructive" loading={enviando} onClick={anular} className="sm:mr-auto">
                <Ban /> Sí, anular el pedido
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmarAnular(true)} className="sm:mr-auto">
                <Ban /> Anular
              </Button>
            )
          )}
          {can.manage && esRevision && (
            <>
              <Button variant="outline" disabled={enviando} onClick={() => revisar(false)}>
                <X /> Rechazar
              </Button>
              <Button loading={enviando} onClick={() => revisar(true)}>
                <Check /> Autorizar
              </Button>
            </>
          )}
          {can.manage && esEntrega && (
            <Button loading={enviando} onClick={entregar}>
              <Truck /> Registrar entrega
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {adoptando && (
        <AdoptarDialog
          renglon={adoptando}
          serviceId={serviceId}
          onClose={() => setAdoptando(null)}
          onHecho={() => { setAdoptando(null); recargar() }}
        />
      )}
    </Dialog>
  )
}

// ─── Pedir desde la web ────────────────────────────────────────────────

type Renglon = { key: string; insumo?: any; nombre?: string; unidadId?: string; qty: string; notas: string }

function NuevoPedido({ serviceId, puedeAprobar, onClose, onCreado }: {
  serviceId: string
  puedeAprobar: boolean
  onClose: () => void
  onCreado: (id: string) => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const insumos = useInsumos(serviceId)
  const cuadrillas = useCuadrillas(serviceId)
  const unidades = useUnidades()
  const [crewId, setCrewId] = React.useState('')
  const [fecha, setFecha] = React.useState(hoyLima())
  const [partidaId, setPartidaId] = React.useState('')
  const [tramoId, setTramoId] = React.useState('')
  const [motivo, setMotivo] = React.useState('')
  const [aprobar, setAprobar] = React.useState(true)
  const [renglones, setRenglones] = React.useState<Renglon[]>([])
  const [enviando, setEnviando] = React.useState(false)

  const tramos = useQuery({
    queryKey: ['tramos', serviceId],
    queryFn: async () => {
      const { data, error } = await sb.from('road_sections').select('id, code, name')
        .eq('service_id', serviceId).is('deleted_at', null).order('code')
      if (error) throw error
      return data ?? []
    },
  })

  // Las partidas de esa cuadrilla programadas cerca de la fecha: el pedido
  // cuelga de la partida para que se vea qué se cae si el material no llega.
  const partidas = useQuery({
    queryKey: ['partidas-para-pedido', serviceId, crewId, fecha],
    enabled: !!crewId,
    queryFn: async () => {
      const d = new Date(fecha + 'T12:00:00')
      const desde = new Date(d.getTime() - 7 * 864e5).toISOString().slice(0, 10)
      const hasta = new Date(d.getTime() + 14 * 864e5).toISOString().slice(0, 10)
      const { data, error } = await sb.from('v_plan_items')
        .select('id, activity_name, scheduled_on, section_id, section_name, prog_start_txt, prog_end_txt, status')
        .eq('service_id', serviceId).eq('crew_id', crewId)
        .gte('scheduled_on', desde).lte('scheduled_on', hasta)
        .order('scheduled_on')
      if (error) throw error
      return data ?? []
    },
  })

  const agregar = (s: any) =>
    setRenglones((r) => [...r, { key: crypto.randomUUID(), insumo: s, qty: '', notas: '' }])
  const agregarEscrito = () =>
    setRenglones((r) => [...r, { key: crypto.randomUUID(), nombre: '', unidadId: '', qty: '', notas: '' }])
  const cambiar = (key: string, cambio: Partial<Renglon>) =>
    setRenglones((r) => r.map((x) => (x.key === key ? { ...x, ...cambio } : x)))

  const crear = async () => {
    if (!renglones.length) { toast.error('Añade al menos un insumo'); return }
    for (const r of renglones) {
      if (!(leerCifra(r.qty) > 0)) { toast.error(`Falta la cantidad de ${r.insumo?.name ?? (r.nombre || 'un renglón')}`); return }
      if (!r.insumo && !r.nombre?.trim()) { toast.error('Escribe qué se pide en el renglón suelto'); return }
    }
    setEnviando(true)
    const { data, error } = await sb.rpc('crear_pedido', {
      p_service_id: serviceId,
      p_crew_id: crewId || undefined,
      p_needed_on: fecha,
      p_reason: motivo.trim(),
      p_section_id: tramoId || undefined,
      p_plan_item_id: partidaId || undefined,
      p_items: renglones.map((r) => r.insumo
        ? { supply_id: r.insumo.id, qty: leerCifra(r.qty), notes: r.notas }
        : { other_name: r.nombre!.trim(), other_unit_id: r.unidadId || null, qty: leerCifra(r.qty), notes: r.notas }),
      p_aprobar: puedeAprobar && aprobar,
    } as any)
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(puedeAprobar && aprobar ? 'Pedido creado y autorizado' : 'Pedido enviado para revisión')
    onCreado(data as string)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nuevo pedido de materiales</DialogTitle>
          <DialogDescription>
            Se numera solo. Queda firmado por ti y, si lo autorizas al crearlo, pasa directo a entrega.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cuadrilla" hint="Vacío si es para el almacén o la oficina">
            <Selector value={crewId} onChange={(v) => { setCrewId(v); setPartidaId('') }}>
              <option value="">Sin cuadrilla</option>
              {cuadrillas.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Selector>
          </Field>
          <Field label="Para el">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Partida de la programación" hint={crewId ? 'Opcional' : 'Elige antes la cuadrilla'}>
            <Selector
              value={partidaId}
              disabled={!crewId}
              onChange={(v) => {
                setPartidaId(v)
                const pi = partidas.data?.find((x: any) => x.id === v)
                if (pi?.section_id) setTramoId(pi.section_id)
              }}
            >
              <option value="">Ninguna</option>
              {partidas.data?.map((x: any) => (
                <option key={x.id} value={x.id}>
                  {fmtDate(x.scheduled_on)} · {x.activity_name} · {x.prog_start_txt ?? ''}
                </option>
              ))}
            </Selector>
          </Field>
          <Field label="Tramo">
            <Selector value={tramoId} onChange={setTramoId}>
              <option value="">Sin tramo</option>
              {tramos.data?.map((t: any) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
            </Selector>
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sellado de fisuras km 1081, reposición de EPP…" />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium">Insumos</p>
          <InsumoPicker
            insumos={insumos.data ?? []}
            onElegir={agregar}
            excluir={renglones.map((r) => r.insumo?.id).filter(Boolean)}
          />
          {renglones.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
              {r.insumo ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.insumo.name}</p>
                  <p className="text-muted-foreground text-[11.5px]">
                    {r.insumo.code} · en almacén {cifra(estadoDeStock(r.insumo).disponible)} {r.insumo.unit_symbol ?? ''}
                  </p>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <Input
                    value={r.nombre}
                    onChange={(e) => cambiar(r.key, { nombre: e.target.value })}
                    placeholder="Qué se pide (no está en el catálogo)"
                    className="h-8 min-w-48 flex-1"
                  />
                  <Selector value={r.unidadId ?? ''} onChange={(v) => cambiar(r.key, { unidadId: v })} className="h-8 w-32">
                    <option value="">Unidad</option>
                    {unidades.data?.map((u: any) => <option key={u.id} value={u.id}>{u.symbol}</option>)}
                  </Selector>
                </div>
              )}
              <Input
                value={r.qty}
                onChange={(e) => cambiar(r.key, { qty: e.target.value })}
                inputMode="decimal"
                placeholder="Cant."
                className="h-8 w-24 text-right"
                aria-label="Cantidad"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setRenglones((x) => x.filter((y) => y.key !== r.key))}
                aria-label="Quitar"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={agregarEscrito}>
            <Plus /> Algo que no está en el catálogo
          </Button>
        </div>

        {puedeAprobar && (
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={aprobar} onCheckedChange={(v) => setAprobar(!!v)} />
            Autorizarlo al crearlo (queda firmado por ti)
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button loading={enviando} onClick={crear}>
            <Check /> {puedeAprobar && aprobar ? 'Crear y autorizar' : 'Enviar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Del pedido suelto al maestro ──────────────────────────────────────

/**
 * Añadir al catálogo lo que la cuadrilla pidió escrito.
 *
 * El insumo nace con la categoría del maestro y, si no se escribe uno, con
 * el siguiente código de esa categoría. Los pedidos que lo pedían escrito
 * se reapuntan solos al insumo nuevo, sin perder cantidad ni fecha.
 */
function AdoptarDialog({ renglon, serviceId, onClose, onHecho }: {
  renglon: any
  serviceId: string
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const unidades = useUnidades()
  const categorias = useCategorias()
  const [code, setCode] = React.useState('')
  const [categoria, setCategoria] = React.useState('')
  const [minimo, setMinimo] = React.useState('0')
  const [unitId, setUnitId] = React.useState<string>(renglon.unit_id ?? '')
  const [enviando, setEnviando] = React.useState(false)

  const prefijo = categorias.data?.find((c: any) => c.name === categoria)?.code ?? 'OTR'
  const siguiente = useQuery({
    queryKey: ['siguiente-codigo', serviceId, prefijo],
    queryFn: async () => {
      const { data, error } = await sb.rpc('siguiente_codigo_material', {
        p_service_id: serviceId,
        p_prefijo: prefijo,
      })
      if (error) throw error
      return data as string
    },
  })

  const adoptar = async () => {
    if (!categoria) { toast.error('Elige su categoría: de ella sale el código'); return }
    setEnviando(true)
    const { error } = await sb.rpc('adoptar_insumo', {
      p_service_id: serviceId,
      p_nombre: renglon.nombre,
      p_code: code.trim(),
      p_unit_id: unitId || undefined,
      p_category: categoria,
      p_min_stock: leerCifra(minimo) || 0,
    })
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${renglon.nombre} ya está en el catálogo`)
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir al catálogo</DialogTitle>
          <DialogDescription>
            «{renglon.nombre}» pasa a ser un insumo del contrato. Los pedidos que
            lo piden escrito se reapuntan solos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Categoría">
            <Selector value={categoria} onChange={setCategoria} autoFocus>
              <option value="">Elige una…</option>
              {categorias.data?.map((c: any) => (
                <option key={c.code} value={c.name}>{c.code} · {c.name}</option>
              ))}
            </Selector>
          </Field>
          <Field
            label="Código"
            hint={code.trim() ? 'Con el que lo busca el almacén' : 'Si lo dejas vacío se le da el siguiente de su categoría'}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={categoria && siguiente.data ? siguiente.data : 'Automático'}
            />
          </Field>
          <Field label="Unidad">
            <Selector value={unitId} onChange={setUnitId}>
              <option value="">Sin unidad</option>
              {unidades.data?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.symbol} · {u.name}</option>
              ))}
            </Selector>
          </Field>
          <Field label="Stock mínimo" hint="Cuándo avisar que hay que reponer">
            <Input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button loading={enviando} onClick={adoptar}>
            <Check /> Añadir al catálogo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
