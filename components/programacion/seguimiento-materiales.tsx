'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, FileSpreadsheet, List, ClipboardCheck, Info, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { tablaPdf, tablaXlsx, num, L, type Tabla, type Valor, type Celda } from '@/lib/formato-mrpci'
import { cn, fmtDate, fmtDateTime, toISODate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Seguimiento» (MRPCI_03 y el modelo de resumen de insumos por periodo).
 *
 * Stock teórico = apertura + entradas − salidas confirmadas. El consumo de
 * un parte diario cuenta para el saldo cuando el Supervisor valida el
 * parte; mientras tanto se ve «por validar». El conteo físico no sobrescribe
 * el saldo: la diferencia queda registrada y solo un ajuste autorizado crea
 * un movimiento con motivo, autor y fecha. El requerimiento no toca stock.
 */
const TIPO: Record<string, string> = {
  entrega_almacen: 'Ingreso (entrega de almacén)', devolucion: 'Devolución a almacén', saldo_inicial: 'Saldo inicial',
  consumo: 'Salida por consumo', traslado: 'Traslado enviado', traslado_recibido: 'Traslado recibido', merma: 'Merma', ajuste: 'Ajuste',
}

export function SeguimientoMateriales({ serviceId, crewId, crewNombre, desde, hasta, semana, canEdit }: {
  serviceId: string; crewId: string; crewNombre: string; desde: Date; hasta: Date; semana: string; canEdit: boolean
}) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [sel, setSel] = React.useState('')
  const [movs, setMovs] = React.useState(false)
  const [conteo, setConteo] = React.useState<{ supply: string; cantidad: string; nota: string } | null>(null)
  const q = useQuery({
    queryKey: ['seguimiento', serviceId, crewId, toISODate(desde), toISODate(hasta)],
    enabled: !!crewId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('seguimiento_materiales' as any, { p_service: serviceId, p_crew: crewId, p_desde: toISODate(desde), p_hasta: toISODate(hasta) } as any)
      if (error) throw error
      return data as any
    },
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['seguimiento'] })
  const registrar = async () => {
    if (!conteo) return
    const { data, error } = await sb.rpc('conteo_registrar' as any, { p_crew: crewId, p_supply: conteo.supply, p_contado: Number(conteo.cantidad), p_nota: conteo.nota || null } as any)
    if (error) return toast.error(mensajeAmigable(error))
    const x = data as any
    toast.success('Conteo físico registrado', { description: `Diferencia ${num(x.diferencia)} frente al teórico ${num(x.teorico)}. El saldo no cambia hasta autorizar el ajuste.` })
    setConteo(null); refrescar()
  }
  const decidir = async (id: string, ajustar: boolean) => {
    const m = prompt(ajustar ? 'Motivo del ajuste (obligatorio):' : 'Motivo para descartar la diferencia (obligatorio):')?.trim()
    if (!m) return
    const { error } = await sb.rpc('conteo_decidir' as any, { p_conteo: id, p_ajustar: ajustar, p_motivo: m } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(ajustar ? 'Ajuste autorizado: se creó el movimiento con motivo' : 'Diferencia descartada; el saldo se mantiene')
    refrescar()
  }

  if (!crewId) return <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Elige una cuadrilla en el filtro: el seguimiento es por cuadrilla.</CardContent></Card>
  if (q.isLoading) return <SkeletonList rows={5} />
  if (q.error) return <p className="text-destructive text-[13px]">{mensajeAmigable(q.error)}</p>
  const d = q.data
  const insumos = (d?.insumos ?? []) as any[]
  const s = insumos.find((x) => x.supply_id === sel) ?? insumos.find((x) => x.conteo) ?? insumos[0]
  const movsDe = (d?.movimientos ?? []) as any[]
  const confirmados = movsDe.filter((m) => m.confirmado && (!s || m.supply_id === s.supply_id)).length
  const corte = `${fmtDate(hasta).slice(0, 5)} · ${new Date().toTimeString().slice(0, 5)}`
  const meta = `SEGUIMIENTO DE MATERIALES · SEMANA ${semana} · CUADRILLA: ${crewNombre.toUpperCase()} · PERIODO ${fmtDate(desde)} – ${fmtDate(hasta)} · CORTE ${corte}`
  // ── Exportes: Resumen de insumos por periodo (A4 vertical) vinculado al Kardex diario ──
  const HOJA_KAR = 'Kardex diario', HOJA_RES = 'Resumen de insumos'
  const dias: Date[] = []
  for (let t = new Date(toISODate(desde) + 'T12:00:00'); toISODate(t) <= toISODate(hasta); t = new Date(t.getTime() + 86400000)) dias.push(t)
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
  const DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const semanaIso = (f: Date) => { const d = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())); const n = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - n); return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7) }
  const OCULTA_CERO = '#,##0.00;-#,##0.00;""'
  // Las mismas filas (familias e insumos) en las dos hojas: el resumen apunta a la fila del kardex
  const orden = (() => {
    const out: ({ banda: string } | { x: any; n: number })[] = []
    let familia: string | null = null
    insumos.forEach((x, i) => {
      const f = String(x.familia ?? 'OTROS').toUpperCase()
      if (f !== familia) { familia = f; out.push({ banda: f }) }
      out.push({ x, n: i + 1 })
    })
    return out
  })()
  const bandas = orden.map((o, i) => ('banda' in o ? i : -1)).filter((i) => i >= 0)
  const kardex = (): Tabla => {
    const nd = dias.length
    const cEnt = (k: number) => 6 + k * 2, cSal = (k: number) => 7 + k * 2, cSaldo = 6 + nd * 2
    const cab: Celda[][] = [
      [...['ITEM', 'DESCRIPCIÓN DE MATERIAL', 'UNIDAD', 'ENTRADA', 'SALIDA'].map((t) => ({ t, rs: 3 })), { t: 'STOCK', rs: 3, fondo: 'FFF1BA' },
        ...dias.map((f) => ({ t: `${MES[f.getMonth()]} · ${semanaIso(f)}`, cs: 2 })), { t: 'Saldo inicial', rs: 3, fondo: 'E7F2FA' }],
      dias.map((f) => ({ t: `${DIA[f.getDay()]} ${String(f.getDate()).padStart(2, '0')}`, cs: 2 })),
      dias.flatMap(() => [{ t: 'Entr', fondo: 'C6EFCE' }, { t: 'Sali', fondo: 'FFC7CE' }]),
    ]
    const filas: Valor[][] = orden.map((o): Valor[] => {
      if ('banda' in o) return [o.banda]
      const x = o.x
      const del = (f: Date, campo: 'entrada' | 'salida') => movsDe.filter((m) => m.confirmado && m.supply_id === x.supply_id && String(m.fecha).slice(0, 10) === toISODate(f))
        .reduce((a, m) => a + Number(m[campo] ?? 0), 0)
      const pares = dias.flatMap((f): Valor[] => {
        const e = del(f, 'entrada'), sa = del(f, 'salida')
        return [e ? { v: e, fmt: '0.00', color: '006100' } : null, sa ? { v: sa, fmt: '0.00', color: '9C0006' } : null]
      })
      return [String(o.n).padStart(2, '0'), x.nombre, x.unidad,
        { v: Number(x.entradas ?? 0), f: `SUM(${dias.map((_, k) => L(cEnt(k)) + '{r}').join(',')})`, fmt: '0.00' },
        { v: Number(x.salidas ?? 0), f: `SUM(${dias.map((_, k) => L(cSal(k)) + '{r}').join(',')})`, fmt: '0.00' },
        { v: Number(x.teorico ?? 0), f: `${L(cSaldo)}{r}+D{r}-E{r}`, fmt: '0.00', fondo: 'FFF1BA', negrita: true },
        ...pares, { v: Number(x.apertura ?? 0), fmt: '0.00', fondo: 'E7F2FA' }]
    })
    return {
      titulo: `KARDEX DIARIO · ${crewNombre.toUpperCase()}`, meta: `${meta} · ENTRADAS Y SALIDAS CONFIRMADAS POR DÍA`,
      cabecera: cab, filas, bandas, fijas: 3,
      anchos: [20, 120, 30, 34, 34, 36, ...dias.flatMap(() => [24, 24]), 40],
      pie: ['ENTRADA = suma de entradas del periodo · SALIDA = suma de salidas · STOCK = saldo inicial + entradas − salidas. Solo movimientos confirmados (el consumo del parte cuenta al validarlo).'],
    }
  }
  const tabla = (): Tabla => ({
    titulo: 'RESUMEN DE INSUMOS POR PERIODO', meta, vertical: true, fijas: 2,
    cabecera: [['ITEM', 'DESCRIPCIÓN DE MATERIAL', 'UNIDAD', 'ENTRADA', 'SALIDA', { t: 'STOCK', fondo: 'FFF1BA' } as any, { t: 'STOCK REAL INSITU', fondo: 'DCE6F1' } as any].map((c: any) => (typeof c === 'string' ? { t: c } : c))],
    filas: orden.map((o, i): Valor[] => {
      if ('banda' in o) return [o.banda]
      const x = o.x
      const ref = (col: string) => `'${HOJA_KAR}'!${col}{r:${i}@${HOJA_KAR}}`
      return [String(o.n).padStart(2, '0'), x.nombre, x.unidad,
        { v: Number(x.entradas ?? 0), f: ref('D'), fmt: OCULTA_CERO }, { v: Number(x.salidas ?? 0), f: ref('E'), fmt: OCULTA_CERO },
        { v: Number(x.teorico ?? 0), f: ref('F'), fmt: OCULTA_CERO, fondo: 'FFF1BA', negrita: true },
        x.conteo ? { v: Number(x.conteo.contado), fmt: '0.00', fondo: 'DCE6F1' } : { v: null, fondo: 'DCE6F1' }]
    }),
    bandas, anchos: [24, 200, 34, 44, 44, 48, 60],
    pie: ['STOCK = saldo inicial + entradas − salidas. El conteo real es independiente; nunca reemplaza el saldo calculado.',
      'El requerimiento de material no modifica el stock. Solo se registran ingresos, salidas y ajustes efectivos confirmados.'],
  })
  const nombre = `Seguimiento_materiales_semana_${semana}_${crewNombre.replace(/\W+/g, '_')}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[12.5px]">Seguimiento de materiales · Semana {semana} · {crewNombre} · Corte {corte}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!insumos.length} onClick={() => tablaPdf(nombre, [tabla(), kardex()])}><FileDown className="size-4" />PDF</Button>
          <Button size="sm" variant="outline" disabled={!insumos.length} onClick={() => tablaXlsx(nombre, [{ ...tabla(), hoja: HOJA_RES }, { ...kardex(), hoja: HOJA_KAR }])}><FileSpreadsheet className="size-4" />Excel</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['CORTE DEL PERIODO', corte, 'Saldo al cierre de los movimientos confirmados'],
          [`MOVIMIENTOS${s ? ` DE ${String(s.nombre).split(' ').slice(0, 2).join(' ').toUpperCase()}` : ''}`, `${confirmados} confirmados`, 'Ingresos y consumos de partes validados'],
          ['DIFERENCIA DE CONTEO', s?.conteo ? `${num(s.conteo.diferencia)} ${s.unidad}` : '—', s?.conteo ? (s.conteo.estado === 'registrado' ? 'Requiere conciliación' : s.conteo.estado === 'ajustado' ? 'Ajuste autorizado' : 'Diferencia descartada') : 'Sin conteo en el periodo'],
        ].map(([e, v, t]) => (
          <div key={e} className="bg-card rounded-xl border border-border px-4 py-3">
            <p className="text-muted-foreground truncate text-[11px] font-semibold tracking-wide">{e}</p>
            <p className="mt-1 text-xl font-bold">{v}</p><p className="text-muted-foreground text-[11px]">{t}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-[14px]">Resumen de insumos por periodo</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMovs(true)}><List className="size-4" />Ver movimientos</Button>
            {canEdit && <Button size="sm" onClick={() => setConteo({ supply: s?.supply_id ?? '', cantidad: '', nota: '' })} disabled={!insumos.length}><ClipboardCheck className="size-4" />Registrar conteo físico</Button>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-[#17365D] text-white"><tr>
              {['Ítem', 'Descripción del material', 'Unidad', 'Entradas', 'Salidas', 'Stock teórico', 'Stock real insitu', 'Por validar', ''].map((t, i) => (
                <th key={i} className={cn('border border-[#9FB4CD] px-2 py-1.5 font-bold', t === 'Stock teórico' && 'bg-[#FFF0A6] text-[#9C5700]', t === 'Stock real insitu' && 'bg-[#DDE5EE] text-[#17365D]')}>{t}</th>
              ))}
            </tr></thead>
            <tbody>
              {insumos.length === 0 && <tr><td colSpan={9} className="text-muted-foreground px-3 py-6 text-center">La cuadrilla no tiene movimientos de materiales.</td></tr>}
              {insumos.map((x, i) => (
                <React.Fragment key={x.supply_id}>
                  {(i === 0 || insumos[i - 1].familia !== x.familia) && (
                    <tr><td colSpan={9} className="bg-[#17365D] px-2 py-0.5 text-[11px] font-bold text-white">{String(x.familia ?? 'OTROS').toUpperCase()}</td></tr>
                  )}
                  <tr onClick={() => setSel(x.supply_id)} className={cn('cursor-pointer text-center', s?.supply_id === x.supply_id ? 'bg-[#DCE6F1]/70' : 'hover:bg-secondary/60')}>
                    <td className="border border-[#C9D6E5] px-2">{String(i + 1).padStart(2, '0')}</td>
                    <td className="border border-[#C9D6E5] px-2 text-left">{x.nombre}</td>
                    <td className="border border-[#C9D6E5] px-2">{x.unidad}</td>
                    <td className="border border-[#C9D6E5] px-2 tabular-nums">{x.entradas ? num(x.entradas) : '—'}</td>
                    <td className="border border-[#C9D6E5] px-2 tabular-nums">{x.salidas ? num(x.salidas) : '—'}</td>
                    <td className="border border-[#C9D6E5] bg-[#FFF0A6]/70 px-2 font-semibold text-[#9C5700] tabular-nums">{num(x.teorico)}</td>
                    <td className="border border-[#C9D6E5] bg-[#DDE5EE]/70 px-2 tabular-nums">{x.conteo ? num(x.conteo.contado) : '—'}</td>
                    <td className="border border-[#C9D6E5] px-2 tabular-nums">{Number(x.por_validar) ? <Badge variant="warning">{num(x.por_validar)}</Badge> : ''}</td>
                    <td className="border border-[#C9D6E5] px-1">
                      {canEdit && x.conteo?.estado === 'registrado' && (
                        <span className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => decidir(x.conteo.id, true)}><CheckCircle2 className="size-3" />Ajustar</Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => decidir(x.conteo.id, false)}><XCircle className="size-3" />Descartar</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground px-3 py-2 text-[11.5px]">El PDF mantiene las familias y posiciones de columnas del formato. Excel conserva filtros. «Por validar»: consumos de partes que el Supervisor aún no valida (no entran al saldo).</p>
        </CardContent>
      </Card>

      {s && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Saldo de {s.nombre}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <div className="grid gap-2 sm:grid-cols-4">
                {[['SALDO DE APERTURA', num(s.apertura)], ['ENTRADA', `+${num(s.entradas)}`], ['CONSUMO REAL', `−${num(s.salidas)}`], ['STOCK AL CIERRE', num(s.teorico)]].map(([e, v], k) => (
                  <div key={e}><p className="text-muted-foreground text-[10.5px] font-semibold">{e}</p>
                    <p className={cn('bg-secondary/60 mt-0.5 rounded-md px-2 py-1.5 font-semibold tabular-nums', k === 3 && 'border-primary border-2')}>{v} {s.unidad}</p></div>
                ))}
              </div>
              <p className="text-muted-foreground">Los movimientos de reportes confirmados aparecen aquí una sola vez.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Conteo físico</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              {s.conteo ? <p>Contado {num(s.conteo.contado)} {s.unidad} el {fmtDateTime(s.conteo.cuando)} · diferencia <strong>{num(s.conteo.diferencia)}</strong> · {s.conteo.estado}</p> : <p className="text-muted-foreground">Sin conteo en el periodo.</p>}
              <p>La diferencia no sobrescribe el saldo. Un ajuste autorizado crea un movimiento con motivo, autor y fecha.</p>
            </CardContent>
          </Card>
        </div>
      )}
      <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]"><Info className="size-4" />
        El requerimiento de material no modifica el stock. Solo se registran ingresos, salidas y ajustes efectivos confirmados.</p>

      <Dialog open={movs} onOpenChange={setMovs}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Movimientos del periodo</DialogTitle>
            <DialogDescription>{crewNombre} · {fmtDate(desde)} – {fmtDate(hasta)}. Los consumos de partes sin validar no cuentan todavía.</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground"><tr><th className="py-1 text-left">Fecha</th><th className="text-left">Insumo</th><th className="text-left">Tipo</th><th className="text-right">Entrada</th><th className="text-right">Salida</th><th className="text-left pl-2">Documento</th><th className="text-left">Estado</th></tr></thead>
              <tbody>
                {movsDe.map((m) => (
                  <tr key={m.id + m.tipo} className="border-t border-border">
                    <td className="py-1">{fmtDate(m.fecha)}</td><td>{m.insumo}</td><td>{TIPO[m.tipo] ?? m.tipo}</td>
                    <td className="text-right tabular-nums">{m.entrada ? num(m.entrada) : ''}</td><td className="text-right tabular-nums">{m.salida ? num(m.salida) : ''}</td>
                    <td className="pl-2">{m.documento ?? ''}{m.notas ? ` · ${m.notas}` : ''}</td>
                    <td>{m.confirmado ? <Badge variant="success">Confirmado</Badge> : <Badge variant="warning">Por validar</Badge>}</td>
                  </tr>
                ))}
                {movsDe.length === 0 && <tr><td colSpan={7} className="text-muted-foreground py-4 text-center">Sin movimientos en el periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!conteo} onOpenChange={(v) => !v && setConteo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar conteo físico</DialogTitle>
            <DialogDescription>Lo contado en la cuadrilla. Queda la diferencia contra el teórico; el saldo no cambia hasta autorizar un ajuste.</DialogDescription></DialogHeader>
          {conteo && (
            <div className="space-y-3 text-[13px]">
              <Select value={conteo.supply || '__'} onValueChange={(v) => setConteo({ ...conteo, supply: v === '__' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__">Elegir material</SelectItem>
                  {insumos.map((x) => <SelectItem key={x.supply_id} value={x.supply_id}>{x.nombre} ({x.unidad}) · teórico {num(x.teorico)}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" min={0} step="0.01" placeholder="Cantidad contada" value={conteo.cantidad} onChange={(e) => setConteo({ ...conteo, cantidad: e.target.value })} />
              <Input placeholder="Nota (opcional)" value={conteo.nota} onChange={(e) => setConteo({ ...conteo, nota: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConteo(null)}>Cancelar</Button>
                <Button onClick={registrar} disabled={!conteo.supply || conteo.cantidad === ''}>Registrar conteo</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
