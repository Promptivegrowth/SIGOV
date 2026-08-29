import type { Metadata } from 'next'
import { CampoClient } from './campo-client'

export const metadata: Metadata = {
  title: 'Campo',
  description: 'Partes diarios, ejecución en campo y evidencia georreferenciada',
}

export default function CampoPage() {
  return <CampoClient />
}
