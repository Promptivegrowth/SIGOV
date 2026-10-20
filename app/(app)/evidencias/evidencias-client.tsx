'use client'

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import {
  Camera, Search, X, MapPin, Clock, CalendarDays, Download, ChevronDown, ChevronRight, ChevronLeft,
  FileText, ListChecks, FolderOpen, Folder, Image as ImageIcon, ArrowDownUp, Info,
} from 'lucide-react'
import { createClient, fetchAll } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState, Progresiva } from '@/components/shared/misc'
import { ImageViewer } from '@/components/shared/image-viewer'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox, Tip } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { fmtDate, fmtDateTime, fmtNumber, toISODate, addDays, cn } from '@/lib/utils'
import { codigoDeLado } from '@/lib/lados'
import {
  armarExportacion, esFotoPci, fechaDeFoto, nombreDeExportacion, rutasDeExportacion,
  type FotoExportable, type OpcionesDeExportacion, type AvanceDeExportacion,
} from '@/lib/exportar-evidencias'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Evidencias (apartado 4.13), según los bocetos de Elvis del 13/10/2026.
 *
 * Fecha inicio y fin (con atajos Hoy, 7, 15 y 30 días), origen MR o PCI y
 * cada PCI por separado, y un buscador que sugiere actividades y PCI. Sin
 * filtro de etapa: nadie baja solo las fotos del «antes» (Elvis); las etapas
 * se ven como contadores A · D · DP.
 *
 * Las fotos se agrupan como se revisan: cada PCI con sus ítems, y lo de la
 * programación (MR) por día y actividad. El jefe de cuadrilla solo mira lo
 * suyo; el supervisor, el administrador, el visor COVINCA y SSOMA exportan
 * el ZIP con la estructura de carpetas.
 */

const COLUMNAS = [
  'id', 'storage_path', 'thumb_path', 'master_path', 'master_bytes', 'phase', 'work_date', 'fecha_sello', 'taken_at',
  'origen', 'crew_id', 'crew_numero', 'crew_sede', 'crew_code', 'crew_name', 'activity_id', 'activity_code',
  'activity_name', 'activity_carpeta_ns', 'sector_code', 'sector_folder', 'section_name', 'progresiva_m', 'side',
  'pci_id', 'pci_code', 'pci_item_id', 'pci_item_number', 'pci_term_days', 'revision', 'revision_nota', 'caption',
  'lat', 'lng',
].join(', ')

type Foto = FotoExportable & {
  thumb_path: string | null
  master_bytes: number | null
  crew_id: string | null
  activity_id: string | null
  section_name: string | null
  pci_id: string | null
  pci_item_id: string | null
  caption: string | null
  lat: number | null
  lng: number | null
}

type Origen = 'todos' | 'mr' | 'pci'

/** «PCI-2026-044» → «PCI 44»: el año se sobreentiende (Elvis). */
const pciCorto = (codigo: string) => {
  const m = codigo.match(/^PCI-\d{4}-0*(\d+)$/i)
  return m ? `PCI ${m[1]}` : codigo
}

const ATAJOS = [
  { label: 'Hoy', dias: 0 },
  { label: '7 días', dias: 6 },
  { label: '15 días', dias: 14 },
  { label: '30 días', dias: 29 },
]

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase()

/** A · D · DP de un grupo de fotos. */
function etapas(fotos: Foto[]) {
  return {
    a: fotos.filter((f) => f.phase === 'antes').length,
    d: fotos.filter((f) => f.phase === 'durante').length,
    dp: fotos.filter((f) => f.phase === 'despues').length,
  }
}

