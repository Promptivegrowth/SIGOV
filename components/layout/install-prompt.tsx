'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Download, X, Share, SquarePlus, Smartphone, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SigovMark } from '@/components/shared/logo'
import { isIOS, isStandalone } from '@/lib/push'

const DISMISS_KEY = 'sigov.install_dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = React.useState(false)
  const [iosGuide, setIosGuide] = React.useState(false)

  React.useEffect(() => {
    if (isStandalone()) return
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < 7 * 86400000) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setTimeout(() => setShow(true), 4000)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS no dispara beforeinstallprompt: mostramos la guía manual
    if (isIOS()) {
      setIosGuide(true)
      setTimeout(() => setShow(true), 5000)
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setShow(false)
    else dismiss()
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-4 bottom-20 left-4 z-50 mx-auto max-w-md lg:right-6 lg:bottom-6 lg:left-auto"
        >
          <div className="bg-card relative overflow-hidden rounded-2xl border border-border shadow-2xl">
            <div className="hazard-stripe h-1 opacity-70" />
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-md p-1 transition-colors"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>

            <div className="p-5">
              <div className="flex items-start gap-3.5">
                <SigovMark size={44} />
                <div className="min-w-0 flex-1 pr-6">
                  <h3 className="text-[15px] font-semibold leading-tight">Instala SIGOV</h3>
                  <p className="text-muted-foreground mt-1 text-[12.5px] leading-snug">
                    {iosGuide
                      ? 'En iPhone debes instalarla para trabajar sin conexión y recibir notificaciones.'
                      : 'Trabaja sin conexión, recibe notificaciones y ábrela como una app nativa.'}
                  </p>
                </div>
              </div>

              {iosGuide ? (
                <ol className="mt-4 space-y-2.5">
                  {[
                    { icon: Share, text: 'Toca el botón Compartir en la barra de Safari' },
                    { icon: SquarePlus, text: 'Elige "Añadir a pantalla de inicio"' },
                    { icon: Smartphone, text: 'Confirma con "Añadir"' },
                  ].map((s, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="bg-secondary flex size-7 shrink-0 items-center justify-center rounded-lg">
                        <s.icon className="size-3.5" />
                      </span>
                      <span className="text-[12.5px]">{s.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <div className="mt-4 flex gap-3">
                    {[
                      { icon: Smartphone, label: 'Celular' },
                      { icon: Monitor, label: 'Escritorio' },
                    ].map((d) => (
                      <div key={d.label} className="bg-muted/60 flex flex-1 items-center gap-2 rounded-lg px-3 py-2">
                        <d.icon className="text-muted-foreground size-3.5" />
                        <span className="text-[11.5px] font-medium">{d.label}</span>
                      </div>
                    ))}
                  </div>
                  <Button onClick={install} className="mt-4 w-full">
                    <Download className="size-4" />
                    Instalar aplicación
                  </Button>
                </>
              )}

              <button
                onClick={dismiss}
                className="text-muted-foreground hover:text-foreground mt-2.5 w-full text-center text-[11.5px] transition-colors"
              >
                Ahora no
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
