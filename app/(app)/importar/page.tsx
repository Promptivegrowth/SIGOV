import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ImportarClient } from './importar-client'

export const metadata: Metadata = {
  title: 'Importación',
  description: 'Importar programación, PCIs e inventario vial desde Excel',
}

export default function ImportarPage() {
  return (
    <Suspense fallback={null}>
      <ImportarClient />
    </Suspense>
  )
}