export function EvidenciasClient() {
  const { service, crew, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const hoy = toISODate(new Date())
  const [desde, setDesde] = React.useState(toISODate(addDays(new Date(), -6)))
  const [hasta, setHasta] = React.useState(hoy)
  const [origen, setOrigen] = React.useState<Origen>('todos')
  const [pcis, setPcis] = React.useState<Set<string>>(new Set())
  const [cuadrilla, setCuadrilla] = React.useState('todas')
  const [q, setQ] = React.useState('')
  const [reciente, setReciente] = React.useState(true)
  const [galeria, setGaleria] = React.useState<{ titulo: string; fotos: Foto[]; i: number } | null>(null)
  const [exportar, setExportar] = React.useState(false)

  // Reglas por rol (boceto): el jefe de cuadrilla solo visualiza lo suyo
  const esJefe = role === 'jefe_cuadrilla'
  const puedeExportar = ['admin', 'supervisor', 'residente', 'visor', 'ing_seguridad'].includes(role)
  const soloMiCuadrilla = esJefe ? crew?.id ?? null : null

  const rangoValido = desde <= hasta
  const fotos = useQuery({
    queryKey: ['evidencias', service.id, desde, hasta, soloMiCuadrilla],
    enabled: rangoValido,
    queryFn: async () => {
      const filas = await fetchAll<Foto>((a, b) => {
        let c = sb.from('v_evidences').select(COLUMNAS)
          .eq('service_id', service.id)
          .in('origen', ['parte', 'pci'])
          .gte('work_date', desde)
          .lte('work_date', hasta)
          .order('work_date', { ascending: false })
          .order('taken_at', { ascending: true })
          .order('id')
          .range(a, b)
        if (soloMiCuadrilla) c = c.eq('crew_id', soloMiCuadrilla)
        return c as any
      })
      return filas
    },
  })

  // Para el autocompletado: el catálogo de actividades (Elvis: «escribo
  // "parchado" y me completa "parchado en calzada"»)
  const catalogo = useQuery({
    queryKey: ['actividades-nombres', service.id],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await sb.from('activities_catalog').select('name')
        .eq('service_id', service.id).is('deleted_at', null).order('name')
      return [...new Set((data ?? []).map((a: any) => a.name as string))]
    },
  })

  const todas = fotos.data ?? []

  const cuadrillas = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const f of todas) if (f.crew_id) m.set(f.crew_id, f.crew_name ?? f.crew_code ?? 'Cuadrilla')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todas])

  const pcisDelRango = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const f of todas) if (esFotoPci(f)) m.set(f.pci_code!, (m.get(f.pci_code!) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [todas])

  const visibles = React.useMemo(() => {
    const t = sinTildes(q.trim())
    return todas.filter((f) => {
      const pci = esFotoPci(f)
      if (origen === 'mr' && pci) return false
      if (origen === 'pci' && !pci) return false
      if (pci && pcis.size && !pcis.has(f.pci_code!)) return false
      if (cuadrilla !== 'todas' && f.crew_id !== cuadrilla) return false
      if (!t) return true
      return [
        f.activity_name, f.activity_code, f.section_name, f.crew_name, f.caption,
        f.pci_code, f.pci_code && pciCorto(f.pci_code), f.pci_item_number != null && `item ${f.pci_item_number}`,
      ].filter(Boolean).some((v) => sinTildes(String(v)).includes(t))
    })
  }, [todas, origen, pcis, cuadrilla, q])

  // ─── Los grupos: cada PCI con sus ítems; la programación por día y actividad
  const grupos = React.useMemo(() => {
    const porPci = new Map<string, Map<number, Foto[]>>()
    const porActividad = new Map<string, Foto[]>()
    for (const f of visibles) {
      if (esFotoPci(f)) {
        const items = porPci.get(f.pci_code!) ?? new Map<number, Foto[]>()
        items.set(f.pci_item_number!, [...(items.get(f.pci_item_number!) ?? []), f])
        porPci.set(f.pci_code!, items)
      } else {
        const k = `${fechaDeFoto(f)}|${f.activity_id ?? f.activity_name}|${f.crew_id}`
        porActividad.set(k, [...(porActividad.get(k) ?? []), f])
      }
    }
    const orden = reciente ? -1 : 1
    const pciLista = [...porPci.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([codigo, items]) => ({
      codigo,
      items: [...items.entries()].sort((a, b) => a[0] - b[0]).map(([numero, fs]) => ({ numero, fotos: fs })),
    }))
    const mrLista = [...porActividad.values()].sort((a, b) =>
      orden * fechaDeFoto(a[0]).localeCompare(fechaDeFoto(b[0])) || (a[0].activity_name ?? '').localeCompare(b[0].activity_name ?? ''))
    return { pci: pciLista, mr: mrLista }
  }, [visibles, reciente])

  // Las miniaturas que se ven, firmadas en lote (no una petición por foto)
  const [mostrar, setMostrar] = React.useState(30)
  const [abiertos, setAbiertos] = React.useState<Record<string, boolean>>({ mr: true })
  const miniaturas = React.useMemo(() => {
    const rutas: string[] = []
    const tomar = (fs: Foto[]) => fs.slice(0, 4).forEach((f) => rutas.push(f.thumb_path ?? f.storage_path))
    for (const p of grupos.pci) if (abiertos[p.codigo] !== false) p.items.slice(0, mostrar).forEach((i) => tomar(i.fotos))
    if (abiertos.mr !== false) grupos.mr.slice(0, mostrar).forEach(tomar)
    return [...new Set(rutas)]
  }, [grupos, abiertos, mostrar])
  const firmas = useQuery({
    queryKey: ['evidencias-miniaturas', miniaturas],
    enabled: miniaturas.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const m = new Map<string, string>()
      for (let i = 0; i < miniaturas.length; i += 100) {
        const { data } = await sb.storage.from('evidencias').createSignedUrls(miniaturas.slice(i, i + 100), 3600)
        for (const f of data ?? []) if (f.path && f.signedUrl) m.set(f.path, f.signedUrl)
      }
      return m
    },
  })
  const urlMiniatura = (f: Foto) => firmas.data?.get(f.thumb_path ?? f.storage_path) ?? null

  const atajo = (dias: number) => { setDesde(toISODate(addDays(new Date(), -dias))); setHasta(hoy) }
  const atajoActivo = (dias: number) => hasta === hoy && desde === toISODate(addDays(new Date(), -dias))
  const alternarPci = (codigo: string) => setPcis((s) => {
    const n = new Set(s)
    if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
    return n
  })

  const totales = etapas(visibles)

  return (
    <>
      <PageHeader
        icon={Camera}
        title="Evidencias"
        description={puedeExportar
          ? 'Consulta y exporta las evidencias fotográficas por fecha, origen y PCI.'
          : 'Las fotos selladas de tu cuadrilla: de la programación y de tus PCI. Solo visualización.'}
      />

      <PageBody className="space-y-4">
        {/* ═══ Fechas ═══════════════════════════════════════════════════ */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <CampoFecha etiqueta="Fecha inicio" valor={desde} max={hasta} alCambiar={setDesde} />
              <CampoFecha etiqueta="Fecha fin" valor={hasta} min={desde} max={hoy} alCambiar={setHasta} />
              <div className="flex flex-wrap gap-1.5">
                {ATAJOS.map((a) => (
                  <Chip key={a.label} activo={atajoActivo(a.dias)} onClick={() => atajo(a.dias)}>{a.label}</Chip>
                ))}
              </div>
            </div>
            {!rangoValido && <p className="text-destructive text-[12px]">La fecha inicio no puede ser posterior a la fecha fin.</p>}

            {/* ═══ Origen y PCI ═══════════════════════════════════════════ */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground mr-1 text-[12px] font-medium">Origen</span>
              {([['todos', 'Todos'], ['mr', 'MR'], ['pci', 'PCI']] as const).map(([k, l]) => (
                <Chip key={k} activo={origen === k} onClick={() => setOrigen(k)}>{l}</Chip>
              ))}
              {origen !== 'mr' && pcisDelRango.length > 0 && (
                <>
                  <span className="bg-border mx-1 h-5 w-px" />
                  {pcisDelRango.map(([codigo, n]) => (
                    <Chip key={codigo} activo={pcis.has(codigo)} onClick={() => alternarPci(codigo)}>
                      {pciCorto(codigo)}
                      <span className="opacity-60">· {n}</span>
                      {pcis.has(codigo) && <X className="size-3" />}
                    </Chip>
                  ))}
                </>
              )}
            </div>

            {/* ═══ Búsqueda ═══════════════════════════════════════════════ */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1 sm:max-w-md">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                <Input
                  placeholder={esJefe ? 'Buscar por actividad o PCI…' : 'Buscar por actividad, tramo, PCI o ítem…'}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                  list="evidencias-sugerencias"
                />
                <datalist id="evidencias-sugerencias">
                  {(catalogo.data ?? []).map((n) => <option key={n} value={n} />)}
                  {pcisDelRango.map(([c]) => <option key={c} value={pciCorto(c)} />)}
                </datalist>
                {q && (
                  <button onClick={() => setQ('')} aria-label="Limpiar búsqueda"
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {!esJefe && cuadrillas.length > 1 && (
                <Select value={cuadrilla} onValueChange={setCuadrilla}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las cuadrillas</SelectItem>
                    {cuadrillas.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ═══ Resumen y exportar ═══════════════════════════════════════ */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px]">
            Evidencias encontradas: <strong className="tabular-nums">{fmtNumber(visibles.length)}</strong>
            <span className="text-muted-foreground ml-2 text-[12px] tabular-nums">
              A {totales.a} · D {totales.d} · DP {totales.dp}
            </span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setReciente((v) => !v)}>
            <ArrowDownUp className="size-3.5" />
            Ordenar: {reciente ? 'más reciente' : 'más antiguo'}
          </Button>
          {puedeExportar ? (
            <Button className="bg-success hover:bg-success/90 ml-auto text-white" disabled={!visibles.length}
              onClick={() => setExportar(true)}>
              <Download className="size-4" />
              Exportar ZIP
            </Button>
          ) : (
            <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-[12px]">
              <Info className="size-3.5" /> Solo visualización · sin exportar
            </span>
          )}
        </div>

        {/* ═══ Las fotos ════════════════════════════════════════════════ */}
        {fotos.isLoading ? (
          <SkeletonList rows={6} />
        ) : !visibles.length ? (
          <Card><CardContent className="p-0">
            <EmptyState icon={Camera} title="Sin fotografías con estos filtros"
              description="Amplía las fechas o quita algún filtro. Las fotos llegan cuando la cuadrilla las toma desde el celular."
              className="py-14" />
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {grupos.pci.map((p) => {
              const fs = p.items.flatMap((i) => i.fotos)
              const e = etapas(fs)
              const abierto = abiertos[p.codigo] !== false
              return (
                <Bloque
                  key={p.codigo}
                  icono={FileText}
                  titulo={pciCorto(p.codigo)}
                  etiqueta={`${p.items.length} ${p.items.length === 1 ? 'ítem' : 'ítems'}`}
                  resumen={`${fmtNumber(fs.length)} fotos`}
                  etapas={e}
                  abierto={abierto}
                  alAlternar={() => setAbiertos((s) => ({ ...s, [p.codigo]: !abierto }))}
                >
                  {p.items.slice(0, mostrar).map(({ numero, fotos: fi }) => {
                    const f0 = fi[0]
                    return (
                      <Fila
                        key={numero}
                        titulo={`Ítem ${numero}${f0.activity_name ? ' · ' + f0.activity_name : ''}`}
                        detalle={<>
                          {f0.section_name && <span>{f0.section_name}</span>}
                          <Progresiva from={f0.progresiva_m} className="text-[11px]" />
                          <span>{f0.side ? 'lado ' + codigoDeLado(f0.side) : 'lado sin indicar'}</span>
                          <span>{fmtDate(fechaDeFoto(f0))}</span>
                        </>}
                        fotos={fi}
                        url={urlMiniatura}
                        alAbrir={(i) => setGaleria({ titulo: `${pciCorto(p.codigo)} · Ítem ${numero}`, fotos: fi, i })}
                      />
                    )
                  })}
                  {p.items.length > mostrar && (
                    <Button variant="ghost" size="sm" onClick={() => setMostrar((m) => m + 30)}>Ver más ítems</Button>
                  )}
                </Bloque>
              )
            })}

            {grupos.mr.length > 0 && (() => {
              const fs = grupos.mr.flat()
              const abierto = abiertos.mr !== false
              return (
                <Bloque
                  icono={CalendarDays}
                  titulo="MR / Programación"
                  etiqueta={`${grupos.mr.length} ${grupos.mr.length === 1 ? 'actividad' : 'actividades'}`}
                  resumen={`${fmtNumber(fs.length)} fotos`}
                  etapas={etapas(fs)}
                  abierto={abierto}
                  alAlternar={() => setAbiertos((s) => ({ ...s, mr: !abierto }))}
                >
                  {grupos.mr.slice(0, mostrar).map((fa) => {
                    const f0 = fa[0]
                    return (
                      <Fila
                        key={f0.id}
                        titulo={f0.activity_name ?? 'Actividad sin nombre'}
                        detalle={<>
                          <span>{fmtDate(fechaDeFoto(f0))}</span>
                          {!esJefe && f0.crew_name && <span>{f0.crew_name}</span>}
                          {f0.section_name && <span className="flex items-center gap-1"><MapPin className="size-3" />{f0.section_name}</span>}
                          <Progresiva from={f0.progresiva_m} className="text-[11px]" />
                          {f0.sector_code && <span>Sector {f0.sector_code}</span>}
                        </>}
                        fotos={fa}
                        url={urlMiniatura}
                        alAbrir={(i) => setGaleria({ titulo: `${f0.activity_name ?? 'Actividad'} · ${fmtDate(fechaDeFoto(f0))}`, fotos: fa, i })}
                      />
                    )
                  })}
                  {grupos.mr.length > mostrar && (
                    <Button variant="ghost" size="sm" onClick={() => setMostrar((m) => m + 30)}>Ver más actividades</Button>
                  )}
                </Bloque>
              )
            })()}
          </div>
        )}
      </PageBody>

      {galeria && <Galeria {...galeria} alCerrar={() => setGaleria(null)} alMover={(i) => setGaleria((g) => g && { ...g, i })} />}

      {exportar && (
        <DialogoDeExportacion
          fotos={visibles}
          desde={desde}
          hasta={hasta}
          origen={origen}
          pcis={[...pcis]}
          cuadrilla={cuadrilla === 'todas' ? null : cuadrillas.find(([id]) => id === cuadrilla)?.[1] ?? null}
          servicioNombre={service.name}
          generadoPor={profile.full_name ?? profile.email ?? ''}
          alCerrar={() => setExportar(false)}
        />
      )}
    </>
  )
}

// ═══ Piezas ══════════════════════════════════════════════════════════════

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-all',
        activo ? 'border-success bg-success text-white' : 'border-border bg-card hover:border-success/40'
      )}
    >
      {children}
    </button>
  )
}

function CampoFecha({ etiqueta, valor, min, max, alCambiar }: {
  etiqueta: string; valor: string; min?: string; max?: string; alCambiar: (v: string) => void
}) {
  return (
    <label className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
      <CalendarDays className="text-muted-foreground size-4" />
      <span className="flex flex-col">
        <span className="text-muted-foreground text-[10.5px] leading-tight">{etiqueta}</span>
        <input
          type="date"
          value={valor}
          min={min}
          max={max}
          onChange={(e) => e.target.value && alCambiar(e.target.value)}
          className="bg-transparent text-[13px] font-semibold outline-none"
        />
      </span>
    </label>
  )
}

function Etapas({ a, d, dp }: { a: number; d: number; dp: number }) {
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums">
      <span className="bg-warning/15 text-warning rounded px-1.5 py-0.5">A {a}</span>
      <span className="bg-success/15 text-success rounded px-1.5 py-0.5">D {d}</span>
      <span className="bg-destructive/12 text-destructive rounded px-1.5 py-0.5">DP {dp}</span>
    </span>
  )
}

