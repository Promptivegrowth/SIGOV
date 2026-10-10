'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

export const TIPOS_DE_EQUIPO: Record<string, string> = {
  extintor: 'Extintor',
  botiquin: 'Botiquín',
  kit_antiderrame: 'Kit antiderrame',
  camilla: 'Camilla',
  lavaojos: 'Lavaojos',
  detector_gas: 'Detector de gas',
  otro: 'Otro equipo',
}

const ESTADOS: Record<string, string> = {
  operativo: 'Operativo',
  observado: 'Observado',
  fuera_servicio: 'Fuera de servicio',
}

const SIN_CUADRILLA = '__ninguna__'

/** Quién administra los equipos (OBS-63): lo mismo que exige la base. */
export function usePuedeAdministrarEquipos() {
  const { role } = useSession()
  return ['admin', 'supervisor', 'ing_seguridad'].includes(role)
}

/**
 * Alta y edición de un equipo de seguridad (OBS-63).
 *
 * El inventario, las fechas y las bajas son de SSOMA; el jefe de cuadrilla
 * solo ve y revisa los de su cuadrilla desde el celular.
 */
export function EquipoDialog({
  equipo,
  abierto,
  onClose,
  onHecho,
}: {
  /** null = equipo nuevo */
  equipo: any | null
  abierto: boolean
  onClose: () => void
  onHecho: () => void
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const nuevo = !equipo
  const [v, setV] = React.useState<Record<string, string>>({})
  const [enviando, setEnviando] = React.useState(false)
  const [confirmarBaja, setConfirmarBaja] = React.useState(false)

  const cuadrillas = useQuery({
    queryKey: ['cuadrillas-equipos', service.id],
    queryFn: async () => {
      const { data } = await sb.from('crews').select('id, code, name')
        .eq('service_id', service.id).is('deleted_at', null).order('code')
      return data ?? []
    },
    enabled: abierto,
  })

  React.useEffect(() => {
    if (!abierto) return
    setConfirmarBaja(false)
    setV({
      kind: equipo?.kind ?? 'extintor',
      code: equipo?.code ?? '',
      description: equipo?.description ?? '',
      brand: equipo?.brand ?? '',
      capacity: equipo?.capacity ?? '',
      serial_number: equipo?.serial_number ?? '',
      crew_id: equipo?.crew_id ?? SIN_CUADRILLA,
      location: equipo?.location ?? '',
      expires_on: equipo?.expires_on ?? '',
      next_check_on: equipo?.next_check_on ?? '',
      status: equipo?.status ?? 'operativo',
      notes: equipo?.notes ?? '',
    })
  }, [abierto, equipo?.id])

  if (!abierto) return null
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }))
  const fecha = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

  const guardar = async () => {
    if (!v.code.trim()) { toast.error('Escribe el código del equipo (EXT-001, BOT-002…)'); return }
    if (v.expires_on && !fecha(v.expires_on)) { toast.error('La fecha de vencimiento va como 2027-09-22'); return }
    setEnviando(true)
    const fila = {
      kind: v.kind as any,
      code: v.code.trim().toUpperCase(),
      description: v.description.trim() || null,
      brand: v.brand.trim() || null,
      capacity: v.capacity.trim() || null,
      serial_number: v.serial_number.trim() || null,
      crew_id: v.crew_id === SIN_CUADRILLA ? null : v.crew_id,
      location: v.location.trim() || null,
      expires_on: fecha(v.expires_on),
      next_check_on: fecha(v.next_check_on),
      status: v.status as any,
      notes: v.notes.trim() || null,
    }
    const { error } = nuevo
      ? await sb.from('safety_equipment').insert({ ...fila, service_id: service.id, created_by: profile.id })
      : await sb.from('safety_equipment').update({ ...fila, updated_at: new Date().toISOString() }).eq('id', equipo.id)
    setEnviando(false)
    if (error) {
      toast.error(error.code === '23505' ? 'Ya hay un equipo con ese código' : mensajeAmigable(error))
      return
    }
    toast.success(nuevo ? 'Equipo registrado' : 'Equipo actualizado')
    onHecho()
  }

  const darDeBaja = async () => {
    setEnviando(true)
    const { error } = await sb.from('safety_equipment')
      .update({ status: 'dado_de_baja', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', equipo.id)
    setEnviando(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(`${equipo.code} dado de baja`, { description: 'Sale del inventario y de las alertas; su historial se conserva.' })
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{nuevo ? 'Nuevo equipo de seguridad' : `Editar ${equipo.code}`}</DialogTitle>
          <DialogDescription>
            Extintores, botiquines y kits del contrato. El jefe de cuadrilla verá en su celular los de su cuadrilla.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={v.kind} onValueChange={(x) => setV((s) => ({ ...s, kind: x }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS_DE_EQUIPO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Código">
            <Input value={v.code} onChange={set('code')} placeholder="EXT-008" />
          </Field>
          <Field label="Capacidad o contenido">
            <Input value={v.capacity} onChange={set('capacity')} placeholder="PQS 6 kg" />
          </Field>
          <Field label="Marca">
            <Input value={v.brand} onChange={set('brand')} />
          </Field>
          <Field label="N.º de serie">
            <Input value={v.serial_number} onChange={set('serial_number')} />
          </Field>
          <Field label="Cuadrilla">
            <Select value={v.crew_id} onValueChange={(x) => setV((s) => ({ ...s, crew_id: x }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CUADRILLA}>Sin cuadrilla (almacén u oficina)</SelectItem>
                {(cuadrillas.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ubicación">
            <Input value={v.location} onChange={set('location')} placeholder="Camioneta V4A-712, almacén Tomasiri…" />
          </Field>
          <Field label="Estado">
            <Select value={v.status} onValueChange={(x) => setV((s) => ({ ...s, status: x }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADOS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vence" hint="Recarga o caducidad">
            <Input type="date" value={v.expires_on} onChange={set('expires_on')} />
          </Field>
          <Field label="Próxima inspección">
            <Input type="date" value={v.next_check_on} onChange={set('next_check_on')} />
          </Field>
        </div>
        <Field label="Descripción">
          <Input value={v.description} onChange={set('description')} />
        </Field>
        <Field label="Notas">
          <Textarea value={v.notes} onChange={set('notes')} rows={2} />
        </Field>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {!nuevo ? (
            confirmarBaja ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-destructive text-[13px]">¿Dar de baja {equipo.code}?</span>
                <Button size="sm" variant="destructive" disabled={enviando} onClick={darDeBaja}>Sí, dar de baja</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarBaja(false)}>No</Button>
              </div>
            ) : (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmarBaja(true)}>
                <Trash2 /> Dar de baja
              </Button>
            )
          ) : <span />}
          <Button disabled={enviando} onClick={guardar}>
            <Check /> {nuevo ? 'Registrar equipo' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Las inspecciones de un equipo, la más reciente primero. */
export function HistorialEquipoDialog({ equipo, onClose }: { equipo: any | null; onClose: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const revisiones = useQuery({
    queryKey: ['historial-equipo', equipo?.id],
    enabled: !!equipo,
    queryFn: async () => {
      const { data, error } = await sb.from('safety_equipment_checks')
        .select('id, checked_on, conforme, findings, created_at')
        .eq('equipment_id', equipo.id).is('deleted_at', null)
        .order('checked_on', { ascending: false }).order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })
  if (!equipo) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de {equipo.code}</DialogTitle>
          <DialogDescription>
            {[TIPOS_DE_EQUIPO[equipo.kind], equipo.capacity, equipo.crew_name].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>
        {revisiones.isLoading && <SkeletonList rows={3} />}
        {revisiones.data?.length === 0 && (
          <p className="text-muted-foreground text-[13px]">Todavía no tiene inspecciones registradas.</p>
        )}
        <ul className="divide-y divide-border">
          {revisiones.data?.map((r: any) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              {r.conforme
                ? <Check className="text-success mt-0.5 size-4 shrink-0" />
                : <X className="text-destructive mt-0.5 size-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{fmtDate(r.checked_on)}</p>
                {r.findings && <p className="text-muted-foreground text-[13px]">{r.findings}</p>}
              </div>
              <Badge variant={r.conforme ? 'success' : 'destructive'}>{r.conforme ? 'Conforme' : 'Observado'}</Badge>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
