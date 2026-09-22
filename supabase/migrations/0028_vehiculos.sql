-- ═══════════════════════════════════════════════════════════════════════
-- 0028 · Vehículos y revisión preoperacional
--
-- La camioneta de la cuadrilla es el equipo más caro que se mueve todos los
-- días, y el que más papeles vencibles tiene encima: SOAT, revisión técnica,
-- póliza y el mantenimiento por kilometraje. Circular con el SOAT vencido es
-- una papeleta segura y, si hay un accidente, deja a la empresa sin cobertura.
--
-- Se agrega también la revisión de antes de salir, que es lo que el conductor
-- firma cada mañana: luces, frenos, llantas, extintor, botiquín, conos. Hoy
-- se llena en una hoja que se moja en la guantera.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.vehicle_kind as enum (
    'camioneta', 'volquete', 'cisterna', 'cargador', 'retroexcavadora',
    'rodillo', 'motoniveladora', 'moto', 'otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_status as enum (
    'operativo',
    'taller',          -- en mantenimiento o reparación
    'inoperativo',     -- no puede salir
    'dado_de_baja'
  );
exception when duplicate_object then null; end $$;

-- ─── El vehículo ──────────────────────────────────────────────────────

create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  kind         public.vehicle_kind not null default 'camioneta',
  status       public.vehicle_status not null default 'operativo',

  plate        text not null,              -- la placa es como se le llama en obra
  code         text,                       -- interno: VEH-01
  brand        text,
  model        text,
  model_year   smallint,
  owner        text,                       -- propio o alquilado, y a quién

  crew_id      uuid references public.crews(id),
  driver_id    uuid references public.profiles(id),

  -- Los papeles que vencen
  soat_expires_on       date,
  inspection_expires_on date,              -- revisión técnica
  policy_expires_on     date,              -- póliza de responsabilidad civil

  -- El mantenimiento va por kilometraje, no por fecha
  odometer_km        integer,
  next_service_km    integer,
  last_service_on    date,

  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint vehicles_client_id_key unique (client_id),
  constraint vehicles_plate_key unique (service_id, plate)
);

create index if not exists vehicles_service_idx on public.vehicles (service_id) where deleted_at is null;
create index if not exists vehicles_crew_idx on public.vehicles (crew_id) where deleted_at is null;

-- ─── La revisión de antes de salir ────────────────────────────────────

create table if not exists public.vehicle_checks (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  checked_on   date not null default (now() at time zone 'America/Lima')::date,
  driver_id    uuid references public.profiles(id),
  odometer_km  integer,

  -- Los puntos del preoperacional, con su respuesta
  items        jsonb not null default '{}'::jsonb,
  conforme     boolean not null default true,
  findings     text,

  -- Sin firma no vale: es lo que declara que el conductor lo revisó
  signature_path text,
  lat          double precision,
  lng          double precision,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint vehicle_checks_client_id_key unique (client_id)
);

create index if not exists vehicle_checks_veh_idx
  on public.vehicle_checks (vehicle_id, checked_on desc) where deleted_at is null;

-- ─── Vista con los tres vencimientos a la vez ─────────────────────────

create or replace view public.v_vehicles as
select
  v.id,
  v.service_id,
  v.kind,
  v.status,
  v.plate,
  v.code,
  v.brand,
  v.model,
  v.model_year,
  v.owner,
  v.crew_id,
  c.name                                   as crew_name,
  v.driver_id,
  p.full_name                              as driver_name,
  v.soat_expires_on,
  v.inspection_expires_on,
  v.policy_expires_on,
  v.odometer_km,
  v.next_service_km,
  v.last_service_on,
  v.notes,

  -- Lo que primero vence de los tres, que es lo que decide si puede salir
  least(
    coalesce(v.soat_expires_on,       date '9999-12-31'),
    coalesce(v.inspection_expires_on, date '9999-12-31'),
    coalesce(v.policy_expires_on,     date '9999-12-31')
  )                                        as first_due,
  public.vencimiento_semaforo(
    nullif(least(
      coalesce(v.soat_expires_on,       date '9999-12-31'),
      coalesce(v.inspection_expires_on, date '9999-12-31'),
      coalesce(v.policy_expires_on,     date '9999-12-31')
    ), date '9999-12-31')
  )                                        as semaforo,

  (v.next_service_km - v.odometer_km)      as km_to_service,
  (
    select k.checked_on from public.vehicle_checks k
     where k.vehicle_id = v.id and k.deleted_at is null
     order by k.checked_on desc limit 1
  )                                        as last_check_on
