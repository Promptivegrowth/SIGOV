'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CircleCheck, CircleX, Camera, MapPin, Calendar, Users, Ruler,
  ShieldCheck, Clock, TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, SheetContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EvidenceGrid } from '@/components/campo/evidence-grid'
import { SemaforoBadge, Progresiva } from '@/components/shared/misc'
import { CameraCapture } from '@/components/campo/camera-capture'
import { PCI_ITEM_STATUS } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, uuid, truncate } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import type { SealedPhoto } from '@/lib/camera'
import { toast } from 'sonner'

/**
 * Ficha de un ítem de PCI: revisar, adjuntar evidencia, levantar y validar.
 * Es donde se cierra el ciclo que exige OSITRAN: no se puede levantar un ítem
 * sin foto cuando la evidencia es obligatoria — lo impide la propia base.
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
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!item) return
    setNotes(item.notes ?? '')
    setCrewId(item.assigned_crew_id ?? '')
  }, [item])

  if (!item) return null

  const st = PCI_ITEM_STATUS[item.status as keyof typeof PCI_ITEM_STATUS]
  const isClosed = ['levantado', 'validado'].includes(item.status)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pci-items'] })
    qc.invalidateQueries({ queryKey: ['pci-semaforos'] })
    qc.invalidateQueries({ queryKey: ['evidences', item.id] })
  }

  const setStatus = async (status: string, extra: Record<string, any> = {}) => {
    setBusy(true)
    const { error } = await sb
      .from('pci_items')
      .update({ status: status as any, notes: notes || null, ...extra })
      .eq('id', item.id)
    setBusy(false)
    if (error) {
      toast.error(
        error.message.includes('sin evidencia')
          ? 'No se puede levantar este ítem sin evidencia fotográfica. Adjunta al menos una foto.'
          : error.message
      )
      return
    }
    toast.success(
      status === 'levantado' ? 'Ítem levantado'
      : status === 'validado' ? 'Ítem validado'
      : status === 'rechazado' ? 'Ítem rechazado'
      : 'Ítem actualizado'
    )
    refresh()
    onClose()
  }

  const saveAssignment = async () => {
    setBusy(true)
    const { error } = await sb
      .from('pci_items')
      .update({ assigned_crew_id: crewId || null, notes: notes || null })
      .eq('id', item.id)
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Ítem actualizado')
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
                { icon: Ruler, k: 'Actividad', v: item.activity_name ?? '—' },
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
                Toma la foto en campo o reutiliza una ya capturada desde la galería.
              </p>
              <EvidenceGrid
                pciItemId={item.id}
                count={item.evidence_count ?? 0}
                canAdd={can.write && !isClosed}
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
                <Field label="Notas" hint="Queda registrado junto al ítem">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="Observaciones del levantamiento, coordinaciones…" />
                </Field>
                <Button variant="outline" size="sm" onClick={saveAssignment} loading={busy}>
                  Guardar cambios
                </Button>
              </div>
            )}

            {item.status === 'rechazado' && item.reject_reason && (
              <div className="bg-destructive/8 border-destructive/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold">Rechazado por el supervisor</p>
                  <p className="text-muted-foreground text-[12px]">{item.reject_reason}</p>
                </div>
              </div>
            )}

            {isClosed && (
              <div className="bg-success/8 border-success/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold">
                    {item.status === 'validado' ? 'Levantamiento validado' : 'Levantado, pendiente de validación'}
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    {item.closed_at ? `Cerrado el ${fmtDate(item.closed_at)}` : ''}
                    {item.validated_at ? ` · Validado el ${fmtDate(item.validated_at)}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 border-t border-border p-4">
            {can.write && item.status === 'pendiente' && (
              <Button variant="outline" className="flex-1" loading={busy}
                onClick={() => setStatus('en_atencion')}>
                Marcar en atención
              </Button>
            )}
            {can.write && !isClosed && (
              <Button variant="accent" className="flex-1" loading={busy}
                onClick={() => setStatus('levantado', { closed_by: profile.id })}>
                <CircleCheck className="size-4" />
                Levantar ítem
              </Button>
            )}
            {can.manage && item.status === 'levantado' && (
              <>
                <Button variant="outline" loading={busy}
                  onClick={() => setStatus('rechazado', { reject_reason: notes || 'Evidencia insuficiente' })}>
                  <CircleX className="size-4" />
                  Rechazar
                </Button>
                <Button variant="success" className="flex-1" loading={busy}
                  onClick={() => setStatus('validado', { validated_by: profile.id, validated_at: new Date().toISOString() })}>
                  <ShieldCheck className="size-4" />
                  Validar
                </Button>
              </>
            )}
            {(!can.write || item.status === 'validado') && (
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
          const now = new Date()
          const path = `${service.id}/pci/${item.pci_id}/${clientId}.webp`

          await enqueueBlob({ client_id: clientId, bucket: 'evidencias', path, blob: photo.blob })
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
