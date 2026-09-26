'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Power, Check, Search, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea, Field } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import { cifra, leerCifra, paraBuscar, useCategorias, useUnidades, Selector } from './comun'

/**
 * El maestro de materiales: de aquí nacen los insumos.
 *
 * Cada insumo recibe el siguiente código de su categoría (PIN-031 después
 * de PIN-030) y ese código no se reutiliza nunca: un pedido viejo que diga
 * PIN-014 tiene que seguir apuntando al mismo material. Por eso un insumo
 * no se borra: se desactiva. Deja de ofrecerse para pedir, en la web y en
 * el celular, y su historia queda intacta.
 */
export function MaestroTab({ serviceId, can }: { serviceId: string; can: { manage: boolean } }) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const categorias = useCategorias()
  const [q, setQ] = React.useState('')
  const [categoria, setCategoria] = React.useState('')
  const [estado, setEstado] = React.useState<'activos' | 'inactivos' | 'todos'>('activos')
  const [editando, setEditando] = React.useState<any | 'nuevo' | null>(null)
  const [cambiando, setCambiando] = React.useState<any>(null)

  const maestro = useQuery({
    queryKey: ['insumos', serviceId, 'maestro'],
    queryFn: async () => {
      const [s, v] = await Promise.all([
        sb.from('supplies')
          .select('id, code, name, category, unit_id, min_stock, unit_cost, is_active, notes, created_at, updated_at, units(symbol, name)')
          .eq('service_id', serviceId)
          .is('deleted_at', null)
          .order('code'),
        sb.from('v_supplies').select('id, stock, committed').eq('service_id', serviceId),
      ])
      if (s.error) throw s.error
      if (v.error) throw v.error
      const stock = new Map((v.data ?? []).map((x: any) => [x.id, x]))
      return (s.data ?? []).map((x: any) => ({ ...x, ...stock.get(x.id) }))
    },
  })

  const filas = React.useMemo(() => {
    const t = paraBuscar(q)
    return (maestro.data ?? [])
      .filter((s: any) => estado === 'todos' || (estado === 'activos' ? s.is_active : !s.is_active))
      .filter((s: any) => !categoria || s.category === categoria)
      .filter((s: any) => !t || paraBuscar(s.name).includes(t) || paraBuscar(s.code).includes(t))
  }, [maestro.data, q, categoria, estado])

  const inactivos = (maestro.data ?? []).filter((s: any) => !s.is_active).length

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['insumos'] })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código" className="pl-9" />
        </div>
        <Selector value={categoria} onChange={setCategoria} className="w-full sm:w-56">
          <option value="">Todas las categorías</option>
          {categorias.data?.map((c: any) => <option key={c.code} value={c.name}>{c.code} · {c.name}</option>)}
        </Selector>
        <Selector value={estado} onChange={(v) => setEstado(v as any)} className="w-full sm:w-44">
          <option value="activos">Activos</option>
          <option value="inactivos">Desactivados ({inactivos})</option>
          <option value="todos">Todos</option>
        </Selector>
        {can.manage && (
          <Button className="sm:ml-auto" onClick={() => setEditando('nuevo')}>
            <Plus /> Nuevo insumo
          </Button>
        )}
      </div>

      {maestro.isLoading && <SkeletonList rows={6} />}
      {!maestro.isLoading && filas.length === 0 && (
        <EmptyState icon={BookOpen} title="Ningún insumo coincide" description="Prueba con otro nombre, categoría o estado." />
      )}

      {!!filas.length && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-secondary/50 text-muted-foreground text-left text-[11.5px]">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-2 py-2 font-medium">Insumo</th>
                <th className="px-2 py-2 font-medium">Categoría</th>
                <th className="px-2 py-2 font-medium">Unidad</th>
                <th className="px-2 py-2 text-right font-medium">Mínimo</th>
                <th className="px-2 py-2 text-right font-medium">Costo ref.</th>
                <th className="px-2 py-2 text-right font-medium">Stock</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                {can.manage && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filas.map((s: any) => (
                <tr key={s.id} className={cn('border-t', !s.is_active && 'text-muted-foreground')}>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{s.code}</td>
                  <td className="px-2 py-2">
                    <p className="font-medium">{s.name}</p>
                    {s.notes && <p className="text-muted-foreground text-[11.5px]">{s.notes}</p>}
                  </td>
                  <td className="px-2 py-2">{s.category ?? '—'}</td>
                  <td className="px-2 py-2">{s.units?.symbol ?? '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cifra(s.min_stock)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.unit_cost != null ? `S/ ${cifra(s.unit_cost)}` : '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cifra(s.stock)}</td>
                  <td className="px-2 py-2">
                    {s.is_active ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Desactivado</Badge>}
                  </td>
                  {can.manage && (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditando(s)} aria-label={`Editar ${s.name}`}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setCambiando(s)}
                        aria-label={s.is_active ? `Desactivar ${s.name}` : `Reactivar ${s.name}`}
                      >
                        <Power className={s.is_active ? 'text-destructive' : 'text-success'} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <InsumoDialog
          serviceId={serviceId}
          insumo={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onHecho={() => { setEditando(null); refrescar() }}
        />
      )}
      {cambiando && (
        <ActivarDialog
          insumo={cambiando}
          onClose={() => setCambiando(null)}
          onHecho={() => { setCambiando(null); refrescar() }}
        />
      )}
    </div>
  )
}

function InsumoDialog({ serviceId, insumo, onClose, onHecho }: {
  serviceId: string
  insumo: any | null
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const categorias = useCategorias()
  const unidades = useUnidades()
  const [categoria, setCategoria] = React.useState<string>(insumo?.category ?? '')
  const [code, setCode] = React.useState('')
  const [nombre, setNombre] = React.useState<string>(insumo?.name ?? '')
  const [unitId, setUnitId] = React.useState<string>(insumo?.unit_id ?? '')
  const [minimo, setMinimo] = React.useState<string>(insumo ? String(Number(insumo.min_stock)) : '0')
  const [costo, setCosto] = React.useState<string>(insumo?.unit_cost != null ? String(Number(insumo.unit_cost)) : '')
  const [notas, setNotas] = React.useState<string>(insumo?.notes ?? '')
  const [enviando, setEnviando] = React.useState(false)

  const prefijo = categorias.data?.find((c: any) => c.name === categoria)?.code ?? 'OTR'
  const siguiente = useQuery({
    queryKey: ['siguiente-codigo', serviceId, prefijo],
    enabled: !insumo,
    queryFn: async () => {
      const { data, error } = await sb.rpc('siguiente_codigo_material', { p_service_id: serviceId, p_prefijo: prefijo })
      if (error) throw error
      return data as string
    },
  })

  const guardar = async () => {
    if (!categoria) { toast.error('Elige la categoría: de ella sale el código'); return }
    if (!nombre.trim()) { toast.error('Escribe el nombre del insumo'); return }
    if (!unitId) { toast.error('Elige la unidad en que se pide y se entrega'); return }
    const fila = {
      name: nombre.trim().replace(/\s+/g, ' '),
      category: categoria,
      unit_id: unitId,
      min_stock: leerCifra(minimo) || 0,
      unit_cost: costo.trim() ? leerCifra(costo) : null,
      notes: notas.trim() || null,
      updated_at: new Date().toISOString(),
    }
    setEnviando(true)
    const { data, error } = insumo
      ? await sb.from('supplies').update(fila).eq('id', insumo.id).select('code').single()
      : await sb.from('supplies').insert({ ...fila, service_id: serviceId, code: code.trim() }).select('code').single()
    setEnviando(false)
    if (error) {
      toast.error(error.message.includes('ux_supplies_servicio_nombre')
        ? 'Ya hay un insumo con ese nombre en el maestro'
        : error.message.includes('ux_supplies_servicio_codigo') || error.message.includes('supplies_code_key')
          ? 'Ese código ya está usado'
          : error.message)
      return
    }
    toast.success(insumo ? 'Insumo actualizado' : `Insumo creado con el código ${data?.code}`)
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{insumo ? `Editar ${insumo.code}` : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>
            {insumo
              ? 'El código no cambia aunque cambie la categoría: los pedidos y movimientos lo citan.'
              : 'Se ofrece enseguida para pedir, en la web y en el celular.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría" className="sm:col-span-2">
            <Selector value={categoria} onChange={setCategoria} autoFocus={!insumo}>
              <option value="">Elige una…</option>
              {categorias.data?.map((c: any) => <option key={c.code} value={c.name}>{c.code} · {c.name}</option>)}
            </Selector>
          </Field>
          {!insumo && (
            <Field label="Código" hint={code.trim() ? 'Escrito a mano' : 'Vacío: el siguiente de su categoría'}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={categoria && siguiente.data ? siguiente.data : 'Automático'}
              />
            </Field>
          )}
          <Field label="Unidad" className={insumo ? 'sm:col-span-2' : ''}>
            <Selector value={unitId} onChange={setUnitId}>
              <option value="">Elige…</option>
              {unidades.data?.map((u: any) => <option key={u.id} value={u.id}>{u.symbol} · {u.name}</option>)}
            </Selector>
          </Field>
          <Field label="Nombre" className="sm:col-span-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="PINTURA DE TRÁFICO BLANCA" />
          </Field>
          <Field label="Stock mínimo" hint="Por debajo, avisa que hay que reponer">
            <Input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Costo referencial" hint="S/ por unidad, para estimar pedidos">
            <Input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Especificación, marca, presentación…" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button loading={enviando} onClick={guardar}><Check /> {insumo ? 'Guardar cambios' : 'Crear insumo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActivarDialog({ insumo, onClose, onHecho }: {
  insumo: any
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [enviando, setEnviando] = React.useState(false)
  const desactivar = insumo.is_active

  // Lo que sigue vivo de este insumo: si hay pedidos por entregar, se avisa
  const abiertos = useQuery({
    queryKey: ['pedidos-abiertos-de', insumo.id],
    enabled: desactivar,
    queryFn: async () => {
      const { data, error } = await sb.from('supply_request_items')
        .select('request_id, supply_requests!inner(code, status, deleted_at)')
        .eq('supply_id', insumo.id)
        .is('deleted_at', null)
        .is('supply_requests.deleted_at', null)
        .in('supply_requests.status', ['solicitado', 'aprobado', 'parcial'])
      if (error) return []
      return data ?? []
    },
  })

  const cambiar = async () => {
    setEnviando(true)
    const { error } = await sb.from('supplies')
      .update({ is_active: !desactivar, updated_at: new Date().toISOString() })
      .eq('id', insumo.id)
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success(desactivar ? `${insumo.code} desactivado` : `${insumo.code} reactivado`)
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{desactivar ? 'Desactivar' : 'Reactivar'} {insumo.code}</DialogTitle>
          <DialogDescription>{insumo.name}</DialogDescription>
        </DialogHeader>
        {desactivar ? (
          <div className="space-y-2 text-[13px]">
            <p>Deja de ofrecerse para pedir, en la web y en el celular. No se borra: sus pedidos y movimientos siguen en el kárdex, y se puede reactivar.</p>
            {Number(insumo.stock) !== 0 && (
              <p className="bg-warning/10 text-warning rounded-md px-3 py-2">
                Todavía hay {cifra(insumo.stock)} {insumo.units?.symbol ?? ''} en el almacén.
              </p>
            )}
            {!!abiertos.data?.length && (
              <p className="bg-warning/10 text-warning rounded-md px-3 py-2">
                Está en {abiertos.data.length} pedido{abiertos.data.length === 1 ? '' : 's'} sin cerrar
                ({[...new Set(abiertos.data.map((x: any) => x.supply_requests?.code))].join(', ')}): se podrán seguir entregando.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px]">Vuelve a ofrecerse para pedir, con el mismo código.</p>
        )}
        <p className="text-muted-foreground text-[12px]">Creado el {fmtDate(insumo.created_at)}.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant={desactivar ? 'destructive' : 'default'} loading={enviando} onClick={cambiar}>
            <Power /> {desactivar ? 'Desactivar' : 'Reactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
