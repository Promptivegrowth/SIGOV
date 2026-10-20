'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderTree, Download } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { Checkbox, Progress } from '@/components/ui/primitives'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { armarEstructuraCovinca, estimarFotos, type AvanceCovinca, type RamasCovinca } from '@/lib/estructura-covinca'
import { mensajeAmigable } from '@/lib/errores'

const TODAS = '__todas__'

const RAMAS: { clave: keyof RamasCovinca; titulo: string; ruta: string }[] = [
  { clave: 'programacion', titulo: 'Programación semanal (formato PS-ST04)', ruta: '…/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/CUADRILLA_n_SEDE/' },
  { clave: 'materiales', titulo: 'Seguimiento diario de materiales (Formato 8)', ruta: '…/SEGUIMIENTO_DIARIO_DE_MATERIALES/<mes>/' },
  { clave: 'rutinario', titulo: 'Fotos del día por cuadrilla', ruta: 'MANTENIMIENTO_RUTINARIO/<mes>/CUADRILLA_n_SEDE/<DD>/' },
  { clave: 'niveles', titulo: 'Niveles de servicio por sector y actividad', ruta: '…/NIVELES_DE_SERVICIO_<mes>/SECTOR_…/<CARPETA>/' },
  { clave: 'reportes', titulo: 'Reportes diarios en PDF', ruta: '…/REPORTES_DIARIOS_CHARLAS_ATS/…/REPORTE_DIARIO/' },
  { clave: 'documentos', titulo: 'ATS, charla y checklist vehicular (fotos)', ruta: '…/REPORTES_DIARIOS_CHARLAS_ATS/…/' },
  { clave: 'pci', titulo: 'PCI por plazo e ítem (solo ítems con fotos)', ruta: 'PCI/PCI_n/<plazo>/ITEM_n/ITEM_n(k).jpg' },
]

/** Primer y último día de un mes AAAA-MM, o de una de sus quincenas. */
function rangoDelMes(mes: string, parte: Periodo = 'mes') {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const [d1, d2] = parte === 'q1' ? [1, 15] : parte === 'q2' ? [16, ultimo] : [1, ultimo]
  const dd = (d: number) => String(d).padStart(2, '0')
  return { desde: `${mes}-${dd(d1)}`, hasta: `${mes}-${dd(d2)}` }
}

type Periodo = 'mes' | 'q1' | 'q2'

/** Desde aquí el navegador puede quedarse sin memoria al armar el ZIP. */
const LIMITE_RECOMENDADO = 1.5e9

