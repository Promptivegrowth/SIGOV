'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ArrowRight, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDateTime } from '@/lib/utils'

/**
 * Notificaciones (guía 9.10): un aviso agrupado por PCI y evento, no uno por
 * ítem. Abrirlo lleva a los casos; marcarlo leído no cierra observaciones ni
 * cambia permisos.
 */
export function NotificacionesClient() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [filtro, setFiltro] = React.useState<'vigentes' | 'todas'>('vigentes')
  const lista = useQuery({
    queryKey: ['notificaciones', service.id, profile.id, filtro],
    queryFn: async () => {
      let c = sb.from('notifications').select('id, type, title, body, url, severity, read_at, created_at, actualizada_at, resuelta_at')
        .eq('profile_id', profile.id).eq('service_id', service.id).order('created_at', { ascending: false }).limit(100)
      if (filtro === 'vigentes') c = c.is('resuelta_at', null)
      return ((await c).data ?? []) as any[]
    },
  })
  const leer = async (ids: string[]) => {
    if (!ids.length) return
    await sb.from('notifications').update({ read_at: new Date().toISOString() } as any).in('id', ids)
    qc.invalidateQueries({ queryKey: ['notificaciones'] })
  }
  const noLeidas = (lista.data ?? []).filter((n) => !n.read_at)

  return (
    <>
      <PageHeader title="Notificaciones" description="Avisos agrupados por PCI; cada caso se revisa por separado."
        actions={<Button size="sm" variant="outline" disabled={!noLeidas.length} onClick={() => leer(noLeidas.map((n) => n.id))}><CheckCheck className="size-4" />Marcar todas leídas</Button>} />
      <PageBody className="space-y-4">
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {(['vigentes', 'todas'] as const).map((k) => (
            <button key={k} onClick={() => setFiltro(k)} className={cn('rounded-md px-3.5 py-1.5 text-[13px] font-semibold', filtro === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {k === 'vigentes' ? 'Vigentes' : 'Todas'}
            </button>
          ))}
        </div>
        {lista.isLoading ? <SkeletonList rows={5} /> : (lista.data ?? []).length === 0 ? (
          <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Sin notificaciones.</CardContent></Card>
        ) : (
          <Card><CardContent className="divide-y divide-border p-0">
            {(lista.data ?? []).map((n) => (
              <div key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-primary/[0.04]')}>
                <Bell className={cn('mt-0.5 size-4 shrink-0', n.severity === 'warning' ? 'text-warning' : n.severity === 'danger' ? 'text-destructive' : 'text-info')} />
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className={cn(!n.read_at && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-muted-foreground text-[12.5px]">{n.body}</p>}
                  <p className="text-muted-foreground text-[11.5px]">{fmtDateTime(n.actualizada_at ?? n.created_at)}{n.resuelta_at ? ' · Atendida' : ''}</p>
                </div>
                {n.url && (
                  <Link href={n.url} onClick={() => !n.read_at && leer([n.id])}>
                    <Button size="sm" variant="outline">Abrir<ArrowRight className="size-3.5" /></Button>
                  </Link>
                )}
              </div>
            ))}
          </CardContent></Card>
        )}
        <p className="text-muted-foreground flex items-center gap-2 text-[12px]"><Info className="text-info size-3.5" />Marcar un aviso como leído no cierra las observaciones ni da conformidad.</p>
      </PageBody>
    </>
  )
}
