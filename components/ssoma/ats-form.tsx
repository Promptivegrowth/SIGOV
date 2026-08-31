'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HardHat, Plus, Trash2, PenLine, MapPin, Loader2, Signature, Check,
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
import { Checkbox } from '@/components/ui/primitives'
import { SignaturePadDialog } from '@/components/shared/signature-pad'
import { enqueue, enqueueBlob } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { getGpsFix } from '@/lib/camera'
import { cn, uuid, toISODate, parseProgresiva, fmtProgresiva } from '@/lib/utils'
import { toast } from 'sonner'

/** Escalas IPERC del MTC simplificadas a 4 niveles, como las usa la supervisión. */
const PROBABILIDAD = [
  { v: 1, label: 'Baja' },
  { v: 2, label: 'Media' },
  { v: 3, label: 'Alta' },
  { v: 4, label: 'Muy alta' },
]
const SEVERIDAD = [
  { v: 1, label: 'Ligero' },
  { v: 2, label: 'Dañino' },
  { v: 3, label: 'Extremadamente dañino' },
  { v: 4, label: 'Fatal' },
]

const RISK_COLORS: Record<string, string> = {
  trivial: 'var(--sem-verde)',
  tolerable: 'var(--sem-verde)',
  moderado: 'var(--sem-ambar)',
  importante: 'var(--sem-rojo)',
  intolerable: 'var(--sem-vencido)',
}

/** Nivel de riesgo resultante de cruzar probabilidad y severidad. */
export function nivelRiesgo(prob: number, sev: number): string {
  const n = prob * sev
  if (n <= 2) return 'trivial'
  if (n <= 4) return 'tolerable'
  if (n <= 8) return 'moderado'
  if (n <= 12) return 'importante'
  return 'intolerable'
}

const ORDEN_RIESGO = ['trivial', 'tolerable', 'moderado', 'importante', 'intolerable']

const EPP_BASE = [
  'Casco', 'Chaleco reflectivo', 'Botines de seguridad', 'Guantes',
  'Lentes de seguridad', 'Protector auditivo', 'Respirador', 'Arnés',
  'Bloqueador solar', 'Cortaviento',
]

/** Peligros que aparecen casi siempre en un frente de vía: se ofrecen de un toque. */
const PELIGROS_FRECUENTES = [
  { peligro: 'Tránsito vehicular en la vía', riesgo: 'Atropello o colisión', probabilidad: 3, severidad: 4,
    controles: 'Señalización preventiva a 150 m, banderilleros en ambos extremos, conos cada 10 m, chaleco clase 3.' },
  { peligro: 'Exposición prolongada al sol', riesgo: 'Golpe de calor / quemaduras', probabilidad: 3, severidad: 2,
    controles: 'Hidratación cada 30 min, bloqueador solar, cortaviento, pausas a la sombra.' },
  { peligro: 'Manipulación de herramientas manuales', riesgo: 'Cortes y golpes', probabilidad: 2, severidad: 2,
    controles: 'Guantes anticorte, herramientas en buen estado, inspección preuso.' },
  { peligro: 'Trabajo en talud o cuneta profunda', riesgo: 'Caída a distinto nivel', probabilidad: 2, severidad: 3,
    controles: 'Delimitación del área, calzado antideslizante, apoyo de un compañero.' },
  { peligro: 'Polvo en suspensión', riesgo: 'Afección respiratoria', probabilidad: 3, severidad: 2,
    controles: 'Respirador con filtro, humedecer el material, ubicación a favor del viento.' },
]

