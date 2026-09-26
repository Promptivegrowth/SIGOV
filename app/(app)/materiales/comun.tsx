'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export const PEDIDO_ESTADO = {
  borrador:   { label: 'Borrador',   variant: 'outline' as const },
  solicitado: { label: 'Por revisar', variant: 'warning' as const },
  aprobado:   { label: 'Aprobado',   variant: 'info' as const },
  parcial:    { label: 'Entregado en parte', variant: 'warning' as const },
  entregado:  { label: 'Entregado',  variant: 'success' as const },
  rechazado:  { label: 'Rechazado',  variant: 'destructive' as const },
  anulado:    { label: 'Anulado',    variant: 'outline' as const },
}

export type EstadoPedido = keyof typeof PEDIDO_ESTADO

/** Los movimientos de almacén: qué significa cada uno y hacia dónde mueve el stock. */
export const MOVIMIENTO = {
  ingreso:    { label: 'Ingreso',    ayuda: 'Compra o entrega del proveedor', variant: 'success' as const },
  salida:     { label: 'Salida',     ayuda: 'Entrega a una cuadrilla', variant: 'info' as const },
  devolucion: { label: 'Devolución', ayuda: 'La cuadrilla devuelve lo que no usó', variant: 'success' as const },
  merma:      { label: 'Merma',      ayuda: 'Pérdida, rotura o vencimiento', variant: 'destructive' as const },
  ajuste:     { label: 'Ajuste',     ayuda: 'Diferencia del conteo físico, con signo', variant: 'warning' as const },
}

export type TipoMovimiento = keyof typeof MOVIMIENTO

/** Sin tildes y en minúsculas: nadie las escribe al buscar. */
export const paraBuscar = (t: string | null | undefined) =>
  (t ?? '').normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase().trim()

export const cifra = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n ?? 0))

/** Un número escrito a mano, con coma o con punto. */
export const leerCifra = (t: string) => Number(String(t).replace(',', '.'))

export const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

/**
 * Cómo está un insumo en el almacén.
 *
 * «Bajo el mínimo» solo tiene sentido si alguien fijó un mínimo: con el
 * mínimo en cero, un insumo en cero no está bajo nada, está sin stock. El
 * aviso anterior los juntaba y marcaba en rojo los cien del maestro.
 */
export function estadoDeStock(s: { stock: any; committed: any; min_stock: any }) {
  const disponible = Number(s.stock) - Number(s.committed)
  const minimo = Number(s.min_stock)
  if (disponible <= 0) return { disponible, estado: 'sin_stock' as const }
  if (minimo > 0 && disponible < minimo) return { disponible, estado: 'bajo_minimo' as const }
  return { disponible, estado: 'ok' as const }
}

/** El catálogo activo con su stock: lo usan el pedido, el almacén y los movimientos. */
export function useInsumos(serviceId: string) {
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['insumos', serviceId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_supplies')
        .select('*')
        .eq('service_id', serviceId)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCuadrillas(serviceId: string) {
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['cuadrillas', serviceId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('crews')
        .select('id, code, name')
        .eq('service_id', serviceId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useUnidades() {
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['unidades'],
    queryFn: async () => {
      const { data, error } = await sb.from('units').select('id, code, name, symbol').order('code')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCategorias() {
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['categorias-maestro'],
    queryFn: async () => {
      const { data, error } = await sb.from('supply_categories').select('code, name').order('orden')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Un `<select>` nativo con el estilo de los campos: rápido y accesible. */
export function Selector({
  value, onChange, children, className, disabled, ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

/**
 * Buscar un insumo del maestro escribiendo parte del nombre o del código.
 * Cien insumos no caben en un desplegable que se pueda leer.
 */
export function InsumoPicker({
  insumos,
  onElegir,
  placeholder = 'Buscar insumo por nombre o código',
  excluir = [],
}: {
  insumos: any[]
  onElegir: (insumo: any) => void
  placeholder?: string
  excluir?: string[]
}) {
  const [q, setQ] = React.useState('')
  const [abierto, setAbierto] = React.useState(false)
  const [activo, setActivo] = React.useState(0)

  const opciones = React.useMemo(() => {
    const t = paraBuscar(q)
    return insumos
      .filter((s) => s.is_active && !excluir.includes(s.id))
      .filter((s) => !t || paraBuscar(s.name).includes(t) || paraBuscar(s.code).includes(t))
      .slice(0, 30)
  }, [insumos, q, excluir])

  const elegir = (s: any) => {
    onElegir(s)
    setQ('')
    setAbierto(false)
    setActivo(0)
  }

  return (
    <Popover open={abierto && opciones.length > 0} onOpenChange={setAbierto}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setAbierto(true); setActivo(0) }}
            onFocus={() => setAbierto(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(a + 1, opciones.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter' && opciones[activo]) { e.preventDefault(); elegir(opciones[activo]) }
              if (e.key === 'Escape') setAbierto(false)
            }}
            placeholder={placeholder}
            className="pl-9"
            role="combobox"
            aria-expanded={abierto}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {opciones.map((s, i) => {
          const { disponible } = estadoDeStock(s)
          return (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(s)}
              onMouseEnter={() => setActivo(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm',
                i === activo && 'bg-accent',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.name}</span>
                <span className="text-muted-foreground text-[12px]">{s.code} · {s.category ?? 'Sin categoría'}</span>
              </span>
              <span className={cn('shrink-0 text-[12px] tabular-nums', disponible <= 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {cifra(disponible)} {s.unit_symbol ?? ''}
              </span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
