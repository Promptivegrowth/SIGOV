-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0014 · Correcciones detectadas en la auditoría end-to-end
--
--  1. evidence_guard fallaba con "operator is not unique" al comparar
--     geometrías: el operador = de PostGIS es ambiguo con este search_path.
--     Se compara la representación EWKT, que es determinista.
--  2. dashboard_daily_series agotaba el statement_timeout: 120 subconsultas
--     correlacionadas. Se reescribe con agregados previos + LEFT JOIN.
--  3. Índices que faltaban para las consultas por fecha de trabajo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Guardián de la evidencia (comparación segura de geometría) ───────
create or replace function public.evidence_guard()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.lat is distinct from old.lat
     or new.lng is distinct from old.lng
     or new.taken_at is distinct from old.taken_at
     or new.sha256 is distinct from old.sha256
     or new.storage_path is distinct from old.storage_path
     or extensions.ST_AsEWKT(new.geom) is distinct from extensions.ST_AsEWKT(old.geom) then
    raise exception 'SIGOV: la evidencia georreferenciada es inmutable (ubicación, fecha, hash y archivo no pueden editarse)'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ─── 2. Serie diaria optimizada ──────────────────────────────────────────
create or replace function public.dashboard_daily_series(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  dia date, metrado numeric, registros bigint, evidencias bigint, meta numeric
)
language sql stable security invoker set search_path = public as $$
  with dias as (
    select generate_series(p_from, p_to, '1 day')::date as dia
  ),
  ejec as (
    select wo.work_date as dia,
           sum(we.quantity) as metrado,
           count(*) as registros
      from public.work_entries we
      join public.work_orders wo on wo.id = we.work_order_id
     where we.service_id = p_service_id
       and we.deleted_at is null
       and wo.work_date between p_from and p_to
     group by wo.work_date
  ),
  evid as (
    select e.taken_at::date as dia, count(*) as evidencias
      from public.evidences e
     where e.service_id = p_service_id
       and e.deleted_at is null
       and e.taken_at >= p_from::timestamptz
       and e.taken_at < (p_to + 1)::timestamptz
     group by e.taken_at::date
  ),
  plan as (
    select pi.scheduled_on as dia, sum(pi.target_qty) as meta
      from public.plan_items pi
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
     group by pi.scheduled_on
  )
  select d.dia,
         coalesce(ej.metrado, 0)::numeric,
         coalesce(ej.registros, 0)::bigint,
         coalesce(ev.evidencias, 0)::bigint,
         coalesce(pl.meta, 0)::numeric
    from dias d
    left join ejec ej on ej.dia = d.dia
    left join evid ev on ev.dia = d.dia
    left join plan pl on pl.dia = d.dia
   order by d.dia;
$$;

-- ─── 3. Producción por cuadrilla: también reescrita con agregados ────────
create or replace function public.dashboard_crew_production(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  crew_id uuid, crew_name text, crew_color text,
  registros bigint, metrado numeric, evidencias bigint, dias_trabajados bigint, cumplimiento numeric
)
language sql stable security invoker set search_path = public as $$
  with ejec as (
    select wo.crew_id,
           count(we.id) as registros,
           coalesce(sum(we.quantity), 0) as metrado,
           count(distinct wo.work_date) as dias
      from public.work_orders wo
      left join public.work_entries we on we.work_order_id = wo.id and we.deleted_at is null
     where wo.service_id = p_service_id
       and wo.deleted_at is null
       and wo.work_date between p_from and p_to
     group by wo.crew_id
  ),
  ev as (
    select wo.crew_id, count(e.id) as evidencias
      from public.evidences e
      join public.work_entries we on we.id = e.work_entry_id
      join public.work_orders wo on wo.id = we.work_order_id
     where e.service_id = p_service_id
       and e.deleted_at is null
       and wo.work_date between p_from and p_to
     group by wo.crew_id
  ),
  plan as (
    select pi.crew_id,
           sum(pi.target_qty) as meta,
           sum(pi.executed_qty) as avance
      from public.plan_items pi
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
     group by pi.crew_id
  )
  select c.id, c.name, c.color,
         coalesce(ej.registros, 0)::bigint,
         coalesce(ej.metrado, 0)::numeric,
         coalesce(ev.evidencias, 0)::bigint,
         coalesce(ej.dias, 0)::bigint,
         case when coalesce(pl.meta, 0) > 0
              then round(pl.avance / pl.meta * 100, 1) else 0 end::numeric
    from public.crews c
    left join ejec ej on ej.crew_id = c.id
    left join ev on ev.crew_id = c.id
    left join plan pl on pl.crew_id = c.id
   where c.service_id = p_service_id and c.deleted_at is null and c.is_active
   order by 5 desc;
$$;

-- ─── 4. Producción por actividad: idem ───────────────────────────────────
create or replace function public.dashboard_activity_production(
  p_service_id uuid, p_from date default (current_date - 29), p_to date default current_date
) returns table (
  activity_id uuid, activity_name text, category text, color text,
  unit_symbol text, registros bigint, metrado numeric, meta numeric
)
language sql stable security invoker set search_path = public as $$
  with ejec as (
    select we.activity_id, count(*) as registros, sum(we.quantity) as metrado
      from public.work_entries we
      join public.work_orders wo on wo.id = we.work_order_id
     where we.service_id = p_service_id
       and we.deleted_at is null
       and wo.work_date between p_from and p_to
     group by we.activity_id
  ),
  plan as (
    select pi.activity_id, sum(pi.target_qty) as meta
      from public.plan_items pi
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
     group by pi.activity_id
  )
  select a.id, a.name, a.category, a.color, u.symbol,
         coalesce(ej.registros, 0)::bigint,
         coalesce(ej.metrado, 0)::numeric,
         coalesce(pl.meta, 0)::numeric
    from public.activities_catalog a
    left join public.units u on u.id = a.unit_id
    left join ejec ej on ej.activity_id = a.id
    left join plan pl on pl.activity_id = a.id
   where a.service_id = p_service_id and a.deleted_at is null and a.is_active
   order by 7 desc;
$$;

-- ─── 5. Índices que faltaban ─────────────────────────────────────────────
create index if not exists idx_wo_date on public.work_orders(work_date) where deleted_at is null;
create index if not exists idx_we_plan_item on public.work_entries(plan_item_id) where deleted_at is null;
create index if not exists idx_ev_taken on public.evidences(service_id, taken_at) where deleted_at is null;
create index if not exists idx_pi_service_crew on public.plan_items(service_id, crew_id, scheduled_on) where deleted_at is null;
create index if not exists idx_pcii_due_status on public.pci_items(service_id, due_date, status) where deleted_at is null;
create index if not exists idx_assets_service_type on public.road_assets(service_id, type_id) where deleted_at is null;

analyze public.work_entries;
analyze public.work_orders;
analyze public.evidences;
analyze public.plan_items;
analyze public.pci_items;
analyze public.road_assets;
