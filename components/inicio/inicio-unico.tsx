'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Layers, CheckCircle2, Clock, Target, RefreshCw, FileSpreadsheet, FileText, Search, MessageSquareWarning,
  CalendarClock, Info, Wrench, Eye, ArrowRight, CalendarDays, Ruler, Gauge, Database,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonKpi, SkeletonChart } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtNumber, fmtProgresiva, toISODate, addDays } from '@/lib/utils'
import { descargarExcel, descargarPdf, nombreCliente, type ReportMeta } from '@/lib/reports'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Inicio único PCI / MR (guía de roles 3.1; modelo compartido de dashboard).
 *
 * Una sola pantalla para Administrador, Supervisor, Residente y Visor COVINCA:
 * cambia el alcance (lo recorta la base según quien pregunta) y el título,
 * no el cálculo. PCI se mide por ítems únicos; MR por actividad y unidad,
 * sin sumar unidades distintas. Los filtros viven en la dirección para que
 * al volver de un ítem sigan como estaban, y el Excel/PDF usan la misma
 * consulta que la pantalla.
 */

type Rol = 'admin' | 'supervisor' | 'residente' | 'visor'

const VERDE = 'var(--success)'
const NARANJA = 'oklch(0.72 0.17 55)'

const pct = (v: number | null | undefined) => (v == null ? '—' : `${fmtNumber(Number(v), Number(v) % 1 === 0 ? 0 : 1)} %`)
const nombreFase = (f: string) => ({ antes: 'Antes', durante: 'Durante', despues: 'Después' } as Record<string, string>)[f] ?? f

