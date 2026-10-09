-- ═══════════════════════════════════════════════════════════════════════
-- 0080 · El kárdex de la cuadrilla
--
-- Formato 8 «Seguimiento diario de materiales por cuadrilla» (Elvis): por
-- cada día, lo que ENTRA a la cuadrilla y lo que SALE de ella, con su stock.
-- SIGOV ya registra las entregas del almacén a la cuadrilla
-- (stock_movements.salida con crew_id) y las devoluciones; faltaba lo que
-- pasa dentro de la cuadrilla:
--
-- · saldo_inicial — lo que tiene al abrir el periodo (hoy se carga como
--   «Entrada» del día 1);
-- · consumo — lo usado en campo, por actividad del reporte diario (OBS-32:
--   «cuánto se ha utilizado durante el día»);
-- · traslado — préstamo entre cuadrillas: sale de una y entra en la otra;
-- · merma — lo perdido o dañado en la cuadrilla;
-- · ajuste — la diferencia con el conteo físico (puede ser negativa).
--
-- Cantidades con tres decimales: en campo se usa 0,125 gal y 0,125 bls.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.mov_cuadrilla_tipo as enum ('saldo_inicial', 'consumo', 'traslado', 'merma', 'ajuste');
exception when duplicate_object then null; end $$;

create table if not exists public.movimientos_cuadrilla (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique default gen_random_uuid(),
  service_id      uuid not null references public.services(id) on delete cascade,
  crew_id         uuid not null references public.crews(id),
  crew_destino_id uuid references public.crews(id),
  supply_id       uuid not null references public.supplies(id),
  tipo            public.mov_cuadrilla_tipo not null,
  qty             numeric(14,3) not null,
  occurred_on     date not null default ((now() at time zone 'America/Lima')::date),
  work_order_id   uuid references public.work_orders(id) on delete set null,
  work_entry_id   uuid references public.work_entries(id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint movimientos_cuadrilla_cantidad check (qty <> 0 and (tipo = 'ajuste' or qty > 0)),
  constraint movimientos_cuadrilla_traslado check ((tipo = 'traslado') = (crew_destino_id is not null)),
  constraint movimientos_cuadrilla_destino check (crew_destino_id is null or crew_destino_id <> crew_id)
);

create index if not exists movimientos_cuadrilla_crew on public.movimientos_cuadrilla (crew_id, occurred_on);
create index if not exists movimientos_cuadrilla_destino on public.movimientos_cuadrilla (crew_destino_id, occurred_on);

comment on table public.movimientos_cuadrilla is
  'Lo que pasa con el material dentro de la cuadrilla: saldo inicial, consumo en campo, traslados, mermas y ajustes (Formato 8).';

alter table public.movimientos_cuadrilla enable row level security;

drop policy if exists movimientos_cuadrilla_select on public.movimientos_cuadrilla;
create policy movimientos_cuadrilla_select on public.movimientos_cuadrilla for select to authenticated
  using (public.is_member(service_id));

-- Registra el jefe de la cuadrilla o quien administra el contrato
drop policy if exists movimientos_cuadrilla_insert on public.movimientos_cuadrilla;
create policy movimientos_cuadrilla_insert on public.movimientos_cuadrilla for insert to authenticated
  with check (
    public.can_write(service_id)
    and (public.can_manage(service_id)
         or exists (select 1 from public.crews c where c.id = crew_id and c.leader_id = auth.uid()))
  );

-- Corrige o da de baja quien lo registró (hasta el día siguiente) o quien administra
drop policy if exists movimientos_cuadrilla_update on public.movimientos_cuadrilla;
create policy movimientos_cuadrilla_update on public.movimientos_cuadrilla for update to authenticated
  using (
    public.can_manage(service_id)
    or (created_by = auth.uid() and public.can_write(service_id)
        and occurred_on >= ((now() at time zone 'America/Lima')::date - 1))
  )
  with check (
    public.can_manage(service_id)
    or (created_by = auth.uid() and public.can_write(service_id))
  );

drop trigger if exists t_audit_movimientos_cuadrilla on public.movimientos_cuadrilla;
create trigger t_audit_movimientos_cuadrilla after insert or update or delete on public.movimientos_cuadrilla
  for each row execute function public.audit_trigger();

-- ─── El kárdex de cuadrilla: todo lo que entra y sale, día a día ──────
create or replace view public.v_kardex_cuadrilla
with (security_invoker = true) as
with movs as (
  -- Lo que el almacén le entrega (entrada) o lo que devuelve (salida)
  select m.service_id, m.crew_id, m.supply_id, m.occurred_on,
         case when m.kind = 'salida' then m.qty else 0 end::numeric(14,3) as entrada,
         case when m.kind = 'devolucion' then m.qty else 0 end::numeric(14,3) as salida,
         case when m.kind = 'salida' then 'entrega_almacen' else 'devolucion' end as tipo,
         coalesce(r.code, m.document) as documento,
         m.notes, m.created_at, m.id
    from public.stock_movements m
    left join public.supply_requests r on r.id = m.request_id
   where m.deleted_at is null and m.crew_id is not null and m.kind in ('salida', 'devolucion')
  union all
  -- Lo de dentro de la cuadrilla
  select v.service_id, v.crew_id, v.supply_id, v.occurred_on,
         case when v.tipo = 'saldo_inicial' or (v.tipo = 'ajuste' and v.qty > 0) then abs(v.qty) else 0 end,
         case when v.tipo in ('consumo', 'traslado', 'merma') or (v.tipo = 'ajuste' and v.qty < 0) then abs(v.qty) else 0 end,
         v.tipo::text, null, v.notes, v.created_at, v.id
    from public.movimientos_cuadrilla v
   where v.deleted_at is null
  union all
  -- El traslado entra en la cuadrilla que lo recibe
  select v.service_id, v.crew_destino_id, v.supply_id, v.occurred_on,
         v.qty, 0, 'traslado_recibido', null, v.notes, v.created_at, v.id
    from public.movimientos_cuadrilla v
   where v.deleted_at is null and v.tipo = 'traslado'
)
select m.service_id, m.crew_id, c.code as crew_code, c.name as crew_name, c.numero as crew_numero, c.sede as crew_sede,
       m.supply_id, s.code as supply_code, s.name as supply_name, s.category as supply_category,
       u.symbol as unit_symbol, m.occurred_on, m.entrada, m.salida, m.tipo, m.documento, m.notes,
       m.created_at, m.id
  from movs m
  join public.crews c on c.id = m.crew_id
  join public.supplies s on s.id = m.supply_id
  left join public.units u on u.id = s.unit_id;

-- ─── Lo que hoy tiene cada cuadrilla ───────────────────────────────────
create or replace view public.v_stock_cuadrilla
with (security_invoker = true) as
select service_id, crew_id, crew_code, crew_name, supply_id, supply_code, supply_name, supply_category, unit_symbol,
       sum(entrada)::numeric(14,3) as entradas,
       sum(salida)::numeric(14,3) as salidas,
       (sum(entrada) - sum(salida))::numeric(14,3) as stock
  from public.v_kardex_cuadrilla
 group by service_id, crew_id, crew_code, crew_name, supply_id, supply_code, supply_name, supply_category, unit_symbol;

notify pgrst, 'reload schema';
