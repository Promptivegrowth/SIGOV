-- ═══════════════════════════════════════════════════════════════════════
-- 0052 · Una sola función del mapa, y las fotos en una pasada
--
-- Dos problemas que salieron al medir.
--
-- El primero: `create or replace function` con una firma distinta no
-- reemplaza nada, crea otra. Al añadirle a `assets_geojson` los parámetros
-- de semáforo y tramo quedaron conviviendo la de tres argumentos y la de
-- cinco. PostgREST elegía una u otra según qué parámetros le mandaran, y
-- llamarla solo con el contrato devolvía `null` en vez del mapa. Nadie lo
-- notó porque el panel siempre manda los cinco.
--
-- El segundo: la vista consultaba `v_asset_fotos` dos veces, una para la
-- foto actual y otra para la anterior, y cada consulta recorre la ventana
-- completa. Se resuelve pivotando en una sola pasada.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── La función vieja, fuera ───────────────────────────────────────────
drop function if exists public.assets_geojson(uuid, text[], text[]);

-- ─── Las dos fotos, en una sola lectura ────────────────────────────────

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
-- Las dos últimas visitas de cada elemento, pivotadas: una sola lectura de
-- la ventana en vez de una por columna.
dos_fotos as (
  select
    asset_id,
    max(storage_path) filter (where orden = 1) as foto_actual,
    max(taken_at)     filter (where orden = 1) as fecha_actual,
    max(storage_path) filter (where orden = 2) as foto_anterior,
    max(taken_at)     filter (where orden = 2) as fecha_anterior,
    max(visita)       filter (where orden = 1)
      - max(visita)   filter (where orden = 2) as dias_entre
  from public.v_asset_fotos
  where orden <= 2
  group by asset_id
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
  f.foto_actual,
  f.fecha_actual    as foto_actual_fecha,
  f.foto_anterior,
  f.fecha_anterior  as foto_anterior_fecha,
  f.dias_entre      as dias_entre_fotos
from public.road_assets a
join public.asset_types t on t.id = a.type_id
left join public.road_sections s on s.id = a.section_id
left join intervenciones i  on i.asset_id  = a.id
left join conteo_fotos cf   on cf.asset_id = a.id
left join dos_fotos f       on f.asset_id  = a.id
where a.deleted_at is null;

comment on view public.v_inventario is
  'El inventario vial con su semáforo de intervención y las fotografías de '
  'sus dos últimas visitas. Es lo que dibuja el mapa y lo que abre la ficha.';

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
          'intervenciones', v.intervenciones
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

-- ─── Lo que la app de campo pide, ya resuelto en el servidor ───────────
--
-- El celular no necesita las columnas de administración —notas, atributos,
-- año de instalación— y sí necesita que la respuesta entre por una red de
-- carretera. Esta función devuelve el inventario listo para dibujar, en una
-- sola llamada y sin paginar.

create or replace function public.inventario_para_campo(p_service_id uuid)
returns jsonb
language sql stable
set search_path to 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'code', v.code,
    'name', v.name,
    'type_code', v.type_code,
    'type_name', v.type_name,
    'type_category', v.type_category,
    'type_color', v.type_color,
    'section_id', v.section_id,
    'section_name', v.section_name,
    'progresiva_m', v.progresiva_m,
    'progresiva_txt', v.progresiva_txt,
    'side', v.side,
    'lat', v.lat,
    'lng', v.lng,
    'condition', v.condition,
    'semaforo', v.semaforo,
    'dias_sin_intervenir', v.dias_sin_intervenir,
    'ultima_intervencion', v.ultima_intervencion,
    'intervenciones', v.intervenciones,
    'visitas', v.visitas,
    'fotos', v.fotos,
    'foto_actual', v.foto_actual,
    'foto_actual_fecha', v.foto_actual_fecha,
    'foto_anterior', v.foto_anterior,
    'foto_anterior_fecha', v.foto_anterior_fecha,
    'dias_entre_fotos', v.dias_entre_fotos
  ) order by v.progresiva_m), '[]'::jsonb)
  from public.v_inventario v
  where v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
$$;

comment on function public.inventario_para_campo is
  'El inventario listo para el mapa del celular: una sola llamada, sin '
  'paginar y sin las columnas que la app no dibuja.';
