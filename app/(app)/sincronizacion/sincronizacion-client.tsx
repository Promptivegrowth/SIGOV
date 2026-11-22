'use client'

import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, CloudUpload, CloudCheck, Clock, WifiOff, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/misc'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { useSession } from '@/lib/hooks/use-session'
import { fmtRelative, fmtNumber, cn } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Sincronización (apartado 4.12).
 *
 * Lo que se registró en este navegador y todavía no salió de él. Mientras
 * haya algo en esta lista, ese trabajo solo existe aquí: si se borran los
 * datos del sitio, se pierde.
 *
 * Se lee de IndexedDB y no de la nube, por lo mismo: preguntarle al
 * servidor por lo que no ha llegado no tiene sentido.
 */

/** El nombre de la tabla, dicho como se dice en obra. */
const EN_CASTELLANO: Record<string, string> = {
  work_orders: 'Parte diario',
  work_entries: 'Actividad ejecutada',
  evidences: 'Fotografía',
  cash_movements: 'Gasto de caja',
  deposit_requests: 'Pedido de depósito',
  supply_requests: 'Pedido de materiales',
  supply_request_items: 'Ítem del pedido',
  safety_talks: 'Charla de seguridad',
  talk_attendance: 'Firma de asistencia',
  hygiene_checks: 'Control de higiene',
  safety_equipment_checks: 'Revisión de equipo',
  vehicle_checks: 'Revisión de vehículo',
  checklist_responses: 'Checklist',
  ats_iperc: 'ATS / IPERC',
  ats_signatures: 'Firma del ATS',
  pci_items: 'Ítem de PCI',
  plan_items: 'Partida programada',
}

