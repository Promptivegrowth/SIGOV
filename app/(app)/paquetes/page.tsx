import type { Metadata } from 'next'
import { PaquetesClient } from './paquetes-client'

export const metadata: Metadata = {
  title: 'Paquete de entrega',
  description: 'Arma el ZIP con partes, panel fotográfico, PCI y SSOMA, con su índice',
}

export default function PaquetesPage() {
  return <PaquetesClient />
}
