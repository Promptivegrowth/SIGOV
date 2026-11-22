'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Info, FileText, History, CheckCircle2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'
import { cn, fmtDate, fmtDateTime, fmtNumber } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Configuración de plazos» (maquetas 06/07 IMPORTACION_PLAZOS; guía 3.2).
 *
 * Dos modos y nunca mezclados en silencio:
 *   · Fechas oficiales directas: la fecha de cada plazo tal como la trae el
 *     oficio. No pide fecha base ni regla; pide la casilla «He contrastado
 *     las fechas con el oficio».
 *   · Calcular vencimientos: fecha base + N días.
 * Cada cambio es una versión con motivo (la primera, al importar, no lo
 * pide). Los ítems ya atendidos conservan su vencimiento.
 */
export type ModoPlazos = 'oficiales' | 'calculo'
export interface ValorPlazos { modo: ModoPlazos; fechas: Record<string, string>; fechaBase: string; contrastado: boolean; motivo: string }
export interface PlazoItems { plazo: number; items: number; vencimiento?: string | null }

function masDias(iso: string, dias: number): string {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00Z')
  return new Date(d.getTime() + dias * 86400000).toISOString().slice(0, 10)
}

/** El motivo de que todavía no se pueda confirmar, o null si está listo. */
export function faltaEnPlazos(v: ValorPlazos, plazos: PlazoItems[], pideMotivo: boolean): string | null {
  if (v.modo === 'oficiales') {
    const sin = plazos.filter((p) => !v.fechas[String(p.plazo)])
    if (sin.length) return `Falta la fecha oficial de ${sin.map((p) => etiquetaPlazo(p.plazo)).join(', ')}`
    if (!v.contrastado) return 'Marca «He contrastado las fechas con el oficio»'
  } else if (!v.fechaBase) return 'Indica la fecha base del cálculo'
  if (pideMotivo && !v.motivo.trim()) return 'Escribe el motivo del cambio de plazos'
  return null
}

export function FormularioPlazos({ valor, cambiar, plazos, pideMotivo }: {
  valor: ValorPlazos; cambiar: (v: ValorPlazos) => void; plazos: PlazoItems[]; pideMotivo: boolean
}) {
  const fijar = (c: Partial<ValorPlazos>) => cambiar({ ...valor, ...c })
  const total = plazos.reduce((s, p) => s + p.items, 0)
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {([['oficiales', 'Fechas oficiales directas'], ['calculo', 'Calcular vencimientos']] as const).map(([k, t]) => (
          <label key={k} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]',
            valor.modo === k ? 'border-primary bg-primary/[0.06] font-semibold' : 'border-border')}>
            <input type="radio" name="modo-plazos" checked={valor.modo === k} onChange={() => fijar({ modo: k })} className="size-4" />
            {t}
          </label>
        ))}
      </div>
      {valor.modo === 'oficiales' ? (
        <>
          <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]">
            <Info className="size-4 shrink-0" />No se requiere fecha base ni regla para fechas oficiales confirmadas.
          </p>
          <label className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px]', valor.contrastado ? 'bg-success/10' : 'bg-secondary')}>
            <input type="checkbox" checked={valor.contrastado} onChange={(e) => fijar({ contrastado: e.target.checked })} className="size-4" />
            He contrastado las fechas con el oficio.
          </label>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px]"><span className="text-muted-foreground block">Fecha base *</span>
            <Input type="date" value={valor.fechaBase} onChange={(e) => fijar({ fechaBase: e.target.value })} className="h-9" /></label>
          <p className="text-muted-foreground flex-1 text-[12px]">Regla: vence la fecha base + N días del plazo (el día 1 es el siguiente a la fecha base).</p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <p className="bg-secondary/60 flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold">
          <FileText className="size-3.5" />{valor.modo === 'oficiales' ? 'Fechas del oficio' : 'Vencimientos calculados'}
        </p>
        <table className="w-full text-[12.5px]">
          <thead className="text-muted-foreground text-[11.5px]"><tr>
            <th className="px-3 py-1.5 text-left font-medium">Plazo</th><th className="text-center font-medium">Ítems</th>
            <th className="px-3 text-center font-medium">Vencimiento</th>
          </tr></thead>
          <tbody>
            {plazos.map((p) => (
              <tr key={p.plazo} className="border-t border-border">
                <td className="px-3 py-1.5"><CalendarClock className="text-muted-foreground mr-1 inline size-3.5" />{etiquetaPlazo(p.plazo)}</td>
                <td className="text-center tabular-nums">{fmtNumber(p.items)}</td>
                <td className="px-3 py-1 text-center">
                  {valor.modo === 'oficiales' ? (
                    <Input type="date" aria-label={`Vencimiento ${etiquetaPlazo(p.plazo)}`} value={valor.fechas[String(p.plazo)] ?? ''}
                      onChange={(e) => fijar({ fechas: { ...valor.fechas, [String(p.plazo)]: e.target.value } })} className="mx-auto h-8 w-40" />
                  ) : <span className="tabular-nums">{valor.fechaBase ? fmtDate(masDias(valor.fechaBase, p.plazo)) : '—'}</span>}
                </td>
              </tr>
            ))}
            <tr className="bg-primary/[0.06] border-t border-border font-bold">
              <td className="px-3 py-1.5">Total</td><td className="text-center tabular-nums">{fmtNumber(total)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      {pideMotivo && (
        <label className="block space-y-1 text-[12px]">
          <span className="font-medium">Motivo del cambio *</span>
          <Textarea rows={2} maxLength={250} value={valor.motivo} onChange={(e) => fijar({ motivo: e.target.value })}
            placeholder="Ej.: oficio corregido por COVINCA" />
        </label>
      )}
    </div>
  )
}

