'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { estadoDeStock, useInsumos } from './comun'
import { PedidosTab } from './pedidos'
import { AlmacenTab } from './almacen'
import { MovimientosTab } from './movimientos'
import { MaestroTab } from './maestro'

/**
 * Materiales desde administración.
 *
 * Cuatro vistas de una misma cosa:
 * · Pedidos: lo que piden las cuadrillas (o el residente), quién lo
 *   autorizó y quién lo entregó.
 * · Almacén: cuánto hay de cada insumo; aquí entran las compras y se
 *   registran ajustes, mermas y devoluciones.
 * · Movimientos: el kárdex de todo el almacén, para auditar y exportar.
 * · Maestro: de dónde nacen los insumos, con su código correlativo; aquí se
 *   crean, se editan y se desactivan.
 */
export function MaterialesClient() {
  const { service, profile, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState('pedidos')

  const insumos = useInsumos(service.id)
  const pedidos = useQuery({
    queryKey: ['pedidos-insumo', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_supply_requests')
        .select('*')
        .eq('service_id', service.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  const activos = (insumos.data ?? []).filter((s: any) => s.is_active)
  const estados = activos.map((s: any) => estadoDeStock(s).estado)
  const sinStock = estados.filter((e) => e === 'sin_stock').length
  const bajoMinimo = estados.filter((e) => e === 'bajo_minimo').length
  const porRevisar = (pedidos.data ?? []).filter((p: any) => p.status === 'solicitado').length
  const porEntregar = (pedidos.data ?? []).filter((p: any) => ['aprobado', 'parcial'].includes(p.status)).length

  return (
    <>
      <PageHeader
        title="Materiales"
        description="Pedidos de las cuadrillas, almacén, kárdex y maestro de insumos"
        icon={Boxes}
      />

      <PageBody>
        <div className="grid gap-3 sm:grid-cols-4">
          <Resumen titulo="Insumos activos" valor={activos.length} onClick={() => setTab('maestro')} />
          <Resumen titulo="Sin stock" valor={sinStock} tono={sinStock ? 'apagado' : undefined} onClick={() => setTab('almacen')} />
          <Resumen titulo="Bajo el mínimo" valor={bajoMinimo} tono={bajoMinimo ? 'alerta' : undefined} onClick={() => setTab('almacen')} />
          <Resumen
            titulo="Pedidos por revisar · por entregar"
            valor={`${porRevisar} · ${porEntregar}`}
            tono={porRevisar ? 'aviso' : undefined}
            onClick={() => setTab('pedidos')}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="pedidos">
              Pedidos {porRevisar + porEntregar > 0 && (
                <Badge variant="warning" className="ml-1.5">{porRevisar + porEntregar}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="almacen">Almacén</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
            <TabsTrigger value="maestro">Maestro</TabsTrigger>
          </TabsList>

          <TabsContent value="pedidos" className="mt-4">
            <PedidosTab serviceId={service.id} can={can} profileId={profile.id} />
          </TabsContent>
          <TabsContent value="almacen" className="mt-4">
            <AlmacenTab serviceId={service.id} can={can} />
          </TabsContent>
          <TabsContent value="movimientos" className="mt-4">
            <MovimientosTab service={service} profileName={profile.full_name} can={can} />
          </TabsContent>
          <TabsContent value="maestro" className="mt-4">
            <MaestroTab serviceId={service.id} can={can} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  )
}

function Resumen({ titulo, valor, tono, onClick }: {
  titulo: string
  valor: React.ReactNode
  tono?: 'alerta' | 'aviso' | 'apagado'
  onClick?: () => void
}) {
  return (
    <Card
      className={cn(onClick && 'hover:border-primary/40 cursor-pointer transition-colors')}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[12px]">{titulo}</p>
        <p className={cn(
          'text-2xl font-bold tabular-nums',
          tono === 'alerta' && 'text-destructive',
          tono === 'aviso' && 'text-warning',
        )}>{valor}</p>
      </CardContent>
    </Card>
  )
}