function Bloque({ icono: Icono, titulo, etiqueta, resumen, etapas: e, abierto, alAlternar, children }: {
  icono: React.ComponentType<{ className?: string }>
  titulo: string; etiqueta: string; resumen: string; etapas: { a: number; d: number; dp: number }
  abierto: boolean; alAlternar: () => void; children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <button onClick={alAlternar} className="bg-primary flex w-full items-center gap-2 px-4 py-2.5 text-left text-white">
        <Icono className="size-4" />
        <span className="flex-1 text-[13.5px] font-semibold">{titulo}</span>
        <span className="text-[11.5px] opacity-80">{etiqueta}</span>
        <ChevronDown className={cn('size-4 transition-transform', !abierto && '-rotate-90')} />
      </button>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[12px]">
        <span className="text-muted-foreground flex items-center gap-1"><ListChecks className="size-3.5" />{etiqueta}</span>
        <span className="text-muted-foreground flex items-center gap-1"><ImageIcon className="size-3.5" />{resumen}</span>
        <Etapas {...e} />
      </div>
      {abierto && <div className="divide-y divide-border">{children}</div>}
    </Card>
  )
}

function Fila({ titulo, detalle, fotos, url, alAbrir }: {
  titulo: string; detalle: React.ReactNode; fotos: Foto[]; url: (f: Foto) => string | null; alAbrir: (i: number) => void
}) {
  const e = etapas(fotos)
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate text-[13px] font-semibold">{titulo}</p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 text-[11.5px]">{detalle}</p>
        <div className="mt-1.5"><Etapas {...e} /></div>
      </div>
      <div className="flex items-center gap-1.5">
        {fotos.slice(0, 4).map((f, i) => {
          const u = url(f)
          return (
            <button key={f.id} onClick={() => alAbrir(i)}
              className="bg-secondary relative size-14 overflow-hidden rounded-md border border-border">
              {u ? <Image src={u} alt="" fill sizes="56px" className="object-cover" unoptimized /> : null}
            </button>
          )
        })}
        {fotos.length > 4 && (
          <button onClick={() => alAbrir(4)} className="bg-muted size-14 rounded-md text-[12px] font-semibold">
            +{fotos.length - 4}
          </button>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => alAbrir(0)}>
        {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  )
}

/** Las fotos del ítem o de la actividad, una por una, con zoom. */
function Galeria({ titulo, fotos, i, alCerrar, alMover }: {
  titulo: string; fotos: Foto[]; i: number; alCerrar: () => void; alMover: (i: number) => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const f = fotos[i]
  const url = useQuery({
    queryKey: ['evidencia-grande', f.storage_path],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await sb.storage.from('evidencias').createSignedUrl(f.storage_path, 3600)
      return data?.signedUrl ?? null
    },
  })
  const etapa = { antes: 'Antes', durante: 'Durante', despues: 'Después' }[f.phase as string] ?? 'General'
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-start gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{titulo} · {etapa}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-[11.5px] text-white/70">
            {f.section_name && <span>{f.section_name}</span>}
            <Progresiva from={f.progresiva_m} className="text-[11px] text-white/70" />
            <span className="flex items-center gap-1"><Clock className="size-3" />{fmtDateTime(f.taken_at)}</span>
            {f.lat != null && (
              <span className="flex items-center gap-1"><MapPin className="size-3" />{Number(f.lat).toFixed(5)}, {Number(f.lng).toFixed(5)}</span>
            )}
            {f.revision === 'observada' && <span className="text-red-300">Observada por COVINCA{f.revision_nota ? `: ${f.revision_nota}` : ''}</span>}
            <span>{i + 1} de {fotos.length}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={alCerrar} aria-label="Cerrar"><X className="size-5 text-white" /></Button>
      </div>
      <div className="relative mx-4 mb-4 flex flex-1 items-center gap-2">
        <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => alMover(i - 1)} aria-label="Anterior">
          <ChevronLeft className="size-6 text-white" />
        </Button>
        <div className="relative h-full flex-1">
          {url.data && <ImageViewer src={url.data} alt={titulo} className="h-full" />}
        </div>
        <Button variant="ghost" size="icon" disabled={i >= fotos.length - 1} onClick={() => alMover(i + 1)} aria-label="Siguiente">
          <ChevronRight className="size-6 text-white" />
        </Button>
      </div>
    </div>
  )
}

