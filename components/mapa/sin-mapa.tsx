'use client'

import * as React from 'react'
import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIN_WEBGL, diagnosticarWebGL } from '@/lib/webgl'

/**
 * Lo que ocupa el lugar del mapa cuando el navegador no puede dibujarlo.
 *
 * Dice qué pasa y por dónde mirar, en vez de dejar un hueco gris. La
 * alternativa que había antes era que la plataforma entera se cayera.
 *
 * Abajo, plegado, va el motivo exacto que dio el navegador. Ahí es donde
 * está la respuesta de verdad —«GL_VENDOR = Disabled», «BindToCurrentSequence
 * failed»— y tenerlo a la vista evita la ronda de preguntas de siempre.
 */
export function SinMapa({
  className,
  compacto = false,
}: {
  className?: string
  compacto?: boolean
}) {
  // En el servidor no hay navegador al que preguntarle, así que el motivo
  // se averigua ya montado.
  const [motivo, setMotivo] = React.useState<string | undefined>()
  React.useEffect(() => setMotivo(diagnosticarWebGL().motivo), [])

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
        <>
          <p className="text-muted-foreground max-w-md text-[12px] leading-relaxed">
            {SIN_WEBGL.detalle}
          </p>

          {motivo && (
            <details className="max-w-md">
              <summary className="text-muted-foreground cursor-pointer text-[11px]">
                Qué dice el navegador
              </summary>
              <p className="bg-muted text-muted-foreground mt-2 rounded-lg p-2 text-left text-[11px] leading-relaxed break-words">
                {motivo}
              </p>
            </details>
          )}
        </>
      )}
    </div>
  )
}
