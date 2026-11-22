-- ═══════════════════════════════════════════════════════════════════════════
-- 0143 · Programación MR + PCI (revisión visual 18/11, T6; láminas MRPCI_01–04)
--
-- 1 · Semana: borrador / publicada con versiones e historial. Publicar es una
--     versión (foto de las filas); cambiar la semana ya publicada la marca
--     «con cambios sin publicar» hasta la versión siguiente, que pide motivo.
-- 2 · Insumos: el requerimiento se calcula de la misma semana (metrado ×
--     rendimiento − stock en cuadrilla), el Supervisor ajusta el «pedido
--     práctico» con motivo y lo guarda como versión. Guardar NO toca stock.
-- 3 · Seguimiento: entradas, salidas y stock teórico del periodo contando
--     solo movimientos confirmados: el consumo de un parte cuenta cuando el
--     Supervisor valida el parte (decisión de Elvis); hasta entonces se
--     muestra «por validar». El conteo físico no sobrescribe el saldo: un
--     ajuste autorizado crea un movimiento con motivo, autor y fecha. Un
--     reintento no descuenta dos veces (client_id único ya lo impide).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · Versiones de la semana ───────────────────────────────────────────
alter table public.weekly_plans
  add column if not exists version_publicada integer not null default 0,
  add column if not exists cambios_sin_publicar boolean not null default false;
update public.weekly_plans set version_publicada = 1 where status = 'publicado' and version_publicada = 0;

create table if not exists public.weekly_plan_versiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  version integer not null,
  tipo text not null check (tipo in ('borrador', 'publicada')),
  filas jsonb not null default '[]'::jsonb,
  n_filas integer not null default 0,
  motivo text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp()
);
create index if not exists ix_wpv_plan on public.weekly_plan_versiones (plan_id, cuando);
alter table public.weekly_plan_versiones enable row level security;
drop policy if exists weekly_plan_versiones_select on public.weekly_plan_versiones;
create policy weekly_plan_versiones_select on public.weekly_plan_versiones for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)) or public.is_platform_admin());
grant select on public.weekly_plan_versiones to authenticated;

-- Lo programado (no el avance de campo) marca la semana publicada como cambiada
create or replace function public.t_plan_cambio()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_plan uuid := coalesce(new.plan_id, old.plan_id);
begin
  if tg_op = 'UPDATE' and new.activity_id is not distinct from old.activity_id and new.scheduled_on is not distinct from old.scheduled_on
     and new.prog_start_m is not distinct from old.prog_start_m and new.prog_end_m is not distinct from old.prog_end_m
     and new.target_qty is not distinct from old.target_qty and new.lado is not distinct from old.lado
     and new.crew_id is not distinct from old.crew_id and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;
  update public.weekly_plans set cambios_sin_publicar = true
   where id = v_plan and status = 'publicado' and not cambios_sin_publicar;
  return null;
end $$;
drop trigger if exists t_plan_cambio on public.plan_items;
create trigger t_plan_cambio after insert or update or delete on public.plan_items
  for each row execute function public.t_plan_cambio();

create or replace function public.semana_filas(p_plan uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'fecha', i.scheduled_on, 'actividad', a.code, 'nombre', a.name, 'origen', i.origen,
           'pci_item_id', i.pci_item_id, 'crew_id', i.crew_id, 'lado', i.lado, 'metrado', i.target_qty,
           'de', i.prog_start_m, 'a', i.prog_end_m) order by i.scheduled_on, i.sort_order), '[]'::jsonb)
    from public.plan_items i left join public.activities_catalog a on a.id = i.activity_id
   where i.plan_id = p_plan and i.deleted_at is null and i.status <> 'cancelado'
$$;

/** Guardar borrador: una foto de cómo va la semana, sin publicarla a las cuadrillas. */
create or replace function public.semana_guardar_borrador(p_plan uuid, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare w public.weekly_plans; v_filas jsonb;
begin
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) then raise exception 'SIGOV: solo quien programa guarda la semana' using errcode = '42501'; end if;
  v_filas := public.semana_filas(w.id);
  insert into public.weekly_plan_versiones (service_id, plan_id, version, tipo, filas, n_filas, motivo, quien)
  values (w.service_id, w.id, w.version_publicada, 'borrador', v_filas, jsonb_array_length(v_filas), nullif(trim(p_nota), ''), auth.uid());
  return json_build_object('filas', jsonb_array_length(v_filas), 'estado', w.status);