export async function guardarPlazos(sb: ReturnType<typeof createClient>, pciId: string, v: ValorPlazos) {
  const { data, error } = await sb.rpc('pci_configurar_plazos', {
    p_pci: pciId, p_modo: v.modo,
    p_fechas: v.modo === 'oficiales' ? Object.fromEntries(Object.entries(v.fechas).filter(([, x]) => x)) : {},
    p_fecha_base: v.modo === 'calculo' ? v.fechaBase : null, p_motivo: v.motivo.trim() || null, p_contrastado: v.contrastado,
  } as any)
  if (error) throw error
  return data as any
}

/** La tarjeta de plazos del PCI: lo vigente, cambiarlo como versión nueva y el historial. */
export function PlazosDelPci({ pciId, editable, alGuardar }: { pciId: string; editable: boolean; alGuardar?: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [vista, setVista] = React.useState<'vigente' | 'editar' | 'historial'>('vigente')
  const [valor, setValor] = React.useState<ValorPlazos | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  const r = useQuery({
    queryKey: ['pci-plazos', pciId],
    queryFn: async () => {
      const { data, error } = await sb.rpc('pci_plazos_resumen', { p_pci: pciId } as any)
      if (error) throw error
      return data as any
    },
  })
  const d = r.data
  if (!d) return null
  const plazos: PlazoItems[] = d.plazos ?? []
  const editar = () => {
    setValor({
      modo: d.modo, fechaBase: d.fecha_base ?? '', contrastado: false, motivo: '',
      fechas: Object.fromEntries(plazos.map((p) => [String(p.plazo), p.vencimiento ?? ''])),
    })
    setVista('editar')
  }
  const falta = valor ? faltaEnPlazos(valor, plazos, d.version >= 1) : null
  const guardar = async () => {
    if (!valor) return
    setGuardando(true)
    try {
      const x = await guardarPlazos(sb, pciId, valor)
      toast.success(`Plazos guardados como versión v${x.version}`, { description: `${x.items} ${x.items === 1 ? 'ítem abierto actualizado' : 'ítems abiertos actualizados'}; lo atendido conserva su vencimiento.` })
      setVista('vigente')
      qc.invalidateQueries({ queryKey: ['pci-plazos', pciId] })
      alGuardar?.()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setGuardando(false) }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-[14px]"><CalendarClock className="size-4" />Plazos del PCI
            <Badge variant="info">v{d.version}</Badge>
            <Badge variant="outline">{d.modo === 'oficiales' ? 'Fechas oficiales directas' : 'Calculados'}</Badge>
          </CardTitle>
          <CardDescription className="text-[12px]">
            {d.modo === 'oficiales'
              ? `Fechas del oficio${d.contrastado_at ? ` · contrastadas el ${fmtDate(d.contrastado_at)}` : ''}.`
              : `Fecha base ${fmtDate(d.fecha_base)} + N días.`}
          </CardDescription>
        </div>
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {([['vigente', 'Vigente'], ['historial', `Historial (${(d.versiones ?? []).length})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)} className={cn('rounded-md px-3 py-1 text-[12.5px] font-semibold',
              vista === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{t}</button>
          ))}
          {editable && <button onClick={editar} className={cn('rounded-md px-3 py-1 text-[12.5px] font-semibold',
            vista === 'editar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Cambiar plazos</button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {vista === 'vigente' && (
          <div className="flex flex-wrap gap-2">
            {plazos.map((p) => (
              <div key={p.plazo} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
                <p className="font-semibold">{etiquetaPlazo(p.plazo)} · {fmtNumber(p.items)} ítems</p>
                <p className="text-muted-foreground">Vence {fmtDate(p.vencimiento)}</p>
              </div>
            ))}
            {!plazos.length && <p className="text-muted-foreground text-[12.5px]">El PCI aún no tiene ítems.</p>}
          </div>
        )}
        {vista === 'editar' && valor && (
          <>
            <FormularioPlazos valor={valor} cambiar={setValor} plazos={plazos} pideMotivo={d.version >= 1} />
            <p className="text-warning flex items-center gap-2 text-[12px]"><TriangleAlert className="size-3.5" />
              Solo se recalculan los ítems abiertos; lo atendido conserva su vencimiento. Queda como versión v{d.version + 1}.</p>
            <div className="flex items-center justify-end gap-2">
              {falta && <span className="text-muted-foreground text-[12px]">{falta}</span>}
              <Button variant="outline" onClick={() => setVista('vigente')}>Cancelar</Button>
              <Button onClick={guardar} loading={guardando} disabled={!!falta}><CheckCircle2 className="size-4" />Guardar versión v{d.version + 1}</Button>
            </div>
          </>
        )}
        {vista === 'historial' && (
          <ul className="space-y-2">
            {(d.versiones as any[]).map((v) => (
              <li key={v.version} className="rounded-lg border border-border px-3 py-2 text-[12.5px]">
                <p className="flex flex-wrap items-center gap-2"><History className="text-muted-foreground size-3.5" />
                  <strong>v{v.version}</strong>
                  <Badge variant="outline">{v.modo === 'oficiales' ? 'Fechas oficiales' : `Cálculo desde ${fmtDate(v.fecha_base)}`}</Badge>
                  <span className="text-muted-foreground">{v.quien ?? 'Sistema'} · {fmtDateTime(v.cuando)}</span>
                  {v.items > 0 && <span className="text-muted-foreground">· {v.items} ítems actualizados</span>}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {Object.entries(v.vencimientos ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([k, f]) => `${etiquetaPlazo(Number(k))}: ${fmtDate(String(f))}`).join(' · ') || '—'}
                </p>
                {v.motivo && <p className="mt-0.5">Motivo: {v.motivo}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
