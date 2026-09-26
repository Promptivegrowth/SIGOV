-- ═══════════════════════════════════════════════════════════════════════
-- 0064 · Materiales: el maestro, el almacén y la trazabilidad
--
-- El módulo sabía recibir un pedido y descontarlo, pero no responder a lo
-- que pregunta cualquier residente cuando falta material: quién lo pidió,
-- quién lo autorizó, quién lo entregó, a qué cuadrilla y para qué partida.
-- Y tenía cuatro huecos:
--
-- · El almacén no podía recibir: no había cómo registrar una compra, así
--   que el stock de todo era cero y cada entrega lo dejaba en negativo.
-- · Un ajuste solo podía sumar. Un conteo físico que encuentra menos de lo
--   que dice el sistema no tenía cómo registrarse.
-- · Al entregar se sobrescribía quién había aprobado: el pedido quedaba
--   firmado por el almacenero y se perdía la autorización.
-- · La base solo exigía «poder escribir», que tiene también el jefe de
--   cuadrilla: desde el celular, o con la llave de la app, un capataz podía
--   aprobar su propio pedido o registrar una salida de almacén.
--
-- Aquí: el maestro y el almacén solo los mueve quien administra; aprobar,
-- rechazar y entregar, también; cada decisión queda con su autor y su
-- hora, puestos por la base y no por la pantalla; y todo movimiento queda
-- en la auditoría.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── El ajuste puede restar ────────────────────────────────────────────
-- Un ajuste es la diferencia del conteo físico: con signo. El resto de
-- movimientos van siempre en positivo; su tipo dice si entran o salen.
alter table public.stock_movements drop constraint if exists stock_movements_qty_check;
alter table public.stock_movements add constraint stock_movements_qty_check
  check ((kind = 'ajuste' and qty <> 0) or (kind <> 'ajuste' and qty > 0));

-- ─── Quién anuló un pedido ─────────────────────────────────────────────
alter table public.supply_requests
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancelled_at timestamptz;

-- ─── Un nombre, un insumo ──────────────────────────────────────────────
-- Dos «Emulsión CSS-1HP» en el maestro parten el stock en dos y ninguno de
-- los dos dice la verdad.
create unique index if not exists ux_supplies_servicio_nombre
  on public.supplies (service_id, upper(btrim(name)))
  where deleted_at is null;

-- ─── El maestro y el almacén: solo quien administra ────────────────────
drop policy if exists "supplies_insert" on public.supplies;
drop policy if exists "supplies_update" on public.supplies;
create policy "supplies_insert" on public.supplies for insert to authenticated
  with check (public.can_manage(service_id));
create policy "supplies_update" on public.supplies for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

drop policy if exists "stock_movements_insert" on public.stock_movements;
drop policy if exists "stock_movements_update" on public.stock_movements;
create policy "stock_movements_insert" on public.stock_movements for insert to authenticated
  with check (public.can_manage(service_id));
create policy "stock_movements_update" on public.stock_movements for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

-- El movimiento lo firma quien lo registra, no lo que diga la pantalla
create or replace function public.t_stock_movement_autor()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists t_stock_movement_autor on public.stock_movements;
create trigger t_stock_movement_autor
  before insert on public.stock_movements
  for each row execute function public.t_stock_movement_autor();

-- ─── Las decisiones sobre un pedido ────────────────────────────────────
--
-- La cuadrilla pide y puede anular lo suyo mientras nadie lo ha revisado.
-- Aprobar, rechazar y entregar son de quien administra. Cada paso se sella
-- con el usuario y la hora de la base: la pantalla no puede firmar por
-- otro. Los scripts de carga (sin usuario) pasan sin sello.
create or replace function public.t_supply_request_decision()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_old public.supply_request_status := case when tg_op = 'UPDATE' then old.status end;
begin
  if v_uid is null or new.status is not distinct from v_old then
    return new;
  end if;

  if new.status in ('aprobado', 'rechazado', 'parcial', 'entregado')
     and not public.can_manage(new.service_id) then
    raise exception 'Solo el residente o el supervisor pueden aprobar, rechazar o entregar un pedido.'
      using errcode = '42501';
  end if;

  if new.status = 'anulado' then
    if not public.can_manage(new.service_id)
       and not (new.created_by = v_uid and v_old in ('borrador', 'solicitado')) then
      raise exception 'Un pedido ya revisado solo lo puede anular el residente o el supervisor.'
        using errcode = '42501';
    end if;
    new.cancelled_by := v_uid;
    new.cancelled_at := now();
  end if;

  -- La autorización: se sella al aprobar o rechazar, y al entregar
  -- directamente algo que nadie había aprobado. Una entrega posterior ya
  -- no la toca.
  if new.status in ('aprobado', 'rechazado')
     or (new.status in ('parcial', 'entregado') and coalesce(v_old::text, 'solicitado') in ('borrador', 'solicitado')) then
    new.reviewed_by := v_uid;
    new.reviewed_at := now();
  elsif tg_op = 'UPDATE' then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end $$;

