'use client'

import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, CloudOff, CloudCheck, CloudAlert, Cloud } from 'lucide-react'
import { db, outboxCounts, storageEstimate } from '@/lib/offline/db'
import { subscribeSync, syncNow, retryFailed, type SyncState } from '@/lib/offline/sync'
import { cn, fmtRelative, bytes } from '@/lib/utils'
import { Tip } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/primitives'
import { toast } from 'sonner'

export function SyncIndicator({ collapsed }: { collapsed?: boolean }) {
  const [state, setState] = React.useState<SyncState>({
    running: false, lastSyncAt: null, lastResult: null, online: true,
  })
  const [storage, setStorage] = React.useState<{ usage: number; quota: number; pct: number } | null>(null)

  React.useEffect(() => subscribeSync(setState), [])
  React.useEffect(() => {
    void storageEstimate().then(setStorage)
  }, [state.lastSyncAt])

  const counts = useLiveQuery(() => outboxCounts(), [], {
    pendiente: 0, sincronizando: 0, error: 0, total: 0, sincronizado: 0,
  })

  const pending = counts.pendiente + counts.sincronizando
  const failed = counts.error

  const status = !state.online
    ? 'offline'
    : state.running
      ? 'syncing'
      : failed > 0
        ? 'error'
        : pending > 0
          ? 'pending'
          : 'ok'

  const meta = {
    offline: { icon: CloudOff, label: 'Sin conexión', color: 'text-white/50', dot: 'bg-muted-foreground' },
    syncing: { icon: RefreshCw, label: 'Sincronizando…', color: 'text-info', dot: 'bg-info' },
    error: { icon: CloudAlert, label: `${failed} con error`, color: 'text-destructive', dot: 'bg-destructive' },
    pending: { icon: Cloud, label: `${pending} pendiente${pending === 1 ? '' : 's'}`, color: 'text-accent', dot: 'bg-accent' },
    ok: { icon: CloudCheck, label: 'Todo sincronizado', color: 'text-success', dot: 'bg-success' },
  }[status]

  const Icon = meta.icon

  const trigger = (
    <button
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.07]',
        collapsed && 'lg:justify-center lg:px-0'
      )}
    >
      <span className="relative">
        <Icon className={cn('size-4', meta.color, state.running && 'animate-spin')} />
        {(pending > 0 || failed > 0) && !state.running && (
          <span className={cn('absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar', meta.dot)} />
        )}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[11.5px] font-medium leading-tight', meta.color)}>
            {meta.label}
          </span>
          <span className="block truncate text-[10px] leading-tight text-white/35">
            {state.lastSyncAt ? fmtRelative(new Date(state.lastSyncAt)) : 'sin sincronizar aún'}
          </span>
        </span>
      )}
    </button>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        {collapsed ? <Tip label={meta.label} side="right">{trigger}</Tip> : trigger}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Estado de sincronización</h4>
          <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', meta.color)}>
            <span className={cn('size-1.5 rounded-full', meta.dot)} />
            {state.online ? 'En línea' : 'Sin conexión'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Pendientes', value: counts.pendiente, cls: 'text-accent' },
            { label: 'Enviados', value: counts.sincronizado, cls: 'text-success' },
            { label: 'Con error', value: counts.error, cls: 'text-destructive' },
          ].map((s) => (
            <div key={s.label} className="bg-muted/60 rounded-lg p-2.5 text-center">
              <div className={cn('text-lg font-bold tabular-nums leading-none', s.cls)}>{s.value}</div>
              <div className="text-muted-foreground mt-1 text-[10px]">{s.label}</div>
            </div>
          ))}
        </div>

        {state.lastResult && (
          <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
            Última sincronización: {state.lastResult.pushed} enviados, {state.lastResult.pulled} recibidos
            {state.lastResult.blobs > 0 && `, ${state.lastResult.blobs} fotos`} en {state.lastResult.durationMs} ms.
          </p>
        )}

        {storage && (
          <div className="mt-3">
            <div className="text-muted-foreground flex justify-between text-[10.5px]">
              <span>Almacenamiento del dispositivo</span>
              <span className="tabular-nums">
                {bytes(storage.usage)} / {bytes(storage.quota)}
              </span>
            </div>
            <div className="bg-secondary mt-1 h-1.5 overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all', storage.pct > 85 ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${Math.min(storage.pct, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            loading={state.running}
            onClick={async () => {
              const r = await syncNow()
              if (r.error === 'offline') toast.error('Sin conexión. Se sincronizará al recuperar señal.')
              else toast.success(`Sincronizado: ${r.pushed} enviados, ${r.pulled} recibidos`)
            }}
          >
            <RefreshCw className="size-3.5" />
            Sincronizar ahora
          </Button>
          {failed > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await retryFailed()
                toast.info('Reintentando registros con error')
              }}
            >
              Reintentar {failed}
            </Button>
          )}
        </div>

        {failed > 0 && <FailedList />}
      </PopoverContent>
    </Popover>
  )
}

function FailedList() {
  const failed = useLiveQuery(
    () => db.outbox.where('status').equals('error').limit(4).toArray(),
    [],
    []
  )
  if (!failed.length) return null
  return (
    <div className="border-border mt-3 space-y-1.5 border-t pt-3">
      {failed.map((f) => (
        <div key={f.client_id} className="text-[10.5px] leading-tight">
          <div className="text-destructive font-medium">{f.label}</div>
          <div className="text-muted-foreground truncate">{f.last_error}</div>
        </div>
      ))}
    </div>
  )
}
