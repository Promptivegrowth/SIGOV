'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * El isotipo en movimiento.
 *
 * Las tres figuras del logotipo de Servicon no están puestas una al lado de
 * otra: giran una detrás de otra, y esa idea —el ciclo que no se detiene— es
 * la que se anima aquí. Cada pieza recorre el círculo con un tercio de
 * retraso respecto de la anterior, de modo que el ojo lee un flujo y no tres
 * cosas parpadeando a la vez.
 *
 * Las piezas son recortes del logotipo oficial, no un dibujo parecido: se
 * separaron por color del mismo PNG que se entrega al cliente, así que al
 * detenerse la animación queda exactamente la marca.
 */

const PIEZAS = [
  { archivo: '/marca/piezas/azul.png', retraso: '0s' },
  { archivo: '/marca/piezas/verde.png', retraso: '-0.6s' },
  { archivo: '/marca/piezas/naranja.png', retraso: '-1.2s' },
]

export function LogoEnMovimiento({
  size = 96,
  className,
  /** Detiene el giro: para quien pidió menos movimiento en su sistema */
  quieto = false,
}: {
  size?: number
  className?: string
  quieto?: boolean
}) {
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: Math.round((size * 472) / 531) }}
      role="img"
      aria-label="Cargando SIGOV"
    >
      <div className={cn('absolute inset-0', !quieto && 'sigov-orbita')}>
        {PIEZAS.map((p) => (
          <img
            key={p.archivo}
            src={p.archivo}
            alt=""
            aria-hidden
            className={cn('absolute inset-0 h-full w-full object-contain', !quieto && 'sigov-pieza')}
            style={{ animationDelay: p.retraso }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * La pantalla de carga del sistema.
 *
 * Aparece mientras se resuelve la sesión y se bajan los datos del contrato.
 * Dice qué está haciendo —no solo que espere— porque en obra la conexión es
 * mala y un cartel mudo durante ocho segundos parece una aplicación colgada.
 */
export function PantallaDeCarga({
  mensaje = 'Preparando tu espacio de trabajo',
  className,
}: {
  mensaje?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7',
        'bg-[oklch(0.245_0.080_256)] text-white',
        className
      )}
    >
      <LogoEnMovimiento size={112} />

      <div className="flex flex-col items-center gap-2.5">
        <p className="text-[26px] font-bold leading-none tracking-tight">
          SIGO<span className="text-[oklch(0.72_0.19_140)]">V</span>
        </p>
        <p className="text-[12px] font-medium tracking-[0.18em] text-white/55 uppercase">
          Gestión Operativa Vial
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="sigov-barra h-[3px] w-40 overflow-hidden rounded-full bg-white/12" />
        <p className="text-[12.5px] text-white/60">{mensaje}</p>
      </div>
    </div>
  )
}

/** El mismo giro, en tamaño de botón: para esperas dentro de una pantalla. */
export function CargandoEnLinea({
  mensaje,
  className,
}: {
  mensaje?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <LogoEnMovimiento size={56} />
      {mensaje && <p className="text-muted-foreground text-[12.5px]">{mensaje}</p>}
    </div>
  )
}