end $$;
grant execute on function public.semana_guardar_borrador(uuid, text) to authenticated;

/** Publicar la semana como versión; desde la segunda, con motivo. Avisa a cada jefe. */
create or replace function public.semana_publicar(p_plan uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare w public.weekly_plans; v_filas jsonb; v_version int; r record;
begin
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) then raise exception 'SIGOV: solo quien programa publica la semana' using errcode = '42501'; end if;
  if w.status = 'cerrado' then raise exception 'SIGOV: la semana está cerrada'; end if;
  v_filas := public.semana_filas(w.id);
  if jsonb_array_length(v_filas) = 0 then raise exception 'SIGOV: la semana no tiene actividades'; end if;
  if w.version_publicada > 0 and w.status = 'publicado' and not w.cambios_sin_publicar then
    raise exception 'SIGOV: la versión v% ya está publicada y no hay cambios', w.version_publicada;
  end if;
  if w.version_publicada > 0 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo de la nueva versión: queda en el historial';
  end if;
  v_version := w.version_publicada + 1;
  update public.weekly_plans set status = 'publicado', published_at = now(), published_by = auth.uid(),
         version_publicada = v_version, cambios_sin_publicar = false, updated_at = now()
   where id = w.id;
  insert into public.weekly_plan_versiones (service_id, plan_id, version, tipo, filas, n_filas, motivo, quien)
  values (w.service_id, w.id, v_version, 'publicada', v_filas, jsonb_array_length(v_filas), nullif(trim(p_motivo), ''), auth.uid());
  for r in
    select c.leader_id, count(*) n from public.plan_items i join public.crews c on c.id = i.crew_id
     where i.plan_id = w.id and i.deleted_at is null and i.status <> 'cancelado' and c.leader_id is not null
     group by c.leader_id
  loop
    perform public.aviso_vivo(w.service_id, r.leader_id, 'programacion_publicada', 'sem:' || w.id,
      format('Programación semana %s%s', coalesce(w.semana_contrato::text, w.week::text), case when v_version > 1 then format(' · versión v%s', v_version) else '' end),
      format('%s %s para tu cuadrilla del %s al %s.', r.n, case when r.n = 1 then 'actividad' else 'actividades' end,
             to_char(w.starts_on, 'DD/MM'), to_char(w.ends_on, 'DD/MM')),
      '/programacion', 'info', jsonb_build_object('plan_id', w.id, 'version', v_version));
  end loop;
  return json_build_object('version', v_version, 'filas', jsonb_array_length(v_filas));
end $$;
grant execute on function public.semana_publicar(uuid, text) to authenticated;

/** Historial de la semana con lo que cambió entre versiones. */
create or replace function public.semana_historial(p_plan uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  with v as (
    select x.*, pr.full_name quien_nombre,
           lag(x.filas) over (order by x.cuando) previas
      from public.weekly_plan_versiones x left join public.profiles pr on pr.id = x.quien
     where x.plan_id = p_plan
  )
  select coalesce(json_agg(json_build_object(
           'version', v.version, 'tipo', v.tipo, 'filas', v.n_filas, 'motivo', v.motivo, 'quien', v.quien_nombre, 'cuando', v.cuando,
           'agregadas', (select count(*) from jsonb_array_elements(v.filas) f
                          where v.previas is not null and not exists (select 1 from jsonb_array_elements(v.previas) g where g->>'id' = f->>'id')),
           'retiradas', (select count(*) from jsonb_array_elements(coalesce(v.previas, '[]'::jsonb)) g
                          where not exists (select 1 from jsonb_array_elements(v.filas) f where f->>'id' = g->>'id')),
           'cambiadas', (select count(*) from jsonb_array_elements(v.filas) f join jsonb_array_elements(coalesce(v.previas, '[]'::jsonb)) g
                           on g->>'id' = f->>'id' and g <> f))
         order by v.cuando desc), '[]'::json)
    from v
   where exists (select 1 from public.weekly_plans w where w.id = p_plan and public.is_member(w.service_id) and not public.es_visor(w.service_id))
$$;
grant execute on function public.semana_historial(uuid) to authenticated;

-- ─── 2 · Requerimiento de insumos ─────────────────────────────────────────
create table if not exists public.requerimientos_insumos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  crew_id uuid not null references public.crews(id),
  version integer not null,
  lineas jsonb not null default '[]'::jsonb,
  nota text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp(),
  unique (plan_id, crew_id, version)
);
alter table public.requerimientos_insumos enable row level security;
drop policy if exists requerimientos_insumos_select on public.requerimientos_insumos;
create policy requerimientos_insumos_select on public.requerimientos_insumos for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)
          and (crew_id in (select public.cuadrillas_visibles()))) or public.is_platform_admin());
