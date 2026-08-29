-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0013 · RPCs GeoJSON para el mapa interactivo
-- Devuelven FeatureCollection listo para MapLibre: una sola llamada por capa.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sections_geojson(p_service_id uuid)
returns jsonb
language sql stable security invoker
set search_path = public, extensions as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(s.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', s.id, 'code', s.code, 'name', s.name,
          'route', s.route_code, 'color', s.color,
          'prog_start', s.prog_start_m, 'prog_end', s.prog_end_m,
          'length_km', round((s.prog_end_m - s.prog_start_m) / 1000.0, 1),
          'surface', s.surface, 'lanes', s.lanes,
          'label', s.name || '  (' || public.fmt_progresiva(s.prog_start_m)
                   || ' – ' || public.fmt_progresiva(s.prog_end_m) || ')'
        )
      )
    ), '[]'::jsonb)
  )
  from public.road_sections s
  where s.service_id = p_service_id and s.deleted_at is null and s.geom is not null
$$;

create or replace function public.assets_geojson(
  p_service_id uuid,
  p_type_codes text[] default null,
  p_conditions text[] default null
) returns jsonb
language sql stable security invoker
set search_path = public, extensions as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(a.lng, a.lat)),
        'properties', jsonb_build_object(
          'id', a.id, 'code', a.code, 'name', a.name,
          'type_code', t.code, 'type_name', t.name, 'category', t.category,
          'color', t.color, 'icon', t.icon,
          'condition', a.condition,
          'section', s.name,
          'progresiva', public.fmt_progresiva(a.progresiva_m),
          'progresiva_m', a.progresiva_m,
          'side', a.side,
          'last_inspected', a.last_inspected_on,
          'attributes', a.attributes
        )
      )
    ), '[]'::jsonb)
  )
  from public.road_assets a
  join public.asset_types t on t.id = a.type_id
  left join public.road_sections s on s.id = a.section_id
  where a.service_id = p_service_id
    and a.deleted_at is null
    and a.lat is not null and a.lng is not null
    and (p_type_codes is null or t.code = any(p_type_codes))
    and (p_conditions is null or a.condition::text = any(p_conditions))
$$;

create or replace function public.evidences_geojson(
  p_service_id uuid,
  p_from date default (current_date - 30),
  p_to date default current_date,
  p_limit int default 2000
) returns jsonb
language sql stable security invoker
set search_path = public, extensions as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(f), '[]'::jsonb)
  )
  from (
    select jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(e.lng, e.lat)),
      'properties', jsonb_build_object(
        'id', e.id, 'phase', e.phase, 'taken_at', e.taken_at,
        'path', e.storage_path, 'accuracy', e.accuracy_m,
        'progresiva', public.fmt_progresiva(e.progresiva_m),
        'caption', e.caption,
        'activity', a.name, 'color', coalesce(a.color, '#2b5bd1'),
        'crew', c.name
      )
    ) as f
    from public.evidences e
    left join public.work_entries we on we.id = e.work_entry_id
    left join public.activities_catalog a on a.id = we.activity_id
    left join public.work_orders wo on wo.id = we.work_order_id
    left join public.crews c on c.id = wo.crew_id
    where e.service_id = p_service_id
      and e.deleted_at is null
      and e.taken_at::date between p_from and p_to
    order by e.taken_at desc
    limit p_limit
  ) t
$$;

create or replace function public.pci_geojson(p_service_id uuid)
returns jsonb
language sql stable security invoker
set search_path = public, extensions as $$
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
          'progresiva', public.fmt_progresiva(i.prog_start_m)
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
$$;

/** Registros de campo como GeoJSON, filtrable por cuadrilla y actividad */
create or replace function public.work_entries_geojson(
  p_service_id uuid,
  p_from date default (current_date - 30),
  p_to date default current_date,
  p_crew_ids uuid[] default null,
  p_activity_ids uuid[] default null
) returns jsonb
language sql stable security invoker
set search_path = public, extensions as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(we.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', we.id,
          'actividad', a.name, 'categoria', a.category,
          'color', coalesce(a.color, '#2b5bd1'),
          'cantidad', we.quantity, 'unidad', u.symbol,
          'cuadrilla', c.name, 'cuadrilla_color', c.color,
          'fecha', wo.work_date,
          'tramo', s.name,
          'progresiva', public.fmt_progresiva(we.prog_start_m),
          'evidencias', (select count(*) from public.evidences e
                          where e.work_entry_id = we.id and e.deleted_at is null)
        )
      )
    ), '[]'::jsonb)
  )
  from public.work_entries we
  join public.work_orders wo on wo.id = we.work_order_id
  join public.activities_catalog a on a.id = we.activity_id
  join public.road_sections s on s.id = we.section_id
  left join public.crews c on c.id = wo.crew_id
  left join public.units u on u.id = we.unit_id
  where we.service_id = p_service_id
    and we.deleted_at is null
    and we.geom is not null
    and wo.work_date between p_from and p_to
    and (p_crew_ids is null or wo.crew_id = any(p_crew_ids))
    and (p_activity_ids is null or we.activity_id = any(p_activity_ids))
$$;

grant execute on function public.sections_geojson(uuid) to authenticated;
grant execute on function public.assets_geojson(uuid, text[], text[]) to authenticated;
grant execute on function public.evidences_geojson(uuid, date, date, int) to authenticated;
grant execute on function public.pci_geojson(uuid) to authenticated;
grant execute on function public.work_entries_geojson(uuid, date, date, uuid[], uuid[]) to authenticated;
