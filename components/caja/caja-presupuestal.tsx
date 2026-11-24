'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, CheckCircle2, Clock, Wallet, Plus, MessageSquare, X, Info, Save, Eye, Download } from 'lucide-react'
import { descargarExcel } from '@/lib/reports'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, fmtDate, fmtDateTime, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Caja presupuestal» (ADMIN_Caja_*): uso interno SERVICON, nunca visible a
 * COVINCA. KPIs (Fondo, Gasto sustentado, Pendiente rendir, Disponible),
 * Rendiciones (aprobar u observar con motivo; nadie aprueba su propia
 * rendición) y Conciliación (lo declarado frente a lo registrado, sin
 * conexión bancaria). Los comprobantes originales son inmutables.
 */
export const soles = (n: number) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function KpisCaja({ desde, hasta, caja }: { desde: string; hasta: string; caja: string | null }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const q = useQuery({
    queryKey: ['caja-periodo', service.id, caja, desde, hasta],
    queryFn: async () => ((await sb.rpc('caja_periodo' as any, { p_service: service.id, p_box: caja, p_desde: desde, p_hasta: hasta } as any)).data as any) ?? {},
  })
  const d = q.data ?? {}
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[[Database, d.fondo, 'Fondo', 'border-info text-info bg-info/[0.05]'], [CheckCircle2, d.sustentado, 'Gasto sustentado', 'border-success text-success bg-success/[0.05]'],
        [Clock, d.pendiente, 'Pendiente rendir', 'border-warning text-warning bg-warning/[0.06]'], [Wallet, d.disponible, 'Disponible', 'border-success text-success bg-success/[0.05]']].map(([I, v, t, c]: any) => (
        <div key={t} className={cn('flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3', c)}>
          <I className="size-6" /><div><p className="text-xl font-bold tabular-nums">{soles(v)}</p><p className="text-foreground text-[12px]">{t}</p></div>
        </div>
      ))}
    </div>
  )
}

const ESTADO_RND: Record<string, string> = { por_revisar: 'bg-info/12 text-info', aprobada: 'bg-success/12 text-success', observada: 'bg-warning/15 text-warning' }

