-- ═══════════════════════════════════════════════════════════════════════
-- 0082 · La cuadrilla y sus vehículos
--
-- OBS-66 y OBS-70 a OBS-74 (consolidado de Servicon):
--
-- · Cada cuadrilla usa normalmente 1 o 2 vehículos, y cambian: entra uno de
--   reemplazo cuando el titular va a mantenimiento, avería o reparación, o
--   se usa uno temporal. Ya no basta con vehicles.crew_id (fijo): se lleva
--   la asignación con fechas, motivo y kilometraje de inicio y fin.
-- · El jefe puede registrar el reemplazo y dar de alta un vehículo temporal
--   desde campo; la incorporación definitiva la valida el supervisor o el
--   administrador.
-- · El checklist se pide del vehículo realmente usado: el reemplazo, no el
--   que está en el taller (OBS-74).
-- · Histórico: qué vehículo usó cada cuadrilla, qué días, con qué
--   kilometraje y por qué (OBS-73).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.vehicles
  add column if not exists is_temporary boolean not null default false,
  add column if not exists validation_status text not null default 'validado',
  add column if not exists next_service_on date;

alter table public.vehicles drop constraint if exists vehicles_validation_status_check;
alter table public.vehicles add constraint vehicles_validation_status_check
  check (validation_status in ('validado', 'pendiente', 'rechazado'));

comment on column public.vehicles.is_temporary is 'Vehículo dado de alta en campo para cubrir una necesidad temporal.';
comment on column public.vehicles.validation_status is 'Alta desde campo: pendiente hasta que el supervisor o el administrador lo valida.';

create table if not exists public.crew_vehicle_assignments (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references public.services(id) on delete cascade,
  crew_id        uuid not null references public.crews(id),
  vehicle_id     uuid not null references public.vehicles(id),
  kind           text not null default 'titular' check (kind in ('titular', 'reemplazo', 'temporal')),
  replaces_id    uuid references public.crew_vehicle_assignments(id),
  start_on       date not null default ((now() at time zone 'America/Lima')::date),
  end_on         date,
  reason         text,
  end_reason     text,
  odometer_start integer,
  odometer_end   integer,
  notes          text,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint asignacion_fechas check (end_on is null or end_on >= start_on),
  constraint asignacion_km check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start)
);

create index if not exists asignaciones_crew on public.crew_vehicle_assignments (crew_id, start_on);
create index if not exists asignaciones_vehicle on public.crew_vehicle_assignments (vehicle_id, start_on);
-- Un vehículo no está en dos cuadrillas a la vez
create unique index if not exists asignaciones_un_vigente_por_vehiculo
  on public.crew_vehicle_assignments (vehicle_id) where end_on is null;

alter table public.crew_vehicle_assignments enable row level security;
drop policy if exists asignaciones_select on public.crew_vehicle_assignments;
create policy asignaciones_select on public.crew_vehicle_assignments for select to authenticated
  using (public.is_member(service_id));
-- Asignar a mano es de quien administra; el jefe lo hace por las funciones
drop policy if exists asignaciones_write on public.crew_vehicle_assignments;
create policy asignaciones_write on public.crew_vehicle_assignments for all to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

drop trigger if exists t_audit_crew_vehicle_assignments on public.crew_vehicle_assignments;
create trigger t_audit_crew_vehicle_assignments after insert or update or delete on public.crew_vehicle_assignments
  for each row execute function public.audit_trigger();

-- Como mucho dos vehículos vigentes por cuadrilla (OBS-70)
create or replace function public.t_asignacion_maximo()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.end_on is null and (
    select count(*) from public.crew_vehicle_assignments a
     where a.crew_id = new.crew_id and a.end_on is null and a.id <> new.id) >= 2 then
    raise exception 'SIGOV: la cuadrilla ya tiene dos vehículos asignados; cierra uno antes';
  end if;
  return new;
end $$;
drop trigger if exists t_asignacion_maximo on public.crew_vehicle_assignments;
create trigger t_asignacion_maximo before insert or update on public.crew_vehicle_assignments
  for each row execute function public.t_asignacion_maximo();

-- Lo que había: cada vehículo con cuadrilla pasa a ser su titular
insert into public.crew_vehicle_assignments (service_id, crew_id, vehicle_id, kind, start_on, odometer_start, created_by)
select v.service_id, v.crew_id, v.id, 'titular', least(v.created_at::date, (now() at time zone 'America/Lima')::date), v.odometer_km, null
  from public.vehicles v
 where v.crew_id is not null and v.deleted_at is null and v.status <> 'dado_de_baja'
   and not exists (select 1 from public.crew_vehicle_assignments a where a.vehicle_id = v.id);

