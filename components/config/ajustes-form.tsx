'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Wallet, BellRing, Save } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Los ajustes del contrato.
 *
 * Dos cosas que hasta ahora estaban en el código y había que publicar una
 * versión nueva de la app para cambiar: qué se imprime sobre la fotografía
 * y desde qué monto un gasto necesita comprobante.
 *
 * Lo que se configura del sello es lo que se **imprime**, no lo que se
 * registra: las coordenadas, la hora exacta y la huella SHA-256 se guardan
 * siempre. Si no, el sello dejaría de valer como sustento.
 */

const CAMPOS_DEL_SELLO = [
  { clave: 'fecha', label: 'Fecha', detalle: 'El día de la toma, en hora de Perú' },
  { clave: 'hora', label: 'Hora', detalle: 'La hora exacta, junto a la fecha' },
  { clave: 'geo', label: 'Coordenadas', detalle: 'Latitud, longitud y precisión del GPS' },
  { clave: 'tramo', label: 'Tramo', detalle: 'El nombre del tramo donde se tomó' },
  { clave: 'progresiva', label: 'Progresiva', detalle: 'El kilometraje, como 322+073' },
  { clave: 'actividad', label: 'Actividad', detalle: 'Qué trabajo documenta la foto' },
  { clave: 'pci', label: 'Código de PCI', detalle: 'Cuando la foto sustenta un levantamiento' },
  { clave: 'cuadrilla', label: 'Cuadrilla', detalle: 'Quién ejecutó el trabajo' },
  { clave: 'marca', label: 'Firma SERVICON', detalle: 'El sello de la empresa en la esquina' },
] as const

export function AjustesDelServicio() {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [borrador, setBorrador] = React.useState<any>(null)
  const [guardando, setGuardando] = React.useState(false)

  const ajustes = useQuery({
    queryKey: ['ajustes', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ajustes_del_servicio', { p_service_id: service.id })
      if (error) throw error
      return data as any
    },
  })

  // El borrador arranca de lo que hay y solo existe mientras se edita: así
  // el botón de guardar sabe si hay algo que guardar.
  const actual = borrador ?? ajustes.data
  const sucio = borrador != null

  const cambiar = (rama: string, clave: string, valor: any) =>
    setBorrador({
      ...(actual ?? {}),
      [rama]: { ...(actual?.[rama] ?? {}), [clave]: valor },
    })

  const guardar = async () => {
    if (!borrador) return
    setGuardando(true)
    const { error } = await sb
      .from('services')
      .update({ settings: borrador })
      .eq('id', service.id)
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Ajustes guardados', {
      description: 'Las cuadrillas los reciben al sincronizar.',
    })
    setBorrador(null)
    qc.invalidateQueries({ queryKey: ['ajustes', service.id] })
  }

  if (ajustes.isLoading) return <SkeletonList rows={6} />

  const sello = actual?.sello ?? {}
  const selloActivo = sello.activo !== false

  return (
    <div className="space-y-4">
      {/* ═══ El sello de la fotografía ══════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <Camera className="size-4" />
            Sello de la fotografía
          </CardTitle>
          <CardDescription className="text-[12px]">
            Qué se imprime encima de cada foto de campo. Las coordenadas, la hora
            exacta y la huella digital se guardan siempre, lleve sello o no.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="bg-secondary/50 flex items-center justify-between gap-4 rounded-lg px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">Imprimir el sello</span>
              <span className="text-muted-foreground block text-[11.5px]">
                Apagado, la foto se entrega limpia. Sigue llevando GPS y huella.
              </span>
            </span>
            <Switch
              checked={selloActivo}
              onCheckedChange={(v) => cambiar('sello', 'activo', v)}
              disabled={!can.manage}
            />
          </label>

          <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', !selloActivo && 'pointer-events-none opacity-45')}>
            {CAMPOS_DEL_SELLO.map((c) => (
              <label
                key={c.clave}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium">{c.label}</span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">{c.detalle}</span>
                </span>
                <Switch
                  checked={sello[c.clave] === true}
                  onCheckedChange={(v) => cambiar('sello', c.clave, v)}
                  disabled={!can.manage || !selloActivo}
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Umbrales de operación ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Wallet className="size-4" />
              Caja chica
            </CardTitle>
            <CardDescription className="text-[12px]">
              Desde qué monto el gasto exige comprobante.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide">
                Monto mínimo con comprobante (S/)
              </span>
              <Input
                type="number"
                min={0}
                step={1}
                value={actual?.caja?.monto_minimo_comprobante ?? 20}
                onChange={(e) => cambiar('caja', 'monto_minimo_comprobante', Number(e.target.value))}
                disabled={!can.manage}
                className="max-w-[180px]"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <BellRing className="size-4" />
              Plazos de aviso
            </CardTitle>
            <CardDescription className="text-[12px]">
              Con cuánta antelación avisar antes de que algo venza.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide">
                Documentos (días)
              </span>
              <Input
                type="number"
                min={1}
                value={actual?.alertas?.dias_aviso_vencimiento ?? 30}
                onChange={(e) => cambiar('alertas', 'dias_aviso_vencimiento', Number(e.target.value))}
                disabled={!can.manage}
              />
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide">
                PCI (días)
              </span>
              <Input
                type="number"
                min={1}
                value={actual?.alertas?.dias_aviso_pci ?? 7}
                onChange={(e) => cambiar('alertas', 'dias_aviso_pci', Number(e.target.value))}
                disabled={!can.manage}
              />
            </label>
          </CardContent>
        </Card>
      </div>

      {can.manage && (
        <div className="flex items-center justify-end gap-2">
          {sucio && (
            <Button variant="ghost" size="sm" onClick={() => setBorrador(null)}>
              Descartar
            </Button>
          )}
          <Button onClick={guardar} disabled={!sucio || guardando} loading={guardando}>
            <Save className="size-4" />
            Guardar ajustes
          </Button>
        </div>
      )}
    </div>
  )
}
