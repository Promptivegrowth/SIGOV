'use client'

import * as React from 'react'
import maplibregl, { type Map as MLMap, Popup } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Layers, Route, Boxes, Camera, TriangleAlert, HardHat,
  ChevronDown, X, Filter, Eye, EyeOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { MapCanvas } from '@/components/mapa/map-canvas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/primitives'
import { DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { SEMAFORO, ASSET_CONDITION } from '@/lib/constants'
import { cn, fmtNumber, fmtDate } from '@/lib/utils'

interface LayerDef {
  key: 'tramos' | 'inventario' | 'evidencias' | 'pci' | 'registros'
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  module?: string
  defaultOn: boolean
}

const LAYERS: LayerDef[] = [
  { key: 'tramos', label: 'Tramos viales', icon: Route, color: 'var(--chart-1)', defaultOn: true },
  { key: 'registros', label: 'Ejecución en campo', icon: HardHat, color: 'var(--chart-4)', module: 'campo', defaultOn: true },
  { key: 'pci', label: 'Ítems de PCI', icon: TriangleAlert, color: 'var(--sem-rojo)', module: 'pci', defaultOn: false },
  { key: 'inventario', label: 'Inventario vial', icon: Boxes, color: 'var(--chart-2)', module: 'inventario', defaultOn: false },
  { key: 'evidencias', label: 'Evidencias GPS', icon: Camera, color: 'var(--chart-3)', module: 'campo', defaultOn: false },
]

export function MapaClient() {
  const { service, hasModule } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [map, setMap] = React.useState<MLMap | null>(null)
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const [panelOpen, setPanelOpen] = React.useState(true)
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])

  const available = LAYERS.filter((l) => !l.module || hasModule(l.module))
  const [active, setActive] = React.useState<Set<string>>(
    () => new Set(available.filter((l) => l.defaultOn).map((l) => l.key))
  )

  const popupRef = React.useRef<Popup | null>(null)

  // ── Datos ─────────────────────────────────────────────────────────────
  const q = useQuery({
    queryKey: ['mapa', service.id, range.from, range.to, [...active].sort().join(',')],
    queryFn: async () => {
      const calls: Record<string, PromiseLike<any>> = {}
      calls.tramos = sb.rpc('sections_geojson', { p_service_id: service.id })
      if (active.has('registros'))
        calls.registros = sb.rpc('work_entries_geojson', {
          p_service_id: service.id, p_from: range.from, p_to: range.to,
        })
      if (active.has('pci')) calls.pci = sb.rpc('pci_geojson', { p_service_id: service.id })
      if (active.has('inventario')) calls.inventario = sb.rpc('assets_geojson', { p_service_id: service.id })
      if (active.has('evidencias'))
        calls.evidencias = sb.rpc('evidences_geojson', {
          p_service_id: service.id, p_from: range.from, p_to: range.to,
        })

      const keys = Object.keys(calls)
      const results = await Promise.all(Object.values(calls))
      const out: Record<string, any> = {}
      keys.forEach((k, i) => (out[k] = results[i].data))
      return out
    },
  })

  // ── Pintado de capas ──────────────────────────────────────────────────
  const paint = React.useCallback(
    (m: MLMap) => {
      if (!q.data) return
      const empty = { type: 'FeatureCollection', features: [] }

      const setSource = (id: string, data: any) => {
        if (m.getSource(id)) (m.getSource(id) as any).setData(data ?? empty)
        else m.addSource(id, { type: 'geojson', data: data ?? empty })
      }

      // ── Tramos ──────────────────────────────────────────────────────
      setSource('src-tramos', q.data.tramos)
      if (!m.getLayer('l-tramos-casing')) {
        m.addLayer({
          id: 'l-tramos-casing', type: 'line', source: 'src-tramos',
          paint: { 'line-color': '#08102e', 'line-width': 8, 'line-opacity': 0.4 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        m.addLayer({
          id: 'l-tramos', type: 'line', source: 'src-tramos',
          paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        m.addLayer({
          id: 'l-tramos-label', type: 'symbol', source: 'src-tramos',
          layout: {
            'symbol-placement': 'line-center',
            'text-field': ['get', 'name'],
            'text-size': 11.5,
            'text-font': ['Open Sans Bold'],
            'text-offset': [0, -1.1],
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#08102e', 'text-halo-width': 1.6 },
        })
      }

      // ── Inventario (clustering: miles de elementos) ─────────────────
      if (active.has('inventario')) {
        if (!m.getSource('src-assets')) {
          m.addSource('src-assets', {
            type: 'geojson', data: q.data.inventario ?? empty,
            cluster: true, clusterRadius: 46, clusterMaxZoom: 14,
          })
          m.addLayer({
            id: 'l-assets-cluster', type: 'circle', source: 'src-assets',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#0e8a94', 'circle-opacity': 0.88,
              'circle-radius': ['step', ['get', 'point_count'], 15, 25, 21, 100, 28, 400, 34],
              'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
            },
          })
          m.addLayer({
            id: 'l-assets-count', type: 'symbol', source: 'src-assets',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 11, 'text-font': ['Open Sans Bold'],
            },
            paint: { 'text-color': '#ffffff' },
          })
          m.addLayer({
            id: 'l-assets', type: 'circle', source: 'src-assets',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': 6,
              'circle-stroke-width': 1.8,
              'circle-stroke-color': [
                'match', ['get', 'condition'],
                'critico', '#7f1d1d', 'malo', '#dc2626', 'regular', '#f59e0b', '#ffffff',
              ],
            },
          })
        } else {
          ;(m.getSource('src-assets') as any).setData(q.data.inventario ?? empty)
        }
      }

      // ── PCIs ────────────────────────────────────────────────────────
      if (active.has('pci')) {
        setSource('src-pci', q.data.pci)
        if (!m.getLayer('l-pci')) {
          m.addLayer({
            id: 'l-pci', type: 'circle', source: 'src-pci',
            paint: {
              'circle-color': [
                'match', ['get', 'semaforo'],
                'vencido', '#7f1d1d', 'rojo', '#dc2626', 'ambar', '#f59e0b',
                'verde', '#16a34a', 'ok', '#0891a8', '#64748b',
              ],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 14, 9],
              'circle-stroke-width': 1.6,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.92,
            },
          })
        }
      }

      // ── Registros de campo ──────────────────────────────────────────
      if (active.has('registros')) {
        if (!m.getSource('src-reg')) {
          m.addSource('src-reg', {
            type: 'geojson', data: q.data.registros ?? empty,
            cluster: true, clusterRadius: 40, clusterMaxZoom: 13,
          })
          m.addLayer({
            id: 'l-reg-cluster', type: 'circle', source: 'src-reg',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#2b5bd1', 'circle-opacity': 0.85,
              'circle-radius': ['step', ['get', 'point_count'], 14, 20, 19, 80, 25],
              'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
            },
          })
          m.addLayer({
            id: 'l-reg-count', type: 'symbol', source: 'src-reg',
            filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Open Sans Bold'] },
            paint: { 'text-color': '#ffffff' },
          })
          m.addLayer({
            id: 'l-reg', type: 'circle', source: 'src-reg',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': ['get', 'color'], 'circle-radius': 5.5,
              'circle-stroke-width': 1.6, 'circle-stroke-color': '#ffffff',
            },
          })
        } else {
          ;(m.getSource('src-reg') as any).setData(q.data.registros ?? empty)
        }
      }

      // ── Evidencias ──────────────────────────────────────────────────
      if (active.has('evidencias')) {
        setSource('src-ev', q.data.evidencias)
        if (!m.getLayer('l-ev')) {
          m.addLayer({
            id: 'l-ev', type: 'circle', source: 'src-ev',
            paint: {
              'circle-color': '#c67700', 'circle-radius': 3.6,
              'circle-opacity': 0.75, 'circle-stroke-width': 0.8, 'circle-stroke-color': '#ffffff',
            },
          })
        }
      }

      // Visibilidad según los interruptores
      const vis = (id: string, on: boolean) => {
        if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      }
      vis('l-tramos', active.has('tramos'))
      vis('l-tramos-casing', active.has('tramos'))
      vis('l-tramos-label', active.has('tramos'))
      ;['l-assets', 'l-assets-cluster', 'l-assets-count'].forEach((id) => vis(id, active.has('inventario')))
      ;['l-reg', 'l-reg-cluster', 'l-reg-count'].forEach((id) => vis(id, active.has('registros')))
      vis('l-pci', active.has('pci'))
      vis('l-ev', active.has('evidencias'))

      // Encuadre inicial a los tramos
      const feats = q.data.tramos?.features ?? []
      if (feats.length && !m.getBounds().getNorth()) return
      if (feats.length) {
        const coords = feats.flatMap((f: any) => f.geometry?.coordinates ?? [])
        if (coords.length) {
          const lngs = coords.map((c: any) => c[0])
          const lats = coords.map((c: any) => c[1])
          m.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as any, {
            padding: { top: 60, bottom: 60, left: panelOpen ? 340 : 60, right: 60 },
            duration: 800,
            maxZoom: 12,
          })
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, active]
  )

  React.useEffect(() => {
    if (map && q.data) paint(map)
  }, [map, q.data, paint])

  // ── Interacción ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!map) return
    const clickable = ['l-assets', 'l-reg', 'l-pci', 'l-tramos', 'l-ev']

    const onClick = (e: any) => {
      const f = e.features?.[0]
      if (!f) return
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ maxWidth: '300px', closeButton: true })
        .setLngLat(f.geometry.type === 'Point' ? f.geometry.coordinates : e.lngLat)
        .setHTML(popupHtml(f.layer.id, f.properties))
        .addTo(map)
    }
    const onEnter = () => (map.getCanvas().style.cursor = 'pointer')
    const onLeave = () => (map.getCanvas().style.cursor = '')

    clickable.forEach((id) => {
      if (!map.getLayer(id)) return
      map.on('click', id, onClick)
      map.on('mouseenter', id, onEnter)
      map.on('mouseleave', id, onLeave)
    })

    // Zoom al hacer clic en un clúster
    const clusterLayers = ['l-assets-cluster', 'l-reg-cluster']
    const onCluster = (e: any) => {
      const f = e.features?.[0]
      if (!f) return
      map.easeTo({ center: f.geometry.coordinates, zoom: map.getZoom() + 2.2, duration: 500 })
    }
    clusterLayers.forEach((id) => map.getLayer(id) && map.on('click', id, onCluster))

    return () => {
      clickable.forEach((id) => {
        if (!map.getLayer(id)) return
        map.off('click', id, onClick)
        map.off('mouseenter', id, onEnter)
        map.off('mouseleave', id, onLeave)
      })
      clusterLayers.forEach((id) => map.getLayer(id) && map.off('click', id, onCluster))
    }
  }, [map, q.data, active])

  const counts = {
    tramos: q.data?.tramos?.features?.length ?? 0,
    registros: q.data?.registros?.features?.length ?? 0,
    pci: q.data?.pci?.features?.length ?? 0,
    inventario: q.data?.inventario?.features?.length ?? 0,
    evidencias: q.data?.evidencias?.features?.length ?? 0,
  }

  return (
    <div className="relative h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)]">
      <MapCanvas className="size-full" onReady={setMap} onStyleChange={() => map && paint(map)} initialZoom={7} />

      {/* Panel de capas */}
      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute top-16 bottom-4 left-3 z-10 flex w-[300px] flex-col overflow-hidden rounded-xl border border-border shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Layers className="size-4" />
                Capas del mapa
              </h2>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
                aria-label="Ocultar panel"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-3">
                <p className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                  Periodo
                </p>
                <DateRangeTabs value={preset} onChange={setPreset} />
              </div>

              <ul className="space-y-1">
                {available.map((l) => {
                  const on = active.has(l.key)
                  const n = counts[l.key as keyof typeof counts] ?? 0
                  return (
                    <li key={l.key}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors',
                          on ? 'bg-secondary/70' : 'hover:bg-secondary/40'
                        )}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `color-mix(in oklch, ${l.color} 18%, transparent)`, color: l.color }}
                        >
                          <l.icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium leading-tight">{l.label}</span>
                          <span className="text-muted-foreground block text-[11px] tabular-nums leading-tight">
                            {on ? `${fmtNumber(n)} elementos` : 'oculta'}
                          </span>
                        </span>
                        <Switch
                          checked={on}
                          onCheckedChange={(v) => {
                            const next = new Set(active)
                            v ? next.add(l.key) : next.delete(l.key)
                            setActive(next)
                          }}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>

              {/* Leyendas de estado */}
              {active.has('pci') && (
                <Legend
                  title="Semáforo de PCI"
                  items={(['verde', 'ambar', 'rojo', 'vencido', 'ok'] as const).map((k) => ({
                    label: SEMAFORO[k].label,
                    color: `var(--sem-${k})`,
                  }))}
                />
              )}
              {active.has('inventario') && (
                <Legend
                  title="Estado del elemento"
                  items={(['bueno', 'regular', 'malo', 'critico'] as const).map((k) => ({
                    label: ASSET_CONDITION[k].label,
                    color: ASSET_CONDITION[k].dot,
                  }))}
                  note="El relleno indica el tipo de elemento; el borde, su estado de conservación."
                />
              )}
            </div>

            <div className="text-muted-foreground border-t border-border px-4 py-2.5 text-[10.5px] leading-snug">
              MapLibre GL + OpenStreetMap · capa satelital Esri. Sin costo de licencia ni API key.
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {!panelOpen && (
        <Button
          className="absolute top-16 left-3 z-10 shadow-lg"
          size="sm"
          onClick={() => setPanelOpen(true)}
        >
          <Layers className="size-4" />
          Capas
        </Button>
      )}

      {q.isFetching && (
        <div className="glass absolute top-4 right-4 z-10 flex items-center gap-2 rounded-lg border border-border px-3 py-2 shadow-md">
          <span className="border-primary size-3 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="text-[11.5px] font-medium">Cargando capas…</span>
        </div>
      )}
    </div>
  )
}

