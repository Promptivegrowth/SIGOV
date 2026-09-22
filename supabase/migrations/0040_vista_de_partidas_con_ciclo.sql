-- ═══════════════════════════════════════════════════════════════════════
-- 0040 · La vista de partidas enseña el ciclo
--
-- De poco sirve registrar quién inició, quién cerró y por qué se detuvo
-- una partida si la vista que consultan la app y la web no lo devuelve.
-- Se agregan esas columnas y el conteo por estado del panel se ajusta al
-- estado nuevo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_plan_items as
select
  pi.id,
  pi.plan_id,
  pi.service_id,
  pi.scheduled_on,
  wp.year,
  wp.week,
  wp.status as plan_status,
  pi.activity_id,
  a.name as activity_name,
  a.code as activity_code,
  a.category as activity_category,
  a.color as activity_color,
  pi.section_id,
  s.name as section_name,
  s.code as section_code,
  pi.prog_start_m,
  pi.prog_end_m,
  fmt_progresiva(pi.prog_start_m) as prog_start_txt,
  fmt_progresiva(pi.prog_end_m) as prog_end_txt,
  pi.crew_id,
  c.name as crew_name,
  c.color as crew_color,
  pi.target_qty,
  pi.executed_qty,
  case
    when pi.target_qty > 0::numeric
      then round(least(pi.executed_qty / pi.target_qty, 1::numeric) * 100::numeric, 1)
    else 0::numeric
  end as progress_pct,
  u.symbol as unit_symbol,
  pi.status,
  pi.priority,
  pi.sort_order,
  pi.notes,
  pi.suspended_by_pci_id,
  pi.original_date,
  pi.rescheduled_to,
  pci.code as pci_code,
  pi.created_at,
  pi.updated_at,

  -- El ciclo de vida, para que la app sepa qué botón ofrecer. Va al final
  -- porque «create or replace view» solo admite columnas añadidas después
  -- de las que ya existían.
  pi.started_at,
  pi.finished_at,
  pi.validated_at,
  pi.impedimento,
  pi.impedimento_at,
  quien_inicio.full_name  as started_by_name,
  quien_cerro.full_name   as finished_by_name,
  quien_valido.full_name  as validated_by_name
from public.plan_items pi
join public.weekly_plans wp on wp.id = pi.plan_id
join public.activities_catalog a on a.id = pi.activity_id
join public.road_sections s on s.id = pi.section_id
left join public.crews c on c.id = pi.crew_id
left join public.units u on u.id = pi.unit_id
left join public.pcis pci on pci.id = pi.suspended_by_pci_id
left join public.profiles quien_inicio on quien_inicio.id = pi.started_by
left join public.profiles quien_cerro  on quien_cerro.id  = pi.finished_by
left join public.profiles quien_valido on quien_valido.id = pi.validated_by
where pi.deleted_at is null;

-- ─── El panel cuenta el estado nuevo ──────────────────────────────────
--
-- «Culminadas» pasa a significar lo que la cuadrilla dio por terminado,
-- esté validado o no; aparte se dice cuántas esperan el visto bueno,
-- porque es trabajo del supervisor y conviene que lo vea.

create or replace function public.panel_resumen(
  p_service_id uuid,
  p_from date,
  p_to date
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  plan as (
    select pi.status
      from public.plan_items pi, alcance a
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
       and (a.ids is null or pi.crew_id = any(a.ids))
  ),
  pci as (
    select i.status, i.due_date
      from public.pci_items i, alcance a
     where i.service_id = p_service_id
       and i.deleted_at is null
       and (a.ids is null or i.assigned_crew_id = any(a.ids))
  )
  select json_build_object(
    'cuadrillas', (
      select count(*) from public.crews c, alcance a
       where c.service_id = p_service_id and c.deleted_at is null
         and (a.ids is null or c.id = any(a.ids))
    ),
    'asignadas',    (select count(*) from plan),
    'en_ejecucion', (select count(*) from plan where status = 'en_curso'),
    'culminadas',   (select count(*) from plan where status in ('ejecutado','por_validar')),
    'por_validar',  (select count(*) from plan where status = 'por_validar'),
    'pendientes',   (select count(*) from plan where status = 'programado'),
    'observadas',   (select count(*) from plan where status in ('suspendido','reprogramado')),
    'avance', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status in ('ejecutado','por_validar'))
                        / count(*), 0)
             end
        from plan
    ),
    'pci_activos',   (select count(*) from pci where status in ('pendiente','en_atencion')),
    'pci_atendidos', (select count(*) from pci where status in ('levantado','validado')),
    'pci_vencidos',  (
      select count(*) from pci
       where status in ('pendiente','en_atencion')
         and due_date < public.hoy_peru()::date
    ),
    'pci_cumplimiento', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                        / count(*), 0)
             end
        from pci
    ),
    'materiales', (
      select json_build_object(
        'pendientes', count(*) filter (where r.status = 'solicitado'),
        'aprobadas',  count(*) filter (where r.status = 'aprobado'),
        'parciales',  count(*) filter (where r.status = 'parcial'),
        'entregadas', count(*) filter (where r.status = 'entregado')
      )
      from public.supply_requests r, alcance a
      where r.service_id = p_service_id and r.deleted_at is null
        and (a.ids is null or r.crew_id = any(a.ids))
    )
  )
$$;

-- Se agrega una columna al resultado, así que hay que soltarla primero:
-- Postgres no deja cambiar el tipo de retorno de una función existente.
drop function if exists public.panel_cuadrillas(uuid, date, date);

create or replace function public.panel_cuadrillas(
  p_service_id uuid,
  p_from date,
  p_to date
)
returns table (
  crew_id uuid,
  code text,
  name text,
  color text,
  leader_name text,
  actividades bigint,
  ejecutadas bigint,
  por_validar bigint,
  avance numeric,
  pci_abiertos bigint,
  estado text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids)
  select
    c.id,
    c.code,
    c.name,
    c.color,
    p.full_name,
    count(pi.id)                                                     as actividades,
    count(pi.id) filter (where pi.status in ('ejecutado','por_validar')) as ejecutadas,
    count(pi.id) filter (where pi.status = 'por_validar')             as por_validar,
    case when count(pi.id) = 0 then 0
         else round(100.0 * count(pi.id) filter (where pi.status in ('ejecutado','por_validar'))
                    / count(pi.id), 0)
    end                                                              as avance,
    (select count(*) from public.pci_items i
      where i.assigned_crew_id = c.id
        and i.deleted_at is null
        and i.status in ('pendiente','en_atencion'))                  as pci_abiertos,
    -- El estado se dice como lo diría el supervisor al mirar la fila
    case
      when count(pi.id) = 0 then 'sin_programa'
      when count(pi.id) filter (where pi.status in ('suspendido','reprogramado')) > 0
        then 'con_retraso'
      when count(pi.id) filter (where pi.status in ('ejecutado','por_validar')) = count(pi.id)
        then 'culminada'
      when count(pi.id) filter (where pi.status = 'en_curso') > 0 then 'en_ejecucion'
      else 'normal'
    end                                                              as estado
  from public.crews c
  cross join alcance a
  left join public.profiles p on p.id = c.leader_id
  left join public.plan_items pi
         on pi.crew_id = c.id
        and pi.deleted_at is null
        and pi.scheduled_on between p_from and p_to
  where c.service_id = p_service_id
    and c.deleted_at is null
    and (a.ids is null or c.id = any(a.ids))
  group by c.id, c.code, c.name, c.color, p.full_name
  order by c.code
$$;

grant execute on function public.panel_cuadrillas(uuid, date, date) to authenticated;
