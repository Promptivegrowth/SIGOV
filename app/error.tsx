'use client'

import * as React from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Lo que se ve cuando algo falla dentro de la aplicación.
 *
 * Sin este archivo, cualquier excepción que escapara de un componente
 * dejaba la plataforma en blanco con el texto crudo de Next —«Application
 * error: a client-side exception has occurred»— sin decir qué pasó, sin
 * manera de volver y sin rastro de dónde. Ocurrió de verdad: un equipo con
 * la aceleración por hardware desactivada no podía dibujar el mapa, el
 * mapa lanzó, y con él se cayó el panel entero, los indicadores, las
 * alertas y todo lo demás, que no tenían nada que ver.
 *
 * Un fallo en una parte no puede llevarse el resto por delante. Aquí se
 * detiene, se dice en castellano y se ofrece salir de ahí.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('SIGOV · fallo no controlado:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden />
      </div>

      <div className="space-y-2">
        <h1 className="font-marca text-xl font-bold">Algo se rompió en esta pantalla</h1>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          No se perdió nada de lo registrado. Vuelve a intentarlo; si sigue pasando,
          avísanos con el código de abajo para poder ubicarlo.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Reintentar
        </Button>
        <Button variant="outline" onClick={() => { window.location.href = '/dashboard' }}>
          <Home /> Ir al panel
        </Button>
      </div>

      {/* El detalle técnico está, pero no encima: quien lo necesita lo abre. */}
      <details className="max-w-xl text-left">
        <summary className="text-muted-foreground cursor-pointer text-[12px]">
          Detalle técnico
        </summary>
        <pre className="bg-muted text-muted-foreground mt-2 max-h-52 overflow-auto rounded-lg p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {error.digest ? `Código: ${error.digest}\n\n` : ''}
          {error.message}
        </pre>
      </details>
    </div>
  )
}
