import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * El isotipo de Grupo Servicon —las tres figuras enlazadas— recortado del
 * logotipo oficial. Es la marca que identifica al sistema: la empresa es
 * quien responde por lo que se emite desde aquí.
 */
export function ServiconMark({
  className,
  size = 32,
  claro = false,
}: {
  className?: string
  size?: number
  /** Para fondos oscuros: el azul del logotipo pasa a blanco. */
  claro?: boolean
}) {
  return (
    <Image
      src={claro ? '/marca/simbolo-servicon-claro.png' : '/marca/simbolo-servicon.png'}
      alt="Grupo Servicon V&D EIRL"
      width={size}
      height={Math.round(size * 472 / 531)}
      priority
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: 'auto' }}
    />
  )
}

/** El logotipo completo: isotipo y palabra, tal como se entrega al cliente. */
export function ServiconLogo({
  className,
  width = 220,
  claro = false,
}: {
  className?: string
  width?: number
  claro?: boolean
}) {
  return (
    <Image
      src={claro ? '/marca/logo-servicon-claro.png' : '/marca/logo-servicon.png'}
      alt="Grupo Servicon V&D EIRL"
      width={width}
      height={Math.round(width * 472 / 2102)}
      priority
      className={cn('object-contain', className)}
      style={{ width, height: 'auto' }}
    />
  )
}
