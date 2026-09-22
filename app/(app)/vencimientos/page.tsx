import type { Metadata } from 'next'
import { VencimientosClient } from './vencimientos-client'

export const metadata: Metadata = {
  title: 'Vencimientos',
  description: 'Todo lo que tiene fecha límite: equipos de seguridad, inspecciones y PCIs',
}

export default function VencimientosPage() {
  return <VencimientosClient />
}
