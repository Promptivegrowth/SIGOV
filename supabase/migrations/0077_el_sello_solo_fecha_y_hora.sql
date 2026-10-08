-- ═══════════════════════════════════════════════════════════════════════
-- 0077 · El sello fotográfico: solo fecha y hora
--
-- Reunión con Elvis (05-10-2026, 26:50–32:12) y OBS-16 a OBS-19:
--
-- · «Lo único que tiene que aparecer en la foto es fecha y hora; la
--   georreferenciación que solo quede como data dentro del archivo». Tramo,
--   progresiva y PCI ya van en la pizarra física: impresos, «contaminan».
--   Por omisión, entonces, solo fecha y hora; lo demás queda disponible
--   pero apagado. Fecha y hora no se pueden apagar.
-- · Se agrega «precision» (el ±m del GPS) como opción aparte.
-- · La fecha y hora del sello se pueden editar antes de la toma, sin
--   motivo (PCI que vence hoy y se termina mañana a primera hora). La hora
--   real de la toma se sigue guardando en taken_at; la del sello va en
--   stamped_at. Así la edición no pide pasos al capataz y la auditoría no
--   pierde nada.
-- · v_evidences expone lo que hace falta para clasificar y nombrar la foto
--   como COVINCA (código de partida, PCI e ítem, cuadrilla y sede, lado).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.evidences
  add column if not exists stamped_at timestamptz;

comment on column public.evidences.stamped_at is
  'Fecha y hora impresas en el sello cuando el capataz las editó antes de la toma. Null: el sello lleva taken_at.';

create or replace function public.ajustes_del_servicio(p_service_id uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Qué se imprime sobre la fotografía. Fecha y hora van siempre.
    'sello', (jsonb_build_object(
      'activo',     true,
      'fecha',      true,
      'hora',       true,
      'geo',        false,
      'precision',  false,
      'progresiva', false,
      'tramo',      false,
      'cuadrilla',  false,
      'actividad',  false,
      'pci',        false,
      'marca',      false
    ) || coalesce(s.settings->'sello', '{}'::jsonb))
      || jsonb_build_object('fecha', true, 'hora', true),

    -- Umbrales de operación
    'caja', jsonb_build_object(
      'monto_minimo_comprobante', 20
    ) || coalesce(s.settings->'caja', '{}'::jsonb),

    'alertas', jsonb_build_object(
      'dias_aviso_vencimiento', 30,
      'dias_aviso_pci', 7
    ) || coalesce(s.settings->'alertas', '{}'::jsonb)
  )::json
  from public.services s
  where s.id = p_service_id and s.deleted_at is null
$$;

grant execute on function public.ajustes_del_servicio(uuid) to authenticated;

-- ─── La vista de evidencias, con lo que pide la estructura COVINCA ─────
create or replace view public.v_evidences
with (security_invoker = true) as
select
  e.id,
  e.client_id,
  e.service_id,
  e.phase,
  e.storage_path,
  e.thumb_path,
  e.mime_type,
  e.size_bytes,
  e.width,
  e.height,
  e.lat,
  e.lng,
  e.accuracy_m,
  e.taken_at,
  e.sha256,
  e.watermarked,
  e.caption,
  e.created_at,
  e.created_by,
  p.full_name as created_by_name,
  e.work_entry_id,
  e.pci_item_id,
  case
    when e.work_entry_id is not null then 'parte'
    when e.pci_item_id is not null then 'pci'
    else 'suelta'
  end as origen,
  coalesce(wo.crew_id, pi.assigned_crew_id) as crew_id,
  coalesce(cwo.name, cpi.name) as crew_name,
  coalesce(awe.name, api.name) as activity_name,
  coalesce(swe.name, spi.name) as section_name,
  coalesce(swe.code, spi.code) as section_code,
  coalesce(e.section_id, we.section_id, pi.section_id) as section_id,
  coalesce(e.progresiva_m, we.prog_start_m, pi.prog_start_m) as progresiva_m,
  coalesce(wo.work_date, (coalesce(e.stamped_at, e.taken_at) at time zone 'America/Lima')::date) as work_date,
  pci.code as pci_code,
  -- Lo nuevo
  e.stamped_at,
  coalesce(e.stamped_at, e.taken_at) as fecha_sello,
  coalesce(awe.id, api.id) as activity_id,
  coalesce(awe.code, api.code) as activity_code,
  coalesce(awe.carpeta_ns, api.carpeta_ns) as activity_carpeta_ns,
  pi.pci_id,
  pi.item_number as pci_item_number,
  pi.term_days as pci_term_days,
  we.work_order_id,
  coalesce(we.side::text, pi.side::text) as side,
  coalesce(cwo.numero, cpi.numero) as crew_numero,
  coalesce(cwo.sede, cpi.sede) as crew_sede,
  e.altitude_m,
  e.device_model
from public.evidences e
left join public.work_entries we on we.id = e.work_entry_id and we.deleted_at is null
left join public.work_orders wo on wo.id = we.work_order_id and wo.deleted_at is null
left join public.pci_items pi on pi.id = e.pci_item_id and pi.deleted_at is null
left join public.pcis pci on pci.id = pi.pci_id
left join public.crews cwo on cwo.id = wo.crew_id
left join public.crews cpi on cpi.id = pi.assigned_crew_id
left join public.activities_catalog awe on awe.id = we.activity_id
left join public.activities_catalog api on api.id = pi.activity_id
left join public.road_sections swe on swe.id = coalesce(e.section_id, we.section_id)
left join public.road_sections spi on spi.id = pi.section_id
left join public.profiles p on p.id = e.created_by
where e.deleted_at is null;

notify pgrst, 'reload schema';
