-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0005 · Módulo 06: Gestión de PCIs (OSITRAN)
-- Alto volumen: cientos de ítems por PCI, plazo diferenciado por ítem.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pcis (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services(id) on delete cascade,
  code            text not null,                 -- código OSITRAN
  title           text not null,
  description     text,
  source          text default 'OSITRAN',        -- OSITRAN / Concesionario / Interno
  notified_on     date not null,
  received_on     date,
  priority        pci_priority not null default 'media',
  status          pci_status not null default 'abierto',
  default_days    smallint not null default 15,  -- plazo por defecto de sus ítems
  document_path   text,
  -- Regla crítica: un PCI prioritario suspende la programación
  suspends_plan   boolean not null default false,
  suspension_applied_at timestamptz,
  items_total     integer not null default 0,
  items_done      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id),
  deleted_at      timestamptz,
  unique (service_id, code)
);
create index if not exists idx_pci_service on public.pcis(service_id, notified_on desc);
create index if not exists idx_pci_status on public.pcis(status);
create index if not exists idx_pci_priority on public.pcis(priority);

create table if not exists public.pci_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique not null default gen_random_uuid(),
  pci_id        uuid not null references public.pcis(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  item_number   integer not null,
  description   text not null,
  section_id    uuid references public.road_sections(id),
  prog_start_m  numeric,
  prog_end_m    numeric,
  side          road_side default 'derecho',
  activity_id   uuid references public.activities_catalog(id),
  quantity      numeric,
  unit_id       uuid references public.units(id),
  -- Plazos diferenciados por ítem
  term_days     smallint not null default 15,
  due_date      date not null,
  status        pci_item_status not null default 'pendiente',
  assigned_crew_id uuid references public.crews(id) on delete set null,
  assigned_to   uuid references public.profiles(id) on delete set null,
  requires_evidence boolean not null default true,
  closed_at     timestamptz,
  closed_by     uuid references public.profiles(id),
  validated_at  timestamptz,
  validated_by  uuid references public.profiles(id),
  reject_reason text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  unique (pci_id, item_number)
);
create index if not exists idx_pcii_pci on public.pci_items(pci_id);
create index if not exists idx_pcii_service_due on public.pci_items(service_id, due_date);
create index if not exists idx_pcii_status on public.pci_items(status);
create index if not exists idx_pcii_crew on public.pci_items(assigned_crew_id);
create index if not exists idx_pcii_desc_trgm on public.pci_items using gin (description gin_trgm_ops);

-- FKs diferidas desde 0004
alter table public.work_entries
  drop constraint if exists work_entries_pci_item_id_fkey,
  add constraint work_entries_pci_item_id_fkey
  foreign key (pci_item_id) references public.pci_items(id) on delete set null;

alter table public.evidences
  drop constraint if exists evidences_pci_item_id_fkey,
  add constraint evidences_pci_item_id_fkey
  foreign key (pci_item_id) references public.pci_items(id) on delete cascade;

alter table public.plan_items
  drop constraint if exists plan_items_suspended_by_pci_id_fkey,
  add constraint plan_items_suspended_by_pci_id_fkey
  foreign key (suspended_by_pci_id) references public.pcis(id) on delete set null;

alter table public.plan_suspensions
  drop constraint if exists plan_suspensions_pci_id_fkey,
  add constraint plan_suspensions_pci_id_fkey
  foreign key (pci_id) references public.pcis(id) on delete cascade;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEMÁFORO DE VENCIMIENTOS (calculado, nunca almacenado desactualizado)
--   verde  : queda > 50% del plazo
--   ambar  : queda ≤ 50%
--   rojo   : queda ≤ 20% o menos de 2 días
--   vencido: pasó la fecha límite sin levantar
--   ok     : levantado / validado
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.pci_item_semaforo(
  p_due date, p_term_days smallint, p_status pci_item_status
) returns text language sql immutable as $$
  select case
    when p_status in ('levantado','validado') then 'ok'
    when p_due < current_date then 'vencido'
    else case
      when (p_due - current_date)::numeric / greatest(p_term_days,1) > 0.5 then 'verde'
      when (p_due - current_date)::numeric / greatest(p_term_days,1) > 0.2 then 'ambar'
      else 'rojo'
    end
  end
$$;

-- Fecha límite automática desde el plazo del ítem
create or replace function public.pci_item_before_write()
returns trigger language plpgsql set search_path = public as $$
declare v_notified date;
begin
  if new.due_date is null then
    select notified_on into v_notified from public.pcis where id = new.pci_id;
    new.due_date := coalesce(v_notified, current_date) + coalesce(new.term_days, 15);
  end if;
  return new;
end $$;

drop trigger if exists t_pcii_before on public.pci_items;
create trigger t_pcii_before before insert on public.pci_items
  for each row execute function public.pci_item_before_write();

-- Contadores de la cabecera del PCI
create or replace function public.pci_refresh_counters()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pci uuid;
begin
  v_pci := coalesce(new.pci_id, old.pci_id);
  update public.pcis p set
    items_total = (select count(*) from public.pci_items i where i.pci_id = p.id and i.deleted_at is null),
    items_done  = (select count(*) from public.pci_items i where i.pci_id = p.id and i.deleted_at is null
                     and i.status in ('levantado','validado')),
    status = case
      when (select count(*) from public.pci_items i where i.pci_id = p.id and i.deleted_at is null) = 0 then p.status
      when (select count(*) from public.pci_items i where i.pci_id = p.id and i.deleted_at is null
              and i.status not in ('levantado','validado')) = 0 then 'levantado'::pci_status
      when exists (select 1 from public.pci_items i where i.pci_id = p.id and i.deleted_at is null
                     and i.due_date < current_date and i.status not in ('levantado','validado')) then 'vencido'::pci_status
      when exists (select 1 from public.pci_items i where i.pci_id = p.id and i.deleted_at is null
                     and i.status = 'en_atencion') then 'en_atencion'::pci_status
      else p.status end
  where p.id = v_pci;
  return coalesce(new, old);
end $$;

drop trigger if exists t_pcii_counters on public.pci_items;
create trigger t_pcii_counters after insert or update or delete on public.pci_items
  for each row execute function public.pci_refresh_counters();

-- No se cierra un ítem sin evidencia cuando ésta es obligatoria
create or replace function public.pci_item_require_evidence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('levantado','validado')
     and old.status not in ('levantado','validado')
     and new.requires_evidence then
    if not exists (select 1 from public.evidences e
                   where e.pci_item_id = new.id and e.deleted_at is null) then
      raise exception 'SIGOV: no se puede levantar el ítem % sin evidencia fotográfica', new.item_number
        using errcode = 'check_violation';
    end if;
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end $$;

drop trigger if exists t_pcii_evidence on public.pci_items;
create trigger t_pcii_evidence before update on public.pci_items
  for each row execute function public.pci_item_require_evidence();

drop trigger if exists t_pci_touch on public.pcis;
create trigger t_pci_touch before update on public.pcis
  for each row execute function public.touch_updated_at();

drop trigger if exists t_pcii_touch on public.pci_items;
create trigger t_pcii_touch before update on public.pci_items
  for each row execute function public.touch_updated_at();
