/**
 * Cómo se nombran en pantalla los registros de la bitácora (audit_log):
 * el módulo de cada tabla y la acción, dichos como en la operación.
 */
export const MODULO_DE_TABLA: Record<string, string> = {
  work_orders: 'Parte diario',
  work_entries: 'Actividad ejecutada',
  evidences: 'Evidencia fotográfica',
  plan_items: 'Partida programada',
  weekly_plans: 'Programación semanal',
  pci_items: 'Ítem de PCI',
  pcis: 'Documento PCI',
  cash_movements: 'Movimiento de caja',
  cash_boxes: 'Caja',
  deposit_requests: 'Pedido de depósito',
  rendiciones: 'Rendición',
  conciliaciones: 'Conciliación',
  supply_requests: 'Pedido de materiales',
  safety_talks: 'Charla de seguridad',
  ats_iperc: 'ATS / IPERC',
  safety_equipment: 'Equipo',
  vehicles: 'Vehículo',
  crew_vehicle_assignments: 'Asignación de recurso',
  road_assets: 'Activo vial',
  crews: 'Cuadrilla',
  crew_members: 'Integrante de cuadrilla',
  activities_catalog: 'Catálogo de actividades',
  units: 'Unidad de medida',
  rendimientos_jornada: 'Rendimiento',
  profiles: 'Usuario',
  service_members: 'Rol de usuario',
  services: 'Contrato',
  permisos_rol: 'Permisos por rol',
  observaciones_campo: 'Observación de campo',
}

export const ACCION_BITACORA: Record<string, string> = { INSERT: 'Creación', UPDATE: 'Modificación', DELETE: 'Eliminación' }

export const moduloDeTabla = (t: string | null | undefined) => (t ? MODULO_DE_TABLA[t] ?? t : '—')
