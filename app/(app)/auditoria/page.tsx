import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuditoriaClient } from './auditoria-client'

export const metadata: Metadata = {
  title: 'Bitácora del sistema',
  description: 'Registro inalterable de eventos, acciones y accesos del SIGOV',
}

export default function AuditoriaPage() {
  return (
    <Suspense>
      <AuditoriaClient />
    </Suspense>
  )
}
