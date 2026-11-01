-- ═══════════════════════════════════════════════════════════════════════
-- 0110 · Videos de Elvis del 26/10 (inventario vial y PCI en mapa)
--
-- 1. Una foto de intervención tomada por error se puede quitar («tendría
--    que haber la opción de eliminar»). Al quitarla se va con ella lo que
--    provocó: su vínculo, la intervención que contó y, si era la última,
--    el «observado» del elemento. El estado se recalcula con lo que queda.
-- 2. PCI en mapa: los ítems con intervalo (tachas, limpieza de berma de
--    500 m) se dibujan como un tramo de vía, no como un punto; los
--    puntuales (señales) siguen como punto. pci_geojson suma la línea.
-- 3. Los elementos que el Excel del inventario ubica lejos de su vía (en
--    la Vía Alterna La Oreja hay cuatro a 300 y 800 m) se ponen sobre la vía
--    por su progresiva. Las coordenadas del Excel quedan guardadas.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Quitar una foto de intervención ──────────────────────────────
alter table public.asset_interventions
  add column if not exists evidence_id uuid references public.evidences(id) on delete set null;

create or replace function public.t_ev_foto_de_inventario()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fecha date := (coalesce(new.stamped_at, new.taken_at, now()) at time zone 'America/Lima')::date;
  v_cuadrilla uuid;
begin
  if new.asset_id is null or new.estado_activo is null or new.work_entry_id is not null then
    return null;
  end if;

  -- La foto queda en el historial del elemento; la base no se toca
  insert into public.evidence_links (evidence_id, service_id, asset_id, created_by, note)
  select new.id, new.service_id, new.asset_id, new.created_by,
         case when new.estado_activo = 'ok' then 'Intervención en campo · OK' else 'Observación en campo' end
  where not exists (select 1 from public.evidence_links l where l.evidence_id = new.id and l.asset_id = new.asset_id);

  if new.estado_activo = 'ok' then
    select id into v_cuadrilla from public.crews
     where service_id = new.service_id and leader_id = new.created_by and deleted_at is null limit 1;
    insert into public.asset_interventions (service_id, asset_id, intervened_on, action, notes, crew_id, created_by, evidence_id)
    values (new.service_id, new.asset_id, v_fecha, 'Intervención con foto', new.caption, v_cuadrilla, new.created_by, new.id);
    update public.road_assets
       set last_inspected_on = greatest(coalesce(last_inspected_on, v_fecha), v_fecha),
           observado = false, observacion = null, observado_at = null, updated_at = now()
     where id = new.asset_id;
  else
    update public.road_assets
       set observado = true, observacion = coalesce(nullif(trim(new.caption), ''), 'Observado en campo'),
           observado_at = now(), updated_at = now()
     where id = new.asset_id;
  end if;
  return null;
end $$;

create or replace function public.t_ev_foto_de_inventario_quitada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ultima public.evidences;
begin
  if new.asset_id is null or new.estado_activo is null or new.work_entry_id is not null then return null; end if;
  if old.deleted_at is not null or new.deleted_at is null then return null; end if;

  delete from public.evidence_links where evidence_id = new.id;
  -- La intervención que contó esta foto (las anteriores a 0110 no guardaban
  -- su foto: se reconocen por elemento, autor, día y nota)
  delete from public.asset_interventions where id = (
    select ai.id from public.asset_interventions ai
     where ai.evidence_id = new.id
        or (ai.evidence_id is null and ai.asset_id = new.asset_id and ai.created_by is not distinct from new.created_by
            and ai.action = 'Intervención con foto'
            and ai.intervened_on = (coalesce(new.stamped_at, new.taken_at, new.created_at) at time zone 'America/Lima')::date
            and ai.notes is not distinct from new.caption)
     order by (ai.evidence_id = new.id) desc nulls last, ai.created_at desc
     limit 1);

  -- El estado del elemento sale de la foto de intervención más reciente que queda
  select * into ultima from public.evidences e
   where e.asset_id = new.asset_id and e.estado_activo is not null and e.work_entry_id is null and e.deleted_at is null
   order by coalesce(e.stamped_at, e.taken_at) desc limit 1;

  update public.road_assets ra
     set observado = coalesce(ultima.estado_activo = 'observado', false),
         observacion = case when ultima.estado_activo = 'observado'
                            then coalesce(nullif(trim(ultima.caption), ''), 'Observado en campo') end,
         observado_at = case when ultima.estado_activo = 'observado' then coalesce(ultima.created_at, now()) end,
         last_inspected_on = (select max(ai.intervened_on) from public.asset_interventions ai where ai.asset_id = ra.id),
         updated_at = now()
   where ra.id = new.asset_id;
  return null;
