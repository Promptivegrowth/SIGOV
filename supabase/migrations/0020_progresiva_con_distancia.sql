-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0020 · La progresiva desde el GPS avisa si estás lejos del tramo
--
-- `progresiva_from_point` proyecta la posición sobre la línea del tramo. Si
-- quien la usa está a 200 km — probando desde la oficina, o con el tramo
-- equivocado seleccionado — la proyección cae en el extremo de la línea y
-- devuelve 0+000 sin decir nada, dejando un documento mal ubicado.
--
-- Esta versión devuelve también a qué distancia está la persona del tramo,
-- para que la interfaz pueda avisar en lugar de inventar una progresiva.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.progresiva_con_distancia(
  p_section_id uuid,
  p_lng double precision,
  p_lat double precision
) returns jsonb
language sql stable security invoker
set search_path = public, extensions
as $$
  select case
    when s.geom is null then
      jsonb_build_object('progresiva_m', null, 'distancia_m', null, 'sin_trazo', true)
    else jsonb_build_object(
      'progresiva_m', round(
        s.prog_start_m + extensions.ST_LineLocatePoint(
          s.geom, extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)
        ) * (s.prog_end_m - s.prog_start_m)
      ),
      'distancia_m', round(
        extensions.ST_Distance(
          s.geom::extensions.geography,
          extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
        )
      ),
      'sin_trazo', false
    )
  end
  from public.road_sections s
  where s.id = p_section_id and s.deleted_at is null
$$;

grant execute on function public.progresiva_con_distancia(uuid, double precision, double precision) to authenticated;
