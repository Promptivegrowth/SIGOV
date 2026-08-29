'use client'

import * as React from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cn, fmtProgresiva } from '@/lib/utils'
import { SEMAFORO, type Semaforo } from '@/lib/constants'
import { Button } from '@/components/ui/button'

// ─── Estado vacío ─────────────────────────────────────────────────────────
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="bg-secondary text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-sm text-[13px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ─── Semáforo de PCI ──────────────────────────────────────────────────────
export function SemaforoDot({ value, className }: { value: Semaforo; className?: string }) {
  const s = SEMAFORO[value] ?? SEMAFORO.verde
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-4', s.className, s.ring, className)}
      title={s.label}
    />
  )
}

export function SemaforoBadge({ value, days }: { value: Semaforo; days?: number | null }) {
  const s = SEMAFORO[value] ?? SEMAFORO.verde
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        'bg-current/12'
      )}
      style={{ color: `var(--sem-${value})` }}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
      {days != null && value !== 'ok' && (
        <span className="opacity-70 tabular-nums">
          {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
        </span>
      )}
    </span>
  )
}

// ─── Progresiva ───────────────────────────────────────────────────────────
export function Progresiva({
  from,
  to,
  className,
}: {
  from: number | null | undefined
  to?: number | null
  className?: string
}) {
  return (
    <span className={cn('font-mono text-[12px] tabular-nums whitespace-nowrap', className)}>
      {fmtProgresiva(from)}
      {to != null && to !== from && <span className="text-muted-foreground"> → {fmtProgresiva(to)}</span>}
    </span>
  )
}

// ─── Barra de progreso con etiqueta ───────────────────────────────────────
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
  showValue = true,
  tone,
}: {
  value: number
  max?: number
  label?: string
  className?: string
  showValue?: boolean
  tone?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const pct = Math.min((value / (max || 1)) * 100, 100)
  const auto = pct >= 100 ? 'success' : pct >= 60 ? 'primary' : pct >= 30 ? 'warning' : 'danger'
  const t = tone ?? auto
  const colors = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
  }
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          {label && <span className="text-muted-foreground truncate">{label}</span>}
          {showValue && <span className="font-semibold tabular-nums">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', colors[t])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Filtro por rango de fechas (presets) ─────────────────────────────────
export const DATE_PRESETS = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '90d', label: '90 días', days: 90 },
  { key: 'ytd', label: 'Este año', days: 365 },
] as const

export type DatePresetKey = (typeof DATE_PRESETS)[number]['key']

export function DateRangeTabs({
  value,
  onChange,
}: {
  value: DatePresetKey
  onChange: (v: DatePresetKey) => void
}) {
  return (
    <div className="bg-muted inline-flex rounded-lg p-0.5">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
            value === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

export function rangeFromPreset(key: DatePresetKey): { from: string; to: string } {
  const to = new Date()
  const preset = DATE_PRESETS.find((p) => p.key === key) ?? DATE_PRESETS[1]
  const from = key === 'ytd' ? new Date(to.getFullYear(), 0, 1) : new Date(Date.now() - preset.days * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}

// ─── Error de carga con reintento ─────────────────────────────────────────
export function LoadError({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <EmptyState
      title="No se pudieron cargar los datos"
      description={message ?? 'Revisa tu conexión e inténtalo de nuevo.'}
      action={onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>}
    />
  )
}
