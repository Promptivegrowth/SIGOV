'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes, PackageSearch, Check, X, AlertTriangle, Truck, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'

const PEDIDO_ESTADO = {
  borrador:   { label: 'Borrador',   variant: 'outline' as const },
  solicitado: { label: 'Solicitado', variant: 'warning' as const },
  aprobado:   { label: 'Aprobado',   variant: 'info' as const },
  parcial:    { label: 'Entregado en parte', variant: 'warning' as const },
  entregado:  { label: 'Entregado',  variant: 'success' as const },
  rechazado:  { label: 'Rechazado',  variant: 'destructive' as const },
  anulado:    { label: 'Anulado',    variant: 'outline' as const },
}

/** Sin tildes y en minúsculas: nadie las escribe al buscar. */
const paraBuscar = (t: string) =>
  t.normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase().trim()

const cifra = (n: number) =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(n ?? 0)

/**
 * Materiales desde administración.
 *
 * El capataz pide desde el celular; aquí el residente aprueba y el almacén
 * entrega. Entregar no es solo cambiar el estado: descuenta del stock, o el
 * inventario deja de valer a la primera salida.
 */
export function MaterialesClient() {
  const { service, profile, can } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [q, setQ] = React.useState('')
  const [resolviendo, setResolviendo] = React.useState<any>(null)

  const insumos = useQuery({
    queryKey: ['insumos', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_supplies')
        .select('*')
        .eq('service_id', service.id)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const pedidos = useQuery({
    queryKey: ['pedidos-insumo', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_supply_requests')
        .select('*')
        .eq('service_id', service.id)
        .order('needed_on', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['insumos'] })
    qc.invalidateQueries({ queryKey: ['pedidos-insumo'] })
  }

  const visibles = React.useMemo(() => {
    const texto = paraBuscar(q)
    if (!texto) return insumos.data ?? []
    return (insumos.data ?? []).filter(
      (s: any) => paraBuscar(s.name).includes(texto) || paraBuscar(s.code).includes(texto)
    )
  }, [insumos.data, q])

  const escasos = (insumos.data ?? []).filter(
    (s: any) => Number(s.stock) - Number(s.committed) <= Number(s.min_stock)
  )
  const abiertos = (pedidos.data ?? []).filter((p: any) =>
    ['solicitado', 'aprobado', 'parcial'].includes(p.status)
  )

  return (
    <>
      <PageHeader
        title="Materiales"
        description="Almacén del contrato, stock por insumo y pedidos de las cuadrillas"
        icon={Boxes}
      />

      <PageBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <Resumen titulo="Insumos" valor={String(insumos.data?.length ?? 0)} />
          <Resumen
            titulo="Bajo el mínimo"
            valor={String(escasos.length)}
            alerta={escasos.length > 0}
          />
          <Resumen titulo="Pedidos abiertos" valor={String(abiertos.length)} />
        </div>

        <Tabs defaultValue="pedidos" className="mt-6">
          <TabsList>
            <TabsTrigger value="pedidos">
              Pedidos {abiertos.length > 0 && (
                <Badge variant="warning" className="ml-1.5">{abiertos.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="almacen">Almacén</TabsTrigger>
          </TabsList>

          {/* ─── Pedidos ──────────────────────────────────────────────── */}
          <TabsContent value="pedidos" className="mt-4 space-y-2">
            {pedidos.isLoading && <SkeletonList rows={5} />}

            {pedidos.data?.length === 0 && (
              <EmptyState
                icon={PackageSearch}
                title="Sin pedidos"
                description="Cuando una cuadrilla pida insumos desde el celular, aparecerán aquí."
              />
            )}

            {pedidos.data?.map((p: any) => {
              const estado = PEDIDO_ESTADO[p.status as keyof typeof PEDIDO_ESTADO]
              return (
                <Card key={p.id}>
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{p.code ?? 'Sin número'}</p>
                        <Badge variant={estado?.variant ?? 'outline'}>{estado?.label ?? p.status}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[
                          p.crew_name,
                          `para el ${fmtDate(p.needed_on)}`,
                          `${p.item_count} insumo${p.item_count === 1 ? '' : 's'}`,
                          p.activity_name,
                          p.created_by_name,
                        ].filter(Boolean).join(' · ')}
                      </p>
                      {p.reason && <p className="mt-1 text-[13px]">«{p.reason}»</p>}
                      {p.review_note && (
                        <p className="text-muted-foreground mt-1 text-[13px]">{p.review_note}</p>
                      )}
                    </div>

                    {can.manage && ['solicitado', 'aprobado', 'parcial'].includes(p.status) && (
                      <Button size="sm" onClick={() => setResolviendo(p)}>
                        {p.status === 'solicitado' ? 'Revisar' : <><Truck /> Entregar</>}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          {/* ─── Almacén ──────────────────────────────────────────────── */}
          <TabsContent value="almacen" className="mt-4 space-y-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar insumo por nombre o código"
              className="max-w-md"
            />

            {insumos.isLoading && <SkeletonList rows={6} />}

            {visibles.map((s: any) => {
              const disponible = Number(s.stock) - Number(s.committed)
              const escaso = disponible <= Number(s.min_stock)
              return (
                <Card key={s.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-muted-foreground text-[13px]">
                        {[s.code, s.category].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {escaso && (
                      <Badge variant="destructive">
                        <AlertTriangle /> Bajo el mínimo de {cifra(Number(s.min_stock))}
                      </Badge>
                    )}
                    <div className="text-right">
                      <p className={cn('text-lg font-bold tabular-nums', escaso && 'text-destructive')}>
                        {cifra(disponible)} {s.unit_symbol}
                      </p>
                      <p className="text-muted-foreground text-[12px]">
                        {Number(s.committed) > 0
                          ? `de ${cifra(Number(s.stock))} · ${cifra(Number(s.committed))} comprometido`
                          : 'disponible'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {!insumos.isLoading && visibles.length === 0 && (
              <EmptyState
                icon={Search}
                title="Ningún insumo coincide"
                description="Prueba con otro nombre o con el código."
              />
            )}
          </TabsContent>
        </Tabs>
      </PageBody>

      <PedidoDialog
        pedido={resolviendo}
        profileId={profile.id}
        onClose={() => setResolviendo(null)}
        onHecho={() => { setResolviendo(null); refrescar() }}
      />
    </>
  )
}

function Resumen({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[12px]">{titulo}</p>
        <p className={cn('text-2xl font-bold', alerta && 'text-destructive')}>{valor}</p>
      </CardContent>
    </Card>
  )
}

/**
 * Aprobar, rechazar y entregar.
 *
 * La entrega genera el movimiento de salida de cada renglón: sin eso el
 * stock nunca baja y el almacén miente desde el primer pedido.
 */
function PedidoDialog({
  pedido,
  profileId,
  onClose,
  onHecho,
}: {
  pedido: any
  profileId: string
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [nota, setNota] = React.useState('')
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({})
  const [enviando, setEnviando] = React.useState(false)

  const renglones = useQuery({
    queryKey: ['renglones-pedido', pedido?.id],
    enabled: !!pedido,
    queryFn: async () => {
      const { data, error } = await sb
        .from('supply_request_items')
        .select('*, supplies(name, code, unit_id, units:unit_id(symbol))')
        .eq('request_id', pedido.id)
        .is('deleted_at', null)
      if (error) throw error
      return data ?? []
    },
  })

  React.useEffect(() => {
    setNota('')
    setCantidades({})
  }, [pedido?.id])

  if (!pedido) return null

  const esRevision = pedido.status === 'solicitado'

  const cantidadDe = (r: any) => {
    const escrito = cantidades[r.id]
    if (escrito != null && escrito !== '') return Number(escrito.replace(',', '.'))
    const pendiente = Number(r.qty_approved ?? r.qty_requested) - Number(r.qty_delivered)
    return Math.max(0, pendiente)
  }

  const resolver = async (estado: 'aprobado' | 'rechazado') => {
    if (estado === 'rechazado' && !nota.trim()) {
      toast.error('Escribe por qué se rechaza: la cuadrilla necesita saberlo')
      return
    }
    setEnviando(true)
    const { error } = await sb
      .from('supply_requests')
      .update({
        status: estado,
        review_note: nota.trim() || null,
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', pedido.id)
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(estado === 'aprobado' ? 'Pedido aprobado' : 'Pedido rechazado')
    onHecho()
  }

  const entregar = async () => {
    const aEntregar = (renglones.data ?? [])
      .map((r: any) => ({ renglon: r, cantidad: cantidadDe(r) }))
      .filter((x) => x.cantidad > 0)

    if (!aEntregar.length) {
      toast.error('No hay nada que entregar')
      return
    }
    setEnviando(true)

    // Cada renglón entregado sale del almacén
    const { error: errMov } = await sb.from('stock_movements').insert(
      aEntregar.map(({ renglon, cantidad }) => ({
        service_id: pedido.service_id,
        supply_id: renglon.supply_id,
        kind: 'salida' as const,
        qty: cantidad,
        crew_id: pedido.crew_id,
        request_id: pedido.id,
        notes: `Entrega del pedido ${pedido.code ?? ''}`.trim(),
        created_by: profileId,
      }))
    )
    if (errMov) { toast.error(errMov.message); setEnviando(false); return }

    for (const { renglon, cantidad } of aEntregar) {
      await sb
        .from('supply_request_items')
        .update({ qty_delivered: Number(renglon.qty_delivered) + cantidad })
        .eq('id', renglon.id)
    }

    // Completo solo si no quedó nada pendiente en ningún renglón
    const quedaPendiente = (renglones.data ?? []).some((r: any) => {
      const entregado = Number(r.qty_delivered) +
        (aEntregar.find((x) => x.renglon.id === r.id)?.cantidad ?? 0)
      return entregado < Number(r.qty_approved ?? r.qty_requested)
    })

    const { error } = await sb
      .from('supply_requests')
      .update({
        status: quedaPendiente ? 'parcial' : 'entregado',
        review_note: nota.trim() || pedido.review_note,
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', pedido.id)

    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(quedaPendiente ? 'Entrega parcial registrada' : 'Pedido entregado')
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{esRevision ? 'Revisar pedido' : 'Entregar pedido'} {pedido.code}</DialogTitle>
          <DialogDescription>
            {[pedido.crew_name, `para el ${fmtDate(pedido.needed_on)}`].filter(Boolean).join(' · ')}
            {pedido.reason ? ` · ${pedido.reason}` : ''}
          </DialogDescription>
        </DialogHeader>

        {renglones.isLoading && <SkeletonList rows={3} />}

        <div className="space-y-2">
          {renglones.data?.map((r: any) => {
            const pedidoQty = Number(r.qty_approved ?? r.qty_requested)
            const pendiente = pedidoQty - Number(r.qty_delivered)
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.supplies?.name}</p>
                  <p className="text-muted-foreground text-[12px]">
                    Pidió {cifra(pedidoQty)} {r.supplies?.units?.symbol}
                    {Number(r.qty_delivered) > 0 && ` · entregado ${cifra(Number(r.qty_delivered))}`}
                  </p>
                </div>
                {!esRevision && (
                  <Input
                    value={cantidades[r.id] ?? String(Math.max(0, pendiente))}
                    onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
                    inputMode="decimal"
                    className="w-24 text-right"
                    aria-label={`Cantidad a entregar de ${r.supplies?.name}`}
                  />
                )}
              </div>
            )
          })}
        </div>

        <Field label="Nota" hint={esRevision ? 'Obligatoria si rechazas' : 'Opcional'}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
        </Field>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {esRevision ? (
            <>
              <Button variant="outline" disabled={enviando} onClick={() => resolver('rechazado')}>
                <X /> Rechazar
              </Button>
              <Button disabled={enviando} onClick={() => resolver('aprobado')}>
                <Check /> Aprobar
              </Button>
            </>
          ) : (
            <Button disabled={enviando} onClick={entregar}>
              <Truck /> Registrar entrega
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
