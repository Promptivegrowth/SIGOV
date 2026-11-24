-- 0164 · Pedido práctico al múltiplo de la presentación del insumo (MRPCI_02 / muestra COVINCA:
-- «55 gal por cilindro y múltiplos de 1 en los demás casos»). La presentación se mantiene en el catálogo.
alter table public.supplies add column if not exists presentacion numeric(14, 3) check (presentacion is null or presentacion > 0);
alter table public.supplies add column if not exists presentacion_nombre text;
comment on column public.supplies.presentacion is 'Cantidad por presentación de despacho (55 = cilindro de 55 gal); el pedido práctico se redondea a su múltiplo';

CREATE OR REPLACE FUNCTION public.requerimiento_calcular(p_plan uuid, p_crew uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w public.weekly_plans; v_res json;
begin
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.is_member(w.service_id) or public.es_visor(w.service_id) or not public.cuadrilla_a_mi_cargo(w.service_id, p_crew) then
    raise exception 'SIGOV: sin acceso a esa cuadrilla' using errcode = '42501';
  end if;
  with partidas as (
    select i.activity_id, a.code act_code, a.name act_name, u.symbol act_unit,
           string_agg(distinct coalesce(i.origen, 'MR'), '/') origen, sum(i.target_qty) metrado, min(i.sort_order) orden
      from public.plan_items i
      join public.activities_catalog a on a.id = i.activity_id
      left join public.units u on u.id = coalesce(i.unit_id, a.unit_id)
     where i.plan_id = w.id and i.crew_id = p_crew and i.deleted_at is null and i.status <> 'cancelado'
     group by i.activity_id, a.code, a.name, u.symbol
  ), base as (
    select p.*, r.supply_id, r.cantidad rendimiento, s.code sup_code, s.name sup_name, su.symbol sup_unit, nullif(s.presentacion, 0) presentacion, s.presentacion_nombre,
           round(p.metrado * r.cantidad, 3) pre,
           coalesce((select st.stock from public.v_stock_cuadrilla st where st.crew_id = p_crew and st.supply_id = r.supply_id), 0) stock_total
      from partidas p
      join public.rendimientos r on r.activity_id = p.activity_id and r.service_id = w.service_id
      join public.supplies s on s.id = r.supply_id
      left join public.units su on su.id = s.unit_id
  ), orden as (
    select b.*, coalesce(sum(b.pre) over (partition by b.supply_id order by b.orden, b.act_code rows between unbounded preceding and 1 preceding), 0) usado_antes
      from base b
  ), calc as (
    select o.*, greatest(least(o.stock_total - o.usado_antes, o.pre), 0) stock_asignado
      from orden o
  )
  select json_build_object(
    'lineas', (select coalesce(json_agg(json_build_object(
                  'activity_id', c.activity_id, 'partida', c.act_name, 'codigo_partida', c.act_code, 'unidad_partida', c.act_unit,
                  'metrado', c.metrado, 'supply_id', c.supply_id, 'recurso', c.sup_name, 'codigo_recurso', c.sup_code,
                  'unidad_recurso', c.sup_unit, 'unidad_rend', coalesce(c.sup_unit, '') || '/' || coalesce(c.act_unit, ''),
                  'rendimiento', c.rendimiento, 'origen', c.origen, 'pre', c.pre, 'stock', round(c.stock_asignado, 3),
                  'requerir', round(greatest(c.pre - c.stock_asignado, 0), 3),
                  -- Pedido práctico: redondeado al múltiplo de la presentación (cilindro de 55 gal…) o a la unidad
                  'practica', ceil(greatest(c.pre - c.stock_asignado, 0) / coalesce(c.presentacion, 1)) * coalesce(c.presentacion, 1),
                  'sugerido', ceil(greatest(c.pre - c.stock_asignado, 0) / coalesce(c.presentacion, 1)) * coalesce(c.presentacion, 1),
                  'presentacion', c.presentacion, 'presentacion_nombre', c.presentacion_nombre,
                  'remanente', round(c.stock_asignado + ceil(greatest(c.pre - c.stock_asignado, 0) / coalesce(c.presentacion, 1)) * coalesce(c.presentacion, 1) - c.pre, 3))
                order by c.orden, c.act_code, c.sup_code), '[]'::json) from calc c),
    'sin_rendimiento', (select coalesce(json_agg(json_build_object('partida', p.act_name, 'codigo', p.act_code, 'metrado', p.metrado, 'unidad', p.act_unit)), '[]'::json)
                          from partidas p where not exists (select 1 from public.rendimientos r where r.activity_id = p.activity_id and r.service_id = w.service_id)),
    'catalogo', (select json_build_object('rendimientos', count(*), 'actualizado', max(coalesce(updated_at, created_at)))
                   from public.rendimientos where service_id = w.service_id),
    'guardado', (select row_to_json(x) from (select q.version, q.lineas, q.nota, q.cuando, pr.full_name quien
                   from public.requerimientos_insumos q left join public.profiles pr on pr.id = q.quien
                  where q.plan_id = w.id and q.crew_id = p_crew order by q.version desc limit 1) x),
    'versiones', (select count(*) from public.requerimientos_insumos q where q.plan_id = w.id and q.crew_id = p_crew)
  ) into v_res;
  return v_res;
end $function$;

notify pgrst, 'reload schema';