function Legend({
  title, items, note,
}: { title: string; items: { label: string; color: string }[]; note?: string }) {
  return (
    <div className="border-border mt-3 border-t pt-3">
      <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">{title}</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-[11.5px]">
            <span className="size-2.5 rounded-full" style={{ background: i.color }} />
            {i.label}
          </li>
        ))}
      </ul>
      {note && <p className="text-muted-foreground mt-2 text-[10.5px] leading-snug">{note}</p>}
    </div>
  )
}

function popupHtml(layerId: string, p: any): string {
  const esc = (s: any) => String(s ?? '—').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const row = (k: string, v: any) =>
    `<div style="display:flex;gap:12px;justify-content:space-between;font-size:11.5px;padding:1px 0">
       <span style="opacity:.6">${esc(k)}</span><span style="font-weight:600;text-align:right">${esc(v)}</span></div>`

  const head = (title: string, sub?: string) =>
    `<div style="padding:12px 14px 8px">
       <div style="font-size:13px;font-weight:700;line-height:1.25">${esc(title)}</div>
       ${sub ? `<div style="font-size:11px;opacity:.65;margin-top:2px">${esc(sub)}</div>` : ''}
     </div>`

  const body = (rows: string) => `<div style="padding:0 14px 12px">${rows}</div>`

  switch (layerId) {
    case 'l-tramos':
      return head(p.name, `${p.route ?? ''} · ${p.length_km} km`) +
        body(row('Progresivas', `${p.prog_start / 1000}+000 → ${p.prog_end / 1000}+000`) +
             row('Superficie', p.surface) + row('Carriles', p.lanes))
    case 'l-assets':
      return head(p.name ?? p.code, `${p.type_name} · ${p.code}`) +
        body(row('Tramo', p.section) + row('Progresiva', p.progresiva) +
             row('Lado', p.side) + row('Estado', p.condition) +
             row('Última inspección', p.last_inspected ? fmtDate(p.last_inspected) : '—'))
    case 'l-reg':
      return head(p.actividad, `${p.cuadrilla ?? ''} · ${p.fecha ? fmtDate(p.fecha) : ''}`) +
        body(row('Tramo', p.tramo) + row('Progresiva', p.progresiva) +
             row('Metrado', `${p.cantidad} ${p.unidad ?? ''}`) + row('Evidencias', p.evidencias))
    case 'l-pci':
      return head(`${p.pci_code} · ítem ${p.item}`, p.descripcion) +
        body(row('Tramo', p.section) + row('Progresiva', p.progresiva) +
             row('Vence', p.due_date ? fmtDate(p.due_date) : '—') +
             row('Días restantes', p.days_left) + row('Estado', p.status))
    case 'l-ev':
      return head(p.activity ?? 'Evidencia', `${p.phase ?? ''} · ${p.crew ?? ''}`) +
        body(row('Progresiva', p.progresiva) + row('Precisión', `±${Number(p.accuracy ?? 0).toFixed(0)} m`) +
             row('Capturada', p.taken_at ? fmtDate(p.taken_at) : '—'))
    default:
      return head('Elemento')
  }
}
