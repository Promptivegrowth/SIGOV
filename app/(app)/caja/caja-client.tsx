'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, ReceiptText, Landmark, Check, X, AlertTriangle, Eye, Banknote,
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
import { ImageViewer } from '@/components/shared/image-viewer'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'

/** Los estados de un movimiento, con el tono que les corresponde. */
const MOVIMIENTO_ESTADO = {
  registrado: { label: 'Por revisar', variant: 'warning' as const },
  observado:  { label: 'Observado',   variant: 'destructive' as const },
  aprobado:   { label: 'Aprobado',    variant: 'success' as const },
  anulado:    { label: 'Anulado',     variant: 'outline' as const },
}

const SOLICITUD_ESTADO = {
  solicitado: { label: 'Solicitado', variant: 'warning' as const },
  aprobado:   { label: 'Aprobado',   variant: 'info' as const },
  depositado: { label: 'Depositado', variant: 'success' as const },
  rechazado:  { label: 'Rechazado',  variant: 'destructive' as const },
}

const soles = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)

/**
 * Caja chica desde administración.
 *
 * El capataz anota el gasto con su boleta desde el celular; aquí es donde se
 * revisa, se aprueba u observa, y donde se responden las solicitudes de
 * depósito. Sin esta pantalla el dinero entra al sistema pero nunca se cierra.
 */
