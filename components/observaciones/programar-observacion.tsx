'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { codigoDeLado } from '@/lib/lados'
import { toISODate } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Jalar una observación de campo a la programación (Elvis, 26/10: «cuando
 * haga la programación ya van a aparecer las observaciones y uno simplemente
 * va a poder jalarlo»). La partida nace con la actividad, el tramo, las
 * progresivas, el lado, el metrado y la foto que registró la cuadrilla; solo
 * falta el día y quién la ejecuta.
 */
export function ProgramarObservacion({ o, fecha, onClose, onDone }: {
  o: any
  /** El día que se propone (el lunes de la semana que se está viendo, o hoy). */
  fecha?: string
  onClose: () => void
  onDone?: () => void
}) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [dia, setDia] = React.useState(fecha ?? toISODate(new Date()))
  const [crew, setCrew] = React.useState<string>(o.crew_id ?? '')
  const [categoria, setCategoria] = React.useState<string>(o.activity_category ?? '')
  const [actividad, setActividad] = React.useState<string>(o.activity_id ?? '')
  const [metrado, setMetrado] = React.useState<string>(o.metrado != null ? String(o.metrado) : '')
  const [guardando, setGuardando] = React.useState(false)

  const crews = useQuery({
    queryKey: ['crews', service.id],
    queryFn: async () => {
      const { data } = await sb.from('crews').select('id, code, name, color')
        .eq('service_id', service.id).is('deleted_at', null).order('code')
      return data ?? []
    },
  })
  // Las partidas COVINCA, por categoría y en el orden del listado
  const actividades = useQuery({
    queryKey: ['actividades-cov', service.id],
    queryFn: async () => {
      const { data } = await sb.from('activities_catalog').select('id, code, name, category, numero_covinca')
        .eq('service_id', service.id).is('deleted_at', null).eq('is_active', true).like('code', 'COV-%')
        .order('numero_covinca', { nullsFirst: false })
      return (data ?? []) as any[]
    },
  })
  const categorias = React.useMemo(() => [...new Set((actividades.data ?? []).map((a) => a.category).filter(Boolean))] as string[], [actividades.data])
  const delTipo = (actividades.data ?? []).filter((a) => a.category === categoria)

  const programar = async () => {
    if (!actividad) { toast.error('Elige el tipo de actividad'); return }
    if (!dia) { toast.error('Elige el día'); return }
    setGuardando(true)
    const { error } = await sb.rpc('programar_observacion', {
      p_id: o.id,
      p_fecha: dia,
      p_crew_id: crew || undefined,
      p_activity_id: actividad,
      p_metrado: metrado ? Number(metrado) : undefined,
    } as any)
    setGuardando(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Observación programada', { description: 'La partida ya está en la programación de esa semana.' })
    qc.invalidateQueries({ queryKey: ['observaciones-campo'] })
    qc.invalidateQueries({ queryKey: ['plan-items'] })
    qc.invalidateQueries({ queryKey: ['weekly-plan'] })
    onDone?.()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Programar observación</DialogTitle>
          <DialogDescription>
            {o.descripcion}
            <span className="mt-1 block text-[11.5px]">
              {[o.section_numero ? `Tramo ${o.section_numero}` : o.section_code, o.sector_code && `Sector ${o.sector_code}`,
                o.progresiva_txt && `km ${o.progresiva_txt}${o.progresiva_fin_txt ? ' → ' + o.progresiva_fin_txt : ''}`,
                o.side && `lado ${codigoDeLado(o.side)}`].filter(Boolean).join(' · ')}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-muted-foreground text-[11.5px] font-medium">Categoría</span>
            <Select value={categoria} onValueChange={(v) => { setCategoria(v); setActividad('') }}>
              <SelectTrigger><SelectValue placeholder="Berma, calzada…" /></SelectTrigger>
              <SelectContent>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground text-[11.5px] font-medium">Actividad</span>
            <Select value={actividad} onValueChange={setActividad} disabled={!categoria}>
              <SelectTrigger><SelectValue placeholder={categoria ? 'Elige la partida' : 'Primero la categoría'} /></SelectTrigger>
              <SelectContent>{delTipo.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground text-[11.5px] font-medium">Día</span>
            <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground text-[11.5px] font-medium">Cuadrilla</span>
            <Select value={crew} onValueChange={setCrew}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>{(crews.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-muted-foreground text-[11.5px] font-medium">Metrado a programar{o.unit_symbol ? ` (${o.unit_symbol})` : ''}</span>
            <Input type="number" min={0} step="any" value={metrado} onChange={(e) => setMetrado(e.target.value)} placeholder="0" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={programar} loading={guardando}><CalendarPlus className="size-4" />Programar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
