'use client'

import * as React from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MapCanvas, type MapCanvasHandle } from '@/components/mapa/map-canvas'
import { fmtNumber } from '@/lib/utils'

/**
 * Mapa compacto del dashboard: tramos del servicio + registros de campo
 * del periodo, agrupados por densidad.
 */
export function MiniMap({ serviceId, from, to }: { serviceId: string; from: string; to: string }) {
  const sb = React.useMemo(() => createClient(), [])
  const mapRef = React.useRef<MapCanvasHandle>(null)
  const [mapReady, setMapReady] = React.useState<MLMap | null>(null)

  const { data } = useQuery({
    queryKey: ['minimap', serviceId, from, to],
    queryFn: async () => {
      const [sections, entries] = await Promise.all([
        sb.rpc('sections_geojson', { p_service_id: serviceId }),
        sb
          .from('v_work_entries')
          .select('id, lat, lng, activity_name, activity_color, quantity, unit_symbol, crew_name, work_date')
          .eq('service_id', serviceId)
          .gte('work_date', from)
          .lte('work_date', to)
          .not('lat', 'is', null)
          .limit(1200),
      ])
      return { sections: sections.data as any, entries: entries.data ?? [] }
    },
  })

  const paint = React.useCallback(
    (map: MLMap) => {
      if (!data) return

      // ── Tramos ─────────────────────────────────────────────────────
      if (data.sections?.features?.length) {
        if (!map.getSource('tramos')) {
          map.addSource('tramos', { type: 'geojson', data: data.sections })
        } else {
          ;(map.getSource('tramos') as any).setData(data.sections)
        }
        if (!map.getLayer('tramos-casing')) {
          map.addLayer({
            id: 'tramos-casing',
            type: 'line',
            source: 'tramos',
            paint: { 'line-color': '#0b1240', 'line-width': 6, 'line-opacity': 0.35 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })
          map.addLayer({
            id: 'tramos-line',
            type: 'line',
            source: 'tramos',
            paint: { 'line-color': ['get', 'color'], 'line-width': 3.2 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })
        }
      }

      // ── Registros de campo ─────────────────────────────────────────
      const points = {
        type: 'FeatureCollection',
        features: (data.entries ?? []).map((e: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
          properties: {
            id: e.id,
            actividad: e.activity_name,
            color: e.activity_color ?? '#2b5bd1',
            cantidad: `${fmtNumber(e.quantity, 1)} ${e.unit_symbol ?? ''}`,
            cuadrilla: e.crew_name ?? '',
            fecha: e.work_date,
          },
        })),
      }

      if (!map.getSource('registros')) {
        map.addSource('registros', {
          type: 'geojson',
          data: points as any,
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 13,
        })
        map.addLayer({
          id: 'reg-cluster',
          type: 'circle',
          source: 'registros',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#2b5bd1',
            'circle-opacity': 0.85,
            'circle-radius': ['step', ['get', 'point_count'], 14, 20, 19, 80, 25],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
        map.addLayer({
          id: 'reg-cluster-count',
          type: 'symbol',
          source: 'registros',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 11,
            'text-font': ['Open Sans Bold'],
          },
          paint: { 'text-color': '#ffffff' },
        })
        map.addLayer({
          id: 'reg-point',
          type: 'circle',
          source: 'registros',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 5,
            'circle-stroke-width': 1.6,
            'circle-stroke-color': '#ffffff',
          },
        })
      } else {
        ;(map.getSource('registros') as any).setData(points)
      }

      // Ajustar el encuadre a los datos
      const coords = (data.entries ?? []).map((e: any) => [e.lng, e.lat])
      if (coords.length) {
        const lngs = coords.map((c: any) => c[0])
        const lats = coords.map((c: any) => c[1])
        map.fitBounds(
          [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as any,
          { padding: 40, duration: 700, maxZoom: 11 }
        )
      }
    },
    [data]
  )

  React.useEffect(() => {
    if (mapReady && data) paint(mapReady)
  }, [mapReady, data, paint])

  return (
    <MapCanvas
      ref={mapRef}
      className="h-[320px] w-full"
      showStyleSwitcher={false}
      onReady={setMapReady}
      onStyleChange={() => mapReady && paint(mapReady)}
    />
  )
}
