'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { SkeletonChart } from '@/components/ui/skeleton'
import { EmptyState, ProgressBar } from '@/components/shared/misc'
import { fmtNumber } from '@/lib/utils'

/**
 * Producción por cuadrilla.
 * El color viene de la ENTIDAD (cada cuadrilla tiene el suyo en la BD),
 * nunca del ranking: reordenar la lista no repinta las barras.
 */
export function CrewChart({
  serviceId,
  from,
  to,
}: {
  serviceId: string
  from: string
  to: string
}) {
  const sb = React.useMemo(() => createClient(), [])

  const { data, isLoading } = useQuery({
    queryKey: ['crew-production', serviceId, from, to],
    queryFn: async () => {
      const { data, error } = await sb.rpc('dashboard_crew_production', {
        p_service_id: serviceId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  if (isLoading) return <SkeletonChart className="h-full" />

  const rows = (data ?? []).map((r) => ({
    ...r,
    metrado: Number(r.metrado) || 0,
    registros: Number(r.registros) || 0,
    evidencias: Number(r.evidencias) || 0,
    dias: Number(r.dias_trabajados) || 0,
    cumplimiento: Number(r.cumplimiento) || 0,
  }))

  if (!rows.length) {
    return (
      <Card className="h-full">
        <CardContent className="p-0">
          <EmptyState icon={Users} title="Sin cuadrillas activas" description="Registra cuadrillas en Configuración para ver su producción." />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">Producción por cuadrilla</CardTitle>
        <CardDescription className="text-[12px]">
          Metrado acumulado y cumplimiento del plan en el periodo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="26%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="crew_name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10.5, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v: string) => v.replace('Cuadrilla ', '').split(' · ')[0]}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10.5, fill: 'var(--muted-foreground)' }}
                width={56}
                tickFormatter={(v) => new Intl.NumberFormat('es-PE', { notation: 'compact' }).format(v)}
              />
              <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<CrewTooltip />} />
              <Bar dataKey="metrado" name="Metrado" radius={[4, 4, 0, 0]} maxBarSize={54}>
                {rows.map((r) => (
                  <Cell key={r.crew_id} fill={r.crew_color || 'var(--chart-1)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detalle por cuadrilla: identidad por nombre + color, nunca solo color */}
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.crew_id} className="flex items-center gap-2.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.crew_color }} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium sm:w-40 sm:flex-none">
                {r.crew_name}
              </span>
              {/* La barra solo cabe a partir de tablet; en celular manda la cifra */}
              <ProgressBar value={r.cumplimiento} className="hidden flex-1 sm:block" showValue={false} />
              <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                {r.cumplimiento.toFixed(0)}%
              </span>
              <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-[11px] tabular-nums sm:block">
                {fmtNumber(r.registros)} reg · {r.dias}d
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function CrewTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="bg-popover rounded-lg border border-border px-3 py-2 shadow-xl">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold">
        <span className="size-2 rounded-full" style={{ background: r.crew_color }} />
        {r.crew_name}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-[11.5px]">
        {[
          ['Metrado', fmtNumber(r.metrado, 1)],
          ['Registros', fmtNumber(r.registros)],
          ['Evidencias', fmtNumber(r.evidencias)],
          ['Días trabajados', fmtNumber(r.dias)],
          ['Cumplimiento', `${r.cumplimiento.toFixed(1)}%`],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-6">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="ml-auto font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
