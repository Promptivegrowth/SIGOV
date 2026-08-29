'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { subscribeSync, syncNow, type SyncState } from '@/lib/offline/sync'
import { db } from '@/lib/offline/db'

export function OfflineBanner() {
  const [state, setState] = React.useState<SyncState>({
    running: false, lastSyncAt: null, lastResult: null, online: true,
  })

  React.useEffect(() => subscribeSync(setState), [])

  const pending = useLiveQuery(
    () => db.outbox.where('status').anyOf('pendiente', 'error').count(),
    [],
    0
  )

  const show = !state.online || (pending > 0 && !state.running)

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div
            className={
              !state.online
                ? 'flex items-center gap-2.5 bg-foreground/90 px-4 py-2 text-background lg:px-6'
                : 'bg-accent/15 border-accent/30 flex items-center gap-2.5 border-b px-4 py-2 lg:px-6'
            }
          >
            {!state.online ? (
              <>
                <WifiOff className="size-4 shrink-0" />
                <p className="flex-1 text-[12.5px] font-medium">
                  Trabajando sin conexión. Todo lo que registres se guarda en el dispositivo y se
                  enviará al recuperar señal.
                </p>
                {pending > 0 && (
                  <span className="rounded-full bg-background/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                    {pending} en cola
                  </span>
                )}
              </>
            ) : (
              <>
                <CloudUpload className="text-accent size-4 shrink-0" />
                <p className="flex-1 text-[12.5px]">
                  <span className="font-semibold tabular-nums">{pending}</span>{' '}
                  {pending === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar al servidor.
                </p>
                <button
                  onClick={() => void syncNow()}
                  className="hover:bg-accent/20 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
                >
                  <RefreshCw className="size-3" />
                  Sincronizar
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
