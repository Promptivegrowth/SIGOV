'use client'

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
import { PCI_ITEM_STATUS, PCI_ITEM_LEVANTADO } from '@/lib/constants'
import { fmtDate, fmtDateTime, fmtNumber, uuid } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import type { SealedPhoto } from '@/lib/camera'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

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
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!item) return
    setNotes(item.notes ?? '')
    setCrewId(item.assigned_crew_id ?? '')
    setObservacion('')
  }, [item])

  const historial = useQuery({
    queryKey: ['pci-item-eventos', item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from('pci_item_eventos')
        .select('id, de, a, nota, cuando, quien:profiles(full_name)')
        .eq('pci_item_id', item.id)
        .order('cuando', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  if (!item) return null

  const st = PCI_ITEM_STATUS[item.status as keyof typeof PCI_ITEM_STATUS] ?? PCI_ITEM_STATUS.pendiente
  const isClosed = PCI_ITEM_LEVANTADO.includes(item.status)
  const porValidar = ['levantado', 'subsanado'].includes(item.status)
  // Valida quien administra el contrato y COVINCA, que entra como visor
  const puedeValidar = can.manage || role === 'visor'

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
      conforme ? 'Ítem conforme' : 'Ítem observado: vuelve a la cuadrilla',
    )
  }

  const saveAssignment = async () => {
    setBusy(true)
    const { error } = await sb
      .from('pci_items')
      .update({ assigned_crew_id: crewId || null, notes: notes || null })
      .eq('id', item.id)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
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

            {['observado', 'subsanado'].includes(item.status) && item.observacion && (
              <div className="bg-destructive/8 border-destructive/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold">Observación de COVINCA</p>
                  <p className="text-muted-foreground text-[12px]">{item.observacion}</p>
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
                {item.requires_evidence && ' — para levantar hacen falta la del antes y la del después.'}
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

            {isClosed && (
              <div className="bg-success/8 border-success/25 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold">
                    {item.status === 'validado' ? 'Conforme'
                      : item.status === 'subsanado' ? 'Subsanado, pendiente de validación COVINCA'
                      : 'Levantado, pendiente de validación COVINCA'}
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    {item.closed_at ? `Levantado el ${fmtDate(item.closed_at)}` : ''}
                    {item.validated_at ? ` · Conforme el ${fmtDate(item.validated_at)}` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* La conformidad de COVINCA */}
            {puedeValidar && porValidar && (
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
                <ol className="mt-2 space-y-2">
                  {historial.data!.map((e: any) => (
                    <li key={e.id} className="text-[12px] leading-snug">
                      <span className="font-medium">
                        {(PCI_ITEM_STATUS as Record<string, { label: string }>)[e.a]?.label ?? e.a}
                      </span>
                      <span className="text-muted-foreground">
                        {' · '}{fmtDateTime(e.cuando)}{e.quien?.full_name ? ` · ${e.quien.full_name}` : ''}
                      </span>
                      {e.nota && <p className="text-muted-foreground">{e.nota}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 border-t border-border p-4">
            {can.write && item.status === 'pendiente' && (
              <Button variant="outline" className="flex-1" loading={busy} onClick={iniciar}>
                Marcar en ejecución
              </Button>
            )}
            {can.write && !isClosed && (
              <Button variant="accent" className="flex-1" loading={busy} onClick={levantar}>
                <CircleCheck className="size-4" />
                {item.status === 'observado' ? 'Dar por subsanado' : 'Levantar ítem'}
              </Button>
            )}
            {puedeValidar && porValidar && (
              <>
                <Button variant="outline" loading={busy} onClick={() => validar(false)}>
                  <CircleX className="size-4" />
                  Observar
                </Button>
                <Button variant="success" className="flex-1" loading={busy} onClick={() => validar(true)}>
                  <ShieldCheck className="size-4" />
                  Conforme
                </Button>
              </>
            )}
            {((!can.write && !(puedeValidar && porValidar)) || item.status === 'validado') && (
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
