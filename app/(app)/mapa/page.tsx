import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { SkeletonMap } from '@/components/ui/skeleton'

export const metadata: Metadata = {
  title: 'Mapa',
  description: 'Mapa geoespacial por progresivas: tramos, inventario, evidencias y PCIs',
}

const MapaClient = dynamic(() => import('./mapa-client').then((m) => m.MapaClient), {
  loading: () => (
    <div className="p-4 lg:p-6">
      <SkeletonMap />
    </div>
  ),
})

export default function MapaPage() {
  return <MapaClient />
}
