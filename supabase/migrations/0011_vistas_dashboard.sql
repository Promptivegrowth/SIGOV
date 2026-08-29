-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0011 · Vistas y RPCs para dashboard, mapa y reportes
-- Todas las vistas usan security_invoker → respetan RLS del usuario.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PCI: ítems con semáforo calculado ───────────────────────────────────
create or replace view public.v_pci_items as
select
  i.id, i.pci_id, i.service_id, i.item_number, i.description,
  i.section_id, s.name as section_name, s.code as section_code,
  i.prog_start_m, i.prog_end_m, i.side,
  public.fmt_progresiva(i.prog_start_m) as prog_start_txt,
  public.fmt_progresiva(i.prog_end_m)   as prog_end_txt,
  i.activity_id, a.name as activity_name,
  i.quantity, u.symbol as unit_symbol,
  i.term_days, i.due_date,
  (i.due_date - current_date) as days_left,
  public.pci_item_semaforo(i.due_date, i.term_days, i.status) as semaforo,
  i.status, i.assigned_crew_id, c.name as crew_name,
  i.assigned_to, p.full_name as assignee_name,
  i.requires_evidence, i.closed_at, i.validated_at, i.notes,
  (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null) as evidence_count,
  pc.code as pci_code, pc.title as pci_title, pc.priority as pci_priority,
  i.created_at, i.updated_at
from public.pci_items i
join public.pcis pc on pc.id = i.pci_id
left join public.road_sections s on s.id = i.section_id
left join public.activities_catalog a on a.id = i.activity_id
left join public.units u on u.id = i.unit_id
left join public.crews c on c.id = i.assigned_crew_id
left join public.profiles p on p.id = i.assigned_to
where i.deleted_at is null;

alter view public.v_pci_items set (security_invoker = on);

-- ─── Programación: ítems con todo resuelto ───────────────────────────────
create or replace view public.v_plan_items as
select
  pi.id, pi.plan_id, pi.service_id, pi.scheduled_on,
  wp.year, wp.week, wp.status as plan_status,
  pi.activity_id, a.name as activity_name, a.code as activity_code,
  a.category as activity_category, a.color as activity_color,
  pi.section_id, s.name as section_name, s.code as section_code,
  pi.prog_start_m, pi.prog_end_m,
  public.fmt_progresiva(pi.prog_start_m) as prog_start_txt,
  public.fmt_progresiva(pi.prog_end_m)   as prog_end_txt,
  pi.crew_id, c.name as crew_name, c.color as crew_color,
  pi.target_qty, pi.executed_qty,
  case when pi.target_qty > 0
       then round(least(pi.executed_qty / pi.target_qty, 1) * 100, 1)
       else 0 end as progress_pct,
  u.symbol as unit_symbol,
  pi.status, pi.priority, pi.sort_order, pi.notes,
  pi.suspended_by_pci_id, pi.original_date, pi.rescheduled_to,
  pci.code as pci_code,
  pi.created_at, pi.updated_at
from public.plan_items pi
join public.weekly_plans wp on wp.id = pi.plan_id
join public.activities_catalog a on a.id = pi.activity_id
join public.road_sections s on s.id = pi.section_id
left join public.crews c on c.id = pi.crew_id
left join public.units u on u.id = pi.unit_id
left join public.pcis pci on pci.id = pi.suspended_by_pci_id
where pi.deleted_at is null;

alter view public.v_plan_items set (security_invoker = on);

-- ─── Ejecución en campo ──────────────────────────────────────────────────
create or replace view public.v_work_entries as
select
  we.id, we.work_order_id, we.service_id, we.plan_item_id, we.pci_item_id,
  wo.work_date, wo.status as order_status, wo.crew_id, c.name as crew_name, c.color as crew_color,
  we.activity_id, a.name as activity_name, a.category as activity_category, a.color as activity_color,
  we.section_id, s.name as section_name,
  we.prog_start_m, we.prog_end_m, we.side,
  public.fmt_progresiva(we.prog_start_m) as prog_start_txt,
  public.fmt_progresiva(we.prog_end_m)   as prog_end_txt,
  we.quantity, u.symbol as unit_symbol, we.observation,
  we.started_at, we.finished_at,
  extensions.ST_Y(we.geom::extensions.geometry) as lat,
  extensions.ST_X(we.geom::extensions.geometry) as lng,
  (select count(*) from public.evidences e where e.work_entry_id = we.id and e.deleted_at is null) as evidence_count,
  p.full_name as created_by_name,
  we.created_at
from public.work_entries we
join public.work_orders wo on wo.id = we.work_order_id
join public.activities_catalog a on a.id = we.activity_id
join public.road_sections s on s.id = we.section_id
left join public.crews c on c.id = wo.crew_id
left join public.units u on u.id = we.unit_id
left join public.profiles p on p.id = we.created_by
where we.deleted_at is null;

alter view public.v_work_entries set (security_invoker = on);

