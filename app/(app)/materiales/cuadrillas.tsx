'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/misc'
import { f8Xlsx } from '@/lib/formato-f8'
import { logoServicon } from '@/components/programacion/formato-covinca'
import { mensajeAmigable } from '@/lib/errores'
import { fmtDate } from '@/lib/utils'
import { useInsumos, useCuadrillas, InsumoPicker, Selector, hoyLima, leerCifra } from './comun'

/** Lo que pasa con el material dentro de la cuadrilla (Formato 8). */
const TIPOS = {
  saldo_inicial: { label: 'Saldo inicial', ayuda: 'Lo que la cuadrilla tiene al abrir el periodo', variant: 'info' as const },
  consumo: { label: 'Consumo en campo', ayuda: 'Lo usado en las actividades del día', variant: 'warning' as const },
  traslado: { label: 'Traslado a otra cuadrilla', ayuda: 'Préstamo: sale de esta y entra en la otra', variant: 'outline' as const },
  merma: { label: 'Merma', ayuda: 'Pérdida o daño en la cuadrilla', variant: 'destructive' as const },
  ajuste: { label: 'Ajuste por conteo', ayuda: 'Diferencia con el conteo físico, con signo', variant: 'outline' as const },
}
const ETIQUETA_KARDEX: Record<string, string> = {
  entrega_almacen: 'Entrega del almacén', devolucion: 'Devolución al almacén', traslado_recibido: 'Traslado recibido',
  saldo_inicial: 'Saldo inicial', consumo: 'Consumo en campo', traslado: 'Traslado enviado', merma: 'Merma', ajuste: 'Ajuste',
}

const tres = (n: any) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(Number(n ?? 0))

/**
 * El material en poder de cada cuadrilla: lo que le entregó el almacén, lo
 * que consumió en campo y lo que le queda. De aquí sale el Formato 8
 * «Seguimiento diario de materiales por cuadrilla».
 */
