'use client'

import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const MIN = 1
const MAX = 6
const PASO = 0.35

/**
 * Imagen con zoom, para mirar una evidencia de verdad.
 *
 * En una foto de obra el detalle importa —si la alcantarilla quedó limpia, si
 * el operario lleva barbiquejo— y a tamaño de pantalla eso no se distingue.
 * Aquí se puede acercar con la rueda, con los botones, con doble toque o
 * pellizcando en el celular, y arrastrar para moverse por la foto.
 */
export function ImageViewer({
  src,
  alt = 'Imagen',
  className,
  descargar,
}: {
  src: string
  alt?: string
  className?: string
  /** Nombre con el que se descarga; si no se pasa, no se ofrece la descarga */
  descargar?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [escala, setEscala] = React.useState(1)
  const [pos, setPos] = React.useState({ x: 0, y: 0 })
  const arrastre = React.useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const punteros = React.useRef<Map<number, { x: number; y: number }>>(new Map())
  const pellizco = React.useRef<{ dist: number; escala: number } | null>(null)

  // Al cambiar de foto se vuelve al tamaño original
  React.useEffect(() => { setEscala(1); setPos({ x: 0, y: 0 }) }, [src])

  const limitar = React.useCallback((e: number) => Math.min(MAX, Math.max(MIN, e)), [])

  /** Acerca o aleja manteniendo fijo el punto donde está el cursor. */
  const zoomEn = (nueva: number, clienteX?: number, clienteY?: number) => {
    const caja = ref.current?.getBoundingClientRect()
    const e = limitar(nueva)
    if (e === 1) { setEscala(1); setPos({ x: 0, y: 0 }); return }
    if (caja && clienteX != null && clienteY != null) {
      const cx = clienteX - caja.left - caja.width / 2
      const cy = clienteY - caja.top - caja.height / 2
      const factor = e / escala
      setPos((p) => ({ x: cx - (cx - p.x) * factor, y: cy - (cy - p.y) * factor }))
    }
    setEscala(e)
  }

  const onWheel = (ev: React.WheelEvent) => {
    ev.preventDefault()
    zoomEn(escala + (ev.deltaY < 0 ? PASO : -PASO), ev.clientX, ev.clientY)
  }

  const onPointerDown = (ev: React.PointerEvent) => {
    ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()]
      pellizco.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), escala }
    } else if (escala > 1) {
      arrastre.current = { x: ev.clientX, y: ev.clientY, px: pos.x, py: pos.y }
    }
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    if (!punteros.current.has(ev.pointerId)) return
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

    // Dos dedos: pellizcar para acercar
    if (punteros.current.size === 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomEn(pellizco.current.escala * (dist / pellizco.current.dist))
      return
    }
    // Un dedo con la foto acercada: desplazarse por ella
    if (arrastre.current) {
      setPos({
        x: arrastre.current.px + (ev.clientX - arrastre.current.x),
        y: arrastre.current.py + (ev.clientY - arrastre.current.y),
      })
    }
  }

  const onPointerUp = (ev: React.PointerEvent) => {
    punteros.current.delete(ev.pointerId)
    if (punteros.current.size < 2) pellizco.current = null
    if (punteros.current.size === 0) arrastre.current = null
  }

  const bajar = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = descargar ?? 'evidencia.jpg'
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div
      ref={ref}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => zoomEn(escala > 1 ? 1 : 2.5, e.clientX, e.clientY)}
      className={cn(
        'relative touch-none overflow-hidden bg-black select-none',
        escala > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="size-full object-contain transition-transform duration-100"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})` }}
      />

      {/* Controles */}
      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/55 p-1 backdrop-blur-sm">
        <Tip label="Alejar">
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white"
            onClick={() => zoomEn(escala - PASO)} disabled={escala <= MIN} aria-label="Alejar">
            <ZoomOut className="size-4" />
          </Button>
        </Tip>
        <span className="min-w-10 text-center text-[11px] font-semibold text-white tabular-nums">
          {Math.round(escala * 100)}%
        </span>
        <Tip label="Acercar">
          <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white"
            onClick={() => zoomEn(escala + PASO)} disabled={escala >= MAX} aria-label="Acercar">
            <ZoomIn className="size-4" />
          </Button>
        </Tip>
        {escala > 1 && (
          <Tip label="Ver completa">
            <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white"
              onClick={() => { setEscala(1); setPos({ x: 0, y: 0 }) }} aria-label="Ver la foto completa">
              <Maximize className="size-4" />
            </Button>
          </Tip>
        )}
        {descargar && (
          <Tip label="Descargar la foto">
            <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white"
              onClick={bajar} aria-label="Descargar la foto">
              <Download className="size-4" />
            </Button>
          </Tip>
        )}
      </div>

      {escala === 1 && (
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] text-white/90 backdrop-blur-sm">
          Doble clic o rueda para acercar · en el celular, pellizca
        </span>
      )}
    </div>
  )
}
