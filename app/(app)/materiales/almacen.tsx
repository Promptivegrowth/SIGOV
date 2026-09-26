'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Search, PackagePlus, SlidersHorizontal, Check, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea, Field } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  MOVIMIENTO, type TipoMovimiento, cifra, leerCifra, paraBuscar, hoyLima, estadoDeStock,
  useInsumos, useCuadrillas, useCategorias, Selector, InsumoPicker,
} from './comun'

const VISTA = [
  { key: 'todos', label: 'Todos' },
  { key: 'alerta', label: 'Sin stock o bajo el mínimo' },
  { key: 'con_stock', label: 'Con stock' },
] as const

/**
 * El almacén: cuánto hay de cada insumo y todo lo que lo movió.
 *
 * El stock no se escribe a mano: es la suma de sus movimientos. Por eso
 * aquí no se «corrige» un número, se registra lo que pasó —llegó una
 * compra, se contó y faltaban tres, se rompió un galón— y cada registro
 * queda firmado.
 */
export function AlmacenTab({ serviceId, can }: {
  serviceId: string
  can: { write: boolean; manage: boolean }
}) {
  const qc = useQueryClient()
  const insumos = useInsumos(serviceId)
  const categorias = useCategorias()
  const [q, setQ] = React.useState('')
  const [vista, setVista] = React.useState<(typeof VISTA)[number]['key']>('todos')
  const [categoria, setCategoria] = React.useState('')
  const [registrar, setRegistrar] = React.useState<{ tipo: TipoMovimiento; insumo?: any } | null>(null)
  const [kardexDe, setKardexDe] = React.useState<any>(null)

  const visibles = React.useMemo(() => {
    const t = paraBuscar(q)
    return (insumos.data ?? [])
      .filter((s: any) => s.is_active)
      .filter((s: any) => !categoria || s.category === categoria)
      .filter((s: any) => !t || paraBuscar(s.name).includes(t) || paraBuscar(s.code).includes(t))
      .filter((s: any) => {
        const { estado, disponible } = estadoDeStock(s)
        if (vista === 'alerta') return estado !== 'ok'
        if (vista === 'con_stock') return disponible > 0
        return true
      })
  }, [insumos.data, q, vista, categoria])

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['insumos'] })
    qc.invalidateQueries({ queryKey: ['kardex'] })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo por nombre o código" className="pl-9" />
        </div>
        <Selector value={categoria} onChange={setCategoria} className="w-full sm:w-56">
          <option value="">Todas las categorías</option>
          {categorias.data?.map((c: any) => <option key={c.code} value={c.name}>{c.name}</option>)}
        </Selector>
        <Selector value={vista} onChange={(v) => setVista(v as any)} className="w-full sm:w-56">
          {VISTA.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </Selector>
        {can.manage && (
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setRegistrar({ tipo: 'ajuste' })}>
              <SlidersHorizontal /> Ajuste, merma o devolución
            </Button>
            <Button onClick={() => setRegistrar({ tipo: 'ingreso' })}>
              <PackagePlus /> Registrar ingreso
            </Button>
          </div>
        )}
      </div>

      {insumos.isLoading && <SkeletonList rows={6} />}

      {visibles.map((s: any) => {
        const { disponible, estado } = estadoDeStock(s)
        return (
          <Card
            key={s.id}
            className="hover:border-primary/40 cursor-pointer transition-colors"
            onClick={() => setKardexDe(s)}
          >
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground text-[13px]">
                  {[s.code, s.category, s.last_movement_on && `último movimiento ${fmtDate(s.last_movement_on)}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              {estado === 'sin_stock' && <Badge variant="outline">Sin stock</Badge>}
              {estado === 'bajo_minimo' && (
                <Badge variant="destructive"><AlertTriangle /> Bajo el mínimo de {cifra(s.min_stock)}</Badge>
              )}
              <div className="text-right">
                <p className={cn('text-lg font-bold tabular-nums', estado === 'bajo_minimo' && 'text-destructive', estado === 'sin_stock' && 'text-muted-foreground')}>
                  {cifra(disponible)} {s.unit_symbol}
                </p>
                <p className="text-muted-foreground text-[12px]">
                  {Number(s.committed) > 0
                    ? `de ${cifra(s.stock)} · ${cifra(s.committed)} comprometido`
                    : 'disponible'}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {!insumos.isLoading && visibles.length === 0 && (
        <EmptyState icon={Search} title="Ningún insumo coincide" description="Prueba con otro nombre, código o filtro." />
      )}

      {registrar && (
        <MovimientoDialog
          serviceId={serviceId}
          tipoInicial={registrar.tipo}
          insumoInicial={registrar.insumo}
          onClose={() => setRegistrar(null)}
          onHecho={() => { setRegistrar(null); refrescar() }}
        />
      )}

      {kardexDe && (
        <KardexDialog
          insumo={kardexDe}
          serviceId={serviceId}
          can={can}
          onClose={() => setKardexDe(null)}
          onRegistrar={(tipo) => { setRegistrar({ tipo, insumo: kardexDe }); setKardexDe(null) }}
        />
      )}
    </div>
  )
}

// ─── Registrar un movimiento ───────────────────────────────────────────

const TIPOS_MANUALES: TipoMovimiento[] = ['ingreso', 'ajuste', 'merma', 'devolucion']

export function MovimientoDialog({ serviceId, tipoInicial, insumoInicial, onClose, onHecho }: {
  serviceId: string
  tipoInicial: TipoMovimiento
  insumoInicial?: any
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const insumos = useInsumos(serviceId)
  const cuadrillas = useCuadrillas(serviceId)
  const [tipo, setTipo] = React.useState<TipoMovimiento>(tipoInicial)
  const [insumo, setInsumo] = React.useState<any>(insumoInicial ?? null)
  const [qty, setQty] = React.useState('')
  const [sentido, setSentido] = React.useState<'mas' | 'menos'>('menos')
  const [conteo, setConteo] = React.useState('')
  const [fecha, setFecha] = React.useState(hoyLima())
  const [crewId, setCrewId] = React.useState('')
  const [proveedor, setProveedor] = React.useState('')
  const [documento, setDocumento] = React.useState('')
  const [costo, setCosto] = React.useState('')
  const [nota, setNota] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  // El insumo elegido, con su stock al día
  const actual = insumo ? insumos.data?.find((s: any) => s.id === insumo.id) ?? insumo : null
  const stock = actual ? Number(actual.stock) : 0

  // En un ajuste se puede escribir lo contado: la diferencia la saca el sistema
  const deltaAjuste = conteo !== '' ? leerCifra(conteo) - stock
    : (sentido === 'menos' ? -1 : 1) * (leerCifra(qty) || 0)

  const guardar = async () => {
    if (!actual) { toast.error('Elige el insumo'); return }
    let cantidad = leerCifra(qty)
    if (tipo === 'ajuste') {
      cantidad = Math.round(deltaAjuste * 100) / 100
      if (!cantidad) { toast.error('El conteo coincide con el sistema: no hay nada que ajustar'); return }
      if (!nota.trim()) { toast.error('Explica el ajuste: quién contó y por qué no cuadraba'); return }
    } else if (!(cantidad > 0)) {
      toast.error('Escribe la cantidad'); return
    }
    if (tipo === 'merma' && !nota.trim()) { toast.error('Explica la merma: qué pasó con el material'); return }
    if (tipo === 'devolucion' && !crewId) { toast.error('¿Qué cuadrilla devuelve?'); return }

    setEnviando(true)
    const { error } = await sb.from('stock_movements').insert({
      service_id: serviceId,
      supply_id: actual.id,
      kind: tipo,
      qty: cantidad,
      occurred_on: fecha,
      crew_id: crewId || null,
      supplier: tipo === 'ingreso' ? proveedor.trim() || null : null,
      document: documento.trim() || null,
      unit_cost: tipo === 'ingreso' && costo ? leerCifra(costo) : null,
      notes: nota.trim() || null,
    })
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${MOVIMIENTO[tipo].label} registrado`)
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar movimiento de almacén</DialogTitle>
          <DialogDescription>Queda en el kárdex del insumo, con tu nombre y la hora.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TIPOS_MANUALES.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tipo === t ? 'default' : 'outline'}
                onClick={() => setTipo(t)}
              >
                {MOVIMIENTO[t].label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground -mt-1 text-[12px]">{MOVIMIENTO[tipo].ayuda}</p>

          {actual ? (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{actual.name}</p>
                <p className="text-muted-foreground text-[12px]">
                  {actual.code} · en el sistema {cifra(stock)} {actual.unit_symbol ?? ''}
                </p>
              </div>
              {!insumoInicial && <Button size="sm" variant="ghost" onClick={() => setInsumo(null)}>Cambiar</Button>}
            </div>
          ) : (
            <InsumoPicker insumos={insumos.data ?? []} onElegir={setInsumo} />
          )}

          {tipo === 'ajuste' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contado en físico" hint="Lo más fácil: el sistema calcula la diferencia">
                <Input value={conteo} onChange={(e) => setConteo(e.target.value)} inputMode="decimal" placeholder={cifra(stock)} />
              </Field>
              <Field label="…o la diferencia" hint={conteo !== '' ? 'Se usa lo contado' : 'Cuánto sobra o falta'}>
                <div className="flex gap-1.5">
                  <Selector value={sentido} onChange={(v) => setSentido(v as any)} className="w-28" disabled={conteo !== ''}>
                    <option value="menos">Falta</option>
                    <option value="mas">Sobra</option>
                  </Selector>
                  <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" disabled={conteo !== ''} />
                </div>
              </Field>
              {actual && deltaAjuste !== 0 && (
                <p className="text-[12.5px] sm:col-span-2">
                  Ajuste de <b className={deltaAjuste < 0 ? 'text-destructive' : 'text-success'}>
                    {deltaAjuste > 0 ? '+' : ''}{cifra(deltaAjuste)}
                  </b> · el stock queda en <b>{cifra(stock + deltaAjuste)}</b> {actual.unit_symbol ?? ''}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cantidad">
                <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoFocus />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={fecha} max={hoyLima()} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>
          )}

          {tipo === 'ingreso' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Proveedor" className="sm:col-span-3">
                <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="COVINCA, ferretería…" />
              </Field>
              <Field label="Guía o factura" className="sm:col-span-2">
                <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="GR 001-2345" />
              </Field>
              <Field label="Costo unitario">
                <Input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" placeholder="S/" />
              </Field>
            </div>
          )}

          {(tipo === 'devolucion' || tipo === 'merma') && (
            <Field label="Cuadrilla" hint={tipo === 'merma' ? 'Si la pérdida fue en una cuadrilla' : undefined}>
              <Selector value={crewId} onChange={setCrewId}>
                <option value="">{tipo === 'merma' ? 'En almacén' : 'Elige…'}</option>
                {cuadrillas.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Selector>
            </Field>
          )}

          <Field label="Nota" hint={tipo === 'ajuste' || tipo === 'merma' ? 'Obligatoria' : 'Opcional'}>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button loading={enviando} onClick={guardar}>
            <Check /> Registrar {MOVIMIENTO[tipo].label.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── El kárdex de un insumo ────────────────────────────────────────────

function KardexDialog({ insumo, serviceId, can, onClose, onRegistrar }: {
  insumo: any
  serviceId: string
  can: { manage: boolean }
  onClose: () => void
  onRegistrar: (tipo: TipoMovimiento) => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const movimientos = useQuery({
    queryKey: ['kardex', serviceId, insumo.id],
    queryFn: async () => {
      const { data, error } = await sb.from('v_kardex').select('*')
        .eq('supply_id', insumo.id)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data ?? []
    },
  })
  const { disponible } = estadoDeStock(insumo)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{insumo.name}</DialogTitle>
          <DialogDescription>
            {insumo.code} · stock {cifra(insumo.stock)} {insumo.unit_symbol ?? ''}
            {Number(insumo.committed) > 0 && ` · ${cifra(insumo.committed)} comprometido · ${cifra(disponible)} disponible`}
          </DialogDescription>
        </DialogHeader>

        {can.manage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onRegistrar('ingreso')}><PackagePlus /> Ingreso</Button>
            <Button size="sm" variant="outline" onClick={() => onRegistrar('ajuste')}><SlidersHorizontal /> Ajuste, merma o devolución</Button>
          </div>
        )}

        {movimientos.isLoading && <SkeletonList rows={4} />}
        {movimientos.data?.length === 0 && (
          <EmptyState icon={History} title="Sin movimientos" description="Este insumo todavía no ha entrado ni salido del almacén." />
        )}
        {!!movimientos.data?.length && <TablaKardex filas={movimientos.data} conInsumo={false} />}
      </DialogContent>
    </Dialog>
  )
}

/** La tabla del kárdex, para un insumo o para todo el almacén. */
export function TablaKardex({ filas, conInsumo, onAnular }: {
  filas: any[]
  conInsumo: boolean
  onAnular?: (fila: any) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[12.5px]">
        <thead className="bg-secondary/50 text-muted-foreground text-left text-[11.5px]">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-2 py-2 font-medium">Movimiento</th>
            {conInsumo && <th className="px-2 py-2 font-medium">Insumo</th>}
            <th className="px-2 py-2 text-right font-medium">Cantidad</th>
            <th className="px-2 py-2 text-right font-medium">Saldo</th>
            <th className="px-2 py-2 font-medium">Cuadrilla · pedido · partida</th>
            <th className="px-2 py-2 font-medium">Registró</th>
            {onAnular && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => {
            const t = MOVIMIENTO[m.kind as TipoMovimiento]
            const destino = [
              m.crew_name,
              m.request_code,
              m.activity_name,
              m.section_name,
              m.supplier,
              m.document,
            ].filter(Boolean).join(' · ')
            return (
              <tr key={m.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(m.occurred_on)}</td>
                <td className="px-2 py-2"><Badge variant={t?.variant ?? 'outline'}>{t?.label ?? m.kind}</Badge></td>
                {conInsumo && (
                  <td className="px-2 py-2">
                    <p className="font-medium">{m.supply_name}</p>
                    <p className="text-muted-foreground text-[11.5px]">{m.supply_code}</p>
                  </td>
                )}
                <td className={cn('px-2 py-2 text-right whitespace-nowrap tabular-nums', Number(m.delta) < 0 ? 'text-destructive' : 'text-success')}>
                  {Number(m.delta) > 0 ? '+' : ''}{cifra(m.delta)} {m.unit_symbol ?? ''}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{cifra(m.saldo)}</td>
                <td className="px-2 py-2">
                  {destino || <span className="text-muted-foreground">—</span>}
                  {m.notes && <p className="text-muted-foreground text-[11.5px]">{m.notes}</p>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{m.created_by_name ?? <span className="text-muted-foreground">Carga inicial</span>}</td>
                {onAnular && (
                  <td className="px-2 py-2 text-right">
                    {!m.request_id && (
                      <Button size="sm" variant="ghost" onClick={() => onAnular(m)}>Anular</Button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
