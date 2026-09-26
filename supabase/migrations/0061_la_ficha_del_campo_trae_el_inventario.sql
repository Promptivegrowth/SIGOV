-- ═══════════════════════════════════════════════════════════════════════
-- 0061 · La ficha del celular trae los datos del inventario
--
-- El supervisor abre la ficha de un elemento en la vía, muchas veces sin
-- señal. Lo que el inventario oficial registra de ese elemento —la
-- clasificación del MTC, las dimensiones, el material, el encauzamiento—
-- tiene que estar ya en el celular, no pedirse al tocar el punto.
--
-- Se añaden a lo que baja la app de campo los atributos del elemento y su
-- progresiva final. De los atributos se quitan las coordenadas que el
-- inventario traía y que el sistema guarda como respaldo —la original del
-- Excel cuando no era de fiar, la del extremo final—: el celular no las
-- usa y son lo que más pesa.
-- ═══════════════════════════════════════════════════════════════════════

-- La progresiva final, al final de la vista: añadir una columna al final
-- no obliga a rehacer las funciones que dependen de ella.
create or replace view public.v_inventario
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
  f.dias_entre      as dias_entre_fotos,
  a.progresiva_fin_m
from public.road_assets a
join public.asset_types t on t.id = a.type_id
left join public.road_sections s on s.id = a.section_id
left join intervenciones i  on i.asset_id  = a.id
left join conteo_fotos cf   on cf.asset_id = a.id
left join dos_fotos f       on f.asset_id  = a.id
where a.deleted_at is null;

create or replace function public.inventario_para_campo(p_service_id uuid)
returns jsonb
language sql stable security definer
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
    'progresiva_fin_m', v.progresiva_fin_m,
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
    'dias_entre_fotos', v.dias_entre_fotos,
    'atributos', coalesce(v.attributes, '{}'::jsonb)
                   - 'coordenada_excel' - 'coordenada_final' - 'inventario'
  ) order by v.progresiva_m), '[]'::jsonb)
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
$$;

revoke execute on function public.inventario_para_campo(uuid) from public, anon;
grant execute on function public.inventario_para_campo(uuid) to authenticated;
