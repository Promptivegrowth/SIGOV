'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  Zap, ArrowRight, CalendarX2, CalendarPlus, TriangleAlert,
  RotateCcw, CircleCheck, Info,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { fmtDate, cn, truncate } from '@/lib/utils'
import { PCI_PRIORITY } from '@/lib/constants'
import { toast } from 'sonner'

/**
 * MOTOR DE REPROGRAMACIÓN POR PCI PRIORITARIO
 *
 * Requisito crítico de la propuesta. El flujo es:
 *   simular (dry-run) → mostrar el diff antes/después → aplicar en transacción.
 * Nada se toca hasta que el supervisor ve exactamente qué va a cambiar.
 */
export function SuspensionDialog({
  open,
  onOpenChange,
  pci,
  onApplied,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  pci: any
  onApplied?: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [applying, setApplying] = React.useState(false)
  const [result, setResult] = React.useState<any>(null)

  const preview = useQuery({
    queryKey: ['pci-suspension-preview', pci.id, open],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.rpc('preview_pci_suspension', { p_pci_id: pci.id })
      if (error) throw error
      return data as any
    },
  })

  const applied = !!pci.suspension_applied_at

  const apply = async () => {
    setApplying(true)
    const { data, error } = await sb.rpc('apply_pci_suspension', { p_pci_id: pci.id })
    setApplying(false)
    if (error) {
      toast.error(error.message)
      return
    }
    const r = data as any
    if (!r?.applied) {
      toast.warning(r?.reason ?? 'No se aplicó la reprogramación')
      return
    }
    setResult(r)
    toast.success(
      `Programación reordenada: ${r.items_suspended} ítems suspendidos, ${r.items_created} creados para atender el PCI`
    )
    onApplied?.()
  }

  const revert = async () => {
    const { data: susp } = await sb
      .from('plan_suspensions')
      .select('id')
      .eq('pci_id', pci.id)
      .is('reverted_at', null)
      .limit(1)
      .single()
    if (!susp) return toast.error('No hay una suspensión activa para revertir')

    const { data, error } = await sb.rpc('revert_pci_suspension', { p_suspension_id: susp.id })
    if (error) return toast.error(error.message)
    toast.success(`Reprogramación revertida (${(data as any)?.restored ?? 0} ítems restaurados)`)
    setResult(null)
    onApplied?.()
    onOpenChange(false)
  }

  const pv = preview.data
  const toSuspend = pv?.to_suspend ?? []
  const toCreate = pv?.to_create ?? []
  const prio = PCI_PRIORITY[pci.priority as keyof typeof PCI_PRIORITY]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-destructive/12 text-destructive flex size-9 items-center justify-center rounded-lg">
              <Zap className="size-4.5" />
            </span>
            Reprogramación automática por PCI prioritario
          </DialogTitle>
          <DialogDescription>
            {pci.code} · <Badge className={cn('ml-1', prio.className)}>{prio.label}</Badge>
            <span className="mt-1.5 block">
              El sistema detecta los ítems de la programación semanal que colisionan con este PCI
              (mismo tramo y solapamiento de progresivas), los suspende y los reordena, y crea los
              ítems necesarios para atenderlo con prioridad máxima.
            </span>
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="space-y-2 py-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : !pv?.ok ? (
          <div className="bg-muted/60 flex items-start gap-3 rounded-xl p-4">
            <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <p className="text-[13px]">{pv?.reason ?? 'No se pudo simular la reprogramación.'}</p>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto">
            {/* Contexto del plan afectado */}
            <div className="bg-muted/50 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-4 py-3 text-[12.5px]">
              <span>
                <span className="text-muted-foreground">Semana afectada: </span>
                <strong>N.º {pv.plan.week}</strong>
              </span>
              <span>
                <span className="text-muted-foreground">Del </span>
                <strong>{fmtDate(pv.plan.starts_on)}</strong>
                <span className="text-muted-foreground"> al </span>
                <strong>{fmtDate(pv.plan.ends_on)}</strong>
              </span>
              {applied && (
                <Badge variant="outline" className="border-destructive/40 text-destructive ml-auto gap-1">
                  <CircleCheck className="size-2.5" />
                  Ya aplicada
                </Badge>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── Se suspende ─────────────────────────────────────── */}
              <section>
                <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <CalendarX2 className="text-destructive size-4" />
                  Se suspende y reprograma
                  <Badge variant="destructive">{toSuspend.length}</Badge>
                </h4>
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {!toSuspend.length ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px]">
                      Ningún ítem de la programación colisiona con este PCI.
                    </p>
                  ) : (
                    toSuspend.map((it: any, i: number) => (
                      <motion.div
                        key={it.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="bg-card rounded-lg border border-border px-3 py-2"
                      >
                        <p className="truncate text-[12.5px] font-medium">{it.actividad}</p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {it.tramo} · {it.progresiva}
                          {it.cuadrilla ? ` · ${it.cuadrilla}` : ''}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground line-through">{fmtDate(it.fecha_actual)}</span>
                          <ArrowRight className="text-muted-foreground size-3" />
                          <span className="text-warning font-semibold">{fmtDate(it.fecha_propuesta)}</span>
                        </p>
                      </motion.div>
                    ))
                  )}
                </div>
              </section>

              {/* ── Se crea ─────────────────────────────────────────── */}
              <section>
                <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <CalendarPlus className="text-success size-4" />
                  Se agrega para atender el PCI
                  <Badge variant="success">{Math.min(toCreate.length, 60)}</Badge>
                </h4>
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {!toCreate.length ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px]">
                      No hay ítems del PCI listos para programar (requieren tramo y actividad).
                    </p>
                  ) : (
                    toCreate.slice(0, 60).map((it: any, i: number) => (
                      <motion.div
                        key={it.item_number}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="bg-success/5 border-success/20 rounded-lg border px-3 py-2"
                      >
                        <p className="truncate text-[12.5px] font-medium">
                          Ítem {it.item_number} · {truncate(it.descripcion, 60)}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">{it.tramo}</p>
                        <p className="mt-1 flex items-center gap-2 text-[11px]">
                          <span className="text-success font-semibold">
                            Programar {fmtDate(it.fecha_propuesta)}
                          </span>
                          <span className="text-muted-foreground">vence {fmtDate(it.vence)}</span>
                        </p>
                      </motion.div>
                    ))
                  )}
                  {toCreate.length > 60 && (
                    <p className="text-muted-foreground px-3 py-2 text-center text-[11px]">
                      + {toCreate.length - 60} ítems más se programarán en las semanas siguientes
                    </p>
                  )}
                </div>
              </section>
            </div>

            {result && (
              <div className="bg-success/8 border-success/25 flex items-start gap-3 rounded-xl border px-4 py-3">
                <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
                <p className="text-[12.5px]">
                  Aplicado: <strong>{result.items_suspended}</strong> ítems suspendidos y reprogramados,{' '}
                  <strong>{result.items_created}</strong> creados con prioridad 1. Se notificó por push
                  a las cuadrillas afectadas.
                </p>
              </div>
            )}

            {!applied && (
              <div className="bg-warning/8 border-warning/25 flex items-start gap-3 rounded-xl border px-4 py-3">
                <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
                <p className="text-[12.5px] leading-snug">
                  La operación se aplica en una sola transacción y queda registrada en el historial de
                  suspensiones. Es reversible desde esta misma pantalla.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {applied ? (
            <Button variant="outline" onClick={revert}>
              <RotateCcw className="size-4" />
              Revertir reprogramación
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={apply}
              loading={applying}
              disabled={!pv?.ok || (!toSuspend.length && !toCreate.length)}
            >
              <Zap className="size-4" />
              Aplicar reprogramación
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
