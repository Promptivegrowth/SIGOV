'use client'

import * as React from 'react'

/**
 * El último recurso: cuando lo que falla es el armazón mismo.
 *
 * `app/error.tsx` atrapa lo que pasa dentro de la aplicación, pero no lo
 * que se rompe en el layout raíz —los proveedores, el tema, la sesión—,
 * porque ese error se lleva por delante el propio armazón que lo dibujaría.
 * Por eso este archivo trae su propio `<html>` y no depende de nada:
 * ni de estilos, ni de componentes, ni de tipografías, que es justo lo que
 * podría estar fallando.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('SIGOV · fallo en el armazón:', error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: '1.15rem', margin: '0 0 .6rem' }}>
            SIGOV no pudo abrirse
          </h1>
          <p style={{ fontSize: '.9rem', lineHeight: 1.6, color: '#475569', margin: '0 0 1.2rem' }}>
            Algo falló antes de cargar la plataforma. No se perdió nada de lo
            registrado. Vuelve a intentarlo y, si sigue igual, avísanos
            {error.digest ? ` con el código ${error.digest}` : ''}.
          </p>
          <button
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 8,
              padding: '.6rem 1.1rem',
              fontSize: '.9rem',
              fontWeight: 600,
              color: '#fff',
              background: '#0b2d6b',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
