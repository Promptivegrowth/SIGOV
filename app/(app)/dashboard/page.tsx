import type { Metadata } from 'next'
import { DashboardClient } from './dashboard-client'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Panel de control gerencial de la operación vial',
}

export default function DashboardPage() {
  return <DashboardClient />
}
