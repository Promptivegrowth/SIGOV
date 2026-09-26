'use client'

import * as React from 'react'
import Image from 'next/image'
import maplibregl, { type Map as MLMap } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  X, Filter, Camera, CalendarClock, MapPin, History, ChevronDown, Layers, ClipboardList, Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { MapCanvas, type MapCanvasHandle } from '@/components/mapa/map-canvas'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, fmtNumber, fmtProgresiva } from '@/lib/utils'
import { ASSET_CONDITION } from '@/lib/constants'

/**
 * El inventario sobre la carretera.
 *
 * Es lo que pidió Elvis para sus supervisores de tramo: abrir el mapa,
 * filtrar por alcantarillas, y que cada punto diga cuándo se intervino por
 * última vez y enseñe la foto. Lo que está rojo es lo que hace tiempo que
 * nadie toca, y esa es la lista de trabajo del día siguiente.
 *
 * El color del punto no es el estado de conservación sino el **tiempo sin
 * intervenir**, que es la pregunta que se hace el supervisor cuando planifica
 * su recorrido. El estado de conservación va dentro de la ficha.
 */

const SEMAFOROS = {
  al_dia: { label: 'Al día', color: '#16a34a', ayuda: 'Intervenido dentro de su frecuencia' },
  por_vencer: { label: 'Por vencer', color: '#f59e0b', ayuda: 'Se acerca el plazo de intervención' },
  critico: { label: 'Crítico', color: '#dc2626', ayuda: 'Pasó su plazo de intervención' },
  sin_intervenir: { label: 'Sin intervenir', color: '#64748b', ayuda: 'Nunca se registró una intervención' },
} as const

type ClaveSemaforo = keyof typeof SEMAFOROS

/**
 * La fecha que se enseña bajo una foto.
 *
 * Las del Inventario Vial 2024 casi nunca traen la fecha en que se
 * tomaron: se recortaron y perdieron los metadatos, y al guardarlas se les
 * puso la de emisión del tomo para no dejar el dato vacío. Enseñar esa
 * fecha bajo la foto sería decir algo que no se sabe. Se dice lo que sí:
 * que es del inventario de ese año.
 */
function fechaDeFoto(ruta: string | null | undefined, fecha: string | null | undefined, caption?: string | null) {
  const inv = ruta ? /\/inventario-(\d{4})\//.exec(ruta) : null
  if (inv) {
    const sinFecha = !caption || /sin fecha/i.test(caption)
    return sinFecha ? `Inventario ${inv[1]}` : `${fmtDate(fecha)} · inventario ${inv[1]}`
  }
  return fecha ? fmtDate(fecha) : 'Sin fecha'
}

/** El valor de un campo del inventario, legible. */
function valorDe(campo: { key: string; type: string }, v: any): string | null {
  if (v == null || v === '') return null
  if (campo.key === 'uso') return v === 'en_uso' ? 'En uso' : v === 'en_desuso' ? 'En desuso' : String(v)
  if (campo.type === 'date') return fmtDate(v)
  if (campo.type === 'bool') return v ? 'Sí' : 'No'
  if (campo.type === 'number') return fmtNumber(Number(v), Number.isInteger(Number(v)) ? 0 : 2)
  return String(v)
}

const TODOS = '__todos__'

