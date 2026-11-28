'use client'

import { usePuede } from '@/lib/permisos'
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, CheckSquare, Download, MoreVertical, Info, X, User, CalendarDays, Layers, FileText, AlertTriangle, Paperclip, History,
  MessageSquare, Check, Users, Activity, Tag, Save, Upload, ArrowLeftRight, Fuel, Wrench, Car, RotateCcw, Coins, ShoppingCart, Lock, Wallet, Database, Clock, CheckCircle2,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, toISODate } from '@/lib/utils'
import { descargarExcel, descargarPdf } from '@/lib/reports'
import { mensajeAmigable } from '@/lib/errores'
import { KpisCaja, soles } from './caja-presupuestal'

/**
 * Caja presupuestal por pestañas (ADMIN_Caja_V2 y SUB_Caja_*): Resumen
 * (KPIs, movimientos del período con Solicitado/Aprobado/Ejecutado y el
 * detalle de la rendición), Movimientos (registro con los tres importes y
 * comprobante; transferencias internas) y Conciliación (saldo declarado −
 * saldo esperado, aclaraciones y cierre bloqueado con diferencia).
 * Uso interno SERVICON: nunca visible para COVINCA.
 */
const ESTADO: Record<string, [string, string]> = {
  conforme: ['Conforme', 'bg-success/12 text-success'], registrado: ['Registrado', 'bg-success/12 text-success'],
  pendiente: ['Pendiente', 'bg-warning/15 text-warning'], observado: ['Observado', 'bg-destructive/10 text-destructive'],
  interno: ['Interno', 'bg-info/10 text-info'],
}
const TIPO: Record<string, [string, any]> = {
  deposito: ['Fondeo', Coins], apertura: ['Apertura', Database], gasto: ['Gasto', ShoppingCart], transferencia: ['Transferencia', ArrowLeftRight],
  devolucion: ['Devolución', RotateCcw], ajuste: ['Ajuste', Tag],
}
const iconoConcepto = (c: string) => /combust|gasol|petr/i.test(c) ? Fuel : /herram/i.test(c) ? Wrench : /movil|pasaj|taxi|transp/i.test(c) ? Car : /repos/i.test(c) ? RotateCcw : /transf/i.test(c) ? ArrowLeftRight : FileText
const primerDiaMes = () => { const d = new Date(); return toISODate(new Date(d.getFullYear(), d.getMonth(), 1)) }

function Chip({ e }: { e: string }) {
  const [t, c] = ESTADO[e] ?? [e, 'bg-secondary text-muted-foreground']
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', c)}>● {t}</span>
}
function Campo({ i: I, t, children }: { i: any; t: string; children: React.ReactNode }) {
  return <label className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"><I className="text-muted-foreground size-4" /><span className="flex flex-col text-[12.5px]"><span className="text-[11px] font-semibold">{t}</span>{children}</span></label>
}
const Sel = ({ v, set, ops, todos = 'Todos' }: { v: string; set: (v: string) => void; ops: [string, string][]; todos?: string }) => (
  <select value={v} onChange={(e) => set(e.target.value)} className="max-w-40 bg-transparent outline-none"><option value="">{todos}</option>{ops.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
)

function usePeriodo(f: { desde: string; hasta: string; caja: string }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['caja-periodo', service.id, f.caja || null, f.desde, f.hasta],
    queryFn: async () => {
      const { data, error } = await sb.rpc('caja_periodo' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta } as any)
      if (error) throw error
      return (data as any) ?? {}
    },
  })
}

async function exportar(formato: 'excel' | 'pdf', titulo: string, filas: any[], service: any, perfil: string, periodo: string) {
  const cols = [
    { header: 'ID', key: 'codigo', width: 10 }, { header: 'Fecha', key: 'f', width: 11 }, { header: 'Cuadrilla', key: 'cuadrilla', width: 18 },
    { header: 'Tipo', key: 't', width: 12 }, { header: 'Concepto', key: 'concepto', width: 24 }, { header: 'Solicitado', key: 'sol', width: 12 },
    { header: 'Aprobado', key: 'apr', width: 12 }, { header: 'Ejecutado', key: 'eje', width: 12 }, { header: 'Comprobante', key: 'comprobante', width: 14 }, { header: 'Estado', key: 'est', width: 12 },
  ]
  const rows = filas.map((m) => ({ ...m, f: fmtDate(m.fecha), t: TIPO[m.tipo]?.[0] ?? m.tipo, sol: soles(m.solicitado), apr: m.aprobado == null ? '—' : soles(m.aprobado), eje: soles(m.ejecutado), est: ESTADO[m.estado_ui]?.[0] ?? m.estado }))
  const meta = { titulo, subtitulo: 'Uso interno SERVICON · No visible para COVINCA', servicio: service.name, periodo, generadoPor: perfil, registros: filas.length }
  if (formato === 'excel') await descargarExcel(`Caja_${titulo.replace(/\s+/g, '_')}_${toISODate(new Date())}`, meta, [{ name: 'Movimientos', columns: cols, rows }])
  else await descargarPdf(`Caja_${titulo.replace(/\s+/g, '_')}_${toISODate(new Date())}`, meta, cols.map((c) => ({ ...c, width: undefined })), rows, { landscape: true, cover: false })
}

function MenuExportar({ alElegir }: { alElegir: (f: 'excel' | 'pdf') => void }) {
  const puede = usePuede()
  const [abierto, setAbierto] = React.useState(false)
  if (!puede('caja', 'exportar')) return null
  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setAbierto(!abierto)}><Download className="size-4" />Exportar ⌄</Button>
      {abierto && (<>
        <button className="fixed inset-0 z-10 cursor-default" onClick={() => setAbierto(false)} aria-label="Cerrar" />
        <div className="bg-popover absolute right-0 z-20 mt-1 w-40 rounded-lg border border-border p-1 shadow-lg">
          {(['excel', 'pdf'] as const).map((f) => <button key={f} onClick={() => { setAbierto(false); alElegir(f) }} className="hover:bg-secondary block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]">{f === 'excel' ? 'Excel' : 'PDF'}</button>)}
        </div>
      </>)}
    </div>
  )
}

