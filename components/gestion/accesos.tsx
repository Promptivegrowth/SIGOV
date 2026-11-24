'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, CheckCircle2, XCircle, ShieldAlert, Search, Download, LogIn, LogOut, KeyRound, Smartphone, Unlock, Laptop, Layers, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDateTime, fmtNumber, toISODate, addDays } from '@/lib/utils'
import { descargarExcel } from '@/lib/reports'
import { usuarioDeCorreo } from '@/lib/usuario'
import { GestionNav, Kpi } from './gestion-nav'
import { nombreRol } from './usuarios'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Historial de accesos» (A05): ingresos, salidas, intentos fallidos,
 * bloqueos, restablecimientos y cambios de dispositivo, con IP, dispositivo
 * y plataforma. Lo anota el servidor; nadie lo edita.
 */
const EVENTO: Record<string, { t: string; i: any; c: string }> = {
  ingreso: { t: 'Ingreso', i: LogIn, c: 'text-success bg-success/10' }, salida: { t: 'Salida', i: LogOut, c: 'text-muted-foreground bg-secondary' },
  fallido: { t: 'Intento fallido', i: XCircle, c: 'text-destructive bg-destructive/10' }, bloqueado: { t: 'Bloqueo', i: ShieldAlert, c: 'text-warning bg-warning/12' },
  desbloqueo: { t: 'Desbloqueo', i: Unlock, c: 'text-info bg-info/10' }, restablecimiento: { t: 'Restablecimiento de contraseña', i: KeyRound, c: 'text-violet-600 bg-violet-500/10' },
  cambio_dispositivo: { t: 'Cambio de dispositivo', i: Smartphone, c: 'text-info bg-info/10' },
}
const RES: Record<string, string> = { exitoso: 'bg-success/12 text-success', fallido: 'bg-destructive/12 text-destructive', bloqueado: 'bg-warning/15 text-warning' }

