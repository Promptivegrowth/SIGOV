'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ShieldCheck, Megaphone, ClipboardCheck, HardHat, Signature,
  Users, TriangleAlert, CircleCheck, Plus, Calendar, MapPin, ChevronRight,
  Search, X, Pencil, Trash2, Download, PenLine,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import { SkeletonList, SkeletonKpi } from '@/components/ui/skeleton'
import { EmptyState, ProgressBar } from '@/components/shared/misc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox, Tip } from '@/components/ui/primitives'
import { FormDialog, ConfirmDialog, type FormField } from '@/components/forms/form-dialog'
import { ChecklistRunner, ChecklistTemplates } from '@/components/ssoma/checklist-runner'
import { AtsForm } from '@/components/ssoma/ats-form'
import { SignaturePadDialog, uploadSignature } from '@/components/shared/signature-pad'
import { DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { cn, fmtDate, fmtNumber, fmtRelative, truncate, toISODate } from '@/lib/utils'
import { toast } from 'sonner'

const RISK_COLORS: Record<string, string> = {
  trivial: 'var(--sem-verde)',
  tolerable: 'var(--sem-verde)',
  moderado: 'var(--sem-ambar)',
  importante: 'var(--sem-rojo)',
  intolerable: 'var(--sem-vencido)',
}

export function SsomaClient() {
  const { service, can, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState('charlas')
  const [detail, setDetail] = React.useState<any>(null)
  const [q, setQ] = React.useState('')
  const [crewFilter, setCrewFilter] = React.useState('todas')
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const [talkForm, setTalkForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [attendance, setAttendance] = React.useState<any>(null)
  const [confirm, setConfirm] = React.useState<any>(null)
  const [runner, setRunner] = React.useState(false)
  const [templates, setTemplates] = React.useState(false)
  const [atsForm, setAtsForm] = React.useState(false)

  // El capataz llega desde su parte de campo con el formulario ya pedido:
  // /ssoma?nuevo=checklist o /ssoma?nuevo=ats
  const params = useSearchParams()
  React.useEffect(() => {
    const nuevo = params.get('nuevo')
    if (nuevo === 'checklist') { setTab('checklists'); setRunner(true) }
    if (nuevo === 'ats') { setTab('ats'); setAtsForm(true) }
  }, [params])

  const range = React.useMemo(() => rangeFromPreset(preset), [preset])
  const from = range.from

  const crews = useQuery({
    queryKey: ['crews', service.id],
    queryFn: async () => (await sb.from('crews').select('id, code, name, color')
      .eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? [],
    staleTime: 5 * 60_000,
  })

  const talkFields: FormField[] = [
    { name: 'topic', label: 'Tema de la charla', type: 'text', required: true, span: 2,
      placeholder: 'Uso correcto de EPP en vias con transito activo' },
    { name: 'talk_date', label: 'Fecha', type: 'date', required: true, defaultValue: toISODate(new Date()) },
    { name: 'start_time', label: 'Hora de inicio', type: 'text', placeholder: '07:05', defaultValue: '07:05' },
    {
      name: 'crew_id', label: 'Cuadrilla', type: 'select', required: true,
      options: (crews.data ?? []).map((c: any) => ({ value: c.id, label: c.name, color: c.color })),
    },
    { name: 'duration_min', label: 'Duracion (minutos)', type: 'number', min: 1, max: 120, defaultValue: 5 },
    { name: 'speaker_name', label: 'Expositor', type: 'text', required: true, span: 2 },
    { name: 'location', label: 'Lugar', type: 'text', span: 2, placeholder: 'Frente de trabajo - km 12+400' },
    { name: 'content', label: 'Contenido tratado', type: 'textarea', span: 2,
      placeholder: 'Puntos cubiertos, controles reforzados, compromisos del equipo...' },
  ]

  const saveTalk = async (v: any) => {
    const payload = {
      service_id: service.id,
      crew_id: v.crew_id || null,
      topic: v.topic,
      content: v.content || null,
      talk_date: v.talk_date,
      start_time: v.start_time || null,
      duration_min: Number(v.duration_min) || 5,
      speaker_id: profile.id,
      speaker_name: v.speaker_name,
      location: v.location || null,
    }
    const { data, error } = talkForm.row
      ? await sb.from('safety_talks').update(payload).eq('id', talkForm.row.id).select('id').single()
      : await sb.from('safety_talks').insert({ ...payload, created_by: profile.id }).select('id').single()
    if (error) { toast.error(error.message); return }
    toast.success(talkForm.row ? 'Charla actualizada' : 'Charla registrada', {
      description: talkForm.row ? undefined : 'Ahora registra la asistencia del equipo.',
    })
    qc.invalidateQueries()
    if (!talkForm.row && data?.id) {
      const { data: full } = await sb.from('safety_talks').select('*, crews(id, name, color)').eq('id', data.id).single()
      setAttendance(full)
    }
  }

  const deleteTalk = async (row: any) => {
    const { error } = await sb.from('safety_talks')
      .update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Charla eliminada')
    qc.invalidateQueries()
  }

  const kpis = useQuery({
    queryKey: ['ssoma-kpis', service.id],
    queryFn: async () => {
      const { data } = await sb.rpc('dashboard_kpis', { p_service_id: service.id, p_from: from })
      return (data as any)?.ssoma ?? {}
    },
  })

  const talks = useQuery({
    queryKey: ['safety-talks', service.id, range.from, range.to, crewFilter],
    queryFn: async () => {
      let query = sb
        .from('safety_talks')
        .select('*, crews(id, name, color)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .gte('talk_date', range.from)
        .lte('talk_date', range.to)
        .order('talk_date', { ascending: false })
        .limit(120)
      if (crewFilter !== 'todas') query = query.eq('crew_id', crewFilter)
      const { data } = await query
      return data ?? []
    },
  })

  const filteredTalks = React.useMemo(() => {
    const all = talks.data ?? []
    if (!q) return all
    const t = q.toLowerCase()
    return all.filter((x: any) =>
      x.topic?.toLowerCase().includes(t) ||
      x.speaker_name?.toLowerCase().includes(t) ||
      x.crews?.name?.toLowerCase().includes(t)
    )
  }, [talks.data, q])

  const checklists = useQuery({
    queryKey: ['checklists', service.id],
    enabled: tab === 'checklists',
    queryFn: async () => {
      const { data } = await sb
        .from('checklist_responses')
        .select('*, checklist_templates(name, category, questions), crews(name, color)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('responded_on', { ascending: false })
        .limit(50)
      return data ?? []
    },
  })

  const ats = useQuery({
    queryKey: ['ats', service.id],
    enabled: tab === 'ats',
    queryFn: async () => {
      const { data } = await sb
        .from('ats_iperc')
        .select('*, crews(name, color), ats_signatures(count)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('doc_date', { ascending: false })
        .limit(40)
      return data ?? []
    },
  })

  const k = kpis.data

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="SSOMA"
        description="Charlas de 5 minutos con asistencia firmada, checklists configurables y ATS/IPERC integrados al flujo diario de la cuadrilla. Todo funciona sin conexión."
        actions={can.write && (
          /* La acción principal sigue a la pestaña abierta: el capataz entra a
             lo que necesita en un solo toque, sin buscar por la pantalla. */
          tab === 'checklists' ? (
            <>
              {can.manage && (
                <Button variant="outline" onClick={() => setTemplates(true)}>
                  <ClipboardCheck className="size-4" />
                  Plantillas
                </Button>
              )}
              <Button variant="accent" onClick={() => setRunner(true)}>
                <Plus className="size-4" />
                Responder checklist
              </Button>
            </>
          ) : tab === 'ats' ? (
            <Button variant="accent" onClick={() => setAtsForm(true)}>
              <Plus className="size-4" />
              Nuevo ATS
            </Button>
          ) : (
            <Button variant="accent" onClick={() => setTalkForm({ open: true })}>
              <Plus className="size-4" />
              Nueva charla
            </Button>
          )
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar por tema, expositor o cuadrilla..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                aria-label="Limpiar"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={crewFilter} onValueChange={setCrewFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Cuadrilla" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las cuadrillas</SelectItem>
              {(crews.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeTabs value={preset} onChange={setPreset} />
        </div>
      </PageHeader>

      <PageBody className="space-y-5">
        {kpis.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index={0} label="Charlas (30 días)" value={Number(k?.charlas ?? 0)} icon={Megaphone} tone="primary" hint={`${fmtNumber(k?.asistentes ?? 0)} asistencias firmadas`} />
            <StatCard index={1} label="Checklists" value={Number(k?.checklists ?? 0)} icon={ClipboardCheck} tone="info" hint="EPP, vehículo, zona de trabajo" />
            <StatCard index={2} label="Con hallazgos" value={Number(k?.hallazgos ?? 0)} icon={TriangleAlert} tone={Number(k?.hallazgos ?? 0) ? 'warning' : 'success'} hint="requieren seguimiento" />
            <StatCard index={3} label="ATS / IPERC" value={Number(k?.ats ?? 0)} icon={HardHat} tone="success" hint="matrices de riesgo firmadas" />
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="charlas"><Megaphone className="size-3.5" />Charlas</TabsTrigger>
            <TabsTrigger value="checklists"><ClipboardCheck className="size-3.5" />Checklists</TabsTrigger>
            <TabsTrigger value="ats"><HardHat className="size-3.5" />ATS / IPERC</TabsTrigger>
          </TabsList>

          {/* ── Charlas ────────────────────────────────────────────────── */}
          <TabsContent value="charlas" className="mt-4">
            {talks.isLoading ? (
              <SkeletonList rows={6} />
            ) : !filteredTalks.length ? (
              <Card><CardContent className="p-0"><EmptyState icon={Megaphone} title="Sin charlas registradas" description="Registra la charla diaria de 5 minutos con la asistencia firmada de la cuadrilla." /></CardContent></Card>
            ) : (
              <ul className="stagger space-y-2">
                {filteredTalks.map((t: any) => (
                  <li key={t.id} className="bg-card group flex items-center gap-3.5 rounded-xl border border-border p-3.5 transition-all hover:border-primary/40 hover:shadow-sm">
                    <button
                      onClick={() => setDetail({ kind: 'talk', data: t })}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    >
                      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                        <Megaphone className="size-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold">{t.topic}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]">
                          <span className="flex items-center gap-1"><Calendar className="size-3" />{fmtDate(t.talk_date)}</span>
                          {t.crews && (
                            <span className="flex items-center gap-1">
                              <span className="size-1.5 rounded-full" style={{ background: t.crews.color }} />
                              {t.crews.name}
                            </span>
                          )}
                          <span>{t.speaker_name}</span>
                          <span>{t.duration_min} min</span>
                        </p>
                      </div>
                      <Badge variant="success" className="shrink-0 gap-1">
                        <Signature className="size-2.5" />
                        {t.attendees_count} firmas
                      </Badge>
                    </button>
                    {can.write && (
                      <span className="flex shrink-0 gap-1">
                        <Tip label="Registrar asistencia">
                          <Button variant="ghost" size="icon-sm" onClick={() => setAttendance(t)}>
                            <Signature className="size-3.5" />
                          </Button>
                        </Tip>
                        <Tip label="Editar">
                          <Button variant="ghost" size="icon-sm" onClick={() => setTalkForm({ open: true, row: t })}>
                            <Pencil className="size-3.5" />
                          </Button>
                        </Tip>
                        {can.manage && (
                          <Tip label="Eliminar">
                            <Button
                              variant="ghost" size="icon-sm"
                              onClick={() => setConfirm({
                                title: 'Eliminar la charla "' + t.topic + '"?',
                                description: 'Se elimina junto con su registro de asistencia.',
                                action: () => deleteTalk(t),
                              })}
                            >
                              <Trash2 className="text-destructive size-3.5" />
                            </Button>
                          </Tip>
                        )}
                      </span>
                    )}
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ── Checklists ─────────────────────────────────────────────── */}
          <TabsContent value="checklists" className="mt-4">
            {checklists.isLoading ? (
              <SkeletonList rows={6} />
            ) : !checklists.data?.length ? (
              <Card><CardContent className="p-0"><EmptyState
                icon={ClipboardCheck}
                title="Sin checklists"
                description="Las plantillas configurables se responden desde el celular, con foto y firma."
                action={can.write && (
                  <Button onClick={() => setRunner(true)}>
                    <Plus className="size-4" />
                    Responder el primero
                  </Button>
                )}
              /></CardContent></Card>
            ) : (
              <ul className="stagger space-y-2">
                {checklists.data.map((c: any) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setDetail({ kind: 'checklist', data: c })}
                      className={cn(
                        'bg-card group flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all hover:shadow-sm',
                        c.has_findings ? 'border-warning/40' : 'border-border hover:border-primary/40'
                      )}
                    >
                      <span className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-lg',
                        c.has_findings ? 'bg-warning/15 text-warning' : 'bg-success/12 text-success'
                      )}>
                        {c.has_findings ? <TriangleAlert className="size-4.5" /> : <CircleCheck className="size-4.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold">{c.checklist_templates?.name}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[11.5px]">
                          <span>{fmtDate(c.responded_on)}</span>
                          {c.crews && <span>{c.crews.name}</span>}
                          <span>{c.checklist_templates?.category}</span>
                        </p>
                        {c.has_findings && (
                          <p className="text-warning mt-0.5 truncate text-[11.5px]">{truncate(c.findings, 90)}</p>
                        )}
                      </div>
                      <div className="w-24 shrink-0">
                        <ProgressBar value={Number(c.score ?? 0)} tone={Number(c.score) >= 90 ? 'success' : 'warning'} />
                      </div>
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ── ATS / IPERC ────────────────────────────────────────────── */}
          <TabsContent value="ats" className="mt-4">
            {ats.isLoading ? (
              <SkeletonList rows={6} />
            ) : !ats.data?.length ? (
              <Card><CardContent className="p-0"><EmptyState
                icon={HardHat}
                title="Sin ATS registrados"
                description="El Análisis de Trabajo Seguro se llena antes de iniciar el frente, con la matriz de riesgos y las firmas del equipo."
                action={can.write && (
                  <Button onClick={() => setAtsForm(true)}>
                    <Plus className="size-4" />
                    Registrar el primero
                  </Button>
                )}
              /></CardContent></Card>
            ) : (
              <ul className="stagger space-y-2">
                {ats.data.map((a: any) => (
                  <li key={a.id}>
                    <button
                      onClick={() => setDetail({ kind: 'ats', data: a })}
                      className="bg-card group flex w-full items-center gap-3.5 rounded-xl border border-border p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                    >
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: `color-mix(in oklch, ${RISK_COLORS[a.max_risk] ?? 'var(--muted)'} 16%, transparent)`,
                          color: RISK_COLORS[a.max_risk],
                        }}
                      >
                        <HardHat className="size-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold">{a.task}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[11.5px]">
                          <span>{fmtDate(a.doc_date)}</span>
                          {a.crews && <span>{a.crews.name}</span>}
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {truncate(a.location, 40)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="capitalize" style={{ color: RISK_COLORS[a.max_risk], borderColor: RISK_COLORS[a.max_risk] }}>
                          Riesgo {a.max_risk}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Signature className="size-2.5" />
                          {a.ats_signatures?.[0]?.count ?? 0}
                        </Badge>
                      </div>
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </PageBody>

      <DetailDialog detail={detail} onClose={() => setDetail(null)} />

      <FormDialog
        open={talkForm.open}
        onOpenChange={(v) => setTalkForm({ open: v, row: v ? talkForm.row : undefined })}
        title={talkForm.row ? 'Editar charla de seguridad' : 'Nueva charla de 5 minutos'}
        description="La charla diaria previa al inicio de actividades. Al guardarla podras registrar quien asistio y su firma."
        fields={talkFields}
        initial={talkForm.row ? {
          ...talkForm.row,
          start_time: talkForm.row.start_time?.slice(0, 5) ?? '07:05',
        } : { speaker_name: profile.full_name }}
        submitLabel={talkForm.row ? 'Guardar cambios' : 'Registrar charla'}
        onSubmit={saveTalk}
      />

      <AttendanceDialog
        talk={attendance}
        onClose={() => setAttendance(null)}
        onDone={() => qc.invalidateQueries()}
      />

      <ChecklistRunner open={runner} onOpenChange={setRunner} />
      <ChecklistTemplates open={templates} onOpenChange={setTemplates} />
      <AtsForm open={atsForm} onOpenChange={setAtsForm} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Si, eliminar"
        onConfirm={async () => { await confirm?.action?.() }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Registro de asistencia: marca quien estuvo y firma por ellos el capataz.
// ═══════════════════════════════════════════════════════════════════════════
function AttendanceDialog({
  talk, onClose, onDone,
}: {
  talk: any
  onClose: () => void
  onDone: () => void
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)
  const [firmas, setFirmas] = React.useState<Record<string, Blob>>({})
  const [firmando, setFirmando] = React.useState<any>(null)

  const roster = useQuery({
    queryKey: ['crew-roster', talk?.crew_id],
    enabled: !!talk?.crew_id,
    queryFn: async () => (await sb.from('crew_members')
      .select('id, full_name, dni, position')
      .eq('crew_id', talk.crew_id).eq('is_active', true).order('position')).data ?? [],
  })

  const already = useQuery({
    queryKey: ['talk-attendance-existing', talk?.id],
    enabled: !!talk?.id,
    queryFn: async () => (await sb.from('talk_attendance')
      .select('crew_member_id, full_name').eq('talk_id', talk.id)).data ?? [],
  })

  React.useEffect(() => {
    if (!talk) { setSelected(new Set()); setFirmas({}); return }
    const ids = new Set((already.data ?? []).map((a: any) => a.crew_member_id).filter(Boolean))
    setSelected(ids as Set<string>)
  }, [talk, already.data])

  const save = async () => {
    if (!talk) return
    setSaving(true)
    const members = (roster.data ?? []).filter((m: any) => selected.has(m.id))

    // Solo se guarda una ruta de firma cuando la firma existe de verdad:
    // un acta con firmas que nadie trazó no sirve ante una fiscalización.
    const rows: any[] = []
    for (const m of members) {
      let path: string | null = null
      const blob = firmas[m.id]
      if (blob) {
        try {
          path = await uploadSignature(service.id, `charlas/${talk.id}`, m.id, blob)
        } catch (e: any) {
          setSaving(false)
          toast.error(e?.message ?? 'No se pudo subir la firma')
          return
        }
      }
      rows.push({
        talk_id: talk.id,
        service_id: service.id,
        crew_member_id: m.id,
        full_name: m.full_name,
        dni: m.dni,
        position: m.position,
        signature_path: path,
        signed_at: new Date().toISOString(),
      })
    }

    const { error } = await sb.from('talk_attendance').upsert(rows, { onConflict: 'talk_id,full_name' })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    const conFirma = rows.filter((r) => r.signature_path).length
    toast.success(rows.length + ' asistencias registradas', {
      description: conFirma
        ? `${conFirma} con firma manuscrita.`
        : 'Sin firma manuscrita: puedes agregarla tocando el lápiz de cada integrante.',
    })
    onDone()
    onClose()
  }

  const all = roster.data ?? []

  return (
    <Dialog open={!!talk} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Registrar asistencia</DialogTitle>
          <DialogDescription>
            {talk ? talk.topic + ' - ' + fmtDate(talk.talk_date) : ''}. Marca quienes asistieron:
            queda su firma con la hora exacta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium">
            {selected.size} de {all.length} integrantes
          </span>
          <Button
            variant="outline" size="sm"
            onClick={() => setSelected(selected.size === all.length ? new Set() : new Set(all.map((m: any) => m.id)))}
          >
            {selected.size === all.length ? 'Desmarcar todos' : 'Marcar todos'}
          </Button>
        </div>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {all.map((m: any) => {
            const on = selected.has(m.id)
            return (
              <li key={m.id}>
                <label className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  on ? 'border-success/40 bg-success/5' : 'border-border hover:bg-secondary/50'
                )}>
                  <Checkbox
                    checked={on}
                    onCheckedChange={() => {
                      const next = new Set(selected)
                      on ? next.delete(m.id) : next.add(m.id)
                      setSelected(next)
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{m.full_name}</span>
                    <span className="text-muted-foreground block text-[11px]">
                      {m.position}{m.dni ? ' - DNI ' + m.dni : ''}
                    </span>
                  </span>
                  {on && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFirmando(m) }}
                      title={firmas[m.id] ? 'Firma registrada · volver a firmar' : 'Firmar'}
                      className={cn(
                        'shrink-0 rounded-md p-1.5 transition-colors',
                        firmas[m.id] ? 'text-success' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {firmas[m.id] ? <Signature className="size-4" /> : <PenLine className="size-4" />}
                    </button>
                  )}
                </label>
              </li>
            )
          })}
          {!all.length && (
            <li className="text-muted-foreground rounded-lg border border-dashed border-border px-3 py-8 text-center text-[12.5px]">
              La cuadrilla no tiene integrantes registrados. Agregalos en Configuracion.
            </li>
          )}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button onClick={save} loading={saving} disabled={!selected.size}>
            <Signature className="size-4" />
            Firmar asistencia ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>

      <SignaturePadDialog
        open={!!firmando}
        onOpenChange={(v) => !v && setFirmando(null)}
        title="Firma de asistencia"
        description="El integrante firma con el dedo su participación en la charla."
        signerName={firmando?.full_name}
        onSigned={(blob) => {
          setFirmas((p) => ({ ...p, [firmando.id]: blob }))
          toast.success(`Firma de ${firmando.full_name} registrada`)
        }}
      />
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function DetailDialog({ detail, onClose }: { detail: any; onClose: () => void }) {
  const sb = React.useMemo(() => createClient(), [])

  const attendance = useQuery({
    queryKey: ['talk-attendance', detail?.data?.id],
    enabled: detail?.kind === 'talk',
    queryFn: async () => {
      const { data } = await sb
        .from('talk_attendance')
        .select('id, full_name, dni, position, signed_at, signature_path')
        .eq('talk_id', detail.data.id)
        .order('full_name')
      const rows = data ?? []

      // Las firmas viven en un bucket privado: se piden URLs firmadas
      const paths = rows.map((r: any) => r.signature_path).filter(Boolean)
      if (paths.length) {
        const { data: urls } = await sb.storage.from('firmas').createSignedUrls(paths, 3600)
        const byPath = new Map((urls ?? []).map((u: any) => [u.path, u.signedUrl]))
        for (const r of rows as any[]) r.signature_url = byPath.get(r.signature_path) ?? null
      }
      return rows
    },
  })

  if (!detail) return null
  const d = detail.data

  return (
    <Dialog open={!!detail} onOpenChange={onClose}>
      <DialogContent size="md">
        {detail.kind === 'talk' && (
          <>
            <DialogHeader>
              <DialogTitle>{d.topic}</DialogTitle>
              <DialogDescription>
                {fmtDate(d.talk_date, 'long')} · {d.start_time?.slice(0, 5)} · {d.duration_min} minutos
              </DialogDescription>
            </DialogHeader>
            <p className="text-[12.5px] leading-relaxed">{d.content}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
              <div><dt className="text-muted-foreground text-[11px]">Expositor</dt><dd className="font-medium">{d.speaker_name}</dd></div>
              <div><dt className="text-muted-foreground text-[11px]">Cuadrilla</dt><dd className="font-medium">{d.crews?.name ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground text-[11px]">Lugar</dt><dd className="font-medium">{d.location}</dd></div>
              <div><dt className="text-muted-foreground text-[11px]">Asistentes</dt><dd className="font-medium">{d.attendees_count}</dd></div>
            </dl>
            <div className="border-border border-t pt-3">
              <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                <Signature className="size-3" />
                Asistencia con firma digital
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {(attendance.data ?? []).map((a: any) => (
                  <li key={a.id} className="bg-muted/50 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px]">
                    <CircleCheck className="text-success size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.full_name}</span>
                      <span className="text-muted-foreground block text-[10.5px]">
                        DNI {a.dni} · {a.position}
                      </span>
                    </span>
                    {a.signature_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={a.signature_url}
                        alt={`Firma de ${a.full_name}`}
                        className="h-8 w-20 shrink-0 object-contain dark:invert"
                      />
                    ) : (
                      <span className="text-muted-foreground shrink-0 text-[10.5px]">sin firma</span>
                    )}
                    <span className="text-muted-foreground shrink-0 text-[10.5px]">
                      {a.signed_at ? new Date(a.signed_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {detail.kind === 'checklist' && (
          <>
            <DialogHeader>
              <DialogTitle>{d.checklist_templates?.name}</DialogTitle>
              <DialogDescription>
                {fmtDate(d.responded_on, 'long')} · {d.crews?.name} · puntaje {Number(d.score).toFixed(1)}%
              </DialogDescription>
            </DialogHeader>
            {d.has_findings && (
              <div className="bg-warning/10 border-warning/25 rounded-lg border px-3 py-2.5">
                <p className="text-warning flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
                  <TriangleAlert className="size-3" />
                  Hallazgo registrado
                </p>
                <p className="mt-1 text-[12.5px]">{d.findings}</p>
              </div>
            )}
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {(d.checklist_templates?.questions ?? []).map((q: any) => {
                const ans = d.answers?.[q.id]
                const isBool = q.type === 'bool'
                return (
                  <li key={q.id} className="flex items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2 text-[12px]">
                    {isBool ? (
                      ans ? <CircleCheck className="text-success mt-0.5 size-3.5 shrink-0" />
                          : <TriangleAlert className="text-destructive mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <ClipboardCheck className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block">{q.label}</span>
                      {!isBool && ans && (
                        <span className="text-muted-foreground block text-[11px]">
                          {q.type === 'photo' ? 'Foto adjunta' : String(ans)}
                        </span>
                      )}
                    </span>
                    {isBool && (
                      <span className={cn('shrink-0 text-[11px] font-semibold', ans ? 'text-success' : 'text-destructive')}>
                        {ans ? 'Conforme' : 'No conforme'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {detail.kind === 'ats' && (
          <>
            <DialogHeader>
              <DialogTitle>{d.task}</DialogTitle>
              <DialogDescription>
                ATS / IPERC · {fmtDate(d.doc_date, 'long')} · {d.location}
              </DialogDescription>
            </DialogHeader>

            <div>
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Matriz de riesgos
              </p>
              <ul className="space-y-2">
                {(d.hazards ?? []).map((h: any, i: number) => (
                  <li key={i} className="bg-muted/40 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold">{h.peligro}</p>
                        <p className="text-muted-foreground text-[11.5px]">Riesgo: {h.riesgo}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 capitalize"
                        style={{ color: RISK_COLORS[h.nivel], borderColor: RISK_COLORS[h.nivel] }}
                      >
                        {h.nivel}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug">
                      <span className="text-muted-foreground">Controles: </span>
                      {h.controles}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[10.5px]">
                      Probabilidad {h.probabilidad} × Severidad {h.severidad} · Responsable: {h.responsable}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-border border-t pt-3">
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                EPP requerido
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(d.ppe ?? []).map((p: string) => (
                  <Badge key={p} variant="secondary">{p}</Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
