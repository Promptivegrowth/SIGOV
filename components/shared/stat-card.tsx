'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'
import { cn, fmtNumber } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: number | string
  unit?: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  trend?: number | null
  trendLabel?: string
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  href?: string
  decimals?: number
  sparkline?: number[]
  index?: number
}

const TONES = {
  default: { icon: 'bg-secondary text-secondary-foreground', value: 'text-foreground', accent: 'var(--muted-foreground)' },
  primary: { icon: 'bg-primary/10 text-primary', value: 'text-foreground', accent: 'var(--primary)' },
  success: { icon: 'bg-success/12 text-success', value: 'text-foreground', accent: 'var(--success)' },
  warning: { icon: 'bg-warning/15 text-warning', value: 'text-foreground', accent: 'var(--warning)' },
  danger: { icon: 'bg-destructive/12 text-destructive', value: 'text-destructive', accent: 'var(--destructive)' },
  info: { icon: 'bg-info/12 text-info', value: 'text-foreground', accent: 'var(--info)' },
}

/** Contador que anima desde 0 — hace que el dashboard se sienta vivo */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = React.useState(0)
  React.useEffect(() => {
    if (!Number.isFinite(target)) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export function StatCard({
  label, value, unit, hint, icon: Icon, trend, trendLabel,
  tone = 'default', href, decimals = 0, sparkline, index = 0,
}: StatCardProps) {
  const numeric = typeof value === 'number' ? value : null
  const animated = useCountUp(numeric ?? 0)
  const t = TONES[tone]

  const TrendIcon = trend == null ? Minus : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendColor =
    trend == null || trend === 0 ? 'text-muted-foreground' : trend > 0 ? 'text-success' : 'text-destructive'

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'bg-card group relative overflow-hidden rounded-xl border border-border p-5 transition-all',
        href && 'hover:border-primary/40 cursor-pointer hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground text-[11.5px] font-medium tracking-wide uppercase">
          {label}
        </span>
        {Icon && (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', t.icon)}>
            <Icon className="size-4.5" />
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-baseline gap-1.5">
        <span className={cn('text-[28px] font-bold leading-none tracking-tight tabular-nums', t.value)}>
          {numeric != null ? fmtNumber(animated, decimals) : value}
        </span>
        {unit && <span className="text-muted-foreground text-sm font-medium">{unit}</span>}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {trend != null && (
          <span className={cn('flex items-center gap-0.5 text-[11.5px] font-semibold tabular-nums', trendColor)}>
            <TrendIcon className="size-3" />
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {(hint || trendLabel) && (
          <span className="text-muted-foreground truncate text-[11.5px]">{trendLabel ?? hint}</span>
        )}
        {href && (
          <ArrowRight className="text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        )}
      </div>

      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={t.accent} />}
    </motion.div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 100
  const h = 28
  const step = w / (data.length - 1)
  const points = data.map((d, i) => `${i * step},${h - ((d - min) / range) * h}`).join(' ')
  const area = `0,${h} ${points} ${w},${h}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-7 w-full" aria-hidden="true">
      <polygon points={area} fill={color} opacity="0.1" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
