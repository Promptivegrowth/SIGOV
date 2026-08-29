-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0006 · Módulo 08: Inventario vial georreferenciado
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.asset_types (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.services(id) on delete cascade,  -- null = global
  code        text not null,
  name        text not null,
  category    text,                         -- Drenaje / Seguridad vial / Señalización / Emergencia
  icon        text default 'map-pin',
  color       text default '#0EA5E9',
  -- Esquema de atributos propios del tipo (formularios dinámicos)
  schema      jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (code)
);

create table if not exists public.road_assets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  type_id       uuid not null references public.asset_types(id),
  code          text not null,
  name          text,
  section_id    uuid references public.road_sections(id),
  progresiva_m  numeric,
  side          road_side not null default 'derecho',
  lat           double precision,
  lng           double precision,
  geom          geometry(Point, 4326),
  condition     asset_condition not null default 'no_evaluado',
  install_year  smallint,
  last_inspected_on date,
  next_inspection_on date,
  attributes    jsonb not null default '{}'::jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  unique (service_id, code)
);
create index if not exists idx_assets_service on public.road_assets(service_id) where deleted_at is null;
create index if not exists idx_assets_type on public.road_assets(type_id);
create index if not exists idx_assets_section on public.road_assets(section_id, progresiva_m);
create index if not exists idx_assets_geom on public.road_assets using gist(geom);
create index if not exists idx_assets_condition on public.road_assets(condition);

create table if not exists public.asset_interventions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  asset_id      uuid not null references public.road_assets(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  work_entry_id uuid references public.work_entries(id) on delete set null,
  pci_item_id   uuid references public.pci_items(id) on delete set null,
  intervened_on date not null default current_date,
  action        text not null,                        -- limpieza / reposición / pintado / reparación
  condition_before asset_condition,
  condition_after  asset_condition,
  crew_id       uuid references public.crews(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id)
);
create index if not exists idx_ai_asset on public.asset_interventions(asset_id, intervened_on desc);

alter table public.evidences
  drop constraint if exists evidences_asset_id_fkey,
  add constraint evidences_asset_id_fkey
  foreign key (asset_id) references public.road_assets(id) on delete cascade;

create or replace function public.asset_set_geom()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
    -- progresiva automática por snap al tramo
    if new.progresiva_m is null and new.section_id is not null then
      new.progresiva_m := public.progresiva_from_point(new.section_id, new.lng, new.lat);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_assets_geom on public.road_assets;
create trigger t_assets_geom before insert or update on public.road_assets
  for each row execute function public.asset_set_geom();

-- Al registrar una intervención se actualiza la condición del elemento
create or replace function public.asset_apply_intervention()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.condition_after is not null then
    update public.road_assets
       set condition = new.condition_after,
           last_inspected_on = new.intervened_on
     where id = new.asset_id;
  end if;
  return new;
end $$;

drop trigger if exists t_ai_apply on public.asset_interventions;
create trigger t_ai_apply after insert on public.asset_interventions
  for each row execute function public.asset_apply_intervention();

drop trigger if exists t_assets_touch on public.road_assets;
create trigger t_assets_touch before update on public.road_assets
  for each row execute function public.touch_updated_at();
