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
import { construirIndice, type FilaIndice } from './paquete'
import { rutas, nombreLibre, aCovinca, semanaDe } from './covinca'
import { programacionSemanalXlsx } from './formato-programacion'
import { f7Xlsx } from './formato-f7'
import { f8Xlsx } from './formato-f8'
import { fmtDate } from './utils'
import { datosFor001, for001Pdf } from './formato-for001'

export type RamasCovinca = {
  programacion: boolean
  materiales: boolean
  rutinario: boolean
  niveles: boolean
  pci: boolean
  documentos: boolean
  reportes: boolean
}

export type AvanceCovinca = { paso: string; hechos: number; total: number }

type Foto = {
  storage_path: string
  /** El original JPG 4080 × 3060 (OBS-23), si el celular ya lo subió. */
  master_path: string | null
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
  /** Conformidad u observación de COVINCA: una foto observada no se entrega. */
  revision: string | null
  revision_nota: string | null
}

/** La cuadrilla tal como la nombra COVINCA; si aún no tiene número o sede, se deduce y se avisa en el índice. */
function cuadrillaDe(f: { crew_numero: number | null; crew_sede: string | null; crew_code: string | null; crew_name: string | null }) {
  const numero = f.crew_numero ?? Number(f.crew_code?.match(/\d+/)?.[0] ?? 0)
  const sede = f.crew_sede ?? aCovinca(f.crew_name ?? 'SIN_SEDE').slice(0, 20)
  return { numero, sede }
}

/**
 * WebP → JPG, en el navegador. Si no se puede, se entrega el archivo tal cual.
 *
 * Con `covinca`, la foto sale en 4080 × 3060 (o 3060 × 4080 si es vertical),
 * la medida que exige COVINCA (OBS-23): se recorta al centro lo que no sea
 * 4:3. Es el camino de las fotos que no tienen original guardado.
 */
