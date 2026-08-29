import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginClient } from './login-client'

export const metadata: Metadata = {
  title: 'Ingresar',
  description: 'Acceso al Sistema Integral de Gestión Operativa Vial',
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  )
}
