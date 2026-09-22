'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock, FireExtinguisher, BriefcaseMedical, Droplets, ShieldAlert,
  TriangleAlert, CheckCircle2, Wrench, Truck, CircleCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/misc'
import { cn, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Los cuatro escalones de aviso que pidió Elvis.
 * El orden importa: es el de urgencia, no el cronológico.
 */
const ESCALONES = [
  { key: 'vencido', label: 'Vencidos',  tono: 'text-sem-vencido', fondo: 'bg-sem-vencido' },
  { key: '7',       label: '7 días',    tono: 'text-sem-rojo',    fondo: 'bg-sem-rojo' },
  { key: '15',      label: '15 días',   tono: 'text-sem-ambar',   fondo: 'bg-sem-ambar' },
  { key: '30',      label: '30 días',   tono: 'text-sem-verde',   fondo: 'bg-sem-verde' },
] as const

const ORIGEN = {
  equipo:     { label: 'Equipos',    icon: FireExtinguisher },
  inspeccion: { label: 'Inspección', icon: Wrench },
  vehiculo:   { label: 'Vehículos',  icon: Truck },
  pci:        { label: 'PCI',        icon: TriangleAlert },
}

const TIPO_VEHICULO: Record<string, string> = {
  camioneta: 'Camioneta',
  volquete: 'Volquete',
  cisterna: 'Cisterna',
  cargador: 'Cargador frontal',
  retroexcavadora: 'Retroexcavadora',
  rodillo: 'Rodillo',
  motoniveladora: 'Motoniveladora',
  moto: 'Motocicleta',
  otro: 'Vehículo',
}

const ICONO_EQUIPO: Record<string, typeof FireExtinguisher> = {
  extintor: FireExtinguisher,
  botiquin: BriefcaseMedical,
  kit_antiderrame: Droplets,
}

const TIPO_EQUIPO: Record<string, string> = {
  extintor: 'Extintor',
  botiquin: 'Botiquín',
  kit_antiderrame: 'Kit antiderrame',
  camilla: 'Camilla',
  lavaojos: 'Lavaojos',
  detector_gas: 'Detector de gas',
  otro: 'Equipo',
}

/** Cuántos hay en el escalón elegido, sin filtrar por tipo. */
function filtradosTotal(datos: any[] | undefined, escalon: string | null) {
  return (datos ?? []).filter((v) => !escalon || v.alert_level === escalon).length
}

/** El plazo dicho en llano, que es como se conversa. */
function plazo(dias: number | null) {
  if (dias == null) return 'Sin fecha'
  if (dias < 0) return dias === -1 ? 'Venció ayer' : `Venció hace ${-dias} días`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Faltan ${dias} días`
}

function tonoDe(semaforo: string) {
  return {
    vencido: 'text-sem-vencido',
    rojo: 'text-sem-rojo',
    ambar: 'text-sem-ambar',
    verde: 'text-sem-verde',
  }[semaforo] ?? 'text-muted-foreground'
}

/**
 * Vencimientos.
 *
 * Una sola pantalla con todo lo que tiene fecha límite, porque el responsable
 * de SSOMA no debería entrar a cinco sitios para saber qué se le viene encima.
 * Lo vencido va primero: es lo que se convierte en hallazgo de auditoría.
 */
export function VencimientosClient() {
  const { service, profile, can } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [escalon, setEscalon] = React.useState<string | null>(null)
  const [origen, setOrigen] = React.useState<string | null>(null)
  // Un contrato con cientos de PCI vencidos hace de esta lista un muro
  // ilegible; se muestra de a tandas y el resto se pide.
  const [cuantos, setCuantos] = React.useState(40)
  const [renovando, setRenovando] = React.useState<any>(null)

  const vencimientos = useQuery({
    queryKey: ['vencimientos', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_vencimientos')
        .select('*')
        .eq('service_id', service.id)
        .not('alert_level', 'is', null)
        .order('due_date', { ascending: true })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })

  const flota = useQuery({
    queryKey: ['flota', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_vehicles')
        .select('*')
        .eq('service_id', service.id)
        .order('first_due', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const equipos = useQuery({
    queryKey: ['equipos-seguridad', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_safety_equipment')
        .select('*')
        .eq('service_id', service.id)
        .order('expires_on', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['vencimientos'] })
    qc.invalidateQueries({ queryKey: ['equipos-seguridad'] })
    qc.invalidateQueries({ queryKey: ['flota'] })
  }

  const conteos = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of vencimientos.data ?? []) m[v.alert_level] = (m[v.alert_level] ?? 0) + 1
    return m
  }, [vencimientos.data])

  const filtrados = (vencimientos.data ?? []).filter(
    (v: any) =>
      (!escalon || v.alert_level === escalon) &&
      (!origen || v.origen === origen)
  )
  const visibles = filtrados.slice(0, cuantos)

  const porOrigen = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of vencimientos.data ?? []) {
      if (escalon && v.alert_level !== escalon) continue
      const clave = String(v.origen ?? 'otro')
      m[clave] = (m[clave] ?? 0) + 1
    }
    return m
  }, [vencimientos.data, escalon])

  // Al cambiar de filtro se vuelve a la primera tanda
  React.useEffect(() => { setCuantos(40) }, [escalon, origen])

  return (
    <>
      <PageHeader
        title="Vencimientos"
        description="Todo lo que tiene fecha límite: equipos de seguridad, sus inspecciones y los PCIs abiertos"
        icon={CalendarClock}
      />

      <PageBody>
        {/* Los escalones de aviso, que son también el filtro */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ESCALONES.map((e) => {
            const cuantos = conteos[e.key] ?? 0
            const elegido = escalon === e.key
            return (
              <Card
                key={e.key}
                onClick={() => setEscalon(elegido ? null : e.key)}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-sm',
                  elegido && 'ring-primary/40 ring-2'
                )}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <span className={cn('h-10 w-1.5 shrink-0 rounded-full', e.fondo)} />
                  <div>
                    <p className={cn('text-2xl font-bold', cuantos > 0 && e.tono)}>{cuantos}</p>
                    <p className="text-muted-foreground text-[12px]">{e.label}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Tabs defaultValue="agenda" className="mt-6">
          <TabsList>
            <TabsTrigger value="agenda">Qué vence</TabsTrigger>
            <TabsTrigger value="equipos">Equipos</TabsTrigger>
            <TabsTrigger value="flota">Flota</TabsTrigger>
          </TabsList>

          {/* ─── Agenda unificada ─────────────────────────────────────── */}
          <TabsContent value="agenda" className="mt-4 space-y-2">
            {/* De qué tipo: sin esto los PCI vencidos tapan los equipos,
                que son justamente lo que esta pantalla vigila. */}
            <div className="flex flex-wrap gap-2 pb-1">
              <Button
                size="sm"
                variant={origen === null ? 'default' : 'outline'}
                onClick={() => setOrigen(null)}
              >
                Todo · {filtradosTotal(vencimientos.data, escalon)}
              </Button>
              {(Object.keys(ORIGEN) as (keyof typeof ORIGEN)[]).map((k) => {
                const n = porOrigen[k] ?? 0
                if (!n) return null
                return (
                  <Button
                    key={k}
                    size="sm"
                    variant={origen === k ? 'default' : 'outline'}
                    onClick={() => setOrigen(origen === k ? null : k)}
                  >
                    {ORIGEN[k].label} · {n}
                  </Button>
                )
              })}
            </div>

            {vencimientos.isLoading && <SkeletonList rows={6} />}

            {!vencimientos.isLoading && visibles.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title="Nada por vencer en 30 días"
                description="Cuando algo entre en la ventana de aviso, aparecerá aquí."
              />
            )}

            {visibles.map((v: any) => {
              const origen = ORIGEN[v.origen as keyof typeof ORIGEN]
              const Icono = origen?.icon ?? ShieldAlert
              return (
                // Un vehículo aparece tres veces —SOAT, revisión y póliza—
                // con el mismo id: la fecha y el detalle son lo que distingue
                // cada fila.
                <Card key={`${v.origen}-${v.id}-${v.detalle}-${v.due_date}`}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <Icono className={cn('size-5 shrink-0', tonoDe(v.semaforo))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{v.titulo}</p>
                        <Badge variant="outline">{v.referencia}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[v.detalle, v.crew_name, fmtDate(v.due_date)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className={cn('text-sm font-semibold', tonoDe(v.semaforo))}>
                      {plazo(v.days_left)}
                    </p>
                    {v.origen === 'pci' && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/pci">Ver PCI</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {filtrados.length > visibles.length && (
              <div className="pt-2 text-center">
                <Button variant="outline" onClick={() => setCuantos((c) => c + 60)}>
                  Ver 60 más · quedan {filtrados.length - visibles.length}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ─── Equipos ──────────────────────────────────────────────── */}
          <TabsContent value="equipos" className="mt-4 space-y-2">
            {equipos.isLoading && <SkeletonList rows={6} />}

            {equipos.data?.map((e: any) => {
              const Icono = ICONO_EQUIPO[e.kind] ?? ShieldAlert
              return (
                <Card key={e.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <Icono className={cn('size-5 shrink-0', tonoDe(e.semaforo))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {TIPO_EQUIPO[e.kind] ?? 'Equipo'} {e.code}
                        </p>
                        {e.status === 'observado' && (
                          <Badge variant="warning">
                            {e.observaciones_abiertas} observación
                            {e.observaciones_abiertas === 1 ? '' : 'es'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[e.capacity, e.location, e.crew_name, e.holder_name]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className={cn('text-sm font-semibold', tonoDe(e.semaforo))}>
                        {plazo(e.days_left)}
                      </p>
                      <p className="text-muted-foreground text-[12px]">
                        Inspección: {plazo(e.check_days_left).toLowerCase()}
                      </p>
                    </div>

                    {can.manage && (
                      <Button size="sm" onClick={() => setRenovando(e)}>Renovar</Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {!equipos.isLoading && equipos.data?.length === 0 && (
              <EmptyState
                icon={FireExtinguisher}
                title="Sin equipos registrados"
                description="Registra los extintores, botiquines y kits del contrato para empezar a controlarlos."
              />
            )}
          </TabsContent>

          {/* ─── Flota ───────────────────────────────────────────────── */}
          <TabsContent value="flota" className="mt-4 space-y-2">
            {flota.isLoading && <SkeletonList rows={5} />}

            {flota.data?.map((v: any) => {
              const revisadoHoy = v.last_check_on === new Date().toISOString().slice(0, 10)
              return (
                <Card key={v.id}>
                  <CardContent className="flex flex-wrap items-start gap-4 p-4">
                    <Truck className={cn('mt-0.5 size-5 shrink-0', tonoDe(v.semaforo))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold tracking-tight">{v.plate}</p>
                        {revisadoHoy && (
                          <Badge variant="success">
                            <CircleCheck /> Revisado hoy
                          </Badge>
                        )}
                        {v.status !== 'operativo' && (
                          <Badge variant="warning">{v.status}</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        {[
                          TIPO_VEHICULO[v.kind] ?? 'Vehículo',
                          [v.brand, v.model].filter(Boolean).join(' '),
                          v.crew_name,
                          v.driver_name,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    {/* Los tres papeles, cada uno con su propio color */}
                    <div className="grid min-w-[260px] gap-0.5 text-[13px]">
                      <Papel titulo="SOAT" fecha={v.soat_expires_on} />
                      <Papel titulo="Revisión técnica" fecha={v.inspection_expires_on} />
                      <Papel titulo="Póliza" fecha={v.policy_expires_on} />
                      {v.km_to_service != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Servicio</span>
                          <span className={cn(v.km_to_service <= 1000 && 'text-sem-ambar')}>
                            {v.km_to_service <= 0
                              ? 'Vencido por kilometraje'
                              : `Faltan ${new Intl.NumberFormat('es-PE').format(v.km_to_service)} km`}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {!flota.isLoading && flota.data?.length === 0 && (
              <EmptyState
                icon={Truck}
                title="Sin vehículos registrados"
                description="Registra la flota para controlar SOAT, revisión técnica y póliza."
              />
            )}
          </TabsContent>
        </Tabs>
      </PageBody>

      <RenovarDialog
        equipo={renovando}
        profileId={profile.id}
        onClose={() => setRenovando(null)}
        onHecho={() => { setRenovando(null); refrescar() }}
      />
    </>
  )
}

/** Una línea por papel del vehículo, con su fecha y su color. */
function Papel({ titulo, fecha }: { titulo: string; fecha: string | null }) {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const dias = Math.round((new Date(fecha + 'T00:00:00').getTime() - hoy.getTime()) / 86400000)
  const semaforo =
    dias < 0 ? 'vencido' : dias <= 7 ? 'rojo' : dias <= 15 ? 'ambar' : dias <= 30 ? 'verde' : 'ok'
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{titulo}</span>
      <span className={cn('font-medium', tonoDe(semaforo))}>{plazo(dias)}</span>
    </div>
  )
}

/**
 * Renovar un equipo.
 *
 * Recargar un extintor o reponer un botiquín mueve dos fechas y cierra las
 * observaciones abiertas: si solo se cambiara la fecha, el equipo seguiría
 * marcado como observado para siempre.
 */
function RenovarDialog({
  equipo,
  profileId,
  onClose,
  onHecho,
}: {
  equipo: any
  profileId: string
  onClose: () => void
  onHecho: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [vence, setVence] = React.useState('')
  const [revision, setRevision] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => {
    if (!equipo) return
    // Lo habitual: recarga anual, inspección trimestral
    const hoy = new Date()
    const enMeses = (m: number) => {
      const d = new Date(hoy)
      d.setMonth(d.getMonth() + m)
      return d.toISOString().slice(0, 10)
    }
    setVence(enMeses(12))
    setRevision(enMeses(3))
  }, [equipo?.id])

  if (!equipo) return null

  const renovar = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
      toast.error('La fecha de vencimiento va como 2027-09-22')
      return
    }
    setEnviando(true)
    const { error } = await sb
      .from('safety_equipment')
      .update({
        expires_on: vence,
        next_check_on: /^\d{4}-\d{2}-\d{2}$/.test(revision) ? revision : null,
        status: 'operativo',
        updated_at: new Date().toISOString(),
      })
      .eq('id', equipo.id)

    if (error) { toast.error(error.message); setEnviando(false); return }

    // Las observaciones quedan cerradas: el equipo se renovó
    await sb
      .from('safety_equipment_checks')
      .update({ conforme: true })
      .eq('equipment_id', equipo.id)
      .eq('conforme', false)

    setEnviando(false)
    toast.success('Equipo renovado')
    onHecho()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Renovar {TIPO_EQUIPO[equipo.kind] ?? 'equipo'} {equipo.code}
          </DialogTitle>
          <DialogDescription>
            {[equipo.capacity, equipo.location, equipo.crew_name].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <Field label="Nueva fecha de vencimiento" hint="Recarga o caducidad del contenido">
          <Input value={vence} onChange={(e) => setVence(e.target.value)} placeholder="2027-09-22" />
        </Field>

        <Field label="Próxima inspección" hint="Deja vacío si no aplica">
          <Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="2026-12-22" />
        </Field>

        {equipo.observaciones_abiertas > 0 && (
          <p className="text-muted-foreground text-[13px]">
            Al renovar se dan por levantadas sus {equipo.observaciones_abiertas} observación
            {equipo.observaciones_abiertas === 1 ? '' : 'es'}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={enviando} onClick={renovar}>Renovar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
