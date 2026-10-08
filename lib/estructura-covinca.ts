/**
 * La entrega con la estructura documental COVINCA.
 *
 * Arma un ZIP con las carpetas y los nombres exactos que aprobó COVINCA
 * (ZIP «SERVICON_COVINCA_Estructura_Revision», reunión con Elvis del
 * 05-10-2026), sin mover nada en el almacenamiento: las rutas son lógicas y
 * se calculan de lo registrado. El capataz nunca elige carpeta.
 *
 * - MANTENIMIENTO_RUTINARIO/<mes>/CUADRILLA_n_SEDE/<DD>/  fotos del día, no PCI
 * - …/NIVELES_DE_SERVICIO_<mes>/SECTOR_…/<CARPETA>/    las mismas, por sector y tipo
 * - …/REPORTES_DIARIOS_CHARLAS_ATS/CUADRILLA_n_SEDE/…   reporte, ATS, charla, checklist
 * - PCI/PCI_n/<plazo>/ITEM_n/ITEM_n(k).jpg              solo ítems con fotos
 *
 * Las fotos salen en JPG (se guardan en WebP para no gastar datos).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportePdf, type ReportMeta } from './reports'
import { construirIndice, type FilaIndice } from './paquete'
import { rutas, nombreLibre, aCovinca, semanaDe } from './covinca'
import { programacionSemanalXlsx } from './formato-programacion'
import { fmtDate } from './utils'

export type RamasCovinca = {
  programacion: boolean
  rutinario: boolean
  niveles: boolean
  pci: boolean
  documentos: boolean
  reportes: boolean
}

export type AvanceCovinca = { paso: string; hechos: number; total: number }

type Foto = {
  storage_path: string
  phase: string | null
  work_date: string | null
  fecha_sello: string | null
  origen: string
  crew_id: string | null
  crew_code: string | null
  crew_name: string | null
  crew_numero: number | null
  crew_sede: string | null
  activity_code: string | null
  activity_name: string | null
  activity_carpeta_ns: string | null
  sector_folder: string | null
  progresiva_m: number | null
  side: string | null
  pci_code: string | null
  pci_item_number: number | null
  pci_term_days: number | null
}

/** La cuadrilla tal como la nombra COVINCA; si aún no tiene número o sede, se deduce y se avisa en el índice. */
function cuadrillaDe(f: { crew_numero: number | null; crew_sede: string | null; crew_code: string | null; crew_name: string | null }) {
  const numero = f.crew_numero ?? Number(f.crew_code?.match(/\d+/)?.[0] ?? 0)
  const sede = f.crew_sede ?? aCovinca(f.crew_name ?? 'SIN_SEDE').slice(0, 20)
  return { numero, sede }
}

/** WebP → JPG, en el navegador. Si no se puede, se entrega el original. */
async function aJpg(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/jpeg') return blob
  try {
    const bmp = await createImageBitmap(blob)
    const lienzo = document.createElement('canvas')
    lienzo.width = bmp.width
    lienzo.height = bmp.height
    const ctx = lienzo.getContext('2d')!
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, bmp.width, bmp.height)
    ctx.drawImage(bmp, 0, 0)
    bmp.close?.()
    return await new Promise<Blob>((res) => lienzo.toBlob((b) => res(b ?? blob), 'image/jpeg', 0.92))
  } catch {
    return blob
  }
}

/** Trae todas las filas (PostgREST corta en mil). */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999)
    if (error) throw error
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return filas
}

/** Firma URLs en tandas de cien. */
async function firmar(sb: SupabaseClient<any>, bucket: string, rutasArchivo: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  for (let i = 0; i < rutasArchivo.length; i += 100) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(rutasArchivo.slice(i, i + 100), 3600)
    for (const f of data ?? []) if (f.signedUrl && f.path) firmadas.set(f.path, f.signedUrl)
  }
  return firmadas
}

/** Baja varias cosas a la vez, sin abrir cien conexiones. */
async function enParalelo<T>(items: T[], cuantos: number, hacer: (item: T, i: number) => Promise<void>) {
  let siguiente = 0
  await Promise.all(Array.from({ length: Math.min(cuantos, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++
      await hacer(items[i], i)
    }
  }))
}

