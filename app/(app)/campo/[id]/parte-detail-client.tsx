'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowLeft, Plus, Camera, Send, CircleCheck, CircleX, MapPin,
  Trash2, Clock, CloudUpload, TriangleAlert, ChevronDown, Ruler,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState, Progresiva } from '@/components/shared/misc'
import { CameraCapture } from '@/components/campo/camera-capture'
import { EvidenceGrid } from '@/components/campo/evidence-grid'
import { WORK_ORDER_STATUS, EVIDENCE_PHASE } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, fmtProgresiva, parseProgresiva, uuid, fmtRelative } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { getGpsFix, haptic, type SealedPhoto } from '@/lib/camera'
import { toast } from 'sonner'

export function ParteDetailClient({ orderId }: { orderId: string }) {
  const { service, profile, can, role } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [entryOpen, setEntryOpen] = React.useState(false)
  const [cameraFor, setCameraFor] = React.useState<any>(null)
  const [reviewOpen, setReviewOpen] = React.useState(false)

  const order = useQuery({
    queryKey: ['work-order', orderId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('work_orders')
        .select('*, crews(id, name, color, code)')
        .eq('id', orderId)
        .single()
      if (error) throw error
      return data
    },
  })

  const entries = useQuery({
    queryKey: ['work-entries', orderId],
    queryFn: async () => {
      const { data } = await sb
        .from('v_work_entries')
        .select('*')
        .eq('work_order_id', orderId)
        .order('created_at')
      return data ?? []
    },
  })

  const catalogs = useQuery({
    queryKey: ['campo-catalogs', service.id],
    queryFn: async () => {
      const [acts, secs, units] = await Promise.all([
        sb.from('activities_catalog').select('id, code, name, category, color, unit_id, min_photos, requires_photo')
          .eq('service_id', service.id).eq('is_active', true).is('deleted_at', null).order('code'),
        sb.from('road_sections').select('id, code, name, prog_start_m, prog_end_m')
          .eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('units').select('id, code, symbol'),
      ])
      return { activities: acts.data ?? [], sections: secs.data ?? [], units: units.data ?? [] }
    },
    staleTime: 10 * 60_000,
  })

  const o = order.data
  const st = o ? WORK_ORDER_STATUS[o.status as keyof typeof WORK_ORDER_STATUS] : null
  const editable = o?.status === 'borrador' || o?.status === 'observado'
  const isOwner = role === 'jefe_cuadrilla'

  const totalMetrado = (entries.data ?? []).reduce((s: number, e: any) => s + Number(e.quantity ?? 0), 0)
  const totalFotos = (entries.data ?? []).reduce((s: number, e: any) => s + Number(e.evidence_count ?? 0), 0)

  // ── Enviar a validación ───────────────────────────────────────────────
  const submit = async () => {
    const { error } = await sb
      .from('work_orders')
      .update({ status: 'enviado', submitted_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) return toast.error(error.message)
    haptic([30, 40, 30])
    toast.success('Parte enviado al supervisor')
    qc.invalidateQueries({ queryKey: ['work-order', orderId] })
  }

  const review = async (approve: boolean, notes?: string) => {
    const { error } = await sb
      .from('work_orders')
      .update({
        status: approve ? 'validado' : 'observado',
        reviewed_at: new Date().toISOString(),
        reviewed_by: profile.id,
        review_notes: notes ?? null,
      })
      .eq('id', orderId)
    if (error) return toast.error(error.message)
    toast.success(approve ? 'Parte validado' : 'Parte observado')
    setReviewOpen(false)
    qc.invalidateQueries({ queryKey: ['work-order', orderId] })
  }

  return (
    <>
      <PageHeader
        title={o ? `Parte del ${fmtDate(o.work_date, 'long')}` : 'Parte diario'}
        description={o?.crews?.name}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campo">
                <ArrowLeft className="size-4" />
                Volver
              </Link>
            </Button>
            {editable && isOwner && (
              <Button variant="accent" onClick={submit} disabled={!entries.data?.length}>
                <Send className="size-4" />
                Enviar a validación
              </Button>
            )}
            {o?.status === 'enviado' && can.manage && (
              <Button onClick={() => setReviewOpen(true)}>
                <CircleCheck className="size-4" />
                Revisar parte
              </Button>
            )}
          </>
        }
      >
        {o && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Badge className={st!.className}>{st!.label}</Badge>
            {o.weather && <span className="text-muted-foreground text-[12.5px]">Clima: {o.weather}</span>}
            {o.start_time && (
              <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                <Clock className="size-3" />
                {o.start_time.slice(0, 5)} – {o.end_time?.slice(0, 5) ?? '—'}
              </span>
            )}
            {o.headcount && <span className="text-muted-foreground text-[12.5px]">{o.headcount} personas</span>}
            <div className="ml-auto flex gap-5">
              <div className="text-right">
                <div className="text-[17px] font-bold tabular-nums leading-none">{fmtNumber(entries.data?.length ?? 0)}</div>
                <div className="text-muted-foreground text-[10.5px]">registros</div>
              </div>
              <div className="text-right">
                <div className="text-[17px] font-bold tabular-nums leading-none">{fmtNumber(totalMetrado, 1)}</div>
                <div className="text-muted-foreground text-[10.5px]">metrado</div>
              </div>
              <div className="text-right">
                <div className="text-[17px] font-bold tabular-nums leading-none">{fmtNumber(totalFotos)}</div>
                <div className="text-muted-foreground text-[10.5px]">evidencias</div>
              </div>
            </div>
          </div>
        )}
      </PageHeader>

      <PageBody className="space-y-4">
        {o?.status === 'observado' && o.review_notes && (
          <div className="bg-destructive/8 border-destructive/25 flex items-start gap-3 rounded-xl border px-4 py-3">
            <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold">Observación del supervisor</p>
              <p className="text-muted-foreground mt-0.5 text-[12.5px]">{o.review_notes}</p>
            </div>
          </div>
        )}

        {editable && isOwner && (
          <Button variant="accent" size="field" className="w-full sm:w-auto" onClick={() => setEntryOpen(true)}>
            <Plus className="size-5" />
            Registrar actividad
          </Button>
        )}

        {entries.isLoading ? (
          <SkeletonList rows={4} />
        ) : !entries.data?.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Ruler}
                title="Sin registros aún"
                description="Registra la primera actividad ejecutada. Puedes hacerlo sin conexión: se guardará en el dispositivo."
                action={editable && isOwner && (
                  <Button variant="accent" onClick={() => setEntryOpen(true)}>
                    <Plus className="size-4" />
                    Registrar actividad
                  </Button>
                )}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {entries.data.map((e: any, i: number) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ background: e.activity_color ?? 'var(--primary)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-snug">{e.activity_name}</p>
                        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {e.section_name}
                          </span>
                          <Progresiva from={e.prog_start_m} to={e.prog_end_m} />
                          <span className="capitalize">lado {e.side}</span>
                        </p>
                        {e.observation && (
                          <p className="text-muted-foreground mt-1.5 text-[12px] italic">&laquo;{e.observation}&raquo;</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[17px] font-bold tabular-nums leading-none">
                          {fmtNumber(e.quantity, 1)}
                        </div>
                        <div className="text-muted-foreground text-[10.5px]">{e.unit_symbol}</div>
                      </div>
                    </div>

                    <EvidenceGrid
                      entryId={e.id}
                      count={e.evidence_count}
                      canAdd={editable && isOwner}
                      onAdd={() => setCameraFor(e)}
                    />
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </ul>
        )}
      </PageBody>

      {/* ── Diálogo: nueva actividad ─────────────────────────────────── */}
      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        orderId={orderId}
        serviceId={service.id}
        catalogs={catalogs.data}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['work-entries', orderId] })
        }}
      />

      {/* ── Cámara ───────────────────────────────────────────────────── */}
      <CameraCapture
        open={!!cameraFor}
        onClose={() => setCameraFor(null)}
        context={{
          servicio: service.name,
          cuadrilla: o?.crews?.name,
          actividad: cameraFor?.activity_name,
          tramo: cameraFor?.section_name,
          progresivaM: cameraFor?.prog_start_m,
          usuario: profile.full_name,
        }}
        onCaptured={async (photo: SealedPhoto, phase) => {
          const clientId = uuid()
          const now = new Date()
          const path = `${service.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${clientId}.webp`

          await enqueueBlob({ client_id: clientId, bucket: 'evidencias', path, blob: photo.blob })
          await enqueue({
            client_id: clientId,
            table: 'evidences',
            payload: {
              service_id: service.id,
              work_entry_id: cameraFor.id,
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
              heading: photo.gps.heading,
              section_id: cameraFor.section_id,
              progresiva_m: cameraFor.prog_start_m,
              taken_at: photo.takenAt.toISOString(),
              sha256: photo.sha256,
              watermarked: true,
              device_id: await getDeviceId(),
              device_model: navigator.userAgent.slice(0, 90),
              created_by: profile.id,
            },
            service_id: service.id,
            label: `Evidencia ${EVIDENCE_PHASE[phase].label} · ${cameraFor.activity_name}`,
          })

          toast.success('Evidencia guardada en el dispositivo', {
            description: navigator.onLine ? 'Sincronizando…' : 'Se enviará al recuperar señal',
          })
          void syncNow().then(() => qc.invalidateQueries({ queryKey: ['work-entries', orderId] }))
          setCameraFor(null)
        }}
      />

      {/* ── Revisión del supervisor ──────────────────────────────────── */}
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} onReview={review} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function EntryDialog({
  open, onOpenChange, orderId, serviceId, catalogs, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  serviceId: string
  catalogs?: { activities: any[]; sections: any[]; units: any[] }
  onCreated: () => void
}) {
  const { profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [activityId, setActivityId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [progIni, setProgIni] = React.useState('')
  const [progFin, setProgFin] = React.useState('')
  const [side, setSide] = React.useState('derecho')
  const [qty, setQty] = React.useState('')
  const [obs, setObs] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [gpsBusy, setGpsBusy] = React.useState(false)

  const activity = catalogs?.activities.find((a) => a.id === activityId)
  const section = catalogs?.sections.find((s) => s.id === sectionId)
  const unit = catalogs?.units.find((u) => u.id === activity?.unit_id)

  const useGps = async () => {
    if (!sectionId) return toast.error('Elige primero el tramo')
    setGpsBusy(true)
    try {
      const fix = await getGpsFix()
      const { data } = await sb.rpc('progresiva_from_point', {
        p_section_id: sectionId,
        p_lng: fix.lng,
        p_lat: fix.lat,
      })
      if (data != null) {
        setProgIni(fmtProgresiva(Number(data)))
        toast.success(`Progresiva calculada: ${fmtProgresiva(Number(data))} (±${fix.accuracy.toFixed(0)} m)`)
      } else {
        toast.warning('No se pudo calcular la progresiva sobre este tramo')
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo obtener la ubicación')
    } finally {
      setGpsBusy(false)
    }
  }

  const save = async () => {
    if (!activityId || !sectionId || !progIni || !qty) {
      return toast.error('Completa actividad, tramo, progresiva y metrado')
    }
    setSaving(true)
    const clientId = uuid()
    let lat: number | null = null
    let lng: number | null = null
    try {
      const fix = await getGpsFix({ timeout: 8000 })
      lat = fix.lat
      lng = fix.lng
    } catch {
      /* el registro puede guardarse sin punto exacto; la evidencia sí lo exige */
    }

    const payload: any = {
      client_id: clientId,
      work_order_id: orderId,
      service_id: serviceId,
      activity_id: activityId,
      section_id: sectionId,
      prog_start_m: parseProgresiva(progIni),
      prog_end_m: progFin ? parseProgresiva(progFin) : null,
      side,
      quantity: Number(qty),
      unit_id: activity?.unit_id ?? null,
      observation: obs || null,
      started_at: new Date().toISOString(),
      created_by: profile.id,
    }

    // Escritura optimista: primero local, luego servidor
    await enqueue({
      client_id: clientId,
      table: 'work_entries',
      payload,
      service_id: serviceId,
      label: `${activity?.name} · ${progIni}`,
    })

    const r = await syncNow()
    setSaving(false)
    haptic(40)

    if (r.failed > 0 && !navigator.onLine) {
      toast.info('Guardado en el dispositivo', { description: 'Se enviará al recuperar señal' })
    } else {
      toast.success('Registro guardado')
    }

    onCreated()
    onOpenChange(false)
    setActivityId(''); setSectionId(''); setProgIni(''); setProgFin(''); setQty(''); setObs('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Registrar actividad ejecutada</DialogTitle>
          <DialogDescription>
            Se guarda primero en el dispositivo. Si no hay señal, se envía automáticamente al recuperarla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <Field label="Actividad" required>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecciona la actividad…" />
              </SelectTrigger>
              <SelectContent>
                {catalogs?.activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: a.color }} />
                      <span className="font-mono text-[11px]">{a.code}</span>
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tramo" required>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecciona el tramo…" />
              </SelectTrigger>
              <SelectContent>
                {catalogs?.sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Progresiva inicio" required hint="Formato km+m, ej. 12+450">
              <div className="flex gap-1.5">
                <Input value={progIni} onChange={(e) => setProgIni(e.target.value)} placeholder="12+450" className="h-11 font-mono" />
                <Button variant="outline" size="icon-lg" onClick={useGps} loading={gpsBusy} title="Calcular con GPS">
                  <MapPin className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label="Progresiva fin">
              <Input value={progFin} onChange={(e) => setProgFin(e.target.value)} placeholder="12+900" className="h-11 font-mono" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lado">
              <Select value={side} onValueChange={setSide}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['derecho', 'izquierdo', 'ambos', 'eje'].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Metrado ejecutado${unit ? ` (${unit.symbol})` : ''}`} required>
              <Input
                type="number"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0.0"
                className="h-11 text-right font-semibold tabular-nums"
              />
            </Field>
          </div>

          <Field label="Observación">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Condiciones encontradas, incidencias…" rows={2} />
          </Field>

          {activity?.requires_photo && (
            <div className="bg-accent/10 text-accent-foreground flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11.5px]">
              <Camera className="mt-0.5 size-3.5 shrink-0" />
              Esta actividad exige al menos {activity.min_photos} fotos con GPS. Podrás capturarlas
              después de guardar el registro.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} loading={saving}>
            <CircleCheck className="size-4" />
            Guardar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewDialog({
  open, onOpenChange, onReview,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onReview: (approve: boolean, notes?: string) => void
}) {
  const [notes, setNotes] = React.useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Revisar parte diario</DialogTitle>
          <DialogDescription>
            Valida el parte si la ejecución y la evidencia son conformes, u obsérvalo indicando qué debe corregirse.
          </DialogDescription>
        </DialogHeader>
        <Field label="Observaciones" hint="Obligatorio si vas a observar el parte">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ej. faltan fotos del después en el registro 2…" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onReview(false, notes)} disabled={!notes.trim()}>
            <CircleX className="size-4" />
            Observar
          </Button>
          <Button variant="success" onClick={() => onReview(true)}>
            <CircleCheck className="size-4" />
            Validar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
