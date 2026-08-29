'use client'

import * as React from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { Table2, ChartArea } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fmtNumber, fmtDate, cn } from '@/lib/utils'

/**
 * Avance diario: metrado ejecutado (área) contra la meta programada (línea).
 * Un solo eje — las dos series comparten unidad, que es la única forma
 * honesta de superponerlas.
 */
export function ProductionChart({ data }: { data: any[] }) {
  const [view, setView] = React.useState<'chart' | 'table'>('chart')

  const rows = React.useMemo(
    () =>
      data.map((d) => ({
        dia: d.dia,
        label: new Date(`${d.dia}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
        metrado: Number(d.metrado) || 0,
        meta: Number(d.meta) || 0,
        registros: Number(d.registros) || 0,
        evidencias: Number(d.evidencias) || 0,
      })),
    [data]
  )

  const totals = React.useMemo(
    () => ({
      metrado: rows.reduce((s, r) => s + r.metrado, 0),
      meta: rows.reduce((s, r) => s + r.meta, 0),
    }),
    [rows]
  )
  const cumpl = totals.meta > 0 ? (totals.metrado / totals.meta) * 100 : 0

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-[15px]">Avance diario</CardTitle>
          <CardDescription className="text-[12px]">
            Metrado ejecutado contra la meta programada · {cumpl.toFixed(1)}% de cumplimiento
          </CardDescription>
        </div>
        <CardAction>
          <div className="bg-muted inline-flex rounded-lg p-0.5">
            {[
              { k: 'chart' as const, icon: ChartArea, label: 'Gráfico' },
              { k: 'table' as const, icon: Table2, label: 'Tabla' },
            ].map((v) => (
              <button
                key={v.k}
                onClick={() => setView(v.k)}
                aria-label={v.label}
                className={cn(
                  'rounded-md px-2 py-1.5 transition-all',
                  view === v.k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <v.icon className="size-3.5" />
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        {/* Leyenda: la identidad nunca depende solo del color */}
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <LegendItem color="var(--chart-1)" label="Ejecutado" value={fmtNumber(totals.metrado)} />
          <LegendItem color="var(--chart-2)" label="Meta" value={fmtNumber(totals.meta)} dashed />
        </div>

        {view === 'chart' ? (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-metrado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10.5, fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                  minTickGap={22}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10.5, fill: 'var(--muted-foreground)' }}
                  width={56}
                  tickFormatter={(v) => new Intl.NumberFormat('es-PE', { notation: 'compact' }).format(v)}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={<ChartTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="metrado"
                  name="Ejecutado"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#grad-metrado)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                />
                <Line
                  type="monotone"
                  dataKey="meta"
                  name="Meta"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="max-h-[260px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {['Fecha', 'Ejecutado', 'Meta', 'Registros', 'Fotos'].map((h) => (
                    <th key={h} className="text-muted-foreground px-3 py-2 text-left font-medium first:text-left [&:not(:first-child)]:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.dia} className="hover:bg-secondary/40">
                    <td className="px-3 py-1.5">{fmtDate(r.dia)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtNumber(r.metrado, 1)}</td>
                    <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{fmtNumber(r.meta, 1)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.registros}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.evidencias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LegendItem({
  color, label, value, dashed,
}: { color: string; label: string; value?: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 9px)`
            : color,
        }}
      />
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      {value && <span className="text-[12px] font-semibold tabular-nums">{value}</span>}
    </span>
  )
}

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover rounded-lg border border-border px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-[11px] font-semibold">{label}</p>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-[11.5px]">
            <span className="size-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums">{fmtNumber(p.value, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
