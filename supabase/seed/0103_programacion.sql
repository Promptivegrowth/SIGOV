-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0103 · Programación semanal (6 semanas atrás + actual + próxima)
-- ═══════════════════════════════════════════════════════════════════════════

select setseed(0.77);

-- ─── Planes semanales ────────────────────────────────────────────────────
insert into public.weekly_plans (service_id, year, week, starts_on, ends_on, status, notes, published_at, published_by)
select
  s.id,
  extract(isoyear from d.monday)::smallint,
  extract(week from d.monday)::smallint,
  d.monday,
  d.monday + 6,
  case when d.monday + 6 < current_date then 'cerrado'::plan_status
       when d.monday <= current_date then 'publicado'::plan_status
       else 'borrador'::plan_status end,
  'Programación semanal de mantenimiento rutinario · ' || s.code,
  case when d.monday <= current_date then d.monday - 1 else null end,
  'a0000000-0000-4000-8000-000000000002'
from public.services s
cross join lateral (
  select (date_trunc('week', current_date)::date + (w * 7)) as monday
  from generate_series(-6, 1) as w
) d
where s.is_demo
on conflict (service_id, year, week) do nothing;

-- ─── Ítems de programación ───────────────────────────────────────────────
with base as (
  select
    wp.id as plan_id, wp.service_id, wp.starts_on, wp.ends_on,
    c.id as crew_id, c.code as crew_code,
    dow.d as day_offset,
    row_number() over (partition by wp.id order by c.code, dow.d) as rn
  from public.weekly_plans wp
  join public.crews c on c.service_id = wp.service_id and c.deleted_at is null
  cross join generate_series(0, 5) as dow(d)     -- lunes a sábado
  where wp.deleted_at is null
),
picked as (
  select b.*,
    (select a.id from public.activities_catalog a
      where a.service_id = b.service_id and a.deleted_at is null
        and a.category = case b.crew_code
              when 'CUA-A' then (array['Calzada','Drenaje'])[1 + (b.day_offset % 2)]
              when 'CUA-B' then 'Señalización'
              when 'CUA-C' then 'Derecho de vía'
              when 'CUA-D' then (array['Emergencias','Seguridad vial'])[1 + (b.day_offset % 2)]
              else (array['Calzada','Drenaje','Señalización'])[1 + (b.day_offset % 3)] end
      order by md5(a.id::text || b.plan_id::text || b.day_offset::text) limit 1) as activity_id,
    (select rs.id from public.road_sections rs
      where rs.service_id = b.service_id and rs.deleted_at is null
      order by md5(rs.id::text || b.plan_id::text || b.crew_code || b.day_offset::text) limit 1) as section_id
  from base b
)
insert into public.plan_items (plan_id, service_id, activity_id, section_id, crew_id, scheduled_on,
                               prog_start_m, prog_end_m, target_qty, unit_id, status, priority, sort_order, created_by)
select
  p.plan_id, p.service_id, p.activity_id, p.section_id, p.crew_id,
  p.starts_on + p.day_offset,
  ps.v,
  least(ps.v + 1500 + floor(random() * 6500), rs.prog_end_m),
  round((a.yield_per_day * (0.65 + random() * 0.55))::numeric, 1),
  a.unit_id,
  case when p.starts_on + p.day_offset < current_date then 'ejecutado'::plan_item_status
       when p.starts_on + p.day_offset = current_date then 'en_curso'::plan_item_status
       else 'programado'::plan_item_status end,
  3, p.rn,
  'a0000000-0000-4000-8000-000000000002'
from picked p
join public.activities_catalog a on a.id = p.activity_id
join public.road_sections rs on rs.id = p.section_id
cross join lateral (
  select rs.prog_start_m + floor(random() * greatest((rs.prog_end_m - rs.prog_start_m) * 0.7, 1000)) as v
) ps
where p.activity_id is not null and p.section_id is not null;

update public.plan_items set prog_end_m = prog_start_m + 1000 where prog_end_m <= prog_start_m;

select
 (select count(*) from public.weekly_plans) as planes,
 (select count(*) from public.plan_items) as items_programados;
