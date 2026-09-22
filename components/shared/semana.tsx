'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startOfWeek, toISODate, addDays, isoWeek, cn } from '@/lib/utils'

/**
 * La semana como unidad de trabajo.
 *
 * El contrato se programa por semanas, no por rangos sueltos: el supervisor
 * publica el plan el lunes y lo cierra el domingo. Por eso el panel y la
 * programación se mueven de semana en semana y no con un selector de fechas
 * libre, que obligaría a recordar qué lunes tocaba.
 */
export interface Semana {
  /** Lunes, en ISO */
  from: string
  /** Domingo, en ISO */
  to: string
  /** Número de semana ISO */
  numero: number
  /** "08 – 14 set 2026" */
  etiqueta: string
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

export function semanaDe(fecha: Date | string = new Date()): Semana {
  const base = typeof fecha === 'string' ? new Date(`${fecha}T12:00:00`) : fecha
  const lunes = startOfWeek(base)
  const domingo = addDays(lunes, 6)

  // Si la semana cruza de mes, el mes se dice en ambos extremos
  const mismoMes = lunes.getMonth() === domingo.getMonth()
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0')
  const etiqueta = mismoMes
    ? `${dd(lunes)} – ${dd(domingo)} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`
    : `${dd(lunes)} ${MESES[lunes.getMonth()]} – ${dd(domingo)} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`

  return {
    from: toISODate(lunes),
    to: toISODate(domingo),
    numero: isoWeek(lunes),
    etiqueta,
  }
}

/** ¿Esa semana es la que se está viviendo? */
export function esSemanaActual(s: Semana): boolean {
  return s.from === semanaDe().from
}

export function useSemana() {
  const [semana, setSemana] = React.useState<Semana>(() => semanaDe())
  const mover = React.useCallback((n: number) => {
    setSemana((s) => semanaDe(addDays(s.from, n * 7)))
  }, [])
  const volverAHoy = React.useCallback(() => setSemana(semanaDe()), [])
  return { semana, mover, volverAHoy }
}

export function SelectorDeSemana({
  semana,
  onMover,
  onHoy,
  className,
}: {
  semana: Semana
  onMover: (n: number) => void
  onHoy: () => void
  className?: string
}) {
  const actual = esSemanaActual(semana)

  return (
    <div
      className={cn(
        'bg-card flex items-center gap-1 rounded-lg border border-border p-1',
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => onMover(-1)}
        aria-label="Semana anterior"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <button
        type="button"
        onClick={onHoy}
        disabled={actual}
        className="min-w-[150px] px-1 text-center disabled:cursor-default"
        // Al pulsar la etiqueta se vuelve a la semana en curso: es el gesto
        // que la gente intenta primero cuando se pierde navegando
        title={actual ? 'Semana en curso' : 'Volver a la semana en curso'}
      >
        <span className="block text-[12.5px] font-semibold leading-tight">{semana.etiqueta}</span>
        <span className="text-muted-foreground block text-[10.5px] leading-tight">
          {actual ? 'Semana en curso' : `Semana ${semana.numero}`}
        </span>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => onMover(1)}
        aria-label="Semana siguiente"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
