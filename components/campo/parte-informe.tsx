'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Download, MapPin, Clock, Users, Camera, ShieldCheck, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EVIDENCE_PHASE, WORK_ORDER_STATUS } from '@/lib/constants'
import { descargarPdf, ORG_DEFAULT } from '@/lib/reports'
import { cn, fmtDate, fmtDateTime, fmtNumber, fmtProgresiva } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * El parte diario visto como informe.
 *
 * Nadie valida un parte mirando tarjetas sueltas: el supervisor necesita el
 * documento completo —cabecera, actividades, metrados y fotos— en una sola
 * pantalla, y poder descargarlo tal cual para el expediente del contrato.
 */
export function ParteInforme({
  open,
  onOpenChange,
  order,
  entries,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  order: any
  entries: any[]
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [bajando, setBajando] = React.useState(false)
  const [zoom, setZoom] = React.useState<any>(null)

  /** Todas las fotos del parte, con su URL firmada, en un solo viaje. */
  const evidencias = useQuery({
    queryKey: ['parte-evidencias', order?.id],
    enabled: open && !!order?.id,
    queryFn: async () => {
      const ids = (entries ?? []).map((e: any) => e.id)
      if (!ids.length) return []
      const { data } = await sb
        .from('evidences')
        .select('id, work_entry_id, phase, storage_path, caption, taken_at, lat, lng, accuracy_m, progresiva_m, sha256')
        .in('work_entry_id', ids)
        .order('taken_at')
      const rows = data ?? []
      if (!rows.length) return []
      const { data: urls } = await sb.storage
        .from('evidencias')
        .createSignedUrls(rows.map((r: any) => r.storage_path), 3600)
      const byPath = new Map((urls ?? []).map((u: any) => [u.path, u.signedUrl]))
      return rows.map((r: any) => ({ ...r, url: byPath.get(r.storage_path) ?? null }))
    },
  })

  const porRegistro = React.useMemo(() => {
    const m = new Map<string, any[]>()
    for (const ev of evidencias.data ?? []) {
      const arr = m.get(ev.work_entry_id) ?? []
      arr.push(ev)
      m.set(ev.work_entry_id, arr)
    }
    return m
  }, [evidencias.data])

  const totalMetrado = (entries ?? []).reduce((s, e: any) => s + Number(e.quantity ?? 0), 0)
  const st = order ? WORK_ORDER_STATUS[order.status as keyof typeof WORK_ORDER_STATUS] : null

  const descargar = async () => {
    if (!order) return
    setBajando(true)
    try {
      await descargarPdf(
        `SIGOV_parte_${order.work_date}_${(order.crews?.name ?? 'cuadrilla').replace(/\s+/g, '-')}`,
        {
          titulo: 'Parte diario de ejecución',
          subtitulo: `${order.crews?.name ?? ''} · ${fmtDate(order.work_date, 'long')}`,
          servicio: service.name,
          cliente: service.client_name,
          contrato: service.contract_code,
          periodo: fmtDate(order.work_date, 'long'),
          generadoPor: profile.full_name,
          organizacion: ORG_DEFAULT.nombre,
          ruc: ORG_DEFAULT.ruc,
        },
        [
          { header: 'Actividad', key: 'actividad', width: 52 },
          { header: 'Tramo', key: 'tramo', width: 34 },
          { header: 'Progresivas', key: 'prog', width: 30 },
          { header: 'Lado', key: 'lado', width: 18 },
          { header: 'Metrado', key: 'metrado', align: 'right', width: 22 },
          { header: 'Fotos', key: 'fotos', align: 'center', width: 14 },
        ],
        (entries ?? []).map((e: any) => ({
          actividad: e.activity_name,
          tramo: e.section_name ?? '—',
          prog: `${fmtProgresiva(e.prog_start_m)} → ${fmtProgresiva(e.prog_end_m)}`,
          lado: e.side ?? '—',
          metrado: `${fmtNumber(e.quantity, 1)} ${e.unit_symbol ?? ''}`,
          fotos: String((porRegistro.get(e.id) ?? []).length),
        })),
        {
          kpis: [
            { label: 'Registros', value: String(entries?.length ?? 0) },
            { label: 'Metrado total', value: fmtNumber(totalMetrado, 1) },
            { label: 'Evidencias', value: String(evidencias.data?.length ?? 0) },
            { label: 'Estado', value: st?.label ?? '—' },
          ],
          intro:
            `Cuadrilla ${order.crews?.name ?? '—'}` +
            (order.start_time ? ` · Jornada ${order.start_time.slice(0, 5)} a ${order.end_time?.slice(0, 5) ?? '—'}` : '') +
            (order.headcount ? ` · ${order.headcount} personas` : '') +
            (order.weather ? ` · Clima: ${order.weather}` : '') +
            (order.notes ? `\nObservaciones: ${order.notes}` : ''),
        }
      )
      toast.success('Informe descargado')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el informe')
    } finally {
      setBajando(false)
    }
  }

  if (!order) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="xl" className="max-h-[94vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <FileText className="size-4.5" />
              </span>
              Parte diario del {fmtDate(order.work_date, 'long')}
            </DialogTitle>
            <DialogDescription>
              {service.name}{service.contract_code ? ` · Contrato ${service.contract_code}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 space-y-4 overflow-y-auto px-1">
            {/* Cabecera del documento */}
            <div className="border-border grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border p-4 text-[12.5px] sm:grid-cols-4">
              {[
                ['Cuadrilla', order.crews?.name ?? '—'],
                ['Estado', st?.label ?? '—'],
                ['Jornada', order.start_time ? `${order.start_time.slice(0, 5)} – ${order.end_time?.slice(0, 5) ?? '—'}` : '—'],
                ['Personal', order.headcount ? `${order.headcount} personas` : '—'],
                ['Clima', order.weather ?? '—'],
                ['Registros', String(entries?.length ?? 0)],
                ['Metrado total', fmtNumber(totalMetrado, 1)],
                ['Evidencias', String(evidencias.data?.length ?? 0)],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p className="text-muted-foreground text-[10.5px] tracking-wide uppercase">{k}</p>
                  <p className="font-semibold">{v}</p>
                </div>
              ))}
            </div>

            {order.notes && (
              <div className="bg-muted/50 rounded-xl px-4 py-3 text-[12.5px]">
                <p className="text-muted-foreground text-[10.5px] tracking-wide uppercase">Observaciones del parte</p>
                <p className="mt-0.5">{order.notes}</p>
              </div>
            )}

            {order.review_notes && (
              <div className="bg-destructive/8 border-destructive/25 rounded-xl border px-4 py-3 text-[12.5px]">
                <p className="text-destructive text-[10.5px] font-semibold tracking-wide uppercase">
                  Observación del supervisor
                </p>
                <p className="mt-0.5">{order.review_notes}</p>
              </div>
            )}

            {/* Actividades ejecutadas, con sus fotos */}
            <div>
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Actividades ejecutadas ({entries?.length ?? 0})
              </p>

              {!entries?.length ? (
                <p className="text-muted-foreground border-border rounded-xl border border-dashed px-4 py-8 text-center text-[12.5px]">
                  El parte todavía no tiene registros.
                </p>
              ) : (
                <ul className="space-y-3">
                  {entries.map((e: any, i: number) => {
                    const fotos = porRegistro.get(e.id) ?? []
                    return (
                      <li key={e.id} className="border-border rounded-xl border p-3.5">
                        <div className="flex flex-wrap items-start gap-3">
                          <span className="text-muted-foreground mt-0.5 text-[12px] font-semibold tabular-nums">
                            {i + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold">{e.activity_name}</p>
                            <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]">
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3" />
                                {e.section_name}
                              </span>
                              <span className="font-mono">
                                {fmtProgresiva(e.prog_start_m)} → {fmtProgresiva(e.prog_end_m)}
                              </span>
                              <span className="capitalize">lado {e.side}</span>
                              {e.created_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {fmtDateTime(e.created_at)}
                                </span>
                              )}
                            </p>
                            {e.observation && (
                              <p className="text-muted-foreground mt-1 text-[12px] italic">
                                &laquo;{e.observation}&raquo;
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-[16px] font-bold tabular-nums leading-none">
                              {fmtNumber(e.quantity, 1)}
                            </div>
                            <div className="text-muted-foreground text-[10.5px]">{e.unit_symbol}</div>
                          </div>
                        </div>

                        {evidencias.isLoading ? (
                          <p className="text-muted-foreground mt-2.5 text-[11.5px]">Cargando fotos…</p>
                        ) : fotos.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {fotos.map((f: any) => (
                              <button
                                key={f.id}
                                onClick={() => setZoom(f)}
                                title="Ver la foto en grande"
                                className="group relative size-24 overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.03]"
                              >
                                {f.url ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={f.url} alt={f.caption ?? 'Evidencia'} loading="lazy"
                                    className="size-full object-cover" />
                                ) : (
                                  <span className="bg-muted flex size-full items-center justify-center">
                                    <Camera className="text-muted-foreground size-4" />
                                  </span>
                                )}
                                <span className={cn(
                                  'absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8.5px] font-semibold text-white backdrop-blur-sm',
                                  f.phase === 'antes' && 'bg-info/80',
                                  f.phase === 'durante' && 'bg-warning/80',
                                  f.phase === 'despues' && 'bg-success/80',
                                  f.phase === 'general' && 'bg-black/60'
                                )}>
                                  {EVIDENCE_PHASE[f.phase as keyof typeof EVIDENCE_PHASE].label.toUpperCase()}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-warning mt-2.5 text-[11.5px]">Sin evidencia fotográfica.</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <p className="text-muted-foreground border-border border-t pt-3 text-[11px]">
              Documento generado desde SIGOV el {fmtDateTime(new Date())} por {profile.full_name}.
              Las fotografías llevan GPS, fecha y huella digital, y no se pueden alterar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={descargar} loading={bajando}>
              <Download className="size-4" />
              Descargar el informe en PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Foto en grande, con lo que la sella */}
      <Dialog open={!!zoom} onOpenChange={() => setZoom(null)}>
        <DialogContent size="lg" className="p-0">
          {zoom && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.url} alt="Evidencia" className="max-h-[62vh] w-full rounded-t-2xl bg-black object-contain" />
              <div className="space-y-2 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].className}>
                    {EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].label}
                  </Badge>
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="size-2.5" />
                    Sellada e inmutable
                  </Badge>
                </div>
                {zoom.caption && <p className="text-[13px]">{zoom.caption}</p>}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11.5px]">
                  <div>
                    <dt className="text-muted-foreground">Capturada</dt>
                    <dd className="font-medium">{fmtDateTime(zoom.taken_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Progresiva</dt>
                    <dd className="font-medium">{fmtProgresiva(zoom.progresiva_m)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Coordenadas</dt>
                    <dd className="font-medium tabular-nums">
                      {zoom.lat?.toFixed(6)}, {zoom.lng?.toFixed(6)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Precisión</dt>
                    <dd className="font-medium">±{Number(zoom.accuracy_m ?? 0).toFixed(0)} m</dd>
                  </div>
                </dl>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
