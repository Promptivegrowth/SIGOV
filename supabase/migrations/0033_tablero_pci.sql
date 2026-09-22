-- ═══════════════════════════════════════════════════════════════════════
-- 0033 · El tablero de PCI (lámina 5.5)
--
-- Hoy /pci es una lista de documentos: sirve para abrir uno, no para saber
-- cómo va el contrato. La especificación pide un tablero que responda, de
-- un vistazo, tres preguntas: cuánto se está cumpliendo, qué plazos se
-- están reventando y qué cuadrilla o tramo arrastra el problema.
--
-- Todo en una sola función: son seis bloques de la misma consulta, y
-- pedirlos por separado obligaría a seis viajes que pueden discrepar
-- entre sí si un ítem se cierra entre uno y otro.
--
-- El alcance por cuadrilla sale de mis_cuadrillas(), igual que el panel
-- del supervisor: el filtro de la pantalla puede estrechar lo que se ve,
-- nunca ensancharlo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.pci_tablero(
  p_service_id uuid,
  p_from date,
  p_to date,
  p_term int default null,
  p_section uuid default null,
  p_crew uuid default null
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  base as (
    select i.*
      from public.v_pci_items i, alcance a
     where i.service_id = p_service_id
       and (a.ids is null or i.assigned_crew_id = any(a.ids))
       and (p_crew is null or i.assigned_crew_id = p_crew)
       and (p_section is null or i.section_id = p_section)
       and (p_term is null or i.term_days = p_term)
       and i.created_at::date between p_from and p_to
  ),
  -- Los días del periodo, para que la tendencia no tenga huecos
  dias as (
    select d::date as dia from generate_series(p_from, p_to, interval '1 day') d
  )
  select json_build_object(
    'resumen', (
      select json_build_object(
        'total',        count(*),
        'pendientes',   count(*) filter (where status = 'pendiente'),
        'en_atencion',  count(*) filter (where status = 'en_atencion'),
        'levantados',   count(*) filter (where status = 'levantado'),
        'validados',    count(*) filter (where status = 'validado'),
        'rechazados',   count(*) filter (where status = 'rechazado'),
        'vencidos',     count(*) filter (where semaforo = 'vencido'),
        'por_vencer',   count(*) filter (where semaforo in ('ambar','rojo')),
        'sin_evidencia', count(*) filter (where requires_evidence
                                            and coalesce(evidence_count, 0) = 0
                                            and status in ('pendiente','en_atencion')),
        'cumplimiento', case when count(*) = 0 then 0
                        else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                                   / count(*), 1) end
      ) from base
    ),

    -- Los plazos salen de los propios ítems, no de una lista fija: cada
    -- contrato pacta los suyos y aquí conviven 7, 10, 15, 20, 30 y 45 días
    'por_plazo', (
      select coalesce(json_agg(x order by x.plazo), '[]'::json) from (
        select
          term_days                                                      as plazo,
          count(*)                                                       as total,
          count(*) filter (where status in ('levantado','validado'))      as atendidos,
          count(*) filter (where semaforo = 'vencido')                    as vencidos,
          case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                          / count(*), 0) end                              as cumplimiento
        from base
        where term_days is not null
        group by term_days
      ) x
    ),

    -- Cuántos entran y cuántos se levantan cada día
    'tendencia', (
      select coalesce(json_agg(x order by x.dia), '[]'::json) from (
        select
          d.dia,
          (select count(*) from base b where b.created_at::date = d.dia)          as agregados,
          (select count(*) from base b where b.closed_at::date  = d.dia)          as atendidos,
          (select count(*) from base b
            where b.due_date = d.dia
              and b.status not in ('levantado','validado'))                        as vencen
        from dias d
      ) x
    ),

    'por_cuadrilla', (
      select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
        select
          coalesce(crew_name, 'Sin asignar')                              as cuadrilla,
          assigned_crew_id                                                as crew_id,
          count(*)                                                        as total,
          count(*) filter (where status in ('levantado','validado'))       as atendidos,
          count(*) filter (where semaforo = 'vencido')                     as vencidos,
          case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                          / count(*), 0) end                               as cumplimiento
        from base
        group by crew_name, assigned_crew_id
      ) x
    ),

    'por_tramo', (
      select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
        select
          coalesce(section_name, 'Sin tramo')                             as tramo,
          section_code                                                    as codigo,
          section_id,
          count(*)                                                        as total,
          count(*) filter (where status in ('levantado','validado'))       as atendidos,
          count(*) filter (where semaforo = 'vencido')                     as vencidos,
          case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                          / count(*), 0) end                               as cumplimiento
        from base
        group by section_name, section_code, section_id
      ) x
    ),

    'ultimos', (
      select coalesce(json_agg(x order by x.created_at desc), '[]'::json) from (
        select
          id, pci_id, pci_code, item_number, description, activity_name,
          crew_name, section_name, prog_start_txt, prog_end_txt,
          due_date, days_left, term_days, status::text as status, semaforo,
          created_at
        from base
        order by created_at desc
        limit 12
      ) x
    )
  )
$$;

grant execute on function public.pci_tablero(uuid, date, date, int, uuid, uuid)
  to authenticated;
