import { PCI_ITEM_LEVANTADO } from '@/lib/constants'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Estado situacional de un PCI a una fecha de corte (Elvis, 26/10)
//
// Es la lámina que COVINCA arma a mano para cada PCI: cuánto se atendió,
// cuánto falta, qué vence y dónde. Aquí sale sola de lo que suben las
// cuadrillas, a la fecha de corte que se elija.
// ═══════════════════════════════════════════════════════════════════════════

export type Situacion = 'atendido' | 'en_plazo' | 'vence_hoy' | 'vencido'

export const SITUACION: Record<Situacion, { label: string; color: string }> = {
  atendido: { label: 'Atendido', color: 'var(--success)' },
  en_plazo: { label: 'Pendiente en plazo', color: 'var(--warning)' },
  vence_hoy: { label: 'Vence hoy', color: 'var(--chart-2)' },
  vencido: { label: 'Vencido', color: 'var(--destructive)' },
}

export interface ItemEstado {
  id: string
  item_number: number | null
  description: string | null
  activity_name: string | null
  section_id: string | null
  section_code: string | null
  prog_start_m: number | null
  prog_start_txt: string | null
  term_days: number | null
  due_date: string | null
  status: string | null
  requires_evidence: boolean | null
  closed_at: string | null
  validated_at: string | null
  fotos_antes: number | null
  fotos_durante: number | null
  fotos_despues: number | null
}

export interface Sector {
  code: string
  section_id: string
  prog_start_m: number
  prog_end_m: number
  orden: number
}

export interface FilaEstado extends ItemEstado {
  situacion: Situacion
  sector: string
  /** Fecha (Perú) en que quedó atendido, si lo está al corte. */
  atendidoEl: string | null
}

export interface GrupoPlazo {
  clave: string
  plazo: number | null
  vence: string | null
  total: number
  atendidos: number
  pendientes: number
  vencidos: number
  avance: number
}

export interface ResumenSector {
  sector: string
  total: number
  atendidos: number
  pendientes: number
  vencidos: number
  avance: number
}

export interface EstadoSituacional {
  filas: FilaEstado[]
  total: number
  atendidos: number
  pendientes: number
  avance: number
  vencidos: number
  venceHoy: number
  enPlazo: number
  sectores: string[]
  plazos: GrupoPlazo[]
  porSector: ResumenSector[]
  /** Las próximas fechas con pendientes que vencen después del corte. */
  proximos: { fecha: string; pendientes: number }[]
  observaciones: string[]
}

/** La fecha en el Perú (AAAA-MM-DD) de un instante: un cierre a las 9 p. m. es de ese día, no del siguiente en UTC. */
export function fechaPeru(instante: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instante))
}

/** «2026-10-28» → «28/10». */
export const diaMes = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')

/** «PCI-2026-058» → «PCI 58»: el año se sobreentiende (Elvis). */
export function pciCorto(codigo: string | null | undefined) {
  if (!codigo) return 'PCI'
  const m = codigo.match(/^PCI-\d{4}-0*(\d+)$/i)
  return m ? `PCI ${m[1]}` : codigo
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function sectorDe(it: ItemEstado, sectores: Sector[]): string {
  if (it.section_id && it.prog_start_m != null) {
    const s = sectores.find((x) => x.section_id === it.section_id && it.prog_start_m! >= x.prog_start_m && it.prog_start_m! <= x.prog_end_m)
    if (s) return s.code
  }
  return it.section_code ?? 'Sin sector'
}

const ordenSector = (sectores: Sector[]) => (a: string, b: string) => {
  const oa = sectores.find((s) => s.code === a)?.orden ?? 999
  const ob = sectores.find((s) => s.code === b)?.orden ?? 999
  return oa - ob || a.localeCompare(b, 'es', { numeric: true })
}

const pct = (a: number, t: number) => (t ? (a / t) * 100 : 0)

/**
 * El estado del PCI al cierre del día de corte. Atendido es lo que la
 * cuadrilla dejó con sus fotos (levantado, subsanado o validado) hasta ese
 * día; lo demás está pendiente y se mide contra su vencimiento.
 */
export function calcularEstado(items: ItemEstado[], sectores: Sector[], corte: string): EstadoSituacional {
  const filas: FilaEstado[] = items.map((it) => {
    const cuando = it.closed_at ?? it.validated_at
    const fecha = cuando ? fechaPeru(cuando) : null
    // Sin fecha de cierre (datos antiguos) cuenta como atendido: no hay con qué ubicarlo en el tiempo
    const atendido = PCI_ITEM_LEVANTADO.includes(it.status ?? '') && (!fecha || fecha <= corte)
    const situacion: Situacion = atendido
      ? 'atendido'
      : !it.due_date || it.due_date > corte
        ? 'en_plazo'
        : it.due_date === corte
          ? 'vence_hoy'
          : 'vencido'
    return { ...it, situacion, sector: sectorDe(it, sectores), atendidoEl: atendido ? fecha : null }
  })

  const total = filas.length
  const atendidos = filas.filter((f) => f.situacion === 'atendido').length
  const pendientes = total - atendidos
  const vencidos = filas.filter((f) => f.situacion === 'vencido').length
  const venceHoy = filas.filter((f) => f.situacion === 'vence_hoy').length
  // «En plazo» incluye lo que vence hoy: aún se puede atender (lámina de Elvis)
  const enPlazo = filas.filter((f) => f.situacion === 'en_plazo' || f.situacion === 'vence_hoy').length

  // ─── Por plazo: el mismo plazo puede tener más de un vencimiento ─────
  const grupos = new Map<string, GrupoPlazo>()
  for (const f of filas) {
    const clave = `${f.term_days ?? '-'}|${f.due_date ?? '-'}`
    const g = grupos.get(clave) ?? { clave, plazo: f.term_days, vence: f.due_date, total: 0, atendidos: 0, pendientes: 0, vencidos: 0, avance: 0 }
    g.total++
    if (f.situacion === 'atendido') g.atendidos++
    else g.pendientes++
    if (f.situacion === 'vencido') g.vencidos++
    grupos.set(clave, g)
  }
  const plazos = [...grupos.values()]
    .map((g) => ({ ...g, avance: pct(g.atendidos, g.total) }))
    .sort((a, b) => (a.plazo ?? 999) - (b.plazo ?? 999) || String(a.vence).localeCompare(String(b.vence)))

  // ─── Por sector ───────────────────────────────────────────────────────
  const sectoresMap = new Map<string, ResumenSector>()
  for (const f of filas) {
    const s = sectoresMap.get(f.sector) ?? { sector: f.sector, total: 0, atendidos: 0, pendientes: 0, vencidos: 0, avance: 0 }
    s.total++
    if (f.situacion === 'atendido') s.atendidos++
    else s.pendientes++
    if (f.situacion === 'vencido') s.vencidos++
    sectoresMap.set(f.sector, s)
  }
  const orden = ordenSector(sectores)
  const porSector = [...sectoresMap.values()]
    .map((s) => ({ ...s, avance: pct(s.atendidos, s.total) }))
    .sort((a, b) => orden(a.sector, b.sector))

  const proximosMap = new Map<string, number>()
  for (const f of filas) {
    if (f.situacion !== 'atendido' && f.due_date && f.due_date > corte) proximosMap.set(f.due_date, (proximosMap.get(f.due_date) ?? 0) + 1)
  }
  const proximos = [...proximosMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, pendientes]) => ({ fecha, pendientes }))

  return {
    filas,
    total,
    atendidos,
    pendientes,
    avance: pct(atendidos, total),
    vencidos,
    venceHoy,
    enPlazo,
    sectores: porSector.map((s) => s.sector),
    plazos,
    porSector,
    proximos,
    observaciones: observacionOperativa(filas, { vencidos, venceHoy, proximos, corte }),
  }
}

