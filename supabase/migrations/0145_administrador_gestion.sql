-- ═══════════════════════════════════════════════════════════════════════════
-- 0145 · Administrador · Gestión (revisión visual 18/11, T8a)
--
-- · Historial de accesos: ingresos, salidas, intentos fallidos y bloqueos
--   (IP, dispositivo, plataforma). Lo escribe el servidor (/api/accesos).
-- · Auditoría con motivo: audit_log.motivo se llena con sigov.motivo; más
--   tablas auditadas (cuadrillas, integrantes, catálogo, unidades,
--   rendimientos, vehículos, equipos, caja).
-- · Cuadrillas: vigencia, sectores e integrantes con Desde/Hasta. La
--   pertenencia histórica nunca se borra: se finaliza.
-- · Catálogo: las partidas oficiales COVINCA no cambian código ni
--   descripción; fuente, unidad, método y estado sí, con motivo.
-- · Unidades y rendimientos por jornada editables por el Administrador.
-- · Reglas de evidencia por contrato (settings.evidencias).
-- · Permisos por rol: «Ver» por módulo editable con motivo (gobierna menú y
--   rutas); el resto de acciones son reglas del servidor, visibles.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Accesos ──────────────────────────────────────────────────────────────
create table if not exists public.accesos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  usuario text,
  evento text not null check (evento in ('ingreso', 'salida', 'fallido', 'bloqueado', 'desbloqueo', 'restablecimiento', 'cambio_dispositivo')),
  resultado text not null check (resultado in ('exitoso', 'fallido', 'bloqueado')),
  detalle text,
  dispositivo text,
  plataforma text,
  ip text,
  user_agent text,
  cuando timestamptz not null default now()
);
create index if not exists ix_accesos_cuando on public.accesos (cuando desc);
create index if not exists ix_accesos_perfil on public.accesos (profile_id, cuando desc);
alter table public.accesos enable row level security;
drop policy if exists accesos_select on public.accesos;
create policy accesos_select on public.accesos for select to authenticated
  using (public.is_platform_admin() or profile_id = auth.uid()
         or exists (select 1 from public.service_members a where a.profile_id = auth.uid() and a.role = 'admin'
                     and (accesos.profile_id is null or exists (select 1 from public.service_members m where m.service_id = a.service_id and m.profile_id = accesos.profile_id))));
grant select on public.accesos to authenticated;

-- ─── Auditoría con motivo ─────────────────────────────────────────────────
alter table public.audit_log add column if not exists motivo text;
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
  -- Integrantes: el contrato es el de su cuadrilla
  if v_service is null and tg_table_name = 'crew_members' then
    select service_id into v_service from public.crews where id = coalesce(new.crew_id, old.crew_id);
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.audit_log (service_id, table_name, record_id, action, actor_id, actor_email, before_data, after_data, motivo)
  values (
    v_service, tg_table_name,
    coalesce((to_jsonb(case when tg_op='DELETE' then old else new end)->>'id')::uuid, null),
    tg_op, auth.uid(), v_email,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    nullif(current_setting('sigov.motivo', true), '')
  );
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['crews', 'crew_members', 'activities_catalog', 'units', 'rendimientos_jornada', 'vehicles', 'safety_equipment',
                           'cash_boxes', 'cash_movements', 'deposit_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists t_audit_%1$s on public.%1$I', t);
      execute format('create trigger t_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trigger()', t);
    end if;
  end loop;
end $$;

-- ─── Cuadrillas: vigencia, sectores e integrantes con Desde/Hasta ─────────
alter table public.crews
  add column if not exists vigencia_desde date,
  add column if not exists vigencia_hasta date,
  add column if not exists sectores text[] not null default '{}';
update public.crews set vigencia_desde = coalesce(vigencia_desde, created_at::date) where vigencia_desde is null;

alter table public.crew_members
  add column if not exists desde date,
  add column if not exists hasta date,
  add column if not exists motivo text;
update public.crew_members set desde = coalesce(desde, created_at::date) where desde is null;
update public.crew_members set hasta = coalesce(hasta, created_at::date) where not is_active and hasta is null;

