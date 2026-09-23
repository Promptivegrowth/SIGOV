-- ═══════════════════════════════════════════════════════════════════════
-- 0051 · El inventario, sin una subconsulta por fila
--
-- La app de campo no lograba bajar el inventario entero: la primera página
-- de mil elementos tardaba siete segundos y la segunda moría con
-- «canceling statement due to statement timeout». El supervisor veía mil de
-- los dos mil setecientos elementos de su contrato y no tenía forma de
-- saberlo: el mapa simplemente enseñaba menos puntos.
--
-- La causa estaba en cómo se escribió `v_inventario` en la 0048: nueve
-- subconsultas correlacionadas por fila —la última intervención, el conteo
-- de intervenciones, el de visitas, el de fotos, las dos fotografías con sus
-- fechas y los días entre ambas—. Para devolver la segunda página el motor
-- tenía que calcular las nueve sobre dos mil filas y tirar la mitad.
--
-- Aquí se agrega una vez por lado y se une. Es la misma información y las
-- mismas columnas; cambia que ahora se calcula en un paso en vez de en uno
-- por elemento.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists public.v_inventario cascade;

create view public.v_inventario
with (security_invoker = true) as
with intervenciones as (
  select
    asset_id,
    max(intervened_on)              as ultima,
    count(*)                        as total,
    count(distinct intervened_on)   as visitas
  from public.asset_interventions
  group by asset_id
),
conteo_fotos as (
  select l.asset_id, count(*) as fotos
  from public.evidence_links l
  join public.evidences e on e.id = l.evidence_id and e.deleted_at is null
  where l.asset_id is not null
  group by l.asset_id
),
actual as (
  select asset_id, storage_path, taken_at, visita
  from public.v_asset_fotos where orden = 1
),
anterior as (
  select asset_id, storage_path, taken_at, visita
  from public.v_asset_fotos where orden = 2
)
select
  a.id,
  a.service_id,
  a.client_id,
  a.code,
  a.name,
  a.type_id,
  t.code            as type_code,
  t.name            as type_name,
  t.category        as type_category,
  t.icon            as type_icon,
  t.color           as type_color,
  t.dias_verde,
  t.dias_ambar,
  a.section_id,
  s.name            as section_name,
  s.code            as section_code,
  a.progresiva_m,
  public.fmt_progresiva(a.progresiva_m) as progresiva_txt,
  a.side,
  a.lat, a.lng,
  a.condition,
  a.install_year,
  a.attributes,
  a.notes,
  greatest(a.last_inspected_on, i.ultima)       as ultima_intervencion,
  coalesce(i.total, 0)                          as intervenciones,
  coalesce(i.visitas, 0)                        as visitas,
  current_date - greatest(a.last_inspected_on, i.ultima) as dias_sin_intervenir,
  public.asset_semaforo(
    greatest(a.last_inspected_on, i.ultima), t.dias_verde, t.dias_ambar
  )                                             as semaforo,
  coalesce(cf.fotos, 0)                         as fotos,
  act.storage_path                              as foto_actual,
  act.taken_at                                  as foto_actual_fecha,
  ant.storage_path                              as foto_anterior,
  ant.taken_at                                  as foto_anterior_fecha,
  (act.visita - ant.visita)                     as dias_entre_fotos
from public.road_assets a
join public.asset_types t on t.id = a.type_id
left join public.road_sections s on s.id = a.section_id
left join intervenciones i  on i.asset_id  = a.id
left join conteo_fotos cf   on cf.asset_id = a.id
left join actual act        on act.asset_id = a.id
left join anterior ant      on ant.asset_id = a.id
where a.deleted_at is null;

comment on view public.v_inventario is
  'El inventario vial con su semáforo de intervención y las fotografías de '
  'sus dos últimas visitas. Es lo que dibuja el mapa y lo que abre la ficha.';

-- El mapa se apoya en la vista, que se acaba de rehacer
create or replace function public.assets_geojson(
  p_service_id uuid,
  p_type_codes text[] default null,
  p_conditions text[] default null,
  p_semaforos text[] default null,
  p_section_id uuid default null
) returns jsonb
language sql stable
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(v.lng, v.lat)),
        'properties', jsonb_build_object(
          'id', v.id, 'code', v.code, 'name', v.name,
          'type_code', v.type_code, 'type_name', v.type_name,
          'category', v.type_category,
          'color', v.type_color, 'icon', v.type_icon,
          'condition', v.condition,
          'section', v.section_name,
          'section_id', v.section_id,
          'progresiva', v.progresiva_txt,
          'progresiva_m', v.progresiva_m,
          'side', v.side,
          'semaforo', v.semaforo,
          'dias', v.dias_sin_intervenir,
          'ultima_intervencion', v.ultima_intervencion,
          'fotos', v.fotos,
          'visitas', v.visitas,
          'intervenciones', v.intervenciones,
          'attributes', v.attributes
        )
      )
    ), '[]'::jsonb)
  )
  from public.v_inventario v
  where v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
    and (p_type_codes is null or v.type_code = any(p_type_codes))
    and (p_conditions is null or v.condition::text = any(p_conditions))
    and (p_semaforos is null or v.semaforo::text = any(p_semaforos))
    and (p_section_id is null or v.section_id = p_section_id)
$$;

-- Lo que el paginado ordena: sin este índice, cada página vuelve a ordenar
-- los dos mil setecientos elementos del contrato.
create index if not exists ix_assets_servicio_prog
  on public.road_assets (service_id, progresiva_m)
  where deleted_at is null;
