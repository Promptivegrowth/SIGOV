'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Folder, FolderOpen, ChevronRight, FileText, Camera, ShieldCheck,
  Wallet, CalendarRange, TriangleAlert, Download, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { ImageViewer } from '@/components/shared/image-viewer'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  descargarFormato, datosDeParte, datosDeCharla, datosDeAst, datosDeVehiculo,
  type ClaveDeFormato,
} from '@/lib/formatos'
import { cn, fmtDate } from '@/lib/utils'
import { PLAN_ITEM_STATUS, WORK_ORDER_STATUS, PCI_ITEM_STATUS } from '@/lib/constants'
import { toast } from 'sonner'

/**
 * El archivo, como lo pide el apartado 11.1.
 *
 * La lista de documentos sirve para buscar uno concreto; esto sirve para lo
 * otro: recorrer lo registrado por donde se piensa en campo. Las cinco ramas
 * y el orden de sus niveles son los de la especificación, literales, porque
 * es el orden en que el cliente pide las cosas cuando revisa un mes.
 *
 * El árbol no guarda nada: se arma con lo que ya está registrado. Un nodo
 * vacío es un dato ausente, no una carpeta que falte crear.
 */

// ═══ La forma del árbol ═══════════════════════════════════════════════

type Hoja = {
  id: string
  etiqueta: string
  detalle?: string | null
  /** Qué pasa al pulsarla */
  abrir?:
    | { tipo: 'foto'; ruta: string }
    | { tipo: 'formato'; clave: ClaveDeFormato; id: string; crudo: any }
    | null
}

type Nodo = {
  nombre: string
  hijos: Map<string, Nodo>
  hojas: Hoja[]
}

/** Los importes, como los escribe la caja chica. */
const soles = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)

const nodo = (nombre: string): Nodo => ({ nombre, hijos: new Map(), hojas: [] })

/** Deja una hoja al final del camino, creando los nodos que falten. */
function sembrar(raiz: Nodo, camino: (string | null | undefined)[], hoja: Hoja) {
  let n = raiz
  for (const paso of camino) {
    const k = paso?.trim() || '(sin dato)'
    if (!n.hijos.has(k)) n.hijos.set(k, nodo(k))
    n = n.hijos.get(k)!
  }
  n.hojas.push(hoja)
}

/** Cuántas hojas cuelgan de un nodo, contando todo lo que hay debajo. */
function contar(n: Nodo): number {
  let t = n.hojas.length
  for (const h of n.hijos.values()) t += contar(h)
  return t
}

// ═══ Las cinco ramas ══════════════════════════════════════════════════

const RAMAS = [
  {
    clave: 'programacion' as const,
    nombre: 'PROGRAMACION',
    icono: CalendarRange,
    niveles: 'SEMANA / SECTOR / CUADRILLA / FECHA / ACTIVIDAD',
  },
  {
    clave: 'pci' as const,
    nombre: 'PCI',
    icono: TriangleAlert,
    niveles: 'CÓDIGO PCI / ÍTEM / FECHA / ANTES · DURANTE · DESPUÉS',
  },
  {
    clave: 'ssoma' as const,
    nombre: 'SSOMA',
    icono: ShieldCheck,
    niveles: 'FECHA / CUADRILLA / TIPO DE DOCUMENTO',
  },
  {
    clave: 'gastos' as const,
    nombre: 'GASTOS',
    icono: Wallet,
    niveles: 'FECHA / CUADRILLA',
    soloAdmin: true,
  },
  {
    clave: 'reportes' as const,
    nombre: 'REPORTES',
    icono: FileText,
    niveles: 'FECHA / CUADRILLA',
  },
]

type ClaveDeRama = (typeof RAMAS)[number]['clave']

// ═══ El componente ════════════════════════════════════════════════════