from public.vehicles v
left join public.crews c on c.id = v.crew_id
left join public.profiles p on p.id = v.driver_id
where v.deleted_at is null
  and v.status <> 'dado_de_baja';

-- ─── Los papeles del vehículo entran a la agenda de vencimientos ──────

create or replace view public.v_vencimientos as
select
  'equipo'::text                            as origen,
  e.id,
  e.service_id,
  e.crew_id,
  c.name                                    as crew_name,
  e.code                                    as referencia,
  coalesce(e.description, e.code)           as titulo,
  (e.kind::text || ' · vence')              as detalle,
  e.expires_on                              as due_date,
  (e.expires_on - current_date)             as days_left,
  public.vencimiento_semaforo(e.expires_on) as semaforo,
  public.vencimiento_aviso(e.expires_on)    as alert_level
from public.safety_equipment e
left join public.crews c on c.id = e.crew_id
where e.deleted_at is null
  and e.status <> 'dado_de_baja'
  and e.expires_on is not null

union all

select
  'inspeccion'::text,
  e.id, e.service_id, e.crew_id, c.name, e.code,
  coalesce(e.description, e.code),
  (e.kind::text || ' · inspección'),
  e.next_check_on,
  (e.next_check_on - current_date),
  public.vencimiento_semaforo(e.next_check_on),
  public.vencimiento_aviso(e.next_check_on)
from public.safety_equipment e
left join public.crews c on c.id = e.crew_id
where e.deleted_at is null
  and e.status <> 'dado_de_baja'
  and e.next_check_on is not null

union all

select
  'pci'::text,
  i.id, i.service_id, i.assigned_crew_id, c.name, pci.code,
  coalesce(i.description, pci.title),
  'PCI · levantamiento',
  i.due_date,
  (i.due_date - current_date),
  public.vencimiento_semaforo(i.due_date),
  public.vencimiento_aviso(i.due_date)
from public.pci_items i
join public.pcis pci on pci.id = i.pci_id
left join public.crews c on c.id = i.assigned_crew_id
where i.deleted_at is null
  and i.status in ('pendiente', 'en_atencion')
  and i.due_date is not null

union all

-- Los tres papeles del vehículo, cada uno como su propia fila: vencen por
-- separado y se renuevan por separado.
select
  'vehiculo'::text,
  v.id, v.service_id, v.crew_id, c.name, v.plate,
  (v.kind::text || ' ' || v.plate),
  papel.etiqueta,
  papel.vence,
  (papel.vence - current_date),
  public.vencimiento_semaforo(papel.vence),
  public.vencimiento_aviso(papel.vence)
from public.vehicles v
left join public.crews c on c.id = v.crew_id
cross join lateral (values
  ('SOAT',             v.soat_expires_on),
  ('Revisión técnica', v.inspection_expires_on),
  ('Póliza',           v.policy_expires_on)
) as papel(etiqueta, vence)
where v.deleted_at is null
  and v.status <> 'dado_de_baja'
  and papel.vence is not null;

-- ─── Seguridad ────────────────────────────────────────────────────────

alter table public.vehicles       enable row level security;
alter table public.vehicle_checks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'vehicle_checks'] loop
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

grant select on public.v_vehicles, public.v_vencimientos to authenticated;

-- ─── El odómetro lo actualiza la revisión ─────────────────────────────
--
-- El kilometraje del vehículo se consulta para saber cuándo toca servicio,
-- pero mantenerlo a mano se olvida. Lo pone el preoperacional, que es cuando
-- alguien de verdad mira el tablero.

create or replace function public.al_revisar_vehiculo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.odometer_km is not null then
    update public.vehicles
       set odometer_km = greatest(coalesce(odometer_km, 0), new.odometer_km),
           updated_at  = now()
     where id = new.vehicle_id;
  end if;
  return new;
end $$;

drop trigger if exists vehicle_checks_odometro on public.vehicle_checks;
create trigger vehicle_checks_odometro
  after insert on public.vehicle_checks
  for each row execute function public.al_revisar_vehiculo();
