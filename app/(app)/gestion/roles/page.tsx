import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RolesPermisos } from '@/components/gestion/roles'

export const metadata: Metadata = { title: 'Roles y permisos' }

export default function Page() {
  return (
    <Suspense>
      <RolesPermisos />
    </Suspense>
  )
}