end $$;

drop trigger if exists t_ev_foto_de_inventario_quitada on public.evidences;
create trigger t_ev_foto_de_inventario_quitada after update of deleted_at on public.evidences
  for each row execute function public.t_ev_foto_de_inventario_quitada();

-- ─── 2. Ítems PCI con intervalo: su tramo de vía ─────────────────────
create or replace function public.pci_geojson(p_service_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(
          extensions.ST_LineInterpolatePoint(
            s.geom,
            least(0.999, greatest(0.001,
              (i.prog_start_m - s.prog_start_m) / nullif(s.prog_end_m - s.prog_start_m, 0)))
          ))::jsonb,
        'properties', jsonb_build_object(
          'id', i.id, 'pci_id', i.pci_id, 'pci_code', p.code,
          'item', i.item_number,
          'descripcion', left(i.description, 160),
          'semaforo', public.pci_item_semaforo(i.due_date, i.term_days, i.status),
          'status', i.status, 'due_date', i.due_date,
          'days_left', (i.due_date - current_date),
          'priority', p.priority,
          'section', s.name,
          'progresiva', public.fmt_progresiva(i.prog_start_m),
          -- Más de 20 m entre progresivas: un tramo, no un punto (Elvis, 26/10)
          'linea', case when i.prog_end_m is not null and i.prog_end_m - i.prog_start_m > 20 then
            extensions.ST_AsGeoJSON(extensions.ST_LineSubstring(
              s.geom,
              least(0.999, greatest(0.0, (i.prog_start_m - s.prog_start_m) / nullif(s.prog_end_m - s.prog_start_m, 0))),
              least(1.0, greatest(0.001, (i.prog_end_m - s.prog_start_m) / nullif(s.prog_end_m - s.prog_start_m, 0)))
            ))::jsonb end
        )
      )
    ), '[]'::jsonb)
  )
  from public.pci_items i
  join public.pcis p on p.id = i.pci_id
  join public.road_sections s on s.id = i.section_id
  where i.service_id = p_service_id
    and i.deleted_at is null
    and s.geom is not null
    and i.prog_start_m is not null
$function$;

-- ─── 3. Elementos fuera de su vía, a su progresiva ───────────────────
alter table public.road_assets
  add column if not exists lat_inventario double precision,
  add column if not exists lng_inventario double precision;
comment on column public.road_assets.lat_inventario is 'Latitud del Excel del inventario, cuando caía lejos de la vía y se reubicó por progresiva';

with lejos as (
  select ra.id,
         extensions.ST_LineInterpolatePoint(s.geom,
           least(1.0, greatest(0.0, (ra.progresiva_m - s.prog_start_m) / nullif(s.prog_end_m - s.prog_start_m, 0)))) as punto
    from public.road_assets ra
    join public.road_sections s on s.id = ra.section_id
   where ra.deleted_at is null and ra.lat is not null and ra.progresiva_m is not null and s.geom is not null
     and extensions.ST_Distance(
           extensions.ST_SetSRID(extensions.ST_MakePoint(ra.lng, ra.lat), 4326)::extensions.geography,
           s.geom::extensions.geography) > 150
)
update public.road_assets ra
   set lat_inventario = coalesce(ra.lat_inventario, ra.lat),
       lng_inventario = coalesce(ra.lng_inventario, ra.lng),
       lat = extensions.ST_Y(l.punto),
       lng = extensions.ST_X(l.punto),
       geom = extensions.ST_SetSRID(l.punto, 4326),
       updated_at = now()
  from lejos l
 where ra.id = l.id;
