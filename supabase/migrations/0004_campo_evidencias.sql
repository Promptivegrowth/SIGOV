-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0004 · Módulos 04 y 05: Ejecución en campo + evidencia georreferenciada
-- Diseñado para sincronización offline: cada fila lleva client_id idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Parte diario de cuadrilla ───────────────────────────────────────────
create table if not exists public.work_orders (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  crew_id       uuid not null references public.crews(id),
  work_date     date not null,
  status        work_order_status not null default 'borrador',
  weather       text,
  start_time    time,
  end_time      time,
  headcount     smallint,
  notes         text,
  -- Validación del supervisor
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id),
  review_notes  text,
  -- Metadatos de sincronización
  device_id     text,
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  unique (service_id, crew_id, work_date)
);
create index if not exists idx_wo_service_date on public.work_orders(service_id, work_date desc);
create index if not exists idx_wo_crew on public.work_orders(crew_id, work_date desc);
create index if not exists idx_wo_status on public.work_orders(status);

-- ─── Registro de actividad ejecutada ─────────────────────────────────────
create table if not exists public.work_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  plan_item_id  uuid references public.plan_items(id) on delete set null,
  pci_item_id   uuid,                      -- FK diferida (se crea en 0005)
  activity_id   uuid not null references public.activities_catalog(id),
  section_id    uuid not null references public.road_sections(id),
  prog_start_m  numeric not null,
  prog_end_m    numeric,
  side          road_side not null default 'derecho',
  quantity      numeric not null default 0,
  unit_id       uuid references public.units(id),
  observation   text,
  started_at    timestamptz,
  finished_at   timestamptz,
  geom          geometry(Point, 4326),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz
);
create index if not exists idx_we_wo on public.work_entries(work_order_id);
create index if not exists idx_we_service on public.work_entries(service_id, created_at desc);
create index if not exists idx_we_activity on public.work_entries(activity_id);
create index if not exists idx_we_section on public.work_entries(section_id);
create index if not exists idx_we_geom on public.work_entries using gist(geom);

-- ─── EVIDENCIA GEORREFERENCIADA (inmutable) ──────────────────────────────
create table if not exists public.evidences (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid unique not null default gen_random_uuid(),
  service_id     uuid not null references public.services(id) on delete cascade,
  work_entry_id  uuid references public.work_entries(id) on delete cascade,
  pci_item_id    uuid,
  asset_id       uuid,
  talk_id        uuid,
  phase          evidence_phase not null default 'general',
  storage_path   text not null,
  thumb_path     text,
  mime_type      text not null default 'image/webp',
  size_bytes     integer,
  width          integer,
  height         integer,
  -- Datos geográficos SELLADOS (protegidos por trigger)
  lat            double precision not null,
  lng            double precision not null,
  accuracy_m     numeric,
  altitude_m     numeric,
  heading        numeric,
  geom           geometry(Point, 4326),
  section_id     uuid references public.road_sections(id),
  progresiva_m   numeric,
  taken_at       timestamptz not null,
  -- Integridad
  sha256         text not null,
  watermarked    boolean not null default true,
  device_id      text,
  device_model   text,
  caption        text,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id),
  deleted_at     timestamptz
);
create index if not exists idx_ev_service on public.evidences(service_id, taken_at desc);
create index if not exists idx_ev_entry on public.evidences(work_entry_id);
create index if not exists idx_ev_pci on public.evidences(pci_item_id);
create index if not exists idx_ev_asset on public.evidences(asset_id);
create index if not exists idx_ev_geom on public.evidences using gist(geom);
create index if not exists idx_ev_sha on public.evidences(sha256);

-- Derivar geom desde lat/lng automáticamente
create or replace function public.evidence_set_geom()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
  return new;
end $$;

drop trigger if exists t_ev_geom on public.evidences;
create trigger t_ev_geom before insert on public.evidences
  for each row execute function public.evidence_set_geom();

-- ⛔ BLOQUEO DE EDICIÓN DE DATOS GEOGRÁFICOS Y DE INTEGRIDAD
-- Requisito de la propuesta: "datos de ubicación protegidos contra edición"
create or replace function public.evidence_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lat is distinct from old.lat
     or new.lng is distinct from old.lng
     or new.taken_at is distinct from old.taken_at
     or new.sha256 is distinct from old.sha256
     or new.storage_path is distinct from old.storage_path
     or new.geom is distinct from old.geom then
    raise exception 'SIGOV: la evidencia georreferenciada es inmutable (ubicación, fecha, hash y archivo no pueden editarse)'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists t_ev_guard on public.evidences;
create trigger t_ev_guard before update on public.evidences
  for each row execute function public.evidence_guard();

-- ─── Triggers updated_at ─────────────────────────────────────────────────
drop trigger if exists t_wo_touch on public.work_orders;
create trigger t_wo_touch before update on public.work_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists t_we_touch on public.work_entries;
create trigger t_we_touch before update on public.work_entries
  for each row execute function public.touch_updated_at();

-- ─── Avance automático del plan al registrar ejecución ───────────────────
create or replace function public.sync_plan_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid;
begin
  v_item := coalesce(new.plan_item_id, old.plan_item_id);
  if v_item is null then return coalesce(new, old); end if;

  update public.plan_items pi
     set executed_qty = coalesce((
           select sum(we.quantity) from public.work_entries we
            where we.plan_item_id = pi.id and we.deleted_at is null), 0),
         status = case
           when coalesce((select sum(we.quantity) from public.work_entries we
                          where we.plan_item_id = pi.id and we.deleted_at is null), 0) >= pi.target_qty
                and pi.target_qty > 0 then 'ejecutado'::plan_item_status
           when coalesce((select sum(we.quantity) from public.work_entries we
                          where we.plan_item_id = pi.id and we.deleted_at is null), 0) > 0
                then 'en_curso'::plan_item_status
           else pi.status end
   where pi.id = v_item;

  return coalesce(new, old);
end $$;

drop trigger if exists t_we_progress on public.work_entries;
create trigger t_we_progress after insert or update or delete on public.work_entries
  for each row execute function public.sync_plan_progress();
