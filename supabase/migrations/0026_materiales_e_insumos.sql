-- ═══════════════════════════════════════════════════════════════════════
-- 0026 · Materiales e insumos
--
-- Lo que hoy se pide por WhatsApp y se apunta en un cuaderno: emulsión,
-- pintura, señales, EPP. El problema no es el pedido en sí, es que nadie
-- sabe qué se pidió, cuándo, para qué partida, ni si llegó. Y cuando el
-- material no llega, la cuadrilla se queda parada y esa pérdida no aparece
-- en ningún lado.
--
-- Tres piezas:
--   · el catálogo de insumos del contrato;
--   · el pedido de la cuadrilla, con sus renglones;
--   · el movimiento de almacén, que es lo que mueve el stock de verdad.
--
-- El stock NO se guarda como número: se calcula sumando los movimientos,
-- por la misma razón que el saldo de caja. Un stock guardado se desincroniza
-- en cuanto alguien anula una entrega y deja de servir para reponer.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.supply_request_status as enum (
    'borrador',     -- la cuadrilla lo está armando
    'solicitado',   -- pedido en firme, esperando al almacén
    'aprobado',     -- el residente lo autorizó
    'parcial',      -- se entregó una parte
    'entregado',    -- completo
    'rechazado',
    'anulado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_movement_kind as enum (
    'ingreso',      -- compra o devolución del proveedor
    'salida',       -- entrega a una cuadrilla
    'devolucion',   -- la cuadrilla devuelve lo que no usó
    'merma',        -- pérdida, rotura o vencimiento
    'ajuste'        -- corrección de inventario físico
  );
exception when duplicate_object then null; end $$;

-- ─── El catálogo de insumos ───────────────────────────────────────────

create table if not exists public.supplies (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  code        text not null,
  name        text not null,
  category    text,                       -- asfaltos, pinturas, señalización, EPP…
  unit_id     uuid references public.units(id),
  -- Cuando el stock baja de aquí, hay que reponer antes de quedarse seco
  min_stock   numeric(12,2) not null default 0,
  -- Precio referencial, solo para estimar el costo de un pedido
  unit_cost   numeric(12,2),
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  constraint supplies_client_id_key unique (client_id),
  constraint supplies_code_key unique (service_id, code)
);

create index if not exists supplies_service_idx on public.supplies (service_id) where deleted_at is null;

-- ─── El pedido de la cuadrilla ────────────────────────────────────────

create table if not exists public.supply_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  crew_id      uuid references public.crews(id),
  status       public.supply_request_status not null default 'solicitado',

  code         text,                      -- correlativo visible: SOL-2026-0001
  needed_on    date not null default (now() at time zone 'America/Lima')::date,
  reason       text,

  -- Lo que pidió Elvis: el pedido cuelga de la programación de la semana,
  -- para que se vea qué partida se cae si el material no llega.
  plan_id      uuid references public.weekly_plans(id) on delete set null,
  plan_item_id uuid references public.plan_items(id) on delete set null,
  section_id   uuid references public.road_sections(id),

  -- Qué respondió el residente
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text,
  -- Si el pedido se le traslada al cliente para que lo provea
  notified_client_at timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint supply_requests_client_id_key unique (client_id)
);

create index if not exists supply_requests_service_idx on public.supply_requests (service_id, needed_on desc) where deleted_at is null;
create index if not exists supply_requests_crew_idx on public.supply_requests (crew_id) where deleted_at is null;