export async function armarEstructuraCovinca(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  servicioNombre: string
  cliente?: string | null
  contrato?: string | null
  desde: string
  hasta: string
  cuadrillaId?: string | null
  ramas: RamasCovinca
  generadoPor: string
  alAvanzar?: (a: AvanceCovinca) => void
}): Promise<Blob> {
  const { sb, servicioId, desde, hasta, cuadrillaId, ramas, alAvanzar } = opciones
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const indice: FilaIndice[] = []
  const usados = new Set<string>()
  const avisar = (paso: string, hechos: number, total: number) => alAvanzar?.({ paso, hechos, total })

  const poner = (carpeta: string, archivo: string, datos: Blob | ArrayBuffer, fila: Omit<FilaIndice, 'carpeta' | 'archivo' | 'bytes'>) => {
    const nombre = nombreLibre(usados, carpeta, archivo)
    zip.folder(carpeta)!.file(nombre, datos)
    indice.push({ carpeta, archivo: nombre, bytes: datos instanceof Blob ? datos.size : datos.byteLength, ...fila })
  }

  // ─── Fotos: rutinario, niveles de servicio y PCI ─────────────────────
  if (ramas.rutinario || ramas.niveles || ramas.pci) {
    avisar('Buscando fotos', 0, 1)
    const fotos = await todas<Foto>((a, b) => {
      let c = sb.from('v_evidences')
        .select('storage_path, phase, work_date, fecha_sello, origen, crew_id, crew_code, crew_name, crew_numero, crew_sede, activity_code, activity_name, activity_carpeta_ns, sector_folder, progresiva_m, side, pci_code, pci_item_number, pci_term_days')
        .eq('service_id', servicioId)
        .in('origen', ['parte', 'pci'])
        .gte('work_date', desde)
        .lte('work_date', hasta)
        .order('work_date')
        .order('taken_at')
        .range(a, b)
      if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
      return c
    })
    const firmadas = await firmar(sb, 'evidencias', fotos.map((f) => f.storage_path))

    let hechas = 0
    await enParalelo(fotos, 6, async (f) => {
      const url = firmadas.get(f.storage_path)
      const fecha = (f.fecha_sello ?? f.work_date ?? '').slice(0, 10) || (f.work_date ?? '')
      try {
        if (!url) throw new Error('sin enlace')
        const jpg = await aJpg(await (await fetch(url)).blob())
        const detalle = [f.activity_code, f.activity_name, f.crew_name, f.phase].filter(Boolean).join(' · ')

        // Lo de un ítem PCI va solo a la rama PCI, aunque se haya tomado
        // desde el parte (Elvis: «lo único que varía es dónde se guardan las
        // fotos que no responden a PCI»)
        const esPci = f.pci_code != null && f.pci_item_number != null
        if (esPci && ramas.pci) {
          const r = rutas.fotoPci({ pciCodigo: f.pci_code!, plazoDias: f.pci_term_days ?? 0, item: f.pci_item_number!, fase: f.phase })
          poner(r.carpeta, r.archivo, jpg, { tipo: 'Foto PCI', fecha, detalle: `${f.pci_code} · ítem ${f.pci_item_number} · ${detalle}` })
        }
        if (!esPci && f.origen === 'parte') {
          const { numero, sede } = cuadrillaDe(f)
          if (ramas.rutinario) {
            const r = rutas.fotoRutinaria({
              fecha, cuadrilla: numero, sede, progresivaM: f.progresiva_m, lado: f.side, codigo: f.activity_code, fase: f.phase,
            })
            poner(r.carpeta, r.archivo, jpg, { tipo: 'Foto mantenimiento rutinario', fecha, detalle })
          }
          if (ramas.niveles && f.sector_folder && f.activity_carpeta_ns) {
            const r = rutas.fotoNivelDeServicio({
              fecha, sector: f.sector_folder, carpetaNs: f.activity_carpeta_ns, progresivaM: f.progresiva_m, lado: f.side, fase: f.phase,
            })
            poner(r.carpeta, r.archivo, jpg, { tipo: 'Foto nivel de servicio', fecha, detalle })
          }
        }
      } catch {
        indice.push({ carpeta: '(no se pudo descargar)', archivo: f.storage_path, tipo: 'Foto', fecha, detalle: 'Reintentar la entrega', bytes: 0 })
      }
      avisar('Fotografías', ++hechas, fotos.length)
    })
  }

  // ─── Documentos SSOMA fotografiados (ATS, charla, checklist) ─────────
  if (ramas.documentos) {
    avisar('Documentos SSOMA', 0, 1)
    let c = sb.from('documentos_del_dia')
      .select('id, doc_date, tipo, titulo, estado, vehicle_id, crews(code, name, numero, sede), documento_paginas(storage_path, taken_at, deleted_at)')
      .eq('service_id', servicioId)
      .gte('doc_date', desde)
      .lte('doc_date', hasta)
      .is('deleted_at', null)
      .order('doc_date')
    if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
    const { data: docs, error } = await c
    if (error) throw error

    // El vehículo va como correlativo dentro de la cuadrilla (VEHICULO-01)
    const { data: vehiculos } = await sb.from('vehicles').select('id, crew_id, plate').eq('service_id', servicioId).is('deleted_at', null).order('plate')
    const correlativo = new Map<string, string>()
    const porCuadrilla = new Map<string, number>()
    for (const v of vehiculos ?? []) {
      const n = (porCuadrilla.get(v.crew_id ?? '') ?? 0) + 1
      porCuadrilla.set(v.crew_id ?? '', n)
      correlativo.set(v.id, 'VEHICULO-' + String(n).padStart(2, '0'))
    }

    const paginas = (docs ?? []).flatMap((d: any) =>
      (d.documento_paginas ?? []).filter((p: any) => !p.deleted_at).map((p: any) => ({ d, p })))
    const firmadas = await firmar(sb, 'documentos', paginas.map((x) => x.p.storage_path))
    let hechas = 0
    await enParalelo(paginas, 6, async ({ d, p }) => {
      try {
        const url = firmadas.get(p.storage_path)
        if (!url) throw new Error('sin enlace')
        const jpg = await aJpg(await (await fetch(url)).blob())
        const cq = cuadrillaDe({ crew_numero: d.crews?.numero, crew_sede: d.crews?.sede, crew_code: d.crews?.code, crew_name: d.crews?.name })
        const tipo = d.tipo === 'ats' || d.tipo === 'charla' || d.tipo === 'checklist_vehicular' ? d.tipo : 'otro'
        const r = rutas.documento({
          fecha: d.doc_date, cuadrilla: cq.numero, sede: cq.sede, tipo,
          detalle: d.tipo === 'checklist_vehicular' ? correlativo.get(d.vehicle_id) ?? null : d.titulo,
          extension: '.jpg',
        })
        poner(r.carpeta, r.archivo, jpg, {
          tipo: 'Documento SSOMA (foto)', fecha: d.doc_date,
          detalle: `${d.crews?.name ?? ''} · ${d.tipo} · ${d.estado}`,
        })
      } catch {
        indice.push({ carpeta: '(no se pudo descargar)', archivo: p.storage_path, tipo: 'Documento', fecha: d.doc_date, detalle: 'Reintentar la entrega', bytes: 0 })
      }
      avisar('Documentos SSOMA', ++hechas, paginas.length)
    })
  }

  // ─── Reporte diario en PDF ───────────────────────────────────────────
  if (ramas.reportes) {
    avisar('Reportes diarios', 0, 1)
    let c = sb.from('work_orders')
      .select('id, work_date, status, crews(code, name, numero, sede)')
      .eq('service_id', servicioId)
      .gte('work_date', desde)
      .lte('work_date', hasta)
      .is('deleted_at', null)
      .order('work_date')
    if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
    const { data: partes } = await c
    const meta: ReportMeta = {
      titulo: '', servicio: opciones.servicioNombre, cliente: opciones.cliente ?? null,
      contrato: opciones.contrato ?? null, periodo: '', generadoPor: opciones.generadoPor,
    }
    for (const [i, parte] of (partes ?? []).entries()) {
      const { data: registros } = await sb.from('v_work_entries').select('*').eq('work_order_id', (parte as any).id)
      const filas = (registros ?? []).map((r: any) => ({
        codigo: r.activity_code ?? '—',
        actividad: r.activity_name ?? '—',
        origen: ({ programacion: 'Programado', pci: 'PCI', emergencia: 'Emergencia', no_programado: 'No programado' } as any)[r.origen] ?? r.origen ?? '—',
        tramo: r.section_name ?? '—',
        progresiva: [r.prog_start_txt, r.prog_end_txt].filter(Boolean).join(' → ') || '—',
        lado: r.side ?? '—',
        cantidad: r.quantity ?? 0,
        unidad: r.unit_symbol ?? '',
      }))
      const cq = cuadrillaDe({ crew_numero: (parte as any).crews?.numero, crew_sede: (parte as any).crews?.sede, crew_code: (parte as any).crews?.code, crew_name: (parte as any).crews?.name })
      const doc = await reportePdf(
        { ...meta, titulo: `Reporte diario · ${(parte as any).crews?.name ?? ''} · ${fmtDate((parte as any).work_date)}`, periodo: fmtDate((parte as any).work_date) },
        [
          { header: 'Código', key: 'codigo', width: 26 },
          { header: 'Actividad', key: 'actividad', width: 50 },
          { header: 'Origen', key: 'origen', width: 24 },
          { header: 'Tramo', key: 'tramo', width: 36 },
          { header: 'Progresiva', key: 'progresiva', width: 32 },
          { header: 'Lado', key: 'lado', width: 16 },
          { header: 'Metrado', key: 'cantidad', align: 'right', width: 20 },
          { header: 'Und.', key: 'unidad', width: 14 },
        ],
        filas,
        { cover: false, landscape: true },
      )
      const r = rutas.documento({ fecha: (parte as any).work_date, cuadrilla: cq.numero, sede: cq.sede, tipo: 'reporte_diario', extension: '.pdf' })
      poner(r.carpeta, r.archivo, doc.output('arraybuffer'), {
        tipo: 'Reporte diario', fecha: (parte as any).work_date,
        detalle: `${(parte as any).crews?.name ?? ''} · ${filas.length} actividades · ${(parte as any).status}`,
      })
      avisar('Reportes diarios', i + 1, (partes ?? []).length)
    }
  }

  // ─── Programación semanal (formato PS-ST04), por semana y cuadrilla ─
  if (ramas.programacion) {
    avisar('Programación semanal', 0, 1)
    // Las semanas cuyo lunes cae en el periodo: la carpeta es la del mes del lunes
    const lunes: string[] = []
    for (let d = new Date(semanaDe(desde).lunes + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 7 * 86400000)) {
      const l = d.toISOString().slice(0, 10)
      if (l >= desde) lunes.push(l)
    }
    let c = sb.from('plan_items').select('crew_id, scheduled_on, crews(code, name, numero, sede)')
      .eq('service_id', servicioId).gte('scheduled_on', lunes[0] ?? desde).lte('scheduled_on', hasta).is('deleted_at', null)
    if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
    const { data: filasPlan } = await c
    const pares = new Map<string, any>()
    for (const f of filasPlan ?? []) {
      const l = semanaDe((f as any).scheduled_on).lunes
      if (lunes.includes(l) && (f as any).crew_id) pares.set(l + '|' + (f as any).crew_id, { lunes: l, crewId: (f as any).crew_id, crew: (f as any).crews })
    }
    const logo = await fetch('/marca/logo-servicon.png').then((r) => r.arrayBuffer()).catch(() => null)
    let hechas = 0
    for (const par of pares.values()) {
      const { buffer, filas } = await programacionSemanalXlsx({
        sb, servicioId, cliente: opciones.cliente, fecha: par.lunes, cuadrillaId: par.crewId, logo,
      })
      const cq = cuadrillaDe({ crew_numero: par.crew?.numero, crew_sede: par.crew?.sede, crew_code: par.crew?.code, crew_name: par.crew?.name })
      const r = rutas.programacion({ ...semanaDe(par.lunes), cuadrilla: cq.numero, sede: cq.sede, tipo: 'ACTIVIDADES' })
      poner(r.carpeta, r.archivo, buffer, { tipo: 'Programación semanal', fecha: par.lunes, detalle: `${par.crew?.name ?? ''} · ${filas} partidas` })
      avisar('Programación semanal', ++hechas, pares.size)
    }
  }

  avisar('Índice', 0, 1)
  zip.file('INDICE.xlsx', await construirIndice(
    indice.sort((a, b) => (a.carpeta + a.archivo).localeCompare(b.carpeta + b.archivo)),
    {
      titulo: 'Estructura COVINCA', servicio: opciones.servicioNombre, cliente: opciones.cliente ?? null,
      contrato: opciones.contrato ?? null, periodo: `${fmtDate(desde)} al ${fmtDate(hasta)}`, generadoPor: opciones.generadoPor,
    },
    { desde, hasta },
  ))
  avisar('Comprimiendo', 1, 1)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}