export function InicioUnico({
  rol, titulo, subtitulo, pestanaInicial = 'pci',
}: { rol: Rol; titulo: string; subtitulo?: string; pestanaInicial?: 'pci' | 'mr' }) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const hoy = toISODate(new Date())

  // ── Filtros en la dirección: se conservan al ir y volver ──────────────
  const f = {
    tab: (sp.get('tab') as 'pci' | 'mr') ?? pestanaInicial,
    pci: sp.get('pci') ?? '',
    corte: sp.get('corte') ?? hoy,
    crew: sp.get('crew') ?? '',
    sector: sp.get('sector') ?? '',
    q: sp.get('q') ?? '',
    desde: sp.get('desde') ?? toISODate(addDays(new Date(), -6)),
    hasta: sp.get('hasta') ?? hoy,
    sup: sp.get('sup') ?? '',
    act: sp.get('act') ?? '',
    unit: sp.get('unit') ?? '',
  }
  const fijar = (cambios: Partial<typeof f>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(cambios)) {
      if (v) n.set(k, String(v)); else n.delete(k)
    }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const [busqueda, setBusqueda] = React.useState(f.q)
  React.useEffect(() => {
    const t = setTimeout(() => { if (busqueda !== f.q) fijar({ q: busqueda }) }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  // ── Catálogos de los filtros (el alcance lo pone la base) ─────────────
  const cuadrillas = useQuery({
    queryKey: ['inicio-cuadrillas', service.id, rol],
    queryFn: async () => {
      let c = sb.from('crews').select('id, code, name, supervisor_id').eq('service_id', service.id).is('deleted_at', null).order('code')
      if (rol === 'supervisor') c = c.eq('supervisor_id', profile.id)
      const { data } = await c
      return data ?? []
    },
  })
  const supervisores = useQuery({
    queryKey: ['inicio-supervisores', service.id],
    enabled: rol === 'admin' || rol === 'residente',
    queryFn: async () => {
      const { data } = await sb.from('service_members').select('profile_id, profiles(full_name)').eq('service_id', service.id).eq('role', 'supervisor')
      return (data ?? []).map((m: any) => ({ id: m.profile_id as string, nombre: m.profiles?.full_name as string }))
    },
  })
  const actividades = useQuery({
    queryKey: ['inicio-actividades', service.id],
    enabled: f.tab === 'mr',
    queryFn: async () => {
      const { data } = await sb.from('activities_catalog').select('id, code, name, unit_id, units(symbol)')
        .eq('service_id', service.id).eq('is_active', true).is('deleted_at', null).order('name')
      return data ?? []
    },
  })

  // ── Datos ─────────────────────────────────────────────────────────────
  const pci = useQuery({
    queryKey: ['inicio-pci', service.id, f.pci, f.corte, f.crew, f.sector, f.q],
    enabled: f.tab === 'pci',
    queryFn: async () => {
      const { data, error } = await sb.rpc('inicio_pci', {
        p_service: service.id, p_pci: f.pci || null, p_corte: f.corte, p_crew: f.crew || null,
        p_sector: f.sector || null, p_busqueda: f.q || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const unidadDeActividad = (actividades.data ?? []).find((a: any) => a.id === f.act) as any
  const mr = useQuery({
    queryKey: ['inicio-mr', service.id, f.desde, f.hasta, f.crew, f.sup, f.act, f.unit],
    enabled: f.tab === 'mr',
    queryFn: async () => {
      const { data, error } = await sb.rpc('inicio_mr', {
        p_service: service.id, p_desde: f.desde, p_hasta: f.hasta, p_crew: f.crew || null,
        p_supervisor: f.sup || null, p_activity: f.act || null, p_unit: f.unit || unidadDeActividad?.unit_id || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const actual = f.tab === 'pci' ? pci : mr
  const ultimaSync = (actual.data as any)?.ultima_sincronizacion as string | undefined

  // ── Los ítems detrás de una cifra ─────────────────────────────────────
  const [cifra, setCifra] = React.useState<{ cifra: string; plazo?: number; titulo: string } | null>(null)
  const detalle = useQuery({
    queryKey: ['inicio-pci-items', service.id, f.pci, f.corte, f.crew, f.sector, cifra?.cifra, cifra?.plazo],
    enabled: !!cifra,
    queryFn: async () => {
      const { data, error } = await sb.rpc('inicio_pci_items', {
        p_service: service.id, p_pci: f.pci || null, p_corte: f.corte, p_crew: f.crew || null, p_sector: f.sector || null,
        p_cifra: cifra!.cifra, p_plazo: cifra!.plazo ?? null,
      } as any)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  // ── Exportar la misma consulta ────────────────────────────────────────
  const nombreCuadrilla = (cuadrillas.data ?? []).find((c: any) => c.id === f.crew)?.name
  const meta = (tituloRep: string): ReportMeta => ({
    titulo: tituloRep,
    servicio: service.name,
    cliente: nombreCliente((service as any).client_name),
    contrato: (service as any).contract_code,
    periodo: f.tab === 'pci' ? `Corte al ${fmtDate(f.corte)}` : `Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`,
    generadoPor: profile.full_name,
    cuadrilla: nombreCuadrilla ?? (rol === 'supervisor' ? 'Mis cuadrillas' : 'Todas'),
    filtros: [
      f.pci && `PCI ${((pci.data?.pcis ?? []) as any[]).find((p) => p.id === f.pci)?.code ?? ''}`,
      f.sector && `Sector ${f.sector}`, f.q && `Búsqueda «${f.q}»`,
      f.act && `Actividad ${unidadDeActividad?.name ?? ''}`,
    ].filter(Boolean).join(' · ') || undefined,
  })
  const exportar = async (formato: 'excel' | 'pdf') => {
    try {
      if (f.tab === 'pci') {
        const d = pci.data
        if (!d) return
        const filas = (d.por_plazo as any[]).map((p) => ({
          plazo: `${p.plazo} ${p.plazo === 1 ? 'día' : 'días'}`, vencimiento: fmtDate(p.vencimiento),
          total: p.total, atendidos: p.atendidos, pendientes: p.pendientes, avance: pct(p.avance),
        }))
        filas.push({ plazo: 'TOTAL', vencimiento: '', total: d.total, atendidos: d.atendidos, pendientes: d.sin_atencion, avance: pct(d.avance) })
        const cols = [
          { header: 'Plazo', key: 'plazo', width: 14 }, { header: 'Vencimiento', key: 'vencimiento', width: 14 },
          { header: 'Total', key: 'total', width: 10 }, { header: 'Atendidos', key: 'atendidos', width: 12 },
          { header: 'Pendientes', key: 'pendientes', width: 12 }, { header: 'Avance', key: 'avance', width: 10 },
        ]
        const nombre = `SIGOV_INICIO_PCI_${f.corte}`
        if (formato === 'excel') {
          const { data: items } = await sb.rpc('inicio_pci_items', { p_service: service.id, p_pci: f.pci || null, p_corte: f.corte, p_crew: f.crew || null, p_sector: f.sector || null, p_cifra: 'total', p_plazo: null } as any)
          await descargarExcel(nombre, meta('Inicio · Avance PCI'), [
            { name: 'Detalle por plazo', columns: cols, rows: filas },
            {
              name: 'Ítems', rows: ((items ?? []) as any[]).map((i) => ({ ...i, vencimiento: fmtDate(i.vencimiento) })),
              columns: [
                { header: 'PCI', key: 'pci', width: 16 }, { header: 'Ítem', key: 'item', width: 8 }, { header: 'Plazo (días)', key: 'plazo', width: 11 },
                { header: 'Vencimiento', key: 'vencimiento', width: 13 }, { header: 'Estado', key: 'estado', width: 14 },
                { header: 'Revisión COVINCA', key: 'covinca', width: 16 }, { header: 'Cuadrilla', key: 'crew', width: 18 },
                { header: 'Descripción', key: 'description', width: 60 },
              ],
            },
          ])
        } else {
          await descargarPdf(nombre, meta('Inicio · Avance PCI'), cols, filas, {
            cover: false,
            kpis: [
              { label: 'Total', value: fmtNumber(d.total) }, { label: 'Atendidos', value: fmtNumber(d.atendidos) },
              { label: 'Sin atención', value: fmtNumber(d.sin_atencion) }, { label: 'Avance', value: pct(d.avance) },
            ],
            intro: 'Atendido no equivale a expediente completo ni a conformidad del cliente.',
          })
        }
      } else {
        const d = mr.data
        if (!d) return
        const homogeneo = d.homogeneo
        const filas = homogeneo
          ? (d.detalle as any[]).map((x) => ({ fecha: fmtDate(x.fecha), cuadrilla: x.cuadrilla, sector: x.sector ?? '—',
              progresiva: `${fmtProgresiva(x.prog_inicio)} – ${fmtProgresiva(x.prog_fin)}`, programado: x.programado,
              ejecutado: x.ejecutado, saldo: x.saldo }))
          : (d.por_actividad as any[]).map((x) => ({ actividad: x.actividad, unidad: x.unidad, programado: x.programado,
              ejecutado: x.ejecutado, saldo: x.saldo, avance: pct(x.avance) }))
        const cols = homogeneo
          ? [{ header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Cuadrilla', key: 'cuadrilla', width: 16 }, { header: 'Sector', key: 'sector', width: 9 },
             { header: 'Progresiva', key: 'progresiva', width: 22 }, { header: `Programado (${d.unidad ?? ''})`, key: 'programado', width: 14 },
             { header: `Ejecutado (${d.unidad ?? ''})`, key: 'ejecutado', width: 14 }, { header: `Saldo (${d.unidad ?? ''})`, key: 'saldo', width: 12 }]
          : [{ header: 'Actividad', key: 'actividad', width: 40 }, { header: 'Unidad', key: 'unidad', width: 9 },
             { header: 'Programado', key: 'programado', width: 13 }, { header: 'Ejecutado', key: 'ejecutado', width: 13 },
             { header: 'Saldo', key: 'saldo', width: 12 }, { header: 'Avance', key: 'avance', width: 10 }]
        const nombre = `SIGOV_INICIO_MR_${f.desde}_${f.hasta}`
        if (formato === 'excel') await descargarExcel(nombre, meta('Inicio · Programación MR'), [{ name: 'MR', columns: cols, rows: filas }])
        else await descargarPdf(nombre, meta('Inicio · Programación MR'), cols, filas, {
          cover: false, landscape: true, intro: 'No se suman metros, m², m³ ni unidades entre actividades.',
        })
      }
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo exportar'))
    }
  }

  return (
    <>
      <PageHeader
        title={titulo}
        description={subtitulo ?? `${service.name} · ${nombreCliente((service as any).client_name)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => actual.refetch()} loading={actual.isFetching}>
              <RefreshCw className="size-3.5" />Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportar('excel')} disabled={!actual.data}>
              <FileSpreadsheet className="size-3.5" />Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportar('pdf')} disabled={!actual.data}>
              <FileText className="size-3.5" />PDF
            </Button>
          </div>
        }
      />
      <PageBody className="space-y-4">
        {/* Pestañas PCI | MR y búsqueda */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-secondary inline-flex rounded-lg p-1">
            {([['pci', 'PCI', Layers], ['mr', 'MR', Wrench]] as const).map(([k, t, Icono]) => (
              <button
                key={k}
                onClick={() => fijar({ tab: k })}
                className={cn('flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold transition-colors',
                  f.tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icono className="size-3.5" />{t}
              </button>
            ))}
          </div>
          {f.tab === 'pci' && (
            <div className="relative min-w-60 flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar PCI, ítem o actividad" className="pl-8" />
            </div>
          )}
        </div>

        {f.tab === 'pci' ? (
          <PestanaPci
            rol={rol} f={f} fijar={fijar} datos={pci.data} cargando={pci.isLoading} error={pci.error}
            cuadrillas={cuadrillas.data ?? []} abrir={setCifra}
          />
        ) : (
          <PestanaMr
            rol={rol} f={f} fijar={fijar} datos={mr.data} cargando={mr.isLoading} error={mr.error}
            cuadrillas={cuadrillas.data ?? []} supervisores={supervisores.data ?? []} actividades={actividades.data ?? []}
          />
        )}

        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info/[0.07] px-3.5 py-2.5 text-[12px]">
          <span className="flex items-center gap-2">
            <Info className="text-info size-3.5 shrink-0" />
            {f.tab === 'pci'
              ? 'Atendido no equivale a expediente completo ni a conformidad del cliente.'
              : 'No se suman metros, m², m³ ni unidades entre actividades. El avance físico no equivale a conformidad documental.'}
          </span>
          <span className="flex items-center gap-1.5">
            <RefreshCw className="size-3" />Última sincronización: <strong>{ultimaSync ? new Date(ultimaSync).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : 'sin registro'}</strong>
          </span>
        </div>
      </PageBody>

      <Dialog open={!!cifra} onOpenChange={(v) => !v && setCifra(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{cifra?.titulo}</DialogTitle>
            <DialogDescription>
              Los ítems que componen la cifra, con el mismo corte y filtros. {detalle.data ? `${fmtNumber(detalle.data.length)} ítems.` : ''}
            </DialogDescription>
          </DialogHeader>
          {detalle.isLoading && <p className="text-muted-foreground text-[13px]">Cargando…</p>}
          {detalle.data?.length === 0 && <p className="text-muted-foreground text-[13px]">Sin registros.</p>}
          <div className="divide-y divide-border">
            {(detalle.data ?? []).slice(0, 300).map((i: any) => (
              <Link key={i.item_id} href={`/pci/${i.pci_id}/item/${i.item_id}`}
                className="hover:bg-secondary/60 flex items-center gap-3 px-2 py-2 text-[13px]">
                <span className="w-28 shrink-0 font-medium">{i.pci} · {i.item}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate">{i.description}</span>
                <span className="text-muted-foreground w-24 shrink-0 text-right text-[12px]">{i.plazo} d · {fmtDate(i.vencimiento)}</span>
                <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
              </Link>
            ))}
          </div>
          {(detalle.data?.length ?? 0) > 300 && (
            <p className="text-muted-foreground text-[12px]">Se muestran 300; exporta a Excel para ver todos.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function Filtro({ etiqueta, children, className }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-36 flex-1 flex-col gap-1', className)}>
      <span className="text-muted-foreground text-[11px] font-medium">{etiqueta}</span>
      {children}
    </label>
  )
}

function SelectSimple({ valor, alCambiar, opciones, todos }: {
  valor: string; alCambiar: (v: string) => void; opciones: { v: string; t: string }[]; todos: string
}) {
  return (
    <Select value={valor || '__todos'} onValueChange={(v) => alCambiar(v === '__todos' ? '' : v)}>
      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__todos">{todos}</SelectItem>
        {opciones.map((o) => <SelectItem key={o.v} value={o.v}>{o.t}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function Errores({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="border-destructive/30 bg-destructive/[0.06] rounded-lg border px-4 py-3 text-[13px]">
      No se pudo cargar el Inicio: {mensajeAmigable(error)}. Usa Actualizar para reintentar.
    </div>
  )
}

/** Barras horizontales apiladas: cada una al 100 % de su total. */
function Apiladas({ filas }: { filas: { etiqueta: string; a: number; b: number; total: number; texto?: string }[] }) {
  if (!filas.length) return <p className="text-muted-foreground py-6 text-center text-[13px]">Sin registros.</p>
  return (
    <div className="space-y-2.5">
      {filas.map((x) => (
        <div key={x.etiqueta} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-[12.5px] font-medium">{x.etiqueta}</span>
          <div className="bg-secondary flex h-6 flex-1 overflow-hidden rounded-md">
            {x.a > 0 && (
              <div className="flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(100 * x.a) / Math.max(x.total, 1)}%`, background: VERDE }}>
                {x.a}
              </div>
            )}
            {x.b > 0 && (
              <div className="flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(100 * x.b) / Math.max(x.total, 1)}%`, background: NARANJA }}>
                {x.b}
              </div>
            )}
          </div>
          <span className="w-16 shrink-0 text-right text-[12.5px] font-semibold tabular-nums">{x.texto ?? x.total}</span>
        </div>
      ))}
    </div>
  )
}

/** Anillo de dos colores: verde lo atendido/ejecutado, naranja lo pendiente. */
function Dona({ a, b, centro, etiquetaA, etiquetaB }: { a: number; b: number; centro: string; etiquetaA: string; etiquetaB: string }) {
  const total = a + b
  const r = 48
  const c = 2 * Math.PI * r
  const largoA = total > 0 ? (a / total) * c : 0
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div className="relative size-32">
        <svg viewBox="0 0 120 120" className="size-32 -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke={total > 0 ? NARANJA : 'var(--secondary)'} strokeWidth="14" />
          {largoA > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke={VERDE} strokeWidth="14" strokeDasharray={`${largoA} ${c}`} />}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[18px] font-bold tabular-nums">{centro}</span>
      </div>
      <div className="space-y-1.5 text-[12.5px]">
        <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: VERDE }} /><strong style={{ color: VERDE }}>{etiquetaA}</strong></p>
        <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: NARANJA }} /><strong style={{ color: NARANJA }}>{etiquetaB}</strong></p>
      </div>
    </div>
  )
}

function Leyenda({ a, b }: { a: string; b: string }) {
  return (
    <p className="text-muted-foreground mt-3 flex items-center gap-4 text-[11.5px]">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: VERDE }} />{a}</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: NARANJA }} />{b}</span>
    </p>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function PestanaPci({ rol, f, fijar, datos: d, cargando, error, cuadrillas, abrir }: {
  rol: Rol; f: any; fijar: (c: any) => void; datos: any; cargando: boolean; error: unknown
  cuadrillas: any[]; abrir: (c: { cifra: string; plazo?: number; titulo: string }) => void
}) {
  const plazos = (d?.por_plazo ?? []) as any[]
  const ev = d?.evidencia ?? {}
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Filtro etiqueta="Fecha de corte">
            <Input type="date" value={f.corte} max={toISODate(new Date())} onChange={(e) => fijar({ corte: e.target.value })} className="h-9" />
          </Filtro>
          <Filtro etiqueta="Cuadrilla">
            <SelectSimple valor={f.crew} alCambiar={(v) => fijar({ crew: v })} todos={rol === 'supervisor' ? 'Todas las asignadas' : 'Todas'}
              opciones={cuadrillas.map((c) => ({ v: c.id, t: `${c.code} · ${c.name}` }))} />
          </Filtro>
          <Filtro etiqueta="Sector">
            <SelectSimple valor={f.sector} alCambiar={(v) => fijar({ sector: v })} todos="Todos"
              opciones={((d?.sectores ?? []) as string[]).sort().map((s) => ({ v: s, t: `Sector ${s}` }))} />
          </Filtro>
          <Filtro etiqueta="PCI">
            <SelectSimple valor={f.pci} alCambiar={(v) => fijar({ pci: v })} todos="Todos los PCI"
              opciones={((d?.pcis ?? []) as any[]).map((p) => ({ v: p.id, t: p.code }))} />
          </Filtro>
        </CardContent>
      </Card>
      <Errores error={error} />

      {cargando ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}</div>
      ) : d && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <button onClick={() => abrir({ cifra: 'total', titulo: 'Total de ítems' })} className="text-left">
              <StatCard index={0} label={rol === 'visor' ? 'Total de registros' : 'Total'} value={Number(d.total)} icon={Layers} tone="primary" href="#" />
            </button>
            <button onClick={() => abrir({ cifra: 'atendidos', titulo: rol === 'visor' ? 'Atendidos (publicados al corte)' : 'Atendidos al corte' })} className="text-left">
              <StatCard index={1} label="Atendidos" value={Number(d.atendidos)} icon={CheckCircle2} tone="success" href="#" />
            </button>
            <button onClick={() => abrir({ cifra: 'sin_atencion', titulo: 'Sin atención registrada' })} className="text-left">
              <StatCard index={2} label="Sin atención" value={Number(d.sin_atencion)} icon={Clock} tone="warning" href="#" />
            </button>
            <StatCard index={3} label={rol === 'visor' ? 'Avance al corte' : 'Avance'} value={d.avance == null ? 'Sin registros' : `${fmtNumber(Number(d.avance), 1)} %`} icon={Target} tone="info" />
          </div>

          {/* Franja de indicadores */}
          <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border px-4 py-2.5 text-[13px]">
            <span className="flex items-center gap-1.5"><MessageSquareWarning className="text-info size-4" />Observaciones abiertas: <strong>{fmtNumber(ev.observaciones_abiertas ?? 0)}</strong></span>
            <span className="flex items-center gap-1.5"><CalendarClock className="size-4" style={{ color: NARANJA }} />Plazos por completar: <strong>{fmtNumber(d.plazos_por_completar)}</strong></span>
            <span className="flex items-center gap-1.5"><Clock className="text-destructive size-4" />Pendientes vencidos al corte: <strong>{fmtNumber(d.vencidos)}</strong></span>
            {rol !== 'visor' && (
              <span className="flex items-center gap-1.5">Por validar SERVICON: <strong>{fmtNumber(ev.por_validar ?? 0)}</strong></span>
            )}
            {(rol === 'residente' || rol === 'admin') && (
              <span className="flex items-center gap-1.5">Validados por publicar: <strong>{fmtNumber(ev.por_publicar ?? 0)}</strong></span>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Distribución por plazo</CardTitle>
                <CardDescription>Atendidos y pendientes dentro de cada plazo.</CardDescription>
              </CardHeader>
              <CardContent>
                <Apiladas filas={plazos.map((p) => ({ etiqueta: `${p.plazo} ${p.plazo === 1 ? 'día' : 'días'}`, a: p.atendidos, b: p.pendientes, total: p.total }))} />
                <Leyenda a="Atendidos" b="Pendientes" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Avance global</CardTitle></CardHeader>
              <CardContent>
                {Number(d.total) === 0 ? <p className="text-muted-foreground py-6 text-center text-[13px]">Sin registros.</p> : (
                  <Dona a={Number(d.atendidos)} b={Number(d.sin_atencion)} centro={pct(d.avance)}
                    etiquetaA={`${fmtNumber(d.atendidos)} atendidos`} etiquetaB={`${fmtNumber(d.sin_atencion)} pendientes`} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader><CardTitle>Detalle situacional por plazo</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead className="text-muted-foreground text-[11.5px]">
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Plazo</th><th className="text-left font-medium">Vencimiento</th>
                      <th className="text-right font-medium">Total</th><th className="text-right font-medium">Atendidos</th>
                      <th className="text-right font-medium">Pendientes</th><th className="text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plazos.map((p) => (
                      <tr key={p.plazo} onClick={() => abrir({ cifra: 'total', plazo: p.plazo, titulo: `Plazo ${p.plazo} ${p.plazo === 1 ? 'día' : 'días'}` })}
                        className="even:bg-secondary/40 hover:bg-primary/[0.06] cursor-pointer border-b border-border/60">
                        <td className="py-2">{p.plazo} {p.plazo === 1 ? 'día' : 'días'}</td>
                        <td>{fmtDate(p.vencimiento)}</td>
                        <td className="text-right">{fmtNumber(p.total)}</td>
                        <td className="text-right" style={{ color: VERDE }}>{fmtNumber(p.atendidos)}</td>
                        <td className="text-right" style={{ color: NARANJA }}>{fmtNumber(p.pendientes)}</td>
                        <td className="text-right">{pct(p.avance)}</td>
                      </tr>
                    ))}
                    {plazos.length > 0 && (
                      <tr className="bg-primary/[0.07] font-bold">
                        <td className="py-2">TOTAL</td><td />
                        <td className="text-right">{fmtNumber(d.total)}</td>
                        <td className="text-right" style={{ color: VERDE }}>{fmtNumber(d.atendidos)}</td>
                        <td className="text-right" style={{ color: NARANJA }}>{fmtNumber(d.sin_atencion)}</td>
                        <td className="text-right">{pct(d.avance)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {plazos.length === 0 && <p className="text-muted-foreground py-6 text-center text-[13px]">Sin registros.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidencia y observaciones</CardTitle>
                <CardDescription>Separadas del avance reportado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  ['Evidencia completa', ev.completa, 'success'],
                  ['Evidencia incompleta', ev.incompleta, 'warning'],
                  ['Observaciones abiertas', ev.observaciones_abiertas, 'warning'],
                  [rol === 'visor' ? 'Aceptados COVINCA' : 'Conforme COVINCA', ev.conformes_covinca, 'info'],
                  ...(rol === 'visor' ? [['Por revisar (publicados)', ev.por_revisar_covinca, 'info']] : []),
                ].map(([t, v, tono]) => (
                  <div key={String(t)} className="flex items-center justify-between text-[13px]">
                    <span>{t}</span><Badge variant={tono as any}>{fmtNumber(Number(v ?? 0))}</Badge>
                  </div>
                ))}
                <div className="border-t border-border pt-2">
                  {rol === 'visor' ? (
                    <>
                      <p className="mb-1.5 text-[12px] font-semibold">Últimos registros publicados</p>
                      {(d.ultimos_publicados as any[]).length === 0 && <p className="text-muted-foreground text-[12.5px]">Sin publicaciones.</p>}
                      {(d.ultimos_publicados as any[]).map((x) => (
                        <Link key={x.item_id} href={`/pci/${x.pci_id}/item/${x.item_id}`} className="hover:bg-secondary/60 flex items-center justify-between rounded px-1.5 py-1 text-[12.5px]">
                          <span>{x.pci} · Ítem {x.item}</span>
                          <Badge variant={x.estado === 'Conforme' ? 'success' : x.estado === 'Por revisar' ? 'info' : 'warning'}>{x.estado}</Badge>
                        </Link>
                      ))}
                    </>
                  ) : (
                    <>
                      <p className="mb-1.5 text-[12px] font-semibold">Atendidos con evidencia incompleta</p>
                      {(d.incompletos as any[]).length === 0 && <p className="text-muted-foreground text-[12.5px]">Ninguno.</p>}
                      {(d.incompletos as any[]).map((x) => (
                        <div key={x.item_id} className="flex items-center justify-between gap-2 py-0.5 text-[12.5px]">
                          <span className="truncate">{x.pci} · Ítem {x.item} · Falta {(x.faltan as string[]).map(nombreFase).join(', ')}</span>
                          <Link href={`/pci/${x.pci_id}/item/${x.item_id}`}><Button size="sm" variant="outline"><Eye className="size-3.5" />Revisar</Button></Link>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function PestanaMr({ rol, f, fijar, datos: d, cargando, error, cuadrillas, supervisores, actividades }: {
  rol: Rol; f: any; fijar: (c: any) => void; datos: any; cargando: boolean; error: unknown
  cuadrillas: any[]; supervisores: { id: string; nombre: string }[]; actividades: any[]
}) {
  const u = d?.unidad ? ` ${d.unidad}` : ''
  const homogeneo = !!d?.homogeneo
  const programado = Number(d?.programado ?? 0)
  const ejecutado = Number(d?.ejecutado ?? 0)
  const avance = programado > 0 ? (100 * ejecutado) / programado : null
  const rendimiento = d?.jornadas > 0 ? ejecutado / Number(d.jornadas) : null
  const maxDia = Math.max(1, ...((d?.por_dia ?? []) as any[]).flatMap((x) => [Number(x.programado), Number(x.ejecutado)]))
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Filtro etiqueta="Fecha inicial"><Input type="date" value={f.desde} max={f.hasta} onChange={(e) => fijar({ desde: e.target.value })} className="h-9" /></Filtro>
          <Filtro etiqueta="Fecha final"><Input type="date" value={f.hasta} min={f.desde} onChange={(e) => fijar({ hasta: e.target.value })} className="h-9" /></Filtro>
          <Filtro etiqueta="Cuadrilla">
            <SelectSimple valor={f.crew} alCambiar={(v) => fijar({ crew: v })} todos={rol === 'supervisor' ? 'Todas las asignadas' : 'Todas'}
              opciones={cuadrillas.map((c) => ({ v: c.id, t: `${c.code} · ${c.name}` }))} />
          </Filtro>
          {(rol === 'admin' || rol === 'residente') && (
            <Filtro etiqueta="Supervisor">
              <SelectSimple valor={f.sup} alCambiar={(v) => fijar({ sup: v })} todos="Todos" opciones={supervisores.map((s) => ({ v: s.id, t: s.nombre }))} />
            </Filtro>
          )}
          <Filtro etiqueta="Actividad" className="min-w-56">
            <SelectSimple valor={f.act} alCambiar={(v) => fijar({ act: v, unit: '' })} todos="Todas (conteo por actividad)"
              opciones={actividades.map((a: any) => ({ v: a.id, t: `${a.name}${a.units?.symbol ? ` (${a.units.symbol})` : ''}` }))} />
          </Filtro>
        </CardContent>
      </Card>
      <Errores error={error} />

      {cargando ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}</div>
      ) : d && (homogeneo ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard index={0} label="Programado" value={`${fmtNumber(programado, 2)}${u}`} icon={CalendarDays} tone="primary" />
            <StatCard index={1} label="Ejecutado" value={`${fmtNumber(ejecutado, 2)}${u}`} icon={CheckCircle2} tone="success" />
            <StatCard index={2} label="Saldo" value={`${fmtNumber(Math.max(programado - ejecutado, 0), 2)}${u}`} icon={Clock} tone="warning" />
            <StatCard index={3} label="Avance" value={avance == null ? 'Sin registros' : `${fmtNumber(avance, 1)} %`} icon={Target} tone="info" />
          </div>
          <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border px-4 py-2.5 text-[13px]">
            <span className="flex items-center gap-1.5"><Gauge className="size-4" />Rendimiento real: <strong>{rendimiento == null ? 'Sin jornadas' : `${fmtNumber(rendimiento, 1)}${u}/jornada`}</strong></span>
            <span className="flex items-center gap-1.5"><Target className="size-4" />Referencia: <strong>{d.referencia == null ? 'Sin rendimiento configurado' : `${fmtNumber(Number(d.referencia), 1)}${u}/jornada`}</strong></span>
            <span className="flex items-center gap-1.5"><Ruler className="size-4" />Unidad homogénea: <strong>{d.unidad ?? '—'}</strong></span>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Programado vs. ejecutado por día</CardTitle>
                <CardDescription>Unidad: {d.unidad ?? '—'}.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-44 items-end gap-3 overflow-x-auto pb-1">
                  {(d.por_dia as any[]).map((x) => (
                    <div key={x.fecha} className="flex min-w-14 flex-1 flex-col items-center gap-1">
                      <div className="flex h-36 items-end gap-1">
                        <div className="bg-primary w-4 rounded-t" style={{ height: `${(100 * Number(x.programado)) / maxDia}%` }} title={`Programado ${x.programado}`} />
                        <div className="w-4 rounded-t" style={{ height: `${(100 * Number(x.ejecutado)) / maxDia}%`, background: VERDE }} title={`Ejecutado ${x.ejecutado}`} />
                      </div>
                      <span className="text-muted-foreground text-[10.5px]">{fmtDate(x.fecha).slice(0, 5)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground mt-2 flex items-center gap-4 text-[11.5px]">
                  <span className="flex items-center gap-1.5"><span className="bg-primary size-2.5 rounded-sm" />Programado</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: VERDE }} />Ejecutado</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Avance</CardTitle></CardHeader>
              <CardContent>
                <Dona a={ejecutado} b={Math.max(programado - ejecutado, 0)} centro={avance == null ? '—' : `${fmtNumber(avance, 0)} %`}
                  etiquetaA={`${fmtNumber(ejecutado, 1)}${u} ejecutados`} etiquetaB={`${fmtNumber(Math.max(programado - ejecutado, 0), 1)}${u} saldo`} />
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
                  <p className="flex justify-between"><span>Reportes publicados</span><Badge variant="success">{fmtNumber(d.partes_publicados)}</Badge></p>
                  <p className="flex justify-between"><span>Observaciones abiertas</span><Badge variant="warning">{fmtNumber(d.observaciones_abiertas)}</Badge></p>
                </div>
              </CardContent>
            </Card>
          </div>
          {(d.por_cuadrilla as any[]).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Avance por cuadrilla</CardTitle></CardHeader>
              <CardContent>
                <Apiladas filas={(d.por_cuadrilla as any[]).map((c) => ({
                  etiqueta: c.cuadrilla, a: Number(c.ejecutado), b: Number(c.saldo), total: Number(c.programado),
                  texto: `${fmtNumber(Number(c.ejecutado), 0)} / ${fmtNumber(Number(c.programado), 0)}`,
                }))} />
                <Leyenda a="Ejecutado" b="Saldo" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Detalle de programación</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead className="text-muted-foreground text-[11.5px]">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Fecha</th><th className="text-left font-medium">Cuadrilla</th>
                    <th className="text-left font-medium">Sector</th><th className="text-left font-medium">Progresiva</th>
                    <th className="text-right font-medium">Programado</th><th className="text-right font-medium">Ejecutado</th>
                    <th className="text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.detalle as any[]).map((x) => (
                    <tr key={x.plan_item_id} className="even:bg-secondary/40 border-b border-border/60">
                      <td className="py-2">{fmtDate(x.fecha)}</td><td>{x.cuadrilla}</td><td>{x.sector ?? '—'}</td>
                      <td>{fmtProgresiva(x.prog_inicio)} – {fmtProgresiva(x.prog_fin)}</td>
                      <td className="text-right">{fmtNumber(Number(x.programado), 2)}{u}</td>
                      <td className="text-right" style={{ color: VERDE }}>{fmtNumber(Number(x.ejecutado), 2)}{u}</td>
                      <td className="text-right" style={{ color: NARANJA }}>{fmtNumber(Number(x.saldo), 2)}{u}</td>
                    </tr>
                  ))}
                  {(d.detalle as any[]).length > 0 && (
                    <tr className="bg-primary/[0.07] font-bold">
                      <td className="py-2">TOTAL</td><td /><td /><td />
                      <td className="text-right">{fmtNumber(programado, 2)}{u}</td>
                      <td className="text-right" style={{ color: VERDE }}>{fmtNumber(ejecutado, 2)}{u}</td>
                      <td className="text-right" style={{ color: NARANJA }}>{fmtNumber(Math.max(programado - ejecutado, 0), 2)}{u}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {(d.detalle as any[]).length === 0 && <p className="text-muted-foreground py-6 text-center text-[13px]">Sin programación de esta actividad en el período.</p>}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard index={0} label="Actividades" value={Number(d.actividades)} icon={Layers} tone="primary" />
            <StatCard index={1} label="Culminadas" value={Number(d.culminadas)} icon={CheckCircle2} tone="success" />
            <StatCard index={2} label="Pendientes" value={Number(d.actividades) - Number(d.culminadas)} icon={Clock} tone="warning" />
            <StatCard index={3} label="Cumplimiento" value={Number(d.actividades) > 0 ? `${fmtNumber((100 * Number(d.culminadas)) / Number(d.actividades), 1)} %` : 'Sin registros'} icon={Target} tone="info" />
          </div>
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg bg-info/[0.07] px-3.5 py-2.5 text-[12.5px]">
            <Database className="text-info size-4 shrink-0" />
            Selección heterogénea: se cuentan actividades y se detalla cada una con su unidad. Elige una actividad para ver programado, ejecutado y saldo.
          </div>
          <Card>
            <CardHeader><CardTitle>Detalle de actividades</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead className="text-muted-foreground text-[11.5px]">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Actividad</th><th className="text-left font-medium">Unidad</th>
                    <th className="text-right font-medium">Programado</th><th className="text-right font-medium">Ejecutado</th>
                    <th className="text-right font-medium">Saldo</th><th className="text-right font-medium">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.por_actividad as any[]).map((x) => (
                    <tr key={`${x.activity_id}-${x.unidad}`} onClick={() => fijar({ act: x.activity_id })}
                      className="even:bg-secondary/40 hover:bg-primary/[0.06] cursor-pointer border-b border-border/60">
                      <td className="py-2">{x.actividad}</td><td>{x.unidad ?? '—'}</td>
                      <td className="text-right">{fmtNumber(Number(x.programado), 2)}</td>
                      <td className="text-right" style={{ color: VERDE }}>{fmtNumber(Number(x.ejecutado), 2)}</td>
                      <td className="text-right" style={{ color: NARANJA }}>{fmtNumber(Number(x.saldo), 2)}</td>
                      <td className="text-right">{pct(x.avance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(d.por_actividad as any[]).length === 0 && <p className="text-muted-foreground py-6 text-center text-[13px]">Sin programación MR en el período.</p>}
            </CardContent>
          </Card>
          {(d.no_programadas as any[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ejecutado no programado</CardTitle>
                <CardDescription>Se informa aparte: no entra en el denominador del avance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-[13px]">
                {(d.no_programadas as any[]).map((x, i) => (
                  <p key={i} className="flex justify-between"><span>{x.actividad}</span><strong className="tabular-nums">{fmtNumber(Number(x.ejecutado), 2)} {x.unidad ?? ''}</strong></p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ))}
    </div>
  )
}
