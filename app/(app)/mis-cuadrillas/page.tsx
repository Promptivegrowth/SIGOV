import type { Metadata } from 'next'
import { SupervisorDashboard } from '../dashboard/supervisor-dashboard'

export const metadata: Metadata = { title: 'Mis cuadrillas' }

/** Las cuadrillas a cargo, su programación, avance y alertas (guía 5.1). */
export default function MisCuadrillasPage() {
  return <SupervisorDashboard />
}