// ═══ Exportar evidencias (boceto 1, pantalla derecha) ════════════════════

type Nodo = { nombre: string; hijos: Map<string, Nodo>; archivos: string[]; total: number }

function arbolDe(rutas: { carpeta: string; archivo: string }[], raiz: string): Nodo {
  const top: Nodo = { nombre: raiz + '.zip', hijos: new Map(), archivos: [], total: 0 }
  for (const r of rutas) {
    let n = top
    n.total++
    for (const parte of r.carpeta ? r.carpeta.split('/') : []) {
      if (!n.hijos.has(parte)) n.hijos.set(parte, { nombre: parte + '/', hijos: new Map(), archivos: [], total: 0 })
      n = n.hijos.get(parte)!
      n.total++
    }
    n.archivos.push(r.archivo)
  }
  return top
}

function VistaDeArbol({ nodo, nivel = 0 }: { nodo: Nodo; nivel?: number }) {
  const hijos = [...nodo.hijos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { numeric: true }))
  const MAX = 4
  return (
    <div className={cn(nivel > 0 && 'ml-3.5 border-l border-border pl-2')}>
      <p className="flex items-center gap-1.5 py-0.5 text-[11.5px]">
        {nivel === 0 ? <FolderOpen className="text-warning size-3.5" /> : <Folder className="text-warning size-3.5" />}
        <span className="font-mono">{nodo.nombre}</span>
        {nivel > 0 && <span className="text-muted-foreground">· {nodo.total}</span>}
      </p>
      {hijos.slice(0, MAX).map((h) => <VistaDeArbol key={h.nombre} nodo={h} nivel={nivel + 1} />)}
      {hijos.length > MAX && (
        <p className="text-muted-foreground ml-3.5 py-0.5 pl-2 text-[11px]">… y {hijos.length - MAX} carpetas más</p>
      )}
      {nodo.archivos.length > 0 && (
        <div className="ml-3.5 border-l border-border pl-2">
          {nodo.archivos.slice(0, 3).map((a) => (
            <p key={a} className="text-muted-foreground flex items-center gap-1.5 py-0.5 font-mono text-[11px]">
              <ImageIcon className="size-3" />{a}
            </p>
          ))}
          {nodo.archivos.length > 3 && (
            <p className="text-muted-foreground py-0.5 text-[11px]">… y {nodo.archivos.length - 3} fotos más</p>
          )}
        </div>
      )}
    </div>
  )
}

