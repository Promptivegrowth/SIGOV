'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { startAutoSync } from '@/lib/offline/sync'
import { requestPersistence } from '@/lib/offline/db'
import type { Role } from '@/lib/constants'

export interface SessionProfile {
  id: string
  full_name: string
  email: string
  role: Role
  position: string | null
  avatar_url: string | null
  phone: string | null
}

export interface SessionService {
  id: string
  code: string
  name: string
  color: string
  client_name: string | null
  contract_code: string | null
  status: string
  modules: Record<string, boolean>
  created_at?: string
  role: Role
}

export interface SessionCrew {
  id: string
  code: string
  name: string
  color: string
  service_id: string
}

interface SessionValue {
  profile: SessionProfile
  services: SessionService[]
  service: SessionService
  crew: SessionCrew | null
  role: Role
  /** Rol efectivo dentro del servicio activo */
  can: {
    write: boolean
    manage: boolean
    admin: boolean
    field: boolean
  }
  hasModule: (m: string) => boolean
  switchService: (id: string) => void
  signOut: () => Promise<void>
}

const Ctx = React.createContext<SessionValue | null>(null)

const STORAGE_KEY = 'sigov.active_service'

export function SessionProvider({
  profile,
  services,
  crews,
  children,
}: {
  profile: SessionProfile
  services: SessionService[]
  crews: SessionCrew[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [activeId, setActiveId] = React.useState<string>(() => services[0]?.id ?? '')

  // Restaurar el servicio elegido en la sesión anterior
  React.useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved && services.some((s) => s.id === saved)) setActiveId(saved)
  }, [services])

  const service = React.useMemo(
    () => services.find((s) => s.id === activeId) ?? services[0],
    [services, activeId]
  )

  const role = (service?.role ?? profile.role) as Role

  // La cuadrilla que lidera el usuario DENTRO del servicio activo
  const crew = React.useMemo(
    () => crews.find((c) => c.service_id === service?.id) ?? null,
    [crews, service]
  )

  const switchService = React.useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(STORAGE_KEY, id)
    router.refresh()
  }, [router])

  const signOut = React.useCallback(async () => {
    const sb = createClient()
    await sb.auth.signOut()
    localStorage.removeItem(STORAGE_KEY)
    router.push('/login')
    router.refresh()
  }, [router])

  // Arrancar la sincronización automática para el servicio activo
  React.useEffect(() => {
    if (!service?.id) return
    void requestPersistence()
    const stop = startAutoSync(
      { serviceId: service.id, crewId: role === 'jefe_cuadrilla' ? crew?.id ?? null : null, role },
      120_000
    )
    return stop
  }, [service?.id, role, crew?.id])

  const value = React.useMemo<SessionValue | null>(() => {
    if (!service) return null
    return {
      profile,
      services,
      service,
      crew,
      role,
      can: {
        write: ['admin', 'supervisor', 'jefe_cuadrilla', 'ing_seguridad'].includes(role),
        manage: ['admin', 'supervisor'].includes(role),
        admin: role === 'admin',
        field: role === 'jefe_cuadrilla',
      },
      hasModule: (m: string) => service.modules?.[m] !== false,
      switchService,
      signOut,
    }
  }, [profile, services, service, crew, role, switchService, signOut])

  if (!value) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-lg font-semibold">Sin servicios asignados</h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Tu usuario no pertenece a ningún servicio. Contacta al administrador del sistema
            para que te asigne un contrato.
          </p>
        </div>
      </div>
    )
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
