import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AsignacionClient } from './asignacion-client'

export const metadata: Metadata = { title: 'Asignar PCI completo' }

export default function Page() {
  return (
    <Suspense>
      <AsignacionClient />
    </Suspense>
  )
}
