import type { Metadata } from 'next'
import { InventarioClient } from './inventario-client'

export const metadata: Metadata = {
  title: 'Inventario vial',
  description: 'Elementos viales georreferenciados por progresiva',
}

export default function InventarioPage() {
  return <InventarioClient />
}
