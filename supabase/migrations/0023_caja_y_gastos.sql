-- ═══════════════════════════════════════════════════════════════════════
-- 0023 · Caja chica, gastos y solicitud de depósito
--
-- Hoy el dinero de obra se controla en un cuaderno y en fotos de boletas por
-- WhatsApp: nadie sabe el saldo real hasta que alguien suma a mano, y las
-- boletas se pierden. Esto lo pone en el mismo sitio que el resto del trabajo.
--
-- Tres piezas:
--   · la caja, que es de una persona y de una cuadrilla;
--   · los movimientos, cada uno con su comprobante;
--   · la solicitud de depósito, que es lo que el capataz pide cuando se le
--     está acabando la plata y administración tiene que responder.
--
-- El saldo NO se guarda: se calcula sumando los movimientos. Un saldo
-- guardado se desincroniza en cuanto alguien anula un gasto, y entonces deja
-- de servir para rendir.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Tipos ────────────────────────────────────────────────────────────

do $$ begin
  create type public.cash_movement_kind as enum (
    'apertura',     -- el monto con el que se abre la caja
    'deposito',     -- plata que entra desde administración
    'gasto',        -- plata que sale con comprobante
    'devolucion',   -- plata que el responsable devuelve
    'ajuste'        -- corrección aprobada por administración
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cash_movement_status as enum (
    'registrado',   -- lo anotó el responsable
    'observado',    -- administración pide sustento o corrección
    'aprobado',     -- entra en la rendición
    'anulado'       -- se deja sin efecto, pero no se borra
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.deposit_request_status as enum (
    'solicitado',
    'aprobado',
    'depositado',
    'rechazado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.receipt_kind as enum (
    'boleta', 'factura', 'recibo', 'ticket', 'planilla', 'sin_comprobante'
  );
exception when duplicate_object then null; end $$;

-- ─── La caja ──────────────────────────────────────────────────────────

create table if not exists public.cash_boxes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  crew_id     uuid references public.crews(id),
  holder_id   uuid not null references public.profiles(id),
  code        text not null,
  name        text not null,
  currency    text not null default 'PEN',
  -- Cuando el saldo baja de aquí, la aplicación avisa que toca pedir depósito
  low_balance_threshold numeric(12,2) not null default 200,
  is_active   boolean not null default true,
  opened_on   date not null default (now() at time zone 'America/Lima')::date,
  closed_on   date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  constraint cash_boxes_client_id_key unique (client_id),
  constraint cash_boxes_code_key unique (service_id, code)
);

create index if not exists cash_boxes_service_idx on public.cash_boxes (service_id) where deleted_at is null;
create index if not exists cash_boxes_holder_idx  on public.cash_boxes (holder_id)  where deleted_at is null;

-- ─── Los movimientos ──────────────────────────────────────────────────

create table if not exists public.cash_movements (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  cash_box_id  uuid not null references public.cash_boxes(id) on delete cascade,
  kind         public.cash_movement_kind not null,
  status       public.cash_movement_status not null default 'registrado',

  -- Siempre positivo; el signo lo pone la naturaleza del movimiento
  amount       numeric(12,2) not null check (amount > 0),
  occurred_on  date not null default (now() at time zone 'America/Lima')::date,

  category     text,                    -- combustible, alimentación, peaje, repuestos…
  description  text not null,
  supplier     text,
  supplier_ruc text,

  receipt_kind   public.receipt_kind not null default 'boleta',
  receipt_number text,
  storage_path   text,                  -- la foto del comprobante, en el bucket documentos
  storage_sha256 text,

  -- A qué trabajo se carga el gasto: sin esto no se puede valorizar
  work_order_id uuid references public.work_orders(id) on delete set null,
  section_id    uuid references public.road_sections(id),
  crew_id       uuid references public.crews(id),

  -- Qué dijo administración
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint cash_movements_client_id_key unique (client_id)
);

create index if not exists cash_movements_box_idx  on public.cash_movements (cash_box_id, occurred_on desc) where deleted_at is null;
create index if not exists cash_movements_serv_idx on public.cash_movements (service_id) where deleted_at is null;

-- Un gasto sin comprobante es una excepción, y tiene que estar dicha
alter table public.cash_movements drop constraint if exists cash_movements_sustento_chk;
alter table public.cash_movements add constraint cash_movements_sustento_chk check (
  kind <> 'gasto'
  or receipt_kind = 'sin_comprobante'
  or storage_path is not null
);

-- ─── La solicitud de depósito ─────────────────────────────────────────

create table if not exists public.deposit_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  cash_box_id  uuid not null references public.cash_boxes(id) on delete cascade,
  status       public.deposit_request_status not null default 'solicitado',

  amount       numeric(12,2) not null check (amount > 0),
  reason       text not null,
  needed_by    date,

  -- Lo que responde administración
  approved_amount numeric(12,2) check (approved_amount is null or approved_amount > 0),
  resolved_by  uuid references public.profiles(id),
  resolved_at  timestamptz,
  resolution_note text,
  bank_reference  text,                 -- número de operación del abono
  -- El movimiento de ingreso que nació de esta solicitud
  movement_id  uuid references public.cash_movements(id) on delete set null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint deposit_requests_client_id_key unique (client_id)
);