function DialogoDeExportacion({ fotos, desde, hasta, origen, pcis, cuadrilla, servicioNombre, generadoPor, alCerrar }: {
  fotos: Foto[]; desde: string; hasta: string; origen: Origen; pcis: string[]; cuadrilla: string | null
  servicioNombre: string; generadoPor: string; alCerrar: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [op, setOp] = React.useState<OpcionesDeExportacion>({ estructura: true, oficial: true })
  const [avance, setAvance] = React.useState<AvanceDeExportacion | null>(null)
  const raiz = nombreDeExportacion(desde, hasta)
  const rutas = React.useMemo(() => rutasDeExportacion(fotos, op), [fotos, op])
  const arbol = React.useMemo(() => arbolDe(rutas, raiz), [rutas, raiz])
  const observadas = fotos.filter((f) => f.revision === 'observada').length
  const bytes = fotos.reduce((t, f) => t + Number(f.master_bytes ?? 1_800_000), 0)
  const pcisEnLaExportacion = [...new Set(fotos.filter(esFotoPci).map((f) => f.pci_code!))]
  const tieneMr = fotos.some((f) => !esFotoPci(f))
  const origenTexto = origen === 'mr' ? 'MR' : origen === 'pci' ? 'PCI' : [tieneMr && 'MR', pcisEnLaExportacion.length && 'PCI'].filter(Boolean).join(' + ')
  const pcisTexto = (pcis.length ? pcis : pcisEnLaExportacion).map((c) => pciCorto(c).replace('PCI ', '')).join(', ')

  const exportar = async () => {
    setAvance({ paso: 'Empezando', hechos: 0, total: 1 })
    try {
      const zip = await armarExportacion({
        sb, fotos, op, desde, hasta, servicioNombre, generadoPor,
        filtros: [`Origen: ${origenTexto || '—'}`, pcisTexto && `PCI: ${pcisTexto}`, cuadrilla].filter(Boolean).join(' · '),
        alAvanzar: setAvance,
      })
      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = raiz + '.zip'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success('Exportación lista', { description: `${fmtNumber(rutas.length)} fotos en ${raiz}.zip` })
      alCerrar()
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo armar la exportación'))
      setAvance(null)
    }
  }

  const ocupado = avance != null
  return (
    <Dialog open onOpenChange={(v) => !v && !ocupado && alCerrar()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogTitle>Exportar evidencias</DialogTitle>
        <DialogDescription>Un ZIP con las fotos filtradas, en la estructura de carpetas para COVINCA.</DialogDescription>

        <section className="bg-muted/40 space-y-1 rounded-lg p-3 text-[12.5px]">
          <p className="mb-1 font-semibold">Resumen de filtro aplicado</p>
          <p>Fecha inicio: <strong>{fmtDate(desde)}</strong></p>
          <p>Fecha fin: <strong>{fmtDate(hasta)}</strong></p>
          <p>Origen: <strong>{origenTexto || '—'}</strong></p>
          {pcisTexto && <p>PCI seleccionados: <strong>{pcisTexto}</strong></p>}
          {cuadrilla && <p>Cuadrilla: <strong>{cuadrilla}</strong></p>}
          <p>Fases: <strong>Todas</strong></p>
          <p className="text-muted-foreground pt-1">
            {fmtNumber(rutas.length)} fotos · unos {fmtNumber(bytes / 1_048_576)} MB
            {observadas > 0 && ` · ${observadas} observadas por COVINCA no se incluyen`}
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-[13px] font-semibold">Opciones de exportación</p>
          <Opcion
            marcada={op.estructura}
            alCambiar={(v) => setOp((o) => ({ ...o, estructura: v }))}
            texto="Incluir estructura de carpetas"
            ayuda="MR por cuadrilla, fecha, subsector y actividad; PCI por plazo e ítem. Sin ella, todas las fotos en una sola carpeta."
          />
          <Opcion
            marcada={op.oficial}
            alCambiar={(v) => setOp((o) => ({ ...o, oficial: v }))}
            texto="Mantener nomenclatura oficial"
            ayuda="Los nombres de la entrega COVINCA: PCI_44 / 3_DIAS / ITEM_19 / ITEM_19(1).jpg. Sin ella: PCI-2026-044 / PLAZO_3_DIAS / ITEM_019."
          />
          <Opcion
            marcada
            deshabilitada
            texto="Incluir fotos selladas"
            ayuda="Todas las fotos de SIGOV llevan el sello de fecha, hora y ubicación desde el celular: salen en JPG 4080 × 3060."
          />
        </section>

        <section className="space-y-1">
          <p className="text-[13px] font-semibold">Vista previa de la estructura de carpetas</p>
          <div className="bg-card max-h-72 overflow-y-auto rounded-lg border border-border p-3">
            <VistaDeArbol nodo={arbol} />
          </div>
        </section>

        {rutas.length > 1500 && !ocupado && (
          <p className="text-warning text-[12px]">
            Son muchas fotos: el navegador arma el ZIP en memoria. Si falla, exporta por menos días o por PCI.
          </p>
        )}

        {ocupado && avance && (
          <div className="space-y-1">
            <p className="text-[12px]">{avance.paso} {avance.total > 1 && `· ${avance.hechos} de ${avance.total}`}</p>
            <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
              <div className="bg-success h-full transition-all" style={{ width: `${(avance.hechos / Math.max(avance.total, 1)) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={alCerrar} disabled={ocupado}>Cancelar</Button>
          <Button className="bg-success hover:bg-success/90 flex-1 text-white" onClick={exportar} loading={ocupado} disabled={!rutas.length}>
            <Download className="size-4" />
            Exportar ZIP
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Opcion({ marcada, deshabilitada, alCambiar, texto, ayuda }: {
  marcada: boolean; deshabilitada?: boolean; alCambiar?: (v: boolean) => void; texto: string; ayuda: string
}) {
  return (
    <label className="flex items-center gap-2.5 text-[13px]">
      <Checkbox checked={marcada} disabled={deshabilitada} onCheckedChange={(v) => alCambiar?.(v === true)} />
      <span className="flex-1">{texto}</span>
      <Tip label={<span className="block max-w-64">{ayuda}</span>}>
        <Info className="text-muted-foreground size-3.5" />
      </Tip>
    </label>
  )
}
