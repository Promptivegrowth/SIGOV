'use client'

import * as React from 'react'
import Link from 'next/link'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fmtNumber } from '@/lib/utils'

/**
 * Semáforo de vencimientos de PCI.
 * Es una paleta de ESTADO, no categórica: verde/ámbar/rojo/vencido tienen
 * significado fijo y van siempre acompañados de etiqueta y cifra.
 */
const SLICES = [
  { key: 'verde', label: 'En plazo', color: 'var(--sem-verde)', hint: 'queda más del 50% del plazo' },
  { key: 'ambar', label: 'Por vencer', color: 'var(--sem-ambar)', hint: 'queda 50% o menos' },
  { key: 'rojo', label: 'Crítico', color: 'var(--sem-rojo)', hint: 'queda 20% o menos' },
  { key: 'vencido', label: 'Vencido', color: 'var(--sem-vencido)', hint: 'pasó la fecha límite' },
  { key: 'ok', label: 'Levantado', color: 'var(--sem-ok)', hint: 'atendido con evidencia' },
] as const

export function SemaforoDonut({ data, total }: { data: Record<string, any>; total: number }) {
  const rows = SLICES.map((s) => ({ ...s, value: Number(data?.[s.key] ?? 0) })).filter((s) => s.value > 0)
  const sum = rows.reduce((a, b) => a + b.value, 0) || 1
  const pendientes = rows.filter((r) => r.key !== 'ok').reduce((a, b) => a + b.value, 0)

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-1">
        <CardTitle className="text-[15px]">Semáforo de PCIs</CardTitle>
        <CardDescription className="text-[12px]">
          {fmtNumber(total)} ítems · {fmtNumber(pendientes)} sin levantar
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <div className="relative h-[168px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="label"
                innerRadius={54}
                outerRadius={78}
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip total={sum} />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Cifra protagonista al centro */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-bold leading-none tabular-nums">{fmtNumber(total)}</span>
            <span className="text-muted-foreground mt-1 text-[10.5px] tracking-wide uppercase">ítems</span>
          </div>
        </div>

        {/* Leyenda con etiqueta + cifra: nunca color solo */}
        <ul className="mt-3 space-y-1.5">
          {SLICES.map((s) => {
            const value = Number(data?.[s.key] ?? 0)
            return (
              <li key={s.key} className="flex items-center gap-2 text-[12px]">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span className="font-semibold tabular-nums">{fmtNumber(value)}</span>
                <span className="text-muted-foreground w-10 text-right text-[10.5px] tabular-nums">
                  {sum ? ((value / sum) * 100).toFixed(0) : 0}%
                </span>
              </li>
            )
          })}
        </ul>

        <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
          <Link href="/pci">
            Gestionar PCIs
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-popover rounded-lg border border-border px-3 py-2 shadow-xl">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold">
        <span className="size-2 rounded-full" style={{ background: p.color }} />
        {p.label}
      </p>
      <p className="mt-0.5 text-[11px]">
        <span className="font-bold tabular-nums">{fmtNumber(p.value)}</span>
        <span className="text-muted-foreground"> ítems · {((p.value / total) * 100).toFixed(1)}%</span>
      </p>
      <p className="text-muted-foreground mt-1 max-w-[180px] text-[10.5px] leading-snug">{p.hint}</p>
    </div>
  )
}