grant select on public.requerimientos_insumos to authenticated;

/**
 * El requerimiento calculado desde la semana de una cuadrilla:
 * pre-cantidad = metrado × rendimiento; el stock en cuadrilla se descuenta
 * en orden entre las partidas que usan el mismo insumo; a requerir =
 * máx(0; pre − stock); pedido práctico por defecto = a requerir redondeado
 * hacia arriba; remanente = stock + pedido − pre. Trae el último guardado.
 */
create or replace function public.requerimiento_calcular(p_plan uuid, p_crew uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
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
    select p.*, r.supply_id, r.cantidad rendimiento, s.code sup_code, s.name sup_name, su.symbol sup_unit,
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
                  'practica', ceil(greatest(c.pre - c.stock_asignado, 0)), 'sugerido', ceil(greatest(c.pre - c.stock_asignado, 0)),
                  'remanente', round(c.stock_asignado + ceil(greatest(c.pre - c.stock_asignado, 0)) - c.pre, 3))
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
end $$;
grant execute on function public.requerimiento_calcular(uuid, uuid) to authenticated;

/** Guarda el requerimiento como versión. Cada pedido práctico distinto de «a requerir» pide motivo. No toca stock. */
create or replace function public.requerimiento_guardar(p_plan uuid, p_crew uuid, p_lineas jsonb, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare w public.weekly_plans; l jsonb; v_version int;
begin
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) or not public.revisa_cuadrilla(w.service_id, p_crew) then
    raise exception 'SIGOV: el requerimiento lo guarda el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'SIGOV: el requerimiento no tiene líneas'; end if;
  for l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((l->>'practica')::numeric, -1) < 0 then
      raise exception 'SIGOV: el pedido práctico de % no es válido', l->>'recurso';
    end if;
    -- El redondeo sugerido no pide motivo; apartarse de él (ajuste del Supervisor), sí
    if round((l->>'practica')::numeric, 3) <> round(coalesce((l->>'sugerido')::numeric, (l->>'requerir')::numeric, 0), 3)
       and nullif(trim(l->>'motivo'), '') is null then
      raise exception 'SIGOV: escribe el motivo del ajuste de % (pedido % frente a % sugerido)', l->>'recurso', l->>'practica', coalesce(l->>'sugerido', l->>'requerir');
    end if;
  end loop;
  select coalesce(max(version), 0) + 1 into v_version from public.requerimientos_insumos where plan_id = w.id and crew_id = p_crew;
  insert into public.requerimientos_insumos (service_id, plan_id, crew_id, version, lineas, nota, quien)
  values (w.service_id, w.id, p_crew, v_version, p_lineas, nullif(trim(p_nota), ''), auth.uid());
  return json_build_object('version', v_version);
end $$;
grant execute on function public.requerimiento_guardar(uuid, uuid, jsonb, text) to authenticated;

-- ─── 3 · Seguimiento y conteo físico ──────────────────────────────────────
create table if not exists public.conteos_fisicos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  crew_id uuid not null references public.crews(id),
  supply_id uuid not null references public.supplies(id),
  contado numeric(14,3) not null check (contado >= 0),
  teorico numeric(14,3) not null,
  diferencia numeric(14,3) not null,
  contado_at timestamptz not null default now(),
  nota text,
  estado text not null default 'registrado' check (estado in ('registrado', 'ajustado', 'descartado')),
  movimiento_id uuid references public.movimientos_cuadrilla(id),
  motivo_decision text,
  registrado_por uuid references public.profiles(id),
  decidido_por uuid references public.profiles(id),
  decidido_at timestamptz
);
alter table public.conteos_fisicos enable row level security;
drop policy if exists conteos_fisicos_select on public.conteos_fisicos;
create policy conteos_fisicos_select on public.conteos_fisicos for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)
          and crew_id in (select public.cuadrillas_visibles())) or public.is_platform_admin());
grant select on public.conteos_fisicos to authenticated;

-- Los movimientos de una cuadrilla con si ya cuentan para el saldo oficial
create or replace function public.movimientos_confirmados(p_service uuid, p_crew uuid)
returns table (id uuid, supply_id uuid, fecha date, entrada numeric, salida numeric, tipo text, documento text, notas text,
               work_order_id uuid, confirmado boolean)
