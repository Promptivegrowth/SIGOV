-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0008 · Módulo 12: Auditoría, notificaciones push, importaciones, respaldos
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Auditoría (quién, qué, cuándo, antes/después) ───────────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  service_id  uuid references public.services(id) on delete set null,
  table_name  text not null,
  record_id   uuid,
  action      text not null,              -- INSERT / UPDATE / DELETE
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  before_data jsonb,
  after_data  jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_service on public.audit_log(service_id, created_at desc);
create index if not exists idx_audit_table on public.audit_log(table_name, record_id);
create index if not exists idx_audit_actor on public.audit_log(actor_id, created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_service uuid;
  v_email   text;
begin
  begin
    v_service := coalesce(
      (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'service_id')::uuid,
      null);
  exception when others then v_service := null; end;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.audit_log (service_id, table_name, record_id, action, actor_id, actor_email, before_data, after_data)
  values (
    v_service, tg_table_name,
    coalesce((to_jsonb(case when tg_op='DELETE' then old else new end)->>'id')::uuid, null),
    tg_op, auth.uid(), v_email,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end $$;

-- Auditoría en las tablas sensibles
do $$
declare t text;
begin
  foreach t in array array['services','service_members','pcis','pci_items','weekly_plans',
                           'plan_items','work_orders','work_entries','road_assets','profiles']
  loop
    execute format('drop trigger if exists t_audit_%1$s on public.%1$I', t);
    execute format('create trigger t_audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- ─── Suscripciones push (Web Push · VAPID) ───────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  device_label text,
  is_active   boolean not null default true,
  last_used_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_profile on public.push_subscriptions(profile_id) where is_active;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.services(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null,              -- pci_prioritario / pci_por_vencer / parte_observado ...
  title       text not null,
  body        text,
  url         text,
  severity    text not null default 'info',  -- info / warning / danger / success
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  pushed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_profile on public.notifications(profile_id, created_at desc);
create index if not exists idx_notif_unread on public.notifications(profile_id) where read_at is null;

-- ─── Lotes de importación (Módulo 02) ────────────────────────────────────
create table if not exists public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  kind          text not null,             -- programacion / pci / inventario / actividades
  file_name     text,
  file_path     text,
  total_rows    integer not null default 0,
  ok_rows       integer not null default 0,
  error_rows    integer not null default 0,
  status        text not null default 'procesando',  -- procesando / completado / fallido / revertido
  mapping       jsonb not null default '{}'::jsonb,
  errors        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_by    uuid references public.profiles(id)
);
create index if not exists idx_import_service on public.import_batches(service_id, created_at desc);

-- ─── Registro de respaldos ───────────────────────────────────────────────
create table if not exists public.backups_log (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'automatico',
  storage_path text,
  size_bytes  bigint,
  tables_count integer,
  rows_count  bigint,
  status      text not null default 'ok',
  message     text,
  created_at  timestamptz not null default now()
);

-- ─── Dispositivos y estado de sincronización ─────────────────────────────
create table if not exists public.sync_sessions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  service_id    uuid references public.services(id) on delete cascade,
  device_id     text not null,
  device_label  text,
  pushed_count  integer not null default 0,
  pulled_count  integer not null default 0,
  failed_count  integer not null default 0,
  duration_ms   integer,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_sync_profile on public.sync_sessions(profile_id, started_at desc);
