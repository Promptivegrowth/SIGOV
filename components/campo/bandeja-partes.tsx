'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Users, User, MapPin, ChevronRight, Info, CircleCheck, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { usePuede } from '@/lib/permisos'

/**
 * «Reporte Diario» del Supervisor y del Residente (lámina ROL02): contexto
 * visible, pestañas Por validar / Observados / Revisados, la bandeja de
 * revisión con «Abrir parte ›» y, del parte elegido, sus actividades y las
 * acciones en el mismo parte: «Pedir subsanación» o «Validar revisión».
 * Validar no publica: publicar a COVINCA es del Residente.
 */
type Pestana = 'enviado' | 'observado' | 'validado'
const PESTANAS: [Pestana, string][] = [['enviado', 'Por validar'], ['observado', 'Observados'], ['validado', 'Revisados']]
const CHIP: Record<string, string> = {
  enviado: 'bg-warning/15 text-warning', observado: 'bg-destructive/10 text-destructive', validado: 'bg-success/12 text-success', borrador: 'bg-secondary text-muted-foreground',
}
const ESTADO: Record<string, string> = { enviado: 'Por validar', observado: 'Observado', validado: 'Revisado', borrador: 'Borrador' }

export function BandejaPartes({ desde, hasta, crewFilter, crews }: { desde: string; hasta: string; crewFilter: string; crews: any[] }) {
  const { service, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const puede = usePuede()
  const [tab, setTab] = React.useState<Pestana>('enviado')
  const [sel, setSel] = React.useState<string | null>(null)
  const [nota, setNota] = React.useState('')
  const [ocupado, setOcupado] = React.useState(false)
  // El supervisor ve sus cuadrillas; el residente y el administrador, todo el contrato
  const misCrews = role === 'supervisor' ? crews.filter((c) => c.supervisor_id === profile.id) : crews
  const ids = crewFilter !== 'todas' ? [crewFilter] : misCrews.map((c) => c.id)
  const partes = useQuery({
    queryKey: ['bandeja-partes', service.id, desde, hasta, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.from('work_orders')
        .select('id, work_date, status, crew_id, submitted_at, reviewed_at, review_notes, crews(code, name, sectores), work_entries(id, pci_item_id, plan_item_id, deleted_at)')
        .eq('service_id', service.id).is('deleted_at', null).in('crew_id', ids)
        .in('status', ['enviado', 'observado', 'validado']).gte('work_date', desde).lte('work_date', hasta)
        .order('work_date', { ascending: false }).order('submitted_at', { ascending: false }).limit(300)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
  const todos = partes.data ?? []
  const filas = todos.filter((p) => p.status === tab)
  const conteo = (t: Pestana) => todos.filter((p) => p.status === t).length
  const p = filas.find((x) => x.id === sel) ?? filas[0]
  const entradas = (x: any) => ((x?.work_entries ?? []) as any[]).filter((e) => !e.deleted_at)
  const origen = (x: any) => {
    const e = entradas(x); const pci = e.some((y) => y.pci_item_id); const mr = e.some((y) => !y.pci_item_id)
    return pci && mr ? 'MR + PCI' : pci ? 'PCI' : 'MR'
  }
  const codigo = (x: any) => `RD-${x.crews?.code ?? ''}-${String(x.work_date).slice(8, 10)}${String(x.work_date).slice(5, 7)}`
  const items = useQuery({
    queryKey: ['bandeja-items', p?.id],
    enabled: !!p,
    queryFn: async () => {
      const ids2 = entradas(p).map((e) => e.pci_item_id).filter(Boolean)
      if (!ids2.length) return [] as any[]
      return ((await sb.from('v_pci_items').select('id, pci_id, pci_code, item_number, activity_name').in('id', ids2)).data ?? []) as any[]
    },
  })
  const crewSel = crewFilter !== 'todas' ? crews.find((c) => c.id === crewFilter) : null
  const supervisorNombre = role === 'supervisor' ? profile.full_name : crewSel?.supervisor_id ? (crewSel.profiles?.full_name ?? '—') : 'Todos'
  const sectores = crewSel?.sectores?.length ? `Sectores ${crewSel.sectores.join(', ')}` : 'Sectores asignados'

  const revisar = async (validar: boolean) => {
    if (!p) return
    setOcupado(true)
    const { error } = await sb.rpc('revisar_parte' as any, { p_id: p.id, p_validar: validar, p_nota: nota.trim() || null } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(validar ? 'Revisión validada' : 'Subsanación pedida a la cuadrilla', { description: validar ? 'Validar no publica a COVINCA.' : 'El jefe recibe el aviso con tu motivo.' })
    setNota(''); setSel(null); qc.invalidateQueries({ queryKey: ['bandeja-partes'] }); qc.invalidateQueries({ queryKey: ['work-orders'] })
  }
  const puedeValidar = puede('reporte_diario', 'validar') && ['supervisor', 'residente', 'admin'].includes(role)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([[CalendarDays, 'FECHA', desde === hasta ? fmtDate(desde) : `${fmtDate(desde)} – ${fmtDate(hasta)}`], [Users, 'CUADRILLA', crewSel?.name ?? (role === 'supervisor' ? 'Mis cuadrillas' : 'Todas')],
          [User, 'SUPERVISOR', supervisorNombre], [MapPin, 'SECTOR / TRAMO', sectores]] as const).map(([I, k, v]) => (
          <div key={k} className="rounded-xl bg-[#13254B] px-4 py-3 text-white">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-white/70"><I className="size-3.5" />{k}</p>
            <p className="mt-1 truncate text-[14px] font-bold" title={String(v)}>{v}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {PESTANAS.map(([k, t]) => (
            <button key={k} onClick={() => { setTab(k); setSel(null) }} className={cn('rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
              tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t} <span className="opacity-70">({conteo(k)})</span></button>
          ))}
        </div>
        <p className="text-muted-foreground text-[12px]">Fecha: {desde === hasta ? fmtDate(desde) : `${fmtDate(desde)} – ${fmtDate(hasta)}`} · Cuadrilla: {crewSel?.name ?? 'Todas'} · Estado: {PESTANAS.find(([k]) => k === tab)?.[1]}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Bandeja de revisión</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {partes.isLoading ? <div className="p-4"><SkeletonList rows={4} /></div> : (
              <table className="w-full text-[12.5px]">
                <thead className="bg-secondary/60 text-muted-foreground text-[11px] uppercase"><tr>
                  {['Parte / fecha', 'Cuadrilla y alcance', 'Detalle', 'Estado', 'Acción'].map((t) => <th key={t} className="px-3 py-2 text-left font-semibold">{t}</th>)}
                </tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">Sin partes {PESTANAS.find(([k]) => k === tab)?.[1].toLowerCase()} en este filtro.</td></tr>}
                  {filas.map((x) => (
                    <tr key={x.id} onClick={() => setSel(x.id)} className={cn('cursor-pointer border-t border-border', p?.id === x.id ? 'bg-primary/[0.06]' : 'hover:bg-secondary/40')}>
                      <td className="px-3 py-2"><strong>{codigo(x)}</strong><span className="text-muted-foreground block text-[11.5px]">{fmtDate(x.work_date)}</span></td>
                      <td className="px-3">{x.crews?.name}{x.crews?.sectores?.length ? ` · ${x.crews.sectores.join(', ')}` : ''}</td>
                      <td className="px-3">{origen(x)} · {entradas(x).length} {entradas(x).length === 1 ? 'actividad' : 'actividades'}</td>
                      <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', CHIP[x.status])}>{ESTADO[x.status]}</span></td>
                      <td className="px-3"><Link href={`/campo/${x.id}`} onClick={(e) => e.stopPropagation()} className="text-primary inline-flex items-center gap-0.5 font-semibold whitespace-nowrap">Abrir parte <ChevronRight className="size-3.5" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4">
          {p ? (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">{codigo(p)} · Actividades y evidencias</CardTitle></CardHeader>
                <CardContent className="space-y-1.5 text-[12.5px]">
                  {(items.data ?? []).length === 0 && <p className="text-muted-foreground">{entradas(p).length} {entradas(p).length === 1 ? 'actividad' : 'actividades'} MR. Abre el parte para ver ejecución y fotos.</p>}
                  {(items.data ?? []).map((i) => (
                    <p key={i.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{String(i.pci_code ?? '').replace(/^PCI-\d{4}-0*/, 'PCI ')} · Ítem {i.item_number}</span>
                      <Link href={`/pci/${i.pci_id}/item/${i.id}?tab=evidencia`} className="text-primary font-semibold whitespace-nowrap">Ver ítem ›</Link>
                    </p>
                  ))}
                  {(items.data ?? []).length > 0 && <p className="text-muted-foreground text-[11.5px]">Abrir Antes, Durante y Después desde el detalle.</p>}
                </CardContent>
              </Card>
              {p.status === 'enviado' && puedeValidar && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-[14px]">Acciones en el mismo parte</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-[12.5px]">
                    <p className="text-muted-foreground">Pedir subsanación o validar revisión interna. Validar no lo publica automáticamente.</p>
                    <Textarea rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo (obligatorio para pedir subsanación)" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => revisar(false)} loading={ocupado} disabled={!nota.trim()}><RotateCcw className="size-4" />Pedir subsanación</Button>
                      <Button onClick={() => revisar(true)} loading={ocupado}><CircleCheck className="size-4" />Validar revisión</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {p.status === 'observado' && p.review_notes && <p className="bg-destructive/8 text-destructive rounded-lg px-3 py-2 text-[12.5px]">Subsanación pedida: {p.review_notes}</p>}
            </>
          ) : <p className="text-muted-foreground rounded-lg border border-border p-4 text-center text-[12.5px]">Elige un parte para ver sus actividades.</p>}
          <p className="text-muted-foreground flex gap-2 text-[11.5px] font-semibold"><Info className="mt-0.5 size-3.5 shrink-0" />El Residente ve el contrato y publica lo autorizado. SSOMA revisa seguridad. El Visor COVINCA accede solo a lo publicado. El Jefe mantiene su Mi Jornada.</p>
        </div>
      </div>
    </div>
  )
}
