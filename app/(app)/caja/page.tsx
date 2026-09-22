import type { Metadata } from 'next'
import { CajaClient } from './caja-client'

export const metadata: Metadata = {
  title: 'Caja chica',
  description: 'Saldos por cuadrilla, revisión de gastos y solicitudes de depósito',
}

export default function CajaPage() {
  return <CajaClient />
}