-- El checklist sabe de qué asignación y cuadrilla es (OBS-74), y su estado general (OBS-67)
alter table public.vehicle_checks
  add column if not exists assignment_id uuid references public.crew_vehicle_assignments(id),
  add column if not exists crew_id uuid references public.crews(id),
  add column if not exists general_status text;

-- ─── Las funciones del jefe ────────────────────────────────────────────
create or replace function public.puede_llevar_cuadrilla(p_crew uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crews c
                  where c.id = p_crew and (c.leader_id = auth.uid() or public.can_manage(c.service_id)))
$$;

/* Busca el vehículo por placa; si no existe, lo crea como temporal pendiente de validación. */
create or replace function public.vehiculo_por_placa(
  p_service uuid, p_placa text, p_tipo text, p_marca text, p_modelo text, p_km integer
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '\s+', '', 'g'));
begin
  if v_placa = '' then raise exception 'SIGOV: escribe la placa'; end if;
  select id into v_id from public.vehicles
   where service_id = p_service and upper(replace(plate, ' ', '')) = v_placa and deleted_at is null limit 1;
  if v_id is null then
    insert into public.vehicles (service_id, kind, status, plate, brand, model, odometer_km, is_temporary, validation_status, created_by)
    values (p_service, coalesce(nullif(p_tipo, ''), 'camioneta')::public.vehicle_kind, 'operativo', v_placa,
            nullif(trim(p_marca), ''), nullif(trim(p_modelo), ''), p_km, true, 'pendiente', auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

/*
 * Registra el vehículo de reemplazo (OBS-71): cierra la asignación del
 * titular con su motivo, lo manda al taller si corresponde y abre la del
 * reemplazo con su kilometraje inicial.
 */
create or replace function public.registrar_reemplazo(
  p_crew uuid, p_titular uuid, p_placa text, p_tipo text default 'camioneta',
  p_marca text default null, p_modelo text default null, p_fecha date default null,
  p_motivo text default 'mantenimiento', p_km integer default null, p_obs text default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_crew public.crews;
  v_tit public.crew_vehicle_assignments;
  v_veh uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_nueva uuid;
begin
  select * into v_crew from public.crews where id = p_crew;
  if not public.puede_llevar_cuadrilla(p_crew) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if p_motivo not in ('mantenimiento', 'averia', 'reparacion', 'cambio_temporal') then
    raise exception 'SIGOV: motivo de reemplazo no válido';
  end if;
  if p_km is null or p_km <= 0 then raise exception 'SIGOV: escribe el kilometraje inicial del reemplazo'; end if;

  select * into v_tit from public.crew_vehicle_assignments
   where crew_id = p_crew and vehicle_id = p_titular and end_on is null limit 1;
  if v_tit.id is null then raise exception 'SIGOV: ese vehículo no está asignado a la cuadrilla'; end if;

  v_veh := public.vehiculo_por_placa(v_crew.service_id, p_placa, p_tipo, p_marca, p_modelo, p_km);
  if v_veh = p_titular then raise exception 'SIGOV: el reemplazo no puede ser el mismo vehículo'; end if;
  if exists (select 1 from public.crew_vehicle_assignments where vehicle_id = v_veh and end_on is null) then
    raise exception 'SIGOV: ese vehículo ya está asignado a otra cuadrilla';
  end if;

  update public.crew_vehicle_assignments
     set end_on = greatest(v_fecha, start_on), end_reason = p_motivo, updated_at = now()
   where id = v_tit.id;
  if p_motivo in ('mantenimiento', 'averia', 'reparacion') then
    update public.vehicles set status = 'taller', updated_at = now() where id = p_titular;
  end if;

  insert into public.crew_vehicle_assignments
    (service_id, crew_id, vehicle_id, kind, replaces_id, start_on, reason, odometer_start, notes)
  values (v_crew.service_id, p_crew, v_veh, 'reemplazo', v_tit.id, v_fecha, p_motivo, p_km, nullif(trim(p_obs), ''))
  returning id into v_nueva;
  update public.vehicles set odometer_km = greatest(coalesce(odometer_km, 0), p_km), updated_at = now() where id = v_veh;

  return json_build_object('asignacion', v_nueva, 'vehiculo', v_veh);
end $$;

/* Vuelve el titular: se cierra el reemplazo y el titular retoma. */
create or replace function public.devolver_titular(p_asignacion uuid, p_fecha date default null, p_km_reemplazo integer default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v public.crew_vehicle_assignments;
  v_tit public.crew_vehicle_assignments;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
begin
  select * into v from public.crew_vehicle_assignments where id = p_asignacion;
  if v.id is null or v.end_on is not null then raise exception 'SIGOV: esa asignación ya está cerrada'; end if;
  if not public.puede_llevar_cuadrilla(v.crew_id) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if p_km_reemplazo is not null and v.odometer_start is not null and p_km_reemplazo < v.odometer_start then
    raise exception 'SIGOV: el kilometraje final (%) no puede ser menor que el inicial (%)', p_km_reemplazo, v.odometer_start;
  end if;
  select * into v_tit from public.crew_vehicle_assignments where id = v.replaces_id;

  update public.crew_vehicle_assignments
     set end_on = greatest(v_fecha, start_on), end_reason = 'vuelve_titular',
         odometer_end = p_km_reemplazo, updated_at = now()
   where id = v.id;

  if v_tit.id is not null and not exists (select 1 from public.crew_vehicle_assignments where vehicle_id = v_tit.vehicle_id and end_on is null) then
    insert into public.crew_vehicle_assignments (service_id, crew_id, vehicle_id, kind, start_on, reason, odometer_start)
    values (v.service_id, v.crew_id, v_tit.vehicle_id, 'titular', v_fecha, 'vuelve del ' || coalesce(v_tit.end_reason, 'taller'),
            (select odometer_km from public.vehicles where id = v_tit.vehicle_id));
    update public.vehicles set status = 'operativo', updated_at = now() where id = v_tit.vehicle_id and status = 'taller';
  end if;
  return json_build_object('ok', true);
end $$;

/* Alta rápida de un vehículo temporal (OBS-72): queda pendiente de validación. */
create or replace function public.alta_vehiculo_temporal(
  p_crew uuid, p_placa text, p_tipo text default 'camioneta', p_marca text default null,
  p_modelo text default null, p_km integer default null, p_obs text default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare v_crew public.crews; v_veh uuid; v_asig uuid;
begin
  select * into v_crew from public.crews where id = p_crew;
  if not public.puede_llevar_cuadrilla(p_crew) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if p_km is null or p_km <= 0 then raise exception 'SIGOV: escribe el kilometraje inicial'; end if;
  v_veh := public.vehiculo_por_placa(v_crew.service_id, p_placa, p_tipo, p_marca, p_modelo, p_km);
  if exists (select 1 from public.crew_vehicle_assignments where vehicle_id = v_veh and end_on is null) then
    raise exception 'SIGOV: ese vehículo ya está asignado a una cuadrilla';
  end if;
  insert into public.crew_vehicle_assignments (service_id, crew_id, vehicle_id, kind, reason, odometer_start, notes)
  values (v_crew.service_id, p_crew, v_veh, 'temporal', 'alta temporal', p_km, nullif(trim(p_obs), ''))
  returning id into v_asig;

  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v_crew.service_id, m.profile_id, 'vehiculo_temporal',
         format('Vehículo temporal %s en %s', upper(p_placa), v_crew.name), 'Pendiente de validación',
         '/vencimientos', 'info', jsonb_build_object('vehicle_id', v_veh)
    from public.service_members m where m.service_id = v_crew.service_id and m.role in ('admin', 'supervisor');
  return json_build_object('asignacion', v_asig, 'vehiculo', v_veh);
end $$;

/* El supervisor o el administrador incorpora (o rechaza) un vehículo dado de alta en campo. */
create or replace function public.validar_vehiculo(p_vehiculo uuid, p_aceptar boolean)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v public.vehicles;
begin
  select * into v from public.vehicles where id = p_vehiculo;
  if v.id is null then raise exception 'SIGOV: ese vehículo no existe'; end if;
  if not public.can_manage(v.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador valida vehículos' using errcode = '42501';
  end if;
  update public.vehicles
     set validation_status = case when p_aceptar then 'validado' else 'rechazado' end,
         is_temporary = case when p_aceptar then false else is_temporary end,
         updated_at = now()
   where id = p_vehiculo;
  return json_build_object('estado', case when p_aceptar then 'validado' else 'rechazado' end);
end $$;

grant execute on function
  public.registrar_reemplazo(uuid, uuid, text, text, text, text, date, text, integer, text),
  public.devolver_titular(uuid, date, integer),
  public.alta_vehiculo_temporal(uuid, text, text, text, text, integer, text),
  public.validar_vehiculo(uuid, boolean)
to authenticated;
revoke execute on function
  public.registrar_reemplazo(uuid, uuid, text, text, text, text, date, text, integer, text),
  public.devolver_titular(uuid, date, integer),
  public.alta_vehiculo_temporal(uuid, text, text, text, text, integer, text),
  public.validar_vehiculo(uuid, boolean)
from anon;
-- Solo la usan las funciones de arriba
revoke execute on function public.vehiculo_por_placa(uuid, text, text, text, text, integer) from anon, authenticated, public;

-- ─── Las vistas ────────────────────────────────────────────────────────
-- La flota, con quién la usa hoy (la asignación vigente) y lo nuevo al final
create or replace view public.v_vehicles
with (security_invoker = true) as
select
  v.id, v.service_id, v.kind, v.status, v.plate, v.code, v.brand, v.model, v.model_year, v.owner,
  -- La cuadrilla la da la asignación vigente; la fija solo si nunca tuvo asignación
  coalesce(a.crew_id, case when not exists (select 1 from public.crew_vehicle_assignments z where z.vehicle_id = v.id)
                           then v.crew_id end) as crew_id,
  c.name as crew_name,
  v.driver_id,
  p.full_name as driver_name,
  v.soat_expires_on, v.inspection_expires_on, v.policy_expires_on,
  v.odometer_km, v.next_service_km, v.last_service_on, v.notes,
  least(coalesce(v.soat_expires_on, '9999-12-31'::date), coalesce(v.inspection_expires_on, '9999-12-31'::date),
        coalesce(v.policy_expires_on, '9999-12-31'::date)) as first_due,
  public.vencimiento_semaforo(nullif(least(coalesce(v.soat_expires_on, '9999-12-31'::date),
        coalesce(v.inspection_expires_on, '9999-12-31'::date), coalesce(v.policy_expires_on, '9999-12-31'::date)),
        '9999-12-31'::date)) as semaforo,
  v.next_service_km - v.odometer_km as km_to_service,
  (select k.checked_on from public.vehicle_checks k
    where k.vehicle_id = v.id and k.deleted_at is null order by k.checked_on desc limit 1) as last_check_on,
  -- 0082
  v.next_service_on,
  v.is_temporary,
  v.validation_status,
  a.id as assignment_id,
  a.kind as assignment_kind,
  a.start_on as assignment_start_on,
  a.reason as assignment_reason,
  a.odometer_start as assignment_odometer_start,
  (select t.plate from public.crew_vehicle_assignments x join public.vehicles t on t.id = x.vehicle_id
    where x.id = a.replaces_id) as replaces_plate
from public.vehicles v
left join public.crew_vehicle_assignments a on a.vehicle_id = v.id and a.end_on is null
left join public.crews c on c.id = coalesce(a.crew_id, case when not exists (select 1 from public.crew_vehicle_assignments z where z.vehicle_id = v.id) then v.crew_id end)
left join public.profiles p on p.id = v.driver_id
where v.deleted_at is null and v.status <> 'dado_de_baja';

-- Histórico de uso (OBS-73): cada asignación con su duración y el
-- kilometraje que dejaron los checklists de esos días
create or replace view public.v_uso_de_vehiculos
with (security_invoker = true) as
select
  a.id, a.service_id, a.crew_id, c.code as crew_code, c.name as crew_name,
  a.vehicle_id, v.plate, v.kind, v.brand, v.model, v.is_temporary,
  a.kind as assignment_kind, a.reason, a.end_reason, a.start_on, a.end_on,
  (coalesce(a.end_on, (now() at time zone 'America/Lima')::date) - a.start_on + 1) as dias,
  coalesce(a.odometer_start, (select min(k.odometer_km) from public.vehicle_checks k
     where k.vehicle_id = a.vehicle_id and k.deleted_at is null
       and k.checked_on between a.start_on and coalesce(a.end_on, k.checked_on))) as km_inicial,
  coalesce(a.odometer_end, (select max(k.odometer_km) from public.vehicle_checks k
     where k.vehicle_id = a.vehicle_id and k.deleted_at is null
       and k.checked_on between a.start_on and coalesce(a.end_on, k.checked_on))) as km_final,
  (select count(*) from public.vehicle_checks k
    where k.vehicle_id = a.vehicle_id and k.deleted_at is null
      and k.checked_on between a.start_on and coalesce(a.end_on, k.checked_on)) as checklists,
  (select t.plate from public.crew_vehicle_assignments x join public.vehicles t on t.id = x.vehicle_id where x.id = a.replaces_id) as reemplaza_a,
  a.notes
from public.crew_vehicle_assignments a
join public.crews c on c.id = a.crew_id
join public.vehicles v on v.id = a.vehicle_id;

notify pgrst, 'reload schema';

-- ─── Documentos del día: el checklist del vehículo de ese día ─────────
create or replace function public.ssoma_tablero(
  p_service_id uuid,
  p_desde date,
  p_hasta date,
  p_crew_id uuid default null
) returns table (
  crew_id uuid, crew_code text, crew_name text, crew_numero smallint,
  fecha date, tipo text, vehicle_id uuid, placa text, titulo text,
  documento_id uuid, estado text, paginas integer, observacion text, digital boolean
) language sql stable security definer set search_path to 'public' as $$
  with cuadrillas as (
    select c.id, c.code, c.name, c.numero
      from public.crews c
     where c.service_id = p_service_id and c.deleted_at is null and c.is_active
       and (p_crew_id is null or c.id = p_crew_id)
       and public.is_member(p_service_id)
  ),
  dias as (select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha),
  -- El checklist se pide del vehículo asignado ESE día (OBS-74): el de
  -- reemplazo, no el que está en el taller. La asignación cubre desde su
  -- inicio hasta el día anterior a su cierre.
  esperados as (
    select c.id as crew_id, d.fecha, x.tipo, null::uuid as vehicle_id, null::text as placa
      from cuadrillas c cross join dias d cross join (values ('ats'), ('charla'), ('higiene')) x(tipo)
    union all
    select a.crew_id, d.fecha, 'checklist_vehicular', v.id, v.plate
      from public.crew_vehicle_assignments a
      join cuadrillas c on c.id = a.crew_id
      join public.vehicles v on v.id = a.vehicle_id
      join dias d on d.fecha >= a.start_on and (a.end_on is null or d.fecha < a.end_on)
  ),
  base as (
    select c.id as crew_id, c.code, c.name, c.numero, d.fecha, e.tipo, e.vehicle_id, e.placa,
           doc.id as documento_id, doc.estado::text as estado_doc, doc.observacion,
           case e.tipo
             when 'ats' then exists (select 1 from public.ats_iperc a
                                      where a.crew_id = c.id and a.doc_date = d.fecha and a.deleted_at is null)
             when 'charla' then exists (select 1 from public.safety_talks t
                                         where t.crew_id = c.id and t.talk_date = d.fecha and t.deleted_at is null)
             when 'higiene' then exists (select 1 from public.hygiene_checks h
                                          where h.crew_id = c.id and h.checked_on = d.fecha and h.deleted_at is null)
             when 'checklist_vehicular' then exists (select 1 from public.vehicle_checks k
                                          where k.vehicle_id = e.vehicle_id and k.checked_on = d.fecha and k.deleted_at is null)
             else false
           end as digital
      from cuadrillas c
      join esperados e on e.crew_id = c.id
      join dias d on d.fecha = e.fecha
      left join public.documentos_del_dia doc
        on doc.crew_id = c.id and doc.doc_date = d.fecha and doc.tipo::text = e.tipo
       and doc.vehicle_id is not distinct from e.vehicle_id and doc.titulo is null and doc.deleted_at is null
  )
  select b.crew_id, b.code, b.name, b.numero, b.fecha, b.tipo, b.vehicle_id, b.placa, null::text,
         b.documento_id,
         coalesce(b.estado_doc, case when b.digital then 'cargado' else 'pendiente' end),
         coalesce((select count(*)::int from public.documento_paginas p
                    where p.documento_id = b.documento_id and p.deleted_at is null), 0),
         b.observacion, b.digital
    from base b
  union all
  -- Lo que no es diario fijo: inspecciones y otros formatos que se suban
  select c.id, c.code, c.name, c.numero, doc.doc_date, doc.tipo::text, doc.vehicle_id, v.plate, doc.titulo,
         doc.id, doc.estado::text,
         (select count(*)::int from public.documento_paginas p where p.documento_id = doc.id and p.deleted_at is null),
         doc.observacion, false
    from public.documentos_del_dia doc
    join cuadrillas c on c.id = doc.crew_id
    left join public.vehicles v on v.id = doc.vehicle_id
   where doc.deleted_at is null and doc.doc_date between p_desde and p_hasta
     and doc.tipo in ('inspeccion_equipos', 'otro')
  union all
  -- El reporte diario, que sí es digital: su estado es el del parte
  select c.id, c.code, c.name, c.numero, d.fecha, 'reporte_diario', null, null, null,
         wo.id, coalesce(wo.status::text, 'pendiente'),
         0, wo.review_notes, wo.id is not null
    from cuadrillas c cross join dias d
    left join public.work_orders wo on wo.crew_id = c.id and wo.work_date = d.fecha and wo.deleted_at is null
$$;


notify pgrst, 'reload schema';
