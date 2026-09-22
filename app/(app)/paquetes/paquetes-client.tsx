'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PackageCheck, FolderTree, FileText, Camera, TriangleAlert, ShieldCheck, Calculator,
  CalendarRange, Package, Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { Checkbox, Progress } from '@/components/ui/primitives'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { armarPaquete, CARPETAS, nombreSeguro, type AvancePaquete } from '@/lib/paquete'
import { cn, toISODate } from '@/lib/utils'
import { toast } from 'sonner'

/** El valor de «sin filtrar»: Radix no admite un SelectItem de valor vacío. */
const TODO = '__todo__'

/** Lo que puede entrar al paquete, en el orden del apartado 12.3. */
const PARTES = [
  {
    clave: 'programacion' as const,
    carpeta: CARPETAS.programacion,
    icono: CalendarRange,
    titulo: 'Programación',
    detalle: 'Las partidas del periodo con su meta, lo ejecutado y su estado',
    soloAdmin: false,
  },
  {
    clave: 'partes' as const,
    carpeta: CARPETAS.partes,
    icono: FileText,
    titulo: 'Reportes diarios',
    detalle: 'Un PDF por cada parte del periodo, con sus actividades y metrados',
    soloAdmin: false,
  },
  {
    clave: 'pci' as const,
    carpeta: CARPETAS.pci,
    icono: TriangleAlert,
    titulo: 'PCI',
    detalle: 'Consolidado de ítems con su plazo, estado y evidencia',
    soloAdmin: false,
  },
  {
    clave: 'fotos' as const,
    carpeta: CARPETAS.fotos,
    icono: Camera,
    titulo: 'Fotografías',
    detalle: 'Las evidencias selladas, en carpetas por día',
    soloAdmin: false,
  },
  {
    clave: 'ssoma' as const,
    carpeta: CARPETAS.ssoma,
    icono: ShieldCheck,
    titulo: 'SSOMA',
    detalle: 'Charlas con asistencia, equipos de seguridad y flota',
    soloAdmin: false,
  },
  {
    clave: 'materiales' as const,
    carpeta: CARPETAS.materiales,
    icono: Package,
    titulo: 'Materiales',
    detalle: 'Solicitudes de insumos con su estado de atención',
    soloAdmin: false,
  },
  {
    clave: 'inventario' as const,
    carpeta: CARPETAS.inventario,
    icono: Calculator,
    titulo: 'Inventario',
    detalle: 'Metrados acumulados por partida en el periodo',
    soloAdmin: false,
  },
  {
    // «COVINCA no debe visualizar información económica interna» (15.1)
    clave: 'gastos' as const,
    carpeta: CARPETAS.gastos,
    icono: Wallet,
    titulo: 'Gastos',
    detalle: 'Movimientos de caja chica. Solo en el paquete del Administrador',
    soloAdmin: true,
  },
]


/**
 * Paquete de entrega.
 *
 * Lo que antes tomaba media jornada la noche anterior: juntar partes, fotos,
 * PCI y registros de SSOMA en una carpeta y mandarla al cliente. Aquí se arma
 * solo desde lo registrado, con la estructura que el cliente espera y un
 * índice que declara qué contiene.
 */