export function AtsForm({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { service, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [fecha, setFecha] = React.useState(toISODate(new Date()))
  const [task, setTask] = React.useState('')
  const [crewId, setCrewId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [prog, setProg] = React.useState('')
  const [location, setLocation] = React.useState('')
  const [supervisorId, setSupervisorId] = React.useState('')
  const [ppe, setPpe] = React.useState<string[]>(['Casco', 'Chaleco reflectivo', 'Botines de seguridad', 'Guantes'])
  const [hazards, setHazards] = React.useState<any[]>([])
  const [gps, setGps] = React.useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsBusy, setGpsBusy] = React.useState(false)
  const [supSign, setSupSign] = React.useState<Blob | null>(null)
  const [signOpen, setSignOpen] = React.useState<{ kind: 'sup' | 'member'; member?: any } | null>(null)
  const [signers, setSigners] = React.useState<Record<string, Blob>>({})
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)

  const catalogos = useQuery({
    queryKey: ['ats-catalogos', service.id],
    enabled: open,
    queryFn: async () => {
      const [crews, sections, members] = await Promise.all([
        sb.from('crews').select('id, name, color').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('road_sections').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('service_members').select('profile_id, role, profiles(id, full_name)').eq('service_id', service.id),
      ])
      return {
        crews: crews.data ?? [],
        sections: sections.data ?? [],
        supervisores: (members.data ?? [])
          .filter((m: any) => ['admin', 'coordinador', 'ingeniero', 'inspector'].includes(m.role))
          .map((m: any) => ({ id: m.profiles?.id, name: m.profiles?.full_name }))
          .filter((m: any) => m.id),
      }
    },
    staleTime: 5 * 60_000,
  })

  const roster = useQuery({
    queryKey: ['crew-roster', crewId],
    enabled: !!crewId,
    queryFn: async () => (await sb.from('crew_members')
      .select('id, full_name, dni, position')
      .eq('crew_id', crewId).eq('is_active', true).order('position')).data ?? [],
  })

  React.useEffect(() => {
    if (!open) return
    setFecha(toISODate(new Date()))
    setTask(''); setCrewId(''); setSectionId(''); setProg(''); setLocation('')
    setSupervisorId(profile.id)
    setPpe(['Casco', 'Chaleco reflectivo', 'Botines de seguridad', 'Guantes'])
    setHazards([])
    setSupSign(null); setSigners({}); setSelected(new Set())
    setGps(null)
    getGpsFix().then((f) => setGps({ lat: f.lat, lng: f.lng, accuracy: f.accuracy })).catch(() => {})
  }, [open, profile.id])

  // Todo el equipo se marca por defecto: el ATS lo firma la cuadrilla completa
  React.useEffect(() => {
    if (roster.data) setSelected(new Set(roster.data.map((m: any) => m.id)))
  }, [roster.data])

  const maxRisk = React.useMemo(() => {
    if (!hazards.length) return 'tolerable'
    return hazards
      .map((h) => nivelRiesgo(Number(h.probabilidad) || 1, Number(h.severidad) || 1))
      .sort((a, b) => ORDEN_RIESGO.indexOf(b) - ORDEN_RIESGO.indexOf(a))[0]
  }, [hazards])

  const addHazard = (base?: any) =>
    setHazards((prev) => [...prev, base
      ? { ...base, responsable: 'Jefe de cuadrilla' }
      : { peligro: '', riesgo: '', probabilidad: 2, severidad: 2, controles: '', responsable: 'Jefe de cuadrilla' }])

  const guardar = async () => {
    if (!task.trim()) { toast.error('Describe la tarea a ejecutar'); return }
    if (!crewId) { toast.error('Elige la cuadrilla que ejecuta'); return }
    const limpios = hazards.filter((h) => h.peligro?.trim() && h.riesgo?.trim())
    if (!limpios.length) { toast.error('Registra al menos un peligro con su riesgo y control'); return }
    const sinControl = limpios.filter((h) => !h.controles?.trim())
    if (sinControl.length) {
      toast.error('Cada peligro necesita su control', { description: sinControl[0].peligro })
      return
    }

    const progM = prog ? parseProgresiva(prog) : null
    if (prog && progM == null) { toast.error('Progresiva no válida. Usa el formato 12+450'); return }

    setSaving(true)
    try {
      const atsId = uuid()

      let supPath: string | null = null
      if (supSign) {
        supPath = `${service.id}/ats/${atsId}/supervisor.png`
        await enqueueBlob({ client_id: atsId, bucket: 'firmas', path: supPath, blob: supSign })
      }

      await enqueue({
        table: 'ats_iperc',
        client_id: atsId,
        service_id: service.id,
        label: `ATS · ${task.trim().slice(0, 40)}`,
        payload: {
          service_id: service.id,
          crew_id: crewId,
          doc_date: fecha,
          task: task.trim(),
          location: location.trim() || null,
          section_id: sectionId || null,
          prog_start_m: progM,
          hazards: limpios.map((h) => ({
            ...h,
            probabilidad: Number(h.probabilidad),
            severidad: Number(h.severidad),
            nivel: nivelRiesgo(Number(h.probabilidad), Number(h.severidad)),
          })),
          max_risk: maxRisk,
          ppe,
          supervisor_id: supervisorId || null,
          supervisor_signature_path: supPath,
          approved_at: supSign ? new Date().toISOString() : null,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
          created_by: profile.id,
        },
      })

      // Firmas del equipo: cada una es hija del ATS y espera su id real
      const equipo = (roster.data ?? []).filter((m: any) => selected.has(m.id))
      for (const m of equipo) {
        const sigId = uuid()
        const blob = signers[m.id]
        let path: string | null = null
        if (blob) {
          path = `${service.id}/ats/${atsId}/${m.id}.png`
          await enqueueBlob({ client_id: sigId, bucket: 'firmas', path, blob })
        }
        await enqueue({
          table: 'ats_signatures',
          client_id: sigId,
          depends_on: atsId,
          service_id: service.id,
          label: `Firma ATS · ${m.full_name}`,
          payload: {
            full_name: m.full_name,
            dni: m.dni,
            signature_path: path,
            signed_at: new Date().toISOString(),
          },
        })
      }

      if (navigator.onLine) {
        await syncNow()
        toast.success('ATS registrado', {
          description: `${limpios.length} peligros · riesgo máximo ${maxRisk} · ${equipo.length} firmas`,
        })
      } else {
        toast.success('ATS guardado en el equipo', {
          description: 'Se enviará junto con las firmas cuando vuelva la señal.',
        })
      }
      qc.invalidateQueries({ queryKey: ['ats'] })
      qc.invalidateQueries({ queryKey: ['ssoma-kpis'] })
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar el ATS')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="xl" className="max-h-[94vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <HardHat className="size-4.5" />
              </span>
              Nuevo ATS / IPERC
            </DialogTitle>
            <DialogDescription>
              Análisis de Trabajo Seguro previo al inicio del frente: qué se va a
              hacer, qué puede salir mal y cómo se controla. Lo firma la cuadrilla.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 space-y-4 overflow-y-auto px-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Fecha" required>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10" />
              </Field>
              <Field label="Cuadrilla" required>
                <Select value={crewId} onValueChange={setCrewId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
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
              <Field label="Tramo">
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {(catalogos.data?.sections ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Progresiva de inicio" hint="Formato 12+450">
                <div className="flex gap-1.5">
                  <Input value={prog} onChange={(e) => setProg(e.target.value)} placeholder="12+450" className="h-10 font-mono" />
                  <Button
                    variant="outline" size="icon-lg" title="Tomar ubicación"
                    onClick={async () => {
                      setGpsBusy(true)
                      try {
                        const f = await getGpsFix()
                        setGps({ lat: f.lat, lng: f.lng, accuracy: f.accuracy })
                        if (sectionId) {
                          const { data } = await sb.rpc('progresiva_from_point', {
                            p_section_id: sectionId, p_lng: f.lng, p_lat: f.lat,
                          })
                          if (data != null) setProg(fmtProgresiva(Number(data)))
                        }
                        toast.success(`Ubicación tomada · ±${f.accuracy.toFixed(0)} m`)
                      } catch (e: any) {
                        toast.error(e?.message ?? 'GPS no disponible')
                      } finally { setGpsBusy(false) }
                    }}
                  >
                    {gpsBusy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                  </Button>
                </div>
              </Field>

              <Field label="Tarea a ejecutar" required className="sm:col-span-2">
                <Input value={task} onChange={(e) => setTask(e.target.value)}
                  placeholder="Limpieza de cunetas y descolmatación de alcantarillas" className="h-10" />
              </Field>
              <Field label="Lugar / referencia" className="sm:col-span-2">
                <Input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Frente km 12+400, lado derecho" className="h-10" />
              </Field>
            </div>

            {/* ── Matriz de riesgos ─────────────────────────────────────── */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  Matriz de peligros y controles ({hazards.length})
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="capitalize"
                    style={{ color: RISK_COLORS[maxRisk], borderColor: RISK_COLORS[maxRisk] }}
                  >
                    Riesgo máximo: {maxRisk}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => addHazard()}>
                    <Plus className="size-3.5" />
                    Agregar peligro
                  </Button>
                </div>
              </div>

              {/* Atajos: peligros típicos de un frente vial */}
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {PELIGROS_FRECUENTES.map((p) => {
                  const ya = hazards.some((h) => h.peligro === p.peligro)
                  return (
                    <button
                      key={p.peligro}
                      type="button"
                      disabled={ya}
                      onClick={() => addHazard(p)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                        ya ? 'border-success/40 text-success' : 'border-border hover:bg-secondary'
                      )}
                    >
                      {ya ? <Check className="mr-1 inline size-3" /> : <Plus className="mr-1 inline size-3" />}
                      {p.peligro}
                    </button>
                  )
                })}
              </div>

              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {hazards.map((h, i) => {
                  const nivel = nivelRiesgo(Number(h.probabilidad) || 1, Number(h.severidad) || 1)
                  return (
                    <li key={i} className="border-border rounded-xl border p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          value={h.peligro}
                          onChange={(e) => setHazards((p) => p.map((x, j) => j === i ? { ...x, peligro: e.target.value } : x))}
                          placeholder="Peligro identificado" className="h-9"
                        />
                        <Input
                          value={h.riesgo}
                          onChange={(e) => setHazards((p) => p.map((x, j) => j === i ? { ...x, riesgo: e.target.value } : x))}
                          placeholder="Riesgo asociado" className="h-9"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={String(h.probabilidad)}
                            onValueChange={(v) => setHazards((p) => p.map((x, j) => j === i ? { ...x, probabilidad: Number(v) } : x))}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="Probabilidad" /></SelectTrigger>
                            <SelectContent>
                              {PROBABILIDAD.map((o) => <SelectItem key={o.v} value={String(o.v)}>Prob. {o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select
                            value={String(h.severidad)}
                            onValueChange={(v) => setHazards((p) => p.map((x, j) => j === i ? { ...x, severidad: Number(v) } : x))}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="Severidad" /></SelectTrigger>
                            <SelectContent>
                              {SEVERIDAD.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline" className="h-9 flex-1 justify-center capitalize"
                            style={{ color: RISK_COLORS[nivel], borderColor: RISK_COLORS[nivel] }}
                          >
                            Riesgo {nivel}
                          </Badge>
                          <Input
                            value={h.responsable ?? ''}
                            onChange={(e) => setHazards((p) => p.map((x, j) => j === i ? { ...x, responsable: e.target.value } : x))}
                            placeholder="Responsable" className="h-9 flex-1"
                          />
                          <Button variant="ghost" size="icon-sm"
                            onClick={() => setHazards((p) => p.filter((_, j) => j !== i))}>
                            <Trash2 className="text-destructive size-3.5" />
                          </Button>
                        </div>
                        <Textarea
                          rows={2} className="sm:col-span-2"
                          value={h.controles ?? ''}
                          onChange={(e) => setHazards((p) => p.map((x, j) => j === i ? { ...x, controles: e.target.value } : x))}
                          placeholder="Controles a aplicar antes y durante la tarea"
                        />
                      </div>
                    </li>
                  )
                })}
                {!hazards.length && (
                  <li className="text-muted-foreground border-border rounded-xl border border-dashed px-3 py-6 text-center text-[12.5px]">
                    Agrega los peligros del frente. Puedes usar los atajos de arriba.
                  </li>
                )}
              </ul>
            </div>

            {/* ── EPP ───────────────────────────────────────────────────── */}
            <div>
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Equipo de protección obligatorio
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EPP_BASE.map((e) => {
                  const on = ppe.includes(e)
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setPpe((p) => on ? p.filter((x) => x !== e) : [...p, e])}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                        on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-secondary'
                      )}
                    >
                      {e}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Firmas ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                  Supervisor que aprueba
                </p>
                <div className="flex gap-2">
                  <Select value={supervisorId} onValueChange={setSupervisorId}>
                    <SelectTrigger className="h-10 flex-1"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {(catalogos.data?.supervisores ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={supSign ? 'outline' : 'default'}
                    className={cn('h-10', supSign && 'border-success/50 text-success')}
                    onClick={() => setSignOpen({ kind: 'sup' })}
                  >
                    <PenLine className="size-4" />
                    {supSign ? 'Firmado' : 'Firmar'}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                  Equipo que participa ({selected.size})
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {(roster.data ?? []).map((m: any) => {
                    const on = selected.has(m.id)
                    return (
                      <li key={m.id} className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]',
                        on ? 'border-border' : 'border-border/50 opacity-60'
                      )}>
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => setSelected((prev) => {
                            const next = new Set(prev)
                            on ? next.delete(m.id) : next.add(m.id)
                            return next
                          })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.full_name}</span>
                          <span className="text-muted-foreground block text-[11px]">{m.position}</span>
                        </span>
                        <Button
                          variant="ghost" size="icon-sm"
                          className={cn(signers[m.id] && 'text-success')}
                          title={signers[m.id] ? 'Firmado' : 'Firmar'}
                          onClick={() => setSignOpen({ kind: 'member', member: m })}
                        >
                          {signers[m.id] ? <Signature className="size-3.5" /> : <PenLine className="size-3.5" />}
                        </Button>
                      </li>
                    )
                  })}
                  {!crewId && (
                    <li className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-5 text-center text-[12px]">
                      Elige una cuadrilla para ver a su personal.
                    </li>
                  )}
                  {crewId && !roster.data?.length && !roster.isLoading && (
                    <li className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-5 text-center text-[12px]">
                      Esta cuadrilla no tiene integrantes. Agrégalos en Configuración.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={guardar} loading={saving}>
              <HardHat className="size-4" />
              Registrar ATS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignaturePadDialog
        open={!!signOpen}
        onOpenChange={(v) => !v && setSignOpen(null)}
        title={signOpen?.kind === 'sup' ? 'Firma del supervisor' : 'Firma del trabajador'}
        description={
          signOpen?.kind === 'sup'
            ? 'Con tu firma apruebas los controles definidos para esta tarea.'
            : 'Firma de conformidad: entendiste los peligros y los controles de la tarea.'
        }
        signerName={
          signOpen?.kind === 'sup'
            ? catalogos.data?.supervisores.find((s: any) => s.id === supervisorId)?.name ?? profile.full_name
            : signOpen?.member?.full_name
        }
        onSigned={(blob) => {
          if (signOpen?.kind === 'sup') setSupSign(blob)
          else if (signOpen?.member) setSigners((p) => ({ ...p, [signOpen.member.id]: blob }))
          toast.success('Firma registrada')
        }}
      />
    </>
  )
}
