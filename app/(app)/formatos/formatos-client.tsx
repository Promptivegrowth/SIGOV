'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Eye, Download, Printer, HardHat, Megaphone, Car,
  Droplets, FireExtinguisher, BriefcaseMedical, SprayCan, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonList } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/primitives'
import type { LucideIcon } from 'lucide-react'
import type { Database } from '@/types/database'
import { fmtDate, cn } from '@/lib/utils'
import {
  FORMATOS, type ClaveDeFormato, type DatosDelFormato,
  descargarFormato, vistaPreviaFormato, imprimirFormato,
  datosDeParte, datosDeAst, datosDeCharla, datosDeVehiculo,
  datosDeEquipo, datosDeHigiene,
} from '@/lib/formatos'

/**
 * Los formatos oficiales de SERVICON (apartado 14).
 *
 * Ocho documentos que la cuadrilla llenaba a mano y que ahora salen de lo
 * que ya está registrado. Esta pantalla no los crea: los encuentra. Cada
 * fila es un registro real —un parte, un AST, una inspección— y los tres
 * botones son los que pide la especificación: ver, generar e imprimir.
 */

const ICONOS: Record<ClaveDeFormato, LucideIcon> = {
  parte: FileText,
  ast: HardHat,
  charla: Megaphone,
  vehiculo: Car,
  antiderrame: Droplets,
  extintor: FireExtinguisher,
  botiquin: BriefcaseMedical,
  higiene: SprayCan,
}

/** Qué equipo de seguridad corresponde a cada formato. */
type TipoDeEquipo = Database['public']['Enums']['safety_equipment_kind']

const EQUIPO: Partial<Record<ClaveDeFormato, TipoDeEquipo>> = {
  antiderrame: 'kit_antiderrame',
  extintor: 'extintor',
  botiquin: 'botiquin',
}

