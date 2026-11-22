import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DashboardClient } from './dashboard-client'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Panel de control gerencial de la operación vial',
}

export default function DashboardPage() {
  // Los filtros del Inicio viven en la dirección (useSearchParams)
  return (
    <Suspense>
      <DashboardClient />
    </Suspense>
  )
}
