-- ═══════════════════════════════════════════════════════════════════════
-- 0024 · La evidencia, con su contexto
--
-- Una foto suelta no dice nada. Para buscarla hace falta saber de qué
-- actividad es, en qué tramo, de qué cuadrilla y de qué día, y eso hoy vive
-- repartido en cuatro tablas. Esta vista lo junta para que tanto la web como
-- la aplicación de campo puedan filtrar por lo que la gente realmente
-- recuerda: «la del badén de Camaná, el martes».
--
-- Una evidencia puede colgar de una actividad del parte o de un ítem de PCI;
-- se resuelven las dos y se toma la que exista.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_evidences as
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
  p.full_name                                  as created_by_name,

  e.work_entry_id,
  e.pci_item_id,

  -- De dónde cuelga, dicho en una palabra
  case
    when e.work_entry_id is not null then 'parte'
    when e.pci_item_id  is not null then 'pci'
    else 'suelta'
  end                                          as origen,

  coalesce(wo.crew_id, pi.assigned_crew_id)    as crew_id,
  coalesce(cwo.name,  cpi.name)                as crew_name,
  coalesce(awe.name,  api.name)                as activity_name,
  coalesce(swe.name,  spi.name)                as section_name,
  coalesce(swe.code,  spi.code)                as section_code,
  coalesce(e.section_id, we.section_id, pi.section_id) as section_id,
  coalesce(e.progresiva_m, we.prog_start_m, pi.prog_start_m) as progresiva_m,

  -- El día del trabajo, que es por el que se busca; si la foto no cuelga de
  -- un parte se usa el día en que se tomó.
  coalesce(wo.work_date, (e.taken_at at time zone 'America/Lima')::date) as work_date,

  pci.code                                     as pci_code
from public.evidences e
left join public.work_entries  we  on we.id  = e.work_entry_id  and we.deleted_at  is null
left join public.work_orders   wo  on wo.id  = we.work_order_id and wo.deleted_at  is null
left join public.pci_items     pi  on pi.id  = e.pci_item_id    and pi.deleted_at  is null
left join public.pcis          pci on pci.id = pi.pci_id
left join public.crews         cwo on cwo.id = wo.crew_id
left join public.crews         cpi on cpi.id = pi.assigned_crew_id
left join public.activities_catalog awe on awe.id = we.activity_id
left join public.activities_catalog api on api.id = pi.activity_id
left join public.road_sections swe on swe.id = coalesce(e.section_id, we.section_id)
left join public.road_sections spi on spi.id = pi.section_id
left join public.profiles      p   on p.id   = e.created_by
where e.deleted_at is null;

grant select on public.v_evidences to authenticated;
