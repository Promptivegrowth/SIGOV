import type { Metadata } from 'next'
import { EvidenciasClient } from './evidencias-client'

export const metadata: Metadata = {
  title: 'Fotos / Evidencias',
  description: 'Las fotografías selladas de campo, por día y por fase',
}

export default function EvidenciasPage() {
  return <EvidenciasClient />
}
