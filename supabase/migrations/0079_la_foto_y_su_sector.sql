-- ═══════════════════════════════════════════════════════════════════════
-- 0079 · La foto sabe en qué sector cae; el registro, su código y origen
--
-- La estructura documental COVINCA archiva cada foto dos veces: por
-- cuadrilla y día, y por SECTOR_x.y_ini_fin / carpeta de actividad
-- (reunión con Elvis, 09:12–10:22). El sector sale de la progresiva de la
-- foto (o la del registro), con sector_de() de 0070.
-- ═══════════════════════════════════════════════════════════════════════

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
  e.device_model,
  -- 0079: el sector de niveles de servicio donde cae la foto
  sec.code as sector_code,
  sec.folder as sector_folder,
  coalesce(cwo.code, cpi.code) as crew_code
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
left join lateral public.sector_de(
  coalesce(e.section_id, we.section_id, pi.section_id),
  coalesce(e.progresiva_m, we.prog_start_m, pi.prog_start_m)
) sec on sec.id is not null
where e.deleted_at is null;

notify pgrst, 'reload schema';

-- ─── El registro de campo, con su código de partida y su origen ────────
-- El reporte diario de COVINCA lleva el código (COV-…) y de dónde salió el
-- trabajo (programado, PCI, emergencia, no programado): OBS-28/29.
create or replace view public.v_work_entries
with (security_invoker = true) as
select we.id,
    we.work_order_id,
    we.service_id,
    we.plan_item_id,
    we.pci_item_id,
    wo.work_date,
    wo.status as order_status,
    wo.crew_id,
    c.name as crew_name,
    c.color as crew_color,
    we.activity_id,
    a.name as activity_name,
    a.category as activity_category,
    a.color as activity_color,
    we.section_id,
    s.name as section_name,
    we.prog_start_m,
    we.prog_end_m,
    we.side,
    public.fmt_progresiva(we.prog_start_m) as prog_start_txt,
    public.fmt_progresiva(we.prog_end_m) as prog_end_txt,
    we.quantity,
    u.symbol as unit_symbol,
    we.observation,
    we.started_at,
    we.finished_at,
    st_y(we.geom::geometry) as lat,
    st_x(we.geom::geometry) as lng,
    (select count(*) from public.evidences e
      where e.work_entry_id = we.id and e.deleted_at is null) as evidence_count,
    p.full_name as created_by_name,
    we.created_at,
    -- 0079
    a.code as activity_code,
    a.numero_covinca as activity_numero,
    we.origen,
    pci.code as pci_code,
    pit.item_number as pci_item_number
from public.work_entries we
  join public.work_orders wo on wo.id = we.work_order_id
  join public.activities_catalog a on a.id = we.activity_id
  join public.road_sections s on s.id = we.section_id
  left join public.crews c on c.id = wo.crew_id
  left join public.units u on u.id = we.unit_id
  left join public.profiles p on p.id = we.created_by
  left join public.pci_items pit on pit.id = we.pci_item_id
  left join public.pcis pci on pci.id = pit.pci_id
where we.deleted_at is null;

notify pgrst, 'reload schema';