function TablaMovimientos({ filas, cargando, conTipo, elegido, elegir, acciones }: {
  filas: any[]; cargando: boolean; conTipo?: boolean; elegido?: string | null; elegir: (m: any) => void; acciones: (m: any) => { t: string; f: () => void }[]
}) {
  const [orden, setOrden] = React.useState<{ k: string; asc: boolean } | null>(null)
  const [menu, setMenu] = React.useState<string | null>(null)
  const val = (m: any, k: string) => (k === 'codigo' ? m.numero : k === 'fecha' ? m.fecha : k === 'cuadrilla' ? m.cuadrilla : k === 'estado' ? m.estado_ui : Number(m[k] ?? 0))
  const ordenadas = orden ? [...filas].sort((a, b) => { const x = val(a, orden.k), y = val(b, orden.k); const r = typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y)); return orden.asc ? r : -r }) : filas
  const Th = ({ k, t, der }: { k?: string; t: string; der?: boolean }) => (
    <th className={cn('px-3 py-2 font-semibold whitespace-nowrap', der && 'text-right')}>
      {k ? <button onClick={() => setOrden(orden?.k === k ? { k, asc: !orden.asc } : { k, asc: true })}>{t} ⇅</button> : t}
    </th>
  )
  if (cargando) return <div className="p-4"><SkeletonList rows={5} /></div>
  if (!filas.length) return <p className="text-muted-foreground p-8 text-center text-[13px]">Sin movimientos en el período con estos filtros.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="bg-secondary/50 text-left"><tr>
          <Th k="codigo" t="ID" /><Th k="fecha" t="Fecha" /><Th k="cuadrilla" t="Cuadrilla" />{conTipo && <Th t="Tipo" />}<Th t="Concepto" />
          <Th k="solicitado" t="Solicitado" der /><Th k="aprobado" t="Aprobado" der /><Th k="ejecutado" t="Ejecutado" der /><Th t="Comprobante" /><Th k="estado" t="Estado" /><th className="w-8" />
        </tr></thead>
        <tbody className="divide-y divide-border">
          {ordenadas.map((m) => {
            const I = iconoConcepto(m.concepto ?? '')
            const T = TIPO[m.tipo]
            const TI = T?.[1]
            return (
              <tr key={m.id} onClick={() => elegir(m)} className={cn('hover:bg-secondary/30 cursor-pointer', elegido === m.id && 'bg-primary/5')}>
                <td className="text-primary px-3 py-2 font-semibold">{m.codigo}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(m.fecha)}</td>
                <td className="px-3 py-2">{m.cuadrilla}</td>
                {conTipo && <td className="px-3 py-2"><span className="flex items-center gap-1.5">{TI && <TI className="text-muted-foreground size-3.5" />}{T?.[0] ?? m.tipo}</span></td>}
                <td className="px-3 py-2"><span className="flex items-center gap-1.5"><I className="text-muted-foreground size-3.5" />{m.concepto}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{soles(m.solicitado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.aprobado == null ? '—' : soles(m.aprobado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{soles(m.ejecutado)}</td>
                <td className="px-3 py-2"><span className="flex items-center gap-1.5"><FileText className="text-muted-foreground size-3.5" />{m.comprobante}</span></td>
                <td className="px-3 py-2"><Chip e={m.estado_ui} /></td>
                <td className="relative px-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setMenu(menu === m.id ? null : m.id)} className="hover:bg-secondary grid size-7 place-items-center rounded-md" aria-label="Acciones"><MoreVertical className="size-4" /></button>
                  {menu === m.id && (<>
                    <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} aria-label="Cerrar" />
                    <div className="bg-popover absolute right-2 z-20 w-44 rounded-lg border border-border p-1 shadow-lg">
                      {acciones(m).map((a) => <button key={a.t} onClick={() => { setMenu(null); a.f() }} className="hover:bg-secondary block w-full rounded-md px-2.5 py-1.5 text-left text-[13px]">{a.t}</button>)}
                    </div>
                  </>)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══ Resumen ═════════════════════════════════════════════════════════════
export function ResumenCaja({ cajas, onRevisar, verComprobante, irA }: { cajas: any[]; onRevisar: (id: string) => void; verComprobante: (ruta: string) => void; irA: (tab: string) => void }) {
  const { service, profile } = useSession()
  const [f, setF] = React.useState({ desde: primerDiaMes(), hasta: toISODate(new Date()), caja: '', responsable: '', estado: '', q: '' })
  const [elegido, setElegido] = React.useState<any | null>(null)
  const q = usePeriodo(f)
  const filas = ((q.data?.movimientos ?? []) as any[]).filter((m) => (!f.responsable || m.responsable_id === f.responsable) && (!f.estado || m.estado_ui === f.estado)
    && (!f.q || `${m.codigo} ${m.concepto} ${m.descripcion ?? ''} ${m.numero_comprobante ?? ''} ${m.proveedor ?? ''} ${m.cuadrilla}`.toLowerCase().includes(f.q.toLowerCase())))
  const responsables = [...new Map(cajas.filter((c) => c.holder_id).map((c) => [c.holder_id, c.holder_name ?? '—'])).entries()]
  React.useEffect(() => { if (elegido && !filas.some((m) => m.id === elegido.id)) setElegido(null) }, [filas, elegido])

  return (
    <div className="space-y-4">
      <KpisCaja desde={f.desde} hasta={f.hasta} caja={f.caja || null} />
      <div className="flex flex-wrap gap-2">
        <Campo i={CalendarDays} t="Fecha inicial"><input type="date" value={f.desde} max={f.hasta} onChange={(e) => e.target.value && setF({ ...f, desde: e.target.value })} className="bg-transparent outline-none" /></Campo>
        <Campo i={CalendarDays} t="Fecha final"><input type="date" value={f.hasta} min={f.desde} onChange={(e) => e.target.value && setF({ ...f, hasta: e.target.value })} className="bg-transparent outline-none" /></Campo>
        <Campo i={Users} t="Cuadrilla"><Sel v={f.caja} set={(v) => setF({ ...f, caja: v })} ops={cajas.map((c) => [c.id, c.crew_name ?? c.name])} todos="Todas" /></Campo>
        <Campo i={User} t="Responsable"><Sel v={f.responsable} set={(v) => setF({ ...f, responsable: v })} ops={responsables as any} /></Campo>
        <Campo i={Activity} t="Estado"><Sel v={f.estado} set={(v) => setF({ ...f, estado: v })} ops={Object.entries(ESTADO).map(([k, [t]]) => [k, t])} /></Campo>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar comprobante (N.°, concepto, proveedor, etc.)" className="pl-9" /></div>
        <Button onClick={() => irA('movimientos:nuevo')}><Plus className="size-4" />Registrar movimiento</Button>
        <Button variant="outline" onClick={() => irA('rendiciones')}><CheckSquare className="size-4" />Revisar rendición</Button>
        <MenuExportar alElegir={(fmt) => exportar(fmt, 'Movimientos del período', filas, service, profile.full_name, `Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Movimientos del período</CardTitle>
            <span className="text-muted-foreground text-[12px]">Mostrando {filas.length} de {(q.data?.movimientos ?? []).length} movimientos</span></CardHeader>
          <CardContent className="p-0">
            <TablaMovimientos filas={filas} cargando={q.isLoading} elegido={elegido?.id} elegir={setElegido}
              acciones={(m) => [{ t: 'Ver detalle', f: () => setElegido(m) }, ...(m.archivo ? [{ t: 'Ver comprobante', f: () => verComprobante(m.archivo) }] : []),
                ...(m.tipo === 'gasto' && m.estado !== 'aprobado' ? [{ t: 'Revisar gasto', f: () => onRevisar(m.id) }] : [])]} />
          </CardContent>
          <p className="bg-info/8 text-info flex gap-2 border-t border-border px-4 py-2.5 text-[12.5px]"><Info className="mt-0.5 size-4 shrink-0" />Las transferencias internas son movimientos de reasignación de fondos y no constituyen doble gasto.</p>
        </Card>
        <DetalleRendicion m={elegido} cerrar={() => setElegido(null)} onRevisar={onRevisar} verComprobante={verComprobante} />
      </div>
    </div>
  )
}

function DetalleRendicion({ m, cerrar, onRevisar, verComprobante }: { m: any | null; cerrar: () => void; onRevisar: (id: string) => void; verComprobante: (ruta: string) => void }) {
  const { profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  if (!m) return <Card className="h-fit"><CardContent className="text-muted-foreground p-8 text-center text-[12.5px]">Elige un movimiento para ver el detalle de su rendición.</CardContent></Card>
  const revisarRendicion = async (aprobar: boolean) => {
    const motivo = aprobar ? '' : window.prompt('Motivo de la observación (obligatorio):') ?? ''
    if (!aprobar && !motivo.trim()) return
    const { error } = await sb.rpc('rendicion_revisar' as any, { p_rend: m.rendicion_id, p_aprobar: aprobar, p_motivo: motivo || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(aprobar ? 'Rendición aprobada' : 'Rendición observada')
    qc.invalidateQueries({ queryKey: ['caja-periodo'] }); qc.invalidateQueries({ queryKey: ['rendiciones'] })
  }
  const nombre = (m.archivo ?? '').split('/').pop()
  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2"><CardTitle className="text-[15px]">Detalle de rendición</CardTitle>
        <button onClick={cerrar} className="hover:bg-secondary rounded-md p-1" aria-label="Cerrar"><X className="size-4" /></button></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <p className="flex flex-wrap items-center gap-2"><span className="bg-info/10 text-info grid size-9 place-items-center rounded-full"><FileText className="size-4" /></span>
          <strong className="text-[15px]">{m.rendicion_codigo ?? m.codigo}</strong><Chip e={m.rendicion_estado === 'aprobada' ? 'conforme' : m.rendicion_estado === 'observada' ? 'observado' : m.estado_ui} /></p>
        <div className="space-y-1">
          <p><User className="mr-1 inline size-3.5" /><strong>Actor (Cuadrilla):</strong> {m.cuadrilla}</p>
          <p><CalendarDays className="mr-1 inline size-3.5" /><strong>Fecha de movimiento:</strong> {fmtDate(m.fecha)}</p>
          <p><Layers className="mr-1 inline size-3.5" /><strong>Concepto:</strong> {m.concepto}</p>
          <p><FileText className="mr-1 inline size-3.5" /><strong>Comprobante:</strong> {m.comprobante}{m.numero_comprobante ? ` ${m.numero_comprobante}` : ''}</p>
          <p className="text-muted-foreground">N.° de movimiento {m.codigo} · Tipo: {TIPO[m.tipo]?.[0] ?? m.tipo}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground text-[11px]">Solicitado</p><p className="font-bold">{soles(m.solicitado)}</p></div>
          <div className="bg-secondary rounded-lg p-2"><p className="text-muted-foreground text-[11px]">Aprobado</p><p className="font-bold">{m.aprobado == null ? '—' : soles(m.aprobado)}</p></div>
          <div className="bg-success/10 rounded-lg p-2"><p className="text-success text-[11px]">Ejecutado</p><p className="text-success font-bold">{soles(m.ejecutado)}</p></div>
        </div>
        {m.nota && <div className="bg-destructive/8 rounded-lg p-2.5"><p className="text-destructive flex items-center gap-1 font-semibold"><AlertTriangle className="size-4" />Observación</p><p>{m.nota}</p></div>}
        {m.justificacion && !m.archivo && <p className="bg-warning/10 rounded-lg p-2"><strong>Sin comprobante:</strong> {m.justificacion}</p>}
        <div>
          <p className="mb-1 flex items-center gap-1 font-semibold"><Paperclip className="size-3.5" />Adjuntos ({m.archivo ? 1 : 0})</p>
          {m.archivo ? <button onClick={() => verComprobante(m.archivo)} className="hover:bg-secondary flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left"><FileText className="size-4" /><span className="flex-1 truncate">{nombre}</span><Download className="text-info size-4" /></button>
            : <p className="text-muted-foreground">Sin adjuntos.</p>}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 font-semibold"><History className="size-3.5" />Historial</p>
          <ul className="space-y-1 border-l-2 border-success/40 pl-3">
            <li>● Recibido: {fmtDateTime(m.creado_at)}{m.creado_por ? ` · ${m.creado_por}` : ''}</li>
            {m.revisado_at && <li>● Revisado: {fmtDateTime(m.revisado_at)}{m.revisado_por ? ` · ${m.revisado_por}` : ''}</li>}
          </ul>
        </div>
        {m.tipo === 'gasto' && (
          <div className="flex flex-wrap gap-2">
            {m.rendicion_id ? (<>
              <Button variant="outline" onClick={() => revisarRendicion(false)} disabled={m.rendicion_estado !== 'por_revisar'}><MessageSquare className="size-4" />Observar rendición</Button>
              <Button className="bg-success hover:bg-success/90" onClick={() => revisarRendicion(true)} disabled={m.rendicion_estado !== 'por_revisar'}><Check className="size-4" />Aprobar rendición</Button>
            </>) : m.estado !== 'aprobado' && (
              <Button onClick={() => onRevisar(m.id)}><CheckSquare className="size-4" />Revisar gasto (aprobar u observar)</Button>
            )}
          </div>
        )}
        <p className="bg-info/8 text-info flex gap-2 rounded-lg p-2"><Info className="mt-0.5 size-4 shrink-0" />Solo personal autorizado aprueba. El jefe no aprueba su propia rendición.{profile ? '' : ''}</p>
      </CardContent>
    </Card>
  )
}

// ═══ Movimientos ═════════════════════════════════════════════════════════
const BORRADOR = 'sigov:caja:borrador'
const formVacio = { tipo: 'gasto', caja: '', hacia: '', fecha: toISODate(new Date()), concepto: '', solicitado: '', aprobado: '', ejecutado: '', comprobante: 'boleta', numero: '', proveedor: '', justificacion: '' }

export function MovimientosCaja({ cajas, onRevisar, verComprobante, nuevo, extra }: { cajas: any[]; onRevisar: (id: string) => void; verComprobante: (ruta: string) => void; nuevo?: boolean; extra?: React.ReactNode }) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ desde: primerDiaMes(), hasta: toISODate(new Date()), caja: '', tipo: '', estado: '', q: '' })
  const [form, setForm] = React.useState<typeof formVacio | null>(nuevo ? formVacio : null)
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [elegido, setElegido] = React.useState<any | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  // Editar un movimiento ya registrado (con motivo; queda en su historial)
  const [edicion, setEdicion] = React.useState<any | null>(null)
  React.useEffect(() => { setEdicion(null) }, [elegido?.id])
  React.useEffect(() => { if (nuevo) setForm((x) => x ?? formVacio) }, [nuevo])
  const q = usePeriodo({ desde: f.desde, hasta: f.hasta, caja: f.caja })
  const filas = ((q.data?.movimientos ?? []) as any[]).filter((m) => (!f.tipo || m.tipo === f.tipo) && (!f.estado || m.estado_ui === f.estado)
    && (!f.q || `${m.codigo} ${m.concepto} ${m.numero_comprobante ?? ''} ${m.cuadrilla}`.toLowerCase().includes(f.q.toLowerCase())))
  const hist = useQuery({
    queryKey: ['caja-mov-hist', elegido?.id],
    enabled: !!elegido,
    queryFn: async () => ((await sb.from('audit_log').select('id, created_at, actor_email, action, motivo').eq('table_name', 'cash_movements').eq('record_id', elegido.id).order('created_at')).data ?? []) as any[],
  })

  const abrirNuevo = () => {
    let b: any = null
    try { b = JSON.parse(localStorage.getItem(BORRADOR) ?? 'null') } catch { b = null }
    setForm(b ?? formVacio); setElegido(null); setArchivo(null)
    if (b) toast.info('Se recuperó tu borrador')
  }
  const guardarBorrador = () => { try { localStorage.setItem(BORRADOR, JSON.stringify(form)); toast.success('Borrador guardado en este equipo') } catch { toast.error('No se pudo guardar el borrador') } }
  const revisar = async () => {
    if (!form) return
    setGuardando(true)
    try {
      if (form.tipo === 'transferencia') {
        const { data, error } = await sb.rpc('caja_transferir' as any, { p_desde_box: form.caja, p_hacia_box: form.hacia, p_monto: Number(form.ejecutado), p_fecha: form.fecha, p_concepto: form.concepto } as any)
        if (error) throw error
        toast.success(`Transferencia registrada (${(data as any).salida} → ${(data as any).entrada})`, { description: 'Reasigna fondos entre cajas; no es un gasto adicional.' })
      } else {
        let ruta: string | null = null
        if (archivo) {
          if (archivo.size > 10 * 1024 * 1024) throw new Error('El comprobante supera 10 MB')
          if (!/pdf|jpe?g|png/i.test(archivo.type || archivo.name)) throw new Error('El comprobante debe ser PDF, JPG o PNG')
          const limpio = archivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_')
          ruta = `${service.id}/caja/${form.fecha.slice(0, 7)}/${Date.now()}_${limpio}`
          const up = await sb.storage.from('documentos').upload(ruta, archivo, { contentType: archivo.type || undefined })
          if (up.error) throw up.error
        }
        const { data, error } = await sb.rpc('caja_movimiento_registrar' as any, {
          p_box: form.caja, p_tipo: form.tipo, p_fecha: form.fecha, p_concepto: form.concepto,
          p_solicitado: form.solicitado === '' ? null : Number(form.solicitado), p_aprobado: form.aprobado === '' ? null : Number(form.aprobado), p_ejecutado: Number(form.ejecutado),
          p_comprobante: archivo ? form.comprobante : null, p_numero_comprobante: form.numero || null, p_proveedor: form.proveedor || null, p_ruta: ruta, p_justificacion: form.justificacion || null,
        } as any)
        if (error) throw error
        toast.success(`Movimiento ${(data as any).codigo} registrado`, { description: 'Queda pendiente de revisión en el flujo de aprobación.' })
      }
      try { localStorage.removeItem(BORRADOR) } catch { /* sin almacenamiento */ }
      setForm(null); setArchivo(null)
      qc.invalidateQueries({ queryKey: ['caja-periodo'] }); qc.invalidateQueries({ queryKey: ['cajas'] })
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo registrar el movimiento'))
    } finally {
      setGuardando(false)
    }
  }
  const editable = (m: any) => m && m.tipo !== 'transferencia' && m.estado !== 'aprobado' && !m.rendicion_id
  const guardarEdicion = async () => {
    if (!edicion || !elegido) return
    setGuardando(true)
    const { error } = await sb.rpc('caja_movimiento_editar' as any, {
      p_id: elegido.id, p_fecha: edicion.fecha, p_concepto: edicion.concepto,
      p_solicitado: edicion.solicitado === '' ? null : Number(edicion.solicitado), p_aprobado: edicion.aprobado === '' ? null : Number(edicion.aprobado), p_ejecutado: Number(edicion.ejecutado),
      p_numero_comprobante: edicion.numero || null, p_proveedor: edicion.proveedor || null, p_motivo: edicion.motivo,
    } as any)
    setGuardando(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Movimiento ${elegido.codigo} actualizado`, { description: 'El cambio queda en su historial con el motivo.' })
    setEdicion(null); setElegido(null)
    qc.invalidateQueries({ queryKey: ['caja-periodo'] }); qc.invalidateQueries({ queryKey: ['cajas'] })
  }
  const valido = !!form && !!form.caja && !!form.fecha && !!form.concepto.trim() && Number(form.ejecutado) > 0
    && (form.tipo === 'transferencia' ? !!form.hacia && form.hacia !== form.caja : form.tipo !== 'gasto' || !!archivo || !!form.justificacion.trim())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar movimiento (N.°, concepto, comprobante, etc.)" className="pl-9" /></div>
        <Button onClick={abrirNuevo}><Plus className="size-4" />Registrar movimiento</Button>
        <MenuExportar alElegir={(fmt) => exportar(fmt, 'Movimientos de caja', filas, service, profile.full_name, `Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Campo i={CalendarDays} t="Fecha"><span className="flex items-center gap-1"><input type="date" value={f.desde} max={f.hasta} onChange={(e) => e.target.value && setF({ ...f, desde: e.target.value })} className="bg-transparent outline-none" />–<input type="date" value={f.hasta} min={f.desde} onChange={(e) => e.target.value && setF({ ...f, hasta: e.target.value })} className="bg-transparent outline-none" /></span></Campo>
        <Campo i={Users} t="Cuadrilla"><Sel v={f.caja} set={(v) => setF({ ...f, caja: v })} ops={cajas.map((c) => [c.id, c.crew_name ?? c.name])} todos="Todas" /></Campo>
        <Campo i={Layers} t="Tipo"><Sel v={f.tipo} set={(v) => setF({ ...f, tipo: v })} ops={[['deposito', 'Fondeo'], ['gasto', 'Gasto'], ['transferencia', 'Transferencia'], ['apertura', 'Apertura']]} /></Campo>
        <Campo i={Activity} t="Estado"><Sel v={f.estado} set={(v) => setF({ ...f, estado: v })} ops={Object.entries(ESTADO).map(([k, [t]]) => [k, t])} /></Campo>
        {(f.caja || f.tipo || f.estado || f.q) && <button onClick={() => setF({ ...f, caja: '', tipo: '', estado: '', q: '' })} className="text-info text-[12.5px] font-semibold">Limpiar filtros</button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Movimientos del período</CardTitle>
              <span className="text-muted-foreground text-[12px]">Mostrando {filas.length} de {(q.data?.movimientos ?? []).length} movimientos</span></CardHeader>
            <CardContent className="p-0">
              <TablaMovimientos conTipo filas={filas} cargando={q.isLoading} elegido={elegido?.id} elegir={(m) => { setElegido(m); setForm(null) }}
                acciones={(m) => [{ t: 'Ver historial', f: () => { setElegido(m); setForm(null) } }, ...(m.archivo ? [{ t: 'Ver comprobante', f: () => verComprobante(m.archivo) }] : []),
                  ...(m.tipo === 'gasto' && m.estado !== 'aprobado' ? [{ t: 'Revisar gasto', f: () => onRevisar(m.id) }] : [])]} />
            </CardContent>
          </Card>
          <div className="bg-info/8 text-info space-y-0.5 rounded-lg p-3 text-[12.5px]">
            <p className="flex items-center gap-1.5 font-semibold"><Info className="size-4" />Tenga en cuenta</p>
            <p>• La transferencia interna no es un gasto adicional; solo reasigna fondos entre cajas.</p>
            <p>• La autorización económica de cada movimiento se realiza según el permiso aprobado de la operación.</p>
            <p>• No existe conexión bancaria; el registro es manual y de uso interno SERVICON.</p>
          </div>
          {extra}
        </div>
        {form ? (
          <Card className="h-fit">
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2"><CardTitle className="text-[15px]">Registro de movimiento</CardTitle>
              <button onClick={() => setForm(null)} className="hover:bg-secondary rounded-md p-1" aria-label="Cerrar"><X className="size-4" /></button></CardHeader>
            <CardContent className="space-y-2.5 text-[12.5px]">
              <Etq t="Tipo de movimiento" req><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">
                <option value="gasto">Gasto</option><option value="deposito">Fondeo</option><option value="transferencia">Transferencia interna</option></select></Etq>
              <Etq t={form.tipo === 'transferencia' ? 'Caja de origen' : 'Cuadrilla'} req><select value={form.caja} onChange={(e) => setForm({ ...form, caja: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">
                <option value="">Elige…</option>{cajas.map((c) => <option key={c.id} value={c.id}>{c.crew_name ?? c.name} · {soles(c.balance)}</option>)}</select></Etq>
              {form.tipo === 'transferencia' && <Etq t="Caja de destino" req><select value={form.hacia} onChange={(e) => setForm({ ...form, hacia: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">
                <option value="">Elige…</option>{cajas.filter((c) => c.id !== form.caja).map((c) => <option key={c.id} value={c.id}>{c.crew_name ?? c.name}</option>)}</select></Etq>}
              <Etq t="Fecha del movimiento" req><Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="h-9" /></Etq>
              <Etq t="Concepto" req><Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Herramientas, combustible…" className="h-9" /></Etq>
              {form.tipo === 'transferencia' ? (
                <Etq t="Monto (S/)" req><Input type="number" step="0.01" value={form.ejecutado} onChange={(e) => setForm({ ...form, ejecutado: e.target.value })} className="h-9" /></Etq>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <Etq t="Solicitado" req><Input type="number" step="0.01" value={form.solicitado} onChange={(e) => setForm({ ...form, solicitado: e.target.value })} className="bg-info/5 h-9" /></Etq>
                  <Etq t="Aprobado" req><Input type="number" step="0.01" value={form.aprobado} onChange={(e) => setForm({ ...form, aprobado: e.target.value })} className="bg-success/5 h-9" /></Etq>
                  <Etq t="Ejecutado" req><Input type="number" step="0.01" value={form.ejecutado} onChange={(e) => setForm({ ...form, ejecutado: e.target.value })} className="bg-info/5 h-9" /></Etq>
                </div>
              )}
              {form.tipo !== 'transferencia' && (<>
                <Etq t="Comprobante" req={form.tipo === 'gasto'}>
                  <label className="hover:bg-secondary/50 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border p-3 text-center">
                    <Upload className="text-info size-5" /><span className="text-info font-semibold">{archivo ? archivo.name : 'Adjuntar archivo'}</span>
                    <span className="text-muted-foreground text-[11.5px]">Arrastra y suelta o selecciona un archivo · PDF, JPG o PNG (máx. 10 MB)</span>
                    <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                  </label>
                </Etq>
                {archivo && <div className="grid grid-cols-2 gap-2">
                  <Etq t="Tipo"><select value={form.comprobante} onChange={(e) => setForm({ ...form, comprobante: e.target.value })} className="bg-card h-9 w-full rounded-md border border-border px-2">
                    {['boleta', 'factura', 'recibo', 'ticket', 'planilla'].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</select></Etq>
                  <Etq t="N.° de comprobante"><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="h-9" /></Etq>
                </div>}
                {!archivo && form.tipo === 'gasto' && <Etq t="Si no hay comprobante, justifica por qué"><Textarea rows={2} value={form.justificacion} onChange={(e) => setForm({ ...form, justificacion: e.target.value })} /></Etq>}
              </>)}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" onClick={guardarBorrador}><Save className="size-4" />Guardar borrador</Button>
                <Button onClick={revisar} disabled={!valido} loading={guardando}><Check className="size-4" />Revisar</Button>
                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              </div>
              <p className="text-muted-foreground text-[11.5px]">«Revisar» registra el movimiento y lo deja pendiente de revisión; el borrador queda solo en este equipo.</p>
            </CardContent>
          </Card>
        ) : elegido ? (
          <Card className="h-fit">
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2"><CardTitle className="text-[15px]">Historial del movimiento: {elegido.codigo}</CardTitle>
              <button onClick={() => setElegido(null)} className="hover:bg-secondary rounded-md p-1" aria-label="Cerrar"><X className="size-4" /></button></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <p>{TIPO[elegido.tipo]?.[0]} · {elegido.concepto} · {elegido.cuadrilla} · <Chip e={elegido.estado_ui} /></p>
              <ul className="space-y-1.5 border-l-2 border-info/40 pl-3">
                <li><strong>Registro creado</strong> · {fmtDateTime(elegido.creado_at)}{elegido.creado_por ? ` · Por ${elegido.creado_por}` : ''}</li>
                {(hist.data ?? []).filter((h) => h.action === 'UPDATE').map((h) => <li key={h.id}><strong>Actualización</strong> · {fmtDateTime(h.created_at)} · {(h.actor_email ?? 'Sistema').split('@')[0]}{h.motivo ? ` · ${h.motivo}` : ''}</li>)}
                {elegido.revisado_at ? <li><strong>Revisado</strong> · {fmtDateTime(elegido.revisado_at)}{elegido.revisado_por ? ` · ${elegido.revisado_por}` : ''}</li>
                  : elegido.tipo === 'gasto' && <li className="text-muted-foreground"><strong>Pendiente de revisión</strong> · en flujo de aprobación</li>}
              </ul>
              {!edicion && (editable(elegido)
                ? <Button size="sm" variant="outline" onClick={() => setEdicion({ fecha: elegido.fecha, concepto: elegido.descripcion ?? elegido.concepto ?? '', solicitado: elegido.solicitado ?? '', aprobado: elegido.aprobado ?? '',
                    ejecutado: elegido.ejecutado ?? '', numero: elegido.numero_comprobante ?? '', proveedor: elegido.proveedor ?? '', motivo: '' })}><Pencil className="size-3.5" />Editar movimiento</Button>
                : <p className="text-muted-foreground text-[11.5px]">{elegido.tipo === 'transferencia' ? 'Las transferencias no se editan: se registran de nuevo.' : 'Aprobado o rendido: no se edita; se corrige con un ajuste.'}</p>)}
              {edicion && (
                <div className="space-y-2 rounded-lg border border-border p-2.5">
                  <p className="font-semibold">Editar {elegido.codigo}</p>
                  <Etq t="Fecha" req><Input type="date" value={edicion.fecha} onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })} className="h-9" /></Etq>
                  <Etq t="Concepto" req><Input value={edicion.concepto} onChange={(e) => setEdicion({ ...edicion, concepto: e.target.value })} className="h-9" /></Etq>
                  <div className="grid grid-cols-3 gap-2">
                    <Etq t="Solicitado"><Input type="number" step="0.01" value={edicion.solicitado} onChange={(e) => setEdicion({ ...edicion, solicitado: e.target.value })} className="h-9" /></Etq>
                    <Etq t="Aprobado"><Input type="number" step="0.01" value={edicion.aprobado} onChange={(e) => setEdicion({ ...edicion, aprobado: e.target.value })} className="h-9" /></Etq>
                    <Etq t="Ejecutado" req><Input type="number" step="0.01" value={edicion.ejecutado} onChange={(e) => setEdicion({ ...edicion, ejecutado: e.target.value })} className="h-9" /></Etq>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Etq t="N.° de comprobante"><Input value={edicion.numero} onChange={(e) => setEdicion({ ...edicion, numero: e.target.value })} className="h-9" /></Etq>
                    <Etq t="Proveedor"><Input value={edicion.proveedor} onChange={(e) => setEdicion({ ...edicion, proveedor: e.target.value })} className="h-9" /></Etq>
                  </div>
                  <Etq t="Motivo del cambio" req><Textarea rows={2} maxLength={300} value={edicion.motivo} onChange={(e) => setEdicion({ ...edicion, motivo: e.target.value })} /></Etq>
                  <div className="flex gap-2"><Button size="sm" onClick={guardarEdicion} loading={guardando} disabled={!edicion.motivo.trim() || !edicion.concepto.trim() || !(Number(edicion.ejecutado) > 0)}><Save className="size-3.5" />Guardar cambios</Button>
                    <Button size="sm" variant="outline" onClick={() => setEdicion(null)}>Cancelar</Button></div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="h-fit"><CardContent className="text-muted-foreground p-8 text-center text-[12.5px]">Registra un movimiento o elige uno para ver su historial.</CardContent></Card>
        )}
      </div>
    </div>
  )
}

function Etq({ t, req, children }: { t: string; req?: boolean; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="font-semibold">{t}{req && <span className="text-destructive"> *</span>}</span>{children}</label>
}

// ═══ Conciliación ════════════════════════════════════════════════════════
export function ConciliacionCaja({ cajas }: { cajas: any[] }) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ desde: primerDiaMes(), hasta: toISODate(new Date()), caja: '', responsable: '' })
  const [decl, setDecl] = React.useState<Record<string, string>>({})
  const [motivo, setMotivo] = React.useState('')
  const [soloDif, setSoloDif] = React.useState(false)
  const [dlg, setDlg] = React.useState<'' | 'aclarar' | 'historial' | 'cierre'>('')
  const [acl, setAcl] = React.useState({ monto: '', texto: '' })
  const [aclArchivo, setAclArchivo] = React.useState<File | null>(null)
  const [elegido, setElegido] = React.useState<string | null>(null)
  const q = usePeriodo(f)
  const estado = useQuery({
    queryKey: ['caja-cierre', service.id, f.caja || null, f.desde, f.hasta],
    queryFn: async () => ((await sb.rpc('caja_cierre_estado' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta } as any)).data as any) ?? {},
  })
  const hist = useQuery({ queryKey: ['conciliaciones', service.id], queryFn: async () => ((await sb.from('conciliaciones' as any).select('*').eq('service_id', service.id).order('cuando', { ascending: false }).limit(20)).data ?? []) as any[] })
  const cajasResp = f.responsable ? cajas.filter((c) => c.holder_id === f.responsable) : cajas
  const movs = ((q.data?.movimientos ?? []) as any[]).filter((m) => m.tipo !== 'transferencia' && (!f.responsable || cajasResp.some((c) => c.id === m.cash_box_id)))
  const esperadoMov = (m: any) => Number(m.sustentado) + Number(m.pendiente)
  const c = estado.data?.conciliacion
  // Registrada la conciliación, lo declarado queda como se guardó (solo lectura)
  const guardado = new Map<string, number>(((c?.items ?? []) as any[]).map((i) => [i.movement_id, Number(i.declarado)]))
  const declaradoDe = (m: any) => (c ? (guardado.has(m.id) ? String(guardado.get(m.id)) : '') : decl[m.id])
  const dif = (m: any) => { const v = declaradoDe(m); return v === undefined || v === '' ? 0 : Number(v) - esperadoMov(m) }
  const total = movs.reduce((s, m) => s + dif(m), 0)
  const esperado = Number(c?.saldo_esperado ?? q.data?.disponible ?? 0)
  const declarado = c ? Number(c.saldo_declarado) : esperado + total
  const diferencia = c ? Number(c.diferencia) : total
  const pendiente = c ? Number(c.pendiente) : total
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['caja-cierre'] }); qc.invalidateQueries({ queryKey: ['conciliaciones'] }); qc.invalidateQueries({ queryKey: ['caja-periodo'] }) }

  const registrar = async () => {
    const items = movs.filter((m) => decl[m.id] !== undefined && decl[m.id] !== '').map((m) => ({ movement_id: m.id, declarado: Number(decl[m.id]) }))
    const { data, error } = await sb.rpc('conciliacion_guardar' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta, p_items: items, p_motivo: motivo || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Conciliación ${(data as any).codigo} registrada`, { description: `Diferencia ${soles((data as any).diferencia)}` })
    setDecl({}); setMotivo(''); refrescar()
  }
  const aclarar = async () => {
    let ruta: string | null = null
    if (aclArchivo) {
      const limpio = aclArchivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_')
      ruta = `${service.id}/caja/conciliacion/${Date.now()}_${limpio}`
      const up = await sb.storage.from('documentos').upload(ruta, aclArchivo, { contentType: aclArchivo.type || undefined })
      if (up.error) return toast.error(mensajeAmigable(up.error))
    }
    const { data, error } = await sb.rpc('conciliacion_aclarar' as any, { p_id: c.id, p_monto: Number(acl.monto), p_texto: acl.texto, p_adjunto: ruta } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Aclaración registrada', { description: `Pendiente por aclarar: ${soles((data as any).pendiente)}` })
    setAcl({ monto: '', texto: '' }); setAclArchivo(null); setDlg(''); refrescar()
  }
  const cerrar = async () => {
    const { error } = await sb.rpc('caja_cerrar' as any, { p_service: service.id, p_box: f.caja || null, p_desde: f.desde, p_hasta: f.hasta, p_nota: null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Período cerrado'); setDlg(''); refrescar()
  }
  const abrir = async (ruta: string) => { const { data } = await sb.storage.from('documentos').createSignedUrl(ruta, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener') }
  const nombreCaja = f.caja ? (cajas.find((x) => x.id === f.caja)?.crew_name ?? cajas.find((x) => x.id === f.caja)?.name) : 'Todas'

  return (
    <div className="space-y-4">
      <KpisCaja desde={f.desde} hasta={f.hasta} caja={f.caja || null} />
      <div className="flex flex-wrap items-center gap-2">
        <Campo i={CalendarDays} t="Fecha inicio"><input type="date" value={f.desde} max={f.hasta} onChange={(e) => e.target.value && setF({ ...f, desde: e.target.value })} className="bg-transparent outline-none" /></Campo>
        <Campo i={CalendarDays} t="Fecha fin"><input type="date" value={f.hasta} min={f.desde} onChange={(e) => e.target.value && setF({ ...f, hasta: e.target.value })} className="bg-transparent outline-none" /></Campo>
        <Campo i={Users} t="Cuadrilla"><Sel v={f.caja} set={(v) => setF({ ...f, caja: v })} ops={cajas.map((x) => [x.id, x.crew_name ?? x.name])} todos="Todas" /></Campo>
        <Campo i={User} t="Responsable"><Sel v={f.responsable} set={(v) => setF({ ...f, responsable: v })} ops={[...new Map(cajas.filter((x) => x.holder_id).map((x) => [x.holder_id, x.holder_name ?? '—'])).entries()] as any} /></Campo>
        <Button onClick={refrescar}><Search className="size-4" />Buscar</Button>
        <MenuExportar alElegir={(fmt) => exportar(fmt, 'Conciliación de caja', movs, service, profile.full_name, `Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`)} />
      </div>
      <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Info className="size-4" />Resumen de conciliación</p>
        <div className="bg-info/8 rounded-lg px-3 py-2"><p className="text-[11.5px]"><Wallet className="mr-1 inline size-3.5" />Saldo declarado</p><p className="font-bold">{soles(declarado)}</p></div>
        <span className="text-xl font-bold">−</span>
        <div className="bg-info/8 rounded-lg px-3 py-2"><p className="text-[11.5px]"><Layers className="mr-1 inline size-3.5" />Saldo esperado</p><p className="font-bold">{soles(esperado)}</p></div>
        <span className="text-xl font-bold">=</span>
        <div className={cn('rounded-lg px-3 py-2', Math.abs(diferencia) > 0.004 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}><p className="text-[11.5px]"><AlertTriangle className="mr-1 inline size-3.5" />Diferencia</p><p className="font-bold">{soles(diferencia)}</p></div>
        {c && <span className="text-muted-foreground text-[12px]">Según {c.codigo} ({fmtDateTime(c.cuando)}){Math.abs(diferencia - pendiente) > 0.004 ? ` · aclarado ${soles(Math.abs(diferencia) - Math.abs(pendiente))}` : ''}</span>}
      </CardContent></Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Movimientos del período</CardTitle>
              <span className="text-muted-foreground text-[12px]">Mostrando {(soloDif ? movs.filter((m) => Math.abs(dif(m)) > 0.004) : movs).length} de {movs.length} movimientos</span></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-[12.5px]">
                <thead className="bg-secondary/50 text-left"><tr>{['ID', 'Fecha', 'Concepto', 'Comprobante', 'Gasto sustentado', 'Pendiente rendir', 'Declarado', 'Diferencia'].map((t) => <th key={t} className="px-3 py-2 font-semibold">{t}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {movs.length === 0 && <tr><td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">Sin movimientos en el período.</td></tr>}
                  {(soloDif ? movs.filter((m) => Math.abs(dif(m)) > 0.004) : movs).map((m) => (
                    <tr key={m.id} onClick={() => setElegido(m.id)} className={cn('cursor-pointer', elegido === m.id && 'bg-primary/5')}>
                      <td className="text-primary px-3 py-1.5 font-semibold">{m.codigo}</td><td className="px-3">{fmtDate(m.fecha)}</td><td className="px-3">{m.concepto}</td><td className="px-3">{m.comprobante}</td>
                      <td className="px-3 tabular-nums">{soles(m.sustentado)}</td><td className="px-3 tabular-nums">{soles(m.pendiente)}</td>
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>{m.tipo !== 'gasto' ? soles(0) : c ? (declaradoDe(m) ? soles(Number(declaradoDe(m))) : '—') : <Input type="number" step="0.01" value={decl[m.id] ?? ''} onChange={(e) => setDecl({ ...decl, [m.id]: e.target.value })} className="h-8 w-28" placeholder={String(esperadoMov(m))} />}</td>
                      <td className="px-3"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', Math.abs(dif(m)) > 0.004 ? 'bg-destructive/12 text-destructive' : 'bg-success/12 text-success')}>{soles(dif(m))}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          {Math.abs(pendiente) > 0.004 && (
            <div className="bg-destructive/8 text-destructive rounded-lg p-3 text-[12.5px]">
              <p><AlertTriangle className="mr-1 inline size-4" /><strong>Discrepancia detectada:</strong> el saldo declarado ({soles(declarado)}) es {soles(Math.abs(diferencia))} {diferencia < 0 ? 'menor' : 'mayor'} que el saldo esperado ({soles(esperado)}).</p>
              <p>La diferencia de {soles(Math.abs(pendiente))} está pendiente de aclaración. No se forzará el saldo ni se borrarán movimientos.</p>
            </div>
          )}
          {!c && (
            <Card><CardContent className="space-y-2 p-4 text-[12.5px]">
              <Textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={Math.abs(total) > 0.004 ? 'Motivo de la diferencia (obligatorio)' : 'Nota (opcional)'} />
              <div className="flex justify-end"><Button onClick={registrar} disabled={Math.abs(total) > 0.004 && !motivo.trim()}><Save className="size-4" />Registrar conciliación</Button></div>
            </CardContent></Card>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSoloDif(!soloDif)}><ArrowLeftRight className="size-4" />{soloDif ? 'Ver todos los movimientos' : 'Comparar movimientos'}</Button>
            <Button onClick={() => setDlg('aclarar')} disabled={!c || Math.abs(pendiente) <= 0.004}><Plus className="size-4" />Registrar aclaración</Button>
            <Button variant="outline" onClick={() => setDlg('historial')}><History className="size-4" />Ver historial</Button>
            <Button variant="outline" onClick={() => setDlg('cierre')}><CalendarDays className="size-4" />Revisar cierre</Button>
          </div>
        </div>
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">Detalle de conciliación</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[12.5px]">
            {!c ? <p className="text-muted-foreground">Aún no hay conciliación registrada para este período y cuadrilla. Declara lo que corresponde a cada gasto y regístrala.</p> : (<>
              <p className="flex items-center gap-2"><FileText className="text-info size-5" /><strong className="text-[15px]">{c.codigo}</strong><Chip e={Math.abs(pendiente) > 0.004 ? 'observado' : 'conforme'} /></p>
              <div className="space-y-1">
                <p><strong>Actor (Cuadrilla):</strong> {nombreCaja}</p><p><strong>Período:</strong> {fmtDate(f.desde)} – {fmtDate(f.hasta)}</p>
                <p><strong>Concepto:</strong> Conciliación de caja presupuestal</p><p><strong>Comprobante:</strong> Varios</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary rounded-lg p-2"><p className="text-[11px]">Saldo esperado</p><p className="font-bold">{soles(esperado)}</p></div>
                <div className="bg-secondary rounded-lg p-2"><p className="text-[11px]">Saldo declarado</p><p className="font-bold">{soles(declarado)}</p></div>
                <div className={cn('rounded-lg p-2', Math.abs(diferencia) > 0.004 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}><p className="text-[11px]">Diferencia</p><p className="font-bold">{soles(diferencia)}</p></div>
              </div>
              {estado.data?.cerrado ? <p className="bg-success/10 text-success rounded-lg p-2.5"><CheckCircle2 className="mr-1 inline size-4" /><strong>Período cerrado</strong> · {fmtDateTime(estado.data.cerrado_at)}</p>
                : estado.data?.bloqueado ? <div className="bg-destructive/8 rounded-lg p-2.5"><p className="text-destructive flex items-center gap-1 font-semibold"><Lock className="size-4" />Cierre bloqueado</p><p>{estado.data.motivo_bloqueo}</p></div>
                : <p className="bg-success/10 text-success rounded-lg p-2.5"><Check className="mr-1 inline size-4" />Sin diferencia pendiente: el período se puede cerrar.</p>}
              <div>
                <p className="mb-1 flex items-center gap-1 font-semibold"><Paperclip className="size-3.5" />Adjuntos ({(c.aclaraciones ?? []).filter((a: any) => a.adjunto).length})</p>
                {(c.aclaraciones ?? []).filter((a: any) => a.adjunto).map((a: any) => <button key={a.adjunto} onClick={() => abrir(a.adjunto)} className="hover:bg-secondary flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left"><FileText className="size-4" /><span className="flex-1 truncate">{a.adjunto.split('/').pop()}</span><Download className="text-info size-4" /></button>)}
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1 font-semibold"><History className="size-3.5" />Historial</p>
                <ul className="space-y-1 border-l-2 border-success/40 pl-3">
                  <li>● Conciliación iniciada: {fmtDateTime(c.cuando)}{c.motivo ? ` · ${c.motivo}` : ''}</li>
                  {(c.aclaraciones ?? []).map((a: any, i: number) => <li key={i}>● Aclaración {soles(a.monto)}: {a.texto} · {a.quien} · {fmtDateTime(a.cuando)}</li>)}
                  {Math.abs(pendiente) > 0.004 && <li className="text-muted-foreground">○ Aclaración pendiente: {soles(Math.abs(pendiente))}</li>}
                  {estado.data?.cerrado && <li>● Período cerrado: {fmtDateTime(estado.data.cerrado_at)}</li>}
                </ul>
              </div>
            </>)}
            <p className="bg-info/8 text-info flex gap-2 rounded-lg p-2"><Info className="mt-0.5 size-4 shrink-0" />No hay conexión bancaria. La conciliación se realiza con movimientos internos y comprobantes.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dlg !== ''} onOpenChange={(o) => !o && setDlg('')}>
        <DialogContent className="max-w-lg">
          {dlg === 'aclarar' && (<>
            <DialogHeader><DialogTitle>Registrar aclaración</DialogTitle><DialogDescription>Explica la diferencia pendiente ({soles(Math.abs(pendiente))}). No se fuerza el saldo ni se borran movimientos.</DialogDescription></DialogHeader>
            <div className="space-y-2 text-[12.5px]">
              <Etq t="Monto que aclara (S/)" req><Input type="number" step="0.01" value={acl.monto} onChange={(e) => setAcl({ ...acl, monto: e.target.value })} placeholder={String(Math.abs(pendiente))} /></Etq>
              <Etq t="Aclaración" req><Textarea rows={3} value={acl.texto} onChange={(e) => setAcl({ ...acl, texto: e.target.value })} placeholder="Qué explica la diferencia y con qué soporte" /></Etq>
              <Etq t="Soporte (opcional)"><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setAclArchivo(e.target.files?.[0] ?? null)} /></Etq>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDlg('')}>Cancelar</Button><Button onClick={aclarar} disabled={!(Number(acl.monto) > 0) || !acl.texto.trim()}>Registrar aclaración</Button></div>
            </div>
          </>)}
          {dlg === 'historial' && (<>
            <DialogHeader><DialogTitle>Historial de conciliaciones</DialogTitle><DialogDescription>Cada conciliación queda registrada con su diferencia y motivo.</DialogDescription></DialogHeader>
            <ul className="max-h-[calc(var(--vh)_*_60)] space-y-1.5 overflow-y-auto text-[12.5px]">
              {(hist.data ?? []).map((h) => <li key={h.id} className="rounded-lg border border-border p-2"><strong>{h.codigo}</strong> · {fmtDate(h.desde)} – {fmtDate(h.hasta)} · esperado {soles(h.saldo_esperado ?? 0)} · diferencia <span className={Math.abs(h.diferencia) > 0.004 ? 'text-destructive' : 'text-success'}>{soles(h.diferencia)}</span>{h.motivo ? ` · ${h.motivo}` : ''}</li>)}
              {!(hist.data ?? []).length && <li className="text-muted-foreground">Ninguna todavía.</li>}
            </ul>
          </>)}
          {dlg === 'cierre' && (<>
            <DialogHeader><DialogTitle>Revisar cierre del período</DialogTitle><DialogDescription>{nombreCaja} · {fmtDate(f.desde)} – {fmtDate(f.hasta)}</DialogDescription></DialogHeader>
            <div className="space-y-2 text-[12.5px]">
              {estado.data?.cerrado ? <p className="text-success font-semibold">El período ya está cerrado ({fmtDateTime(estado.data.cerrado_at)}).</p>
                : estado.data?.bloqueado ? <p className="bg-destructive/8 text-destructive rounded-lg p-2.5"><Lock className="mr-1 inline size-4" /><strong>Cierre bloqueado.</strong> {estado.data.motivo_bloqueo}</p>
                : <p className="bg-success/10 text-success rounded-lg p-2.5">Sin diferencia pendiente de aclaración. Puedes cerrar el período.</p>}
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDlg('')}>Cancelar</Button><Button onClick={cerrar} disabled={!!estado.data?.bloqueado || !!estado.data?.cerrado}><Clock className="size-4" />Cerrar período</Button></div>
            </div>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  )
}
