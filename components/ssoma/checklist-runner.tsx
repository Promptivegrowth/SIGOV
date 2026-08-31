'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Camera, Check, X, MinusCircle, MapPin, PenLine,
  TriangleAlert, Loader2, Plus, Trash2, GripVertical, Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/forms/form-dialog'
import { SignaturePadDialog } from '@/components/shared/signature-pad'
import { EmptyState } from '@/components/shared/misc'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { conRespaldoLocal, espejo } from '@/lib/offline/catalogos'
import { syncNow } from '@/lib/offline/sync'
import { getGpsFix, sealPhoto } from '@/lib/camera'
import { cn, uuid, toISODate, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'

type Answer = 'ok' | 'no' | 'na'

/**
 * Respuesta de un checklist desde el celular del capataz.
 *
 * Sigue la misma regla que el resto del trabajo de campo: se guarda primero en
 * el dispositivo y se sincroniza apenas hay Starlink, así que responder un
 * checklist a 40 km de la base nunca se pierde.
 */
export function ChecklistRunner({
  open,
  onOpenChange,
  templateId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  templateId?: string
}) {
  const { service, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [tplId, setTplId] = React.useState(templateId ?? '')
  const [crewId, setCrewId] = React.useState('')
  const [fecha, setFecha] = React.useState(toISODate(new Date()))
  const [answers, setAnswers] = React.useState<Record<string, any>>({})
  const [photos, setPhotos] = React.useState<Record<string, string>>({})
  const [findings, setFindings] = React.useState('')
  const [gps, setGps] = React.useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsBusy, setGpsBusy] = React.useState(false)
  const [signOpen, setSignOpen] = React.useState(false)
  const [signature, setSignature] = React.useState<Blob | null>(null)
  const [photoBusy, setPhotoBusy] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const fileRefs = React.useRef<Record<string, HTMLInputElement | null>>({})

  const catalogos = useQuery({
    queryKey: ['checklist-runner-catalogos', service.id],
    enabled: open,
    // Sin señal se leen del espejo del dispositivo: el checklist se llena
    // igual en el frente y se envía cuando vuelve el Starlink.
    queryFn: () => conRespaldoLocal(
      async () => {
        const [tpls, crews] = await Promise.all([
          sb.from('checklist_templates')
            .select('id, code, name, category, description, questions, frequency')
            .eq('service_id', service.id).eq('is_active', true).is('deleted_at', null).order('name'),
          sb.from('crews').select('id, name, color')
            .eq('service_id', service.id).is('deleted_at', null).order('code'),
        ])
        if (tpls.error) throw tpls.error
        return { tpls: tpls.data ?? [], crews: crews.data ?? [] }
      },
      async () => ({
        tpls: await espejo('checklist_templates', service.id, 'name'),
        crews: await espejo('crews', service.id),
      })
    ),
    staleTime: 5 * 60_000,
  })

  const tpl = catalogos.data?.tpls.find((t: any) => t.id === tplId)
  const preguntas: any[] = Array.isArray(tpl?.questions) ? tpl.questions : []

  React.useEffect(() => {
    if (!open) return
    setTplId(templateId ?? '')
    setCrewId('')
    setFecha(toISODate(new Date()))
    setAnswers({})
    setPhotos({})
    setFindings('')
    setGps(null)
    setSignature(null)
  }, [open, templateId])

  // Al abrir se intenta tomar la ubicación en segundo plano: el checklist
  // vale como registro del frente, y sin coordenadas pierde trazabilidad.
  React.useEffect(() => {
    if (!open || gps) return
    setGpsBusy(true)
    getGpsFix()
      .then((f) => setGps({ lat: f.lat, lng: f.lng, accuracy: f.accuracy }))
      .catch(() => {})
      .finally(() => setGpsBusy(false))
  }, [open])

  const boolQs = preguntas.filter((q) => q.type === 'bool')
  const respondidasBool = boolQs.filter((q) => answers[q.id])
  const conformes = boolQs.filter((q) => answers[q.id] === 'ok').length
  const noConformes = boolQs.filter((q) => answers[q.id] === 'no')
  const evaluables = boolQs.filter((q) => answers[q.id] && answers[q.id] !== 'na').length
  const score = evaluables ? Math.round((conformes / evaluables) * 100) : 0

  const faltantes = preguntas.filter((q) => {
    if (!q.required) return false
    if (q.type === 'photo') return !photos[q.id]
    return answers[q.id] === undefined || answers[q.id] === ''
  })

  /** Toma o elige una foto para una pregunta de tipo `photo`. */
  const onPickPhoto = async (q: any, file: File) => {
    if (!gps) {
      toast.error('Necesitamos tu ubicación para sellar la foto', {
        description: 'Activa el GPS y vuelve a intentarlo.',
      })
      return
    }
    setPhotoBusy(q.id)
    try {
      const sealed = await sealPhoto(file, {
        servicio: service.name,
        cuadrilla: catalogos.data?.crews.find((c: any) => c.id === crewId)?.name ?? null,
        actividad: tpl?.name ?? 'Checklist',
        fase: 'general',
        gps: { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } as any,
        takenAt: new Date(),
        usuario: profile.full_name,
      })

      const evId = uuid()
      const path = `${service.id}/checklists/${evId}.webp`
      await enqueueBlob({ client_id: evId, bucket: 'evidencias', path, blob: sealed.blob })
      await enqueue({
        table: 'evidences',
        client_id: evId,
        service_id: service.id,
        label: `Foto de ${tpl?.name ?? 'checklist'}`,
        payload: {
          service_id: service.id,
          phase: 'general',
          storage_path: path,
          mime_type: sealed.blob.type || 'image/webp',
          size_bytes: sealed.blob.size,
          width: sealed.width,
          height: sealed.height,
          lat: gps.lat,
          lng: gps.lng,
          accuracy_m: gps.accuracy,
          taken_at: sealed.takenAt.toISOString(),
          sha256: sealed.sha256,
          watermarked: true,
          device_id: await getDeviceId(),
          caption: q.label,
          created_by: profile.id,
        },
      })
      setPhotos((p) => ({ ...p, [q.id]: path }))
      toast.success('Foto sellada y añadida al checklist')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo procesar la foto')
    } finally {
      setPhotoBusy(null)
    }
  }

  const guardar = async () => {
    if (!tplId) { toast.error('Elige la plantilla del checklist'); return }
    if (faltantes.length) {
      toast.error(`Faltan ${faltantes.length} respuesta${faltantes.length > 1 ? 's' : ''} obligatoria${faltantes.length > 1 ? 's' : ''}`, {
        description: faltantes.map((q) => q.label).slice(0, 3).join(' · '),
      })
      return
    }
    if (noConformes.length && !findings.trim()) {
      toast.error('Describe el hallazgo', {
        description: `Marcaste ${noConformes.length} punto${noConformes.length > 1 ? 's' : ''} como no conforme.`,
      })
      return
    }

    setSaving(true)
    try {
      const respId = uuid()
      const payloadAnswers = { ...answers }
      for (const [k, v] of Object.entries(photos)) payloadAnswers[k] = v

      let signaturePath: string | null = null
      if (signature) {
        signaturePath = `${service.id}/checklists/${respId}.png`
        await enqueueBlob({ client_id: respId, bucket: 'firmas', path: signaturePath, blob: signature })
      }

      await enqueue({
        table: 'checklist_responses',
        client_id: respId,
        service_id: service.id,
        label: `Checklist ${tpl?.name ?? ''}`,
        payload: {
          template_id: tplId,
          service_id: service.id,
          crew_id: crewId || null,
          responded_on: fecha,
          answers: payloadAnswers,
          score,
          has_findings: noConformes.length > 0,
          findings: findings.trim() || null,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
          signature_path: signaturePath,
          created_by: profile.id,
        },
      })

      if (navigator.onLine) {
        await syncNow()
        toast.success('Checklist enviado', {
          description: `${conformes} de ${evaluables} puntos conformes · ${score}%`,
        })
      } else {
        toast.success('Checklist guardado en el equipo', {
          description: 'Se enviará solo cuando vuelva la señal.',
        })
      }
      qc.invalidateQueries({ queryKey: ['checklists'] })
      qc.invalidateQueries({ queryKey: ['ssoma-kpis'] })
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar el checklist')
    } finally {
      setSaving(false)
    }
  }

  const OPCIONES: { key: Answer; label: string; icon: any; on: string }[] = [
    { key: 'ok', label: 'Conforme', icon: Check, on: 'bg-success text-white border-success' },
    { key: 'no', label: 'No conforme', icon: X, on: 'bg-destructive text-white border-destructive' },
    { key: 'na', label: 'No aplica', icon: MinusCircle, on: 'bg-muted-foreground text-white border-muted-foreground' },
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" className="max-h-[94vh]">
          <DialogHeader>
            <DialogTitle>Responder checklist</DialogTitle>
            <DialogDescription>
              Marca punto por punto. Si algo sale no conforme tendrás que describir
              el hallazgo para que quede el seguimiento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Plantilla" required className="sm:col-span-3">
              <Select value={tplId} onValueChange={(v) => { setTplId(v); setAnswers({}); setPhotos({}) }}>
                <SelectTrigger className="h-11"><SelectValue placeholder="¿Qué checklist vas a llenar?" /></SelectTrigger>
                <SelectContent>
                  {(catalogos.data?.tpls ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      <span className="text-muted-foreground text-[11px]"> · {t.category}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Cuadrilla">
              <Select value={crewId} onValueChange={setCrewId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  {(catalogos.data?.crews ?? []).map((c: any) => (
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

            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10" />
            </Field>

            <Field label="Ubicación">
              <Button
                variant="outline"
                className={cn('h-10 w-full justify-start', gps && 'border-success/50 text-success')}
                onClick={async () => {
                  setGpsBusy(true)
                  try {
                    const f = await getGpsFix()
                    setGps({ lat: f.lat, lng: f.lng, accuracy: f.accuracy })
                    toast.success(`Ubicación tomada · ±${f.accuracy.toFixed(0)} m`)
                  } catch (e: any) {
                    toast.error(e?.message ?? 'GPS no disponible')
                  } finally { setGpsBusy(false) }
                }}
              >
                {gpsBusy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                <span className="truncate text-[12px]">
                  {gps ? `±${gps.accuracy.toFixed(0)} m` : 'Tomar ubicación'}
                </span>
              </Button>
            </Field>
          </div>

          {/* ── Preguntas ─────────────────────────────────────────────── */}
          {!tplId ? (
            <div className="border-border rounded-xl border border-dashed">
              <EmptyState
                icon={ClipboardCheck}
                title="Elige una plantilla"
                description="Cada plantilla trae su propia lista de verificación: EPP, vehículo, herramientas o zona de trabajo."
              />
            </div>
          ) : (
            <div className="-mx-1 max-h-[42vh] space-y-2 overflow-y-auto px-1">
              {preguntas.map((q: any, i: number) => (
                <div
                  key={q.id}
                  className={cn(
                    'rounded-xl border p-3',
                    answers[q.id] === 'no' ? 'border-destructive/40 bg-destructive/[0.04]' : 'border-border'
                  )}
                >
                  <p className="mb-2 flex items-start gap-2 text-[13px] font-medium">
                    <span className="text-muted-foreground shrink-0 tabular-nums">{i + 1}.</span>
                    <span className="min-w-0">
                      {q.label}
                      {q.required && <span className="text-destructive"> *</span>}
                      {q.help && <span className="text-muted-foreground block text-[11.5px] font-normal">{q.help}</span>}
                    </span>
                  </p>

                  {q.type === 'bool' && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {OPCIONES.map((o) => {
                        const on = answers[q.id] === o.key
                        return (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))}
                            className={cn(
                              'flex h-10 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors',
                              on ? o.on : 'border-border hover:bg-secondary'
                            )}
                          >
                            <o.icon className="size-3.5" />
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {q.type === 'text' && (
                    <Textarea
                      rows={2}
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Escribe aquí…"
                    />
                  )}

                  {q.type === 'number' && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="h-10"
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="0"
                    />
                  )}

                  {q.type === 'photo' && (
                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => { fileRefs.current[q.id] = el }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void onPickPhoto(q, f)
                          e.target.value = ''
                        }}
                      />
                      <Button
                        variant={photos[q.id] ? 'outline' : 'default'}
                        className={cn('h-10 flex-1', photos[q.id] && 'border-success/50 text-success')}
                        loading={photoBusy === q.id}
                        onClick={() => fileRefs.current[q.id]?.click()}
                      >
                        <Camera className="size-4" />
                        {photos[q.id] ? '1 foto sellada · cambiar' : 'Tomar o subir foto'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Resumen ───────────────────────────────────────────────── */}
          {tplId && (
            <div className="space-y-3">
              <div className="bg-muted/50 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-3.5 py-2.5 text-[12.5px]">
                <span>
                  <span className="text-muted-foreground">Respondidas </span>
                  <span className="font-semibold tabular-nums">{respondidasBool.length}/{boolQs.length}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Cumplimiento </span>
                  <span className={cn('font-semibold tabular-nums', score >= 90 ? 'text-success' : score >= 70 ? 'text-warning' : 'text-destructive')}>
                    {score}%
                  </span>
                </span>
                {noConformes.length > 0 && (
                  <Badge variant="warning" className="gap-1">
                    <TriangleAlert className="size-3" />
                    {noConformes.length} no conforme{noConformes.length > 1 ? 's' : ''}
                  </Badge>
                )}
                <Button
                  variant="outline" size="sm" className="ml-auto"
                  onClick={() => setSignOpen(true)}
                >
                  <PenLine className="size-3.5" />
                  {signature ? 'Firma registrada' : 'Firmar'}
                </Button>
              </div>

              {noConformes.length > 0 && (
                <Field label="Hallazgos detectados" required
                  hint="Explica qué encontraste y qué acción inmediata se tomó.">
                  <Textarea
                    rows={2}
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    placeholder={`Puntos no conformes: ${noConformes.map((q: any) => q.label).join(', ')}`}
                  />
                </Field>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={guardar} loading={saving} disabled={!tplId}>
              <ClipboardCheck className="size-4" />
              Enviar checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignaturePadDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Firma del responsable"
        description="Firma la conformidad de esta inspección."
        signerName={profile.full_name}
        onSigned={(blob) => {
          setSignature(blob)
          toast.success('Firma registrada')
        }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * Gestión de plantillas de checklist.
 * El ingeniero de seguridad arma sus propias listas sin depender de nosotros.
 */
export function ChecklistTemplates({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { service, profile, can } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [editing, setEditing] = React.useState<any>(null)
  const [deleting, setDeleting] = React.useState<any>(null)

  const tpls = useQuery({
    queryKey: ['checklist-templates', service.id],
    enabled: open,
    queryFn: async () => (await sb.from('checklist_templates')
      .select('*').eq('service_id', service.id).is('deleted_at', null).order('name')).data ?? [],
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Plantillas de checklist</DialogTitle>
            <DialogDescription>
              Las listas de verificación que responden las cuadrillas. Puedes crear
              las tuyas y ordenarlas por categoría.
            </DialogDescription>
          </DialogHeader>

          {can.manage && (
            <Button variant="outline" onClick={() => setEditing({ questions: [] })}>
              <Plus className="size-4" />
              Nueva plantilla
            </Button>
          )}

          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {(tpls.data ?? []).map((t: any) => (
              <li key={t.id} className="border-border flex items-center gap-3 rounded-xl border p-3">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <ClipboardCheck className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                  <span className="text-muted-foreground block text-[11.5px]">
                    {t.code} · {t.category} · {(t.questions ?? []).length} puntos · {t.frequency}
                  </span>
                </span>
                {!t.is_active && <Badge variant="secondary">Inactiva</Badge>}
                {can.manage && (
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(t)} title="Editar">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(t)} title="Eliminar">
                      <Trash2 className="text-destructive size-3.5" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
            {!tpls.data?.length && !tpls.isLoading && (
              <li>
                <EmptyState icon={ClipboardCheck} title="Sin plantillas" description="Crea la primera lista de verificación." />
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <TemplateEditor
        tpl={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['checklist-templates'] })}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`¿Eliminar la plantilla "${deleting?.name ?? ''}"?`}
        description="Los checklists ya respondidos con esta plantilla se conservan."
        confirmLabel="Eliminar plantilla"
        onConfirm={async () => {
          const { error } = await sb.from('checklist_templates')
            .update({ deleted_at: new Date().toISOString() }).eq('id', deleting.id)
          if (error) { toast.error(error.message); return }
          toast.success('Plantilla eliminada')
          qc.invalidateQueries({ queryKey: ['checklist-templates'] })
          qc.invalidateQueries({ queryKey: ['checklist-runner-catalogos'] })
          setDeleting(null)
        }}
      />
    </>
  )
}

/** Editor de plantilla con constructor de preguntas. */
function TemplateEditor({
  tpl, onClose, onSaved,
}: {
  tpl: any
  onClose: () => void
  onSaved: () => void
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [category, setCategory] = React.useState('EPP')
  const [frequency, setFrequency] = React.useState('diaria')
  const [description, setDescription] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [qs, setQs] = React.useState<any[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!tpl) return
    setCode(tpl.code ?? '')
    setName(tpl.name ?? '')
    setCategory(tpl.category ?? 'EPP')
    setFrequency(tpl.frequency ?? 'diaria')
    setDescription(tpl.description ?? '')
    setActive(tpl.is_active ?? true)
    setQs(Array.isArray(tpl.questions) ? tpl.questions : [])
  }, [tpl])

  const addQ = () =>
    setQs((prev) => [...prev, { id: `p${prev.length + 1}_${Date.now().toString(36)}`, label: '', type: 'bool', required: true }])

  const guardar = async () => {
    if (!code.trim() || !name.trim()) { toast.error('El código y el nombre son obligatorios'); return }
    const limpias = qs.filter((q) => q.label.trim())
    if (!limpias.length) { toast.error('Agrega al menos un punto de verificación'); return }

    setSaving(true)
    const payload = {
      service_id: service.id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category,
      frequency,
      description: description.trim() || null,
      is_active: active,
      questions: limpias,
    }
    const { error } = tpl?.id
      ? await sb.from('checklist_templates').update(payload).eq('id', tpl.id)
      : await sb.from('checklist_templates').insert({ ...payload, created_by: profile.id })
    setSaving(false)
    if (error) {
      toast.error(error.message.includes('duplicate') ? `Ya existe una plantilla con el código ${code.toUpperCase()}` : error.message)
      return
    }
    toast.success(tpl?.id ? 'Plantilla actualizada' : 'Plantilla creada')
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!tpl} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>{tpl?.id ? 'Editar plantilla' : 'Nueva plantilla de checklist'}</DialogTitle>
          <DialogDescription>
            Define los puntos que la cuadrilla debe verificar. Los de tipo
            «conforme / no conforme» son los que calculan el porcentaje de cumplimiento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CHK-EPP" className="h-10 font-mono uppercase" />
          </Field>
          <Field label="Nombre" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Verificación de EPP" className="h-10" />
          </Field>
          <Field label="Categoría">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['EPP', 'Vehículo', 'Herramientas', 'Área de trabajo', 'Señalización', 'Otros'].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Frecuencia">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['diaria', 'semanal', 'quincenal', 'mensual', 'por evento'].map((f) => (
                  <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qué sirve esta lista y cuándo se llena." />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Puntos de verificación ({qs.length})
            </p>
            <Button variant="outline" size="sm" onClick={addQ}>
              <Plus className="size-3.5" />
              Agregar punto
            </Button>
          </div>

          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {qs.map((q, i) => (
              <li key={q.id} className="border-border flex items-start gap-2 rounded-lg border p-2.5">
                <GripVertical className="text-muted-foreground mt-2.5 size-3.5 shrink-0" />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_7rem]">
                  <Input
                    value={q.label}
                    onChange={(e) => setQs((prev) => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    placeholder="Casco de seguridad en buen estado"
                    className="h-9"
                  />
                  <Select
                    value={q.type}
                    onValueChange={(v) => setQs((prev) => prev.map((x, j) => j === i ? { ...x, type: v } : x))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bool">Conforme / No</SelectItem>
                      <SelectItem value="text">Texto libre</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="photo">Foto</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="bg-muted/40 flex h-9 cursor-pointer items-center justify-between rounded-lg px-2.5 text-[11.5px]">
                    Obligatorio
                    <Switch
                      checked={!!q.required}
                      onCheckedChange={(v) => setQs((prev) => prev.map((x, j) => j === i ? { ...x, required: v } : x))}
                    />
                  </label>
                </div>
                <Button variant="ghost" size="icon-sm" className="mt-0.5"
                  onClick={() => setQs((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="text-destructive size-3.5" />
                </Button>
              </li>
            ))}
            {!qs.length && (
              <li className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-6 text-center text-[12.5px]">
                Todavía no hay puntos. Agrega el primero.
              </li>
            )}
          </ul>
        </div>

        <DialogFooter>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-[12.5px]">
            <Switch checked={active} onCheckedChange={setActive} />
            Plantilla activa
          </label>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} loading={saving}>Guardar plantilla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
