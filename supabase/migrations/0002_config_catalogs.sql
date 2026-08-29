-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0002 · Módulo 01: Configuración, catálogos, tramos y cuadrillas
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Unidades de medida ──────────────────────────────────────────────────
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.services(id) on delete cascade,  -- null = global
  code        text not null,
  name        text not null,
  symbol      text not null,
  created_at  timestamptz not null default now(),
  unique (code)
);

-- ─── Catálogo de actividades ─────────────────────────────────────────────
create table if not exists public.activities_catalog (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  code          text not null,
  name          text not null,
  description   text,
  category      text,                       -- Calzada / Señalización / Drenaje / Derecho de vía ...
  unit_id       uuid references public.units(id),
  yield_per_day numeric,                    -- rendimiento referencial por cuadrilla/día
  requires_photo boolean not null default true,
  min_photos    smallint not null default 2,
  color         text default '#64748B',
  icon          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  unique (service_id, code)
);
create index if not exists idx_act_service on public.activities_catalog(service_id) where deleted_at is null;
create index if not exists idx_act_cat on public.activities_catalog(category);

-- ─── Tramos viales (con geometría real) ──────────────────────────────────
create table if not exists public.road_sections (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  code        text not null,
  name        text not null,
  route_code  text,                          -- ej. PE-1N
  prog_start_m numeric not null default 0,   -- progresiva inicial en metros
  prog_end_m   numeric not null,             -- progresiva final en metros
  length_m     numeric generated always as (prog_end_m - prog_start_m) stored,
  surface     text,                          -- asfalto / afirmado / concreto
  lanes       smallint,
  geom        geometry(LineString, 4326),
  color       text default '#2563EB',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  unique (service_id, code)
);
create index if not exists idx_sections_service on public.road_sections(service_id) where deleted_at is null;
create index if not exists idx_sections_geom on public.road_sections using gist(geom);

-- ─── Cuadrillas ──────────────────────────────────────────────────────────
create table if not exists public.crews (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  code        text not null,
  name        text not null,
  leader_id   uuid references public.profiles(id) on delete set null,
  vehicle     text,
  plate       text,
  color       text default '#0EA5E9',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  unique (service_id, code)
);
create index if not exists idx_crews_service on public.crews(service_id) where deleted_at is null;
create index if not exists idx_crews_leader on public.crews(leader_id);

create table if not exists public.crew_members (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  full_name   text not null,       -- permite obreros sin cuenta de usuario
  dni         text,
  position    text,                -- operario / oficial / peón / conductor
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_crewm_crew on public.crew_members(crew_id);

-- ─── Triggers ────────────────────────────────────────────────────────────
drop trigger if exists t_act_touch on public.activities_catalog;
create trigger t_act_touch before update on public.activities_catalog
  for each row execute function public.touch_updated_at();

drop trigger if exists t_sections_touch on public.road_sections;
create trigger t_sections_touch before update on public.road_sections
  for each row execute function public.touch_updated_at();

drop trigger if exists t_crews_touch on public.crews;
create trigger t_crews_touch before update on public.crews
  for each row execute function public.touch_updated_at();

-- ─── Helper geo: calcular progresiva de un punto sobre su tramo ──────────
create or replace function public.progresiva_from_point(
  p_section_id uuid, p_lng double precision, p_lat double precision
) returns numeric
language sql stable set search_path = public, extensions as $$
  select case
    when s.geom is null then null
    else s.prog_start_m + extensions.ST_LineLocatePoint(
           s.geom, extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)
         ) * (s.prog_end_m - s.prog_start_m)
  end
  from public.road_sections s where s.id = p_section_id
$$;