drop trigger if exists t_supply_request_decision on public.supply_requests;
create trigger t_supply_request_decision
  before insert or update on public.supply_requests
  for each row execute function public.t_supply_request_decision();

-- ─── Auditoría ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['supplies', 'supply_requests', 'supply_request_items', 'stock_movements']
  loop
    execute format('drop trigger if exists t_audit_%1$s on public.%1$I', t);
    execute format('create trigger t_audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ─── El pedido, con sus firmas ─────────────────────────────────────────
-- Las columnas nuevas van al final: la app de campo lee esta vista.
create or replace view public.v_supply_requests
with (security_invoker = true) as
select
  r.id,
  r.client_id,
  r.service_id,
  r.code,
  r.status,
  r.needed_on,
  r.reason,
  r.crew_id,
  c.name                                   as crew_name,
  r.section_id,
  sec.name                                 as section_name,
  r.plan_item_id,
  a.name                                   as activity_name,
  r.review_note,
  r.notified_client_at,
  p.full_name                              as created_by_name,
  r.created_at,
  r.created_by,
  count(i.id)                              as item_count,
  coalesce(sum(i.qty_requested), 0)::numeric(12,2)  as qty_requested,
  coalesce(sum(i.qty_delivered), 0)::numeric(12,2)  as qty_delivered,
  r.reviewed_by,
  rv.full_name                             as reviewed_by_name,
  r.reviewed_at,
  r.cancelled_at,
  cx.full_name                             as cancelled_by_name,
  (select max(m.created_at) from public.stock_movements m
    where m.request_id = r.id and m.kind = 'salida' and m.deleted_at is null) as delivered_at,
  count(i.id) filter (where i.supply_id is null) as items_fuera_de_catalogo
from public.supply_requests r
left join public.crews c               on c.id = r.crew_id
left join public.road_sections sec     on sec.id = r.section_id
left join public.plan_items pi         on pi.id = r.plan_item_id
left join public.activities_catalog a  on a.id = pi.activity_id
left join public.profiles p            on p.id = r.created_by
left join public.profiles rv           on rv.id = r.reviewed_by
left join public.profiles cx           on cx.id = r.cancelled_by
left join public.supply_request_items i on i.request_id = r.id and i.deleted_at is null
where r.deleted_at is null
group by r.id, c.name, sec.name, a.name, p.full_name, rv.full_name, cx.full_name;

-- ─── El kárdex ─────────────────────────────────────────────────────────
--
-- Cada entrada y salida del almacén con su saldo después del movimiento:
-- qué, cuánto, cuándo, quién lo registró, a qué cuadrilla fue, por qué
-- pedido y para qué partida y tramo.
create or replace view public.v_kardex
with (security_invoker = true) as
select
  m.id,
  m.service_id,
  m.occurred_on,
  m.created_at,
  m.kind,
  m.qty,
  (case when m.kind in ('ingreso', 'devolucion') then m.qty
        when m.kind in ('salida', 'merma')       then -m.qty
        else m.qty end)::numeric(12,2)          as delta,
  sum(case when m.kind in ('ingreso', 'devolucion') then m.qty
           when m.kind in ('salida', 'merma')       then -m.qty
           else m.qty end)
    over (partition by m.supply_id order by m.occurred_on, m.created_at, m.id
          rows between unbounded preceding and current row)::numeric(12,2) as saldo,
  m.supply_id,
  s.code                                        as supply_code,
  s.name                                        as supply_name,
  s.category                                    as supply_category,
  u.symbol                                      as unit_symbol,
  m.crew_id,
  c.name                                        as crew_name,
  m.request_id,
  r.code                                        as request_code,
  a.name                                        as activity_name,
  sec.name                                      as section_name,
  m.supplier,
  m.document,
  m.unit_cost,
  m.notes,
  m.created_by,
  p.full_name                                   as created_by_name
from public.stock_movements m
join public.supplies s                 on s.id = m.supply_id
left join public.units u               on u.id = s.unit_id
left join public.crews c               on c.id = m.crew_id
left join public.supply_requests r     on r.id = m.request_id
left join public.plan_items pi         on pi.id = r.plan_item_id
left join public.activities_catalog a  on a.id = pi.activity_id
left join public.road_sections sec     on sec.id = r.section_id
left join public.profiles p            on p.id = m.created_by
where m.deleted_at is null
  and s.deleted_at is null;

grant select on public.v_kardex to authenticated;

-- ─── La historia de un pedido ──────────────────────────────────────────
create or replace view public.v_historial_de_pedido
with (security_invoker = true) as
select r.id as request_id, r.service_id, r.created_at as ocurrio, 'solicitado'::text as paso,
       p.full_name as quien, r.reason as detalle, null::numeric as cantidad, null::text as insumo
from public.supply_requests r
left join public.profiles p on p.id = r.created_by
where r.deleted_at is null
union all
select r.id, r.service_id, r.reviewed_at,
       case when r.status = 'rechazado' then 'rechazado' else 'aprobado' end,
       p.full_name, r.review_note, null, null
from public.supply_requests r
left join public.profiles p on p.id = r.reviewed_by
where r.deleted_at is null and r.reviewed_at is not null
union all
select m.request_id, m.service_id, m.created_at,
       case m.kind when 'salida' then 'entregado' else m.kind::text end,
       p.full_name, m.notes, m.qty, s.name
from public.stock_movements m
join public.supplies s on s.id = m.supply_id
left join public.profiles p on p.id = m.created_by
where m.request_id is not null and m.deleted_at is null
union all
select r.id, r.service_id, r.cancelled_at, 'anulado', p.full_name, null, null, null
from public.supply_requests r
left join public.profiles p on p.id = r.cancelled_by
where r.deleted_at is null and r.cancelled_at is not null;

grant select on public.v_historial_de_pedido to authenticated;

-- ─── Pedir desde la web ────────────────────────────────────────────────
--
-- El residente también pide: para una cuadrilla que llamó por radio o para
-- el stock de la semana. Lo que él pide ya va autorizado —pedirlo es
-- autorizarlo—, salvo que prefiera dejarlo para revisión.
create or replace function public.crear_pedido(
  p_service_id   uuid,
  p_crew_id      uuid default null,
  p_needed_on    date default null,
  p_reason       text default null,
  p_section_id   uuid default null,
  p_plan_item_id uuid default null,
  p_items        jsonb default '[]'::jsonb,  -- [{supply_id, qty, notes} | {other_name, other_unit_id, qty, notes}]
  p_aprobar      boolean default true
) returns uuid
language plpgsql security invoker set search_path to 'public' as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  if not public.can_write(p_service_id) then
    raise exception 'No tienes permiso para pedir materiales en este contrato.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  insert into public.supply_requests
    (service_id, crew_id, status, needed_on, reason, section_id, plan_item_id, created_by)
  values
    (p_service_id, p_crew_id,
     case when p_aprobar and public.can_manage(p_service_id) then 'aprobado' else 'solicitado' end::public.supply_request_status,
     coalesce(p_needed_on, (now() at time zone 'America/Lima')::date),
     nullif(btrim(p_reason), ''), p_section_id, p_plan_item_id, auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, qty_approved, notes)
    values (
      p_service_id, v_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      case when p_aprobar and public.can_manage(p_service_id) then (v_item->>'qty')::numeric end,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  return v_id;
end $$;

grant execute on function public.crear_pedido(uuid, uuid, date, text, uuid, uuid, jsonb, boolean) to authenticated;

-- ─── Revisar: aprobar con cantidades, o rechazar ──────────────────────
create or replace function public.revisar_pedido(
  p_request_id uuid,
  p_aprobar    boolean,
  p_nota       text,
  p_cantidades jsonb default '{}'::jsonb   -- {item_id: cantidad aprobada}
) returns void
language plpgsql security invoker set search_path to 'public' as $$
declare
  v_r public.supply_requests;
begin
  select * into v_r from public.supply_requests where id = p_request_id for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  if v_r.status <> 'solicitado' then
    raise exception 'El pedido % ya no está por revisar: está %.', v_r.code, v_r.status;
  end if;
  if not p_aprobar and nullif(btrim(p_nota), '') is null then
    raise exception 'Escribe por qué se rechaza: la cuadrilla necesita saberlo.';
  end if;

  if p_aprobar then
    update public.supply_request_items i
       set qty_approved = coalesce((p_cantidades->>(i.id::text))::numeric, i.qty_requested),
           updated_at   = now()
     where i.request_id = p_request_id and i.deleted_at is null;
  end if;

  update public.supply_requests
     set status      = case when p_aprobar then 'aprobado' else 'rechazado' end::public.supply_request_status,
         review_note = nullif(btrim(p_nota), ''),
         updated_at  = now()
   where id = p_request_id;
end $$;

grant execute on function public.revisar_pedido(uuid, boolean, text, jsonb) to authenticated;

-- ─── Entregar: de una vez, o no se entrega ────────────────────────────
--
-- Antes eran pasos sueltos desde la pantalla —las salidas, cada renglón,
-- el estado— y un corte de red a la mitad dejaba el stock descontado con
-- el pedido sin entregar. Ahora es una sola operación.
create or replace function public.entregar_pedido(
  p_request_id uuid,
  p_cantidades jsonb,          -- {item_id: cantidad que se entrega ahora}
  p_nota       text default null,
  p_fecha      date default null
) returns public.supply_request_status
language plpgsql security invoker set search_path to 'public' as $$
declare
  v_r       public.supply_requests;
  v_i       record;
  v_qty     numeric;
  v_alguno  boolean := false;
  v_queda   boolean;
  v_estado  public.supply_request_status;
begin
  select * into v_r from public.supply_requests where id = p_request_id for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  if v_r.status not in ('solicitado', 'aprobado', 'parcial') then
    raise exception 'El pedido % no se puede entregar: está %.', v_r.code, v_r.status;
  end if;
  if exists (select 1 from public.supply_request_items
              where request_id = p_request_id and deleted_at is null and supply_id is null) then
    raise exception 'Hay insumos pedidos fuera del catálogo: añádelos al maestro antes de entregar.';
  end if;

  for v_i in
    select * from public.supply_request_items
     where request_id = p_request_id and deleted_at is null
  loop
    v_qty := coalesce((p_cantidades->>(v_i.id::text))::numeric, 0);
    continue when v_qty <= 0;
    v_alguno := true;

    insert into public.stock_movements
      (service_id, supply_id, kind, qty, occurred_on, crew_id, request_id, notes)
    values
      (v_r.service_id, v_i.supply_id, 'salida', v_qty,
       coalesce(p_fecha, (now() at time zone 'America/Lima')::date),
       v_r.crew_id, v_r.id,
       coalesce(nullif(btrim(p_nota), ''), 'Entrega del pedido ' || coalesce(v_r.code, '')));

    update public.supply_request_items
       set qty_delivered = qty_delivered + v_qty, updated_at = now()
     where id = v_i.id;
  end loop;

  if not v_alguno then raise exception 'No hay nada que entregar.'; end if;

  select exists (
    select 1 from public.supply_request_items
     where request_id = p_request_id and deleted_at is null
       and qty_delivered < coalesce(qty_approved, qty_requested)
  ) into v_queda;

  v_estado := case when v_queda then 'parcial' else 'entregado' end;
  update public.supply_requests
     set status = v_estado, updated_at = now()
   where id = p_request_id;
  return v_estado;
end $$;

grant execute on function public.entregar_pedido(uuid, jsonb, text, date) to authenticated;

revoke execute on function public.crear_pedido(uuid, uuid, date, text, uuid, uuid, jsonb, boolean) from anon;
revoke execute on function public.revisar_pedido(uuid, boolean, text, jsonb) from anon;
revoke execute on function public.entregar_pedido(uuid, jsonb, text, date) from anon;

-- ─── La demostración ───────────────────────────────────────────────────
-- El pedido de prueba se hizo con los insumos de demostración, que ya se
-- dieron de baja al cargar el maestro oficial: se da de baja con ellos.
update public.supply_requests r
   set deleted_at = now()
 where r.deleted_at is null
   and exists (select 1 from public.supply_request_items i
                 join public.supplies s on s.id = i.supply_id
                where i.request_id = r.id and s.code like 'DEMO-%')
   and not exists (select 1 from public.supply_request_items i
                     join public.supplies s on s.id = i.supply_id
                    where i.request_id = r.id and s.code not like 'DEMO-%');
