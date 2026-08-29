'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ShieldCheck, Megaphone, ClipboardCheck, HardHat, Signature,
  Users, TriangleAlert, CircleCheck, Plus, Calendar, MapPin, ChevronRight,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, fmtDate, fmtNumber, fmtRelative, truncate } from '@/lib/utils'

const RISK_COLORS: Record<string, string> = {
  trivial: 'var(--sem-verde)',
  tolerable: 'var(--sem-verde)',
  moderado: 'var(--sem-ambar)',
  importante: 'var(--sem-rojo)',
  intolerable: 'var(--sem-vencido)',
}

export function SsomaClient() {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState('charlas')
  const [detail, setDetail] = React.useState<any>(null)
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const kpis = useQuery({
    queryKey: ['ssoma-kpis', service.id],
    queryFn: async () => {
      const { data } = await sb.rpc('dashboard_kpis', { p_service_id: service.id, p_from: from })
      return (data as any)?.ssoma ?? {}
    },
  })

  const talks = useQuery({
    queryKey: ['safety-talks', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('safety_talks')
        .select('*, crews(name, color)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('talk_date', { ascending: false })
        .limit(40)
      return data ?? []
    },
  })

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
          <Button variant="accent">
            <Plus className="size-4" />
            Nueva charla
          </Button>
        )}
      />

      <PageBody className="space-y-5">
        {kpis.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            ) : !talks.data?.length ? (
              <Card><CardContent className="p-0"><EmptyState icon={Megaphone} title="Sin charlas registradas" description="Registra la charla diaria de 5 minutos con la asistencia firmada de la cuadrilla." /></CardContent></Card>
            ) : (
              <ul className="stagger space-y-2">
                {talks.data.map((t: any) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setDetail({ kind: 'talk', data: t })}
                      className="bg-card group flex w-full items-center gap-3.5 rounded-xl border border-border p-3.5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
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
                      <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </button>
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
              <Card><CardContent className="p-0"><EmptyState icon={ClipboardCheck} title="Sin checklists" description="Las plantillas configurables se responden desde el celular, con foto y firma." /></CardContent></Card>
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
              <Card><CardContent className="p-0"><EmptyState icon={HardHat} title="Sin ATS registrados" description="El Análisis de Trabajo Seguro se llena antes de iniciar el frente, con la matriz de riesgos y las firmas del equipo." /></CardContent></Card>
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
    </>
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
        .select('id, full_name, dni, position, signed_at')
        .eq('talk_id', detail.data.id)
        .order('full_name')
      return data ?? []
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