export function MapaDeInventario() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const mapaRef = React.useRef<MapCanvasHandle>(null)
  const [mapa, setMapa] = React.useState<MLMap | null>(null)

  const [tramo, setTramo] = React.useState(TODOS)
  const [tipos, setTipos] = React.useState<Set<string>>(new Set())
  const [semaforos, setSemaforos] = React.useState<Set<ClaveSemaforo>>(new Set())
  const [elegido, setElegido] = React.useState<any | null>(null)
  const [panel, setPanel] = React.useState(true)

  // ── Los tramos, para acotar la vista a «mi tramo» ────────────────────
  const tramos = useQuery({
    queryKey: ['tramos-inventario', service.id],
    queryFn: async () => {
      const { data } = await sb.from('road_sections')
        .select('id, code, name').eq('service_id', service.id)
        .is('deleted_at', null).eq('is_active', true).order('code')
      return data ?? []
    },
    staleTime: 10 * 60_000,
  })

  // ── El resumen que alimenta los filtros ──────────────────────────────
  const resumen = useQuery({
    queryKey: ['inventario-resumen', service.id, tramo],
    queryFn: async () => {
      const { data, error } = await sb.rpc('inventario_resumen', {
        p_service_id: service.id,
        p_section_id: tramo === TODOS ? undefined : tramo,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  // ── Los puntos del mapa ──────────────────────────────────────────────
  const puntos = useQuery({
    queryKey: ['inventario-mapa', service.id, tramo, [...tipos].sort().join(','), [...semaforos].sort().join(',')],
    queryFn: async () => {
      const { data, error } = await sb.rpc('assets_geojson', {
        p_service_id: service.id,
        p_type_codes: tipos.size ? [...tipos] : undefined,
        p_conditions: undefined,
        p_semaforos: semaforos.size ? [...semaforos] : undefined,
        p_section_id: tramo === TODOS ? undefined : tramo,
      })
      if (error) throw error
      return data as any
    },
  })

  // ── Lo que se abre al elegir un elemento ─────────────────────────────
  // Las dos fotos de la comparación, todas las demás, y los datos que el
  // inventario oficial registra de ese tipo de elemento.
  const fotos = useQuery({
    queryKey: ['inventario-fotos', elegido?.id],
    enabled: !!elegido?.id,
    queryFn: async () => {
      const [{ data }, { data: activo }, { data: vinculos }] = await Promise.all([
        sb.from('v_inventario')
          .select('foto_actual, foto_actual_fecha, foto_anterior, foto_anterior_fecha, condition, intervenciones, visitas, dias_sin_intervenir, ultima_intervencion, dias_entre_fotos')
          .eq('id', elegido.id).single(),
        sb.from('road_assets')
          .select('progresiva_fin_m, attributes, asset_types(schema)')
          .eq('id', elegido.id).single(),
        sb.from('evidence_links')
          .select('evidences(id, storage_path, thumb_path, taken_at, caption, phase)')
          .eq('asset_id', elegido.id),
      ])
      if (!data) return null

      const galeria = ((vinculos ?? []) as any[])
        .map((v) => v.evidences)
        .filter((e) => e && e.storage_path)
        .sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)))

      // Se firma la miniatura cuando la hay —la ficha es pequeña y en
      // carretera cada foto grande son 150 KB— y la grande para ampliar.
      const rutas = new Set<string>()
      for (const r of [data.foto_actual, data.foto_anterior]) if (r) rutas.add(r)
      for (const g of galeria) { rutas.add(g.storage_path); if (g.thumb_path) rutas.add(g.thumb_path) }
      const urls = new Map<string, string>()
      if (rutas.size) {
        const { data: firmadas } = await sb.storage.from('evidencias').createSignedUrls([...rutas], 3600)
        for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl)
      }
      const caption = new Map(galeria.map((g) => [g.storage_path, g.caption as string | null]))
      const mini = new Map(galeria.map((g) => [g.storage_path, g.thumb_path as string | null]))
      const firmar = (ruta: string | null) => (ruta ? urls.get(ruta) ?? null : null)

      return {
        ...data,
        urlActual: firmar(data.foto_actual),
        miniActual: firmar(mini.get(data.foto_actual) ?? data.foto_actual),
        urlAnterior: firmar(data.foto_anterior),
        miniAnterior: firmar(mini.get(data.foto_anterior) ?? data.foto_anterior),
        captionActual: caption.get(data.foto_actual) ?? null,
        captionAnterior: caption.get(data.foto_anterior) ?? null,
        galeria: galeria.map((g) => ({
          id: g.id,
          url: firmar(g.storage_path),
          mini: firmar(g.thumb_path ?? g.storage_path),
          ruta: g.storage_path as string,
          fecha: g.taken_at as string | null,
          caption: g.caption as string | null,
        })),
        progresivaFin: (activo as any)?.progresiva_fin_m as number | null,
        atributos: ((activo as any)?.attributes ?? {}) as Record<string, any>,
        campos: (((activo as any)?.asset_types?.schema ?? []) as { key: string; label: string; type: string }[]),
      }
    },
  })

  // ── El historial de intervenciones ───────────────────────────────────
  const historial = useQuery({
    queryKey: ['inventario-historial', elegido?.id],
    enabled: !!elegido?.id,
    queryFn: async () => {
      const { data } = await sb.from('asset_interventions')
        .select('id, intervened_on, action, notes, crews(name)')
        .eq('asset_id', elegido.id)
        .order('intervened_on', { ascending: false })
        .limit(12)
      return data ?? []
    },
  })

  // ── Dibujar ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapa || !puntos.data) return
    const vacio = { type: 'FeatureCollection', features: [] }

    if (!mapa.getSource('src-inv')) {
      mapa.addSource('src-inv', { type: 'geojson', data: puntos.data ?? vacio })

      mapa.addLayer({
        id: 'l-inv',
        type: 'circle',
        source: 'src-inv',
        paint: {
          'circle-color': [
            'match', ['get', 'semaforo'],
            'al_dia', SEMAFOROS.al_dia.color,
            'por_vencer', SEMAFOROS.por_vencer.color,
            'critico', SEMAFOROS.critico.color,
            SEMAFOROS.sin_intervenir.color,
          ],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3.5, 12, 7, 16, 11],
          'circle-stroke-width': 1.6,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.94,
        },
      })

      mapa.on('click', 'l-inv', (e) => {
        const f = e.features?.[0]
        if (f) setElegido(f.properties)
      })
      mapa.on('mouseenter', 'l-inv', () => { mapa.getCanvas().style.cursor = 'pointer' })
      mapa.on('mouseleave', 'l-inv', () => { mapa.getCanvas().style.cursor = '' })
    } else {
      ;(mapa.getSource('src-inv') as any).setData(puntos.data ?? vacio)
    }
  }, [mapa, puntos.data])

  // Al cambiar de tramo, el mapa va a ese tramo
  React.useEffect(() => {
    if (!mapa || !puntos.data?.features?.length) return
    const coords = puntos.data.features.map((f: any) => f.geometry.coordinates)
    const lngs = coords.map((c: any) => c[0])
    const lats = coords.map((c: any) => c[1])
    mapaRef.current?.fitTo([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], 60)
  }, [mapa, tramo, puntos.data])

  const alternar = <T,>(conjunto: Set<T>, valor: T, fijar: (s: Set<T>) => void) => {
    const n = new Set(conjunto)
    n.has(valor) ? n.delete(valor) : n.add(valor)
    fijar(n)
  }

  const totales = React.useMemo(() => {
    const r = resumen.data ?? []
    return {
      total: r.reduce((s, x) => s + Number(x.total), 0),
      al_dia: r.reduce((s, x) => s + Number(x.al_dia), 0),
      por_vencer: r.reduce((s, x) => s + Number(x.por_vencer), 0),
      critico: r.reduce((s, x) => s + Number(x.critico), 0),
      sin_intervenir: r.reduce((s, x) => s + Number(x.sin_intervenir), 0),
    }
  }, [resumen.data])

  const visibles = puntos.data?.features?.length ?? 0

  return (
    <div className="relative h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-xl border border-border">
      <MapCanvas
        ref={mapaRef}
        onReady={setMapa}
        className="absolute inset-0"
        initialZoom={6}
        showFullscreen
      />

      {/* ═══ El panel de filtros ═══════════════════════════════════════ */}
      <div className="absolute top-3 left-3 z-10 w-[286px] max-w-[calc(100%-1.5rem)]">
        <Card className="bg-card/97 shadow-lg backdrop-blur">
          <button
            onClick={() => setPanel((v) => !v)}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
          >
            <Filter className="text-primary size-4" />
            <span className="flex-1 text-[13px] font-semibold">Filtros del inventario</span>
            <ChevronDown className={cn('text-muted-foreground size-4 transition-transform', !panel && '-rotate-90')} />
          </button>

          {panel && (
            <CardContent className="max-h-[calc(100dvh-20rem)] space-y-3.5 overflow-y-auto px-3.5 pt-0 pb-3.5">
              {/* El tramo: «mi tramo» es la pregunta del supervisor */}
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">
                  Tramo
                </p>
                <Select value={tramo} onValueChange={setTramo}>
                  <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todo el contrato</SelectItem>
                    {(tramos.data ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.code} · {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* El semáforo de intervención */}
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">
                  Tiempo sin intervenir
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(SEMAFOROS) as ClaveSemaforo[]).map((k) => {
                    const s = SEMAFOROS[k]
                    const activo = semaforos.has(k)
                    const n = totales[k]
                    return (
                      <button
                        key={k}
                        onClick={() => alternar(semaforos, k, setSemaforos)}
                        title={s.ayuda}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all',
                          activo ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'
                        )}
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium leading-tight">{s.label}</span>
                          <span className="text-muted-foreground block text-[10.5px] leading-tight tabular-nums">
                            {fmtNumber(n)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Los componentes del inventario */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">
                    Componente
                  </p>
                  {tipos.size > 0 && (
                    <button
                      onClick={() => setTipos(new Set())}
                      className="text-muted-foreground hover:text-foreground text-[10.5px]"
                    >
                      Ver todos
                    </button>
                  )}
                </div>

                {resumen.isLoading ? (
                  <SkeletonList rows={5} />
                ) : (
                  <div className="space-y-1">
                    {(resumen.data ?? []).map((t: any) => {
                      const activo = tipos.has(t.type_code)
                      const criticos = Number(t.critico) + Number(t.sin_intervenir)
                      return (
                        <button
                          key={t.type_code}
                          onClick={() => alternar(tipos, t.type_code, setTipos)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all',
                            activo ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'
                          )}
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: t.color ?? 'var(--chart-2)' }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium leading-tight">
                              {t.type_name}
                            </span>
                            <span className="text-muted-foreground block text-[10.5px] leading-tight">
                              {t.category}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[11.5px] font-semibold tabular-nums">
                              {fmtNumber(Number(t.total))}
                            </span>
                            {criticos > 0 && (
                              <span className="block text-[10px] font-medium tabular-nums text-[#dc2626]">
                                {fmtNumber(criticos)} por atender
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="text-muted-foreground border-t border-border pt-2.5 text-[11px]">
                Se ven <strong className="text-foreground">{fmtNumber(visibles)}</strong> de{' '}
                {fmtNumber(totales.total)} elementos.
              </p>
            </CardContent>
          )}
        </Card>
      </div>

      {/* ═══ La ficha del elemento ═════════════════════════════════════ */}
      <AnimatePresence>
        {elegido && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-3 right-3 bottom-3 z-10 w-[330px] max-w-[calc(100%-1.5rem)]"
          >
            <Card className="bg-card/97 flex h-full flex-col overflow-hidden shadow-xl backdrop-blur">
              {/* Cabecera */}
              <div className="flex items-start gap-2 border-b border-border px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{elegido.name || elegido.type_name}</p>
                  <p className="text-muted-foreground truncate text-[11.5px]">
                    {elegido.code} · {elegido.type_name}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setElegido(null)}>
                  <X className="size-4" />
                </Button>
              </div>

              <div className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
                {/* El semáforo, que es lo que trae al supervisor aquí */}
                <div
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                  style={{
                    background: `color-mix(in oklch, ${SEMAFOROS[(elegido.semaforo as ClaveSemaforo) ?? 'sin_intervenir'].color} 12%, transparent)`,
                  }}
                >
                  <CalendarClock
                    className="size-4 shrink-0"
                    style={{ color: SEMAFOROS[(elegido.semaforo as ClaveSemaforo) ?? 'sin_intervenir'].color }}
                  />
                  <div className="min-w-0">
                    <p
                      className="text-[12.5px] font-semibold leading-tight"
                      style={{ color: SEMAFOROS[(elegido.semaforo as ClaveSemaforo) ?? 'sin_intervenir'].color }}
                    >
                      {SEMAFOROS[(elegido.semaforo as ClaveSemaforo) ?? 'sin_intervenir'].label}
                    </p>
                    <p className="text-muted-foreground text-[11.5px] leading-tight">
                      {elegido.ultima_intervencion
                        ? `Última intervención el ${fmtDate(elegido.ultima_intervencion)} · hace ${elegido.dias} días`
                        : 'Nunca se registró una intervención'}
                    </p>
                  </div>
                </div>

                {/* Dónde está */}
                <div className="grid grid-cols-2 gap-2">
                  <Dato
                    etiqueta="Progresiva"
                    valor={
                      fotos.data?.progresivaFin != null && fotos.data.progresivaFin !== elegido.progresiva_m
                        ? `${elegido.progresiva} → ${fmtProgresiva(fotos.data.progresivaFin)}`
                        : elegido.progresiva ?? '—'
                    }
                  />
                  <Dato etiqueta="Lado" valor={elegido.side ?? '—'} />
                  <Dato etiqueta="Tramo" valor={elegido.section ?? '—'} ancho />
                  <Dato
                    etiqueta="Conservación"
                    valor={ASSET_CONDITION[elegido.condition as keyof typeof ASSET_CONDITION]?.label ?? elegido.condition ?? '—'}
                  />
                  <Dato etiqueta="Intervenciones" valor={String(elegido.intervenciones ?? 0)} />
                </div>

                {/* Lo que el inventario oficial registra de este tipo de elemento */}
                {fotos.data && fotos.data.campos.some((c) => valorDe(c, fotos.data!.atributos[c.key]) != null) && (
                  <div>
                    <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase">
                      <ClipboardList className="size-3" />
                      Datos del inventario
                    </p>
                    <dl className="divide-border divide-y rounded-lg border border-border">
                      {fotos.data.campos.map((c) => {
                        const v = valorDe(c, fotos.data!.atributos[c.key])
                        if (v == null) return null
                        return (
                          <div key={c.key} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                            <dt className="text-muted-foreground text-[11px]">{c.label}</dt>
                            <dd className="text-right text-[12px] font-medium">{v}</dd>
                          </div>
                        )
                      })}
                    </dl>
                  </div>
                )}

                {/* Cuando la coordenada del Excel no era de fiar */}
                {fotos.data?.atributos?.ubicacion === 'progresiva' && (
                  <p className="text-muted-foreground flex gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-2 text-[11px] leading-snug">
                    <Info className="mt-px size-3.5 shrink-0" />
                    <span>
                      Ubicado por su progresiva sobre la vía oficial.
                      {fotos.data.atributos.motivo_ubicacion
                        ? ` La coordenada del inventario quedaba ${fotos.data.atributos.motivo_ubicacion}.`
                        : ''}
                    </span>
                  </p>
                )}

                {/* Las dos fotos: cómo está y cómo estaba */}
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase">
                      <Camera className="size-3" />
                      Fotografías
                    </p>
                    {/* El plazo entre las dos visitas: lo que se lee al comparar */}
                    {fotos.data?.dias_entre_fotos != null && (
                      <span className="text-muted-foreground text-[10.5px]">
                        {fotos.data.dias_entre_fotos} días entre una y otra
                      </span>
                    )}
                  </div>

                  {fotos.isLoading ? (
                    <SkeletonList rows={2} />
                  ) : !fotos.data?.urlActual ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11.5px]">
                      Todavía no hay fotografías de este elemento. Aparecerán cuando una
                      cuadrilla registre trabajo en esta progresiva.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Foto
                        titulo="Ahora"
                        url={fotos.data.urlActual}
                        mini={fotos.data.miniActual}
                        pie={fechaDeFoto(fotos.data.foto_actual, fotos.data.foto_actual_fecha, fotos.data.captionActual)}
                        fecha={fotos.data.foto_actual_fecha}
                        destacada
                      />
                      {fotos.data.urlAnterior ? (
                        <Foto
                          titulo="Antes"
                          url={fotos.data.urlAnterior}
                          mini={fotos.data.miniAnterior}
                          pie={fechaDeFoto(fotos.data.foto_anterior, fotos.data.foto_anterior_fecha, fotos.data.captionAnterior)}
                          fecha={fotos.data.foto_anterior_fecha}
                        />
                      ) : (
                        <div className="text-muted-foreground flex aspect-square items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-[10.5px]">
                          Todavía no hay una visita anterior con la que comparar
                        </div>
                      )}
                    </div>
                  )}

                  {/* Todas las demás: las tres vistas de una alcantarilla, las
                      calzadas de un peaje. La comparación enseña dos; aquí
                      están todas. */}
                  {fotos.data && fotos.data.galeria.length > 1 && (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1 text-[10.5px]">
                        Todas las fotos del elemento · {fotos.data.galeria.length}
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {fotos.data.galeria.map((g) => (
                          <Foto
                            key={g.id}
                            url={g.url}
                            mini={g.mini}
                            fecha={g.fecha}
                            pie={null}
                            titulo={(g.caption ?? '').split(' · ')[1] ?? 'Foto'}
                            chica
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* El historial */}
                <div>
                  <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase">
                    <History className="size-3" />
                    Últimas intervenciones
                  </p>
                  {historial.isLoading ? (
                    <SkeletonList rows={3} />
                  ) : !historial.data?.length ? (
                    <p className="text-muted-foreground text-[11.5px]">Sin intervenciones registradas.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {historial.data.map((h: any) => (
                        <li key={h.id} className="flex items-start gap-2 text-[11.5px]">
                          <span className="bg-primary/60 mt-1.5 size-1.5 shrink-0 rounded-full" />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{fmtDate(h.intervened_on)}</span>
                            <span className="text-muted-foreground"> · {h.action}</span>
                            {h.crews?.name && (
                              <span className="text-muted-foreground block truncate text-[11px]">
                                {h.crews.name}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ La leyenda ════════════════════════════════════════════════ */}
      <div className="bg-card/95 absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 shadow-md backdrop-blur">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          Tiempo sin intervenir
        </span>
        {(Object.keys(SEMAFOROS) as ClaveSemaforo[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px]">
            <span className="size-2.5 rounded-full" style={{ background: SEMAFOROS[k].color }} />
            {SEMAFOROS[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ═══ Piezas ═══════════════════════════════════════════════════════════

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <div className={cn('bg-secondary/50 rounded-lg px-2.5 py-1.5', ancho && 'col-span-2')}>
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{etiqueta}</p>
      <p className="truncate text-[12.5px] font-medium">{valor}</p>
    </div>
  )
}

/**
 * Una de las dos fotos de la comparación.
 *
 * La fecha va debajo porque es la mitad del dato: una foto de mayo y otra de
 * ayer dicen algo distinto a dos del mismo día.
 */
function Foto({
  titulo, url, mini, fecha, pie, destacada, chica,
}: {
  titulo: string
  url: string | null
  /** La miniatura para la ficha; la grande se carga solo al ampliar. */
  mini?: string | null
  fecha?: string | null
  /** Lo que va bajo la foto; null para no poner nada. */
  pie?: string | null
  destacada?: boolean
  chica?: boolean
}) {
  const [abierta, setAbierta] = React.useState(false)
  if (!url) return null

  return (
    <>
      <button onClick={() => setAbierta(true)} className="group text-left">
        <div
          className={cn(
            'bg-secondary relative aspect-square overflow-hidden rounded-lg border',
            destacada ? 'border-primary/40' : 'border-border'
          )}
        >
          <Image src={mini ?? url} alt={titulo} fill sizes={chica ? '72px' : '160px'} unoptimized
            className="object-cover transition-transform group-hover:scale-[1.04]" />
          {!chica && (
            <span
              className={cn(
                'absolute top-1 left-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold text-white',
                destacada ? 'bg-primary/90' : 'bg-black/60'
              )}
            >
              {titulo}
            </span>
          )}
        </div>
        {pie !== null && (
          <p className="text-muted-foreground mt-1 text-[10.5px]">
            {pie ?? (fecha ? fmtDate(fecha) : 'Sin fecha')}
          </p>
        )}
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
          onClick={() => setAbierta(false)}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] font-medium text-white">
              {titulo}
              {(pie ?? (fecha ? fmtDateTime(fecha) : null)) && (
                <span className="ml-2 text-white/60">{pie ?? fmtDateTime(fecha!)}</span>
              )}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setAbierta(false)}>
              <X className="size-5 text-white" />
            </Button>
          </div>
          <div className="relative mx-4 mb-4 flex-1">
            <Image src={url} alt={titulo} fill className="object-contain" unoptimized />
          </div>
        </div>
      )}
    </>
  )
}
