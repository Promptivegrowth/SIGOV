'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, FileImage, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { ImageViewer } from '@/components/shared/image-viewer'
import { cn, fmtDate, startOfWeek, addDays, toISODate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/** Los formatos, en el orden en que se revisan, con su sigla para la celda. */
const TIPOS: Record<string, { nombre: string; sigla: string }> = {
  reporte_diario: { nombre: 'Reporte diario', sigla: 'RD' },
  ats: { nombre: 'ATS – Análisis de Trabajo Seguro', sigla: 'ATS' },
  charla: { nombre: 'Charla de 5 minutos', sigla: 'CH' },
  checklist_vehicular: { nombre: 'Checklist vehicular', sigla: 'CV' },
  higiene: { nombre: 'Checklist de higiene', sigla: 'HI' },
  inspeccion_equipos: { nombre: 'Inspección de equipos', sigla: 'EQ' },
  otro: { nombre: 'Otro formato', sigla: 'OT' },
}
const ORDEN = Object.keys(TIPOS)

const ESTADOS: Record<string, { label: string; className: string; dot: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-destructive/15 text-destructive', dot: 'bg-destructive' },
  observado: { label: 'Observado', className: 'bg-destructive/15 text-destructive', dot: 'bg-destructive' },
  pendiente_revision: { label: 'Por revisar', className: 'bg-info/15 text-info', dot: 'bg-info' },
  subsanado: { label: 'Subsanado · por revisar', className: 'bg-info/15 text-info', dot: 'bg-info' },
  cargado: { label: 'Registrado en la app', className: 'bg-warning/20 text-warning', dot: 'bg-warning' },
  conforme: { label: 'Conforme', className: 'bg-success/15 text-success', dot: 'bg-success' },
  borrador: { label: 'En borrador', className: 'bg-warning/20 text-warning', dot: 'bg-warning' },
  enviado: { label: 'Enviado · por validar', className: 'bg-info/15 text-info', dot: 'bg-info' },
  validado: { label: 'Validado', className: 'bg-success/15 text-success', dot: 'bg-success' },
}

type Fila = {
  crew_id: string; crew_code: string; crew_name: string; crew_numero: number | null
  fecha: string; tipo: string; vehicle_id: string | null; placa: string | null; titulo: string | null
  documento_id: string | null; estado: string; paginas: number; observacion: string | null; digital: boolean
}

const nombreDe = (f: Fila) =>
  (TIPOS[f.tipo]?.nombre ?? f.tipo) + (f.placa ? ` · ${f.placa}` : '') + (f.titulo ? ` · ${f.titulo}` : '')

/**
 * El tablero SSOMA (OBS-59): cuadrilla × día × formato, con lo que falta en
 * rojo y lo que espera revisión en azul. Un clic en la celda abre los
 * documentos de ese día con sus fotos; el Ing. SSOMA da conformidad u
 * observa (OBS-55/60), y el jefe de cuadrilla se entera en la app.
 */
export function TableroDocumentos({ crewFilter }: { crewFilter: string }) {
  const { service, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [lunes, setLunes] = React.useState(() => startOfWeek(new Date()))
  const [celda, setCelda] = React.useState<{ crew: string; fecha: string } | null>(null)
  const dias = React.useMemo(() => Array.from({ length: 7 }, (_, i) => toISODate(addDays(lunes, i))), [lunes])
  const puedeRevisar = ['admin', 'supervisor', 'ing_seguridad'].includes(role)

  const tablero = useQuery({
    queryKey: ['ssoma-tablero', service.id, dias[0], crewFilter],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ssoma_tablero' as any, {
        p_service_id: service.id,
        p_desde: dias[0],
        p_hasta: dias[6],
        p_crew_id: crewFilter === 'todas' ? null : crewFilter,
      } as any)
      if (error) throw error
      return (data ?? []) as Fila[]
    },
  })

  const filas = tablero.data ?? []
  const cuadrillas = React.useMemo(() => {
    const m = new Map<string, Fila>()
    filas.forEach((f) => { if (!m.has(f.crew_id)) m.set(f.crew_id, f) })
    return [...m.values()].sort((a, b) => (a.crew_numero ?? 99) - (b.crew_numero ?? 99) || a.crew_code.localeCompare(b.crew_code))
  }, [filas])
  const hoy = toISODate(new Date())
  const porRevisar = filas.filter((f) => ['pendiente_revision', 'subsanado'].includes(f.estado)).length
  const faltan = filas.filter((f) => f.estado === 'pendiente' && f.fecha <= hoy && f.tipo !== 'reporte_diario').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setLunes(addDays(lunes, -7))} aria-label="Semana anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-52 text-center text-[13px] font-semibold">
          Semana del {fmtDate(dias[0])} al {fmtDate(dias[6])}
        </span>
        <Button variant="outline" size="icon" onClick={() => setLunes(addDays(lunes, 7))} aria-label="Semana siguiente">
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setLunes(startOfWeek(new Date()))}>Esta semana</Button>
        <div className="ml-auto flex flex-wrap gap-2 text-[12px]">
          <Badge className={ESTADOS.pendiente_revision.className}>{porRevisar} por revisar</Badge>
          <Badge className={ESTADOS.pendiente.className}>{faltan} faltantes</Badge>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
        {['pendiente', 'pendiente_revision', 'cargado', 'conforme'].map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', ESTADOS[k].dot)} />
            {k === 'pendiente' ? 'Falta / observado' : ESTADOS[k].label}
          </span>
        ))}
        <span>RD reporte · ATS · CH charla · CV checklist vehicular · HI higiene</span>
      </div>

      {tablero.isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[860px] text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-card px-3 py-2 text-left font-semibold">Cuadrilla</th>
                  {dias.map((d) => (
                    <th key={d} className={cn('px-2 py-2 text-center font-semibold', d === hoy && 'text-primary')}>
                      {new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuadrillas.map((c) => (
                  <tr key={c.crew_id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 bg-card px-3 py-2">
                      <span className="font-semibold">{c.crew_code}</span>
                      <span className="text-muted-foreground block max-w-40 truncate">{c.crew_name}</span>
                    </td>
                    {dias.map((d) => {
                      const docs = filas
                        .filter((f) => f.crew_id === c.crew_id && f.fecha === d)
                        .sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo))
                      const futuro = d > hoy
                      return (
                        <td key={d} className="px-1.5 py-1.5 text-center">
                          <button
                            onClick={() => setCelda({ crew: c.crew_id, fecha: d })}
                            className={cn(
                              'hover:bg-secondary flex w-full flex-wrap justify-center gap-1 rounded-md p-1.5',
                              futuro && 'opacity-40',
                            )}
                            aria-label={`Documentos de ${c.crew_code} el ${d}`}
                          >
                            {docs.map((f, i) => {
                              const e = futuro && f.estado === 'pendiente' ? null : ESTADOS[f.estado]
                              return (
                                <span
                                  key={i}
                                  title={`${nombreDe(f)}: ${ESTADOS[f.estado]?.label ?? f.estado}`}
                                  className={cn(
                                    'rounded px-1 py-px text-[10px] font-semibold',
                                    e ? e.className : 'bg-muted text-muted-foreground',
                                  )}
                                >
                                  {TIPOS[f.tipo]?.sigla ?? '?'}
                                </span>
                              )
                            })}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {celda && (
        <DocumentosDeLaCelda
          filas={filas.filter((f) => f.crew_id === celda.crew && f.fecha === celda.fecha)}
          puedeRevisar={puedeRevisar}
          onClose={() => setCelda(null)}
        />
      )}
    </div>
  )
}

function DocumentosDeLaCelda({ filas, puedeRevisar, onClose }: { filas: Fila[]; puedeRevisar: boolean; onClose: () => void }) {
  const primera = filas[0]
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{primera?.crew_code} · {primera?.crew_name}</DialogTitle>
          <DialogDescription>Documentos del {primera ? fmtDate(primera.fecha, 'long') : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {[...filas]
            .sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo))
            .map((f, i) => <DocumentoRevisable key={i} fila={f} puedeRevisar={puedeRevisar} />)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DocumentoRevisable({ fila, puedeRevisar }: { fila: Fila; puedeRevisar: boolean }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [nota, setNota] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [ampliada, setAmpliada] = React.useState<string | null>(null)
  const e = ESTADOS[fila.estado]
  const esFoto = !['reporte_diario', 'higiene'].includes(fila.tipo)

  const paginas = useQuery({
    queryKey: ['documento-paginas', fila.documento_id],
    enabled: !!fila.documento_id && esFoto,
    queryFn: async () => {
      const { data, error } = await sb
        .from('documento_paginas' as any)
        .select('id, storage_path, taken_at')
        .eq('documento_id', fila.documento_id!)
        .is('deleted_at', null)
        .order('taken_at')
      if (error) throw error
      const rutas = (data ?? []).map((p: any) => p.storage_path)
      if (!rutas.length) return []
      const { data: firmadas } = await sb.storage.from('documentos').createSignedUrls(rutas, 3600)
      return (firmadas ?? []).map((x: any) => x.signedUrl).filter(Boolean) as string[]
    },
  })

  const revisar = async (conforme: boolean) => {
    if (!conforme && !nota.trim()) {
      toast.error('Escribe la observación: el jefe de cuadrilla necesita saber qué corregir.')
      return
    }
    setBusy(true)
    const { error } = await sb.rpc('revisar_documento' as any, {
      p_documento_id: fila.documento_id, p_conforme: conforme, p_nota: nota.trim() || null,
    } as any)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(conforme ? 'Documento conforme' : 'Documento observado: el jefe de cuadrilla ya fue avisado')
    setNota('')
    qc.invalidateQueries({ queryKey: ['ssoma-tablero'] })
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileImage className="text-muted-foreground size-4" />
        <span className="text-[13px] font-semibold">{nombreDe(fila)}</span>
        <Badge className={cn('ml-auto', e?.className)}>{e?.label ?? fila.estado}</Badge>
      </div>
      {fila.digital && fila.tipo !== 'reporte_diario' && (
        <p className="text-muted-foreground mt-1 text-[11.5px]">También se registró en el formulario de la app.</p>
      )}
      {fila.observacion && ['observado', 'subsanado'].includes(fila.estado) && (
        <p className="text-destructive mt-2 flex items-start gap-1.5 text-[12px]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {fila.observacion}
        </p>
      )}
      {esFoto && (paginas.data?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {paginas.data!.map((url, i) => (
            <button key={i} onClick={() => setAmpliada(url)} className="overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Página ${i + 1}`} className="h-28 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
      {puedeRevisar && fila.documento_id && esFoto && ['pendiente_revision', 'subsanado'].includes(fila.estado) && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
            rows={2}
            placeholder="Observación para el jefe de cuadrilla (obligatoria si se observa)…"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" loading={busy} onClick={() => revisar(false)}>
              <CircleX className="size-4" />Observar
            </Button>
            <Button variant="success" size="sm" loading={busy} onClick={() => revisar(true)}>
              <CircleCheck className="size-4" />Conforme
            </Button>
          </div>
        </div>
      )}
      {ampliada && (
        <Dialog open onOpenChange={() => setAmpliada(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>{nombreDe(fila)}</DialogTitle></DialogHeader>
            <ImageViewer src={ampliada} alt={nombreDe(fila)} descargar={`${fila.fecha}_${fila.crew_code}_${fila.tipo}.webp`} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
