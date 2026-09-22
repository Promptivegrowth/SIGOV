'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Search, X, Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import {
  EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey,
} from '@/components/shared/misc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { fmtDateTime, fmtRelative, cn } from '@/lib/utils'

/**
 * Auditoría (apartado 7.6).
 *
 * Quién cambió qué, cuándo y desde dónde. La especificación la reserva al
 * Administrador y tiene razón: es el registro que sirve para pedir cuentas,
 * y enseñárselo a quien puede ser auditado lo convierte en otra cosa.
 *
 * No se edita ni se borra desde aquí. Una bitácora que se puede tocar no
 * es una bitácora.
 */

const ACCIONES: Record<string, { label: string; icono: React.ElementType; clase: string }> = {
  INSERT: { label: 'Creó', icono: Plus, clase: 'bg-success/12 text-success border-success/30' },
  UPDATE: { label: 'Modificó', icono: Pencil, clase: 'bg-info/12 text-info border-info/30' },
  DELETE: { label: 'Eliminó', icono: Trash2, clase: 'bg-destructive/10 text-destructive border-destructive/30' },
}

/** Las tablas, dichas como se nombran en la operación. */
const TABLAS: Record<string, string> = {
  work_orders: 'Parte diario',
  work_entries: 'Actividad ejecutada',
  evidences: 'Evidencia fotográfica',
  plan_items: 'Partida programada',
  pci_items: 'Ítem de PCI',
  pcis: 'Documento PCI',
  cash_movements: 'Movimiento de caja',
  deposit_requests: 'Pedido de depósito',
  supply_requests: 'Pedido de materiales',
  safety_talks: 'Charla de seguridad',
  ats_iperc: 'ATS / IPERC',
  safety_equipment: 'Equipo de seguridad',
  vehicles: 'Vehículo',
  road_assets: 'Activo vial',
  crews: 'Cuadrilla',
  profiles: 'Usuario',
  services: 'Contrato',
}

const TODAS = '__todas__'

