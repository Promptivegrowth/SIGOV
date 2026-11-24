'use client'

import * as React from 'react'
import Link from 'next/link'
import { MenuFila } from '@/components/shared/menu-fila'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareWarning, MessagesSquare, CheckCircle2, Search, Eye, Info, Calendar, User, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtNumber } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Bandeja de observaciones de revisión (maquetas V03/V07; guía 9.4).
 * Una sola lista de casos con origen SERVICON o COVINCA, por estado;
 * «Ver detalle» abre el mismo ítem en su pestaña Observaciones. Los avisos
 * van agrupados por PCI, pero cada observación permanece individual.
 */
const PESTANAS = [
  { k: 'abierta', t: 'Abiertas', icono: MessageSquareWarning, c: 'text-violet-700 dark:text-violet-300', activo: 'bg-violet-600 text-white' },
  { k: 'respondida', t: 'Respondidas', icono: MessagesSquare, c: 'text-info', activo: 'bg-info text-white' },
  { k: 'cerrada', t: 'Cerradas', icono: CheckCircle2, c: 'text-success', activo: 'bg-success text-white' },
] as const
const ESTADO: Record<string, string> = {
  abierta: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', respondida: 'bg-info/12 text-info', cerrada: 'bg-success/12 text-success',
}
const fase = (f?: string | null) => ({ antes: 'Antes', durante: 'Durante', despues: 'Después', general: 'General', metrado: 'Metrado' } as Record<string, string>)[f ?? ''] ?? null

