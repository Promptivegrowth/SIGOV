-- ═══════════════════════════════════════════════════════════════════════
-- 0050 · La comparación es entre intervenciones, no dentro de una
--
-- La ficha enseñaba las dos últimas fotos por hora de toma, y salían las dos
-- del mismo día con media hora de diferencia: el «antes» y el «después» de
-- la misma jornada. Eso no responde a lo que preguntó Elvis:
--
--   «Dos fotos: una, el anterior cómo estaba, y una actual. Esa va a ser su
--   comparativa, su plazo. Si la otra se ejecutó el primero de enero y esta
--   se ejecutó en setiembre, ese va a ser su plazo.»
--
-- Lo que quiere ver es el paso del tiempo entre dos visitas, no el rato que
-- duró una. Así que la foto actual es la de la última intervención y la
-- anterior es la de la **visita previa**, que es otro día.
--
-- Dentro de cada visita se prefiere la fase «después»: es la que muestra el
-- elemento como quedó, que es con lo que hay que comparar la próxima vez.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists public.v_inventario cascade;
drop view if exists public.v_asset_fotos cascade;

create view public.v_asset_fotos
with (security_invoker = true) as
with fotos as (
  select
    l.asset_id,
    e.id as evidence_id,
    e.storage_path,
    e.thumb_path,
    e.phase,
    e.taken_at,
    e.caption,
    e.watermarked,
    e.lat, e.lng,
    e.service_id,
    -- El día de la visita, en hora de Perú: una cuadrilla que empieza a las
    -- seis de la mañana y otra que termina a las siete de la tarde tienen
    -- que caer en el mismo día que dice el parte.
    (e.taken_at at time zone 'America/Lima')::date as visita
  from public.evidence_links l
  join public.evidences e on e.id = l.evidence_id
  where l.asset_id is not null
    and e.deleted_at is null
),
-- Una sola foto por visita: la que mejor muestra cómo quedó el elemento
mejor_de_cada_visita as (
  select distinct on (asset_id, visita)
    asset_id, visita, evidence_id, storage_path, thumb_path,
    phase, taken_at, caption, watermarked, lat, lng, service_id
  from fotos
  order by asset_id, visita,
    case phase
      when 'despues' then 1
      when 'general' then 2
      when 'durante' then 3
      else 4                    -- «antes» es el último recurso
    end,
    taken_at desc
)
select
  m.*,
  row_number() over (partition by m.asset_id order by m.visita desc) as orden
from mejor_de_cada_visita m;

comment on view public.v_asset_fotos is
  'Una fotografía por cada visita al elemento, de la más reciente a la más '
  'antigua. `orden` = 1 es como quedó la última vez y `orden` = 2 como estaba '
  'la visita anterior: esas dos son las que se comparan en la ficha.';

create view public.v_inventario
with (security_invoker = true) as
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
  greatest(
    a.last_inspected_on,
    (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
  ) as ultima_intervencion,
  (select count(*) from public.asset_interventions i where i.asset_id = a.id) as intervenciones,
  (select count(distinct i.intervened_on) from public.asset_interventions i where i.asset_id = a.id) as visitas,
  current_date - greatest(
    a.last_inspected_on,
    (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
  ) as dias_sin_intervenir,
  public.asset_semaforo(
    greatest(
      a.last_inspected_on,
      (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
    ),
    t.dias_verde, t.dias_ambar
  ) as semaforo,
  (select count(*) from public.evidence_links l
    join public.evidences e on e.id = l.evidence_id and e.deleted_at is null
   where l.asset_id = a.id) as fotos,
  (select f.storage_path from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 1) as foto_actual,
  (select f.taken_at from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 1) as foto_actual_fecha,
  (select f.storage_path from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 2) as foto_anterior,
  (select f.taken_at from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 2) as foto_anterior_fecha,
  -- Cuántos días pasaron entre una visita y la otra: es «el plazo» que
  -- Elvis quiere leer de un vistazo al comparar las dos fotos.
  (select (f1.visita - f2.visita)
     from public.v_asset_fotos f1, public.v_asset_fotos f2
    where f1.asset_id = a.id and f1.orden = 1
      and f2.asset_id = a.id and f2.orden = 2) as dias_entre_fotos
from public.road_assets a
join public.asset_types t on t.id = a.type_id
left join public.road_sections s on s.id = a.section_id
where a.deleted_at is null;

comment on view public.v_inventario is
  'El inventario vial con su semáforo de intervención y las fotografías de '
  'sus dos últimas visitas. Es lo que dibuja el mapa y lo que abre la ficha.';

-- El mapa vuelve a apoyarse en la vista, que se acaba de rehacer
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
