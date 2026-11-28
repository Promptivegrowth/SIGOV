import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProgramacionClient } from './programacion-client'

export const metadata: Metadata = {
  title: 'Programación',
  description: 'Programación semanal de actividades por tramo, cuadrilla y fecha',
}

export default function ProgramacionPage() {
  return (
    <Suspense>
      <ProgramacionClient />
    </Suspense>
  )
}
