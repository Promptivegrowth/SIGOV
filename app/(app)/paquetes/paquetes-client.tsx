'use client'

import * as React from 'react'
import {
  PackageCheck, FolderTree, FileText, Camera, TriangleAlert, ShieldCheck, Calculator,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { Checkbox, Progress } from '@/components/ui/primitives'
import { armarPaquete, CARPETAS, nombreSeguro, type AvancePaquete } from '@/lib/paquete'
import { cn, toISODate } from '@/lib/utils'
import { toast } from 'sonner'

/** Lo que puede entrar al paquete, en el orden de las carpetas. */
const PARTES = [
  {
    clave: 'partes' as const,
    carpeta: CARPETAS.partes,
    icono: FileText,
    titulo: 'Partes diarios',
    detalle: 'Un PDF por cada parte del periodo, con sus actividades y metrados',
  },
  {
    clave: 'fotos' as const,
    carpeta: CARPETAS.fotos,
    icono: Camera,
    titulo: 'Panel fotográfico',
    detalle: 'Las evidencias selladas, en carpetas por día',
  },
  {
    clave: 'pci' as const,
    carpeta: CARPETAS.pci,
    icono: TriangleAlert,
    titulo: 'PCI',
    detalle: 'Consolidado de ítems con su plazo, estado y evidencia',
  },
  {
    clave: 'ssoma' as const,
    carpeta: CARPETAS.ssoma,
    icono: ShieldCheck,
    titulo: 'SSOMA',
    detalle: 'Charlas con asistencia, equipos de seguridad y flota',
  },
  {
    clave: 'valorizacion' as const,
    carpeta: CARPETAS.valorizacion,
    icono: Calculator,
    titulo: 'Valorización',
    detalle: 'Metrados acumulados por partida en el periodo',
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
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])

  const hoy = React.useMemo(() => toISODate(new Date()), [])
  const haceUnMes = React.useMemo(
    () => toISODate(new Date(Date.now() - 30 * 86400000)),
    []
  )

  const [desde, setDesde] = React.useState(haceUnMes)
  const [hasta, setHasta] = React.useState(hoy)
  const [contenido, setContenido] = React.useState({
    partes: true,
    fotos: true,
    pci: true,
    ssoma: true,
    valorizacion: true,
  })
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
        contenido,
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
            {PARTES.map((p) => {
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
{`ENTREGA_${desde}_a_${hasta}.zip
├── ${CARPETAS.partes}/
├── ${CARPETAS.fotos}/
│   └── (una carpeta por día)
├── ${CARPETAS.pci}/
├── ${CARPETAS.ssoma}/
├── ${CARPETAS.valorizacion}/
└── INDICE.xlsx`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  )
}