create index if not exists deposit_requests_box_idx on public.deposit_requests (cash_box_id, created_at desc) where deleted_at is null;

-- ─── El saldo, calculado ──────────────────────────────────────────────

create or replace view public.v_cash_boxes as
select
  b.id,
  b.service_id,
  b.crew_id,
  c.name                          as crew_name,
  b.holder_id,
  p.full_name                     as holder_name,
  b.code,
  b.name,
  b.currency,
  b.low_balance_threshold,
  b.is_active,
  b.opened_on,
  b.closed_on,

  coalesce(sum(case when m.kind in ('apertura', 'deposito') then  m.amount
                    when m.kind in ('gasto', 'devolucion')  then -m.amount
                    when m.kind = 'ajuste'                  then  m.amount
               end) filter (where m.status = 'aprobado'), 0)::numeric(12,2) as balance_approved,

  -- Lo que el responsable ve como saldo: lo aprobado menos lo que ya gastó
  -- aunque administración todavía no lo revise.
  coalesce(sum(case when m.kind in ('apertura', 'deposito') then  m.amount
                    when m.kind in ('gasto', 'devolucion')  then -m.amount
                    when m.kind = 'ajuste'                  then  m.amount
               end) filter (where m.status in ('aprobado', 'registrado', 'observado')), 0)::numeric(12,2) as balance,

  count(m.id) filter (where m.status = 'registrado')                as pending_review,
  count(m.id) filter (where m.status = 'observado')                 as observed,
  max(m.occurred_on)                                                as last_movement_on
from public.cash_boxes b
left join public.crews    c on c.id = b.crew_id
left join public.profiles p on p.id = b.holder_id
left join public.cash_movements m
       on m.cash_box_id = b.id and m.deleted_at is null and m.status <> 'anulado'
where b.deleted_at is null
group by b.id, c.name, p.full_name;

create or replace view public.v_cash_movements as
select
  m.id,
  m.client_id,
  m.service_id,
  m.cash_box_id,
  b.code                          as box_code,
  m.kind,
  m.status,
  m.amount,
  case when m.kind in ('gasto', 'devolucion') then -m.amount else m.amount end as signed_amount,
  m.occurred_on,
  m.category,
  m.description,
  m.supplier,
  m.supplier_ruc,
  m.receipt_kind,
  m.receipt_number,
  m.storage_path,
  m.work_order_id,
  m.section_id,
  s.name                          as section_name,
  m.crew_id,
  c.name                          as crew_name,
  m.review_note,
  p.full_name                     as created_by_name,
  m.created_at,
  m.created_by
from public.cash_movements m
join public.cash_boxes b on b.id = m.cash_box_id
left join public.road_sections s on s.id = m.section_id
left join public.crews c on c.id = m.crew_id
left join public.profiles p on p.id = m.created_by
where m.deleted_at is null;

-- ─── Seguridad ────────────────────────────────────────────────────────

alter table public.cash_boxes       enable row level security;
alter table public.cash_movements   enable row level security;
alter table public.deposit_requests enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cash_boxes', 'cash_movements', 'deposit_requests'] loop
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

grant select on public.v_cash_boxes, public.v_cash_movements to authenticated;

-- ─── Una caja por cada jefe de cuadrilla que todavía no la tenga ───────

do $$
declare
  v_servicio uuid;
  v_fila     record;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then return; end if;

  for v_fila in
    select c.id crew_id, c.code crew_code, c.name crew_name, c.leader_id
      from public.crews c
     where c.service_id = v_servicio
       and c.deleted_at is null
       and c.leader_id is not null
  loop
    insert into public.cash_boxes (service_id, crew_id, holder_id, code, name)
    select v_servicio, v_fila.crew_id, v_fila.leader_id,
           'CAJA-' || v_fila.crew_code,
           'Caja chica · ' || v_fila.crew_name
     where not exists (
       select 1 from public.cash_boxes b
        where b.service_id = v_servicio and b.crew_id = v_fila.crew_id and b.deleted_at is null
     );
  end loop;
end $$;
