'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, TriangleAlert, Info, CircleCheck, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent, ScrollArea } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { cn, fmtRelative } from '@/lib/utils'
import { enablePush, pushSupported, pushPermission } from '@/lib/push'
import { toast } from 'sonner'

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: Siren,
} as const

export function NotificationsBell() {
  const { profile } = useSession()
  const qc = useQueryClient()
  const [pushState, setPushState] = React.useState<NotificationPermission | 'unsupported'>('default')

  React.useEffect(() => {
    setPushState(pushSupported() ? pushPermission() : 'unsupported')
  }, [])

  const { data: items = [] } = useQuery({
    queryKey: ['notifications', profile.id],
    queryFn: async () => {
      const sb = createClient()
      const { data } = await sb
        .from('notifications')
        .select('id, type, title, body, url, severity, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(25)
      return data ?? []
    },
    refetchInterval: 90_000,
  })

  const unread = items.filter((n: any) => !n.read_at).length

  const markAll = async () => {
    const sb = createClient()
    await sb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('profile_id', profile.id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['pending-counts'] })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="size-4.5" />
          {unread > 0 && (
            <span className="bg-destructive absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-background">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold">Notificaciones</h4>
            <p className="text-muted-foreground text-[11px]">
              {unread > 0 ? `${unread} sin leer` : 'Todo al día'}
            </p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} className="text-[11px]">
              <CheckCheck className="size-3.5" />
              Marcar leídas
            </Button>
          )}
        </div>

        {pushState !== 'granted' && pushState !== 'unsupported' && (
          <div className="border-b border-border bg-accent/10 px-4 py-3">
            <p className="text-[11.5px] leading-snug">
              Activa las notificaciones push para enterarte de PCIs por vencer y partes observados
              incluso con la app cerrada.
            </p>
            <Button
              size="sm"
              variant="accent"
              className="mt-2 h-7 text-[11px]"
              onClick={async () => {
                const ok = await enablePush()
                setPushState(pushPermission())
                toast[ok ? 'success' : 'error'](
                  ok ? 'Notificaciones activadas' : 'No se pudieron activar las notificaciones'
                )
              }}
            >
              <Bell className="size-3" />
              Activar notificaciones
            </Button>
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          {items.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12">
              <BellOff className="size-8 opacity-40" />
              <p className="text-xs">Sin notificaciones</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n: any) => {
                const Icon = ICONS[n.severity as keyof typeof ICONS] ?? Info
                const color =
                  n.severity === 'danger' ? 'text-destructive'
                  : n.severity === 'warning' ? 'text-warning'
                  : n.severity === 'success' ? 'text-success'
                  : 'text-info'
                const body = (
                  <div className={cn('flex gap-3 px-4 py-3 transition-colors', !n.read_at && 'bg-primary/[0.04]')}>
                    <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[12.5px] leading-snug', !n.read_at && 'font-medium')}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug">
                          {n.body}
                        </p>
                      )}
                      <p className="text-muted-foreground/70 mt-1 text-[10px]">{fmtRelative(n.created_at)}</p>
                    </div>
                    {!n.read_at && <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />}
                  </div>
                )
                return (
                  <li key={n.id} className="hover:bg-secondary/40">
                    {n.url ? <Link href={n.url}>{body}</Link> : body}
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