export function CajaClient() {
  const { service, profile, can } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const [caja, setCaja] = React.useState<string>('todas')
  const [revisando, setRevisando] = React.useState<any>(null)
  const [resolviendo, setResolviendo] = React.useState<any>(null)
  const [comprobante, setComprobante] = React.useState<string | null>(null)

  const rango = React.useMemo(() => rangeFromPreset(preset), [preset])

  // ─── Las cajas y sus saldos ───────────────────────────────────────────
  const cajas = useQuery({
    queryKey: ['cajas', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_cash_boxes')
        .select('*')
        .eq('service_id', service.id)
        .order('code')
      if (error) throw error
      return data ?? []
    },
  })

  // ─── Los movimientos del periodo ──────────────────────────────────────
  const movimientos = useQuery({
    queryKey: ['caja-movimientos', service.id, caja, rango.from, rango.to],
    queryFn: async () => {
      let q = sb
        .from('v_cash_movements')
        .select('*')
        .eq('service_id', service.id)
        .gte('occurred_on', rango.from)
        .lte('occurred_on', rango.to)
        .order('occurred_on', { ascending: false })
      if (caja !== 'todas') q = q.eq('cash_box_id', caja)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const solicitudes = useQuery({
    queryKey: ['caja-solicitudes', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('deposit_requests')
        .select('*, cash_boxes(code, name, crew_id)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['cajas'] })
    qc.invalidateQueries({ queryKey: ['caja-movimientos'] })
    qc.invalidateQueries({ queryKey: ['caja-solicitudes'] })
  }

  /** Ver la boleta: la ruta se firma al vuelo, el bucket no es público. */
  const verComprobante = async (ruta: string) => {
    const { data, error } = await sb.storage.from('documentos').createSignedUrl(ruta, 3600)
    if (error || !data) { toast.error('No se pudo abrir el comprobante'); return }
    setComprobante(data.signedUrl)
  }

  const resolverMovimiento = async (id: string, estado: 'aprobado' | 'observado' | 'anulado', nota?: string) => {
    const { error } = await sb
      .from('cash_movements')
      .update({
        status: estado,
        review_note: nota?.trim() || null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success(
      estado === 'aprobado' ? 'Gasto aprobado'
        : estado === 'observado' ? 'Gasto observado, el capataz lo verá en su celular'
        : 'Gasto anulado'
    )
    setRevisando(null)
    refrescar()
  }

  const pendientes = movimientos.data?.filter((m: any) => m.status === 'registrado') ?? []
  const solicitudesAbiertas = solicitudes.data?.filter((s: any) => s.status === 'solicitado') ?? []

  return (
    <>
      <PageHeader
        title="Caja chica"
        description="Saldos por cuadrilla, revisión de gastos y solicitudes de depósito"
        icon={Wallet}
        actions={<DateRangeTabs value={preset} onChange={setPreset} />}
      />

      <PageBody>
        {/* Los saldos: lo primero que administración necesita ver */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cajas.isLoading && <SkeletonList rows={3} />}
          {cajas.data?.map((c: any) => {
            const bajo = Number(c.balance) <= Number(c.low_balance_threshold)
            const elegida = caja === c.id
            return (
              <Card
                key={c.id}
                onClick={() => setCaja(elegida ? 'todas' : c.id)}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-sm',
                  elegida && 'ring-primary/40 ring-2'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground truncate text-[12px]">{c.crew_name ?? c.name}</p>
                      <p className={cn('text-2xl font-bold', bajo && 'text-destructive')}>
                        {soles(Number(c.balance))}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate text-[12px]">
                        {c.holder_name ?? 'Sin responsable'}
                      </p>
                    </div>
                    {bajo && (
                      <Badge variant="destructive" className="shrink-0">
                        <AlertTriangle /> Saldo bajo
                      </Badge>
                    )}
                  </div>

                  {(Number(c.pending_review) > 0 || Number(c.observed) > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Number(c.pending_review) > 0 && (
                        <Badge variant="warning">{c.pending_review} por revisar</Badge>
                      )}
                      {Number(c.observed) > 0 && (
                        <Badge variant="destructive">{c.observed} observado</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Tabs defaultValue="gastos" className="mt-6">
          <TabsList>
            <TabsTrigger value="gastos">
              Gastos {pendientes.length > 0 && <Badge variant="warning" className="ml-1.5">{pendientes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="depositos">
              Depósitos {solicitudesAbiertas.length > 0 && (
                <Badge variant="warning" className="ml-1.5">{solicitudesAbiertas.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Gastos ───────────────────────────────────────────────── */}
          <TabsContent value="gastos" className="mt-4 space-y-2">
            {movimientos.isLoading && <SkeletonList rows={6} />}

            {movimientos.data?.length === 0 && (
              <EmptyState
                icon={ReceiptText}
                title="Sin movimientos en el periodo"
                description="Amplía el rango de fechas o revisa otra caja."
              />
            )}

            {movimientos.data?.map((m: any) => {
              const estado = MOVIMIENTO_ESTADO[m.status as keyof typeof MOVIMIENTO_ESTADO]
              const entra = Number(m.signed_amount) >= 0
              return (
                <Card key={m.id}>
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{m.description}</p>
                        <Badge variant={estado?.variant ?? 'outline'}>{estado?.label ?? m.status}</Badge>
                        {m.kind === 'gasto' && !m.storage_path && (
                          <Badge variant="destructive">Sin comprobante</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[
                          fmtDate(m.occurred_on),
                          m.box_code,
                          m.category,
                          m.supplier,
                          m.receipt_number,
                          m.created_by_name,
                        ].filter(Boolean).join(' · ')}
                      </p>
                      {m.review_note && (
                        <p className="text-destructive mt-1 text-[13px]">«{m.review_note}»</p>
                      )}
                    </div>

                    <p className={cn('text-lg font-bold tabular-nums', entra ? 'text-success' : '')}>
                      {entra ? '+' : '−'}{soles(Math.abs(Number(m.signed_amount)))}
                    </p>

                    <div className="flex w-full gap-2 sm:w-auto">
                      {m.storage_path && (
                        <Button size="sm" variant="outline" onClick={() => verComprobante(m.storage_path)}>
                          <Eye /> Comprobante
                        </Button>
                      )}
                      {can.manage && m.status !== 'aprobado' && m.kind !== 'apertura' && (
                        <Button size="sm" onClick={() => setRevisando(m)}>
                          Revisar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          {/* ─── Solicitudes de depósito ──────────────────────────────── */}
          <TabsContent value="depositos" className="mt-4 space-y-2">
            {solicitudes.isLoading && <SkeletonList rows={4} />}

            {solicitudes.data?.length === 0 && (
              <EmptyState
                icon={Landmark}
                title="Sin solicitudes"
                description="Cuando una cuadrilla se quede sin fondo, su pedido aparecerá aquí."
              />
            )}

            {solicitudes.data?.map((s: any) => {
              const estado = SOLICITUD_ESTADO[s.status as keyof typeof SOLICITUD_ESTADO]
              return (
                <Card key={s.id}>
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{s.reason}</p>
                        <Badge variant={estado?.variant ?? 'outline'}>{estado?.label ?? s.status}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[
                          s.cash_boxes?.code,
                          fmtDate(s.created_at),
                          s.bank_reference && `Operación ${s.bank_reference}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                      {s.resolution_note && (
                        <p className="text-muted-foreground mt-1 text-[13px]">«{s.resolution_note}»</p>
                      )}
                    </div>

                    <p className="text-lg font-bold tabular-nums">{soles(Number(s.amount))}</p>

                    {can.manage && s.status === 'solicitado' && (
                      <Button size="sm" onClick={() => setResolviendo(s)}>
                        <Banknote /> Responder
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>
        </Tabs>
      </PageBody>

      <RevisionDialog
        movimiento={revisando}
        onClose={() => setRevisando(null)}
        onResolver={resolverMovimiento}
        onVerComprobante={verComprobante}
      />

      <DepositoDialog
        solicitud={resolviendo}
        profileId={profile.id}
        serviceId={service.id}
        onClose={() => setResolviendo(null)}
        onHecho={() => { setResolviendo(null); refrescar() }}
      />

      {/* El comprobante, con zoom: el importe de una boleta térmica no se
          lee sin acercar. */}
      <Dialog open={!!comprobante} onOpenChange={(o) => !o && setComprobante(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Comprobante</DialogTitle>
            <DialogDescription>
              Rueda del ratón o doble clic para acercar
            </DialogDescription>
          </DialogHeader>
          {comprobante && (
            <ImageViewer
              src={comprobante}
              alt="Comprobante del gasto"
              descargar="comprobante.jpg"
              className="h-[70vh] w-full"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Aprobar, observar o anular un gasto. */
function RevisionDialog({
  movimiento,
  onClose,
  onResolver,
  onVerComprobante,
}: {
  movimiento: any
  onClose: () => void
  onResolver: (id: string, estado: 'aprobado' | 'observado' | 'anulado', nota?: string) => Promise<void>
  onVerComprobante: (ruta: string) => void
}) {
  const [nota, setNota] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => { setNota('') }, [movimiento?.id])

  if (!movimiento) return null

  const ejecutar = async (estado: 'aprobado' | 'observado' | 'anulado') => {
    if (estado !== 'aprobado' && !nota.trim()) {
      toast.error('Escribe el motivo: el capataz necesita saber qué corregir')
      return
    }
    setEnviando(true)
    await onResolver(movimiento.id, estado, nota)
    setEnviando(false)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar gasto</DialogTitle>
          <DialogDescription>{movimiento.description}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <Dato titulo="Importe" valor={soles(Number(movimiento.amount))} />
          <Dato titulo="Fecha" valor={fmtDate(movimiento.occurred_on)} />
          <Dato titulo="Rubro" valor={movimiento.category ?? '—'} />
          <Dato titulo="Caja" valor={movimiento.box_code} />
          <Dato titulo="Proveedor" valor={movimiento.supplier ?? '—'} />
          <Dato titulo="Comprobante" valor={
            [movimiento.receipt_kind, movimiento.receipt_number].filter(Boolean).join(' ') || '—'
          } />
        </dl>

        {movimiento.storage_path ? (
          <Button variant="outline" onClick={() => onVerComprobante(movimiento.storage_path)}>
            <Eye /> Ver el comprobante
          </Button>
        ) : (
          <p className="text-destructive text-[13px]">
            Este gasto llegó sin foto de comprobante.
          </p>
        )}

        <Field label="Motivo" hint="Obligatorio si lo observas o lo anulas">
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Falta el número de boleta, el importe no coincide…"
            rows={3}
          />
        </Field>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" disabled={enviando} onClick={() => ejecutar('anulado')}>
            <X /> Anular
          </Button>
          <Button variant="outline" disabled={enviando} onClick={() => ejecutar('observado')}>
            <AlertTriangle /> Observar
          </Button>
          <Button disabled={enviando} onClick={() => ejecutar('aprobado')}>
            <Check /> Aprobar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Responder una solicitud de depósito.
 *
 * Aprobar no es solo cambiar un estado: si se depositó, el dinero tiene que
 * entrar a la caja como movimiento, o el saldo del capataz no sube.
 */
function DepositoDialog({
  solicitud,
  profileId,
  serviceId,
  onClose,
  onHecho,
}: {
  solicitud: any
  profileId: string
  serviceId: string
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [monto, setMonto] = React.useState('')
  const [operacion, setOperacion] = React.useState('')
  const [nota, setNota] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => {
    setMonto(solicitud ? String(solicitud.amount) : '')
    setOperacion('')
    setNota('')
  }, [solicitud?.id])

  if (!solicitud) return null

  const depositar = async () => {
    const importe = Number(monto.replace(',', '.'))
    if (!Number.isFinite(importe) || importe <= 0) {
      toast.error('Escribe el monto depositado')
      return
    }
    if (!operacion.trim()) {
      toast.error('Falta el número de operación del abono')
      return
    }
    setEnviando(true)

    // El ingreso entra ya aprobado: administración es quien lo hizo
    const { data: movimiento, error: errMov } = await sb
      .from('cash_movements')
      .insert({
        service_id: serviceId,
        cash_box_id: solicitud.cash_box_id,
        kind: 'deposito',
        status: 'aprobado',
        amount: importe,
        description: `Depósito a caja · ${solicitud.reason}`,
        receipt_kind: 'recibo',
        receipt_number: operacion.trim(),
        created_by: profileId,
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (errMov) { toast.error(errMov.message); setEnviando(false); return }

    const { error } = await sb
      .from('deposit_requests')
      .update({
        status: 'depositado',
        approved_amount: importe,
        bank_reference: operacion.trim(),
        resolution_note: nota.trim() || null,
        resolved_by: profileId,
        resolved_at: new Date().toISOString(),
        movement_id: movimiento.id,
      })
      .eq('id', solicitud.id)

    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Depósito registrado. El capataz verá el saldo actualizado.')
    onHecho()
  }

  const rechazar = async () => {
    if (!nota.trim()) { toast.error('Escribe por qué se rechaza'); return }
    setEnviando(true)
    const { error } = await sb
      .from('deposit_requests')
      .update({
        status: 'rechazado',
        resolution_note: nota.trim(),
        resolved_by: profileId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', solicitud.id)
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Solicitud rechazada')
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Responder solicitud</DialogTitle>
          <DialogDescription>
            {solicitud.reason} · pidió {soles(Number(solicitud.amount))}
          </DialogDescription>
        </DialogHeader>

        <Field label="Monto depositado">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
        </Field>

        <Field label="Número de operación" hint="El que devuelve el banco al hacer el abono">
          <Input
            value={operacion}
            onChange={(e) => setOperacion(e.target.value)}
            placeholder="0012345678"
          />
        </Field>

        <Field label="Nota" hint="Obligatoria si rechazas la solicitud">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
        </Field>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" disabled={enviando} onClick={rechazar}>
            <X /> Rechazar
          </Button>
          <Button disabled={enviando} onClick={depositar}>
            <Check /> Registrar depósito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">{titulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  )
}