export function FormatosClient() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [clave, setClave] = React.useState<ClaveDeFormato>('parte')
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])
  const [previa, setPrevia] = React.useState<{ url: string; titulo: string } | null>(null)
  const [ocupado, setOcupado] = React.useState<string | null>(null)

  const cabecera = {
    servicio: service.name,
    cliente: service.client_name,
    contrato: service.contract_code,
    emitidoPor: profile.full_name,
  }

  // ── Los documentos disponibles del formato elegido ──────────────────────
  const docs = useQuery({
    queryKey: ['formatos', clave, service.id, range.from, range.to],
    queryFn: async () => {
      switch (clave) {
        case 'parte': {
          const { data } = await sb.from('work_orders')
            .select('id, work_date, status, weather, headcount, start_time, end_time, notes, crews(name)')
            .eq('service_id', service.id).is('deleted_at', null)
            .gte('work_date', range.from).lte('work_date', range.to)
            .order('work_date', { ascending: false }).limit(60)
          return (data ?? []).map((d: any) => ({
            id: d.id,
            titulo: `Parte del ${fmtDate(d.work_date)}`,
            detalle: [d.crews?.name, d.status].filter(Boolean).join(' · '),
            fecha: d.work_date,
            crudo: { ...d, crew_name: d.crews?.name },
          }))
        }
        case 'ast': {
          const { data } = await sb.from('v_ats')
            .select('*').eq('service_id', service.id)
            .gte('doc_date', range.from).lte('doc_date', range.to)
            .order('doc_date', { ascending: false }).limit(60)
          return (data ?? []).map((d: any) => ({
            id: d.id,
            titulo: d.task ?? 'AST',
            detalle: [d.kind === 'conductor' ? 'Conductor' : 'Cuadrilla', d.crew_name, `${d.firmas} firmas`]
              .filter(Boolean).join(' · '),
            fecha: d.doc_date,
            aviso: d.kind === 'conductor' && d.apto === false ? 'No apto' : null,
            crudo: d,
          }))
        }
        case 'charla': {
          const { data } = await sb.from('safety_talks')
            .select('*, crews(name), talk_attendance(full_name, dni, position)')
            .eq('service_id', service.id).is('deleted_at', null)
            .gte('talk_date', range.from).lte('talk_date', range.to)
            .order('talk_date', { ascending: false }).limit(60)
          return (data ?? []).map((d: any) => ({
            id: d.id,
            titulo: d.topic ?? 'Charla',
            detalle: [d.crews?.name, `${d.talk_attendance?.length ?? 0} asistentes`].filter(Boolean).join(' · '),
            fecha: d.talk_date,
            crudo: { ...d, crew_name: d.crews?.name },
          }))
        }
        case 'vehiculo': {
          const { data } = await sb.from('vehicle_checks')
            .select('*, vehicles(plate, kind), crews:vehicles(crew_id)')
            .eq('service_id', service.id).is('deleted_at', null)
            .gte('checked_on', range.from).lte('checked_on', range.to)
            .order('checked_on', { ascending: false }).limit(60)
          return (data ?? []).map((d: any) => ({
            id: d.id,
            titulo: `Check list ${d.vehicles?.plate ?? ''}`.trim(),
            detalle: [d.vehicles?.kind, d.conforme === false ? 'Con observaciones' : 'Conforme']
              .filter(Boolean).join(' · '),
            fecha: d.checked_on,
            aviso: d.conforme === false ? 'Observado' : null,
            crudo: { ...d, plate: d.vehicles?.plate, kind: d.vehicles?.kind },
          }))
        }
        case 'higiene': {
          const { data } = await sb.from('hygiene_checks')
            .select('*, crews(name)')
            .eq('service_id', service.id).is('deleted_at', null)
            .gte('checked_on', range.from).lte('checked_on', range.to)
            .order('checked_on', { ascending: false }).limit(200)
          // El formato de higiene es uno por día y cuadrilla, no por ítem
          const porDia = new Map<string, any[]>()
          for (const h of data ?? []) {
            const k = `${h.checked_on}|${h.crew_id ?? ''}`
            porDia.set(k, [...(porDia.get(k) ?? []), { ...h, crew_name: (h as any).crews?.name }])
          }
          return [...porDia.entries()].map(([k, filas]) => ({
            id: k,
            titulo: `Higiene del ${fmtDate(filas[0].checked_on)}`,
            detalle: [filas[0].crew_name, `${filas.length} elementos`].filter(Boolean).join(' · '),
            fecha: filas[0].checked_on,
            crudo: filas,
          }))
        }
        default: {
          // Extintores, botiquines y kits antiderrame comparten tabla
          const { data } = await sb.from('safety_equipment')
            .select('*, crews(name), safety_equipment_checks(id, checked_on, conforme, findings)')
            .eq('service_id', service.id).is('deleted_at', null)
            .eq('kind', EQUIPO[clave]!)
            .order('code').limit(80)
          return (data ?? []).map((d: any) => ({
            id: d.id,
            titulo: d.code ?? d.description ?? 'Equipo',
            detalle: [d.location, d.status].filter(Boolean).join(' · '),
            fecha: d.last_check_on ?? d.expires_on ?? range.to,
            aviso: d.status !== 'operativo' ? d.status : null,
            crudo: {
              ...d,
              crew_name: d.crews?.name,
              revisiones: (d.safety_equipment_checks ?? [])
                .sort((a: any, b: any) => String(b.checked_on).localeCompare(String(a.checked_on))),
            },
          }))
        }
      }
    },
  })

  /** Arma los datos del formato a partir de la fila elegida. */
  async function construir(fila: any): Promise<DatosDelFormato> {
    switch (clave) {
      case 'parte': {
        const { data } = await sb.from('v_work_entries')
          .select('*').eq('work_order_id', fila.id).order('created_at')
        return datosDeParte(fila.crudo, data ?? [], cabecera)
      }
      case 'ast': {
        const { data } = await sb.from('ats_signatures')
          .select('full_name, dni').eq('ats_id', fila.id)
        return datosDeAst(
          fila.crudo,
          cabecera,
          (data ?? []).map((f: any) => ({ nombre: f.full_name, dni: f.dni, cargo: null })),
        )
      }
      case 'charla':
        return datosDeCharla(fila.crudo, fila.crudo.talk_attendance ?? [], cabecera)
      case 'vehiculo':
        return datosDeVehiculo(fila.crudo, cabecera)
      case 'higiene':
        return datosDeHigiene(fila.crudo, {
          ...cabecera,
          fecha: fila.fecha,
          cuadrilla: fila.crudo[0]?.crew_name ?? null,
        })
      default:
        return datosDeEquipo(
          clave as 'antiderrame' | 'extintor' | 'botiquin',
          fila.crudo,
          fila.crudo.revisiones ?? [],
          cabecera,
        )
    }
  }

  /** Las tres acciones que pide el apartado 14. */
  async function accion(fila: any, que: 'ver' | 'pdf' | 'imprimir') {
    setOcupado(`${fila.id}:${que}`)
    try {
      const datos = await construir(fila)
      if (que === 'ver') {
        const url = await vistaPreviaFormato(clave, datos)
        setPrevia({ url, titulo: fila.titulo })
      } else if (que === 'pdf') {
        await descargarFormato(clave, datos)
        toast.success('Formato generado', { description: FORMATOS[clave].codigo })
      } else {
        await imprimirFormato(clave, datos)
      }
    } catch (e: any) {
      toast.error('No se pudo generar el formato', { description: e?.message })
    } finally {
      setOcupado(null)
    }
  }

  // La URL del objeto se libera al cerrar: si no, el blob queda en memoria
  const cerrarPrevia = () => {
    if (previa) URL.revokeObjectURL(previa.url)
    setPrevia(null)
  }

  const filas = docs.data ?? []

  return (
    <>
      <PageHeader
        icon={FileText}
        title="Formatos oficiales"
        description="Los ocho documentos de SERVICON, generados de lo que ya está registrado en campo."
        actions={clave !== 'extintor' && clave !== 'botiquin' && clave !== 'antiderrame'
          ? <DateRangeTabs value={preset} onChange={setPreset} />
          : undefined}
      />

      <PageBody className="space-y-5">
        {/* ═══ Los ocho formatos ════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
          {(Object.keys(FORMATOS) as ClaveDeFormato[]).map((k) => {
            const f = FORMATOS[k]
            const Icono = ICONOS[k]
            const activo = k === clave
            return (
              <button
                key={k}
                onClick={() => setClave(k)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                  activo
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'bg-card border-border hover:border-primary/40'
                )}
              >
                <span className={cn(
                  'flex size-8 items-center justify-center rounded-lg',
                  activo ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                )}>
                  <Icono className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[11.5px] font-semibold leading-tight', activo && 'text-primary')}>
                    {f.titulo}
                  </span>
                  <span className="text-muted-foreground block font-mono text-[9.5px]">{f.codigo}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* ═══ Los documentos disponibles ═══════════════════════════════ */}
        <Card>
          <CardContent className="px-0 py-2">
            {docs.isLoading ? (
              <div className="px-4"><SkeletonList rows={6} /></div>
            ) : !filas.length ? (
              <EmptyState
                icon={ICONOS[clave]}
                title="Nada que generar todavía"
                description={`Cuando se registre un ${FORMATOS[clave].titulo.toLowerCase()}, aparecerá aquí listo para imprimir.`}
                className="py-12"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {filas.map((f: any) => {
                  const enCurso = ocupado?.startsWith(`${f.id}:`)
                  return (
                    <li key={f.id} className="hover:bg-secondary/40 flex items-center gap-3 px-4 py-2.5 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-[13px] font-medium">
                          {f.titulo}
                          {f.aviso && (
                            <Badge variant="outline" className="border-warning/40 text-warning shrink-0">
                              {f.aviso}
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-[11.5px]">
                          {fmtDate(f.fecha)}{f.detalle ? ` · ${f.detalle}` : ''}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1">
                        <Tip label="Vista previa">
                          <Button variant="ghost" size="icon-sm" disabled={enCurso}
                            onClick={() => accion(f, 'ver')}>
                            <Eye className="size-3.5" />
                          </Button>
                        </Tip>
                        <Tip label="Generar PDF">
                          <Button variant="ghost" size="icon-sm" disabled={enCurso}
                            onClick={() => accion(f, 'pdf')}>
                            <Download className="size-3.5" />
                          </Button>
                        </Tip>
                        <Tip label="Imprimir">
                          <Button variant="ghost" size="icon-sm" disabled={enCurso}
                            onClick={() => accion(f, 'imprimir')}>
                            <Printer className="size-3.5" />
                          </Button>
                        </Tip>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>

      {/* ═══ Vista previa ═══════════════════════════════════════════════ */}
      {previa && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-white">
              {previa.titulo}
              <span className="ml-2 font-mono text-[11px] font-normal text-white/60">
                {FORMATOS[clave].codigo}
              </span>
            </p>
            <Button variant="ghost" size="icon" onClick={cerrarPrevia} aria-label="Cerrar vista previa">
              <X className="size-5 text-white" />
            </Button>
          </div>
          <iframe
            src={previa.url}
            title={previa.titulo}
            className="mx-4 mb-4 flex-1 rounded-lg border-0 bg-white"
          />
        </div>
      )}
    </>
  )
}