export function CuadrillasTab({ serviceId, can }: { serviceId: string; can: any }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const cuadrillas = useCuadrillas(serviceId)
  const [crewId, setCrewId] = React.useState('')
  const [mes, setMes] = React.useState(() => hoyLima().slice(0, 7))
  const [registrar, setRegistrar] = React.useState(false)
  const [bajando, setBajando] = React.useState(false)

  React.useEffect(() => {
    if (!crewId && cuadrillas.data?.[0]) setCrewId(cuadrillas.data[0].id)
  }, [cuadrillas.data, crewId])

  const stock = useQuery({
    queryKey: ['stock-cuadrilla', serviceId, crewId],
    enabled: !!crewId,
    queryFn: async () => {
      const { data, error } = await sb.from('v_stock_cuadrilla' as any).select('*').eq('service_id', serviceId).eq('crew_id', crewId).order('supply_name')
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const kardex = useQuery({
    queryKey: ['kardex-cuadrilla', serviceId, crewId, mes],
    enabled: !!crewId,
    queryFn: async () => {
      const [a, m] = mes.split('-').map(Number)
      const fin = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
      const { data, error } = await sb.from('v_kardex_cuadrilla' as any).select('*')
        .eq('service_id', serviceId).eq('crew_id', crewId)
        .gte('occurred_on', `${mes}-01`).lte('occurred_on', fin)
        .order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const anular = async (id: string) => {
    const { error } = await sb.from('movimientos_cuadrilla' as any).update({ deleted_at: new Date().toISOString() } as any).eq('id', id)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Movimiento anulado')
    qc.invalidateQueries({ queryKey: ['stock-cuadrilla'] })
    qc.invalidateQueries({ queryKey: ['kardex-cuadrilla'] })
  }

  const descargarF8 = async () => {
    setBajando(true)
    try {
      const { buffer, nombre, cuadrillas: n } = await f8Xlsx({ sb, servicioId: serviceId, mes, logo: await logoServicon() })
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url; a.download = nombre
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Formato 8 descargado', { description: `${nombre} · ${n} cuadrillas` })
    } catch (e: any) {
      toast.error(mensajeAmigable(e, 'No se pudo generar el Formato 8'))
    } finally {
      setBajando(false)
    }
  }

  const propios = new Set(['saldo_inicial', 'consumo', 'traslado', 'merma', 'ajuste'])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cuadrilla" className="w-64">
          <Selector value={crewId} onChange={setCrewId}>
            {(cuadrillas.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </Selector>
        </Field>
        <Field label="Mes" className="w-44">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </Field>
        <div className="ml-auto flex gap-2">
          {can.write && (
            <Button variant="outline" onClick={() => setRegistrar(true)} disabled={!crewId}>
              <Plus className="size-4" />Registrar movimiento
            </Button>
          )}
          <Button onClick={descargarF8} loading={bajando}>
            <FileSpreadsheet className="size-4" />Formato 8 del mes
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Lo que tiene hoy la cuadrilla</div>
            {(stock.data ?? []).length === 0 ? (
              <EmptyState title="Sin material en la cuadrilla" description="Aparece al entregarle un pedido o registrar su saldo inicial." />
            ) : (
              <table className="w-full text-[12.5px]">
                <thead className="text-muted-foreground text-left text-[11px]">
                  <tr><th className="px-4 py-2">Insumo</th><th className="px-2 py-2 text-right">Entró</th><th className="px-2 py-2 text-right">Salió</th><th className="px-4 py-2 text-right">Stock</th></tr>
                </thead>
                <tbody>
                  {stock.data!.map((s) => (
                    <tr key={s.supply_id} className="border-t border-border">
                      <td className="px-4 py-2"><span className="font-medium">{s.supply_name}</span> <span className="text-muted-foreground">{s.unit_symbol}</span></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tres(s.entradas)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tres(s.salidas)}</td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${Number(s.stock) < 0 ? 'text-destructive' : ''}`}>{tres(s.stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Movimientos del mes</div>
            {(kardex.data ?? []).length === 0 ? (
              <EmptyState title="Sin movimientos este mes" />
            ) : (
              <table className="w-full text-[12.5px]">
                <thead className="text-muted-foreground text-left text-[11px]">
                  <tr><th className="px-4 py-2">Fecha</th><th className="px-2 py-2">Movimiento</th><th className="px-2 py-2">Insumo</th><th className="px-2 py-2 text-right">Entrada</th><th className="px-2 py-2 text-right">Salida</th><th /></tr>
                </thead>
                <tbody>
                  {kardex.data!.map((k, i) => (
                    <tr key={k.id + i} className="border-t border-border">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(k.occurred_on)}</td>
                      <td className="px-2 py-2">
                        {ETIQUETA_KARDEX[k.tipo] ?? k.tipo}
                        {k.documento && <span className="text-muted-foreground"> · {k.documento}</span>}
                        {k.notes && <span className="text-muted-foreground block text-[11px]">{k.notes}</span>}
                      </td>
                      <td className="px-2 py-2">{k.supply_name}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-success">{Number(k.entrada) ? tres(k.entrada) : ''}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-destructive">{Number(k.salida) ? tres(k.salida) : ''}</td>
                      <td className="px-2 py-2 text-right">
                        {can.manage && propios.has(k.tipo) && (
                          <button onClick={() => anular(k.id)} className="text-muted-foreground hover:text-destructive" aria-label="Anular">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {registrar && (
        <MovimientoCuadrillaDialog
          serviceId={serviceId}
          crewId={crewId}
          cuadrillas={cuadrillas.data ?? []}
          onClose={() => setRegistrar(false)}
          onHecho={() => {
            qc.invalidateQueries({ queryKey: ['stock-cuadrilla'] })
            qc.invalidateQueries({ queryKey: ['kardex-cuadrilla'] })
          }}
        />
      )}
    </div>
  )
}

function MovimientoCuadrillaDialog({ serviceId, crewId, cuadrillas, onClose, onHecho }: {
  serviceId: string; crewId: string; cuadrillas: any[]; onClose: () => void; onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const insumos = useInsumos(serviceId)
  const [tipo, setTipo] = React.useState<keyof typeof TIPOS>('saldo_inicial')
  const [insumo, setInsumo] = React.useState<any>(null)
  const [cantidad, setCantidad] = React.useState('')
  const [fecha, setFecha] = React.useState(hoyLima())
  const [destino, setDestino] = React.useState('')
  const [nota, setNota] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const guardar = async () => {
    const qty = leerCifra(cantidad)
    if (!insumo) { toast.error('Elige el insumo'); return }
    if (!Number.isFinite(qty) || qty === 0 || (tipo !== 'ajuste' && qty < 0)) { toast.error('Escribe una cantidad válida'); return }
    if (tipo === 'traslado' && !destino) { toast.error('Elige la cuadrilla que recibe'); return }
    setBusy(true)
    const { error } = await sb.from('movimientos_cuadrilla' as any).insert({
      service_id: serviceId, crew_id: crewId, supply_id: insumo.id, tipo, qty,
      occurred_on: fecha, crew_destino_id: tipo === 'traslado' ? destino : null, notes: nota.trim() || null,
    } as any)
    setBusy(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Movimiento registrado')
    onHecho()
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento de la cuadrilla</DialogTitle>
          <DialogDescription>{cuadrillas.find((c) => c.id === crewId)?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tipo" hint={TIPOS[tipo].ayuda}>
            <Selector value={tipo} onChange={(v) => setTipo(v as any)}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Selector>
          </Field>
          <Field label="Insumo">
            {insumo ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{insumo.name} <span className="text-muted-foreground">{insumo.unit_symbol}</span></span>
                <Button variant="ghost" size="sm" onClick={() => setInsumo(null)}>Cambiar</Button>
              </div>
            ) : (
              <InsumoPicker insumos={insumos.data ?? []} onElegir={setInsumo} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Cantidad${insumo?.unit_symbol ? ' (' + insumo.unit_symbol + ')' : ''}`} hint={tipo === 'ajuste' ? 'Negativa si falta' : 'Hasta 3 decimales: 0,125'}>
              <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>
          {tipo === 'traslado' && (
            <Field label="Cuadrilla que recibe">
              <Selector value={destino} onChange={setDestino}>
                <option value="">Elige…</option>
                {cuadrillas.filter((c) => c.id !== crewId).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </Selector>
            </Field>
          )}
          <Field label="Nota">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Actividad, progresiva, documento…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} loading={busy}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

