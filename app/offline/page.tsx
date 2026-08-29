import { WifiOff, RefreshCw } from 'lucide-react'
import { SigovMark } from '@/components/shared/logo'

export const metadata = { title: 'Sin conexión' }

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <SigovMark size={56} />
      <div className="bg-secondary text-muted-foreground mt-6 flex size-12 items-center justify-center rounded-2xl">
        <WifiOff className="size-5" />
      </div>
      <h1 className="mt-4 text-xl font-bold tracking-tight">Sin conexión</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
        Esta pantalla aún no está guardada en el dispositivo. Lo que ya visitaste sigue disponible
        sin conexión, y todo lo que registres en campo se guardará localmente y se enviará al
        recuperar señal.
      </p>
      <a
        href="/dashboard"
        className="bg-primary text-primary-foreground mt-6 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-opacity hover:opacity-90"
      >
        <RefreshCw className="size-4" />
        Reintentar
      </a>
    </div>
  )
}
