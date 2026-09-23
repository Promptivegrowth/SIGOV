-- ═══════════════════════════════════════════════════════════════════════
-- 0054 · Pedir lo que no está en la lista
--
-- De la reunión con Elvis: el maestro de materiales tiene que llevar su
-- código y su unidad, y además hacer falta un «otros» que se pueda
-- escribir. Lo primero ya estaba —`supplies` lleva código, categoría y
-- unidad desde la 0026—; lo segundo no: `supply_request_items.supply_id`
-- es obligatorio, así que lo que no figura en el catálogo sencillamente no
-- se puede pedir.
--
-- Y eso en obra pasa todas las semanas. Un contrato de conservación
-- arranca con el catálogo que se armó en la oficina, y el capataz necesita
-- un perno, una manguera o una lata de algo que nadie previó. Hoy lo pide
-- por WhatsApp, que es justo lo que este módulo vino a quitar: si el
-- pedido no cabe en el sistema, el pedido sale por fuera y deja de haber
-- registro.
--
-- Aquí el renglón pasa a admitir las dos formas: un insumo del catálogo,
-- o un nombre escrito con su unidad. Una y solo una de las dos.
--
-- Y hay una tercera pieza, que es la que hace que esto no se vuelva un
-- cajón de sastre: el residente puede **adoptar** lo que se pidió suelto y
-- convertirlo en insumo del catálogo. El renglón se reapunta al insumo
-- nuevo y la próxima cuadrilla ya lo encuentra en la lista. Así el maestro
-- crece con lo que de verdad se pide en la vía, en vez de quedarse con lo
-- que se imaginó en la oficina.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── El renglón admite un insumo o un nombre escrito ───────────────────

alter table public.supply_request_items
  alter column supply_id drop not null;

alter table public.supply_request_items
  add column if not exists other_name    text,
  add column if not exists other_unit_id uuid references public.units(id);

-- Exactamente una de las dos formas. Ni las dos —no se sabría cuál vale—
-- ni ninguna, que sería un renglón que no pide nada.
do $$ begin
  alter table public.supply_request_items
    add constraint supply_request_items_insumo_u_otro
    check (
      (supply_id is not null and other_name is null)
      or
      (supply_id is null and nullif(btrim(other_name), '') is not null)
    );
exception when duplicate_object then null; end $$;

comment on column public.supply_request_items.other_name is
  'Lo que se pidió cuando no figura en el catálogo, escrito por quien lo '
  'pide. El residente puede adoptarlo con adoptar_insumo().';

-- ─── Lo que se está pidiendo fuera del catálogo ────────────────────────
--
-- Esta vista es la que le dice al residente qué le falta al maestro. Si un
-- mismo nombre aparece tres veces en un mes, ese material tiene que estar
-- en la lista.

create or replace view public.v_pedidos_fuera_de_catalogo
with (security_invoker = true) as
select
  i.service_id,
  btrim(i.other_name)               as nombre,
  count(*)                          as veces,
  sum(i.qty_requested)              as cantidad_total,
  max(u.symbol)                     as unidad,
  (array_agg(i.other_unit_id) filter (where i.other_unit_id is not null))[1] as unit_id,
  min(r.created_at)::date           as primera_vez,
  max(r.created_at)::date           as ultima_vez,
  -- Los renglones concretos, para poder adoptarlos de una
  array_agg(i.id order by r.created_at desc) as items
from public.supply_request_items i
join public.supply_requests r on r.id = i.request_id
left join public.units u on u.id = i.other_unit_id
where i.supply_id is null
  and i.deleted_at is null
  and r.deleted_at is null
group by i.service_id, btrim(i.other_name);

comment on view public.v_pedidos_fuera_de_catalogo is
  'Lo que las cuadrillas piden y no está en el maestro de materiales, '
  'agrupado por nombre. Lo que se repite es lo que falta en el catálogo.';

-- ─── Adoptar: de pedido suelto a insumo del catálogo ───────────────────

create or replace function public.adoptar_insumo(
  p_service_id uuid,
  p_nombre     text,
  p_code       text,
  p_unit_id    uuid default null,
  p_category   text default null,
  p_min_stock  numeric default 0
) returns uuid
language plpgsql security invoker
set search_path to 'public'
as $$
declare
  v_supply_id uuid;
  v_nombre    text := btrim(p_nombre);
begin
  if v_nombre = '' or v_nombre is null then
    raise exception 'Hay que decir qué insumo se está adoptando.';
  end if;

  -- Si ya existe uno con ese código en el contrato, se reutiliza: adoptar
  -- dos veces el mismo material no puede duplicarlo en el maestro.
  select s.id into v_supply_id
  from public.supplies s
  where s.service_id = p_service_id
    and upper(btrim(s.code)) = upper(btrim(p_code))
  limit 1;

  if v_supply_id is null then
    insert into public.supplies (service_id, code, name, category, unit_id, min_stock, created_by)
    values (
      p_service_id,
      btrim(p_code),
      v_nombre,
      p_category,
      coalesce(
        p_unit_id,
        -- Si no se dice, se toma la que usó quien lo pidió
        (select i.other_unit_id
           from public.supply_request_items i
          where i.service_id = p_service_id
            and btrim(i.other_name) = v_nombre
            and i.other_unit_id is not null
          limit 1)
      ),
      coalesce(p_min_stock, 0),
      auth.uid()
    )
    returning id into v_supply_id;
  end if;

  -- Los renglones que pedían esto suelto pasan a apuntar al insumo. El
  -- pedido no cambia de cantidad ni de fecha: solo deja de ser texto.
  update public.supply_request_items i
  set supply_id     = v_supply_id,
      other_name    = null,
      other_unit_id = null,
      updated_at    = now()
  where i.service_id = p_service_id
    and i.supply_id is null
    and btrim(i.other_name) = v_nombre
    and i.deleted_at is null;

  return v_supply_id;
end $$;

comment on function public.adoptar_insumo is
  'Convierte en insumo del catálogo algo que se venía pidiendo escrito a '
  'mano, y reapunta a él todos los renglones que lo pedían así.';

grant execute on function public.adoptar_insumo(uuid, text, text, uuid, text, numeric)
  to authenticated;

-- ─── Los pedidos, ya leídos ────────────────────────────────────────────
--
-- Quien mira un pedido no tiene por qué saber si el renglón venía del
-- catálogo o escrito: le interesa qué se pidió, cuánto y en qué unidad.

drop view if exists public.v_renglones_de_pedido;

create view public.v_renglones_de_pedido
with (security_invoker = true) as
select
  i.id,
  i.service_id,
  i.request_id,
  i.supply_id,
  coalesce(s.name, btrim(i.other_name))        as nombre,
  coalesce(s.code, '—')                        as codigo,
  coalesce(us.symbol, uo.symbol)               as unidad,
  -- La unidad que eligió quien lo pidió, para que quien lo adopte al
  -- catálogo la encuentre ya puesta y no tenga que adivinarla.
  coalesce(s.unit_id, i.other_unit_id)         as unit_id,
  s.category,
  i.supply_id is null                          as fuera_de_catalogo,
  i.qty_requested,
  i.qty_approved,
  i.qty_delivered,
  i.notes
from public.supply_request_items i
left join public.supplies s on s.id = i.supply_id
left join public.units us  on us.id = s.unit_id
left join public.units uo  on uo.id = i.other_unit_id
where i.deleted_at is null;

comment on view public.v_renglones_de_pedido is
  'Los renglones de un pedido con su nombre y unidad resueltos, vengan del '
  'catálogo o escritos a mano.';
