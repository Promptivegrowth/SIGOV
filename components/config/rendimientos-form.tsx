'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gauge, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/misc'
import { useInsumos, InsumoPicker, paraBuscar, leerCifra, cifra } from '@/app/(app)/materiales/comun'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Los rendimientos promedio (Elvis, P12): cuánto material lleva cada unidad
 * de una partida. Con ellos el F7 calcula la pre-cantidad a requerir
 * (metrado × rendimiento). Se editan aquí; si una partida no tiene, al
 * programar se escribe a mano.
 */
export function RendimientosForm({ serviceId, editable }: { serviceId: string; editable: boolean }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const insumos = useInsumos(serviceId)
  const [q, setQ] = React.useState('')
  const [partidaId, setPartidaId] = React.useState<string | null>(null)
  const [cantidades, setCantidades] = React.useState<Record<string, string>>({})

  const partidas = useQuery({
    queryKey: ['partidas-rendimiento', serviceId],
    queryFn: async () => {
      const { data, error } = await sb.from('activities_catalog')
        .select('id, code, name, units(symbol)')
        .eq('service_id', serviceId).is('deleted_at', null).eq('is_active', true).order('code')
      if (error) throw error
      return data ?? []
    },
  })

  const rendimientos = useQuery({
    queryKey: ['rendimientos', serviceId],
    queryFn: async () => {
      const { data, error } = await sb.from('rendimientos')
        .select('id, activity_id, supply_id, cantidad, supplies(code, codigo_covinca, name, units(symbol))')
        .eq('service_id', serviceId)
      if (error) throw error
      return data ?? []
    },
  })

  const cuantos = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rendimientos.data ?? []) m.set(r.activity_id, (m.get(r.activity_id) ?? 0) + 1)
    return m
  }, [rendimientos.data])

  const visibles = (partidas.data ?? []).filter((p: any) => !q || paraBuscar(`${p.code} ${p.name}`).includes(paraBuscar(q)))
  const partida = (partidas.data ?? []).find((p: any) => p.id === partidaId)
  const deLaPartida = (rendimientos.data ?? []).filter((r: any) => r.activity_id === partidaId)

  const refrescar = () => qc.invalidateQueries({ queryKey: ['rendimientos', serviceId] })

  const agregar = async (s: any) => {
    if (!partidaId) return
    const { error } = await sb.from('rendimientos').insert({ service_id: serviceId, activity_id: partidaId, supply_id: s.id, cantidad: 1 } as any)
    if (error) { toast.error(mensajeAmigable(error)); return }
    refrescar()
  }

  const guardar = async (r: any) => {
    const valor = leerCifra(cantidades[r.id] ?? '')
    if (!(valor > 0)) { toast.error('El rendimiento debe ser mayor que cero'); return }
    const { error } = await sb.from('rendimientos').update({ cantidad: valor, updated_at: new Date().toISOString() } as any).eq('id', r.id)
    if (error) { toast.error(mensajeAmigable(error)); return }
    setCantidades((c) => { const n = { ...c }; delete n[r.id]; return n })
    toast.success('Rendimiento guardado')
    refrescar()
  }

  const quitar = async (r: any) => {
    const { error } = await sb.from('rendimientos').delete().eq('id', r.id)
    if (error) { toast.error(mensajeAmigable(error)); return }
    refrescar()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[15px]"><Gauge className="size-4" />Partidas</CardTitle>
          <CardDescription className="text-[12px]">Elige una partida para ver o fijar sus rendimientos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o nombre…" className="pl-9" />
          </div>
          <div className="max-h-[480px] space-y-0.5 overflow-y-auto">
            {visibles.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setPartidaId(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
                  p.id === partidaId ? 'bg-primary/10 text-primary' : 'hover:bg-secondary',
                )}
              >
                <span className="w-24 shrink-0 font-mono text-[11px]">{p.code}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {cuantos.get(p.id) ? <span className="text-muted-foreground tabular-nums">{cuantos.get(p.id)}</span> : null}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px]">{partida ? `${partida.code} · ${partida.name}` : 'Rendimientos'}</CardTitle>
          <CardDescription className="text-[12px]">
            {partida
              ? `Cuánto de cada material lleva 1 ${partida.units?.symbol ?? 'unidad'} de esta partida. El F7 multiplica el metrado programado por este número.`
              : 'Rendimientos promedio con los que trabaja el aplicativo. Se pueden cambiar cuando haga falta.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!partida ? (
            <EmptyState icon={Gauge} title="Elige una partida" description="A la izquierda, las partidas del catálogo; el número es cuántos materiales tienen rendimiento." />
          ) : (
            <>
              {editable && (
                <InsumoPicker
                  insumos={insumos.data ?? []}
                  onElegir={agregar}
                  excluir={deLaPartida.map((r: any) => r.supply_id)}
                />
              )}
              {deLaPartida.length === 0 && (
                <p className="text-muted-foreground text-[12.5px]">Sin rendimientos: al programar esta partida, el material se escribe a mano.</p>
              )}
              {deLaPartida.map((r: any) => {
                const escrito = cantidades[r.id]
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{r.supplies?.name}</p>
                      <p className="text-muted-foreground text-[11.5px]">{r.supplies?.codigo_covinca ?? r.supplies?.code}</p>
                    </div>
                    <Input
                      value={escrito ?? cifra(Number(r.cantidad))}
                      onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
                      disabled={!editable}
                      inputMode="decimal"
                      className="h-8 w-24 text-right tabular-nums"
                      aria-label={`Rendimiento de ${r.supplies?.name}`}
                    />
                    <span className="text-muted-foreground w-28 text-[11.5px]">
                      {r.supplies?.units?.symbol ?? 'und'} / {partida.units?.symbol ?? 'und'}
                    </span>
                    {editable && escrito != null && (
                      <Button size="sm" onClick={() => guardar(r)}>Guardar</Button>
                    )}
                    {editable && (
                      <Button size="icon-sm" variant="ghost" onClick={() => quitar(r)} aria-label="Quitar"><Trash2 /></Button>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
