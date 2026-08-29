-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0001 · Extensiones, tipos base, núcleo multi-tenant
-- Sistema Integral de Gestión Operativa Vial · ETS VALERIA
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm;

-- ─── Tipos ────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('admin','supervisor','jefe_cuadrilla','ing_seguridad','visor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_status as enum ('activo','pausado','cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_status as enum ('borrador','publicado','suspendido','cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_item_status as enum ('programado','en_curso','ejecutado','suspendido','reprogramado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_order_status as enum ('borrador','enviado','validado','observado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_phase as enum ('antes','durante','despues','general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pci_priority as enum ('baja','media','alta','critica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pci_status as enum ('abierto','en_atencion','levantado','cerrado','vencido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pci_item_status as enum ('pendiente','en_atencion','levantado','validado','rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_condition as enum ('bueno','regular','malo','critico','no_evaluado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type road_side as enum ('derecho','izquierdo','ambos','eje');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_level as enum ('trivial','tolerable','moderado','importante','intolerable');
exception when duplicate_object then null; end $$;

-- ─── Utilidades ───────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Formatea metros a progresiva vial: 12450 -> '12+450'
create or replace function public.fmt_progresiva(m numeric)
returns text language sql immutable as $$
  select case when m is null then null
    else floor(m / 1000)::int || '+' || lpad(round(m % 1000)::int::text, 3, '0')
  end
$$;

-- Parsea '12+450' -> 12450
create or replace function public.parse_progresiva(p text)
returns numeric language sql immutable as $$
  select case
    when p is null or p = '' then null
    when p ~ '^\s*\d+\s*\+\s*\d+' then
      (split_part(replace(p,' ',''), '+', 1))::numeric * 1000
      + (split_part(replace(p,' ',''), '+', 2))::numeric
    when p ~ '^\s*[\d.]+\s*$' then p::numeric
    else null
  end
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NÚCLEO MULTI-TENANT
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  ruc         text unique,
  legal_name  text,
  logo_url    text,
  address     text,
  phone       text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  phone         text,
  dni           text,
  position      text,
  avatar_url    text,
  role          user_role not null default 'visor',
  org_id        uuid references public.organizations(id) on delete set null,
  is_active     boolean not null default true,
  is_demo       boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_org  on public.profiles(org_id);

-- Servicios = contratos. EJE DEL MULTI-TENANT.
create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  code          text not null,
  name          text not null,
  description   text,
  client_name   text,
  contract_code text,
  status        service_status not null default 'activo',
  starts_on     date,
  ends_on       date,
  color         text not null default '#1D4ED8',
  -- Módulos activos por servicio (multi-servicio: unos completos, otros simples)
  modules       jsonb not null default '{
    "programacion": true, "campo": true, "pci": true, "ssoma": true,
    "inventario": true, "reportes": true, "mapa": true
  }'::jsonb,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  unique (org_id, code)
);
create index if not exists idx_services_org on public.services(org_id) where deleted_at is null;

-- Pertenencia usuario ↔ servicio, con rol propio en ese contrato
create table if not exists public.service_members (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        user_role not null default 'visor',
  created_at  timestamptz not null default now(),
  unique (service_id, profile_id)
);
create index if not exists idx_sm_profile on public.service_members(profile_id);
create index if not exists idx_sm_service on public.service_members(service_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCIONES DE AUTORIZACIÓN (SECURITY DEFINER · evitan recursión en RLS)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin' and p.is_active)
$$;

create or replace function public.my_service_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from public.services s
    where s.deleted_at is null and public.is_platform_admin()
  union
  select m.service_id from public.service_members m
    where m.profile_id = auth.uid()
$$;

-- Versión simple y rápida: ¿pertenezco a este servicio?
create or replace function public.is_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.service_members m
                 where m.service_id = sid and m.profile_id = auth.uid())
$$;

-- Rol efectivo del usuario dentro de un servicio
create or replace function public.role_in(sid uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select case when public.is_platform_admin() then 'admin'::user_role
    else (select m.role from public.service_members m
          where m.service_id = sid and m.profile_id = auth.uid() limit 1)
  end
$$;

-- ¿Puedo escribir datos operativos en este servicio?
create or replace function public.can_write(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_in(sid) in ('admin','supervisor','jefe_cuadrilla','ing_seguridad')
$$;

-- ¿Puedo administrar configuración de este servicio?
create or replace function public.can_manage(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_in(sid) in ('admin','supervisor')
$$;

-- ─── Trigger: crear profile automáticamente al crear usuario ──────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, is_demo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'visor'),
    coalesce((new.raw_user_meta_data->>'is_demo')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Triggers updated_at ─────────────────────────────────────────────────
drop trigger if exists t_org_touch on public.organizations;
create trigger t_org_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists t_profiles_touch on public.profiles;
create trigger t_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists t_services_touch on public.services;
create trigger t_services_touch before update on public.services
  for each row execute function public.touch_updated_at();
