-- ═══════════════════════════════════════════════════════════════════════
-- 0029 · Charlas de seguridad e higiene diaria
--
-- Dos cosas que hoy se llevan en papel y se pierden:
--
--   · Las charlas. Ya existía la tabla, pero sin distinguir de qué tipo son.
--     No es lo mismo la charla de cinco minutos de cada mañana que una
--     inducción de ingreso o un simulacro: se piden por separado en auditoría
--     y tienen periodicidad distinta.
--
--   · La higiene diaria. Bloqueador, lavado de manos e hidratación. Parece
--     menor hasta que alguien se insola en el km 940 con 38 grados, y
--     entonces lo primero que piden es el registro de que se entregó.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.talk_kind as enum (
    'diaria',        -- los cinco minutos antes de empezar
    'induccion',     -- al ingresar a la obra
    'capacitacion',  -- formación programada
    'simulacro'      -- evacuación, derrame, primeros auxilios
  );
exception when duplicate_object then null; end $$;

alter table public.safety_talks
  add column if not exists kind public.talk_kind not null default 'diaria';

create index if not exists safety_talks_kind_idx
  on public.safety_talks (service_id, kind, talk_date desc) where deleted_at is null;

-- ─── La higiene del día ───────────────────────────────────────────────

do $$ begin
  create type public.hygiene_item as enum (
    'bloqueador',
    'lavado_manos',
    'hidratacion',
    'desinfeccion_unidad',
    'orden_limpieza'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.hygiene_checks (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null default gen_random_uuid(),
  service_id   uuid not null references public.services(id) on delete cascade,
  crew_id      uuid references public.crews(id),
  checked_on   date not null default (now() at time zone 'America/Lima')::date,
  item         public.hygiene_item not null,
  done         boolean not null default true,
  -- Cuántos de la cuadrilla: el dato que se contrasta con la asistencia
  people_count smallint,
  notes        text,
  storage_path text,                        -- la foto de la entrega
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  constraint hygiene_checks_client_id_key unique (client_id),
  -- Uno por cuadrilla, ítem y día: si se repite, se corrige el existente
  constraint hygiene_checks_del_dia unique (crew_id, checked_on, item)
);

create index if not exists hygiene_checks_dia_idx
  on public.hygiene_checks (service_id, checked_on desc) where deleted_at is null;

-- ─── Vistas ───────────────────────────────────────────────────────────

create or replace view public.v_safety_talks as
select
  t.id,
  t.client_id,
  t.service_id,
  t.kind,
  t.topic,
  t.content,
  t.talk_date,
  t.start_time,
  t.duration_min,
  t.location,
  t.lat,
  t.lng,
  t.crew_id,
  c.name                                   as crew_name,
  coalesce(t.speaker_name, p.full_name)    as speaker_name,
  t.created_by,
  t.created_at,
  count(a.id)                              as attendee_count,
  count(a.id) filter (where a.signature_path is not null) as signed_count
from public.safety_talks t
left join public.crews c on c.id = t.crew_id
left join public.profiles p on p.id = t.speaker_id
left join public.talk_attendance a on a.talk_id = t.id
where t.deleted_at is null
group by t.id, c.name, p.full_name;

/**
 * La higiene del día vista de una sola fila por cuadrilla, que es como se
 * revisa: de un vistazo se ve qué le falta a quién.
 */
create or replace view public.v_hygiene_today as
select
  c.service_id,
  c.id                                     as crew_id,
  c.name                                   as crew_name,
  (now() at time zone 'America/Lima')::date as checked_on,
  bool_or(h.item = 'bloqueador'    and h.done) as bloqueador,
  bool_or(h.item = 'lavado_manos'  and h.done) as lavado_manos,
  bool_or(h.item = 'hidratacion'   and h.done) as hidratacion,
  bool_or(h.item = 'desinfeccion_unidad' and h.done) as desinfeccion_unidad,
  bool_or(h.item = 'orden_limpieza' and h.done) as orden_limpieza,
  count(h.id) filter (where h.done)        as cumplidos,
  max(h.people_count)                      as people_count
from public.crews c
left join public.hygiene_checks h
       on h.crew_id = c.id
      and h.deleted_at is null
      and h.checked_on = (now() at time zone 'America/Lima')::date
where c.deleted_at is null
group by c.service_id, c.id, c.name;

-- ─── Seguridad ────────────────────────────────────────────────────────

alter table public.hygiene_checks enable row level security;

drop policy if exists "hygiene_checks_select" on public.hygiene_checks;
drop policy if exists "hygiene_checks_insert" on public.hygiene_checks;
drop policy if exists "hygiene_checks_update" on public.hygiene_checks;
drop policy if exists "hygiene_checks_delete" on public.hygiene_checks;

create policy "hygiene_checks_select" on public.hygiene_checks for select to authenticated
  using (public.is_member(service_id));
create policy "hygiene_checks_insert" on public.hygiene_checks for insert to authenticated
  with check (public.can_write(service_id));
create policy "hygiene_checks_update" on public.hygiene_checks for update to authenticated
  using (public.can_write(service_id)) with check (public.can_write(service_id));
create policy "hygiene_checks_delete" on public.hygiene_checks for delete to authenticated
  using (public.can_manage(service_id));

grant select on public.v_safety_talks, public.v_hygiene_today to authenticated;

-- ─── La asistencia mantiene el conteo de la charla ────────────────────
--
-- `attendees_count` se consulta para listar sin abrir cada charla; que lo
-- mantenga la propia asistencia evita que se desincronice.

create or replace function public.al_firmar_asistencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.safety_talks
     set attendees_count = (
           select count(*) from public.talk_attendance a where a.talk_id = new.talk_id
         ),
         updated_at = now()
   where id = new.talk_id;
  return new;
end $$;

drop trigger if exists talk_attendance_cuenta on public.talk_attendance;
create trigger talk_attendance_cuenta
  after insert on public.talk_attendance
  for each row execute function public.al_firmar_asistencia();
