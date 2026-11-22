-- ═══════════════════════════════════════════════════════════════════════════
-- 0137 · Bandeja de observaciones y Niveles de servicio (revisión visual, T3)
--
-- Guía 9.4 / 9.8 y maquetas V03/V07: una bandeja única de observaciones de
-- revisión (origen SERVICON o COVINCA) con pestañas Abiertas / Respondidas /
-- Cerradas, filtros por PCI, plazo, cuadrilla y fechas, y búsqueda. Niveles
-- de servicio: Sector > Actividad > Fecha > intervención sobre lo ejecutado
-- (al Visor, solo lo publicado). Todo con los permisos de quien consulta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bandeja_observaciones(
  p_service uuid, p_estado text default 'abierta', p_pci uuid default null, p_plazo integer default null,
  p_crew uuid default null, p_desde date default null, p_hasta date default null, p_q text default null,
  p_origen text default null, p_limite integer default 50, p_desde_fila integer default 0)
returns json language sql stable security invoker set search_path to 'public' as $$
  with base as (
    select o.*, i.item_number, i.term_days, i.pci_id item_pci, p.code pci_code, c.name crew_name,
           (select e.texto from public.revision_observacion_eventos e where e.observacion_id = o.id and e.tipo in ('respuesta', 'publicada')
             order by e.cuando desc limit 1) ultima_respuesta,
           (select e.cuando from public.revision_observacion_eventos e where e.observacion_id = o.id
             order by e.cuando desc limit 1) ultimo_evento
      from public.revision_observaciones o
      left join public.pci_items i on i.id = o.pci_item_id
      left join public.pcis p on p.id = coalesce(o.pci_id, i.pci_id)
      left join public.crews c on c.id = o.crew_id
     where o.service_id = p_service
       and (p_pci is null or coalesce(o.pci_id, i.pci_id) = p_pci)
       and (p_plazo is null or i.term_days = p_plazo)
       and (p_crew is null or o.crew_id = p_crew)
       and (p_origen is null or o.origen = p_origen)
       and (p_desde is null or o.creada_at::date >= p_desde)
       and (p_hasta is null or o.creada_at::date <= p_hasta)
       and (p_q is null or o.codigo ilike '%' || p_q || '%' or o.motivo ilike '%' || p_q || '%'
            or p.code ilike '%' || p_q || '%' or i.item_number::text = p_q)
  )
  select json_build_object(
    'abiertas', (select count(*) from base where estado = 'abierta'),
    'respondidas', (select count(*) from base where estado = 'respondida'),
    'cerradas', (select count(*) from base where estado = 'cerrada'),
    'total', (select count(*) from base where p_estado is null or estado = p_estado),
    'filas', (select coalesce(json_agg(x), '[]'::json) from (
       select json_build_object('id', id, 'codigo', codigo, 'pci_id', coalesce(pci_id, item_pci), 'pci', pci_code,
                                'item_id', pci_item_id, 'item', item_number, 'plazo', term_days, 'work_order_id', work_order_id,
                                'origen', origen, 'fase', fase, 'motivo', motivo, 'estado', estado, 'cuadrilla', crew_name,
                                'creada_at', creada_at, 'ultima_respuesta', ultima_respuesta, 'ultimo_evento', ultimo_evento,
                                'version', version_observada) x
         from base where p_estado is null or estado = p_estado
        order by creada_at desc offset greatest(p_desde_fila, 0) limit least(greatest(p_limite, 1), 200)) z)
  )
$$;
revoke all on function public.bandeja_observaciones(uuid, text, uuid, integer, uuid, date, date, text, text, integer, integer) from public, anon;
grant execute on function public.bandeja_observaciones(uuid, text, uuid, integer, uuid, date, date, text, text, integer, integer) to authenticated;

-- Niveles de servicio: lo ejecutado por sector y actividad, con su evidencia
create or replace function public.niveles_servicio(
  p_service uuid, p_desde date, p_hasta date, p_sector text default null, p_activity uuid default null,
  p_crew uuid default null, p_q text default null)
returns json language sql stable security invoker set search_path to 'public' as $$
  with ej as (
    select w.id, o.id work_order_id, o.work_date, o.crew_id, c.name crew_name, w.activity_id, a.code activity_code,
           a.name activity_name, coalesce(u2.symbol, u.symbol) unidad, w.quantity, w.prog_start_m, w.prog_end_m, w.side,
           (select s.code from public.sector_de(w.section_id, w.prog_start_m) s) sector,
           w.pci_item_id, o.publicacion_version, o.status,
           (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null) fotos
      from public.work_entries w
      join public.work_orders o on o.id = w.work_order_id
      join public.activities_catalog a on a.id = w.activity_id
      left join public.units u on u.id = a.unit_id
      left join public.units u2 on u2.id = w.unit_id
      left join public.crews c on c.id = o.crew_id
     where w.service_id = p_service and w.deleted_at is null and o.deleted_at is null
       and o.work_date between p_desde and p_hasta
       and (p_activity is null or w.activity_id = p_activity)
       and (p_crew is null or o.crew_id = p_crew)
  ), filtrado as (
    select * from ej
     where (p_sector is null or sector = p_sector)
       and (p_q is null or activity_code ilike '%' || p_q || '%' or activity_name ilike '%' || p_q || '%' or crew_name ilike '%' || p_q || '%')
  )
  select json_build_object(
    'sectores', (select coalesce(json_agg(json_build_object('sector', sector, 'intervenciones', n, 'actividades', na) order by sector), '[]'::json)
                   from (select coalesce(sector, 'Sin sector') sector, count(*) n, count(distinct activity_id) na from ej group by 1) s),
    'actividades', (select coalesce(json_agg(json_build_object('activity_id', activity_id, 'codigo', activity_code, 'actividad', activity_name,
                                     'unidad', unidad, 'intervenciones', n, 'metrado', m) order by activity_code), '[]'::json)
                      from (select activity_id, activity_code, activity_name, unidad, count(*) n, sum(quantity) m from filtrado group by 1, 2, 3, 4) a),
    'intervenciones', (select coalesce(json_agg(json_build_object('id', id, 'work_order_id', work_order_id, 'fecha', work_date,
                                     'cuadrilla', crew_name, 'sector', sector, 'codigo', activity_code, 'actividad', activity_name,
                                     'unidad', unidad, 'metrado', quantity, 'prog_inicio', prog_start_m, 'prog_fin', prog_end_m,
                                     'lado', side, 'fotos', fotos, 'pci_item_id', pci_item_id, 'publicado', publicacion_version > 0,
                                     'estado', status) order by work_date desc, activity_code), '[]'::json)
                         from (select * from filtrado order by work_date desc limit 300) f)
  )
$$;
revoke all on function public.niveles_servicio(uuid, date, date, text, uuid, uuid, text) from public, anon;
grant execute on function public.niveles_servicio(uuid, date, date, text, uuid, uuid, text) to authenticated;
