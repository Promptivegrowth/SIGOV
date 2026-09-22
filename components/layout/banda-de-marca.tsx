'use client'

import { ServiconLogo } from '@/components/shared/logo'
import { APP } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * La banda de marca que encabeza todas las pantallas de los mockups.
 *
 * Tres piezas, de izquierda a derecha: el logotipo de Grupo Servicon, el
 * nombre del sistema —SIGO**V**, con la uve en verde— y la franja de
 * campaña. Es la firma visual del entregable: sin ella la aplicación se ve
 * como una plantilla con el logo pegado encima.
 *
 * La franja lleva una foto de carretera en el diseño de Elvis. Mientras no
 * esté el archivo se usa el degradado de la marca, que es de donde salen
 * los colores de la foto; cuando llegue, basta con ponerla de fondo aquí.
 */
export function BandaDeMarca({ className }: { className?: string }) {
  return (
    <div className={cn('bg-card flex h-[62px] shrink-0 items-stretch border-b border-border', className)}>
      <div className="flex items-center gap-4 pl-4 lg:pl-6">
        <ServiconLogo width={150} />

        {/* El filete verde separa la empresa del producto, como en el mockup */}
        <span className="bg-brand-green h-8 w-[3px] rounded-full" aria-hidden />

        <div className="min-w-0">
          <p className="text-primary text-[19px] font-bold leading-none tracking-tight">
            SIGO<span className="text-brand-green">V</span>
          </p>
          <p className="text-muted-foreground mt-1 hidden text-[10.5px] leading-none sm:block">
            {APP.fullName.replace('Sistema Integral de ', 'Sistema de ')}
          </p>
        </div>
      </div>

      {/* La campaña, a la derecha. En pantallas estrechas estorba más de lo
          que aporta, así que solo aparece cuando hay sitio de sobra. */}
      <div
        className="relative ml-auto hidden w-[320px] items-center overflow-hidden xl:flex"
        style={{
          background:
            'linear-gradient(100deg, var(--brand-green) 0%, var(--primary) 62%, var(--brand-deep) 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px)',
            backgroundSize: '26px 26px',
          }}
          aria-hidden
        />
        <p className="relative px-5 text-[11px] font-bold leading-tight tracking-wide text-white">
          SEGURIDAD EN MOVIMIENTO,
          <br />
          COMPROMISO EN CADA KM
        </p>
      </div>
    </div>
  )
}

/**
 * El pie de campaña, con el lema que cierra las pantallas del mockup.
 *
 * No es decoración: es lo que el cliente reconoce del entregable impreso y
 * lo que hace que la pantalla y el PDF se lean como del mismo sistema.
 */
export function PieDeCampana({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative flex h-11 shrink-0 items-center overflow-hidden', className)}
      style={{
        background:
          'linear-gradient(100deg, var(--brand-deep) 0%, var(--primary) 45%, var(--brand-green) 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)',
          backgroundSize: '22px 22px',
        }}
        aria-hidden
      />
      <p className="relative px-5 text-[11px] font-bold tracking-wide text-white">
        TRABAJANDO POR VÍAS MÁS SEGURAS
      </p>
      <p className="relative ml-auto px-5 text-[10.5px] font-medium tracking-wide text-white/75">
        {APP.org}
      </p>
    </div>
  )
}
