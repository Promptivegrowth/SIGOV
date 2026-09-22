'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell, BellOff, ArrowRight, CircleAlert, TriangleAlert, Info, ShieldCheck,
  CheckCheck, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/misc'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonList } from '@/components/ui/skeleton'
import { fmtNumber, fmtRelative, cn } from '@/lib/utils'

/**
 * Alertas: lo que exige una decisión hoy.
 *
 * Dos cosas distintas conviven aquí y conviene no confundirlas. Arriba, lo
 * que la operación tiene abierto ahora mismo —PCI vencidos, partes sin
 * validar, documentos por caducar—, que se calcula a cada visita y solo
 * desaparece cuando el problema se resuelve. Abajo, las notificaciones,
 * que son avisos puntuales y se marcan como leídas.
 *
 * Una alerta que no se pueda atender desde alguna pantalla no debería
 * estar en esta lista: por eso todas llevan su destino.
 */

const SEVERIDAD = {
  critica: {
    label: 'Crítica',
    icon: CircleAlert,
    caja: 'bg-destructive/8 border-destructive/25',
    texto: 'text-destructive',
  },
  alta: {
    label: 'Alta',
    icon: TriangleAlert,
    caja: 'bg-warning/10 border-warning/30',
    texto: 'text-warning',
  },
  media: {
    label: 'Media',
    icon: Info,
    caja: 'bg-info/8 border-info/25',
    texto: 'text-info',
  },
  baja: {
    label: 'Baja',
    icon: Info,
    caja: 'bg-secondary border-border',
    texto: 'text-muted-foreground',
  },
} as const

type Severidad = keyof typeof SEVERIDAD

interface Alerta {
  clave: string
  severidad: Severidad
  titulo: string
  detalle: string
  cantidad: number
  url: string
  orden: number
}

export function AlertasClient() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()

  const alertas = useQuery({
    queryKey: ['alertas-operativas', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('alertas_operativas', { p_service_id: service.id })
      if (error) throw error
      return (data ?? []) as unknown as Alerta[]
    },
    refetchInterval: 120_000,
  })

  const avisos = useQuery({
    queryKey: ['notificaciones', profile.id],
    queryFn: async () => {
      const { data } = await sb
        .from('notifications')
        .select('id, type, title, body, url, severity, read_at, created_at')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(40)
      return data ?? []
    },
    refetchInterval: 120_000,
  })

  const sinLeer = (avisos.data ?? []).filter((n: any) => !n.read_at).length

  const marcarTodo = async () => {
    await sb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('profile_id', profile.id)
    qc.invalidateQueries({ queryKey: ['notificaciones'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const filas = alertas.data ?? []
  const criticas = filas.filter((a) => a.severidad === 'critica').length

  return (
    <>
      <PageHeader
        icon={Bell}
        title="Alertas"
        description="Lo que está abierto en la operación y los avisos dirigidos a ti."
        actions={
          sinLeer > 0 && (
            <Button variant="outline" size="sm" onClick={marcarTodo}>
              <CheckCheck className="size-3.5" />
              Marcar {sinLeer} como leídas
            </Button>
          )
        }
      />

      <PageBody className="space-y-6">
        {/* ═══ Lo que está abierto ══════════════════════════════════════ */}
        <section aria-label="Alertas de la operación">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-muted-foreground text-[11.5px] font-semibold uppercase tracking-wide">
              Estado de la operación
            </h2>
            {!alertas.isLoading && filas.length > 0 && (
              <span className="text-muted-foreground text-[11.5px]">
                {filas.length} {filas.length === 1 ? 'alerta abierta' : 'alertas abiertas'}
                {criticas > 0 && <span className="text-destructive font-semibold"> · {criticas} crítica{criticas === 1 ? '' : 's'}</span>}
              </span>
            )}
          </div>

          {alertas.isLoading ? (
            <SkeletonList rows={4} />
          ) : !filas.length ? (
            <div className="bg-success/8 border-success/25 flex items-center gap-3 rounded-xl border px-4 py-4">
              <ShieldCheck className="text-success size-5 shrink-0" />
              <div>
                <p className="text-[13.5px] font-semibold">La operación está al día</p>
                <p className="text-muted-foreground text-[12px]">
                  Sin PCI vencidos, sin partes por validar y sin documentos por caducar.
                </p>
              </div>
            </div>
          ) : (
            <ul className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filas.map((a) => {
                const s = SEVERIDAD[a.severidad] ?? SEVERIDAD.baja
                return (
                  <li key={a.clave}>
                    <Link
                      href={a.url}
                      className={cn(
                        'group flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3.5 transition-all hover:shadow-sm',
                        s.caja
                      )}
                    >
                      <s.icon className={cn('mt-0.5 size-5 shrink-0', s.texto)} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2 text-[13.5px] font-semibold leading-snug">
                          <span className={cn('text-[17px] tabular-nums', s.texto)}>
                            {fmtNumber(a.cantidad)}
                          </span>
                          {a.titulo}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[11.5px] leading-snug">
                          {a.detalle}
                        </p>
                      </div>
                      <ArrowRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ═══ Avisos dirigidos ═════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">Notificaciones</CardTitle>
            <CardDescription className="text-[12px]">
              Avisos dirigidos a ti. A diferencia de las alertas de arriba, estos se
              marcan como leídos y no vuelven.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {avisos.isLoading ? (
              <SkeletonList rows={5} />
            ) : !avisos.data?.length ? (
              <EmptyState
                icon={BellOff}
                title="Sin notificaciones"
                description="Cuando el sistema tenga algo que avisarte, aparecerá aquí."
                className="py-10"
              />
            ) : (
              <ul className="space-y-0.5">
                {avisos.data.map((n: any) => {
                  const s = SEVERIDAD[(n.severity as Severidad)] ?? SEVERIDAD.baja
                  const cuerpo = (
                    <>
                      <span
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          n.read_at ? 'bg-border' : s.texto.replace('text-', 'bg-')
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[12.5px]', n.read_at ? 'font-normal' : 'font-semibold')}>
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="text-muted-foreground block text-[11.5px] leading-snug">{n.body}</span>
                        )}
                        <span className="text-muted-foreground/80 mt-0.5 flex items-center gap-1 text-[10.5px]">
                          <Clock className="size-2.5" />
                          {fmtRelative(n.created_at)}
                        </span>
                      </span>
                    </>
                  )
                  return (
                    <li key={n.id}>
                      {n.url ? (
                        <Link href={n.url} className="hover:bg-secondary/60 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors">
                          {cuerpo}
                          <ArrowRight className="text-muted-foreground mt-1 size-3.5 shrink-0" />
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 rounded-lg px-2 py-2.5">{cuerpo}</div>
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
