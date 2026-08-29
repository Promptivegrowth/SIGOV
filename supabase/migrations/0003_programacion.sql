-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0003 · Módulo 03: Programación semanal + suspensión por PCI
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.weekly_plans (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  year         smallint not null,
  week         smallint not null,
  starts_on    date not null,
  ends_on      date not null,
  status       plan_status not null default 'borrador',
  notes        text,
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  unique (service_id, year, week)
);
create index if not exists idx_plans_service on public.weekly_plans(service_id, starts_on desc);

create table if not exists public.plan_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique default gen_random_uuid(),   -- idempotencia offline
  plan_id       uuid not null references public.weekly_plans(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  activity_id   uuid not null references public.activities_catalog(id),
  section_id    uuid not null references public.road_sections(id),
  crew_id       uuid references public.crews(id) on delete set null,
  scheduled_on  date not null,
  prog_start_m  numeric not null,
  prog_end_m    numeric not null,
  target_qty    numeric not null default 0,
  executed_qty  numeric not null default 0,
  unit_id       uuid references public.units(id),
  status        plan_item_status not null default 'programado',
  priority      smallint not null default 3,             -- 1 = máxima
  sort_order    integer not null default 0,
  notes         text,
  -- Trazabilidad de suspensión / reprogramación
  suspended_by_pci_id uuid,
  original_date       date,
  rescheduled_to      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz
);
create index if not exists idx_pi_plan on public.plan_items(plan_id);
create index if not exists idx_pi_service_date on public.plan_items(service_id, scheduled_on);
create index if not exists idx_pi_crew on public.plan_items(crew_id, scheduled_on);
create index if not exists idx_pi_status on public.plan_items(status);

-- Registro de cada suspensión/reordenamiento automático
create table if not exists public.plan_suspensions (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services(id) on delete cascade,
  plan_id         uuid not null references public.weekly_plans(id) on delete cascade,
  pci_id          uuid,
  reason          text not null,
  items_affected  integer not null default 0,
  detail          jsonb not null default '[]'::jsonb,  -- diff antes/después
  applied_at      timestamptz not null default now(),
  applied_by      uuid references public.profiles(id),
  reverted_at     timestamptz,
  reverted_by     uuid references public.profiles(id)
);
create index if not exists idx_susp_plan on public.plan_suspensions(plan_id);
create index if not exists idx_susp_pci on public.plan_suspensions(pci_id);

drop trigger if exists t_plans_touch on public.weekly_plans;
create trigger t_plans_touch before update on public.weekly_plans
  for each row execute function public.touch_updated_at();

drop trigger if exists t_pi_touch on public.plan_items;
create trigger t_pi_touch before update on public.plan_items
  for each row execute function public.touch_updated_at();
