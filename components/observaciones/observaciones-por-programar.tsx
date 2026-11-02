'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareWarning, CalendarPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, SheetContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/misc'
import { codigoDeLado } from '@/lib/lados'
import { fmtDate } from '@/lib/utils'
import { ProgramarObservacion } from './programar-observacion'

/**
 * Las observaciones de campo pendientes, a mano en la programación (Elvis,
 * 26/10): el supervisor las ve con todo lo registrado y las jala a la
 * semana que está armando.
 */
export function ObservacionesPorProgramar({ lunes }: { lunes: string }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [abierto, setAbierto] = React.useState(false)
  const [eligiendo, setEligiendo] = React.useState<any | null>(null)

  const pendientes = useQuery({
    queryKey: ['observaciones-campo', service.id, 'pendientes'],
    queryFn: async () => {
      const { data, error } = await sb.from('v_observaciones_campo').select('*')
        .eq('service_id', service.id).eq('estado', 'pendiente').limit(500)
      if (error) throw error
      // Por tramo y kilómetro, como se recorre la vía
      return ((data ?? []) as any[]).sort((a, b) =>
        (a.section_code ?? '~').localeCompare(b.section_code ?? '~') || (a.progresiva_m ?? 1e12) - (b.progresiva_m ?? 1e12))
    },
  })
  const n = pendientes.data?.length ?? 0
  // El día propuesto: el lunes de la semana que se ve, salvo que ya pasó
  const hoy = new Date().toISOString().slice(0, 10)
  const propuesto = lunes < hoy ? hoy : lunes

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <MessageSquareWarning className="size-4" />
        Observaciones de campo
        {n > 0 && <Badge className="bg-destructive/15 text-destructive ml-1 tabular-nums">{n}</Badge>}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full max-w-xl gap-0 overflow-y-auto p-0">
          <div className="border-b border-border p-5">
            <DialogTitle className="text-[16px]">Observaciones por programar</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Lo que registraron las cuadrillas en la vía. «Programar» crea la partida con su actividad, tramo, progresivas, lado, metrado y foto.
            </DialogDescription>
          </div>
          {!n ? (
            <EmptyState icon={MessageSquareWarning} title="Nada pendiente" description="Todas las observaciones están programadas o atendidas." className="py-14" />
          ) : (
            <ul className="divide-y divide-border">
              {pendientes.data!.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{o.descripcion}</span>
                    {(o.activity_name || o.activity_category) && (
                      <span className="text-primary block text-[11.5px]">{[o.activity_category, o.activity_code, o.activity_name].filter(Boolean).join(' · ')}</span>
                    )}
                    <span className="text-muted-foreground block text-[11.5px]">
                      {[o.sector_code ? `Sector ${o.sector_code}` : o.section_code,
                        o.progresiva_txt && `km ${o.progresiva_txt}${o.progresiva_fin_txt ? ' → ' + o.progresiva_fin_txt : ''}`,
                        o.side && `lado ${codigoDeLado(o.side)}`, o.metrado != null && `${o.metrado} ${o.unit_symbol ?? ''}`.trim(),
                        fmtDate(o.observado_on), o.crew_name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => setEligiendo(o)}><CalendarPlus className="size-3.5" />Programar</Button>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Dialog>
      {eligiendo && <ProgramarObservacion o={eligiendo} fecha={propuesto} onClose={() => setEligiendo(null)} />}
    </>
  )
}
