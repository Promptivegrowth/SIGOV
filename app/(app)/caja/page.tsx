import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CajaClient } from './caja-client'

export const metadata: Metadata = {
  title: 'Caja',
  description: 'Caja presupuestal y caja chica de las cuadrillas',
}

export default function CajaPage() {
  return (
    <Suspense>
      <CajaClient />
    </Suspense>
  )
}