export function SincronizacionClient() {
  const { service, crew, role } = useSession()
  const [sincronizando, setSincronizando] = React.useState(false)

  const pendientes = useLiveQuery(
    () => db.outbox.where('status').anyOf('pendiente', 'error').toArray(),
    [], []
  )
  const enviados = useLiveQuery(
    () => db.outbox.where('status').equals('sincronizado').reverse().sortBy('synced_at')
      .then((f) => f.slice(0, 1)),
    [], []
  )

  const conError = (pendientes ?? []).filter((p: any) => p.status === 'error')
  const ultimo = enviados?.[0]

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const r = await syncNow({ serviceId: service.id, crewId: crew?.id ?? null, role })
      toast.success('Sincronización terminada', {
        description: r.pushed > 0
          ? `${r.pushed} ${r.pushed === 1 ? 'registro enviado' : 'registros enviados'}` +
            (r.failed > 0 ? `, ${r.failed} con error.` : '.')
          : 'No quedó nada por enviar.',
      })
    } catch (e: any) {
      toast.error('No se pudo sincronizar', { description: mensajeAmigable(e, 'Inténtalo de nuevo.') })
    } finally {
      setSincronizando(false)
    }
  }

  const total = pendientes?.length ?? 0
  const todoArriba = total === 0

  return (
    <>
      <PageHeader
        icon={RefreshCw}
        title="Sincronización"
        description="Lo que registraste en este equipo y todavía no sale de él."
        actions={
          <Button onClick={sincronizar} disabled={sincronizando} loading={sincronizando}>
            <RefreshCw className="size-4" />
            Sincronizar ahora
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {(role === 'supervisor' || role === 'residente' || role === 'admin') && <SincronizacionAmbito serviceId={service.id} role={role} />}

        {/* ═══ El estado, de un vistazo ═════════════════════════════════ */}
        <div className={cn(
          'flex items-center gap-4 rounded-xl border px-5 py-4',
          conError.length ? 'bg-warning/10 border-warning/30'
            : todoArriba ? 'bg-success/8 border-success/25'
            : 'bg-info/8 border-info/25'
        )}>
          {todoArriba
            ? <CloudCheck className="text-success size-7 shrink-0" />
            : <CloudUpload className={cn('size-7 shrink-0', conError.length ? 'text-warning' : 'text-info')} />}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">
              {todoArriba ? 'Todo sincronizado'
                : `${fmtNumber(total)} ${total === 1 ? 'registro por enviar' : 'registros por enviar'}`}
            </p>
            <p className="text-muted-foreground text-[12px]">
              {ultimo
                ? `Último envío ${fmtRelative(new Date(ultimo.synced_at ?? ultimo.created_at))}.`
                : 'Todavía no se ha enviado nada desde este equipo.'}
              {conError.length > 0 && ` ${conError.length} con error, se reintentan solos.`}
            </p>
          </div>
        </div>

        {/* ═══ Lo que espera ════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">Esperando para subir</CardTitle>
            <CardDescription className="text-[12px]">
              Mientras estén aquí, este trabajo solo existe en este navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {todoArriba ? (
              <EmptyState
                icon={CloudCheck}
                title="No queda nada por enviar"
                description="Todo lo que registraste ya está en la nube."
                className="py-12"
              />
            ) : (
              <ul className="space-y-0.5">
                {(pendientes ?? []).map((p: any) => {
                  const fallo = p.status === 'error'
                  return (
                    <li key={p.client_id} className="hover:bg-secondary/50 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full',
                        fallo ? 'bg-warning' : 'bg-info')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {p.label || EN_CASTELLANO[p.table] || p.table}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
                          <Clock className="size-2.5" />
                          {EN_CASTELLANO[p.table] ?? p.table} · registrado {fmtRelative(new Date(p.created_at))}
                        </span>
                        {fallo && p.last_error && (
                          <span className="text-muted-foreground mt-0.5 block truncate text-[10.5px]">
                            {/* Se guarda el error crudo para soporte; aquí, en castellano */}
                            {mensajeAmigable(p.last_error)}
                          </span>
                        )}
                      </span>
                      {fallo && (
                        <Badge variant="outline" className="border-warning/40 text-warning shrink-0">
                          {p.attempts > 1 ? `${p.attempts} intentos` : 'Reintentando'}
                        </Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

const ROL_CORTO: Record<string, string> = {
  admin: 'Administrador', residente: 'Residente', supervisor: 'Supervisor', ing_seguridad: 'SSOMA', visor: 'COVINCA', jefe_cuadrilla: 'Jefe de cuadrilla',
}

const ESTADO_SYNC: Record<string, { texto: string; clase: string }> = {
  confirmado: { texto: 'Envío confirmado', clase: 'border-success/40 text-success' },
  sin_conexion: { texto: 'Sin conexión > 24 h', clase: 'border-muted-foreground/40 text-muted-foreground' },
  error: { texto: 'Error en el último envío', clase: 'border-destructive/40 text-destructive' },
  sin_registro: { texto: 'Sin registro', clase: 'border-muted-foreground/40 text-muted-foreground' },
}

/**
 * Guía 3.7 / 4.14: el Supervisor ve los equipos de sus cuadrillas; Residente
 * y Administrador, los del contrato. «Sin conexión» no es error ni envío
 * confirmado: se informa el último contacto y lo enviado por la persona.
 */
function SincronizacionAmbito({ serviceId, role }: { serviceId: string; role: string }) {
  const sb = React.useMemo(() => createClient(), [])
  const q = useQuery({
    queryKey: ['sync-ambito', serviceId],
    queryFn: async () => {
      const { data, error } = await sb.rpc('sincronizacion_ambito' as any, { p_service: serviceId, p_dias: 7 } as any)
      if (error) throw error
      return data as any
    },
    refetchInterval: 60_000,
  })
  const d = q.data
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">{role === 'supervisor' ? 'Equipos de mis cuadrillas' : 'Equipos del contrato'}</CardTitle>
        <CardDescription className="text-[12px]">Último contacto de cada teléfono con la nube y lo enviado en los últimos 7 días.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        {q.error && <p className="text-destructive text-[13px]">{mensajeAmigable(q.error)}</p>}
        {d && (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Cifra icono={CloudCheck} titulo="Al día (< 24 h)" valor={d.resumen.al_dia} />
              <Cifra icono={WifiOff} titulo="Sin conexión > 24 h" valor={d.resumen.sin_conexion_24h} />
              <Cifra icono={AlertTriangle} titulo="Error en el último envío" valor={d.resumen.con_error} alerta={d.resumen.con_error > 0} />
              <Cifra icono={CloudUpload} titulo="Registros enviados (7 d)" valor={d.resumen.enviados} />
            </div>
            <p className="text-muted-foreground text-[11.5px]">
              {fmtNumber(d.resumen.personas)} personas{d.resumen.sin_registro ? ` · ${fmtNumber(d.resumen.sin_registro)} sin ningún envío registrado` : ''}.
              «Sin conexión» no es error: lo que un teléfono aún no envía queda en él hasta que tenga señal. Se muestran sus 3 equipos más recientes.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-secondary/50 text-muted-foreground text-[11.5px]"><tr>
                  <th className="px-3 py-2 text-left font-medium">Cuadrilla</th><th className="text-left font-medium">Persona</th>
                  <th className="text-left font-medium">Equipo</th><th className="text-left font-medium">Último contacto</th>
                  <th className="text-right font-medium">Enviados</th><th className="text-right font-medium">Fallidos</th>
                  <th className="px-3 text-left font-medium">Estado</th>
                </tr></thead>
                <tbody>
                  {(d.personas as any[]).flatMap((p) => {
                    const devs = (p.dispositivos as any[]).length ? p.dispositivos as any[] : [null]
                    return devs.map((x, i) => (
                      <tr key={`${p.profile_id}-${i}`} className="border-t border-border">
                        <td className="px-3 py-2">{i === 0 ? (p.codigo ?? '—') : ''}</td>
                        <td>{i === 0 ? <>{p.nombre}{p.codigo ? '' : <span className="text-muted-foreground"> · {ROL_CORTO[p.rol] ?? p.rol}</span>}{p.equipos > 3 ? <span className="text-muted-foreground block text-[11px]">{p.equipos} equipos en total</span> : null}</> : ''}</td>
                        <td className="font-mono text-[11.5px]">{x?.device ?? '—'}</td>
                        <td>{x?.ultimo ? fmtRelative(new Date(x.ultimo)) : 'Nunca'}</td>
                        <td className="text-right tabular-nums">{x ? fmtNumber(x.enviados) : '—'}</td>
                        <td className="text-right tabular-nums">{x ? fmtNumber(x.fallidos) : '—'}</td>
                        <td className="px-3"><Badge variant="outline" className={ESTADO_SYNC[x?.estado ?? 'sin_registro'].clase}>{ESTADO_SYNC[x?.estado ?? 'sin_registro'].texto}</Badge></td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Cifra({ icono: I, titulo, valor, alerta }: { icono: any; titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2', alerta && 'border-destructive/40 bg-destructive/5')}>
      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]"><I className="size-3.5" />{titulo}</p>
      <p className="text-[18px] font-bold tabular-nums">{fmtNumber(valor)}</p>
    </div>
  )
}
