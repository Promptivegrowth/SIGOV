'use client'

import { encolarOriginal } from '@/lib/offline/original'
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleCheck, CircleX, Camera, MapPin, Calendar, Users, Ruler,
  ShieldCheck, Clock, TriangleAlert, History,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, SheetContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EvidenceGrid } from '@/components/campo/evidence-grid'
import { SemaforoBadge } from '@/components/shared/misc'
import { CameraCapture } from '@/components/campo/camera-capture'
import { PCI_ITEM_LEVANTADO, estadoPci, observadoPor } from '@/lib/constants'
import { fmtDate, fmtDateTime, fmtNumber, uuid } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import type { SealedPhoto } from '@/lib/camera'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'
import { usePlazosPci, etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'
import { FotoReferencial } from '@/components/shared/foto-referencial'

type Funcion = 'pci_iniciar_atencion' | 'pci_levantar' | 'pci_validar'

/**
 * Ficha de un ítem de PCI: revisar, adjuntar evidencia, levantar y validar.
 *
 * Los cambios de estado pasan por las funciones de la base
 * (pci_iniciar_atencion, pci_levantar, pci_validar), no por un update
 * directo: ahí se exige la foto del antes y la del después, se decide si es
 * «levantado» o «subsanado», se avisa a quien corresponde y queda el
 * historial. COVINCA (rol visor) y el supervisor dan conformidad u observan,
 * y para observar el motivo es obligatorio.
 */
export function PciItemSheet({
  item,
  onClose,
  crews,
}: {
  item: any
  onClose: () => void
  crews: any[]
}) {
  const { service, profile, can, role } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [camera, setCamera] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [crewId, setCrewId] = React.useState('')
  const [observacion, setObservacion] = React.useState('')
  const [motivo, setMotivo] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!item) return
    setNotes(item.notes ?? '')
    setCrewId(item.assigned_crew_id ?? '')
    setObservacion('')
    setMotivo('')
  }, [item])

  // Todo lo que pasó con el ítem: importación, asignaciones, avances, fotos
  // y cada revisión con su entidad (CASO 45)
  const historial = useQuery({
    queryKey: ['pci-item-eventos', item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const { data, error } = await sb.rpc('pci_item_historial', { p_item: item.id })
      if (error) throw error
      return ((data as any[]) ?? []).slice().reverse()
    },
  })

  // Antes del retorno temprano: los hooks no pueden depender de que haya ítem
  const { plazos } = usePlazosPci()

  if (!item) return null

  const st = estadoPci(item)
  const isClosed = PCI_ITEM_LEVANTADO.includes(item.status)
  const porValidar = ['levantado', 'subsanado'].includes(item.status)
  // Dos revisiones: SERVICON (supervisor de la cuadrilla, residente o
  // administrador) valida internamente; COVINCA da la conformidad, y puede
  // observar aun después de la validación interna (CASO 39)
  const esCovinca = role === 'visor'
  const puedeValidar = (esCovinca || can.manage) && porValidar
  const yaValidoServicon = !!item.validado_servicon_at
  // Ejecuta solo el jefe de la cuadrilla (matriz); fotos también el supervisor
  const esJefe = role === 'jefe_cuadrilla'
  const puedeFotos = ['jefe_cuadrilla', 'admin', 'supervisor', 'residente'].includes(role)
  const cambiaCuadrilla = (crewId || null) !== (item.assigned_crew_id ?? null)
  const pideMotivo = cambiaCuadrilla && !!item.assigned_crew_id

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pci-items'] })
    qc.invalidateQueries({ queryKey: ['pci-semaforos'] })
    qc.invalidateQueries({ queryKey: ['evidences', item.id] })
    qc.invalidateQueries({ queryKey: ['pci-item-eventos', item.id] })
  }

  const llamar = async (fn: Funcion, args: Record<string, unknown>, exito: string, cerrar = true) => {
    setBusy(true)
    const { error } = await sb.rpc(fn, args as any)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(exito)
    refresh()
    if (cerrar) onClose()
  }

  const iniciar = () =>
    llamar('pci_iniciar_atencion', { p_item: item.id }, 'Ítem en ejecución', false)

  const levantar = () =>
    llamar(
      'pci_levantar',
      { p_item: item.id, p_nota: notes.trim() || null },
      item.status === 'observado'
        ? 'Ítem subsanado: vuelve a revisión de COVINCA'
        : 'Ítem levantado: pendiente de validación COVINCA',
    )

  const validar = (conforme: boolean) => {
    if (!conforme && !observacion.trim()) {
      toast.error('Escribe la observación: la cuadrilla necesita saber qué corregir.')
      return
    }
    void llamar(
      'pci_validar',
      { p_item: item.id, p_conforme: conforme, p_nota: observacion.trim() || null },
      !conforme ? 'Ítem observado: vuelve a la cuadrilla'
        : esCovinca ? 'Conforme COVINCA' : 'Validado por SERVICON: pasa a la revisión de COVINCA',
    )
  }

  const fijarPlazo = async (plazo: string) => {
    setBusy(true)
    const { error } = await sb.rpc('pci_fijar_plazo' as any, { p_items: [item.id], p_plazo: Number(plazo) } as any)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(`Plazo de ${etiquetaPlazo(Number(plazo))}`, { description: 'El vencimiento se recalculó desde la recepción del PCI.' })
    refresh()
    onClose()
  }

  const saveAssignment = async () => {
    if (pideMotivo && !motivo.trim()) {
      toast.error('Escribe el motivo de la reasignación: queda en el historial.')
      return
    }
    setBusy(true)
    // El cambio de cuadrilla pasa por la base: deja cuadrilla anterior, nueva,
    // quién, cuándo y motivo, y avisa a la cuadrilla nueva (CASO 36)
    if (cambiaCuadrilla && crewId) {
      const r = await sb.rpc('reasignar_cuadrilla', {
        p_tipo: 'pci', p_ids: [item.id], p_crew: crewId, p_motivo: motivo.trim() || undefined,
      })
      if (r.error) { setBusy(false); toast.error(mensajeAmigable(r.error)); return }
    }
    const { error } = await sb.from('pci_items').update({ notes: notes || null }).eq('id', item.id)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(cambiaCuadrilla ? 'Ítem reasignado' : 'Ítem actualizado')
    setMotivo('')
    refresh()
  }

  return (
    <>
      <Dialog open={!!item} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full max-w-lg gap-0 p-0">
          {/* Cabecera */}
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">{item.pci_code}</Badge>
              <Badge className={st.className}>{st.label}</Badge>
              <SemaforoBadge value={item.semaforo} days={item.days_left} />
            </div>
            <h2 className="mt-2.5 text-[15px] font-semibold leading-snug">
              Ítem {item.item_number}
              {item.activity_code && <span className="text-muted-foreground font-normal"> · {item.activity_code}</span>}
            </h2>
            <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
              {item.description}
            </p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Datos */}
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-[12.5px]">
              {[
                { icon: MapPin, k: 'Tramo', v: item.section_name ?? '—' },
                { icon: Ruler, k: 'Progresiva', v: item.prog_start_txt ?? '—' },
                { icon: Calendar, k: 'Vence', v: fmtDate(item.due_date) },
                { icon: Clock, k: 'Plazo', v: `${item.term_days} días` },
                { icon: Users, k: 'Cuadrilla', v: item.crew_name ?? 'Sin asignar' },
                // El ENCARGADO del control del PCI y quién lo registró desde el
                // celular: jefe o subjefe con la misma cuenta (Elvis, 12/11)
                ...(item.encargado ? [{ icon: Users, k: 'Encargado (control PCI)', v: item.encargado }] : []),
                ...(item.ejecutado_por ? [{ icon: Users, k: 'Ejecutó', v: item.ejecutado_por }] : []),
                { icon: Ruler, k: 'Actividad', v: item.activity_name ?? '—' },
                {
                  icon: Ruler, k: 'Metrado',
                  v: `${fmtNumber(item.metrado_registrado ?? 0)}${item.quantity ? ' de ' + fmtNumber(item.quantity) : ''} ${item.unit_symbol ?? ''}`,
                },
              ].map((r) => (
                <div key={r.k} className="flex items-start gap-2">
                  <r.icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <dt className="text-muted-foreground text-[11px]">{r.k}</dt>
                    <dd className="truncate font-medium">{r.v}</dd>
                  </div>
                </div>
              ))}
            </dl>

            {/* Dónde queda: la cargan el supervisor o el visor COVINCA */}
            <FotoReferencial
              tabla="pci_items"
              id={item.id}
              ruta={item.foto_referencia_path}
              puedeEditar={can.manage || role === 'visor'}
            />

            {['observado', 'subsanado'].includes(item.status) && item.observacion && (
              <div className="bg-destructive/8 border-destructive/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
                <div>
                  {/* CASO 40: de dónde viene la observación */}
                  <p className="text-[12.5px] font-semibold">
                    Observado por: {observadoPor(item.observado_entidad)}
                    {item.status === 'subsanado' && ' · subsanado, por validar'}
                  </p>
                  <p className="text-muted-foreground text-[11.5px]">
                    {[item.observado_por_nombre, item.observado_at && fmtDateTime(item.observado_at)].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-[12px]">{item.observacion}</p>
                </div>
              </div>
            )}

            {/* Evidencia */}
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Camera className="size-4" />
                Evidencia del levantamiento
                {item.requires_evidence && (
                  <Badge variant="warning" className="text-[10px]">obligatoria</Badge>
                )}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11.5px]">
                Antes {item.fotos_antes ?? 0} · durante {item.fotos_durante ?? 0} · después {item.fotos_despues ?? 0}
                {item.requires_evidence && ' — con las tres el ítem pasa solo a «Por validar»: lo valida SERVICON y da la conformidad COVINCA.'}
              </p>
              <EvidenceGrid
                pciItemId={item.id}
                count={item.evidence_count ?? 0}
                // Hasta que COVINCA valida se pueden agregar o cambiar fotos (REV3-OBS-04)
                canAdd={puedeFotos && item.status !== 'validado'}
                onAdd={() => setCamera(true)}
                label={`el ítem ${item.item_number} del ${item.pci_code}`}
                context={{
                  actividad: item.pci_code + ' · ítem ' + item.item_number,
                  tramo: item.section_name,
                  progresivaM: item.prog_start_m,
                  sectionId: item.section_id,
                  cuadrilla: item.crew_name,
                }}
              />
            </div>

            {/* Asignación */}
            {can.manage && !isClosed && (
              <div className="space-y-3">
                <Field label="Cuadrilla responsable">
                  <Select value={crewId} onValueChange={setCrewId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      {crews.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: c.color }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Plazo" hint="Uno de los plazos del contrato; el vencimiento se recalcula">
                  <Select value={String(item.term_days)} onValueChange={fijarPlazo}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(plazos.includes(Number(item.term_days)) ? plazos : [Number(item.term_days), ...plazos]).map((d) => (
                        <SelectItem key={d} value={String(d)}>{etiquetaPlazo(d)}{!plazos.includes(d) ? ' (fuera de la lista)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {pideMotivo && (
                  <Field label="Motivo de la reasignación" hint="Obligatorio: queda en el historial con la cuadrilla anterior y la nueva">
                    <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                      placeholder="Por qué pasa a otra cuadrilla…" />
                  </Field>
                )}
                <Field label="Notas" hint="Queda registrado junto al ítem">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Observaciones del levantamiento, coordinaciones…" />
                </Field>
                <Button variant="outline" size="sm" onClick={saveAssignment} loading={busy}>
                  Guardar cambios
                </Button>
              </div>
            )}

            {isClosed && (
              <div className="bg-success/8 border-success/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold">
                    {item.status === 'validado' ? 'Conforme COVINCA'
                      : yaValidoServicon ? 'Validado SERVICON, pendiente de la conformidad COVINCA'
                      : item.status === 'subsanado' ? 'Subsanado, pendiente de validación'
                      : 'Culminado por la cuadrilla, pendiente de validación'}
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    {item.closed_at ? `Culminado el ${fmtDate(item.closed_at)}` : ''}
                    {yaValidoServicon ? ` · Validado SERVICON el ${fmtDate(item.validado_servicon_at)}${item.validado_servicon_por ? ' por ' + item.validado_servicon_por : ''}` : ''}
                    {item.validated_at ? ` · Conforme COVINCA el ${fmtDate(item.validated_at)}${item.conforme_por ? ' por ' + item.conforme_por : ''}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* La revisión: SERVICON valida, COVINCA da la conformidad */}
            {puedeValidar && (
              <Field label="Observación para la cuadrilla" hint="Obligatoria si se observa el ítem">
                <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2}
                  placeholder="Qué falta o qué hay que corregir…" />
              </Field>
            )}

            {/* Historial: quién lo movió y cuándo */}
            {(historial.data?.length ?? 0) > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                  <History className="size-4" />
                  Historial
                </h3>
                <ol className="mt-2 space-y-2 border-l border-border pl-3">
                  {historial.data!.map((e: any, i: number) => (
                    <li key={i} className="text-[12px] leading-snug">
                      <span className="font-medium">{e.detalle}</span>
                      <span className="text-muted-foreground">
                        {' · '}{fmtDateTime(e.cuando)}{e.quien ? ` · ${e.quien}` : ''}
                        {e.entidad ? ` (${e.entidad})` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 border-t border-border p-4">
            {esJefe && item.status === 'pendiente' && (
              <Button variant="outline" className="flex-1" loading={busy} onClick={iniciar}>
                Marcar en ejecución
              </Button>
            )}
            {esJefe && !isClosed && (
              <Button variant="accent" className="flex-1" loading={busy} onClick={levantar}>
                <CircleCheck className="size-4" />
                {item.status === 'observado' ? 'Dar por subsanado' : 'Levantar ítem'}
              </Button>
            )}
            {puedeValidar && (
              <>
                <Button variant="outline" loading={busy} onClick={() => validar(false)}>
                  <CircleX className="size-4" />
                  Observar
                </Button>
                {(esCovinca || !yaValidoServicon) && (
                  <Button variant="success" className="flex-1" loading={busy} onClick={() => validar(true)}>
                    <ShieldCheck className="size-4" />
                    {esCovinca ? 'Conforme COVINCA' : 'Validar (SERVICON)'}
                  </Button>
                )}
              </>
            )}
            {((!esJefe && !puedeValidar) || item.status === 'validado') && (
              <Button variant="ghost" className="flex-1" onClick={onClose}>Cerrar</Button>
            )}
          </div>
        </SheetContent>
      </Dialog>

      {/* Cámara para la evidencia del ítem */}
      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        context={{
          servicio: service.name,
          cuadrilla: item.crew_name,
          actividad: `${item.pci_code} · ítem ${item.item_number}`,
          tramo: item.section_name,
          progresivaM: item.prog_start_m,
          usuario: profile.full_name,
        }}
        onCaptured={async (photo: SealedPhoto, phase) => {
          const clientId = uuid()
          const path = `${service.id}/pci/${item.pci_id}/${clientId}.webp`

          await enqueueBlob({ client_id: clientId, bucket: 'evidencias', path, blob: photo.blob })
          const original = await encolarOriginal(photo, service.id, clientId)
          await enqueue({
            client_id: clientId,
            table: 'evidences',
            payload: {
              service_id: service.id,
              pci_item_id: item.id,
              phase,
              storage_path: path,
              mime_type: 'image/webp',
              size_bytes: photo.blob.size,
              width: photo.width,
              height: photo.height,
              lat: photo.gps.lat,
              lng: photo.gps.lng,
              accuracy_m: photo.gps.accuracy,
              altitude_m: photo.gps.altitude,
              section_id: item.section_id,
              progresiva_m: item.prog_start_m,
              taken_at: photo.takenAt.toISOString(),
              sha256: photo.sha256,
              ...original,
              watermarked: true,
              device_id: await getDeviceId(),
              device_model: navigator.userAgent.slice(0, 90),
              created_by: profile.id,
            },
            service_id: service.id,
            label: `Evidencia PCI ${item.pci_code} · ítem ${item.item_number}`,
          })

          toast.success('Evidencia guardada', {
            description: navigator.onLine ? 'Sincronizando…' : 'Se enviará al recuperar señal',
          })
          void syncNow().then(refresh)
          setCamera(false)
        }}
      />
    </>
  )
}
