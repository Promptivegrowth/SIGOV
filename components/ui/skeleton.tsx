import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('skeleton rounded-md', className)} {...props} />
}

/** Skeleton con la FORMA REAL de una tarjeta de KPI */
function SkeletonKpi() {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-9 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-2 h-3 w-40" />
    </div>
  )
}

/** Skeleton de tabla: filas y columnas reales, no un bloque gris */
function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = [18, 26, 14, 20, 12, 16]
  return (
    <div className="bg-card overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${widths[i % 6]}%` }} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-6 px-4 py-3.5" style={{ opacity: 1 - r * 0.07 }}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3.5" style={{ width: `${widths[c % 6]}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonChart({ className }: { className?: string }) {
  const bars = [42, 68, 35, 82, 55, 74, 48, 90, 62, 38, 71, 58]
  return (
    <div className={cn('bg-card rounded-xl border border-border p-5', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1.5 h-3 w-56" />
      <div className="mt-6 flex h-48 items-end gap-2">
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

function SkeletonMap() {
  return (
    <div className="skeleton relative flex size-full min-h-[400px] items-center justify-center rounded-xl">
      <div className="text-muted-foreground/60 flex flex-col items-center gap-2">
        <svg className="size-10 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <span className="text-xs font-medium">Cargando mapa...</span>
      </div>
    </div>
  )
}

function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-card flex items-center gap-3 rounded-xl border border-border p-4" style={{ opacity: 1 - i * 0.09 }}>
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonKpi, SkeletonTable, SkeletonChart, SkeletonMap, SkeletonList }