export function HistorialAccesos() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [sel, setSel] = React.useState<any | null>(null)
  const [f, setF] = React.useState({ q: '', desde: toISODate(addDays(new Date(), -30)), hasta: toISODate(new Date()), usuario: '', rol: '', dispositivo: '', estado: '' })
  const miembros = useQuery({
    queryKey: ['acc-miembros', service.id],
    queryFn: async () => ((await sb.from('service_members').select('profile_id, role').eq('service_id', service.id)).data ?? []) as any[],
  })
  const q = useQuery({
    queryKey: ['accesos', service.id, f.desde, f.hasta],
    queryFn: async () => ((await sb.from('accesos' as any).select('*, profiles(full_name, email)').gte('cuando', f.desde).lte('cuando', f.hasta + 'T23:59:59')
      .order('cuando', { ascending: false }).limit(1000)).data ?? []) as any[],
  })
  const rolDe = new Map((miembros.data ?? []).map((m) => [m.profile_id, m.role]))
  const todos = (q.data ?? []).filter((a) => !a.profile_id || rolDe.has(a.profile_id))
  const filas = todos.filter((a) => (!f.usuario || a.profile_id === f.usuario) && (!f.rol || rolDe.get(a.profile_id) === f.rol)
    && (!f.dispositivo || a.dispositivo === f.dispositivo) && (!f.estado || a.resultado === f.estado)
    && (!f.q || `${a.profiles?.full_name ?? ''} ${a.usuario ?? ''} ${a.ip ?? ''} ${a.ciudad ?? ''} ${a.dispositivo ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  const usuarios = [...new Map(todos.filter((a) => a.profile_id).map((a) => [a.profile_id, a.profiles?.full_name ?? a.usuario])).entries()]
  const exportar = () => descargarExcel('Historial_de_accesos', { titulo: 'Historial de accesos', servicio: service.name, periodo: `${f.desde} – ${f.hasta}`, generadoPor: profile.full_name },
    [{ name: 'Accesos', columns: [
      { header: 'Fecha/hora', key: 'fecha', width: 18 }, { header: 'Usuario', key: 'u', width: 26 }, { header: 'Rol', key: 'rol', width: 18 }, { header: 'Evento', key: 'ev', width: 24 },
      { header: 'Dispositivo', key: 'dispositivo', width: 16 }, { header: 'IP', key: 'ip', width: 16 }, { header: 'Ciudad', key: 'ciudad', width: 18 }, { header: 'Estado', key: 'resultado', width: 12 }, { header: 'Detalle', key: 'detalle', width: 30 },
    ], rows: filas.map((a) => ({ ...a, fecha: fmtDateTime(a.cuando), u: a.profiles?.full_name ?? a.usuario, rol: nombreRol(rolDe.get(a.profile_id) ?? ''), ev: EVENTO[a.evento]?.t ?? a.evento })) }])

  return (
    <>
      <PageHeader title="Usuarios" description="Gestión de usuarios y roles del sistema" />
      <PageBody className="space-y-4">
        <GestionNav activo="/gestion/accesos" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={Users} valor={fmtNumber(todos.length)} etiqueta="Total de accesos" tono="azul" />
          <Kpi icono={CheckCircle2} valor={fmtNumber(todos.filter((a) => a.resultado === 'exitoso').length)} etiqueta="Exitosos" tono="verde" />
          <Kpi icono={XCircle} valor={fmtNumber(todos.filter((a) => a.resultado === 'fallido').length)} etiqueta="Fallidos" tono="rojo" />
          <Kpi icono={ShieldAlert} valor={fmtNumber(todos.filter((a) => a.resultado === 'bloqueado').length)} etiqueta="Bloqueados" tono="ambar" />
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar en el historial (usuario, IP, dispositivo...)" className="pl-8" /></div>
            <label className="text-[12px]"><span className="text-muted-foreground block">Desde</span><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="h-9" /></label>
            <label className="text-[12px]"><span className="text-muted-foreground block">Hasta</span><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="h-9" /></label>
            <Elegir etiqueta="Usuario" valor={f.usuario} cambiar={(v) => setF({ ...f, usuario: v })} todos="Todos" opciones={usuarios as any} />
            <Elegir etiqueta="Rol" valor={f.rol} cambiar={(v) => setF({ ...f, rol: v })} todos="Todos" opciones={['admin', 'supervisor', 'residente', 'jefe_cuadrilla', 'ing_seguridad', 'visor'].map((r) => [r, nombreRol(r)])} />
            <Elegir etiqueta="Dispositivo" valor={f.dispositivo} cambiar={(v) => setF({ ...f, dispositivo: v })} todos="Todos" opciones={[...new Set(todos.map((a) => a.dispositivo).filter(Boolean))].map((d) => [d, d])} />
            <Elegir etiqueta="Estado" valor={f.estado} cambiar={(v) => setF({ ...f, estado: v })} todos="Todos" opciones={[['exitoso', 'Exitoso'], ['fallido', 'Fallido'], ['bloqueado', 'Bloqueado']]} />
            <Button onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar historial</Button>
          </CardContent>
        </Card>
        <div className={cn('grid gap-4', sel && 'xl:grid-cols-[minmax(0,1fr)_340px]')}>
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Registros de accesos (recientes)</CardTitle>
            <span className="text-muted-foreground text-[12px]">Mostrando {fmtNumber(Math.min(filas.length, 200))} de {fmtNumber(filas.length)} registros</span></CardHeader>
          <CardContent className="p-0">
            {q.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : filas.length === 0 ? (
              <p className="text-muted-foreground px-4 pb-6 text-[13px]">Sin registros en el periodo. Los accesos se anotan desde esta versión.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filas.slice(0, 200).map((a) => {
                  const e = EVENTO[a.evento] ?? EVENTO.ingreso
                  const D = /android|bluestacks/i.test(a.dispositivo ?? '') ? (/bluestacks/i.test(a.dispositivo) ? Layers : Smartphone) : Laptop
                  return (
                    <li key={a.id} onClick={() => setSel(a)} className={cn('flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px]', sel?.id === a.id ? 'bg-primary/[0.06]' : 'hover:bg-secondary/40')}>
                      <span className={cn('grid size-8 place-items-center rounded-lg', e.c)}><e.i className="size-4" /></span>
                      <p className="min-w-36 font-semibold">{fmtDateTime(a.cuando)}</p>
                      <div className="min-w-48 flex-1"><p className="font-semibold">{a.profiles?.full_name ?? a.usuario ?? '—'}</p>
                        <p className="text-muted-foreground">{a.profile_id ? nombreRol(rolDe.get(a.profile_id) ?? '') : 'Usuario no registrado'} · {e.t}</p></div>
                      <p className="text-muted-foreground flex min-w-32 items-center gap-1.5"><D className="size-3.5" />{a.dispositivo ?? '—'}</p>
                      <p className="text-muted-foreground flex min-w-32 items-center gap-1.5"><MapPin className="size-3.5" />{a.ciudad ?? a.ip ?? '—'}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', RES[a.resultado])}>● {a.resultado === 'exitoso' ? 'Exitoso' : a.resultado === 'fallido' ? 'Fallido' : 'Bloqueado'}
                        {a.detalle && <span className="text-muted-foreground ml-1 font-normal">— {a.detalle}</span>}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        {sel && (
          <Card className="h-fit">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Detalle del acceso</CardTitle>
              <button onClick={() => setSel(null)} aria-label="Cerrar" className="text-muted-foreground text-[16px]">×</button></CardHeader>
            <CardContent className="space-y-1 text-[12.5px]">
              {[['Fecha y hora', fmtDateTime(sel.cuando)], ['Usuario', sel.profiles?.full_name ?? sel.usuario ?? '—'], ['Cuenta', sel.profiles?.email ?? sel.usuario ?? '—'],
                ['Rol', sel.profile_id ? nombreRol(rolDe.get(sel.profile_id) ?? '') : 'No registrado'], ['Evento', EVENTO[sel.evento]?.t ?? sel.evento],
                ['Resultado', sel.resultado === 'exitoso' ? 'Exitoso' : sel.resultado === 'fallido' ? 'Fallido' : 'Bloqueado'], ['Detalle', sel.detalle ?? '—'],
                ['Dispositivo', sel.dispositivo ?? '—'], ['Plataforma', sel.plataforma ?? '—'], ['IP', sel.ip ?? '—'], ['Ciudad', sel.ciudad ?? 'Sin dato (registro anterior)'],
                ['Navegador', sel.user_agent ?? '—']].map(([k, v]) => (
                <p key={k} className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">{k}</span><span className="text-right break-all">{v}</span></p>
              ))}
              <p className="text-muted-foreground pt-1 text-[11.5px]">Solo lectura · el historial de accesos no se edita ni se borra.</p>
            </CardContent>
          </Card>
        )}
        </div>
        <p className="text-muted-foreground text-[12px]">Cinco intentos fallidos en 15 minutos bloquean la cuenta 30 minutos y avisan al Administrador, que puede desbloquearla desde Usuarios.</p>
      </PageBody>
    </>
  )
}
