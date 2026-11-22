import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GestionUsuarios } from '@/components/gestion/usuarios'

export const metadata: Metadata = { title: 'Usuarios' }

export default function Page() {
  return (
    <Suspense>
      <GestionUsuarios />
    </Suspense>
  )
}