language sql stable security definer set search_path to 'public' as $$
  select m.id, m.supply_id, m.occurred_on,
         case when m.kind = 'salida' then m.qty else 0 end, case when m.kind = 'devolucion' then m.qty else 0 end,
         case when m.kind = 'salida' then 'entrega_almacen' else 'devolucion' end, coalesce(r.code, m.document), m.notes, null::uuid, true
    from public.stock_movements m left join public.supply_requests r on r.id = m.request_id
   where m.deleted_at is null and m.service_id = p_service and m.crew_id = p_crew and m.kind in ('salida', 'devolucion')
  union all
  select v.id, v.supply_id, v.occurred_on,
         case when v.tipo = 'saldo_inicial' or (v.tipo = 'ajuste' and v.qty > 0) then abs(v.qty) else 0 end,
         case when v.tipo in ('consumo', 'traslado', 'merma') or (v.tipo = 'ajuste' and v.qty < 0) then abs(v.qty) else 0 end,
         v.tipo::text, (select 'Parte ' || to_char(o.work_date, 'DD/MM') from public.work_orders o where o.id = v.work_order_id), v.notes,
         v.work_order_id,
         -- El consumo de un parte cuenta para el saldo oficial cuando el Supervisor lo valida
         v.work_order_id is null or exists (select 1 from public.work_orders o where o.id = v.work_order_id and o.status = 'validado')
    from public.movimientos_cuadrilla v
   where v.deleted_at is null and v.service_id = p_service and v.crew_id = p_crew
  union all
  select v.id, v.supply_id, v.occurred_on, v.qty, 0, 'traslado_recibido', null, v.notes, null, true
    from public.movimientos_cuadrilla v
   where v.deleted_at is null and v.service_id = p_service and v.crew_destino_id = p_crew and v.tipo = 'traslado'
$$;

/** Resumen de insumos por periodo (MRPCI_03 / modelo de seguimiento). */
create or replace function public.seguimiento_materiales(p_service uuid, p_crew uuid, p_desde date, p_hasta date)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_res json;
begin
  if not public.is_member(p_service) or public.es_visor(p_service) or not public.cuadrilla_a_mi_cargo(p_service, p_crew) then
    raise exception 'SIGOV: sin acceso a esa cuadrilla' using errcode = '42501';
  end if;
  with m as (select * from public.movimientos_confirmados(p_service, p_crew)),
  por as (
    select m.supply_id,
           coalesce(sum(m.entrada - m.salida) filter (where m.confirmado and m.fecha < p_desde), 0) apertura,
           coalesce(sum(m.entrada) filter (where m.confirmado and m.fecha between p_desde and p_hasta), 0) entradas,
           coalesce(sum(m.salida) filter (where m.confirmado and m.fecha between p_desde and p_hasta), 0) salidas,
           coalesce(sum(m.salida - m.entrada) filter (where not m.confirmado and m.fecha <= p_hasta), 0) por_validar,
           count(*) filter (where m.confirmado and m.fecha between p_desde and p_hasta) movimientos
      from m group by m.supply_id
  )
  select json_build_object(
    'insumos', (select coalesce(json_agg(json_build_object(
                  'supply_id', s.id, 'codigo', s.code, 'nombre', s.name, 'familia', coalesce(sc.name, s.category), 'unidad', u.symbol,
                  'apertura', p.apertura, 'entradas', p.entradas, 'salidas', p.salidas,
                  'teorico', p.apertura + p.entradas - p.salidas, 'por_validar', p.por_validar, 'movimientos', p.movimientos,
                  'conteo', (select json_build_object('id', c.id, 'contado', c.contado, 'teorico', c.teorico, 'diferencia', c.diferencia,
                                                      'estado', c.estado, 'cuando', c.contado_at, 'nota', c.nota)
                               from public.conteos_fisicos c where c.crew_id = p_crew and c.supply_id = s.id
                                -- el del periodo o, si lo hay, el que espera decisión (se ve hasta autorizarlo o descartarlo)
                                and ((c.contado_at at time zone 'America/Lima')::date between p_desde and p_hasta or c.estado = 'registrado')
                              order by (c.estado = 'registrado') desc, c.contado_at desc limit 1))
                order by coalesce(sc.orden, 999), s.code), '[]'::json)
                 from por p join public.supplies s on s.id = p.supply_id
                 left join public.supply_categories sc on sc.code = s.category left join public.units u on u.id = s.unit_id),
    'movimientos', (select coalesce(json_agg(json_build_object('id', m.id, 'supply_id', m.supply_id, 'insumo', s.name, 'fecha', m.fecha,
                       'entrada', m.entrada, 'salida', m.salida, 'tipo', m.tipo, 'documento', m.documento, 'notas', m.notas,
                       'confirmado', m.confirmado) order by m.fecha, s.code), '[]'::json)
                      from m join public.supplies s on s.id = m.supply_id where m.fecha between p_desde and p_hasta),
    'conteos_pendientes', (select count(*) from public.conteos_fisicos c where c.crew_id = p_crew and c.estado = 'registrado')
  ) into v_res;
  return v_res;
