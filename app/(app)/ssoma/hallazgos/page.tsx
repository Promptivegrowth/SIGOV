import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ControlSsoma } from '@/components/ssoma/control-ssoma'

export const metadata: Metadata = { title: 'Hallazgos SSOMA' }

export default function Page() {
  return (
    <Suspense>
      <ControlSsoma pestana="hallazgos" titulo="Seguimiento de hallazgos" subtitulo="Seguridad, salud ocupacional y medio ambiente" />
    </Suspense>
  )
}
