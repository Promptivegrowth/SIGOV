'use client'

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Camera, Search, X, MapPin, Clock, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import {
  EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey, Progresiva,
} from '@/components/shared/misc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { fmtDate, fmtDateTime, cn } from '@/lib/utils'
import { EVIDENCE_PHASE } from '@/lib/constants'
import type { Database } from '@/types/database'

/**
 * Fotos / Evidencias (apartado 4.13).
 *
 * El panel fotográfico, agrupado por día y filtrable por fase. Es lo que se
 * entrega al cliente como sustento, así que lo que manda es poder encontrar
 * rápido la foto de un trabajo concreto: por actividad, por tramo o por
 * código de PCI.
 *
 * Las miniaturas se piden firmadas y en lote. Una URL por foto serían
 * cuarenta peticiones para abrir una pantalla.
 */

type Fase = Database['public']['Enums']['evidence_phase']

const FASES: { k: Fase | null; label: string }[] = [
  { k: null, label: 'Todas las fases' },
  { k: 'antes', label: 'Antes' },
  { k: 'durante', label: 'Durante' },
  { k: 'despues', label: 'Después' },
  { k: 'general', label: 'General' },
]

export function EvidenciasClient() {
  const { service, crew, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [preset, setPreset] = React.useState<DatePresetKey>('7d')
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])
  const [fase, setFase] = React.useState<Fase | null>(null)
  const [q, setQ] = React.useState('')
  const [abierta, setAbierta] = React.useState<any | null>(null)

  // El jefe de cuadrilla ve lo suyo; quien supervisa, todo el contrato
  const soloMiCuadrilla = role === 'jefe_cuadrilla' ? crew?.id ?? null : null

  const fotos = useQuery({
    queryKey: ['evidencias', service.id, range.from, range.to, fase, soloMiCuadrilla],
    queryFn: async () => {
      let consulta = sb.from('v_evidences')
        .select('*')
        .eq('service_id', service.id)
        .gte('work_date', range.from)
        .lte('work_date', range.to)
        .order('taken_at', { ascending: false })
        .limit(300)
      if (fase) consulta = consulta.eq('phase', fase)
      if (soloMiCuadrilla) consulta = consulta.eq('crew_id', soloMiCuadrilla)

      const { data, error } = await consulta
      if (error) throw error
      const filas = data ?? []

      // Una sola petición para todas las urls firmadas
      const rutas = [...new Set(filas.map((f: any) => f.storage_path).filter(Boolean))]
      const urls = new Map<string, string>()
      if (rutas.length) {
        const { data: firmadas } = await sb.storage.from('evidencias')
          .createSignedUrls(rutas as string[], 3600)
        for (const f of firmadas ?? []) {
          if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl)
        }
      }
      return filas.map((f: any) => ({ ...f, url: urls.get(f.storage_path) ?? null }))
    },
  })

  const visibles = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return fotos.data ?? []
    return (fotos.data ?? []).filter((f: any) =>
      [f.activity_name, f.section_name, f.pci_code, f.crew_name, f.caption]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(t))
    )
  }, [fotos.data, q])

  // Agrupadas por día, que es como se arma el panel fotográfico
  const porDia = React.useMemo(() => {
    const m = new Map<string, any[]>()
    for (const f of visibles) {
      const k = f.work_date ?? String(f.taken_at).slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [visibles])

  return (
    <>
      <PageHeader
        icon={Camera}
        title="Fotos / Evidencias"
        description="Las fotografías selladas de campo, por día y por fase."
        actions={<DateRangeTabs value={preset} onChange={setPreset} />}
      />

      <PageBody className="space-y-4">
        {/* ═══ Búsqueda y fases ═════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar por actividad, tramo o PCI…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Limpiar búsqueda"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="bg-muted inline-flex flex-wrap rounded-lg p-0.5">
            {FASES.map((f) => (
              <button
                key={f.label}
                onClick={() => setFase(f.k)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all',
                  fase === f.k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ La galería ═══════════════════════════════════════════════ */}
        {fotos.isLoading ? (
          <SkeletonList rows={6} />
        ) : !porDia.length ? (
          <Card><CardContent className="p-0">
            <EmptyState icon={Camera} title="Sin fotografías en este periodo"
              description="Cuando la cuadrilla registre evidencia desde el celular, aparecerá aquí."
              className="py-14" />
          </CardContent></Card>
        ) : (
          porDia.map(([dia, lista]) => (
            <section key={dia}>
              <h2 className="mb-2 text-[13px] font-semibold">
                {fmtDate(dia, 'long')}
                <span className="text-muted-foreground ml-2 text-[11.5px] font-normal">
                  {lista.length} {lista.length === 1 ? 'foto' : 'fotos'}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
                {lista.map((f: any) => {
                  const fase = EVIDENCE_PHASE[f.phase as keyof typeof EVIDENCE_PHASE]
                  return (
                    <button
                      key={f.id}
                      onClick={() => setAbierta(f)}
                      className="group bg-secondary relative aspect-square overflow-hidden rounded-xl border border-border transition-all hover:shadow-md"
                    >
                      {f.url ? (
                        <Image
                          src={f.url}
                          alt={f.activity_name ?? 'Evidencia'}
                          fill
                          sizes="(max-width:768px) 50vw, 200px"
                          className="object-cover transition-transform group-hover:scale-[1.03]"
                          unoptimized
                        />
                      ) : (
                        <span className="text-muted-foreground flex h-full items-center justify-center text-[11px]">
                          Sin vista previa
                        </span>
                      )}
                      <span className={cn(
                        'absolute bottom-0 left-0 px-1.5 py-0.5 text-[10px] font-medium text-white',
                        'bg-primary/85'
                      )}>
                        {fase?.label ?? f.phase}
                      </span>
                      {f.watermarked && (
                        <span className="bg-success/85 absolute top-1 right-1 rounded p-0.5" title="Con sello">
                          <ShieldCheck className="size-2.5 text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </PageBody>

      {/* ═══ El visor ═══════════════════════════════════════════════════ */}
      {abierta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-white">
                {abierta.activity_name ?? 'Evidencia'}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 text-[11.5px] text-white/70">
                <span>{abierta.section_name}</span>
                <Progresiva from={abierta.progresiva_m} className="text-[11px] text-white/70" />
                {abierta.pci_code && <span>{abierta.pci_code}</span>}
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {fmtDateTime(abierta.taken_at)}
                </span>
                {abierta.lat != null && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {Number(abierta.lat).toFixed(5)}, {Number(abierta.lng).toFixed(5)}
                  </span>
                )}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setAbierta(null)} aria-label="Cerrar">
              <X className="size-5 text-white" />
            </Button>
          </div>

          <div className="relative mx-4 mb-4 flex-1">
            {abierta.url && (
              <Image src={abierta.url} alt={abierta.activity_name ?? 'Evidencia'}
                fill className="object-contain" unoptimized />
            )}
          </div>
        </div>
      )}
    </>
  )
}