const gb = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`

/**
 * La entrega con la estructura documental que aprobó COVINCA (ZIP de Elvis):
 * las mismas carpetas y nombres, armados solos desde lo registrado.
 */
export function EntregaCovinca() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [mes, setMes] = React.useState(() => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7))
  const [cuadrilla, setCuadrilla] = React.useState(TODAS)
  const [periodo, setPeriodo] = React.useState<Periodo>('mes')
  const [ramas, setRamas] = React.useState<RamasCovinca>({ programacion: true, materiales: true, rutinario: true, niveles: true, reportes: true, documentos: true, pci: true })
  const [avance, setAvance] = React.useState<AvanceCovinca | null>(null)

  const cuadrillas = useQuery({
    queryKey: ['covinca-cuadrillas', service.id],
    queryFn: async () => {
      const { data, error } = await sb.from('crews').select('id, code, name, numero, sede')
        .eq('service_id', service.id).is('deleted_at', null).order('numero')
      if (error) throw error
      return data ?? []
    },
  })

  // Cuánto pesarán las fotos (OBS-23: los originales JPG pesan ~3 MB)
  const conFotos = ramas.rutinario || ramas.niveles || ramas.pci
  const estimado = useQuery({
    queryKey: ['covinca-estimado', service.id, mes, periodo, cuadrilla],
    enabled: conFotos && /^\d{4}-\d{2}$/.test(mes),
    queryFn: () => estimarFotos({
      sb, servicioId: service.id, ...rangoDelMes(mes, periodo),
      cuadrillaId: cuadrilla === TODAS ? null : cuadrilla,
    }),
  })
  const muyGrande = conFotos && (estimado.data?.bytes ?? 0) > LIMITE_RECOMENDADO

  const armar = async () => {
    if (!Object.values(ramas).some(Boolean)) { toast.error('Elige al menos una carpeta'); return }
    const { desde, hasta } = rangoDelMes(mes, periodo)
    setAvance({ paso: 'Preparando', hechos: 0, total: 1 })
    try {
      const zip = await armarEstructuraCovinca({
        sb, servicioId: service.id, servicioNombre: service.name,
        cliente: service.client_name, contrato: service.contract_code,
        desde, hasta, cuadrillaId: cuadrilla === TODAS ? null : cuadrilla,
        ramas, generadoPor: profile.full_name, alAvanzar: setAvance,
      })
      const url = URL.createObjectURL(zip)
      const a = document.createElement('a')
      a.href = url
      a.download = `SERVICON_COVINCA_${mes}${periodo === 'mes' ? '' : periodo === 'q1' ? '_01-15' : '_16-fin'}${cuadrilla === TODAS ? '' : '_' + (cuadrillas.data?.find((c: any) => c.id === cuadrilla)?.code ?? '')}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Entrega lista', { description: `${(zip.size / 1048576).toFixed(1)} MB · revisa el INDICE.xlsx` })
    } catch (e: any) {
      toast.error('No se pudo armar la entrega', { description: mensajeAmigable(e, 'Inténtalo de nuevo.') })
    } finally {
      setAvance(null)
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <FolderTree className="size-4" />
          Entrega con la estructura COVINCA
        </CardTitle>
        <CardDescription className="text-[12px]">
          Las carpetas y nombres de archivo que aprobó COVINCA, armados solos desde lo
          registrado. Las fotos salen en JPG de 4080 × 3060 (el original del celular cuando
          lo hay); los ítems PCI solo aparecen si tienen fotos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Field>
          <Field label="Período">
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mes completo</SelectItem>
                <SelectItem value="q1">Del 1 al 15</SelectItem>
                <SelectItem value="q2">Del 16 a fin de mes</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cuadrilla">
            <Select value={cuadrilla} onValueChange={setCuadrilla}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Las 7 cuadrillas</SelectItem>
                {(cuadrillas.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero ? `CUADRILLA_${c.numero}_${c.sede}` : c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="space-y-2">
          {RAMAS.map((r) => (
            <label key={r.clave} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={ramas[r.clave]}
                onCheckedChange={(v) => setRamas((x) => ({ ...x, [r.clave]: v === true }))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{r.titulo}</span>
                <span className="text-muted-foreground block truncate font-mono text-[11px]">{r.ruta}</span>
              </span>
            </label>
          ))}
        </div>

        {conFotos && estimado.data && (
          <p className={muyGrande ? 'text-destructive text-[12.5px]' : 'text-muted-foreground text-[12.5px]'}>
            {estimado.data.fotos === 0
              ? 'Sin fotos en ese período.'
              : `≈ ${estimado.data.fotos.toLocaleString('es-PE')} fotos (${estimado.data.conOriginal.toLocaleString('es-PE')} con original) · ${gb(estimado.data.bytes)}.`}
            {muyGrande && ' Es mucho para armarlo de una vez en el navegador: elige una cuadrilla o una quincena.'}
          </p>
        )}

        {avance && (
          <div className="space-y-1.5">
            <div className="text-muted-foreground flex justify-between text-[12px]">
              <span>{avance.paso}</span>
              <span>{avance.total > 1 ? `${avance.hechos} de ${avance.total}` : ''}</span>
            </div>
            <Progress value={avance.total ? (avance.hechos / avance.total) * 100 : 0} />
          </div>
        )}

        <Button onClick={armar} loading={!!avance} className="w-full">
          <Download className="size-4" />
          {muyGrande ? 'Armar de todas formas' : `Descargar la entrega de ${mes}`}
        </Button>
      </CardContent>
    </Card>
  )
}
