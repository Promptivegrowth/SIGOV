'use client'

import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIN_WEBGL } from '@/lib/webgl'

/**
 * Lo que ocupa el lugar del mapa cuando el navegador no puede dibujarlo.
 *
 * Dice qué pasa y cómo arreglarlo, en vez de dejar un hueco gris. La
 * alternativa que había antes era que la plataforma entera se cayera.
 */
export function SinMapa({
  className,
  compacto = false,
}: {
  className?: string
  compacto?: boolean
}) {
  return (
    <div
      className={cn(
        'border-border bg-muted/30 flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center',
        className
      )}
      role="status"
    >
      <MapPinOff className="text-muted-foreground size-6" aria-hidden />
      <p className="text-sm font-medium">{SIN_WEBGL.titulo}</p>
      {!compacto && (
        <p className="text-muted-foreground max-w-sm text-[12px] leading-relaxed">
          {SIN_WEBGL.detalle}
        </p>
      )}
    </div>
  )
}
