-- ═══════════════════════════════════════════════════════════════════════════
-- 0134 · Avance diario de una partida (4.º entregable, CASO 12)
--
-- Meta 100 m: día 1 40 m, día 2 35 m, día 3 25 m. Por día: lo ejecutado, el
-- acumulado, el saldo y el porcentaje. Cada avance cuenta una vez: los
-- registros se identifican por su client_id, así que reenviar desde el
-- teléfono no los duplica.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.avance_diario_partida(p_plan_item uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with meta as (
    select pi.id, coalesce(pi.target_qty, 0) as meta from public.plan_items pi where pi.id = p_plan_item
  ), dias as (
    select wo.work_date as dia, sum(e.quantity) as ejecutado, count(*) as registros
      from public.work_entries e
      join public.work_orders wo on wo.id = e.work_order_id and wo.deleted_at is null
     where e.plan_item_id = p_plan_item and e.deleted_at is null
     group by wo.work_date
  ), acumulado as (
    select d.*, sum(d.ejecutado) over (order by d.dia) as acumulado from dias d
  )
  select coalesce(json_agg(json_build_object(
           'dia', a.dia, 'ejecutado', a.ejecutado, 'registros', a.registros,
           'acumulado', a.acumulado,
           'saldo', greatest(m.meta - a.acumulado, 0),
           'exceso', greatest(a.acumulado - m.meta, 0),
           'pct', case when m.meta > 0 then round(a.acumulado / m.meta * 100, 1) end)
           order by a.dia), '[]'::json)
    from acumulado a cross join meta m
$$;
revoke all on function public.avance_diario_partida(uuid) from public, anon;
grant execute on function public.avance_diario_partida(uuid) to authenticated;