export function Rendiciones({ cajas }: { cajas: any[] }) {
  const { service, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [sel, setSel] = React.useState<any | null>(null)
  const [nueva, setNueva] = React.useState(false)
  const q = useQuery({
    queryKey: ['rendiciones', service.id],
    queryFn: async () => {
      const { data } = await sb.from('rendiciones' as any).select('*, cash_boxes(name), crews(name), responsable:profiles!rendiciones_responsable_id_fkey(full_name)')
        .eq('service_id', service.id).order('creado_at', { ascending: false }).limit(100)
      const filas = (data ?? []) as any[]
      const ids = filas.map((r) => r.id)
      const { data: m } = ids.length ? await sb.from('cash_movements').select('rendicion_id, amount, monto_solicitado, monto_aprobado, status, category, description, receipt_kind, receipt_number, storage_path, occurred_on').in('rendicion_id' as any, ids) : { data: [] as any[] }
      return filas.map((r) => {
        const g = ((m ?? []) as any[]).filter((x) => x.rendicion_id === r.id)
        const sum = (f: (x: any) => number) => g.reduce((s, x) => s + f(x), 0)
        return { ...r, gastos: g, rendido: sum((x) => Number(x.amount)), aprobado: g.filter((x) => x.status === 'aprobado').reduce((s, x) => s + Number(x.amount), 0),
          solicitado: sum((x) => Number(x.monto_solicitado ?? x.amount)), aprobadoMonto: sum((x) => Number(x.monto_aprobado ?? (x.status === 'aprobado' ? x.amount : 0))),
          concepto: [...new Set(g.map((x) => x.category ?? x.description).filter(Boolean))].slice(0, 3).join(', ') || '—' }
      })
    },
  })
  const puedeRevisar = ['admin', 'residente'].includes(role)
  // Filtros, orden y KPIs (ADMIN_SUB_Caja_Rendiciones)
  const [f, setF] = React.useState({ q: '', caja: '', estado: '' })
  const [orden, setOrden] = React.useState<{ k: string; asc: boolean }>({ k: 'creado_at', asc: false })
  const per = useQuery({
    queryKey: ['caja-periodo', service.id, f.caja || null, '2000-01-01', toISODate(new Date())],
    queryFn: async () => ((await sb.rpc('caja_periodo' as any, { p_service: service.id, p_box: f.caja || null, p_desde: '2000-01-01', p_hasta: toISODate(new Date()) } as any)).data as any) ?? {},
  })
  const filas = (q.data ?? []).filter((r) => (!f.caja || r.cash_box_id === f.caja) && (!f.estado || r.estado === f.estado)
    && (!f.q || `${r.codigo} ${r.concepto} ${r.crews?.name ?? ''} ${r.responsable?.full_name ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => { const x = a[orden.k], y = b[orden.k]; const c = typeof x === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? '')); return orden.asc ? c : -c })
  const kp = [[Database, (per.data as any)?.fondo, 'Fondo', 'border-info text-info bg-info/[0.05]'],
    [CheckCircle2, filas.filter((r) => r.estado === 'aprobada').reduce((s, r) => s + r.aprobado, 0), 'Rendido aprobado', 'border-success text-success bg-success/[0.05]'],
    [Clock, filas.filter((r) => r.estado === 'por_revisar').reduce((s, r) => s + r.rendido, 0), 'Por revisar', 'border-warning text-warning bg-warning/[0.06]'],
    [Wallet, (per.data as any)?.disponible, 'Disponible', 'border-success text-success bg-success/[0.05]']] as any[]
  const Th = ({ k, t }: { k: string; t: string }) => <th className="px-3 py-2 text-left font-medium"><button onClick={() => setOrden({ k, asc: orden.k === k ? !orden.asc : true })}>{t} ⇅</button></th>
  const exportar = () => descargarExcel(`Rendiciones_${toISODate(new Date())}`, { titulo: 'Rendiciones', subtitulo: 'Uso interno SERVICON · No visible para COVINCA', servicio: service.name, periodo: `Al ${fmtDate(new Date())}`, generadoPor: profile.full_name },
    [{ name: 'Rendiciones', columns: [{ header: 'N.° Rendición', key: 'codigo', width: 12 }, { header: 'Fecha', key: 'f', width: 12 }, { header: 'Cuadrilla', key: 'cu', width: 20 }, { header: 'Concepto', key: 'concepto', width: 28 },
      { header: 'Solicitado', key: 'solicitado', width: 12 }, { header: 'Aprobado', key: 'aprobadoMonto', width: 12 }, { header: 'Ejecutado', key: 'rendido', width: 12 }, { header: 'Estado', key: 'estado', width: 12 }],
      rows: filas.map((r) => ({ ...r, f: fmtDate(r.creado_at), cu: r.crews?.name ?? r.cash_boxes?.name })) }])
  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kp.map(([I, v, t, c]: any) => (
        <div key={t} className={cn('flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3', c)}><I className="size-6" /><div><p className="text-xl font-bold tabular-nums">{soles(v)}</p><p className="text-foreground text-[12px]">{t}</p></div></div>
      ))}
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar rendición (N.°, concepto, cuadrilla...)" className="h-9 max-w-xs" />
      <Elegir etiqueta="Cuadrilla" valor={f.caja} cambiar={(x) => setF({ ...f, caja: x })} todos="Todas" opciones={cajas.map((c) => [c.id, c.crew_name ?? c.name])} />
      <Elegir etiqueta="Estado" valor={f.estado} cambiar={(x) => setF({ ...f, estado: x })} todos="Todos" opciones={[['por_revisar', 'Por revisar'], ['aprobada', 'Aprobada'], ['observada', 'Observada']]} />
      <Button variant="outline" className="ml-auto" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar</Button>
    </div>
    <div className={cn('grid gap-4', sel && 'xl:grid-cols-[1fr_380px]')}>
      <Card className="min-w-0">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Rendiciones del período</CardTitle>
          <span className="flex gap-2"><Button size="sm" variant="outline" disabled={!filas.some((r) => r.estado === 'por_revisar')} onClick={() => setSel(filas.find((r) => r.estado === 'por_revisar'))}><CheckCircle2 className="size-4" />Revisar rendición</Button>
          <Button size="sm" onClick={() => setNueva(true)}><Plus className="size-4" />Generar rendición</Button></span></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
              <Th k="codigo" t="N.° Rendición" /><Th k="creado_at" t="Fecha" /><th className="px-3 py-2 text-left font-medium">Cuadrilla</th><th className="px-3 py-2 text-left font-medium">Concepto</th>
              <Th k="solicitado" t="Solicitado" /><Th k="aprobadoMonto" t="Aprobado" /><Th k="rendido" t="Ejecutado" /><Th k="estado" t="Estado" /><th />
            </tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={9} className="text-muted-foreground px-3 py-6 text-center">Sin rendiciones con estos filtros.</td></tr>}
              {filas.map((r) => (
                <tr key={r.id} className={cn('border-t border-border', sel?.id === r.id && 'bg-info/[0.07]')}>
                  <td className="px-3 py-2 font-semibold">{r.codigo}</td><td className="px-3">{fmtDate(r.creado_at)}</td><td className="px-3">{r.crews?.name ?? r.cash_boxes?.name}<span className="text-muted-foreground block">{r.responsable?.full_name ?? ''}</span></td>
                  <td className="px-3">{r.concepto}<span className="text-muted-foreground block">{fmtDate(r.desde)} – {fmtDate(r.hasta)}</span></td>
                  <td className="px-3 tabular-nums">{soles(r.solicitado)}</td><td className="px-3 tabular-nums">{soles(r.aprobadoMonto)}</td><td className="px-3 tabular-nums">{soles(r.rendido)}</td>
                  <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', ESTADO_RND[r.estado])}>● {r.estado === 'por_revisar' ? 'Por revisar' : r.estado === 'aprobada' ? 'Aprobada' : 'Observada'}</span></td>
                  <td className="px-3"><Button size="sm" variant="outline" onClick={() => setSel(r)}><Eye className="size-3.5" />Ver</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="bg-info/[0.08] text-info flex items-center gap-2 px-3 py-2 text-[12px]"><Info className="size-3.5" />Los comprobantes originales (facturas, recibos) son inmutables y se adjuntan como evidencia de la rendición. No se realizan operaciones bancarias.</p>
        </CardContent>
      </Card>
      {sel && <DetalleRendicion r={sel} puedeRevisar={puedeRevisar && ![sel.responsable_id, sel.creado_por].includes(profile.id)} cerrar={() => setSel(null)}
        alCambiar={() => { qc.invalidateQueries({ queryKey: ['rendiciones'] }); qc.invalidateQueries({ queryKey: ['caja-periodo'] }); setSel(null) }} />}
      {nueva && <NuevaRendicion cajas={cajas} cerrar={() => setNueva(false)} alCrear={() => { setNueva(false); qc.invalidateQueries({ queryKey: ['rendiciones'] }) }} />}
    </div>
    </div>
  )
}

function DetalleRendicion({ r, puedeRevisar, cerrar, alCambiar }: { r: any; puedeRevisar: boolean; cerrar: () => void; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [motivo, setMotivo] = React.useState('')
  const revisar = async (aprobar: boolean) => {
    const { error } = await sb.rpc('rendicion_revisar' as any, { p_rend: r.id, p_aprobar: aprobar, p_motivo: motivo || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(aprobar ? 'Rendición aprobada' : 'Rendición observada'); alCambiar()
  }
  const ver = async (ruta: string) => {
    const { data } = await sb.storage.from('documentos').createSignedUrl(ruta, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener'); else toast.error('No se pudo abrir el comprobante')
  }
  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Detalle de rendición</CardTitle><button onClick={cerrar} aria-label="Cerrar"><X className="size-4" /></button></CardHeader>
      <CardContent className="space-y-2 text-[12.5px]">
        <p className="font-semibold">{r.codigo} · {r.crews?.name ?? r.cash_boxes?.name}</p>
        <p className="text-muted-foreground">Responsable: {r.responsable?.full_name ?? '—'} · Periodo {fmtDate(r.desde)} – {fmtDate(r.hasta)}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground text-[11px]">Solicitado</p><p className="font-bold">{soles(r.solicitado)}</p></div>
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground text-[11px]">Aprobado</p><p className="font-bold">{soles(r.aprobadoMonto)}</p></div>
          <div className="bg-success/10 rounded-lg p-2"><p className="text-success text-[11px]">Ejecutado</p><p className="text-success font-bold">{soles(r.rendido)}</p></div>
        </div>
        {r.estado === 'observada' && r.motivo && <p className="bg-destructive/8 text-destructive rounded-lg p-2"><strong>Observación:</strong> {r.motivo}</p>}
        <p className="font-semibold">Adjuntos ({r.gastos.filter((g: any) => g.storage_path).length})</p>
        {r.gastos.filter((g: any) => g.storage_path).map((g: any, i: number) => (
          <button key={`a${i}`} onClick={() => ver(g.storage_path)} className="hover:bg-secondary flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left"><Eye className="size-3.5" /><span className="flex-1 truncate">{String(g.storage_path).split('/').pop()}</span><Download className="text-info size-3.5" /></button>
        ))}
        <p className="font-semibold">Gastos ({r.gastos.length})</p>
        {r.gastos.map((g: any, i: number) => (
          <p key={i} className="flex items-center justify-between gap-2"><span className="truncate">{fmtDate(g.occurred_on)} · {g.category ?? g.description} · {g.receipt_kind ?? 'sin comprobante'} {g.receipt_number ?? ''}</span>
            <span className="flex items-center gap-1 tabular-nums">{soles(g.amount)}{g.storage_path && <button className="text-primary" onClick={() => ver(g.storage_path)}><Eye className="size-3.5" /></button>}</span></p>
        ))}
        <p className="font-semibold">Historial</p>
        <p className="text-muted-foreground">Recibido: {fmtDateTime(r.creado_at)}{r.revisado_at ? ` · Revisado: ${fmtDateTime(r.revisado_at)}` : ''}{r.motivo ? ` · ${r.motivo}` : ''}</p>
        {r.estado !== 'aprobada' && (puedeRevisar ? (
          <>
            <Textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ingrese el motivo de la observación o aprobación..." />
            <span className="text-muted-foreground block text-right text-[11px]">{motivo.length} / 500</span>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => revisar(false)} disabled={!motivo.trim()}><MessageSquare className="size-4" />Observar rendición</Button>
              <Button className="bg-success hover:bg-success/90" onClick={() => revisar(true)}><CheckCircle2 className="size-4" />Aprobar rendición</Button>
            </div>
          </>
        ) : <p className="bg-info/[0.08] text-info rounded-md px-2.5 py-2">Solo personal autorizado aprueba. El jefe no aprueba su propia rendición.</p>)}
      </CardContent>
    </Card>
  )
}

function NuevaRendicion({ cajas, cerrar, alCrear }: { cajas: any[]; cerrar: () => void; alCrear: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ caja: cajas[0]?.id ?? '', desde: toISODate(addDays(new Date(), -15)), hasta: toISODate(new Date()), nota: '' })
  const crear = async () => {
    const { data, error } = await sb.rpc('rendicion_generar' as any, { p_box: v.caja, p_desde: v.desde, p_hasta: v.hasta, p_nota: v.nota || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Rendición ${(data as any).codigo} generada con ${(data as any).gastos} gastos`); alCrear()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Generar rendición</DialogTitle><DialogDescription>Agrupa los gastos sin rendir de la caja en el periodo.</DialogDescription></DialogHeader>
        <div className="space-y-2 text-[13px]">
          <Elegir etiqueta="Caja" valor={v.caja} cambiar={(x) => setV({ ...v, caja: x || v.caja })} opciones={cajas.map((c) => [c.id, c.crew_name ?? c.name])} />
          <div className="grid grid-cols-2 gap-2"><Input type="date" value={v.desde} onChange={(e) => setV({ ...v, desde: e.target.value })} /><Input type="date" value={v.hasta} onChange={(e) => setV({ ...v, hasta: e.target.value })} /></div>
          <Input value={v.nota} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Nota (opcional)" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={crear} disabled={!v.caja}>Generar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Conciliacion({ cajas }: { cajas: any[] }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ desde: toISODate(addDays(new Date(), -30)), hasta: toISODate(new Date()), caja: '' })
  const [decl, setDecl] = React.useState<Record<string, string>>({})
  const [motivo, setMotivo] = React.useState('')
  const q = useQuery({
    queryKey: ['caja-periodo', service.id, f.caja || null, f.desde, f.hasta],
    queryFn: async () => ((await sb.rpc('caja_periodo' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta } as any)).data as any) ?? {},
  })
  const hist = useQuery({ queryKey: ['conciliaciones', service.id], queryFn: async () => ((await sb.from('conciliaciones' as any).select('*').eq('service_id', service.id).order('cuando', { ascending: false }).limit(10)).data ?? []) as any[] })
  const movs = ((q.data?.movimientos ?? []) as any[]).filter((m) => m.tipo === 'gasto')
  const dif = (m: any) => (decl[m.id] === undefined || decl[m.id] === '' ? 0 : Number(decl[m.id]) - (Number(m.sustentado) + Number(m.pendiente)))
  const total = movs.reduce((s, m) => s + dif(m), 0)
  const guardar = async () => {
    const items = movs.filter((m) => decl[m.id] !== undefined && decl[m.id] !== '').map((m) => ({ movement_id: m.id, declarado: Number(decl[m.id]) }))
    const { data, error } = await sb.rpc('conciliacion_guardar' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta, p_items: items, p_motivo: motivo || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Conciliación ${(data as any).codigo} registrada`, { description: `Diferencia ${soles((data as any).diferencia)}` })
    setDecl({}); setMotivo(''); qc.invalidateQueries({ queryKey: ['conciliaciones'] })
  }
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4 text-[12px]">
        <label><span className="text-muted-foreground block">Fecha inicio</span><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="h-9" /></label>
        <label><span className="text-muted-foreground block">Fecha fin</span><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="h-9" /></label>
        <Elegir etiqueta="Cuadrilla" valor={f.caja} cambiar={(x) => setF({ ...f, caja: x })} todos="Todas" opciones={cajas.map((c) => [c.id, c.crew_name ?? c.name])} />
      </CardContent></Card>
      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-[12.5px]">
          <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>{['Fecha', 'Concepto', 'Comprobante', 'Gasto sustentado', 'Pendiente rendir', 'Declarado', 'Diferencia'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={7} className="text-muted-foreground px-3 py-6 text-center">Sin gastos en el periodo.</td></tr>}
            {movs.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-3 py-1.5">{fmtDate(m.fecha)}</td><td className="px-3">{m.concepto ?? m.descripcion}</td><td className="px-3">{m.comprobante} {m.numero ?? ''}</td>
                <td className="px-3 tabular-nums">{soles(m.sustentado)}</td><td className="px-3 tabular-nums">{soles(m.pendiente)}</td>
                <td className="px-3"><Input type="number" step="0.01" value={decl[m.id] ?? ''} onChange={(e) => setDecl({ ...decl, [m.id]: e.target.value })} className="h-8 w-28" placeholder="S/" /></td>
                <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', Math.abs(dif(m)) > 0.004 ? 'bg-destructive/12 text-destructive' : 'bg-success/12 text-success')}>{soles(dif(m))}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      <Card><CardContent className="space-y-2 p-4 text-[12.5px]">
        <p className="font-semibold">Diferencia total: <span className={Math.abs(total) > 0.004 ? 'text-destructive' : 'text-success'}>{soles(total)}</span></p>
        <Textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={Math.abs(total) > 0.004 ? 'Motivo de la diferencia (obligatorio)' : 'Nota (opcional)'} />
        <p className="bg-info/[0.08] text-info rounded-md px-2.5 py-2">No hay conexión bancaria. La conciliación se realiza con movimientos internos y comprobantes.</p>
        <div className="flex justify-end"><Button onClick={guardar} disabled={Math.abs(total) > 0.004 && !motivo.trim()}><Save className="size-4" />Registrar conciliación</Button></div>
        <p className="pt-2 font-semibold">Conciliaciones registradas</p>
        {(hist.data ?? []).map((c) => <p key={c.id} className="text-muted-foreground">{c.codigo} · {fmtDate(c.desde)} – {fmtDate(c.hasta)} · declarado {soles(c.declarado)} · diferencia {soles(c.diferencia)}{c.motivo ? ` · ${c.motivo}` : ''}</p>)}
        {!(hist.data ?? []).length && <p className="text-muted-foreground">Ninguna todavía.</p>}
      </CardContent></Card>
    </div>
  )
}
