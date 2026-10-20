'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/primitives'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Qué cuadrillas ven este PCI en su celular.
 *
 * Una cuadrilla puede tener dos, tres o cuatro PCI a la vez; el supervisor
 * decide cuáles trabaja (Elvis, video del 13/10). Al publicar, el PCI queda
 * activo para todas sus cuadrillas; apagarlo aquí lo saca del celular de esa
 * cuadrilla sin tocar sus ítems ni sus fotos, y encenderlo lo devuelve.
 */
export function CuadrillasDelPci({ pciId, items }: { pciId: string; items: any[] }) {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [cambiando, setCambiando] = React.useState<string | null>(null)

  const pausadas = useQuery({
    queryKey: ['pci-pausadas', pciId],
    queryFn: async () => {
      const { data, error } = await sb.from('pci_cuadrilla_pausada' as any).select('crew_id').eq('pci_id', pciId)
      if (error) throw error
      return new Set(((data ?? []) as any[]).map((r) => r.crew_id as string))
    },
  })

  // Las cuadrillas con ítems de este PCI, con cuántos tienen pendientes
  const cuadrillas = React.useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; color?: string; total: number; abiertos: number }>()
    for (const i of items) {
      if (!i.assigned_crew_id) continue
      const c = m.get(i.assigned_crew_id) ??
        { id: i.assigned_crew_id, nombre: i.crew_name ?? 'Cuadrilla', color: i.crew_color, total: 0, abiertos: 0 }
      c.total++
      if (['pendiente', 'en_atencion', 'observado'].includes(i.status)) c.abiertos++
      m.set(c.id, c)
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [items])

  if (!cuadrillas.length) return null

  const cambiar = async (crewId: string, activo: boolean) => {
    setCambiando(crewId)
    const { error } = activo
      ? await sb.from('pci_cuadrilla_pausada' as any).delete().eq('pci_id', pciId).eq('crew_id', crewId)
      : await sb.from('pci_cuadrilla_pausada' as any).insert({ pci_id: pciId, crew_id: crewId, service_id: service.id } as any)
    setCambiando(null)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(activo ? 'PCI activo para la cuadrilla' : 'PCI pausado para la cuadrilla', {
      description: activo ? 'Vuelve a verlo en su celular.' : 'Deja de verlo en su celular hasta que lo actives.',
    })
    qc.invalidateQueries({ queryKey: ['pci-pausadas', pciId] })
    qc.invalidateQueries({ queryKey: ['pci-items'] })
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Users className="text-muted-foreground size-4" />
          <h3 className="text-[13px] font-semibold">Visible para las cuadrillas</h3>
          <span className="text-muted-foreground text-[11.5px]">
            Apaga el PCI para la cuadrilla que no debe trabajarlo todavía.
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cuadrillas.map((c) => {
            const activo = !pausadas.data?.has(c.id)
            return (
              <label
                key={c.id}
                className="bg-card flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--primary)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{c.nombre}</span>
                  <span className="text-muted-foreground block text-[11px]">
                    {c.total} ítems · {c.abiertos} pendientes · {activo ? 'activo' : 'pausado'}
                  </span>
                </span>
                <Switch
                  checked={activo}
                  disabled={!can.manage || cambiando === c.id || pausadas.isLoading}
                  onCheckedChange={(v) => void cambiar(c.id, v)}
                  aria-label={`PCI activo para ${c.nombre}`}
                />
              </label>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