export function RevisionClient() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const f = {
    estado: sp.get('estado') ?? 'abierta', pci: sp.get('pci') ?? '', plazo: sp.get('plazo') ?? '', crew: sp.get('crew') ?? '',
    desde: sp.get('desde') ?? '', hasta: sp.get('hasta') ?? '', q: sp.get('q') ?? '', origen: sp.get('origen') ?? '',
  }
  const fijar = (c: Partial<typeof f>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(c)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const [q, setQ] = React.useState(f.q)
  React.useEffect(() => { const t = setTimeout(() => q !== f.q && fijar({ q }), 400); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const [limite, setLimite] = React.useState(25)

  const pcis = useQuery({
    queryKey: ['rev-pcis', service.id],
    queryFn: async () => ((await sb.from('pcis').select('id, code').eq('service_id', service.id).is('deleted_at', null).order('code', { ascending: false })).data ?? []) as any[],
  })
  const cuadrillas = useQuery({
    queryKey: ['rev-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  const datos = useQuery({
    queryKey: ['bandeja-obs', service.id, f, limite],
    queryFn: async () => {
      const { data, error } = await sb.rpc('bandeja_observaciones', {
        p_service: service.id, p_estado: f.estado, p_pci: f.pci || null, p_plazo: f.plazo ? Number(f.plazo) : null,
        p_crew: f.crew || null, p_desde: f.desde || null, p_hasta: f.hasta || null, p_q: f.q || null,
        p_origen: f.origen || null, p_limite: limite, p_desde_fila: 0,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const d = datos.data
  const filas = (d?.filas ?? []) as any[]

  return (
    <>
      <PageHeader title="Observaciones" description="Observaciones de revisión SERVICON y COVINCA sobre la misma intervención." />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {PESTANAS.map((p) => (
            <button key={p.k} onClick={() => fijar({ estado: p.k })}
              className={cn('bg-card flex items-center gap-3 rounded-xl border p-4 text-left transition-colors', f.estado === p.k ? 'border-primary/50 shadow-sm' : 'border-border')}>
              <p.icono className={cn('size-6', p.c)} />
              <span><strong className="block text-[22px] tabular-nums">{fmtNumber(d?.[p.k === 'abierta' ? 'abiertas' : p.k === 'respondida' ? 'respondidas' : 'cerradas'] ?? 0)}</strong>
                <span className="text-muted-foreground text-[12.5px]">{p.t}</span></span>
            </button>
          ))}
        </div>
        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {PESTANAS.map((p) => (
            <button key={p.k} onClick={() => fijar({ estado: p.k })}
              className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold', f.estado === p.k ? p.activo : 'text-muted-foreground')}>
              <p.icono className="size-3.5" />{p.t} ({fmtNumber(d?.[p.k === 'abierta' ? 'abiertas' : p.k === 'respondida' ? 'respondidas' : 'cerradas'] ?? 0)})
            </button>
          ))}
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-60 flex-[2]">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar PCI, ítem o motivo..." className="pl-8" />
            </div>
            <Filtro valor={f.pci} todos="PCI: Todos" alCambiar={(v) => fijar({ pci: v })} opciones={(pcis.data ?? []).map((p) => ({ v: p.id, t: p.code }))} />
            <Filtro valor={f.plazo} todos="Plazo: Todos" alCambiar={(v) => fijar({ plazo: v })} opciones={[1, 2, 3, 7, 10, 14, 15, 20, 30, 45].map((n) => ({ v: String(n), t: `${n} ${n === 1 ? 'día' : 'días'}` }))} />
            <Filtro valor={f.crew} todos="Cuadrilla: Todas" alCambiar={(v) => fijar({ crew: v })} opciones={(cuadrillas.data ?? []).map((c) => ({ v: c.id, t: c.name }))} />
            <Filtro valor={f.origen} todos="Origen: Todos" alCambiar={(v) => fijar({ origen: v })} opciones={[{ v: 'SERVICON', t: 'SERVICON' }, { v: 'COVINCA', t: 'COVINCA' }]} />
            <label className="text-[11px]"><span className="text-muted-foreground">Desde</span><Input type="date" value={f.desde} onChange={(e) => fijar({ desde: e.target.value })} className="h-9" /></label>
            <label className="text-[11px]"><span className="text-muted-foreground">Hasta</span><Input type="date" value={f.hasta} onChange={(e) => fijar({ hasta: e.target.value })} className="h-9" /></label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="flex items-center justify-between px-4 py-3 text-[13px]">
              <strong>Observaciones registradas</strong>
              <span className="text-muted-foreground">{fmtNumber(d?.total ?? 0)} observaciones</span>
            </div>
            {datos.isLoading ? <div className="p-4"><SkeletonList rows={5} /></div> : datos.error ? (
              <p className="text-destructive px-4 pb-4 text-[13px]">No se pudo cargar: {mensajeAmigable(datos.error)}</p>
            ) : filas.length === 0 ? (
              <p className="text-muted-foreground px-4 pb-6 text-[13px]">Sin observaciones en este filtro.</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead className="bg-secondary/50 text-muted-foreground text-[11.5px]"><tr>
                  <th className="px-3 py-2 text-left font-medium">PCI</th><th className="text-left font-medium">Ítem</th>
                  <th className="text-left font-medium">Plazo</th><th className="text-left font-medium">Observación</th>
                  <th className="text-left font-medium">Cuadrilla</th><th className="text-left font-medium">Origen</th>
                  <th className="text-left font-medium">Fecha</th><th className="text-left font-medium">Estado</th><th />
                </tr></thead>
                <tbody>
                  {filas.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{String(o.pci ?? '').replace(/^PCI-\d{4}-0*/, '')}</td>
                      <td>{o.item ?? '—'}</td>
                      <td className="whitespace-nowrap"><Calendar className="mr-1 inline size-3" />{o.plazo ? `${o.plazo} ${o.plazo === 1 ? 'día' : 'días'}` : '—'}</td>
                      <td className="max-w-80">
                        <strong>{o.motivo}</strong>
                        <span className="text-muted-foreground block text-[11.5px]">{o.codigo}{fase(o.fase) ? ` · Fase ${fase(o.fase)}` : ''}{o.ultima_respuesta ? ` · Última respuesta: ${o.ultima_respuesta}` : ''}</span>
                      </td>
                      <td className="whitespace-nowrap"><User className="mr-1 inline size-3" />{o.cuadrilla ?? '—'}</td>
                      <td><Layers className="mr-1 inline size-3" />{o.origen}</td>
                      <td className="whitespace-nowrap">{new Date(o.creada_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><span className={cn('rounded-md px-2 py-0.5 text-[11.5px] font-semibold capitalize', ESTADO[o.estado])}>{o.estado}</span></td>
                      <td className="pr-3 text-right">
                        <span className="inline-flex items-center gap-1">
                        {o.item_id ? (
                          <Link href={`/pci/${o.pci_id}/item/${o.item_id}?tab=observaciones`}><Button size="sm" variant="outline"><Eye className="size-3.5" />Ver detalle</Button></Link>
                        ) : o.work_order_id ? (
                          <Link href={`/campo/${o.work_order_id}`}><Button size="sm" variant="outline"><Eye className="size-3.5" />Ver detalle</Button></Link>
                        ) : null}
                        <MenuFila opciones={[
                          { t: 'Ver detalle', href: o.item_id ? `/pci/${o.pci_id}/item/${o.item_id}?tab=observaciones` : o.work_order_id ? `/campo/${o.work_order_id}` : undefined, oculta: !o.item_id && !o.work_order_id },
                          { t: 'Ver evidencia del ítem', href: `/pci/${o.pci_id}/item/${o.item_id}?tab=evidencia`, oculta: !o.item_id },
                          { t: 'Historial del ítem', href: `/pci/${o.pci_id}/item/${o.item_id}?tab=historial`, oculta: !o.item_id },
                          { t: 'Ver reporte diario', href: `/campo/${o.work_order_id}`, oculta: !o.work_order_id },
                        ]} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filas.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 text-[12.5px]">
                <span className="text-muted-foreground">Mostrando {filas.length} de {fmtNumber(d?.total ?? 0)}</span>
                {filas.length < (d?.total ?? 0) && <Button size="sm" onClick={() => setLimite((l) => l + 25)}>Ver más</Button>}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-muted-foreground flex items-center gap-2 text-[12px]"><Info className="text-info size-3.5" />Avisos agrupados por PCI; cada observación permanece individual. Cerrar internamente no cierra una observación del cliente.</p>
      </PageBody>
    </>
  )
}

function Filtro({ valor, todos, alCambiar, opciones }: { valor: string; todos: string; alCambiar: (v: string) => void; opciones: { v: string; t: string }[] }) {
  return (
    <Select value={valor || '__t'} onValueChange={(v) => alCambiar(v === '__t' ? '' : v)}>
      <SelectTrigger className="h-9 min-w-36 flex-1"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__t">{todos}</SelectItem>
        {opciones.map((o) => <SelectItem key={o.v} value={o.v}>{o.t}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