export function PaquetesClient() {
  const { service, profile, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])

  const hoy = React.useMemo(() => toISODate(new Date()), [])
  const haceUnMes = React.useMemo(
    () => toISODate(new Date(Date.now() - 30 * 86400000)),
    []
  )

  const [desde, setDesde] = React.useState(haceUnMes)
  const [hasta, setHasta] = React.useState(hoy)
  const [contenido, setContenido] = React.useState({
    programacion: true,
    partes: true,
    pci: true,
    fotos: true,
    ssoma: true,
    materiales: true,
    inventario: true,
    // Los gastos solo entran si quien arma el paquete es el Administrador
    gastos: can.admin,
  })

  // Los filtros del apartado 12.2, además del periodo
  const [sector, setSector] = React.useState(TODO)
  const [cuadrillaId, setCuadrillaId] = React.useState(TODO)
  const [tramoId, setTramoId] = React.useState(TODO)
  const [progDesde, setProgDesde] = React.useState('')
  const [progHasta, setProgHasta] = React.useState('')
  const [planId, setPlanId] = React.useState(TODO)
  const [pciId, setPciId] = React.useState(TODO)
  const [actividadId, setActividadId] = React.useState(TODO)

  const catalogos = useQuery({
    queryKey: ['paquete-catalogos', service.id],
    queryFn: async () => {
      const [cuadrillas, tramos, actividades, semanas, pcis] = await Promise.all([
        sb.from('crews').select('id, code, name').eq('service_id', service.id)
          .is('deleted_at', null).eq('is_active', true).order('code'),
        sb.from('road_sections').select('id, code, name, route_code')
          .eq('service_id', service.id)
          .is('deleted_at', null).eq('is_active', true).order('code'),
        sb.from('activities_catalog').select('id, name').eq('service_id', service.id)
          .is('deleted_at', null).eq('is_active', true).order('name'),
        sb.from('weekly_plans').select('id, year, week, starts_on, ends_on')
          .eq('service_id', service.id).is('deleted_at', null)
          .order('starts_on', { ascending: false }).limit(60),
        sb.from('pcis').select('id, code, title').eq('service_id', service.id)
          .is('deleted_at', null).order('code').limit(300),
      ])
      return {
        cuadrillas: cuadrillas.data ?? [],
        tramos: tramos.data ?? [],
        actividades: actividades.data ?? [],
        semanas: semanas.data ?? [],
        pcis: pcis.data ?? [],
      }
    },
    staleTime: 10 * 60_000,
  })

  // Los sectores salen del código de ruta de los tramos: es lo que los agrupa
  const sectores = React.useMemo(
    () => [...new Set((catalogos.data?.tramos ?? [])
      .map((t: any) => t.route_code).filter(Boolean))].sort(),
    [catalogos.data]
  )

  // Elegido un sector, solo se ofrecen sus tramos
  const tramosVisibles = React.useMemo(
    () => (catalogos.data?.tramos ?? []).filter(
      (t: any) => sector === TODO || t.route_code === sector
    ),
    [catalogos.data, sector]
  )

  /** Qué tramos entran: el elegido, los del sector, o todos. */
  const tramosDelPaquete = (): string[] | null => {
    if (tramoId !== TODO) return [tramoId]
    if (sector !== TODO) return tramosVisibles.map((t: any) => t.id)
    return null
  }
  const [armando, setArmando] = React.useState(false)
  const [avance, setAvance] = React.useState<AvancePaquete | null>(null)

  const nadaElegido = !Object.values(contenido).some(Boolean)

  const generar = async () => {
    if (desde > hasta) {
      toast.error('La fecha de inicio va antes que la de fin')
      return
    }
    setArmando(true)
    setAvance({ paso: 'Preparando', hechos: 0, total: 1 })

    try {
      const zip = await armarPaquete({
        sb,
        servicioId: service.id,
        servicioNombre: service.name,
        cliente: service.client_name,
        contrato: service.contract_code,
        desde,
        hasta,
        contenido: { ...contenido, gastos: contenido.gastos && can.admin },
        filtros: {
          tramoIds: tramosDelPaquete(),
          cuadrillaId: cuadrillaId === TODO ? null : cuadrillaId,
          actividadId: actividadId === TODO ? null : actividadId,
          progDesde: progDesde.trim() ? Number(progDesde) * 1000 : null,
          progHasta: progHasta.trim() ? Number(progHasta) * 1000 : null,
          planId: planId === TODO ? null : planId,
          pciId: pciId === TODO ? null : pciId,
        },
        generadoPor: profile.full_name,
        alAvanzar: setAvance,
      })

      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nombreSeguro(service.code ?? 'SIGOV', 12)}_ENTREGA_${desde}_a_${hasta}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success('Paquete listo', {
        description: `${(zip.size / 1048576).toFixed(1)} MB · revisa el INDICE.xlsx`,
      })
    } catch (e: any) {
      toast.error('No se pudo armar el paquete', { description: e?.message })
    } finally {
      setArmando(false)
      setAvance(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Paquete de entrega"
        description="Arma el ZIP con la estructura de carpetas que espera el cliente y su índice en Excel"
        icon={PackageCheck}
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {PARTES.filter((p) => !p.soloAdmin || can.admin).map((p) => {
              const elegido = contenido[p.clave]
              return (
                <Card
                  key={p.clave}
                  onClick={() =>
                    setContenido((c) => ({ ...c, [p.clave]: !c[p.clave] }))
                  }
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-sm',
                    elegido && 'ring-primary/30 ring-2'
                  )}
                >
                  <CardContent className="flex items-start gap-4 p-4">
                    <Checkbox checked={elegido} className="mt-1" />
                    <p.icono className="text-primary mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.titulo}</p>
                      <p className="text-muted-foreground text-[13px]">{p.detalle}</p>
                    </div>
                    <code className="text-muted-foreground shrink-0 text-[11px]">
                      {p.carpeta}
                    </code>
                  </CardContent>
                </Card>
              )
            })}

            <Card>
              <CardContent className="flex items-start gap-4 p-4">
                <FolderTree className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">INDICE.xlsx</p>
                  <p className="text-muted-foreground text-[13px]">
                    Va siempre. Declara qué contiene el paquete, archivo por archivo,
                    con su tipo, fecha y peso. Es el cargo de recepción.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <Field label="Desde">
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </Field>
                <Field label="Hasta">
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </Field>

                {/* Los filtros del apartado 12.2. Sin elegir, entra todo. */}
                {sectores.length > 1 && (
                  <Field label="Sector">
                    <Select value={sector} onValueChange={(v) => { setSector(v); setTramoId(TODO) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODO}>Todos los sectores</SelectItem>
                        {sectores.map((r: any) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field label="Cuadrilla">
                  <Select value={cuadrillaId} onValueChange={setCuadrillaId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODO}>Todas las cuadrillas</SelectItem>
                      {(catalogos.data?.cuadrillas ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Tramo">
                  <Select value={tramoId} onValueChange={setTramoId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODO}>Todos los tramos</SelectItem>
                      {tramosVisibles.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.code} · {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {/* El subtramo se nombra por progresivas, como en campo */}
                <Field label="Subtramo (km)" hint="Vacío: el tramo entero">
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.1" inputMode="decimal" placeholder="Desde"
                      value={progDesde} onChange={(e) => setProgDesde(e.target.value)} />
                    <span className="text-muted-foreground text-[12px]">a</span>
                    <Input type="number" step="0.1" inputMode="decimal" placeholder="Hasta"
                      value={progHasta} onChange={(e) => setProgHasta(e.target.value)} />
                  </div>
                </Field>

                <Field label="Programación">
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODO}>Toda la del periodo</SelectItem>
                      {(catalogos.data?.semanas ?? []).map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>
                          Semana {w.week} · {w.year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="PCI">
                  <Select value={pciId} onValueChange={setPciId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODO}>Todos los PCI</SelectItem>
                      {(catalogos.data?.pcis ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Actividad">
                  <Select value={actividadId} onValueChange={setActividadId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODO}>Toda actividad</SelectItem>
                      {(catalogos.data?.actividades ?? []).map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={armando || nadaElegido}
                  onClick={generar}
                >
                  <PackageCheck />
                  {armando ? 'Armando…' : 'Armar paquete'}
                </Button>

                {nadaElegido && (
                  <p className="text-muted-foreground text-[13px]">
                    Elige al menos una sección.
                  </p>
                )}

                {avance && (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium">{avance.paso}</p>
                    <Progress
                      value={avance.total ? (avance.hechos / avance.total) * 100 : 0}
                    />
                    <p className="text-muted-foreground text-[12px]">
                      {avance.hechos} de {avance.total}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-[13px] font-medium">Cómo queda</p>
                <pre className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
{[
  `ENTREGA_${desde}_a_${hasta}.zip`,
  ...PARTES.filter((p) => contenido[p.clave] && (!p.soloAdmin || can.admin)).map(
    (p) => `├── ${p.carpeta}/`
  ),
  '└── INDICE.xlsx',
].join(String.fromCharCode(10))}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  )
}
