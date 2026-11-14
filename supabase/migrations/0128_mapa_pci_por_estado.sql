-- ═══════════════════════════════════════════════════════════════════════
-- 0128 · El mapa del PCI por estado real (OBS 7 y 8)
--
-- pci_geojson entrega «estado», la clave del color: por atender (gris), en
-- ejecución (azul), por validar y validado SERVICON (cian), observado
-- (morado), conforme COVINCA (verde); por vencer (amarillo) y vencido (rojo)
-- solo para lo que sigue abierto. La web y la app pintan igual.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.pci_geojson(p_service_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(
          extensions.ST_LineInterpolatePoint(
            s.geom,
            least(0.999, greatest(0.001,
              public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_start_m)))
          ))::jsonb,
        'properties', jsonb_build_object(
          'id', i.id, 'pci_id', i.pci_id, 'pci_code', p.code,
          'item', i.item_number,
          'descripcion', left(i.description, 160),
          'semaforo', public.pci_item_semaforo(i.due_date, i.term_days, i.status),
          -- El color del mapa, igual en la web y en la app (OBS 7 y 8): el plazo
          -- solo pinta lo que sigue abierto; lo culminado va por su revisión
          'estado', case
            when i.status in ('pendiente', 'en_atencion') and i.due_date < public.hoy_peru() then 'vencido'
            when i.status in ('pendiente', 'en_atencion') and i.due_date - public.hoy_peru() <= 2 then 'por_vencer'
            when i.status = 'pendiente' then 'por_atender'
            when i.status = 'en_atencion' then 'en_ejecucion'
            when i.status = 'observado' then 'observado'
            when i.status = 'validado' then 'conforme'
            when i.validado_servicon_at is not null then 'validado_servicon'
            else 'por_validar'
          end,
          'crew', (select c.code from public.crews c where c.id = i.assigned_crew_id),
          'status', i.status, 'due_date', i.due_date,
          'days_left', (i.due_date - current_date),
          'priority', p.priority,
          'section', s.name,
          'progresiva', public.fmt_progresiva(i.prog_start_m),
          -- Más de 20 m entre progresivas: un tramo, no un punto (Elvis, 26/10)
          'linea', case when i.prog_end_m is not null and i.prog_end_m - i.prog_start_m > 20 then
            extensions.ST_AsGeoJSON(extensions.ST_LineSubstring(
              s.geom,
              least(0.999, greatest(0.0, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_start_m))),
              least(1.0, greatest(0.001, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_end_m)))
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
$$;