create or replace function public.cuadrilla_guardar(p_crew uuid, p_leader uuid, p_supervisor uuid, p_sectores text[],
                                                    p_desde date, p_hasta date, p_motivo text, p_nombre text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare c public.crews;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if not public.es_admin(c.service_id) then raise exception 'SIGOV: solo el Administrador gestiona cuadrillas' using errcode = '42501'; end if;
  if p_leader is null then raise exception 'SIGOV: elige el jefe de cuadrilla'; end if;
  if p_desde is null then raise exception 'SIGOV: indica la vigencia desde'; end if;
  if p_hasta is not null and p_hasta < p_desde then raise exception 'SIGOV: la vigencia hasta no puede ser anterior a desde'; end if;
  if (c.leader_id is distinct from p_leader or c.supervisor_id is distinct from p_supervisor) and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo del cambio de jefe o supervisor';
  end if;
  perform set_config('sigov.motivo', coalesce(trim(p_motivo), ''), true);
  if c.supervisor_id is distinct from p_supervisor then
    perform public.cambiar_supervisor(p_crew, p_supervisor, coalesce(nullif(trim(p_motivo), ''), 'Asignación de supervisor'));
  end if;
  update public.crews set leader_id = p_leader, sectores = coalesce(p_sectores, '{}'), vigencia_desde = p_desde, vigencia_hasta = p_hasta,
         name = coalesce(nullif(trim(p_nombre), ''), name), updated_at = now()
   where id = p_crew;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
grant execute on function public.cuadrilla_guardar(uuid, uuid, uuid, text[], date, date, text, text) to authenticated;

/** Agregar integrante: vincula personal del contrato; no crea cuentas; sin solapes incompatibles. */
create or replace function public.integrante_agregar(p_crew uuid, p_profile uuid, p_desde date, p_hasta date, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare c public.crews; p public.profiles; v_otro text; v_id uuid;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if not public.es_admin(c.service_id) then raise exception 'SIGOV: solo el Administrador gestiona integrantes' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la incorporación'; end if;
  if p_desde is null or (p_hasta is not null and p_hasta < p_desde) then raise exception 'SIGOV: revisa las fechas Desde / Hasta'; end if;
  select * into p from public.profiles where id = p_profile;
  if not found or not exists (select 1 from public.service_members where service_id = c.service_id and profile_id = p_profile) then
    raise exception 'SIGOV: la persona no pertenece al personal del contrato';
  end if;
  select cr.name into v_otro from public.crew_members m join public.crews cr on cr.id = m.crew_id
   where m.profile_id = p_profile and cr.service_id = c.service_id and cr.deleted_at is null and m.crew_id <> p_crew
     and daterange(coalesce(m.desde, '-infinity'::date), coalesce(m.hasta, 'infinity'::date), '[]') && daterange(p_desde, coalesce(p_hasta, 'infinity'::date), '[]')
     and (m.is_active or m.hasta is not null)
   limit 1;
  if v_otro is not null then raise exception 'SIGOV: % ya integra % en esas fechas (asignación superpuesta)', p.full_name, v_otro; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  insert into public.crew_members (crew_id, profile_id, full_name, dni, position, is_active, desde, hasta, motivo)
  values (p_crew, p_profile, p.full_name, p.dni, p.position, p_hasta is null or p_hasta >= public.hoy_peru(), p_desde, p_hasta, trim(p_motivo))
  returning id into v_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('id', v_id);
end $$;
grant execute on function public.integrante_agregar(uuid, uuid, date, date, text) to authenticated;

create or replace function public.integrante_vigencia(p_id uuid, p_desde date, p_hasta date, p_motivo text, p_finalizar boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare m public.crew_members; c public.crews;
begin
  select * into m from public.crew_members where id = p_id for update;
  if not found then raise exception 'SIGOV: el integrante no existe'; end if;
  select * into c from public.crews where id = m.crew_id;
  if not public.es_admin(c.service_id) then raise exception 'SIGOV: solo el Administrador gestiona integrantes' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo'; end if;
  if p_finalizar and p_hasta is null then p_hasta := public.hoy_peru(); end if;
  if coalesce(p_desde, m.desde) is not null and p_hasta is not null and p_hasta < coalesce(p_desde, m.desde) then
    raise exception 'SIGOV: Hasta no puede ser anterior a Desde';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.crew_members set desde = coalesce(p_desde, desde), hasta = p_hasta,
         is_active = not p_finalizar and (p_hasta is null or p_hasta >= public.hoy_peru()), motivo = trim(p_motivo)
   where id = p_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
grant execute on function public.integrante_vigencia(uuid, date, date, text, boolean) to authenticated;

/** Historial de la cuadrilla: altas, vigencias, jefe, supervisor y sectores, con actor y motivo. Solo lectura. */
create or replace function public.cuadrilla_historial(p_crew uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  with c as (select * from public.crews where id = p_crew and public.is_member(service_id)),
  ev as (
    select a.created_at cuando, coalesce(split_part(a.actor_email, '@', 1), 'sistema') actor, a.table_name, a.action, a.motivo,
           a.before_data, a.after_data, a.id
      from public.audit_log a, c
     where ((a.table_name = 'crews' and a.record_id = c.id)
        or (a.table_name = 'crew_members' and coalesce(a.after_data->>'crew_id', a.before_data->>'crew_id') = c.id::text))
       -- los ajustes de sistema sin actor (cargas iniciales) no son cambios de gestión; siguen en la bitácora
       and not (a.actor_id is null and a.action = 'UPDATE')
  )
  select coalesce(json_agg(y.x order by (y.x->>'cuando')::timestamptz desc), '[]'::json) from (
    select json_build_object(
      'id', ev.id, 'cuando', ev.cuando, 'actor', ev.actor, 'motivo', ev.motivo,
      'accion', case
        when ev.table_name = 'crews' and ev.action = 'INSERT' then 'Creación de cuadrilla'
        when ev.table_name = 'crews' and ev.before_data->>'leader_id' is distinct from ev.after_data->>'leader_id' then 'Reasignación de jefe'
        when ev.table_name = 'crews' and ev.before_data->'sectores' is distinct from ev.after_data->'sectores' then 'Cambio de sector'
        when ev.table_name = 'crews' and (ev.before_data->>'vigencia_desde', ev.before_data->>'vigencia_hasta') is distinct from (ev.after_data->>'vigencia_desde', ev.after_data->>'vigencia_hasta') then 'Cambio de vigencia de cuadrilla'
        when ev.table_name = 'crews' then 'Actualización de cuadrilla'
        when ev.action = 'INSERT' then 'Alta de integrante'
        when ev.action = 'DELETE' then 'Baja de integrante'
        when (ev.before_data->>'is_active')::boolean and not (ev.after_data->>'is_active')::boolean then 'Finalización de integrante'
        else 'Cambio de vigencia' end,
      'entidad', case when ev.table_name = 'crews' then (select name from c) else (select name from c) || ' · ' || coalesce(ev.after_data->>'full_name', ev.before_data->>'full_name') end,
      'antes', case when ev.table_name = 'crew_members' then json_build_object('desde', ev.before_data->>'desde', 'hasta', ev.before_data->>'hasta')
                    else json_build_object('jefe', (select full_name from public.profiles where id = (ev.before_data->>'leader_id')::uuid), 'sectores', ev.before_data->'sectores',
                                           'desde', ev.before_data->>'vigencia_desde', 'hasta', ev.before_data->>'vigencia_hasta') end,
      'despues', case when ev.table_name = 'crew_members' then json_build_object('desde', ev.after_data->>'desde', 'hasta', ev.after_data->>'hasta')
                      else json_build_object('jefe', (select full_name from public.profiles where id = (ev.after_data->>'leader_id')::uuid), 'sectores', ev.after_data->'sectores',
                                             'desde', ev.after_data->>'vigencia_desde', 'hasta', ev.after_data->>'vigencia_hasta') end) x
      from ev
    union all
    select json_build_object('id', s.id, 'cuando', s.at, 'actor', coalesce((select split_part(email, '@', 1) from public.profiles where id = s.por), 'sistema'),
             'motivo', s.motivo, 'accion', 'Cambio de supervisor', 'entidad', (select name from c),
             'antes', json_build_object('supervisor', (select full_name from public.profiles where id = s.supervisor_anterior)),
             'despues', json_build_object('supervisor', (select full_name from public.profiles where id = s.supervisor_nuevo)))
      from public.crew_supervisores s, c where s.crew_id = c.id
  ) y(x)
$$;
grant execute on function public.cuadrilla_historial(uuid) to authenticated;

-- ─── Catálogo oficial ─────────────────────────────────────────────────────
alter table public.activities_catalog
  add column if not exists oficial boolean not null default false,
  add column if not exists fuente text,
  add column if not exists metodo text not null default 'Manual';
update public.activities_catalog set oficial = true, fuente = coalesce(fuente, 'Anexo 7') where numero_covinca is not null and not oficial;

create or replace function public.t_actividad_oficial()
returns trigger language plpgsql as $$
begin
  if old.oficial and (new.code is distinct from old.code or new.name is distinct from old.name or not new.oficial) then
    raise exception 'SIGOV: los códigos oficiales y su descripción no se alteran';
  end if;
  return new;
end $$;
drop trigger if exists t_actividad_oficial on public.activities_catalog;
create trigger t_actividad_oficial before update on public.activities_catalog for each row execute function public.t_actividad_oficial();

create or replace function public.actividad_guardar(p_id uuid, p_fuente text, p_unit uuid, p_metodo text, p_activa boolean, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare a public.activities_catalog;
begin
  select * into a from public.activities_catalog where id = p_id for update;
  if not found then raise exception 'SIGOV: la actividad no existe'; end if;
  if not public.es_admin(a.service_id) then raise exception 'SIGOV: solo el Administrador edita el catálogo' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.activities_catalog set fuente = nullif(trim(p_fuente), ''), unit_id = coalesce(p_unit, unit_id), metodo = coalesce(nullif(trim(p_metodo), ''), metodo),
         is_active = coalesce(p_activa, is_active), updated_at = now()
   where id = p_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
grant execute on function public.actividad_guardar(uuid, text, uuid, text, boolean, text) to authenticated;

/** Historial de un registro auditado (actividad, unidad…), solo lectura. */
create or replace function public.registro_historial(p_tabla text, p_id uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(json_build_object('cuando', a.created_at, 'actor', coalesce(split_part(a.actor_email, '@', 1), 'sistema'), 'accion', a.action,
           'motivo', a.motivo, 'antes', a.before_data, 'despues', a.after_data) order by a.created_at desc), '[]'::json)
    from public.audit_log a
   where a.table_name = p_tabla and a.record_id = p_id and (public.es_admin(a.service_id) or public.is_platform_admin())
$$;
grant execute on function public.registro_historial(text, uuid) to authenticated;

-- ─── Unidades del contrato ────────────────────────────────────────────────
drop policy if exists units_write_admin on public.units;
create policy units_write_admin on public.units for all to authenticated
  using (service_id is not null and public.es_admin(service_id)) with check (service_id is not null and public.es_admin(service_id));

-- ─── Reglas de evidencia por contrato ─────────────────────────────────────
create or replace function public.reglas_evidencia_guardar(p_service uuid, p_reglas jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k text;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  for k in select jsonb_object_keys(p_reglas) loop
    if k not in ('fecha_hora', 'gps', 'sello', 'ats', 'charla', 'checklist') then raise exception 'SIGOV: regla desconocida %', k; end if;
    if p_reglas->>k not in ('obligatoria', 'opcional', 'minimo_1') then raise exception 'SIGOV: valor no válido para %', k; end if;
  end loop;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.services set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('evidencias', p_reglas), updated_at = now() where id = p_service;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
grant execute on function public.reglas_evidencia_guardar(uuid, jsonb, text) to authenticated;

-- ─── Permisos por rol: «Ver» por módulo ───────────────────────────────────
create table if not exists public.permisos_rol (
  service_id uuid not null references public.services(id) on delete cascade,
  rol public.user_role not null,
  modulo text not null,
  ver boolean not null,
  version integer not null default 1,
  actualizado_por uuid references public.profiles(id),
  actualizado_at timestamptz not null default now(),
  primary key (service_id, rol, modulo)
);
create table if not exists public.permisos_cambios (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  rol public.user_role not null,
  cambios jsonb not null,
  motivo text not null,
  version integer not null,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);
alter table public.permisos_rol enable row level security;
alter table public.permisos_cambios enable row level security;
drop policy if exists permisos_rol_select on public.permisos_rol;
create policy permisos_rol_select on public.permisos_rol for select to authenticated using (public.is_member(service_id));
drop policy if exists permisos_cambios_select on public.permisos_cambios;
create policy permisos_cambios_select on public.permisos_cambios for select to authenticated using (public.es_admin(service_id));
grant select on public.permisos_rol, public.permisos_cambios to authenticated;

create or replace function public.permisos_guardar(p_service uuid, p_rol public.user_role, p_cambios jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k text; v_ver int;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador cambia permisos' using errcode = '42501'; end if;
  if p_rol = 'admin' then raise exception 'SIGOV: los permisos del Administrador no se recortan desde aquí'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el motivo del cambio es obligatorio'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.permisos_cambios where service_id = p_service;
  for k in select jsonb_object_keys(p_cambios) loop
    insert into public.permisos_rol (service_id, rol, modulo, ver, version, actualizado_por)
    values (p_service, p_rol, k, (p_cambios->>k)::boolean, v_ver, auth.uid())
    on conflict (service_id, rol, modulo) do update set ver = excluded.ver, version = v_ver, actualizado_por = auth.uid(), actualizado_at = now();
  end loop;
  insert into public.permisos_cambios (service_id, rol, cambios, motivo, version, quien) values (p_service, p_rol, p_cambios, trim(p_motivo), v_ver, auth.uid());
  return json_build_object('version', v_ver);
end $$;
grant execute on function public.permisos_guardar(uuid, public.user_role, jsonb, text) to authenticated;

-- ─── Usuarios del contrato (estado, último ingreso, cuadrilla) ────────────
create or replace function public.usuarios_contrato(p_service uuid)
returns json language sql stable security definer set search_path to 'public', 'auth' as $$
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'nombre', p.full_name, 'email', p.email, 'rol', m.role, 'dni', p.dni, 'telefono', p.phone, 'cargo', p.position,
           'activo', p.is_active, 'ultimo_ingreso', u.last_sign_in_at, 'creado', u.created_at,
           'bloqueado', coalesce(u.banned_until > now(), false) and p.is_active,
           'estado', case when not p.is_active then 'inactivo' when coalesce(u.banned_until > now(), false) then 'bloqueado'
                          when u.last_sign_in_at is null then 'pendiente' else 'activo' end,
           'cuadrilla', (select string_agg(c.name, ', ') from public.crews c where c.service_id = p_service and c.deleted_at is null
                          and (c.leader_id = p.id or c.supervisor_id = p.id or exists (select 1 from public.crew_members cm where cm.crew_id = c.id and cm.profile_id = p.id and cm.is_active))))
         order by p.full_name), '[]'::json)
    from public.service_members m
    join public.profiles p on p.id = m.profile_id
    left join auth.users u on u.id = p.id
   where m.service_id = p_service and public.es_admin(p_service)
$$;
grant execute on function public.usuarios_contrato(uuid) to authenticated;

-- Sectores iniciales de cada cuadrilla: los de su tramo (luego se ajustan en Gestión › Cuadrillas)
update public.crews c set sectores = coalesce((select array_agg(s.code order by s.orden) from public.service_sectors s
                                              where s.service_id = c.service_id and s.section_id = c.section_id), '{}')
 where coalesce(cardinality(c.sectores), 0) = 0 and c.section_id is not null;
