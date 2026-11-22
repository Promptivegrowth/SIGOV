import type { Metadata } from 'next'
import { NotificacionesClient } from './notificaciones-client'

export const metadata: Metadata = { title: 'Notificaciones' }

export default function NotificacionesPage() {
  return <NotificacionesClient />
}
