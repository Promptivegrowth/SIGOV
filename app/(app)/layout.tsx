import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SessionProvider } from '@/lib/hooks/use-session'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, position, avatar_url, phone')
      .eq('id', user.id)
      .single(),
    supabase
      .from('service_members')
      .select('role, services(id, code, name, color, client_name, contract_code, status, modules, created_at)')
      .eq('profile_id', user.id),
  ])

  if (!profile) redirect('/login')

  const services = (memberships ?? [])
    .filter((m: any) => m.services)
    .map((m: any) => ({
      id: m.services.id,
      code: m.services.code,
      name: m.services.name,
      color: m.services.color,
      client_name: m.services.client_name,
      contract_code: m.services.contract_code,
      status: m.services.status,
      modules: m.services.modules ?? {},
      created_at: m.services.created_at,
      role: m.role,
    }))
    // El contrato principal (el primero dado de alta) manda: es el que se abre
    // por defecto. Ordenar por código pondría delante a un servicio secundario.
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))

  const { data: crews } = await supabase
    .from('crews')
    .select('id, code, name, color, service_id')
    .eq('leader_id', user.id)
    .is('deleted_at', null)

  return (
    <SessionProvider
      profile={profile as any}
      services={services}
      crews={(crews ?? []) as any}
    >
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
