'use client'

import * as React from 'react'
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from 'next-themes'
import { Layers, Maximize2, Crosshair } from 'lucide-react'
import { MAP_STYLES, PERU_CENTER, type MapStyleKey } from '@/lib/constants'
import { cn } from '@/lib/utils'

export interface MapCanvasHandle {
  map: MLMap | null
  fitTo: (bounds: [number, number, number, number], padding?: number) => void
  flyTo: (lng: number, lat: number, zoom?: number) => void
}

interface MapCanvasProps {
  className?: string
  initialCenter?: [number, number]
  initialZoom?: number
  styleKey?: MapStyleKey
  showStyleSwitcher?: boolean
  showFullscreen?: boolean
  interactive?: boolean
  onReady?: (map: MLMap) => void
  onStyleChange?: () => void
  children?: React.ReactNode
}

/**
 * Lienzo MapLibre GL.
 * Open source, sin API key ni costo de licencia. Capa satelital de Esri
 * (gratuita) en lugar de Google Maps, tal como se ofreció en la propuesta.
 */
export const MapCanvas = React.forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    className,
    initialCenter = PERU_CENTER,
    initialZoom = 7,
    styleKey: initialStyle = 'calles',
    showStyleSwitcher = true,
    showFullscreen = false,
    interactive = true,
    onReady,
    onStyleChange,
    children,
  },
  ref
) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<MLMap | null>(null)
  const [styleKey, setStyleKey] = React.useState<MapStyleKey>(initialStyle)
  const [loaded, setLoaded] = React.useState(false)
  const { resolvedTheme } = useTheme()

  React.useImperativeHandle(ref, () => ({
    map: mapRef.current,
    fitTo: (bounds, padding = 48) => {
      mapRef.current?.fitBounds(bounds as any, { padding, duration: 900, maxZoom: 15 })
    },
    flyTo: (lng, lat, zoom = 15) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1100 })
    },
  }))

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleKey].style as unknown as StyleSpecification,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      interactive,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        'top-right'
      )
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')
    }

    map.on('load', () => {
      setLoaded(true)
      onReady?.(map)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cambiar estilo base sin perder las capas de datos
  const changeStyle = React.useCallback(
    (key: MapStyleKey) => {
      setStyleKey(key)
      const map = mapRef.current
      if (!map) return
      map.setStyle(MAP_STYLES[key].style as unknown as StyleSpecification)
      map.once('styledata', () => {
        onStyleChange?.()
        onReady?.(map)
      })
    },
    [onReady, onStyleChange]
  )

  return (
    <div className={cn('relative isolate overflow-hidden', className)}>
      <div ref={containerRef} className="size-full" />

      {!loaded && (
        <div className="skeleton absolute inset-0 z-10 flex items-center justify-center">
          <span className="text-muted-foreground text-xs font-medium">Cargando mapa…</span>
        </div>
      )}

      {showStyleSwitcher && (
        <div className="absolute top-3 left-3 z-10">
          <div className="glass flex overflow-hidden rounded-lg border border-border shadow-md">
            {(Object.keys(MAP_STYLES) as MapStyleKey[]).map((k) => (
              <button
                key={k}
                onClick={() => changeStyle(k)}
                className={cn(
                  'px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                  styleKey === k ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                )}
              >
                {MAP_STYLES[k].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {children}
    </div>
  )
})
