-- ═══════════════════════════════════════════════════════════════════════
-- 0099 · El reporte diario FOR:001 (Elvis, P15 y el formato del 13/10)
--
-- El formato pide, por actividad, la hora de inicio y fin, la cantidad de
-- personas y la longitud, el ancho y el espesor de lo ejecutado; y para el
-- día, los equipos y los otros recursos (herramientas, EPC…). Lo cierra el
-- jefe de cuadrilla y lo valida el supervisor.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.work_entries
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists personas smallint check (personas between 1 and 99),
  add column if not exists longitud_m numeric(12, 3) check (longitud_m >= 0),
  add column if not exists ancho_m numeric(10, 3) check (ancho_m >= 0),
  add column if not exists espesor_m numeric(10, 4) check (espesor_m >= 0);

comment on column public.work_entries.hora_inicio is 'FOR:001 · hora de inicio de la actividad';
comment on column public.work_entries.personas is 'FOR:001 · cantidad de personas en la actividad';
comment on column public.work_entries.longitud_m is 'FOR:001 · longitud ejecutada (m)';

-- Los equipos y los otros recursos del día (secciones IV y V del FOR:001)
create table if not exists public.parte_recursos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique,
  service_id    uuid not null references public.services(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  tipo          text not null check (tipo in ('equipo', 'otro')),
  codigo        text,
  descripcion   text not null check (length(trim(descripcion)) > 0),
  unidad        text,
  cantidad      numeric(12, 3) check (cantidad >= 0),
  observacion   text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists parte_recursos_parte on public.parte_recursos (work_order_id) where deleted_at is null;
comment on table public.parte_recursos is 'Equipos y otros recursos (herramientas, EPC…) usados en el día: secciones IV y V del FOR:001';

alter table public.parte_recursos enable row level security;

-- Lo escribe quien lleva el parte (su jefe o quien administra), mientras no esté validado
create or replace function public.t_parte_recurso_reglas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.work_orders;
begin
  select * into o from public.work_orders where id = coalesce(new.work_order_id, old.work_order_id);
  if auth.uid() is not null then
    if not public.puede_llevar_parte(o) then
      raise exception 'SIGOV: ese reporte diario es de otra cuadrilla' using errcode = '42501';
    end if;
    if o.status = 'validado' and not public.can_manage(o.service_id) then
      raise exception 'SIGOV: ese reporte diario ya está validado; no se modifica' using errcode = '42501';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new.service_id := o.service_id;
    new.updated_at := now();
    if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_parte_recurso_reglas on public.parte_recursos;
create trigger t_parte_recurso_reglas before insert or update or delete on public.parte_recursos
  for each row execute function public.t_parte_recurso_reglas();

drop trigger if exists t_audit_parte_recursos on public.parte_recursos;
create trigger t_audit_parte_recursos after insert or update or delete on public.parte_recursos
  for each row execute function public.audit_trigger();

drop policy if exists parte_recursos_select on public.parte_recursos;
create policy parte_recursos_select on public.parte_recursos for select
  using (public.is_member(service_id));
drop policy if exists parte_recursos_insert on public.parte_recursos;
create policy parte_recursos_insert on public.parte_recursos for insert
  with check (public.can_write(service_id));
drop policy if exists parte_recursos_update on public.parte_recursos;
create policy parte_recursos_update on public.parte_recursos for update
  using (public.can_write(service_id)) with check (public.can_write(service_id));
drop policy if exists parte_recursos_delete on public.parte_recursos;
create policy parte_recursos_delete on public.parte_recursos for delete
  using (public.can_manage(service_id));

grant select, insert, update on public.parte_recursos to authenticated;
grant delete on public.parte_recursos to authenticated;

-- La vista de actividades lleva lo nuevo y el sector de la progresiva
create or replace view public.v_work_entries with (security_invoker = true) as
SELECT we.id,
    we.work_order_id,
    we.service_id,
    we.plan_item_id,
    we.pci_item_id,
    wo.work_date,
    wo.status AS order_status,
    wo.crew_id,
    c.name AS crew_name,
    c.color AS crew_color,
    we.activity_id,
    a.name AS activity_name,
    a.category AS activity_category,
    a.color AS activity_color,
    we.section_id,
    s.name AS section_name,
    we.prog_start_m,
    we.prog_end_m,
    we.side,
    fmt_progresiva(we.prog_start_m) AS prog_start_txt,
    fmt_progresiva(we.prog_end_m) AS prog_end_txt,
    we.quantity,
    u.symbol AS unit_symbol,
    we.observation,
    we.started_at,
    we.finished_at,
    st_y(we.geom::geometry) AS lat,
    st_x(we.geom::geometry) AS lng,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.work_entry_id = we.id AND e.deleted_at IS NULL) AS evidence_count,
    p.full_name AS created_by_name,
    we.created_at,
    a.code AS activity_code,
    a.numero_covinca AS activity_numero,
    we.origen,
    pci.code AS pci_code,
    pit.item_number AS pci_item_number,
    we.hora_inicio,
    we.hora_fin,
    we.personas,
    we.longitud_m,
    we.ancho_m,
    we.espesor_m,
    ( SELECT sd.code
           FROM sector_de(we.section_id, we.prog_start_m) sd(id, service_id, section_id, code, folder, prog_start_m, prog_end_m, orden, created_at)) AS sector_code
   FROM work_entries we
     JOIN work_orders wo ON wo.id = we.work_order_id
     JOIN activities_catalog a ON a.id = we.activity_id
     JOIN road_sections s ON s.id = we.section_id
     LEFT JOIN crews c ON c.id = wo.crew_id
     LEFT JOIN units u ON u.id = we.unit_id
     LEFT JOIN profiles p ON p.id = we.created_by
     LEFT JOIN pci_items pit ON pit.id = we.pci_item_id
     LEFT JOIN pcis pci ON pci.id = pit.pci_id
  WHERE we.deleted_at IS NULL;
