'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * El anillo de porcentaje de las láminas 5.2 y 5.5.
 *
 * Es un SVG y no un gráfico de librería a propósito: son dos arcos y una
 * cifra, y cargar recharts para eso retrasaría el primer pintado del panel
 * sin devolver nada a cambio.
 */
export function Anillo({
  valor,
  etiqueta,
  detalle,
  tamano = 132,
  grosor = 12,
  tono,
  className,
}: {
  /** 0 a 100 */
  valor: number
  etiqueta?: string
  detalle?: string
  tamano?: number
  grosor?: number
  tono?: 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0))
  const radio = (tamano - grosor) / 2
  const circunferencia = 2 * Math.PI * radio

  // Sin tono explícito, el color lo dicta el propio cumplimiento
  const auto = pct >= 85 ? 'success' : pct >= 60 ? 'primary' : pct >= 30 ? 'warning' : 'danger'
  const color = {
    primary: 'var(--primary)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--destructive)',
  }[tono ?? auto]

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: tamano, height: tamano }}>
        <svg
          width={tamano}
          height={tamano}
          viewBox={`0 0 ${tamano} ${tamano}`}
          role="img"
          aria-label={`${etiqueta ?? 'Avance'}: ${Math.round(pct)} por ciento`}
        >
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={grosor}
          />
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            stroke={color}
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={circunferencia}
            strokeDashoffset={circunferencia * (1 - pct / 100)}
            transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold leading-none tabular-nums" style={{ color }}>
            {Math.round(pct)}
            <span className="text-[15px] font-semibold">%</span>
          </span>
          {detalle && (
            <span className="text-muted-foreground mt-1 text-[10.5px] leading-tight">{detalle}</span>
          )}
        </div>
      </div>
      {etiqueta && (
        <span className="text-muted-foreground text-center text-[11.5px] font-medium">
          {etiqueta}
        </span>
      )}
    </div>
  )
}