end $$;
grant execute on function public.seguimiento_materiales(uuid, uuid, date, date) to authenticated;

/** Registrar un conteo físico: queda la diferencia contra el teórico; el saldo no cambia. */
create or replace function public.conteo_registrar(p_crew uuid, p_supply uuid, p_contado numeric, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare c public.crews; v_teorico numeric; v_id uuid;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if public.role_in(c.service_id) not in ('admin', 'residente', 'supervisor') or not public.revisa_cuadrilla(c.service_id, p_crew) then
    raise exception 'SIGOV: el conteo lo registra el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if p_contado is null or p_contado < 0 then raise exception 'SIGOV: la cantidad contada no es válida'; end if;
  select coalesce(sum(entrada - salida), 0) into v_teorico
    from public.movimientos_confirmados(c.service_id, p_crew) where supply_id = p_supply and confirmado;
  insert into public.conteos_fisicos (service_id, crew_id, supply_id, contado, teorico, diferencia, nota, registrado_por)
  values (c.service_id, p_crew, p_supply, p_contado, v_teorico, p_contado - v_teorico, nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  return json_build_object('conteo', v_id, 'teorico', v_teorico, 'diferencia', p_contado - v_teorico);
end $$;
grant execute on function public.conteo_registrar(uuid, uuid, numeric, text) to authenticated;

/** Autorizar (crea el movimiento de ajuste con motivo) o descartar la diferencia de un conteo. */
create or replace function public.conteo_decidir(p_conteo uuid, p_ajustar boolean, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k public.conteos_fisicos; v_mov uuid;
begin
  select * into k from public.conteos_fisicos where id = p_conteo for update;
  if not found then raise exception 'SIGOV: el conteo no existe'; end if;
  if k.estado <> 'registrado' then raise exception 'SIGOV: ese conteo ya se decidió'; end if;
  if public.role_in(k.service_id) not in ('admin', 'supervisor') or not public.revisa_cuadrilla(k.service_id, k.crew_id) then
    raise exception 'SIGOV: el ajuste lo autoriza el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el ajuste requiere motivo'; end if;
  if p_ajustar and k.diferencia <> 0 then
    insert into public.movimientos_cuadrilla (service_id, crew_id, supply_id, tipo, qty, occurred_on, notes, created_by, client_id)
    values (k.service_id, k.crew_id, k.supply_id, 'ajuste', k.diferencia, (k.contado_at at time zone 'America/Lima')::date,
            'Ajuste por conteo físico: ' || trim(p_motivo), auth.uid(), k.id)
    returning id into v_mov;
  end if;
  update public.conteos_fisicos set estado = case when p_ajustar then 'ajustado' else 'descartado' end, movimiento_id = v_mov,
         motivo_decision = trim(p_motivo), decidido_por = auth.uid(), decidido_at = now()
   where id = k.id;
  return json_build_object('movimiento', v_mov);
end $$;
grant execute on function public.conteo_decidir(uuid, boolean, text) to authenticated;
revoke all on function public.conteo_registrar(uuid, uuid, numeric, text), public.conteo_decidir(uuid, boolean, text),
  public.requerimiento_guardar(uuid, uuid, jsonb, text), public.semana_publicar(uuid, text), public.semana_guardar_borrador(uuid, text) from anon;

-- Las semanas ya publicadas quedan con su versión 1 (lo que rige hoy)
insert into public.weekly_plan_versiones (service_id, plan_id, version, tipo, filas, n_filas, motivo, quien, cuando)
select w.service_id, w.id, 1, 'publicada', public.semana_filas(w.id), jsonb_array_length(public.semana_filas(w.id)),
       'Versión inicial', w.published_by, coalesce(w.published_at, w.updated_at)
  from public.weekly_plans w
 where w.status = 'publicado' and w.deleted_at is null
   and not exists (select 1 from public.weekly_plan_versiones v where v.plan_id = w.id);
