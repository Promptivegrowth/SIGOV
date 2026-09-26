'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, History, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { fmtDate } from '@/lib/utils'
import { descargarExcel, type ReportMeta } from '@/lib/reports'
import { toast } from 'sonner'
import { MOVIMIENTO, type TipoMovimiento, cifra, paraBuscar, hoyLima, useCuadrillas, Selector } from './comun'
import { TablaKardex } from './almacen'

const haceDias = (n: number) => {
  const d = new Date(hoyLima() + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Todos los movimientos del almacén: el kárdex del contrato.
 *
 * Responde lo que se pregunta cuando falta material o cuando audita el
 * cliente: qué entró, de qué proveedor y con qué guía; qué salió, a qué
 * cuadrilla, por qué pedido y para qué partida; quién lo registró. Se
 * exporta a Excel tal como se ve filtrado.
 */
export function MovimientosTab({ service, profileName, can }: {
  service: any
  profileName: string
  can: { manage: boolean }
}) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const cuadrillas = useCuadrillas(service.id)
  const [desde, setDesde] = React.useState(haceDias(30))
  const [hasta, setHasta] = React.useState(hoyLima())
  const [tipo, setTipo] = React.useState('')
  const [crewId, setCrewId] = React.useState('')
  const [q, setQ] = React.useState('')
  const [anulando, setAnulando] = React.useState<any>(null)

  const movimientos = useQuery({
    queryKey: ['kardex', service.id, 'todo', desde, hasta],
    queryFn: async () => {
      const { data, error } = await sb.from('v_kardex').select('*')
        .eq('service_id', service.id)
        .gte('occurred_on', desde)
        .lte('occurred_on', hasta)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return data ?? []
    },
  })

  const filas = React.useMemo(() => {
    const t = paraBuscar(q)
    return (movimientos.data ?? [])
      .filter((m: any) => !tipo || m.kind === tipo)
      .filter((m: any) => !crewId || m.crew_id === crewId)
      .filter((m: any) => !t || [m.supply_name, m.supply_code, m.request_code, m.supplier, m.document, m.notes, m.created_by_name]
        .some((x) => paraBuscar(x).includes(t)))
  }, [movimientos.data, tipo, crewId, q])

  const exportar = async () => {
    const meta: ReportMeta = {
      titulo: 'Kárdex de almacén',
      subtitulo: [tipo && MOVIMIENTO[tipo as TipoMovimiento].label, crewId && cuadrillas.data?.find((c: any) => c.id === crewId)?.name]
        .filter(Boolean).join(' · ') || 'Todos los movimientos',
      servicio: service.name,
      cliente: service.client_name,
      contrato: service.contract_code,
      periodo: `Del ${fmtDate(desde)} al ${fmtDate(hasta)}`,
      generadoPor: profileName,
    }
    await descargarExcel(`SIGOV_kardex_${desde}_${hasta}`, meta, [{
      name: 'Kárdex',
      columns: [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Movimiento', key: 'tipo', width: 12 },
        { header: 'Código', key: 'codigo', width: 10 },
        { header: 'Insumo', key: 'insumo', width: 40 },
        { header: 'Cantidad', key: 'cantidad', width: 11 },
        { header: 'Unidad', key: 'unidad', width: 8 },
        { header: 'Saldo', key: 'saldo', width: 11 },
        { header: 'Cuadrilla', key: 'cuadrilla', width: 28 },
        { header: 'Pedido', key: 'pedido', width: 15 },
        { header: 'Partida', key: 'partida', width: 30 },
        { header: 'Tramo', key: 'tramo', width: 30 },
        { header: 'Proveedor', key: 'proveedor', width: 22 },
        { header: 'Documento', key: 'documento', width: 16 },
        { header: 'Costo unit.', key: 'costo', width: 11 },
        { header: 'Nota', key: 'nota', width: 36 },
        { header: 'Registró', key: 'registro', width: 24 },
        { header: 'Registrado el', key: 'registrado', width: 18 },
      ],
      rows: filas.map((m: any) => ({
        fecha: m.occurred_on,
        tipo: MOVIMIENTO[m.kind as TipoMovimiento]?.label ?? m.kind,
        codigo: m.supply_code,
        insumo: m.supply_name,
        cantidad: Number(m.delta),
        unidad: m.unit_symbol ?? '',
        saldo: Number(m.saldo),
        cuadrilla: m.crew_name ?? '',
        pedido: m.request_code ?? '',
        partida: m.activity_name ?? '',
        tramo: m.section_name ?? '',
        proveedor: m.supplier ?? '',
        documento: m.document ?? '',
        costo: m.unit_cost != null ? Number(m.unit_cost) : '',
        nota: m.notes ?? '',
        registro: m.created_by_name ?? 'Carga inicial',
        registrado: new Date(m.created_at).toLocaleString('es-PE'),
      })),
    }])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Desde" className="w-36">
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta" className="w-36">
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <Field label="Movimiento" className="w-40">
          <Selector value={tipo} onChange={setTipo}>
            <option value="">Todos</option>
            {Object.entries(MOVIMIENTO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Selector>
        </Field>
        <Field label="Cuadrilla" className="w-56">
          <Selector value={crewId} onChange={setCrewId}>
            <option value="">Todas</option>
            {cuadrillas.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Selector>
        </Field>
        <Field label="Buscar" className="min-w-48 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Insumo, pedido, guía, persona…" />
        </Field>
        <Button variant="outline" onClick={exportar} disabled={!filas.length}>
          <FileSpreadsheet /> Excel
        </Button>
      </div>

      {movimientos.isLoading && <SkeletonList rows={6} />}
      {!movimientos.isLoading && filas.length === 0 && (
        <EmptyState
          icon={History}
          title="Sin movimientos en este periodo"
          description="Amplía las fechas o quita filtros. Los ingresos, entregas y ajustes aparecen aquí."
        />
      )}
      {!!filas.length && (
        <>
          <p className="text-muted-foreground text-[12px]">
            {filas.length} movimiento{filas.length === 1 ? '' : 's'}
            {filas.length >= 2000 && ' · se muestran los 2,000 más recientes: acorta el periodo'}
          </p>
          <TablaKardex filas={filas} conInsumo onAnular={can.manage ? setAnulando : undefined} />
        </>
      )}

      {anulando && (
        <AnularMovimiento
          fila={anulando}
          onClose={() => setAnulando(null)}
          onHecho={() => {
            setAnulando(null)
            qc.invalidateQueries({ queryKey: ['kardex'] })
            qc.invalidateQueries({ queryKey: ['insumos'] })
          }}
        />
      )}
    </div>
  )
}

/**
 * Anular un movimiento registrado por error.
 *
 * No se borra: deja de contar para el stock y queda en la auditoría con
 * quién lo anuló y por qué. Las entregas de un pedido no se anulan aquí:
 * se corrigen con una devolución, para que el pedido no quede mintiendo.
 */
function AnularMovimiento({ fila, onClose, onHecho }: { fila: any; onClose: () => void; onHecho: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [motivo, setMotivo] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  const anular = async () => {
    if (!motivo.trim()) { toast.error('Escribe por qué se anula'); return }
    setEnviando(true)
    const { error } = await sb.from('stock_movements')
      .update({
        deleted_at: new Date().toISOString(),
        notes: [fila.notes, `Anulado: ${motivo.trim()}`].filter(Boolean).join(' · '),
      })
      .eq('id', fila.id)
    setEnviando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Movimiento anulado')
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anular movimiento</DialogTitle>
          <DialogDescription>
            {MOVIMIENTO[fila.kind as TipoMovimiento]?.label} de {cifra(Math.abs(Number(fila.delta)))} {fila.unit_symbol ?? ''} de {fila.supply_name}, del {fmtDate(fila.occurred_on)}.
            Deja de contar para el stock; queda en la auditoría.
          </DialogDescription>
        </DialogHeader>
        <Field label="Motivo">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="destructive" loading={enviando} onClick={anular}><Ban /> Anular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
