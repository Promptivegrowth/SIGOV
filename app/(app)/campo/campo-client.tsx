'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  HardHat, Plus, Camera, CircleCheck, Clock, ChevronRight,
  CloudUpload, Users, CalendarDays, Sun, Cloudy, Wind, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SkeletonList, SkeletonKpi } from '@/components/ui/skeleton'
import { EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { StatCard } from '@/components/shared/stat-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WORK_ORDER_STATUS } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, fmtRelative, toISODate } from '@/lib/utils'
import { toast } from 'sonner'

export function CampoClient() {
  const { service, crew, role, can, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [status, setStatus] = React.useState('todos')
  const [q, setQ] = React.useState('')
  const [crewFilter, setCrewFilter] = React.useState('todas')
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])

  const isField = role === 'jefe_cuadrilla'
  const today = toISODate(new Date())

  const crews = useQuery({
    queryKey: ['crews', service.id],
    enabled: !isField,
    queryFn: async () => (await sb.from('crews').select('id, code, name, color')
      .eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? [],
    staleTime: 5 * 60_000,
  })

  const orders = useQuery({
    queryKey: ['work-orders', service.id, crew?.id, isField, range.from, range.to, crewFilter],
    queryFn: async () => {
      let query = sb
        .from('work_orders')
        .select('*, crews(id, name, color), work_entries(count), profiles:created_by(full_name)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .gte('work_date', range.from)
        .lte('work_date', range.to)
        .order('work_date', { ascending: false })
        .limit(150)
      if (isField && crew) query = query.eq('crew_id', crew.id)
      else if (crewFilter !== 'todas') query = query.eq('crew_id', crewFilter)
      const { data } = await query
      return data ?? []
    },
  })

  const stats = useQuery({
    queryKey: ['campo-stats', service.id, crew?.id],
    queryFn: async () => {
      const from = toISODate(new Date(Date.now() - 30 * 86400000))
      const [entries, evidences, pending] = await Promise.all([
        sb.from('work_entries').select('quantity', { count: 'exact' })
          .eq('service_id', service.id).is('deleted_at', null).gte('created_at', from),
        sb.from('evidences').select('id', { count: 'exact', head: true })
          .eq('service_id', service.id).is('deleted_at', null).gte('taken_at', from),
        sb.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('service_id', service.id).eq('status', 'enviado').is('deleted_at', null),
      ])
      const metrado = (entries.data ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0)
      return {
        registros: entries.count ?? 0,
        metrado,
        evidencias: evidences.count ?? 0,
        porValidar: pending.count ?? 0,
      }
    },
  })

  const todayOrder = (orders.data ?? []).find(
    (o: any) => o.work_date === today && (!isField || o.crew_id === crew?.id)
  )

  const filtered = (orders.data ?? []).filter((o: any) => {
    if (status !== 'todos' && o.status !== status) return false
    if (!q) return true
    const s = q.toLowerCase()
    return o.crews?.name?.toLowerCase().includes(s) || o.work_date.includes(s)
  })

  const createToday = async () => {
    if (!crew) return toast.error('Tu usuario no tiene una cuadrilla asignada')
    const { data, error } = await sb
      .from('work_orders')
      .insert({
        service_id: service.id,
        crew_id: crew.id,
        work_date: today,
        status: 'borrador',
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (error) return toast.error(error.message)
    toast.success('Parte diario creado')
    qc.invalidateQueries({ queryKey: ['work-orders'] })
    window.location.href = `/campo/${data.id}`
  }

  return (
    <>
      <PageHeader
        icon={HardHat}
        title={isField ? 'Mi trabajo en campo' : 'Ejecución en campo'}
        description={
          isField
            ? 'Registra actividades, metrados y evidencia fotográfica. Funciona sin conexión: todo se guarda en el dispositivo y se envía al recuperar señal.'
            : 'Partes diarios enviados por las cuadrillas, con su ejecución y evidencia georreferenciada.'
        }
        actions={
          isField && !todayOrder && (
            <Button variant="accent" size="lg" onClick={createToday}>
              <Plus className="size-4" />
              Abrir parte de hoy
            </Button>
          )
        }
      />

      <PageBody className="space-y-5">
        {/* Parte de hoy — acceso directo para campo */}
        {isField && todayOrder && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Link
              href={`/campo/${todayOrder.id}`}
              className="bg-brand-gradient group relative block overflow-hidden rounded-2xl p-5 text-white shadow-lg"
            >
              <div className="bg-mesh absolute inset-0 opacity-50" />
              <div className="relative flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <HardHat className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium tracking-wider text-white/60 uppercase">
                    Parte de hoy · {fmtDate(today, 'long')}
                  </p>
                  <p className="mt-0.5 text-[17px] font-bold">{todayOrder.crews?.name}</p>
                  <p className="text-[12.5px] text-white/70">
                    {todayOrder.work_entries?.[0]?.count ?? 0} registros ·{' '}
                    {WORK_ORDER_STATUS[todayOrder.status as keyof typeof WORK_ORDER_STATUS].label}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </motion.div>
        )}

        {/* KPIs */}
        {stats.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index={0} label="Registros (30 días)" value={stats.data?.registros ?? 0} icon={HardHat} tone="primary" />
            <StatCard index={1} label="Metrado ejecutado" value={stats.data?.metrado ?? 0} decimals={0} icon={CircleCheck} tone="success" />
            <StatCard index={2} label="Evidencias" value={stats.data?.evidencias ?? 0} icon={Camera} tone="info" />
            <StatCard index={3} label="Partes por validar" value={stats.data?.porValidar ?? 0} icon={CloudUpload} tone={stats.data?.porValidar ? 'warning' : 'default'} />
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input placeholder="Buscar cuadrilla o fecha…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(WORK_ORDER_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isField && (
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
          )}
          <DateRangeTabs value={preset} onChange={setPreset} />
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {filtered.length} de {orders.data?.length ?? 0} partes
          </span>
        </div>

        {/* Lista de partes */}
        {orders.isLoading ? (
          <SkeletonList rows={6} />
        ) : !filtered.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={HardHat}
                title="Sin partes diarios"
                description={isField ? 'Abre el parte de hoy para empezar a registrar tu trabajo.' : 'Aún no hay partes enviados por las cuadrillas.'}
                action={isField && <Button variant="accent" onClick={createToday}><Plus className="size-4" />Abrir parte de hoy</Button>}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="stagger space-y-2">
            {filtered.map((o: any) => {
              const st = WORK_ORDER_STATUS[o.status as keyof typeof WORK_ORDER_STATUS]
              return (
                <li key={o.id}>
                  <Link
                    href={`/campo/${o.id}`}
                    className="bg-card group flex items-center gap-3.5 rounded-xl border border-border p-3.5 transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <span
                      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-white"
                      style={{ background: o.crews?.color ?? 'var(--primary)' }}
                    >
                      <span className="text-[15px] font-bold leading-none tabular-nums">
                        {new Date(`${o.work_date}T12:00:00`).getDate()}
                      </span>
                      <span className="text-[8.5px] uppercase opacity-80">
                        {new Date(`${o.work_date}T12:00:00`).toLocaleDateString('es-PE', { month: 'short' })}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{o.crews?.name ?? 'Cuadrilla'}</p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {fmtDate(o.work_date, 'long')}
                        </span>
                        <span>{o.work_entries?.[0]?.count ?? 0} registros</span>
                        {o.weather && (
                          <span className="flex items-center gap-1">
                            <WeatherIcon w={o.weather} />
                            {o.weather}
                          </span>
                        )}
                        {o.headcount && (
                          <span className="flex items-center gap-1">
                            <Users className="size-3" />
                            {o.headcount}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge className={st.className}>{st.label}</Badge>
                      {o.reviewed_at && (
                        <span className="text-muted-foreground text-[10px]">
                          revisado {fmtRelative(o.reviewed_at)}
                        </span>
                      )}
                    </div>

                    <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>
    </>
  )
}

function WeatherIcon({ w }: { w: string }) {
  const s = w.toLowerCase()
  if (s.includes('despej')) return <Sun className="size-3" />
  if (s.includes('vent')) return <Wind className="size-3" />
  return <Cloudy className="size-3" />
}
