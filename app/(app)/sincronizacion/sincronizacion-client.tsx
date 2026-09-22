'use client'

import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, CloudUpload, CloudCheck, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/misc'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { useSession } from '@/lib/hooks/use-session'
import { fmtRelative, fmtNumber, cn } from '@/lib/utils'

/**
 * Sincronización (apartado 4.12).
 *
 * Lo que se registró en este navegador y todavía no salió de él. Mientras
 * haya algo en esta lista, ese trabajo solo existe aquí: si se borran los
 * datos del sitio, se pierde.
 *
 * Se lee de IndexedDB y no de la nube, por lo mismo: preguntarle al
 * servidor por lo que no ha llegado no tiene sentido.
 */

/** El nombre de la tabla, dicho como se dice en obra. */
const EN_CASTELLANO: Record<string, string> = {
  work_orders: 'Parte diario',
  work_entries: 'Actividad ejecutada',
  evidences: 'Fotografía',
  cash_movements: 'Gasto de caja',
  deposit_requests: 'Pedido de depósito',
  supply_requests: 'Pedido de materiales',
  supply_request_items: 'Ítem del pedido',
  safety_talks: 'Charla de seguridad',
  talk_attendance: 'Firma de asistencia',
  hygiene_checks: 'Control de higiene',
  safety_equipment_checks: 'Revisión de equipo',
  vehicle_checks: 'Revisión de vehículo',
  checklist_responses: 'Checklist',
  ats_iperc: 'ATS / IPERC',
  ats_signatures: 'Firma del ATS',
  pci_items: 'Ítem de PCI',
  plan_items: 'Partida programada',
}

export function SincronizacionClient() {
  const { service, crew, role } = useSession()
  const [sincronizando, setSincronizando] = React.useState(false)

  const pendientes = useLiveQuery(
    () => db.outbox.where('status').anyOf('pendiente', 'error').toArray(),
    [], []
  )
  const enviados = useLiveQuery(
    () => db.outbox.where('status').equals('sincronizado').reverse().sortBy('synced_at')
      .then((f) => f.slice(0, 1)),
    [], []
  )

  const conError = (pendientes ?? []).filter((p: any) => p.status === 'error')
  const ultimo = enviados?.[0]

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const r = await syncNow({ serviceId: service.id, crewId: crew?.id ?? null, role })
      toast.success('Sincronización terminada', {
        description: r.pushed > 0
          ? `${r.pushed} ${r.pushed === 1 ? 'registro enviado' : 'registros enviados'}` +
            (r.failed > 0 ? `, ${r.failed} con error.` : '.')
          : 'No quedó nada por enviar.',
      })
    } catch (e: any) {
      toast.error('No se pudo sincronizar', { description: e?.message })
    } finally {
      setSincronizando(false)
    }
  }

  const total = pendientes?.length ?? 0
  const todoArriba = total === 0

  return (
    <>
      <PageHeader
        icon={RefreshCw}
        title="Sincronización"
        description="Lo que registraste en este equipo y todavía no sale de él."
        actions={
          <Button onClick={sincronizar} disabled={sincronizando} loading={sincronizando}>
            <RefreshCw className="size-4" />
            Sincronizar ahora
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {/* ═══ El estado, de un vistazo ═════════════════════════════════ */}
        <div className={cn(
          'flex items-center gap-4 rounded-xl border px-5 py-4',
          conError.length ? 'bg-warning/10 border-warning/30'
            : todoArriba ? 'bg-success/8 border-success/25'
            : 'bg-info/8 border-info/25'
        )}>
          {todoArriba
            ? <CloudCheck className="text-success size-7 shrink-0" />
            : <CloudUpload className={cn('size-7 shrink-0', conError.length ? 'text-warning' : 'text-info')} />}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">
              {todoArriba ? 'Todo sincronizado'
                : `${fmtNumber(total)} ${total === 1 ? 'registro por enviar' : 'registros por enviar'}`}
            </p>
            <p className="text-muted-foreground text-[12px]">
              {ultimo
                ? `Último envío ${fmtRelative(new Date(ultimo.synced_at ?? ultimo.created_at))}.`
                : 'Todavía no se ha enviado nada desde este equipo.'}
              {conError.length > 0 && ` ${conError.length} con error, se reintentan solos.`}
            </p>
          </div>
        </div>

        {/* ═══ Lo que espera ════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">Esperando para subir</CardTitle>
            <CardDescription className="text-[12px]">
              Mientras estén aquí, este trabajo solo existe en este navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {todoArriba ? (
              <EmptyState
                icon={CloudCheck}
                title="No queda nada por enviar"
                description="Todo lo que registraste ya está en la nube."
                className="py-12"
              />
            ) : (
              <ul className="space-y-0.5">
                {(pendientes ?? []).map((p: any) => {
                  const fallo = p.status === 'error'
                  return (
                    <li key={p.client_id} className="hover:bg-secondary/50 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full',
                        fallo ? 'bg-warning' : 'bg-info')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {p.label || EN_CASTELLANO[p.table] || p.table}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
                          <Clock className="size-2.5" />
                          {EN_CASTELLANO[p.table] ?? p.table} · registrado {fmtRelative(new Date(p.created_at))}
                        </span>
                        {fallo && p.last_error && (
                          <span className="text-muted-foreground mt-0.5 block truncate text-[10.5px]">
                            {p.last_error}
                          </span>
                        )}
                      </span>
                      {fallo && (
                        <Badge variant="outline" className="border-warning/40 text-warning shrink-0">
                          {p.attempts > 1 ? `${p.attempts} intentos` : 'Reintentando'}
                        </Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
