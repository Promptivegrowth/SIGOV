-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0007 · Módulo 07: SSOMA
-- Charlas de 5 min, asistencia con firma digital, checklists, ATS/IPERC
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Charla de seguridad (5 minutos) ─────────────────────────────────────
create table if not exists public.safety_talks (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid unique not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  crew_id      uuid references public.crews(id) on delete set null,
  topic        text not null,
  content      text,
  talk_date    date not null default current_date,
  start_time   time,
  duration_min smallint default 5,
  speaker_id   uuid references public.profiles(id) on delete set null,
  speaker_name text,
  location     text,
  lat          double precision,
  lng          double precision,
  attendees_count smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz
);
create index if not exists idx_talks_service on public.safety_talks(service_id, talk_date desc);
create index if not exists idx_talks_crew on public.safety_talks(crew_id, talk_date desc);

create table if not exists public.talk_attendance (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  talk_id       uuid not null references public.safety_talks(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  crew_member_id uuid references public.crew_members(id) on delete set null,
  full_name     text not null,
  dni           text,
  position      text,
  signature_path text,                 -- firma digital en Storage
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (talk_id, full_name)
);
create index if not exists idx_att_talk on public.talk_attendance(talk_id);

alter table public.evidences
  drop constraint if exists evidences_talk_id_fkey,
  add constraint evidences_talk_id_fkey
  foreign key (talk_id) references public.safety_talks(id) on delete cascade;

create or replace function public.talk_refresh_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.safety_talks t
     set attendees_count = (select count(*) from public.talk_attendance a where a.talk_id = t.id)
   where t.id = coalesce(new.talk_id, old.talk_id);
  return coalesce(new, old);
end $$;

drop trigger if exists t_att_count on public.talk_attendance;
create trigger t_att_count after insert or delete on public.talk_attendance
  for each row execute function public.talk_refresh_count();

-- ─── Checklists configurables ────────────────────────────────────────────
create table if not exists public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  code        text not null,
  name        text not null,
  category    text,                     -- EPP / Vehículo / Herramientas / Área de trabajo
  description text,
  -- [{id, label, type: bool|text|number|photo, required, help}]
  questions   jsonb not null default '[]'::jsonb,
  frequency   text default 'diaria',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  deleted_at  timestamptz,
  unique (service_id, code)
);

create table if not exists public.checklist_responses (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid unique not null default gen_random_uuid(),
  template_id  uuid not null references public.checklist_templates(id) on delete cascade,
  service_id   uuid not null references public.services(id) on delete cascade,
  crew_id      uuid references public.crews(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  responded_on date not null default current_date,
  answers      jsonb not null default '{}'::jsonb,
  score        numeric,
  has_findings boolean not null default false,
  findings     text,
  lat          double precision,
  lng          double precision,
  signature_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz
);
create index if not exists idx_clr_service on public.checklist_responses(service_id, responded_on desc);
create index if not exists idx_clr_template on public.checklist_responses(template_id);

-- ─── ATS / IPERC ─────────────────────────────────────────────────────────
create table if not exists public.ats_iperc (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  crew_id       uuid references public.crews(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  doc_date      date not null default current_date,
  task          text not null,
  location      text,
  section_id    uuid references public.road_sections(id),
  prog_start_m  numeric,
  -- [{peligro, riesgo, probabilidad, severidad, nivel, controles, responsable}]
  hazards       jsonb not null default '[]'::jsonb,
  max_risk      risk_level default 'tolerable',
  ppe           jsonb not null default '[]'::jsonb,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_signature_path text,
  approved_at   timestamptz,
  lat           double precision,
  lng           double precision,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz
);
create index if not exists idx_ats_service on public.ats_iperc(service_id, doc_date desc);

create table if not exists public.ats_signatures (
  id          uuid primary key default gen_random_uuid(),
  ats_id      uuid not null references public.ats_iperc(id) on delete cascade,
  full_name   text not null,
  dni         text,
  signature_path text,
  signed_at   timestamptz not null default now()
);
create index if not exists idx_atssig_ats on public.ats_signatures(ats_id);

drop trigger if exists t_talks_touch on public.safety_talks;
create trigger t_talks_touch before update on public.safety_talks
  for each row execute function public.touch_updated_at();

drop trigger if exists t_clt_touch on public.checklist_templates;
create trigger t_clt_touch before update on public.checklist_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists t_clr_touch on public.checklist_responses;
create trigger t_clr_touch before update on public.checklist_responses
  for each row execute function public.touch_updated_at();

drop trigger if exists t_ats_touch on public.ats_iperc;
create trigger t_ats_touch before update on public.ats_iperc
  for each row execute function public.touch_updated_at();