create table if not exists public.supply_request_items (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  request_id  uuid not null references public.supply_requests(id) on delete cascade,
  supply_id   uuid not null references public.supplies(id),
  qty_requested numeric(12,2) not null check (qty_requested > 0),
  qty_approved  numeric(12,2) check (qty_approved >= 0),
  qty_delivered numeric(12,2) not null default 0 check (qty_delivered >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint supply_request_items_client_id_key unique (client_id)
);

create index if not exists supply_request_items_req_idx on public.supply_request_items (request_id) where deleted_at is null;

-- ─── El movimiento de almacén ─────────────────────────────────────────

create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  supply_id   uuid not null references public.supplies(id),
  kind        public.stock_movement_kind not null,
  qty         numeric(12,2) not null check (qty > 0),
  occurred_on date not null default (now() at time zone 'America/Lima')::date,

  crew_id     uuid references public.crews(id),
  request_id  uuid references public.supply_requests(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,

  supplier    text,
  document    text,                       -- guía de remisión, factura
  unit_cost   numeric(12,2),
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  constraint stock_movements_client_id_key unique (client_id)
);

create index if not exists stock_movements_supply_idx on public.stock_movements (supply_id, occurred_on desc) where deleted_at is null;

-- ─── El stock, calculado ──────────────────────────────────────────────

create or replace view public.v_supplies as
select
  s.id,
  s.service_id,
  s.code,
  s.name,
  s.category,
  s.unit_id,
  u.symbol                                 as unit_symbol,
  s.min_stock,
  s.unit_cost,
  s.is_active,
  coalesce(sum(case when m.kind in ('ingreso', 'devolucion') then  m.qty
                    when m.kind in ('salida', 'merma')       then -m.qty
                    when m.kind = 'ajuste'                   then  m.qty
               end), 0)::numeric(12,2)     as stock,
  -- Lo ya aprobado y todavía sin entregar: comprometido, aunque esté en el
  -- almacén no se puede ofrecer a otra cuadrilla.
  coalesce((
    select sum(coalesce(i.qty_approved, i.qty_requested) - i.qty_delivered)
      from public.supply_request_items i
      join public.supply_requests r on r.id = i.request_id
     where i.supply_id = s.id
       and i.deleted_at is null
       and r.deleted_at is null
       and r.status in ('aprobado', 'parcial')
  ), 0)::numeric(12,2)                     as committed,
  max(m.occurred_on)                       as last_movement_on
from public.supplies s
left join public.units u on u.id = s.unit_id
left join public.stock_movements m on m.supply_id = s.id and m.deleted_at is null
where s.deleted_at is null
group by s.id, u.symbol;

create or replace view public.v_supply_requests as
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
  coalesce(sum(i.qty_delivered), 0)::numeric(12,2)  as qty_delivered
from public.supply_requests r
left join public.crews c on c.id = r.crew_id
left join public.road_sections sec on sec.id = r.section_id
left join public.plan_items pi on pi.id = r.plan_item_id
left join public.activities_catalog a on a.id = pi.activity_id
left join public.profiles p on p.id = r.created_by
left join public.supply_request_items i on i.request_id = r.id and i.deleted_at is null
where r.deleted_at is null
group by r.id, c.name, sec.name, a.name, p.full_name;

-- ─── Seguridad ────────────────────────────────────────────────────────

alter table public.supplies              enable row level security;
alter table public.supply_requests       enable row level security;
alter table public.supply_request_items  enable row level security;
alter table public.stock_movements       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'supplies', 'supply_requests', 'supply_request_items', 'stock_movements'
  ] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);

    execute format($f$
      create policy "%1$s_select" on public.%1$I for select to authenticated
      using (public.is_member(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_insert" on public.%1$I for insert to authenticated
      with check (public.can_write(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_update" on public.%1$I for update to authenticated
      using (public.can_write(service_id)) with check (public.can_write(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_delete" on public.%1$I for delete to authenticated
      using (public.can_manage(service_id))$f$, t);
  end loop;
end $$;

grant select on public.v_supplies, public.v_supply_requests to authenticated;

-- ─── Correlativo del pedido ───────────────────────────────────────────

create or replace function public.next_supply_request_code(p_service_id uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select 'SOL-' ||
         to_char((now() at time zone 'America/Lima'), 'YYYY') || '-' ||
         lpad((
           coalesce((
             select max(substring(r.code from '[0-9]+$')::int)
               from public.supply_requests r
              where r.service_id = p_service_id
                and r.code ~ '^SOL-[0-9]{4}-[0-9]+$'
                and r.code like 'SOL-' || to_char((now() at time zone 'America/Lima'), 'YYYY') || '-%'
           ), 0) + 1
         )::text, 4, '0')
$$;

-- ─── El número del pedido ─────────────────────────────────────────────
--
-- El correlativo se asigna en la base, no en la aplicación: el pedido puede
-- entrar desde el celular —por la cola, quizá días después— o desde la web,
-- y en ambos casos tiene que salir numerado. Un pedido sin número no se
-- puede reclamar por radio ni citar en un acta.

create or replace function public.asignar_codigo_de_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_supply_request_code(new.service_id);
  end if;
  return new;
end $$;

drop trigger if exists supply_requests_codigo on public.supply_requests;
create trigger supply_requests_codigo
  before insert on public.supply_requests
  for each row execute function public.asignar_codigo_de_pedido();

-- Los que ya entraron sin número se numeran ahora, por orden de llegada
do $$
declare v_fila record;
begin
  for v_fila in
    select id, service_id from public.supply_requests
     where code is null and deleted_at is null
     order by created_at
  loop
    update public.supply_requests
       set code = public.next_supply_request_code(v_fila.service_id)
     where id = v_fila.id;
  end loop;
end $$;