export function AuditoriaClient() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [preset, setPreset] = React.useState<DatePresetKey>('7d')
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])
  const [tabla, setTabla] = React.useState(TODAS)
  const [accion, setAccion] = React.useState(TODAS)
  const [q, setQ] = React.useState('')
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [pagina, setPagina] = React.useState(0)

  const POR_PAGINA = 60

  const registros = useQuery({
    queryKey: ['auditoria', service.id, range.from, range.to, tabla, accion, pagina],
    queryFn: async () => {
      let c = sb.from('audit_log')
        .select('*', { count: 'exact' })
        .eq('service_id', service.id)
        .gte('created_at', `${range.from}T00:00:00`)
        .lte('created_at', `${range.to}T23:59:59`)
        .order('created_at', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
      if (tabla !== TODAS) c = c.eq('table_name', tabla)
      if (accion !== TODAS) c = c.eq('action', accion)
      const { data, count, error } = await c
      if (error) throw error
      return { filas: data ?? [], total: count ?? 0 }
    },
  })

  // Las tablas que realmente tienen movimiento, para no ofrecer filtros vacíos
  const tablas = useQuery({
    queryKey: ['auditoria-tablas', service.id],
    queryFn: async () => {
      const { data } = await sb.from('audit_log')
        .select('table_name').eq('service_id', service.id).limit(2000)
      return [...new Set((data ?? []).map((d: any) => d.table_name))].sort()
    },
    staleTime: 10 * 60_000,
  })

  const filas = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = registros.data?.filas ?? []
    if (!t) return base
    return base.filter((f: any) =>
      [f.actor_email, f.table_name, f.record_id, TABLAS[f.table_name]]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(t))
    )
  }, [registros.data, q])

  const total = registros.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <>
      <PageHeader
        icon={History}
        title="Auditoría"
        description="Quién cambió qué, cuándo y desde dónde. Solo lectura: una bitácora que se puede tocar no es una bitácora."
        actions={<DateRangeTabs value={preset} onChange={(v) => { setPreset(v); setPagina(0) }} />}
      />

      <PageBody className="space-y-4">
        {/* ═══ Filtros ══════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input placeholder="Buscar por usuario o registro…" value={q}
              onChange={(e) => setQ(e.target.value)} className="pl-9" />
            {q && (
              <button onClick={() => setQ('')} aria-label="Limpiar"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={tabla} onValueChange={(v) => { setTabla(v); setPagina(0) }}>
            <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todos los módulos</SelectItem>
              {(tablas.data ?? []).map((t: string) => (
                <SelectItem key={t} value={t}>{TABLAS[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accion} onValueChange={(v) => { setAccion(v); setPagina(0) }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Toda acción</SelectItem>
              <SelectItem value="INSERT">Creaciones</SelectItem>
              <SelectItem value="UPDATE">Modificaciones</SelectItem>
              <SelectItem value="DELETE">Eliminaciones</SelectItem>
            </SelectContent>
          </Select>

          {!registros.isLoading && (
            <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
              {total.toLocaleString('es-PE')} movimientos
            </span>
          )}
        </div>

        {/* ═══ La bitácora ══════════════════════════════════════════════ */}
        <Card>
          <CardContent className="px-0 py-2">
            {registros.isLoading ? (
              <div className="px-4"><SkeletonList rows={10} /></div>
            ) : !filas.length ? (
              <EmptyState icon={History} title="Sin movimientos en este periodo"
                description="Amplía el rango de fechas o quita los filtros." className="py-12" />
            ) : (
              <ul className="divide-y divide-border/60">
                {filas.map((f: any) => {
                  const a = ACCIONES[f.action] ?? ACCIONES.UPDATE
                  const desplegado = abierto === f.id
                  return (
                    <li key={f.id}>
                      <button
                        onClick={() => setAbierto(desplegado ? null : f.id)}
                        className="hover:bg-secondary/40 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      >
                        <Badge variant="outline" className={cn('shrink-0 gap-1', a.clase)}>
                          <a.icono className="size-3" />
                          {a.label}
                        </Badge>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {TABLAS[f.table_name] ?? f.table_name}
                          </span>
                          <span className="text-muted-foreground block truncate text-[11.5px]">
                            {f.actor_email ?? 'Sistema'} · {fmtRelative(f.created_at)}
                          </span>
                        </span>
                        <span className="text-muted-foreground hidden shrink-0 text-[11px] tabular-nums lg:block">
                          {fmtDateTime(f.created_at)}
                        </span>
                        <ChevronDown className={cn('text-muted-foreground size-4 shrink-0 transition-transform',
                          desplegado && 'rotate-180')} />
                      </button>

                      {desplegado && (
                        <div className="bg-secondary/30 grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-2">
                          <Bloque titulo="Antes" datos={f.before_data} />
                          <Bloque titulo="Después" datos={f.after_data} />
                          <p className="text-muted-foreground col-span-full text-[10.5px]">
                            Registro {f.record_id}
                            {f.ip_address ? ` · desde ${f.ip_address}` : ''}
                          </p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>

          {paginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <span className="text-muted-foreground text-[11.5px] tabular-nums">
                Página {pagina + 1} de {paginas}
              </span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={pagina === 0}
                  onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={pagina >= paginas - 1}
                  onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
              </span>
            </div>
          )}
        </Card>
      </PageBody>
    </>
  )
}

/**
 * El contenido de un lado del cambio.
 *
 * Se muestran los campos, no el JSON crudo: quien audita busca qué valor
 * cambió, no cómo se guarda.
 */
function Bloque({ titulo, datos }: { titulo: string; datos: any }) {
  if (!datos || typeof datos !== 'object') {
    return (
      <div>
        <p className="text-muted-foreground mb-1 text-[10.5px] font-semibold uppercase tracking-wide">{titulo}</p>
        <p className="text-muted-foreground text-[12px]">—</p>
      </div>
    )
  }
  const campos = Object.entries(datos).filter(([k]) => !k.endsWith('_at') || k === 'deleted_at')
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-1 text-[10.5px] font-semibold uppercase tracking-wide">{titulo}</p>
      <dl className="space-y-0.5">
        {campos.slice(0, 14).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11.5px]">
            <dt className="text-muted-foreground shrink-0">{k}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