-- ─── Inventario vial para el mapa ────────────────────────────────────────
create or replace view public.v_road_assets as
select
  ra.id, ra.service_id, ra.code, ra.name,
  ra.type_id, t.name as type_name, t.category as type_category,
  t.icon as type_icon, t.color as type_color,
  ra.section_id, s.name as section_name,
  ra.progresiva_m, public.fmt_progresiva(ra.progresiva_m) as progresiva_txt,
  ra.side, ra.lat, ra.lng, ra.condition, ra.install_year,
  ra.last_inspected_on, ra.next_inspection_on, ra.attributes, ra.notes,
  (select count(*) from public.asset_interventions ai where ai.asset_id = ra.id) as interventions_count,
  (select max(ai.intervened_on) from public.asset_interventions ai where ai.asset_id = ra.id) as last_intervention_on,
  ra.created_at, ra.updated_at
from public.road_assets ra
join public.asset_types t on t.id = ra.type_id
left join public.road_sections s on s.id = ra.section_id
where ra.deleted_at is null;

alter view public.v_road_assets set (security_invoker = on);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: KPIs del dashboard en UNA sola llamada
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.dashboard_kpis(
  p_service_id uuid,
  p_from date default (current_date - 30),
  p_to   date default current_date
) returns jsonb
language plpgsql stable security invoker set search_path = public, extensions as $$
declare r jsonb;
begin
  if not public.is_member(p_service_id) then
    raise exception 'SIGOV: sin acceso a este servicio';
  end if;

  select jsonb_build_object(
    'rango', jsonb_build_object('desde', p_from, 'hasta', p_to),

    'produccion', (
      select jsonb_build_object(
        'registros',   count(*),
        'metrado',     coalesce(sum(we.quantity), 0),
        'partes',      count(distinct we.work_order_id),
        'cuadrillas',  count(distinct wo.crew_id),
        'evidencias',  coalesce((select count(*) from public.evidences e
                                 where e.service_id = p_service_id and e.deleted_at is null
                                   and e.taken_at::date between p_from and p_to), 0)
      )
      from public.work_entries we
      join public.work_orders wo on wo.id = we.work_order_id
      where we.service_id = p_service_id and we.deleted_at is null
        and wo.work_date between p_from and p_to
    ),

    'programacion', (
      select jsonb_build_object(
        'items',        count(*),
        'programados',  count(*) filter (where pi.status = 'programado'),
        'en_curso',     count(*) filter (where pi.status = 'en_curso'),
        'ejecutados',   count(*) filter (where pi.status = 'ejecutado'),
        'suspendidos',  count(*) filter (where pi.status = 'suspendido'),
        'meta',         coalesce(sum(pi.target_qty), 0),
        'avance',       coalesce(sum(pi.executed_qty), 0),
        'cumplimiento', case when coalesce(sum(pi.target_qty),0) > 0
                          then round(sum(pi.executed_qty) / sum(pi.target_qty) * 100, 1) else 0 end
      )
      from public.plan_items pi
      where pi.service_id = p_service_id and pi.deleted_at is null
        and pi.scheduled_on between p_from and p_to
    ),

    'pci', (
      select jsonb_build_object(
        'pcis_abiertos', (select count(*) from public.pcis p
                          where p.service_id = p_service_id and p.deleted_at is null
                            and p.status in ('abierto','en_atencion')),
        'items_total',   count(*),
        'pendientes',    count(*) filter (where i.status = 'pendiente'),
        'en_atencion',   count(*) filter (where i.status = 'en_atencion'),
        'levantados',    count(*) filter (where i.status in ('levantado','validado')),
        'vencidos',      count(*) filter (where i.due_date < current_date
                                            and i.status not in ('levantado','validado')),
        'por_vencer_7d', count(*) filter (where i.due_date between current_date and current_date + 7
                                            and i.status not in ('levantado','validado')),
        'semaforo', jsonb_build_object(
          'verde',   count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'verde'),
          'ambar',   count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'ambar'),
          'rojo',    count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'rojo'),
          'vencido', count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'vencido'),
          'ok',      count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'ok')
        )
      )
      from public.pci_items i
      where i.service_id = p_service_id and i.deleted_at is null
    ),

    'ssoma', (
      select jsonb_build_object(
        'charlas',     (select count(*) from public.safety_talks t
                        where t.service_id = p_service_id and t.deleted_at is null
                          and t.talk_date between p_from and p_to),
        'asistentes',  (select count(*) from public.talk_attendance a
                        join public.safety_talks t on t.id = a.talk_id
                        where t.service_id = p_service_id and t.talk_date between p_from and p_to),
        'checklists',  (select count(*) from public.checklist_responses cr
                        where cr.service_id = p_service_id and cr.deleted_at is null
                          and cr.responded_on between p_from and p_to),
        'hallazgos',   (select count(*) from public.checklist_responses cr
                        where cr.service_id = p_service_id and cr.deleted_at is null
                          and cr.has_findings and cr.responded_on between p_from and p_to),
        'ats',         (select count(*) from public.ats_iperc ai
                        where ai.service_id = p_service_id and ai.deleted_at is null
                          and ai.doc_date between p_from and p_to)
      )
    ),

    'inventario', (
      select jsonb_build_object(
        'total',    count(*),
        'bueno',    count(*) filter (where ra.condition = 'bueno'),
        'regular',  count(*) filter (where ra.condition = 'regular'),
        'malo',     count(*) filter (where ra.condition = 'malo'),
        'critico',  count(*) filter (where ra.condition = 'critico')
      )
      from public.road_assets ra
      where ra.service_id = p_service_id and ra.deleted_at is null
    ),

    'alertas', (
      select jsonb_build_object(
        'partes_sin_evidencia', (
          select count(*) from public.work_entries we
          join public.work_orders wo on wo.id = we.work_order_id
          join public.activities_catalog a on a.id = we.activity_id
          where we.service_id = p_service_id and we.deleted_at is null
            and wo.work_date between p_from and p_to
            and a.requires_photo
            and (select count(*) from public.evidences e
                 where e.work_entry_id = we.id and e.deleted_at is null) < a.min_photos
        ),
        'partes_por_validar', (
          select count(*) from public.work_orders wo
          where wo.service_id = p_service_id and wo.deleted_at is null
            and wo.status = 'enviado'
        ),
        'planes_suspendidos', (
          select count(*) from public.weekly_plans wp
          where wp.service_id = p_service_id and wp.deleted_at is null and wp.status = 'suspendido'
        )
      )
    )
  ) into r;

  return r;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: serie de avance diario (para gráficos)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.dashboard_daily_series(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  dia date, metrado numeric, registros bigint, evidencias bigint, meta numeric
)
language sql stable security invoker set search_path = public as $$
  with dias as (select generate_series(p_from, p_to, '1 day')::date as dia)
  select d.dia,
    coalesce((select sum(we.quantity) from public.work_entries we
              join public.work_orders wo on wo.id = we.work_order_id
              where we.service_id = p_service_id and we.deleted_at is null and wo.work_date = d.dia), 0),
    coalesce((select count(*) from public.work_entries we
              join public.work_orders wo on wo.id = we.work_order_id
              where we.service_id = p_service_id and we.deleted_at is null and wo.work_date = d.dia), 0),
    coalesce((select count(*) from public.evidences e
              where e.service_id = p_service_id and e.deleted_at is null and e.taken_at::date = d.dia), 0),
    coalesce((select sum(pi.target_qty) from public.plan_items pi
              where pi.service_id = p_service_id and pi.deleted_at is null and pi.scheduled_on = d.dia), 0)
  from dias d order by d.dia;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: producción por cuadrilla
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.dashboard_crew_production(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  crew_id uuid, crew_name text, crew_color text,
  registros bigint, metrado numeric, evidencias bigint, dias_trabajados bigint, cumplimiento numeric
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name, c.color,
    coalesce(count(we.id), 0),
    coalesce(sum(we.quantity), 0),
    coalesce((select count(*) from public.evidences e
              join public.work_entries we2 on we2.id = e.work_entry_id
              join public.work_orders wo2 on wo2.id = we2.work_order_id
              where wo2.crew_id = c.id and wo2.work_date between p_from and p_to and e.deleted_at is null), 0),
    coalesce(count(distinct wo.work_date), 0),
    coalesce((select case when sum(pi.target_qty) > 0
                       then round(sum(pi.executed_qty)/sum(pi.target_qty)*100, 1) else 0 end
              from public.plan_items pi
              where pi.crew_id = c.id and pi.deleted_at is null
                and pi.scheduled_on between p_from and p_to), 0)
  from public.crews c
  left join public.work_orders wo on wo.crew_id = c.id and wo.work_date between p_from and p_to and wo.deleted_at is null
  left join public.work_entries we on we.work_order_id = wo.id and we.deleted_at is null
  where c.service_id = p_service_id and c.deleted_at is null and c.is_active
  group by c.id, c.name, c.color
  order by 5 desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: producción por actividad
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.dashboard_activity_production(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  activity_id uuid, activity_name text, category text, color text,
  unit_symbol text, registros bigint, metrado numeric, meta numeric
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.name, a.category, a.color, u.symbol,
    coalesce(count(we.id), 0),
    coalesce(sum(we.quantity), 0),
    coalesce((select sum(pi.target_qty) from public.plan_items pi
              where pi.activity_id = a.id and pi.deleted_at is null
                and pi.scheduled_on between p_from and p_to), 0)
  from public.activities_catalog a
  left join public.units u on u.id = a.unit_id
  left join public.work_entries we on we.activity_id = a.id and we.deleted_at is null
       and exists (select 1 from public.work_orders wo where wo.id = we.work_order_id
                     and wo.work_date between p_from and p_to)
  where a.service_id = p_service_id and a.deleted_at is null and a.is_active
  group by a.id, a.name, a.category, a.color, u.symbol
  order by 7 desc;
$$;

grant execute on function public.dashboard_kpis(uuid, date, date) to authenticated;
grant execute on function public.dashboard_daily_series(uuid, date, date) to authenticated;
grant execute on function public.dashboard_crew_production(uuid, date, date) to authenticated;
grant execute on function public.dashboard_activity_production(uuid, date, date) to authenticated;

grant select on public.v_pci_items, public.v_plan_items, public.v_work_entries, public.v_road_assets to authenticated;