async function aJpg(blob: Blob, covinca = false): Promise<Blob> {
  if (blob.type === 'image/jpeg' && !covinca) return blob
  try {
    const bmp = await createImageBitmap(blob)
    const horizontal = bmp.width >= bmp.height
    const [ancho, alto] = !covinca ? [bmp.width, bmp.height] : horizontal ? [4080, 3060] : [3060, 4080]
    // Lo que se toma de la imagen: todo, o el centro 4:3
    let sw = bmp.width
    let sh = bmp.height
    if (covinca) {
      const r = ancho / alto
      sh = Math.round(sw / r)
      if (sh > bmp.height) { sh = bmp.height; sw = Math.round(sh * r) }
    }
    const sx = Math.round((bmp.width - sw) / 2)
    const sy = Math.round((bmp.height - sh) / 2)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d')!
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, ancho, alto)
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

/**
 * Cuánto va a pesar la entrega en fotos, antes de armarla. Con los
 * originales JPG (~3 MB cada uno) un mes de todas las cuadrillas puede pasar
 * de varios GB, y el navegador arma el ZIP en memoria: hay que poder verlo
 * venir y partirlo por cuadrilla o por quincena.
 */
export async function estimarFotos(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  desde: string
  hasta: string
  cuadrillaId: string | null
}): Promise<{ fotos: number; conOriginal: number; bytes: number }> {
  const { sb, servicioId, desde, hasta, cuadrillaId } = opciones
  const filas = await todas<{ master_bytes: number | null }>((a, b) => {
    let c = sb.from('v_evidences').select('master_bytes')
      .eq('service_id', servicioId).in('origen', ['parte', 'pci'])
      .or('revision.is.null,revision.neq.observada')
      .gte('work_date', desde).lte('work_date', hasta)
      .order('id').range(a, b)
    if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
    return c
  })
  // Sin original, el JPG 4080 × 3060 que se genera ronda 1,8 MB
  const bytes = filas.reduce((t, f) => t + Number(f.master_bytes ?? 1_800_000), 0)
  return { fotos: filas.length, conOriginal: filas.filter((f) => f.master_bytes != null).length, bytes }
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
        .select('storage_path, master_path, phase, work_date, fecha_sello, origen, crew_id, crew_code, crew_name, crew_numero, crew_sede, activity_code, activity_name, activity_carpeta_ns, sector_folder, progresiva_m, side, pci_code, pci_item_number, pci_term_days, revision, revision_nota')
        .eq('service_id', servicioId)
        .in('origen', ['parte', 'pci'])
        .gte('work_date', desde)
        .lte('work_date', hasta)
        .order('work_date')
        .order('taken_at')
        .order('id')
        .range(a, b)
      if (cuadrillaId) c = c.eq('crew_id', cuadrillaId)
      return c
    })
    const firmadas = await firmar(sb, 'evidencias', fotos.map((f) => f.storage_path))
    const originales = await firmar(sb, 'evidencias', fotos.flatMap((f) => (f.master_path ? [f.master_path] : [])))

    // Los nombres se reservan antes de bajar, en el orden de toma: así
    // COV_SV_029_foto1, foto2… y las repetidas _A, _B salen siempre iguales,
    // termine primero la descarga que termine.
    type Destino = { carpeta: string; archivo: string; tipo: string; detalle: string }
    const fechaDe = (f: Foto) => (f.fecha_sello ?? f.work_date ?? '').slice(0, 10) || (f.work_date ?? '')
    const correlativos = new Map<string, number>()
    const destinos = fotos.map((f): Destino[] => {
      const fecha = fechaDe(f)
      const detalle = [f.activity_code, f.activity_name, f.crew_name, f.phase].filter(Boolean).join(' · ')
      // La que COVINCA observó no va: queda anotada en el índice para retomarla
      if (f.revision === 'observada') {
        indice.push({
          carpeta: '(observada: no se entrega)', archivo: f.storage_path, tipo: 'Foto observada', fecha,
          detalle: [f.pci_code && `${f.pci_code} · ítem ${f.pci_item_number}`, detalle, f.revision_nota && `«${f.revision_nota}»`].filter(Boolean).join(' · '),
          bytes: 0,
        })
        return []
      }
      const reservar = (r: { carpeta: string; archivo: string }, tipo: string, extra = detalle): Destino =>
        ({ carpeta: r.carpeta, archivo: nombreLibre(usados, r.carpeta, r.archivo), tipo, detalle: extra })
      const lista: Destino[] = []
      // Lo de un ítem PCI va a la rama PCI, aunque se haya tomado desde el
      // parte, y no a la carpeta diaria de la cuadrilla (Elvis: «lo único que
      // varía es dónde se guardan las fotos que no responden a PCI»)
      const esPci = f.pci_code != null && f.pci_item_number != null
      if (esPci && ramas.pci) {
        const r = rutas.fotoPci({ pciCodigo: f.pci_code!, plazoDias: f.pci_term_days ?? 0, item: f.pci_item_number!, fase: f.phase })
        lista.push(reservar(r, 'Foto PCI', `${f.pci_code} · ítem ${f.pci_item_number} · ${detalle}`))
      }
      if (!esPci && f.origen === 'parte' && ramas.rutinario) {
        const { numero, sede } = cuadrillaDe(f)
        const base = rutas.fotoRutinaria({ fecha, cuadrilla: numero, sede, codigo: f.activity_code, numero: 1 })
        const clave = base.carpeta + '|' + (f.activity_code ?? '')
        const n = (correlativos.get(clave) ?? 0) + 1
        correlativos.set(clave, n)
        lista.push(reservar(rutas.fotoRutinaria({ fecha, cuadrilla: numero, sede, codigo: f.activity_code, numero: n }), 'Foto mantenimiento rutinario'))
      }
      // Niveles de servicio: las del parte y también las del PCI (Elvis, P20)
      if ((esPci || f.origen === 'parte') && ramas.niveles && f.sector_folder && f.activity_carpeta_ns) {
        const r = rutas.fotoNivelDeServicio({
          fecha, sector: f.sector_folder, carpetaNs: f.activity_carpeta_ns, progresivaM: f.progresiva_m, lado: f.side, fase: f.phase,
        })
        lista.push(reservar(r, 'Foto nivel de servicio', esPci ? `${f.pci_code} · ítem ${f.pci_item_number} · ${detalle}` : detalle))
      }
      return lista
    })

    let hechas = 0
    await enParalelo(fotos, 6, async (f, i) => {
      const url = firmadas.get(f.storage_path)
      const fecha = fechaDe(f)
      if (!destinos[i].length) { avisar('Fotografías', ++hechas, fotos.length); return }
      try {
        if (!url) throw new Error('sin enlace')
        // El original del celular va tal cual: ya es JPG 4080 × 3060, con su
        // sello y su EXIF. Si la foto no lo tiene (anterior a su uso, o no
        // subió todavía), se genera desde la foto liviana y se dice.
        const urlOriginal = f.master_path ? originales.get(f.master_path) : undefined
        let jpg: Blob | null = null
        if (urlOriginal) {
          const r = await fetch(urlOriginal)
          if (r.ok) jpg = await r.blob()
        }
        const ampliada = !jpg
        if (!jpg) jpg = await aJpg(await (await fetch(url)).blob(), true)
        for (const d of destinos[i]) {
          zip.folder(d.carpeta)!.file(d.archivo, jpg)
          indice.push({
            carpeta: d.carpeta, archivo: d.archivo, bytes: jpg.size, tipo: d.tipo, fecha,
            detalle: ampliada ? `${d.detalle} · ampliada desde la foto liviana: no tiene original` : d.detalle,
          })
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

    // Las páginas en el orden en que se tomaron; el nombre se reserva antes
    // de bajar para que la 2.ª página sea siempre la «_A»
    const paginas = (docs ?? []).flatMap((d: any) =>
      (d.documento_paginas ?? []).filter((p: any) => !p.deleted_at)
        .sort((a: any, b: any) => String(a.taken_at).localeCompare(String(b.taken_at)))
        .map((p: any) => {
          const cq = cuadrillaDe({ crew_numero: d.crews?.numero, crew_sede: d.crews?.sede, crew_code: d.crews?.code, crew_name: d.crews?.name })
          const tipo = ['ats', 'ats_conductor', 'charla', 'checklist_vehicular', 'petar'].includes(d.tipo) ? d.tipo : 'otro'
          const r = rutas.documento({
            fecha: d.doc_date, cuadrilla: cq.numero, sede: cq.sede, tipo,
            detalle: ['checklist_vehicular', 'ats_conductor'].includes(d.tipo) ? correlativo.get(d.vehicle_id) ?? null : d.titulo,
            extension: '.jpg',
          })
          return { d, p, carpeta: r.carpeta, archivo: nombreLibre(usados, r.carpeta, r.archivo) }
        }))
    const firmadas = await firmar(sb, 'documentos', paginas.map((x) => x.p.storage_path))
    let hechas = 0
    await enParalelo(paginas, 6, async ({ d, p, carpeta, archivo }) => {
      try {
        const url = firmadas.get(p.storage_path)
        if (!url) throw new Error('sin enlace')
        const jpg = await aJpg(await (await fetch(url)).blob())
        zip.folder(carpeta)!.file(archivo, jpg)
        indice.push({
          carpeta, archivo, bytes: jpg.size, tipo: 'Documento SSOMA (foto)', fecha: d.doc_date,
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
    // El FOR:001 de Elvis, uno por día y cuadrilla (P15)
    const logo = await fetch('/marca/logo-servicon.png').then((r) => r.arrayBuffer()).catch(() => null)
    for (const [i, parte] of (partes ?? []).entries()) {
      const datos = await datosFor001(sb, (parte as any).id)
      const doc = await for001Pdf(datos, logo)
      const filas = datos.registros
      const cq = cuadrillaDe({ crew_numero: (parte as any).crews?.numero, crew_sede: (parte as any).crews?.sede, crew_code: (parte as any).crews?.code, crew_name: (parte as any).crews?.name })
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
    // Las semanas que tocan el periodo. La que cruza dos meses va en los dos
    // (Elvis, P27), pero solo en los meses que abarca esta entrega
    const lunes: string[] = []
    for (let d = new Date(semanaDe(desde).lunes + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 7 * 86400000)) {
      lunes.push(d.toISOString().slice(0, 10))
    }
    const mesesDeLaEntrega = (mes: string) => mes >= desde.slice(0, 7) && mes <= hasta.slice(0, 7)
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
      for (const r of rutas.programacion({ ...semanaDe(par.lunes), cuadrilla: cq.numero, sede: cq.sede, tipo: 'ACTIVIDADES' })) {
        if (mesesDeLaEntrega(r.mes)) poner(r.carpeta, r.archivo, buffer, { tipo: 'Programación semanal', fecha: par.lunes, detalle: `${par.crew?.name ?? ''} · ${filas} partidas` })
      }
      // El F7 de la semana, al lado (Elvis, P36: uno por semana)
      const f7 = await f7Xlsx({ sb, servicioId, fecha: par.lunes, cuadrillaId: par.crewId, logo })
      for (const r of rutas.programacion({ ...semanaDe(par.lunes), cuadrilla: cq.numero, sede: cq.sede, tipo: 'RECURSOS' })) {
        if (mesesDeLaEntrega(r.mes)) poner(r.carpeta, r.archivo, f7.buffer, { tipo: 'Requerimiento de recursos (F7)', fecha: par.lunes, detalle: `${par.crew?.name ?? ''} · ${f7.filas} renglones` })
      }
      avisar('Programación semanal', ++hechas, pares.size)
    }
  }

  // ─── Seguimiento diario de materiales (Formato 8), un libro por mes ───
  if (ramas.materiales) {
    const meses = new Set<string>()
    for (let d = new Date(desde + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 86400000)) meses.add(d.toISOString().slice(0, 7))
    const logo = await fetch('/marca/logo-servicon.png').then((r) => r.arrayBuffer()).catch(() => null)
    let hechos = 0
    for (const mes of meses) {
      avisar('Seguimiento de materiales', hechos, meses.size)
      const { buffer, cuadrillas, movimientos } = await f8Xlsx({ sb, servicioId, mes, cuadrillaId, logo })
      const r = rutas.materiales({ mes, cuadrillas })
      poner(r.carpeta, r.archivo, buffer, { tipo: 'Seguimiento diario de materiales (F8)', fecha: mes, detalle: `${cuadrillas} cuadrillas · ${movimientos} movimientos` })
      avisar('Seguimiento de materiales', ++hechos, meses.size)
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
