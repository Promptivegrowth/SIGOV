'use client'

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Entrada desde la app (revisión visual 18/11, T9: paridad web/móvil).
 *
 * La app abre esta ruta en su visor web con la sesión que ya tiene, en el
 * fragmento (#at=…&rt=…&next=/ruta), que no viaja al servidor ni queda en
 * los registros. Aquí se fija la sesión del navegador y se pasa a la
 * pantalla pedida: los mismos módulos, reglas y datos que en la web.
 */
export default function EntradaDesdeApp() {
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const at = p.get('at'), rt = p.get('rt')
    const next = p.get('next') && p.get('next')!.startsWith('/') ? p.get('next')! : '/dashboard'
    // El fragmento con las llaves no debe quedar en el historial
    window.history.replaceState(null, '', '/auth/app')
    if (!at || !rt) { setError('No llegó la sesión de la app. Vuelve a abrir la sección.'); return }
    const sb = createClient()
    sb.auth.setSession({ access_token: at, refresh_token: rt }).then(({ error: e }) => {
      if (e) { setError('La sesión de la app venció. Cierra sesión en la app y vuelve a entrar.'); return }
      try { localStorage.setItem('sigov-en-app', '1') } catch { /* sin almacenamiento */ }
      window.location.replace(next)
    })
  }, [])
  return (
    <main className="flex min-h-[calc(var(--vh)_*_100)] items-center justify-center p-6 text-center text-[14px]">
      {error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Abriendo SIGOV…</p>}
    </main>
  )
}