export function ArbolDeArchivo({ desde, hasta }: { desde: string; hasta: string }) {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [rama, setRama] = React.useState<ClaveDeRama>('programacion')
  const [abiertos, setAbiertos] = React.useState<Set<string>>(new Set())
  const [foto, setFoto] = React.useState<string | null>(null)
  const [bajando, setBajando] = React.useState<string | null>(null)

  const visibles = RAMAS.filter((r) => !r.soloAdmin || can.admin)
  const actual = visibles.find((r) => r.clave === rama) ?? visibles[0]

  const arbol = useQuery({
    queryKey: ['arbol-archivo', service.id, actual.clave, desde, hasta],
    queryFn: () => construir(sb, service.id, actual.clave, desde, hasta),
  })

  // Al cambiar de rama se colapsa todo: lo abierto de otra no significa nada
  React.useEffect(() => setAbiertos(new Set()), [rama, desde, hasta])

  const alternar = (ruta: string) =>
    setAbiertos((s) => {
      const n = new Set(s)
      n.has(ruta) ? n.delete(ruta) : n.add(ruta)
      return n
    })

  /** Baja el PDF oficial de la hoja, con los datos que pide su formato. */
  const bajar = async (h: Hoja) => {
    if (h.abrir?.tipo !== 'formato') return
    setBajando(h.id)
    try {
      const cab = {
        servicio: service.name,
        cliente: service.client_name,
        contrato: service.contract_code,
        emitidoPor: 'SIGOV',
      }
      const { clave, id, crudo } = h.abrir
      let datos
      if (clave === 'parte') {
        const { data } = await sb.from('v_work_entries')
          .select('*').eq('work_order_id', id).order('created_at')
        datos = datosDeParte(crudo, data ?? [], cab)
      } else if (clave === 'charla') {
        const { data } = await sb.from('talk_attendance')
          .select('full_name, dni, position').eq('talk_id', id)
        datos = datosDeCharla(crudo, data ?? [], cab)
      } else if (clave === 'ast') {
        const { data } = await sb.from('ats_signatures')
          .select('full_name, dni').eq('ats_id', id)
        datos = datosDeAst(crudo, cab,
          (data ?? []).map((f: any) => ({ nombre: f.full_name, dni: f.dni, cargo: null })))
      } else {
        datos = datosDeVehiculo(crudo, cab)
      }
      await descargarFormato(clave, datos)
    } catch (e: any) {
      toast.error('No se pudo generar el documento', { description: e?.message })
    } finally {
      setBajando(null)
    }
  }

  /** Abre la foto pidiendo su url firmada en el momento. */
  const verFoto = async (ruta: string) => {
    const { data } = await sb.storage.from('evidencias').createSignedUrl(ruta, 600)
    if (data?.signedUrl) setFoto(data.signedUrl)
    else toast.error('La fotografía ya no está disponible')
  }

  return (
    <div className="space-y-3">
      {/* ═══ Las ramas ════════════════════════════════════════════════ */}
      <div className="flex flex-wrap gap-2">
        {visibles.map((r) => (
          <button
            key={r.clave}
            onClick={() => setRama(r.clave)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
              rama === r.clave
                ? 'border-primary bg-primary/8'
                : 'border-border bg-card hover:border-primary/30'
            )}
          >
            <r.icono className="size-3.5" />
            {r.nombre}
          </button>
        ))}
      </div>

      <p className="text-muted-foreground text-[11.5px]">
        <code className="text-[11px]">{actual.nombre} / {actual.niveles}</code>
      </p>

      <Card>
        <CardContent className="px-2 py-2">
          {arbol.isLoading ? (
            <div className="px-2"><SkeletonList rows={8} /></div>
          ) : !arbol.data || !contar(arbol.data) ? (
            <EmptyState
              icon={FolderOpen}
              title="Sin registros en este periodo"
              description="Amplía el rango de fechas. Las carpetas aparecen solas cuando hay algo registrado."
              className="py-12"
            />
          ) : (
            <Rama
              nodo={arbol.data}
              ruta=""
              nivel={0}
              abiertos={abiertos}
              alternar={alternar}
              alAbrirFoto={verFoto}
              alBajar={bajar}
              bajando={bajando}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!foto} onOpenChange={(v) => !v && setFoto(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Fotografía</DialogTitle></DialogHeader>
          {foto && <ImageViewer src={foto} className="h-[70vh] w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══ El dibujo de una rama ════════════════════════════════════════════

function Rama({
  nodo: n, ruta, nivel, abiertos, alternar, alAbrirFoto, alBajar, bajando,
}: {
  nodo: Nodo
  ruta: string
  nivel: number
  abiertos: Set<string>
  alternar: (r: string) => void
  alAbrirFoto: (p: string) => void
  alBajar: (h: Hoja) => void
  bajando: string | null
}) {
  const hijos = [...n.hijos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <ul>
      {hijos.map((h) => {
        const suRuta = `${ruta}/${h.nombre}`
        const abierto = abiertos.has(suRuta)
        return (
          <li key={suRuta}>
            <button
              onClick={() => alternar(suRuta)}
              className="hover:bg-secondary/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
              style={{ paddingLeft: `${nivel * 18 + 8}px` }}
            >
              <ChevronRight className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform',
                abierto && 'rotate-90')} />
              {abierto
                ? <FolderOpen className="text-primary size-4 shrink-0" />
                : <Folder className="text-primary/70 size-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.nombre}</span>
              <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                {contar(h)}
              </span>
            </button>

            {abierto && (
              <Rama
                nodo={h} ruta={suRuta} nivel={nivel + 1}
                abiertos={abiertos} alternar={alternar}
                alAbrirFoto={alAbrirFoto} alBajar={alBajar} bajando={bajando}
              />
            )}
          </li>
        )
      })}

      {n.hojas.map((h) => (
        <li key={h.id}>
          <div
            className="hover:bg-secondary/40 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
            style={{ paddingLeft: `${nivel * 18 + 26}px` }}
          >
            {h.abrir?.tipo === 'foto'
              ? <Camera className="text-muted-foreground size-3.5 shrink-0" />
              : <FileText className="text-muted-foreground size-3.5 shrink-0" />}

            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              {h.etiqueta}
              {h.detalle && (
                <span className="text-muted-foreground ml-2 text-[11.5px]">{h.detalle}</span>
              )}
            </span>

            {h.abrir?.tipo === 'foto' && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                onClick={() => alAbrirFoto((h.abrir as any).ruta)}>
                Ver
              </Button>
            )}
            {h.abrir?.tipo === 'formato' && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                disabled={bajando === h.id} onClick={() => alBajar(h)}>
                {bajando === h.id
                  ? <Loader2 className="size-3 animate-spin" />
                  : <Download className="size-3" />}
                PDF
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ═══ De dónde sale cada rama ══════════════════════════════════════════

async function construir(
  sb: any, servicioId: string, rama: ClaveDeRama, desde: string, hasta: string
): Promise<Nodo> {
  const raiz = nodo('/')

  if (rama === 'programacion') {
    // SEMANA / SECTOR / CUADRILLA / FECHA / ACTIVIDAD
    const { data } = await sb.from('v_plan_items').select('*')
      .eq('service_id', servicioId)
      .gte('scheduled_on', desde).lte('scheduled_on', hasta)
      .order('scheduled_on').limit(4000)
    for (const p of data ?? []) {
      sembrar(raiz, [
        `Semana ${p.week} · ${p.year}`,
        p.section_name,
        p.crew_name,
        fmtDate(p.scheduled_on),
      ], {
        id: p.id,
        etiqueta: p.activity_name ?? 'Actividad',
        detalle: [
          p.prog_start_txt && p.prog_end_txt ? `${p.prog_start_txt} → ${p.prog_end_txt}` : null,
          `${p.executed_qty ?? 0} de ${p.target_qty ?? 0} ${p.unit_symbol ?? ''}`.trim(),
          (PLAN_ITEM_STATUS as any)[p.status]?.label ?? p.status,
        ].filter(Boolean).join(' · '),
      })
    }
    return raiz
  }

  if (rama === 'pci') {
    // CÓDIGO PCI / ÍTEM / FECHA / ANTES · DURANTE · DESPUÉS
    const { data: items } = await sb.from('v_pci_items').select('*')
      .eq('service_id', servicioId).order('pci_code').limit(2000)
    const lista = items ?? []
    const ids = lista.map((i: any) => i.id)

    // Las fotos de esos ítems, en una sola petición
    const fotos = new Map<string, any[]>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('v_evidences').select('*')
        .in('pci_item_id', ids.slice(i, i + 200)).order('taken_at')
      for (const f of data ?? []) {
        fotos.set(f.pci_item_id, [...(fotos.get(f.pci_item_id) ?? []), f])
      }
    }

    const FASE: Record<string, string> = {
      antes: 'ANTES', durante: 'DURANTE', despues: 'DESPUES', general: 'GENERAL',
    }

    for (const it of lista) {
      const suyas = fotos.get(it.id) ?? []
      if (!suyas.length) {
        // El ítem existe aunque todavía no tenga evidencia: se ve el hueco
        sembrar(raiz, [it.pci_code, `Ítem ${it.item_number}`], {
          id: it.id,
          etiqueta: it.description ?? 'Sin descripción',
          detalle: [
            (PCI_ITEM_STATUS as any)[it.status]?.label ?? it.status,
            'sin evidencia',
            `vence ${fmtDate(it.due_date)}`,
          ].join(' · '),
        })
        continue
      }
      for (const f of suyas) {
        sembrar(raiz, [
          it.pci_code,
          `Ítem ${it.item_number}`,
          fmtDate(f.work_date ?? String(f.taken_at).slice(0, 10)),
          FASE[f.phase] ?? String(f.phase).toUpperCase(),
        ], {
          id: f.id,
          etiqueta: f.caption || f.activity_name || 'Fotografía',
          detalle: f.watermarked ? 'Sellada' : 'Sin sello',
          abrir: { tipo: 'foto', ruta: f.storage_path },
        })
      }
    }
    return raiz
  }

  if (rama === 'ssoma') {
    // FECHA / CUADRILLA / TIPO DE DOCUMENTO
    const [charlas, ast, vehiculos, higiene, equipos] = await Promise.all([
      sb.from('safety_talks').select('*, crews(name)')
        .eq('service_id', servicioId).is('deleted_at', null)
        .gte('talk_date', desde).lte('talk_date', hasta).order('talk_date'),
      sb.from('v_ats').select('*').eq('service_id', servicioId)
        .gte('doc_date', desde).lte('doc_date', hasta).order('doc_date'),
      sb.from('vehicle_checks').select('*, vehicles(plate, kind)')
        .eq('service_id', servicioId).is('deleted_at', null)
        .gte('checked_on', desde).lte('checked_on', hasta).order('checked_on'),
      sb.from('hygiene_checks').select('*, crews(name)')
        .eq('service_id', servicioId).is('deleted_at', null)
        .gte('checked_on', desde).lte('checked_on', hasta).order('checked_on'),
      sb.from('safety_equipment_checks')
        .select('*, safety_equipment(code, kind, crews(name))')
        .eq('service_id', servicioId).is('deleted_at', null)
        .gte('checked_on', desde).lte('checked_on', hasta).order('checked_on'),
    ])

    for (const c of charlas.data ?? []) {
      sembrar(raiz, [fmtDate(c.talk_date), c.crews?.name, 'Charlas de seguridad'], {
        id: c.id,
        etiqueta: c.topic ?? 'Charla',
        detalle: `${c.duration_min ?? 0} min`,
        abrir: { tipo: 'formato', clave: 'charla', id: c.id,
          crudo: { ...c, crew_name: c.crews?.name } },
      })
    }
    for (const a of ast.data ?? []) {
      sembrar(raiz, [fmtDate(a.doc_date), a.crew_name, 'AST / IPERC'], {
        id: a.id,
        etiqueta: a.task ?? 'AST',
        detalle: [a.kind === 'conductor' ? 'Conductor' : 'Cuadrilla', `${a.firmas} firmas`]
          .filter(Boolean).join(' · '),
        abrir: { tipo: 'formato', clave: 'ast', id: a.id, crudo: a },
      })
    }
    for (const v of vehiculos.data ?? []) {
      sembrar(raiz, [fmtDate(v.checked_on), v.vehicles?.plate, 'Check list de vehículo'], {
        id: v.id,
        etiqueta: `Check list ${v.vehicles?.plate ?? ''}`.trim(),
        detalle: v.conforme === false ? 'Con observaciones' : 'Conforme',
        abrir: { tipo: 'formato', clave: 'vehiculo', id: v.id,
          crudo: { ...v, plate: v.vehicles?.plate, kind: v.vehicles?.kind } },
      })
    }
    for (const h of higiene.data ?? []) {
      sembrar(raiz, [fmtDate(h.checked_on), h.crews?.name, 'Elementos de higiene'], {
        id: h.id,
        etiqueta: h.item ?? 'Elemento',
        detalle: h.done ? 'Conforme' : 'Pendiente',
      })
    }
    for (const e of equipos.data ?? []) {
      const eq = e.safety_equipment
      const TIPO: Record<string, string> = {
        extintor: 'Inspección de extintores',
        botiquin: 'Inspección de botiquín',
        antiderrame: 'Kit antiderrame',
      }
      sembrar(raiz, [fmtDate(e.checked_on), eq?.crews?.name, TIPO[eq?.kind] ?? 'Equipo de seguridad'], {
        id: e.id,
        etiqueta: eq?.code ?? 'Equipo',
        detalle: e.conforme === false ? (e.findings ?? 'Observado') : 'Conforme',
      })
    }
    return raiz
  }

  if (rama === 'gastos') {
    // FECHA / CUADRILLA
    const { data } = await sb.from('v_cash_movements').select('*')
      .eq('service_id', servicioId)
      .gte('occurred_on', desde).lte('occurred_on', hasta)
      .order('occurred_on').limit(3000)
    for (const m of data ?? []) {
      // Los movimientos de la caja del contrato no cuelgan de ninguna cuadrilla
      sembrar(raiz, [fmtDate(m.occurred_on), m.crew_name ?? `Caja ${m.box_code ?? ''}`.trim()], {
        id: m.id,
        etiqueta: m.description ?? m.category ?? 'Movimiento',
        detalle: [
          soles(Number(m.signed_amount ?? m.amount ?? 0)),
          m.receipt_number ? `Comp. ${m.receipt_number}` : null,
          m.status,
        ].filter(Boolean).join(' · '),
      })
    }
    return raiz
  }

  // REPORTES · FECHA / CUADRILLA
  const { data } = await sb.from('work_orders')
    .select('id, work_date, status, weather, headcount, start_time, end_time, notes, crews(name)')
    .eq('service_id', servicioId).is('deleted_at', null)
    .gte('work_date', desde).lte('work_date', hasta)
    .order('work_date').limit(2000)
  for (const p of data ?? []) {
    sembrar(raiz, [fmtDate(p.work_date), (p as any).crews?.name], {
      id: p.id,
      etiqueta: `Reporte diario ${fmtDate(p.work_date)}`,
      detalle: [
        (WORK_ORDER_STATUS as any)[p.status]?.label ?? p.status,
        p.headcount ? `${p.headcount} personas` : null,
      ].filter(Boolean).join(' · '),
      abrir: { tipo: 'formato', clave: 'parte', id: p.id,
        crudo: { ...p, crew_name: (p as any).crews?.name } },
    })
  }
  return raiz
}
