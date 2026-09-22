-- ═══════════════════════════════════════════════════════════════════════
-- 0027 · Equipos de seguridad y vencimientos
--
-- Extintores, botiquines, kits antiderrame y camillas. Todos tienen fecha de
-- vencimiento y todos se revisan periódicamente; hoy eso vive en una hoja de
-- cálculo que alguien recuerda abrir. Un extintor vencido es un hallazgo en
-- auditoría, y el hallazgo llega cuando ya no hay tiempo de recargarlo.
--
-- Lo que resuelve esto: que la fecha esté en el sistema y que el aviso salga
-- solo, en la escalera que pidió Elvis —30, 15 y 7 días antes, y vencido—,
-- tanto en la web como en el celular del capataz que tiene el equipo a cargo.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.safety_equipment_kind as enum (
    'extintor',
    'botiquin',
    'kit_antiderrame',
    'camilla',
    'lavaojos',
    'detector_gas',
    'otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.safety_equipment_status as enum (
    'operativo',
    'observado',      -- funciona, pero tiene algo que corregir
    'fuera_servicio',
    'dado_de_baja'
  );
exception when duplicate_object then null; end $$;

-- ─── El equipo ────────────────────────────────────────────────────────

create table if not exists public.safety_equipment (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  kind         public.safety_equipment_kind not null,
  status       public.safety_equipment_status not null default 'operativo',

  code         text not null,               -- EXT-001, BOT-003
  description  text,
  brand        text,
  capacity     text,                        -- «6 kg PQS», «tipo A»
  serial_number text,

  -- Dónde está y quién responde por él
  crew_id      uuid references public.crews(id),
  location     text,                        -- camioneta, almacén, oficina de obra
  holder_id    uuid references public.profiles(id),

  -- Las dos fechas que importan
  expires_on   date,                        -- recarga o caducidad del contenido
  next_check_on date,                       -- próxima inspección visual
  last_check_on date,

  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint safety_equipment_client_id_key unique (client_id),
  constraint safety_equipment_code_key unique (service_id, code)
);

create index if not exists safety_equipment_service_idx on public.safety_equipment (service_id) where deleted_at is null;
create index if not exists safety_equipment_crew_idx on public.safety_equipment (crew_id) where deleted_at is null;
create index if not exists safety_equipment_expira_idx on public.safety_equipment (expires_on) where deleted_at is null;

-- ─── La inspección ────────────────────────────────────────────────────

create table if not exists public.safety_equipment_checks (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  equipment_id uuid not null references public.safety_equipment(id) on delete cascade,
  checked_on   date not null default (now() at time zone 'America/Lima')::date,
  conforme     boolean not null default true,
  findings     text,
  storage_path text,                        -- la foto de la inspección
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint safety_equipment_checks_client_id_key unique (client_id)
);

create index if not exists safety_equipment_checks_eq_idx
  on public.safety_equipment_checks (equipment_id, checked_on desc) where deleted_at is null;

-- ─── La escalera de avisos ────────────────────────────────────────────
--
-- Se separan dos cosas que suelen confundirse: el COLOR, que es para que la
-- pantalla se lea de un vistazo, y el NIVEL DE AVISO, que es cuándo hay que
-- molestar a alguien. Elvis pidió avisar a 30, 15 y 7 días, y al vencer.

create or replace function public.vencimiento_semaforo(p_due date)
returns text
language sql
immutable
as $$
  select case
    when p_due is null                    then 'ok'
    when p_due < current_date             then 'vencido'
    when p_due - current_date <= 7        then 'rojo'
    when p_due - current_date <= 15       then 'ambar'
    when p_due - current_date <= 30       then 'verde'
    else 'ok'
  end
$$;

create or replace function public.vencimiento_aviso(p_due date)
returns text
language sql
immutable
as $$
  select case
    when p_due is null                    then null
    when p_due < current_date             then 'vencido'
    when p_due - current_date <= 7        then '7'
    when p_due - current_date <= 15       then '15'
    when p_due - current_date <= 30       then '30'
    else null
  end
$$;

create or replace view public.v_safety_equipment as
select
  e.id,
  e.service_id,
  e.kind,
  e.status,
  e.code,
  e.description,
  e.brand,
  e.capacity,
  e.serial_number,
  e.crew_id,
  c.name                                   as crew_name,
  e.location,
  e.holder_id,
  p.full_name                              as holder_name,
  e.expires_on,
  e.next_check_on,
  e.last_check_on,
  e.notes,
  (e.expires_on - current_date)            as days_left,
  public.vencimiento_semaforo(e.expires_on) as semaforo,
  public.vencimiento_aviso(e.expires_on)    as alert_level,
  -- La inspección también vence, y se pasa por alto más seguido que la recarga
  (e.next_check_on - current_date)         as check_days_left,
  public.vencimiento_semaforo(e.next_check_on) as check_semaforo,
  (
    select count(*) from public.safety_equipment_checks k
     where k.equipment_id = e.id and k.deleted_at is null and not k.conforme
  )                                        as observaciones_abiertas
from public.safety_equipment e
left join public.crews c on c.id = e.crew_id
left join public.profiles p on p.id = e.holder_id
where e.deleted_at is null
  and e.status <> 'dado_de_baja';

-- ─── Todo lo que vence, en un solo sitio ──────────────────────────────
--
-- El responsable de SSOMA no quiere entrar a cinco pantallas para saber qué
-- se le viene encima. Esta vista junta lo que tiene fecha límite; hoy son
-- los equipos y los PCI, y crecerá con los vehículos y los documentos.

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
  e.id,
  e.service_id,
  e.crew_id,
  c.name,
  e.code,
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
  i.id,
  i.service_id,
  i.assigned_crew_id,
  c.name,
  pci.code,
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
  and i.due_date is not null;

-- ─── Seguridad ────────────────────────────────────────────────────────

alter table public.safety_equipment        enable row level security;
alter table public.safety_equipment_checks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['safety_equipment', 'safety_equipment_checks'] loop
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

grant select on public.v_safety_equipment, public.v_vencimientos to authenticated;

-- ─── Al inspeccionar se actualiza el equipo ───────────────────────────
--
-- La fecha de última revisión vive en el equipo porque es lo que se consulta;
-- mantenerla a mano se olvida, así que la pone la propia inspección.

create or replace function public.al_inspeccionar_equipo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.safety_equipment
     set last_check_on = greatest(coalesce(last_check_on, new.checked_on), new.checked_on),
         status        = case
                           when not new.conforme then 'observado'::public.safety_equipment_status
                           else status
                         end,
         updated_at    = now()
   where id = new.equipment_id;
  return new;
end $$;

drop trigger if exists safety_equipment_checks_actualiza on public.safety_equipment_checks;
create trigger safety_equipment_checks_actualiza
  after insert on public.safety_equipment_checks
  for each row execute function public.al_inspeccionar_equipo();
