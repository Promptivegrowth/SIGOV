'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Save, X, Loader2, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/primitives'
import { ASSET_CONDITION } from '@/lib/constants'
import { cn, parseProgresiva, fmtProgresiva, toISODate } from '@/lib/utils'
import { getGpsFix } from '@/lib/camera'
import { toast } from 'sonner'

/**
 * Alta y edición de un elemento del inventario vial.
 *
 * Cada tipo de elemento trae su propio juego de atributos técnicos declarado
 * en `asset_types.schema`, así que el formulario se arma solo: una alcantarilla
 * pide diámetro y obstrucción, una señal pide su código MTC y su
 * retroreflectividad. Añadir un tipo nuevo no exige tocar esta pantalla.
 */
export function AssetForm({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing?: any
  onSaved?: () => void
}) {
  const { service, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [typeId, setTypeId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [prog, setProg] = React.useState('')
  const [side, setSide] = React.useState('derecho')
  const [condition, setCondition] = React.useState('no_evaluado')
  const [installYear, setInstallYear] = React.useState('')
  const [lastInspected, setLastInspected] = React.useState('')
  const [nextInspection, setNextInspection] = React.useState('')
  const [lat, setLat] = React.useState('')
  const [lng, setLng] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [attrs, setAttrs] = React.useState<Record<string, any>>({})
  const [saving, setSaving] = React.useState(false)
  const [gpsBusy, setGpsBusy] = React.useState(false)
  const [codeBusy, setCodeBusy] = React.useState(false)

  const catalogos = useQuery({
    queryKey: ['asset-form-catalogos', service.id],
    enabled: open,
    queryFn: async () => {
      const [tipos, tramos] = await Promise.all([
        sb.from('asset_types').select('id, code, name, category, color, schema').eq('is_active', true).order('name'),
        sb.from('road_sections').select('id, code, name, prog_start_m, prog_end_m')
          .eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      return { tipos: tipos.data ?? [], tramos: tramos.data ?? [] }
    },
    staleTime: 5 * 60_000,
  })

  const tipo = catalogos.data?.tipos.find((t: any) => t.id === typeId)
  const esquema: any[] = Array.isArray(tipo?.schema) ? tipo.schema : []

  // ── Precarga ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setTypeId(editing.type_id ?? '')
      setSectionId(editing.section_id ?? '')
      setCode(editing.code ?? '')
      setName(editing.name ?? '')
      setProg(editing.progresiva_m != null ? fmtProgresiva(editing.progresiva_m) : '')
      setSide(editing.side ?? 'derecho')
      setCondition(editing.condition ?? 'no_evaluado')
      setInstallYear(editing.install_year ? String(editing.install_year) : '')
      setLastInspected(editing.last_inspected_on ?? '')
      setNextInspection(editing.next_inspection_on ?? '')
      setLat(editing.lat != null ? String(editing.lat) : '')
      setLng(editing.lng != null ? String(editing.lng) : '')
      setNotes(editing.notes ?? '')
      setAttrs(editing.attributes ?? {})
    } else {
      setTypeId(''); setSectionId(''); setCode(''); setName(''); setProg('')
      setSide('derecho'); setCondition('no_evaluado'); setInstallYear('')
      setLastInspected(toISODate(new Date())); setNextInspection('')
      setLat(''); setLng(''); setNotes(''); setAttrs({})
    }
  }, [open, editing])

  // ── Código sugerido ───────────────────────────────────────────────────
  const sugerirCodigo = React.useCallback(async () => {
    if (!typeId) return
    setCodeBusy(true)
    const { data } = await sb.rpc('next_asset_code', {
      p_service_id: service.id,
      p_section_id: sectionId || null,
      p_type_id: typeId,
    })
    setCodeBusy(false)
    if (data) setCode(String(data))
  }, [sb, service.id, sectionId, typeId])

  React.useEffect(() => {
    if (!open || editing || !typeId) return
    void sugerirCodigo()
  }, [open, editing, typeId, sectionId, sugerirCodigo])

  // ── Tomar la ubicación aquí mismo ─────────────────────────────────────
  const tomarGps = async () => {
    setGpsBusy(true)
    try {
      const fix = await getGpsFix()
      setLat(fix.lat.toFixed(6))
      setLng(fix.lng.toFixed(6))

      if (!sectionId) {
        toast.success('Ubicación tomada', {
          description: `Precisión ±${fix.accuracy.toFixed(0)} m · elige el tramo para la progresiva`,
        })
        return
      }

      const { data } = await sb.rpc('progresiva_con_distancia', {
        p_section_id: sectionId, p_lng: fix.lng, p_lat: fix.lat,
      })
      const r = data as any

      if (!r || r.sin_trazo) {
        toast.warning('Ese tramo todavía no tiene su trazo cargado', {
          description: 'Escribe la progresiva a mano, o cárgale el trazo en Configuración.',
        })
        return
      }
      // Estar lejos del tramo no puede traducirse en una progresiva inventada
      if (Number(r.distancia_m) > 300) {
        const km = (Number(r.distancia_m) / 1000).toFixed(1)
        toast.warning(`Estás a ${km} km de ese tramo`, {
          description: 'No se calculó la progresiva: revisa el tramo elegido o escríbela a mano.',
        })
        return
      }

      setProg(fmtProgresiva(Number(r.progresiva_m)))
      toast.success(`Progresiva ${fmtProgresiva(Number(r.progresiva_m))}`, {
        description: `A ${Math.round(Number(r.distancia_m))} m del eje · GPS ±${fix.accuracy.toFixed(0)} m`,
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo obtener la ubicación')
    } finally {
      setGpsBusy(false)
    }
  }

  const guardar = async () => {
    if (!typeId) { toast.error('Elige el tipo de elemento'); return }
    if (!sectionId) { toast.error('Elige el tramo'); return }
    if (!code.trim()) { toast.error('El código es obligatorio'); return }

    const progM = prog ? parseProgresiva(prog) : null
    if (prog && progM == null) {
      toast.error('Progresiva no válida. Usa el formato 12+450')
      return
    }

    // La progresiva debe caer dentro del tramo elegido
    const tramo = catalogos.data?.tramos.find((t: any) => t.id === sectionId)
    if (progM != null && tramo && (progM < tramo.prog_start_m - 50 || progM > tramo.prog_end_m + 50)) {
      toast.error(
        `La progresiva está fuera del tramo`,
        { description: `${tramo.name} va de ${fmtProgresiva(tramo.prog_start_m)} a ${fmtProgresiva(tramo.prog_end_m)}` }
      )
      return
    }

    setSaving(true)
    const payload: any = {
      service_id: service.id,
      type_id: typeId,
      section_id: sectionId,
      code: code.trim(),
      name: name.trim() || null,
      progresiva_m: progM,
      side,
      condition,
      install_year: installYear ? Number(installYear) : null,
      last_inspected_on: lastInspected || null,
      next_inspection_on: nextInspection || null,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      notes: notes.trim() || null,
      attributes: attrs,
    }

    const { error } = editing
      ? await sb.from('road_assets').update(payload).eq('id', editing.id)
      : await sb.from('road_assets').insert({ ...payload, created_by: profile.id })

    setSaving(false)
    if (error) {
      toast.error(
        error.message.includes('duplicate') || error.message.includes('road_assets_service_id_code_key')
          ? `Ya existe un elemento con el código ${code.trim()}`
          : error.message
      )
      return
    }

    toast.success(editing ? 'Elemento actualizado' : 'Elemento registrado')
    qc.invalidateQueries({ queryKey: ['assets'] })
    qc.invalidateQueries({ queryKey: ['mapa'] })
    onSaved?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar elemento vial' : 'Nuevo elemento vial'}</DialogTitle>
          <DialogDescription>
            Alcantarillas, guardavías, señales, postes SOS y demás elementos del
            corredor. Se ubican por tramo y progresiva, y aparecen en el mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
          <Field label="Tipo de elemento" required className="sm:col-span-2">
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona el tipo…" /></SelectTrigger>
              <SelectContent>
                {(catalogos.data?.tipos ?? []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: t.color }} />
                      {t.name}
                      <span className="text-muted-foreground text-[11px]">· {t.category}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tramo" required>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona el tramo…" /></SelectTrigger>
              <SelectContent>
                {(catalogos.data?.tramos ?? []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.code} · {t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Código" required hint={editing ? undefined : 'Se sugiere solo según tramo y tipo'}>
            <div className="flex gap-1.5">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="T-01-ALC-043" className="h-10 font-mono" />
              {!editing && (
                <Button variant="outline" size="icon-lg" onClick={sugerirCodigo} loading={codeBusy} title="Sugerir código">
                  <Loader2 className={cn('size-4', !codeBusy && 'hidden')} />
                  {!codeBusy && <span className="text-[11px] font-bold">N°</span>}
                </Button>
              )}
            </div>
          </Field>

          <Field label="Nombre o denominación" className="sm:col-span-2" hint="Si lo dejas vacío se usa el tipo y la progresiva">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alcantarilla 18+320" className="h-10" />
          </Field>

          <Field label="Progresiva" hint="Formato km+m, por ejemplo 18+320">
            <div className="flex gap-1.5">
              <Input value={prog} onChange={(e) => setProg(e.target.value)} placeholder="18+320" className="h-10 font-mono" />
              <Button variant="outline" size="icon-lg" onClick={tomarGps} loading={gpsBusy} title="Tomar mi ubicación">
                <MapPin className="size-4" />
              </Button>
            </div>
          </Field>

          <Field label="Lado de la vía">
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['derecho', 'izquierdo', 'ambos', 'eje'].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Estado de conservación">
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ASSET_CONDITION).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: v.dot }} />
                      {v.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Año de instalación">
            <Input type="number" min={1950} max={2100} value={installYear}
              onChange={(e) => setInstallYear(e.target.value)} placeholder="2018" className="h-10" />
          </Field>

          <Field label="Última inspección">
            <Input type="date" value={lastInspected} onChange={(e) => setLastInspected(e.target.value)} className="h-10" />
          </Field>

          <Field label="Próxima inspección">
            <Input type="date" value={nextInspection} onChange={(e) => setNextInspection(e.target.value)} className="h-10" />
          </Field>

          <Field label="Latitud">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-10.671200" className="h-10 font-mono" />
          </Field>
          <Field label="Longitud">
            <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-77.790200" className="h-10 font-mono" />
          </Field>

          {/* ── Atributos propios del tipo ───────────────────────────── */}
          {esquema.length > 0 && (
            <div className="border-border mt-1 border-t pt-3 sm:col-span-2">
              <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-wide uppercase">
                Atributos técnicos de {tipo?.name?.toLowerCase()}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {esquema.map((campo: any) => (
                  <Field key={campo.key} label={campo.label} className={campo.type === 'bool' ? 'sm:col-span-2' : ''}>
                    {campo.type === 'select' ? (
                      <Select
                        value={String(attrs[campo.key] ?? '')}
                        onValueChange={(v) => setAttrs((a) => ({ ...a, [campo.key]: v }))}
                      >
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                        <SelectContent>
                          {(campo.options ?? []).map((o: string) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : campo.type === 'bool' ? (
                      <label className="bg-muted/40 flex h-10 cursor-pointer items-center justify-between rounded-lg px-3">
                        <span className="text-[13px] font-medium">{campo.label}</span>
                        <Switch
                          checked={!!attrs[campo.key]}
                          onCheckedChange={(v) => setAttrs((a) => ({ ...a, [campo.key]: v }))}
                        />
                      </label>
                    ) : (
                      <Input
                        type={campo.type === 'number' ? 'number' : 'text'}
                        step="any"
                        value={attrs[campo.key] ?? ''}
                        onChange={(e) =>
                          setAttrs((a) => ({
                            ...a,
                            [campo.key]: campo.type === 'number'
                              ? (e.target.value === '' ? '' : Number(e.target.value))
                              : e.target.value,
                          }))
                        }
                        className="h-10"
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          )}

          <Field label="Observaciones" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Detalles relevantes del elemento…" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            Cancelar
          </Button>
          <Button onClick={guardar} loading={saving}>
            <Save className="size-4" />
            {editing ? 'Guardar cambios' : 'Registrar elemento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * Registro de una intervención sobre un elemento.
 * Es lo que alimenta el historial: "limpié esta alcantarilla el martes".
 * Al guardar, la condición del elemento se actualiza sola con la posterior.
 */
export function InterventionForm({
  asset,
  onClose,
  onSaved,
}: {
  asset: any
  onClose: () => void
  onSaved?: () => void
}) {
  const { service, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [fecha, setFecha] = React.useState(toISODate(new Date()))
  const [accion, setAccion] = React.useState('')
  const [crewId, setCrewId] = React.useState('')
  const [after, setAfter] = React.useState('bueno')
  const [notas, setNotas] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const crews = useQuery({
    queryKey: ['crews', service.id],
    enabled: !!asset,
    queryFn: async () => (await sb.from('crews').select('id, name, color')
      .eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? [],
    staleTime: 5 * 60_000,
  })

  React.useEffect(() => {
    if (!asset) return
    setFecha(toISODate(new Date()))
    setAccion('')
    setCrewId('')
    setAfter(asset.condition === 'no_evaluado' ? 'bueno' : asset.condition)
    setNotas('')
  }, [asset])

  const ACCIONES = [
    'Limpieza', 'Descolmatación', 'Reposición', 'Reparación',
    'Pintado', 'Reemplazo', 'Inspección', 'Señalización',
  ]

  const guardar = async () => {
    if (!accion) { toast.error('Indica qué se hizo'); return }
    setSaving(true)
    const { error } = await sb.from('asset_interventions').insert({
      asset_id: asset.id,
      service_id: service.id,
      intervened_on: fecha,
      action: accion,
      condition_before: asset.condition,
      condition_after: after as any,
      crew_id: crewId || null,
      notes: notas.trim() || null,
      created_by: profile.id,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }

    toast.success('Intervención registrada', {
      description: `El estado del elemento pasó a ${ASSET_CONDITION[after as keyof typeof ASSET_CONDITION].label.toLowerCase()}.`,
    })
    qc.invalidateQueries({ queryKey: ['assets'] })
    qc.invalidateQueries({ queryKey: ['asset-history'] })
    onSaved?.()
    onClose()
  }

  return (
    <Dialog open={!!asset} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <Wrench className="size-4.5" />
            </span>
            Registrar intervención
          </DialogTitle>
          <DialogDescription>
            {asset ? `${asset.name ?? asset.code} · ${asset.section_name ?? ''} ${asset.progresiva_txt ?? ''}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha" required>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10" />
          </Field>

          <Field label="Qué se hizo" required>
            <Select value={accion} onValueChange={setAccion}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {ACCIONES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Cuadrilla que intervino">
            <Select value={crewId} onValueChange={setCrewId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                {(crews.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Estado en que queda" required hint="Actualiza la ficha del elemento">
            <Select value={after} onValueChange={setAfter}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ASSET_CONDITION).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: v.dot }} />
                      {v.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2}
              placeholder="Material retirado, repuestos usados, coordinaciones…" />
          </Field>
        </div>

        {asset && (
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[12.5px]">
            <span className="text-muted-foreground">Estado actual</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="size-2 rounded-full" style={{ background: ASSET_CONDITION[asset.condition as keyof typeof ASSET_CONDITION]?.dot }} />
              {ASSET_CONDITION[asset.condition as keyof typeof ASSET_CONDITION]?.label}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="size-2 rounded-full" style={{ background: ASSET_CONDITION[after as keyof typeof ASSET_CONDITION]?.dot }} />
              {ASSET_CONDITION[after as keyof typeof ASSET_CONDITION]?.label}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} loading={saving}>
            <Wrench className="size-4" />
            Registrar intervención
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
