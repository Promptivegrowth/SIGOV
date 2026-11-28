-- ═══════════════════════════════════════════════════════════════════════
-- 0180 · Ronda 5 (CP-06 y CP-15): rendimientos consultables y trazables.
-- · Equipo (método mecánico o mixto), vigencia y versión por registro.
-- · Se guardan por función: cantidad mayor que cero y con 2 decimales como
--   máximo, unidad de la actividad, motivo obligatorio (queda en la
--   auditoría con actor y fecha) y control de versión: si otro lo cambió
--   entretanto, se rechaza en vez de sobrescribir.
-- · La referencia que aplica: la específica de la cuadrilla vigente; si no
--   hay, la general vigente.
-- ═══════════════════════════════════════════════════════════════════════
alter table public.rendimientos_jornada add column if not exists equipo text;
alter table public.rendimientos_jornada add column if not exists vigente_desde date;
alter table public.rendimientos_jornada add column if not exists vigente_hasta date;
alter table public.rendimientos_jornada add column if not exists version integer not null default 1;

create or replace function public.rendimiento_guardar(
  p_id uuid, p_service uuid, p_activity uuid, p_crew uuid, p_metodo text, p_equipo text, p_cantidad numeric,
  p_desde date, p_hasta date, p_motivo text, p_version integer default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_unit uuid; v_row public.rendimientos_jornada; v_id uuid;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  if p_cantidad is null then raise exception 'SIGOV: ingresa el rendimiento por jornada (sin dato no se guarda)'; end if;
  if p_cantidad <= 0 then raise exception 'SIGOV: el rendimiento debe ser mayor que cero'; end if;
  if p_cantidad <> round(p_cantidad, 2) then raise exception 'SIGOV: el rendimiento admite 2 decimales como máximo'; end if;
  if p_metodo not in ('Manual', 'Mecánico', 'Mixto') then raise exception 'SIGOV: método no válido'; end if;
  if p_metodo in ('Mecánico', 'Mixto') and nullif(trim(p_equipo), '') is null then raise exception 'SIGOV: indica el equipo del método %', lower(p_metodo); end if;
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then raise exception 'SIGOV: la vigencia termina antes de empezar'; end if;
  select unit_id into v_unit from public.activities_catalog where id = p_activity and service_id = p_service;
  if not found then raise exception 'SIGOV: la actividad no es de este contrato'; end if;
  if p_crew is not null and not exists (select 1 from public.crews where id = p_crew and service_id = p_service) then
    raise exception 'SIGOV: la cuadrilla no es de este contrato';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  if p_id is null then
    insert into public.rendimientos_jornada (service_id, activity_id, crew_id, metodo, equipo, unit_id, cantidad, vigente_desde, vigente_hasta, created_by, updated_by)
    values (p_service, p_activity, p_crew, p_metodo, case when p_metodo = 'Manual' then null else trim(p_equipo) end, v_unit, p_cantidad, p_desde, p_hasta, auth.uid(), auth.uid())
    returning id into v_id;
  else
    select * into v_row from public.rendimientos_jornada where id = p_id and service_id = p_service and deleted_at is null for update;
    if not found then raise exception 'SIGOV: ese rendimiento ya no existe'; end if;
    if p_version is not null and p_version <> v_row.version then
      raise exception 'SIGOV: Este registro fue actualizado por otro usuario. Actualice la información antes de continuar.';
    end if;
    update public.rendimientos_jornada
       set crew_id = p_crew, metodo = p_metodo, equipo = case when p_metodo = 'Manual' then null else trim(p_equipo) end,
           unit_id = v_unit, cantidad = p_cantidad, vigente_desde = p_desde, vigente_hasta = p_hasta,
           version = v_row.version + 1, updated_at = now(), updated_by = auth.uid()
     where id = p_id;
    v_id := p_id;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  raise exception 'SIGOV: ya existe un rendimiento para esa actividad, cuadrilla y método; edítalo en lugar de crear otro';
end $$;
revoke all on function public.rendimiento_guardar(uuid, uuid, uuid, uuid, text, text, numeric, date, date, text, integer) from public, anon;
grant execute on function public.rendimiento_guardar(uuid, uuid, uuid, uuid, text, text, numeric, date, date, text, integer) to authenticated;

create or replace function public.rendimiento_eliminar(p_id uuid, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_service uuid;
begin
  select service_id into v_service from public.rendimientos_jornada where id = p_id and deleted_at is null;
  if not found then raise exception 'SIGOV: ese rendimiento ya no existe'; end if;
  if not public.es_admin(v_service) then raise exception 'SIGOV: solo el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.rendimientos_jornada set deleted_at = now(), updated_at = now(), updated_by = auth.uid(), version = version + 1 where id = p_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
revoke all on function public.rendimiento_eliminar(uuid, text) from public, anon;
grant execute on function public.rendimiento_eliminar(uuid, text) to authenticated;

-- La referencia que aplica hoy (o en la fecha dada): la de la cuadrilla; si
-- no hay, la general; solo las vigentes
create or replace function public.rendimiento_referencia(p_service uuid, p_activity uuid, p_crew uuid default null)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select r.cantidad from public.rendimientos_jornada r
   where r.service_id = p_service and r.activity_id = p_activity and r.deleted_at is null
     and (r.crew_id = p_crew or r.crew_id is null)
     and (r.vigente_desde is null or r.vigente_desde <= public.hoy_peru()::date)
     and (r.vigente_hasta is null or r.vigente_hasta >= public.hoy_peru()::date)
   order by (r.crew_id is not null) desc, r.updated_at desc
   limit 1
$$;