/**
 * La «observación operativa» de la lámina, escrita sola: qué vence, qué
 * actividad pesa más en lo pendiente y qué registro fotográfico falta.
 */
function observacionOperativa(
  filas: FilaEstado[],
  { vencidos, venceHoy, proximos, corte }: { vencidos: number; venceHoy: number; proximos: { fecha: string; pendientes: number }[]; corte: string },
): string[] {
  const notas: string[] = []
  const pendientes = filas.filter((f) => f.situacion !== 'atendido')

  if (!filas.length) return ['El PCI aún no tiene ítems registrados.']
  if (!pendientes.length) notas.push('Todos los ítems del PCI están atendidos al corte.')

  if (vencidos) {
    const plazos = [...new Set(filas.filter((f) => f.situacion === 'vencido').map((f) => f.term_days))].filter((d) => d != null).sort((a, b) => a! - b!)
    notas.push(`${plural(vencidos, 'ítem vencido', 'ítems vencidos')} sin atender${plazos.length ? ` (plazo de ${plazos.join(', ')} d)` : ''}: atención inmediata.`)
  } else if (pendientes.length) {
    notas.push('Sin ítems vencidos al corte: lo pendiente sigue dentro de su plazo.')
  }
  if (venceHoy) notas.push(`Hoy vencen ${plural(venceHoy, 'ítem pendiente', 'ítems pendientes')}: priorizarlos en la jornada.`)
  for (const p of proximos.slice(0, 3)) notas.push(`El ${diaMes(p.fecha)} vencen ${plural(p.pendientes, 'ítem pendiente', 'ítems pendientes')}.`)

  // Qué actividad concentra lo pendiente: por ahí conviene empezar
  const porActividad = new Map<string, number>()
  for (const f of pendientes) {
    const a = f.activity_name?.trim() || 'Sin actividad asignada'
    porActividad.set(a, (porActividad.get(a) ?? 0) + 1)
  }
  const top = [...porActividad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (top.length) notas.push(`Prioridad por actividad: ${top.map(([a, n]) => `${a} (${n})`).join(', ')}.`)

  const sinTres = filas.filter((f) => f.situacion === 'atendido' && f.requires_evidence && !((f.fotos_antes ?? 0) > 0 && (f.fotos_durante ?? 0) > 0 && (f.fotos_despues ?? 0) > 0)).length
  if (sinTres) notas.push(`${plural(sinTres, 'ítem atendido no tiene', 'ítems atendidos no tienen')} sus tres fotos (antes, durante y después): completar el registro.`)

  const sinFotos = pendientes.filter((f) => f.requires_evidence && !(f.fotos_antes || f.fotos_durante || f.fotos_despues)).length
  if (sinFotos) notas.push(`${plural(sinFotos, 'pendiente sigue', 'pendientes siguen')} sin ninguna foto: aún no se inicia en campo.`)

  const delDia = filas.filter((f) => f.atendidoEl === corte).length
  notas.push(delDia ? `En el día del corte se registraron ${plural(delDia, 'nueva atención', 'nuevas atenciones')}.` : 'En el día del corte no se registraron nuevas atenciones.')

  const tarde = filas.filter((f) => f.atendidoEl && f.due_date && f.atendidoEl > f.due_date).length
  if (tarde) notas.push(`${plural(tarde, 'ítem se atendió', 'ítems se atendieron')} después de su vencimiento.`)

  return notas
}
