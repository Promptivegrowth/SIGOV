-- ═══════════════════════════════════════════════════════════════════════
-- 0175 · Ronda 5 (VIS-02): Niveles de servicio dice por qué una
-- intervención no tiene sector. El sector se deriva del subtramo y la
-- progresiva con el catálogo aprobado (service_sectors); cuando la
-- progresiva cae fuera de su subtramo, o el subtramo no tiene sectores,
-- queda «Sin sector» con el motivo, sin asignarlo por suposición. El filtro
-- «Sin sector» ahora devuelve esas filas.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.niveles_servicio(p_service uuid, p_desde date, p_hasta date, p_sector text DEFAULT NULL::text, p_activity uuid DEFAULT NULL::uuid, p_crew uuid DEFAULT NULL::uuid, p_q text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with ej as (
    select w.id, o.id work_order_id, o.work_date, o.crew_id, c.name crew_name, w.activity_id, a.code activity_code,
           a.name activity_name, coalesce(u2.symbol, u.symbol) unidad, w.quantity, w.prog_start_m, w.prog_end_m, w.side,
           (select s.code from public.sector_de(w.section_id, w.prog_start_m) s) sector,
           -- VIS-02: por qué no tiene sector (no se asigna por suposición)
           case when w.section_id is null then 'Sin subtramo registrado'
                when w.prog_start_m is null then 'Sin progresiva registrada'
                when rs.id is not null and (w.prog_start_m < rs.prog_start_m or w.prog_start_m > rs.prog_end_m)
                  then format('Progresiva %s fuera del subtramo %s (%s – %s)', public.fmt_progresiva(w.prog_start_m), rs.code,
                              public.fmt_progresiva(rs.prog_start_m), public.fmt_progresiva(rs.prog_end_m))
                when not exists (select 1 from public.service_sectors z where z.section_id = w.section_id)
                  then format('El subtramo %s no tiene sectores en el catálogo', coalesce(rs.code, ''))
           end sector_motivo,
           rs.code subtramo,
           w.pci_item_id, o.publicacion_version, o.status,
           (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null) fotos
      from public.work_entries w
      join public.work_orders o on o.id = w.work_order_id
      join public.activities_catalog a on a.id = w.activity_id
      left join public.units u on u.id = a.unit_id
      left join public.units u2 on u2.id = w.unit_id
      left join public.crews c on c.id = o.crew_id
      left join public.road_sections rs on rs.id = w.section_id
     where w.service_id = p_service and w.deleted_at is null and o.deleted_at is null
       and o.work_date between p_desde and p_hasta
       and (p_activity is null or w.activity_id = p_activity)
       and (p_crew is null or o.crew_id = p_crew)
  ), filtrado as (
    select * from ej
     where (p_sector is null or sector = p_sector or (p_sector = 'Sin sector' and sector is null))
       and (p_q is null or activity_code ilike '%' || p_q || '%' or activity_name ilike '%' || p_q || '%' or crew_name ilike '%' || p_q || '%')
  )
  select json_build_object(
    'sectores', (select coalesce(json_agg(json_build_object('sector', sector, 'intervenciones', n, 'actividades', na) order by sector), '[]'::json)
                   from (select coalesce(sector, 'Sin sector') sector, count(*) n, count(distinct activity_id) na from ej group by 1) s),
    'sin_sector', (select coalesce(json_agg(json_build_object('motivo', m, 'intervenciones', n) order by n desc), '[]'::json)
                     from (select regexp_replace(sector_motivo, '^Progresiva .* fuera del subtramo ([^ ]+).*$', 'Progresiva fuera del subtramo \1') m, count(*) n
                             from ej where sector is null group by 1) z),
    'actividades', (select coalesce(json_agg(json_build_object('activity_id', activity_id, 'codigo', activity_code, 'actividad', activity_name,
                                     'unidad', unidad, 'intervenciones', n, 'metrado', m) order by activity_code), '[]'::json)
                      from (select activity_id, activity_code, activity_name, unidad, count(*) n, sum(quantity) m from filtrado group by 1, 2, 3, 4) a),
    'intervenciones', (select coalesce(json_agg(json_build_object('id', id, 'work_order_id', work_order_id, 'fecha', work_date,
                                     'cuadrilla', crew_name, 'sector', sector, 'sector_motivo', sector_motivo, 'subtramo', subtramo,
                                     'codigo', activity_code, 'actividad', activity_name,
                                     'unidad', unidad, 'metrado', quantity, 'prog_inicio', prog_start_m, 'prog_fin', prog_end_m,
                                     'lado', side, 'fotos', fotos, 'pci_item_id', pci_item_id, 'publicado', publicacion_version > 0,
                                     'estado', status) order by work_date desc, activity_code), '[]'::json)
                         from (select * from filtrado order by work_date desc limit 300) f)
  )
$function$;
