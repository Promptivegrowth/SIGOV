'use client'

import * as React from 'react'
import { CalendarClock, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePlazosPci, etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/** El registro + N días, en ISO (sin pasar por la zona horaria). */
function masDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  return new Date(d.getTime() + dias * 86400000).toISOString().slice(0, 10)
}

/**
 * Las fechas de vencimiento de cada plazo del PCI (Elvis, P2): «cuentan a
 * partir del día siguiente» al registro en SIGOV, y al registrar se puede
 * fijar la fecha de cada plazo para que el control se base en ella. Una
 * fecha que se deja como la calculada no se guarda: sigue al registro.
 */
export function VencimientosPorPlazo({
  pci,
  porPlazo,
  editable,
  onGuardado,
}: {
  pci: { id: string; registered_on: string; vencimientos: Record<string, string> | null }
  /** Cuántos ítems tiene cada plazo */
  porPlazo: Record<number, number>
  editable: boolean
  onGuardado: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const { plazos } = usePlazosPci()
  const calculada = (k: number) => masDias(pci.registered_on, k)
  const inicial = React.useCallback(
    () => Object.fromEntries(plazos.map((k) => [k, pci.vencimientos?.[String(k)] ?? calculada(k)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plazos.join(','), pci.registered_on, JSON.stringify(pci.vencimientos ?? {})],
  )
  const [fechas, setFechas] = React.useState<Record<number, string>>(inicial)
  const [guardando, setGuardando] = React.useState(false)
  React.useEffect(() => { setFechas(inicial()) }, [inicial])

  const cambiado = plazos.some((k) => (fechas[k] ?? '') !== (pci.vencimientos?.[String(k)] ?? calculada(k)))

  const guardar = async () => {
    // Solo se guarda la que difiere del cálculo
    const fijadas = Object.fromEntries(plazos.map((k) => [String(k), fechas[k] && fechas[k] !== calculada(k) ? fechas[k] : '']))
    setGuardando(true)
    const { data, error } = await sb.rpc('pci_fijar_vencimientos', { p_pci: pci.id, p_fechas: fijadas })
    setGuardando(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    const n = (data as any)?.items ?? 0
    toast.success('Vencimientos guardados', {
      description: n ? `${n} ítem${n === 1 ? '' : 's'} abiertos tomaron su nueva fecha.` : 'Ningún ítem abierto cambió de fecha.',
    })
    onGuardado()
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          <CalendarClock className="text-muted-foreground mt-0.5 size-4" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Vencimiento de cada plazo</p>
            <p className="text-muted-foreground text-[12px]">
              Registrado en SIGOV el {fmtDate(pci.registered_on)}: los plazos cuentan desde el día siguiente.
              {editable && ' Puedes fijar otra fecha para un plazo; el control se basa en ella.'}
            </p>
          </div>
          {editable && (
            <Button size="sm" disabled={!cambiado} loading={guardando} onClick={guardar}>
              Guardar fechas
            </Button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {plazos.map((k) => {
            const fijada = (fechas[k] ?? '') !== calculada(k)
            return (
              <label key={k} className={cn('rounded-lg border px-3 py-2', fijada ? 'border-primary/40 bg-primary/5' : 'border-border')}>
                <span className="flex items-center justify-between text-[11.5px] font-medium">
                  {etiquetaPlazo(k)}
                  <span className="text-muted-foreground tabular-nums">{porPlazo[k] ?? 0} ítems</span>
                </span>
                {editable ? (
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="date"
                      value={fechas[k] ?? ''}
                      min={masDias(pci.registered_on, 1)}
                      onChange={(e) => setFechas((f) => ({ ...f, [k]: e.target.value }))}
                      className="h-8 text-[12.5px]"
                    />
                    {fijada && (
                      <button
                        type="button"
                        title="Volver a la fecha calculada"
                        onClick={() => setFechas((f) => ({ ...f, [k]: calculada(k) }))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="mt-1 block text-[13px] font-semibold tabular-nums">{fmtDate(fechas[k])}</span>
                )}
                <span className="text-muted-foreground block text-[10.5px]">{fijada ? 'Fijada' : 'Calculada'}</span>
              </label>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
