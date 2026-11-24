-- ═══════════════════════════════════════════════════════════════════════════
-- 0150 · Gestión de sincronización de registros (revisión visual 18/11,
-- ADMIN_Sincronizacion_*_V2; guía 3.7 y 4.14)
--
-- · sync_dispositivos: el latido de cada equipo (app Android y web): último
--   contacto, última confirmación, registros y fotos en cola, errores y
--   versión de la app. «Sin conexión» no es error: es su propio estado.
-- · sync_reintentos: «Reintentar seleccionados». El equipo lo recibe en su
--   próximo latido y vuelve a empujar su cola; repetir el pedido no duplica
--   nada (la nube actualiza por client_id).
-- · sync_conflictos: si un celular manda un cambio de un avance que otra
--   persona modificó después de su último envío, NO se sobrescribe: queda
--   el conflicto con la versión local y la del servidor para «Comparar
--   versiones» y decidir («No sobrescribir» o aplicar la del dispositivo
--   con motivo). Nunca se borran pendientes.
-- · sincronizacion_dispositivos: la consulta del panel con el alcance del rol
--   (Supervisor: sus cuadrillas; Residente y Administrador: el contrato).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Estado por equipo ─────────────────────────────────────────────────────
create table if not exists public.sync_dispositivos (
  service_id uuid not null references public.services(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  device_label text,
  plataforma text not null default 'android' check (plataforma in ('android', 'web')),
  app_version text,
  ultimo_contacto timestamptz not null default now(),
  ultima_confirmacion timestamptz,
  registros_pendientes integer not null default 0,
  fotos_pendientes integer not null default 0,
  errores integer not null default 0,
  ultimo_error text,
  primary key (service_id, profile_id, device_id)
);
alter table public.sync_dispositivos enable row level security;
grant select on public.sync_dispositivos to authenticated;

create table if not exists public.sync_reintentos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  solicitado_por uuid not null references public.profiles(id),
  solicitado_at timestamptz not null default now(),
  atendido_at timestamptz
);
create unique index if not exists sync_reintentos_pendiente on public.sync_reintentos (service_id, profile_id, device_id) where atendido_at is null;
alter table public.sync_reintentos enable row level security;
drop policy if exists sync_reintentos_select on public.sync_reintentos;
create policy sync_reintentos_select on public.sync_reintentos for select to authenticated
  using (profile_id = auth.uid() or public.role_in(service_id) in ('admin', 'residente', 'supervisor'));
grant select on public.sync_reintentos to authenticated;

-- ── Conflictos de versión ─────────────────────────────────────────────────
create table if not exists public.sync_conflictos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  tabla text not null,
  registro_id uuid not null,
  referencia text,
  crew_id uuid references public.crews(id),
  profile_id uuid references public.profiles(id),
  device_id text,
  version_local integer,
  version_servidor integer,
  campos text[] not null default '{}',
  datos_local jsonb not null,
  datos_servidor jsonb not null,
  servidor_por uuid references public.profiles(id),
  servidor_at timestamptz,
  carga_at timestamptz not null default now(),
  intentos integer not null default 1,
  estado text not null default 'abierto' check (estado in ('abierto', 'no_sobrescrito', 'aplicado')),
  resuelto_por uuid references public.profiles(id),
  resuelto_at timestamptz,
  motivo text
);
create unique index if not exists sync_conflictos_abierto on public.sync_conflictos (tabla, registro_id) where estado = 'abierto';
alter table public.sync_conflictos enable row level security;
drop policy if exists sync_conflictos_select on public.sync_conflictos;
create policy sync_conflictos_select on public.sync_conflictos for select to authenticated
  using (profile_id = auth.uid() or public.role_in(service_id) in ('admin', 'residente')
         or (public.role_in(service_id) = 'supervisor' and crew_id = any(coalesce(public.mis_cuadrillas(service_id), '{}'::uuid[]))));
grant select on public.sync_conflictos to authenticated;

-- ── Versión de los avances ────────────────────────────────────────────────
alter table public.work_entries
  add column if not exists version integer not null default 1,
  add column if not exists editado_por uuid references public.profiles(id),
  add column if not exists editado_at timestamptz,
  add column if not exists version_dispositivo integer;
comment on column public.work_entries.version is 'Versión del avance: sube con cada cambio de sus datos.';
comment on column public.work_entries.version_dispositivo is 'La última versión que escribió el equipo de campo (la «versión local» de un conflicto).';

create or replace function public.t_avance_version_alta()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.version := 1;
  new.editado_por := coalesce(auth.uid(), new.created_by);
  new.editado_at := now();
  if new.client_id is not null and public.role_in(new.service_id) = 'jefe_cuadrilla' then new.version_dispositivo := 1; end if;
  return new;
end $$;
drop trigger if exists t_avance_version_alta on public.work_entries;
create trigger t_avance_version_alta before insert on public.work_entries
  for each row execute function public.t_avance_version_alta();

create or replace function public.avance_datos(w public.work_entries)
returns jsonb language sql immutable as $$
  select jsonb_build_object('quantity', w.quantity, 'prog_start_m', w.prog_start_m, 'prog_end_m', w.prog_end_m, 'side', w.side,
    'section_id', w.section_id, 'observation', w.observation, 'hora_inicio', w.hora_inicio, 'hora_fin', w.hora_fin,
    'personas', w.personas, 'longitud_m', w.longitud_m, 'ancho_m', w.ancho_m, 'espesor_m', w.espesor_m,
    'activity_id', w.activity_id, 'exceso_motivo', w.exceso_motivo, 'deleted_at', w.deleted_at)
$$;

create or replace function public.t_avance_conflicto()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  a jsonb := public.avance_datos(new);
  b jsonb := public.avance_datos(old);
  v_campos text[];
  o public.work_orders;
  v_ref text;
  v_id uuid;
  v_campo boolean;
begin
  if a = b then return new; end if;
  -- Resolución autorizada de un conflicto: se aplica y sube la versión
  if current_setting('sigov.resolviendo', true) = '1' then
    new.version := old.version + 1; new.editado_por := coalesce(v_uid, old.editado_por); new.editado_at := now();
    return new;
  end if;
  if v_uid is null then return new; end if;
  -- El equipo de campo (un jefe de cuadrilla, desde su celular) escribe sobre el cambio de otra persona
  v_campo := new.client_id is not null and public.role_in(old.service_id) = 'jefe_cuadrilla';
  if v_campo and old.editado_por is not null and old.editado_por <> v_uid then
    select array_agg(k order by k) into v_campos from jsonb_object_keys(a) k where a->k is distinct from b->k;
    select * into o from public.work_orders where id = old.work_order_id;
    select to_char(o.work_date, 'DD/MM/YYYY') || ' · ' || coalesce(c.code, c.name, '') || ' · ' || coalesce(ac.name, '')
      into v_ref from public.crews c, public.activities_catalog ac where c.id = o.crew_id and ac.id = old.activity_id;
    insert into public.sync_conflictos (service_id, tabla, registro_id, referencia, crew_id, profile_id, device_id,
                                        version_local, version_servidor, campos, datos_local, datos_servidor, servidor_por, servidor_at)
    values (old.service_id, 'work_entries', old.id, v_ref, o.crew_id, v_uid, new.dispositivo,
            coalesce(old.version_dispositivo, 1), old.version, coalesce(v_campos, '{}'), a, b, old.editado_por, old.editado_at)
    on conflict (tabla, registro_id) where estado = 'abierto'
      do update set datos_local = excluded.datos_local, campos = excluded.campos, carga_at = now(),
                    intentos = public.sync_conflictos.intentos + 1
    returning id into v_id;
    perform public.aviso_vivo(old.service_id, v_uid, 'sync_conflicto', v_id::text,
      'Tu cambio quedó en conflicto', 'El avance ' || coalesce(v_ref, '') || ' lo había modificado otra persona. No se sobrescribió; lo revisa el supervisor.',
      '/sincronizacion', 'warning', jsonb_build_object('conflicto', v_id));
    perform public.aviso_vivo(old.service_id, c.supervisor_id, 'sync_conflicto', v_id::text,
      'Conflicto de versiones por resolver', coalesce(v_ref, '') || ': versión local ' || coalesce(old.version_dispositivo, 1) || ' · servidor ' || old.version,
      '/sincronizacion', 'warning', jsonb_build_object('conflicto', v_id))
      from public.crews c where c.id = o.crew_id;
    return old;   -- no se sobrescribe
  end if;
  new.version := old.version + 1;
  new.editado_por := v_uid;
  new.editado_at := now();
  if v_campo then new.version_dispositivo := new.version; end if;
  return new;
end $$;
drop trigger if exists t_avance_conflicto on public.work_entries;
create trigger t_avance_conflicto before update on public.work_entries
  for each row execute function public.t_avance_conflicto();

-- ── Latido del equipo ─────────────────────────────────────────────────────
create or replace function public.sync_latido(
  p_service uuid, p_device text, p_label text default null, p_plataforma text default 'android', p_version text default null,
  p_pendientes integer default 0, p_fotos integer default 0, p_errores integer default 0, p_ultimo_error text default null,
  p_confirmado_at timestamptz default null, p_enviados integer default 0, p_fallidos integer default 0)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_reintentar boolean := false;
begin
  if v_uid is null or not public.is_member(p_service) then raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501'; end if;
  if public.role_in(p_service) = 'visor' then return json_build_object('reintentar', false); end if;
  insert into public.sync_dispositivos (service_id, profile_id, device_id, device_label, plataforma, app_version, ultimo_contacto,
                                        ultima_confirmacion, registros_pendientes, fotos_pendientes, errores, ultimo_error)
  values (p_service, v_uid, p_device, p_label, coalesce(p_plataforma, 'android'), p_version, now(), p_confirmado_at,
          greatest(coalesce(p_pendientes, 0), 0), greatest(coalesce(p_fotos, 0), 0), greatest(coalesce(p_errores, 0), 0), nullif(trim(p_ultimo_error), ''))
  on conflict (service_id, profile_id, device_id) do update set
    device_label = coalesce(excluded.device_label, sync_dispositivos.device_label), plataforma = excluded.plataforma,
    app_version = coalesce(excluded.app_version, sync_dispositivos.app_version), ultimo_contacto = now(),
    ultima_confirmacion = greatest(excluded.ultima_confirmacion, sync_dispositivos.ultima_confirmacion),
    registros_pendientes = excluded.registros_pendientes, fotos_pendientes = excluded.fotos_pendientes,
    errores = excluded.errores, ultimo_error = excluded.ultimo_error;
  if coalesce(p_enviados, 0) > 0 or coalesce(p_fallidos, 0) > 0 then
    insert into public.sync_sessions (profile_id, service_id, device_id, device_label, pushed_count, failed_count, finished_at)
    values (v_uid, p_service, p_device, p_label, coalesce(p_enviados, 0), coalesce(p_fallidos, 0), now());
  end if;
  update public.sync_reintentos set atendido_at = now()
   where service_id = p_service and profile_id = v_uid and device_id = p_device and atendido_at is null
  returning true into v_reintentar;
  return json_build_object('reintentar', coalesce(v_reintentar, false),
    'conflictos', (select count(*) from public.sync_conflictos where profile_id = v_uid and service_id = p_service and estado = 'abierto'));
end $$;
revoke all on function public.sync_latido(uuid, text, text, text, text, integer, integer, integer, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.sync_latido(uuid, text, text, text, text, integer, integer, integer, text, timestamptz, integer, integer) to authenticated;

-- ── Quién gestiona la sincronización de quién ─────────────────────────────
-- La cuadrilla de una persona: la que lidera o en la que está activa (cuentas compartidas incluidas)
create or replace function public.cuadrilla_de(p_service uuid, p_profile uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select c.id from public.crews c
   where c.service_id = p_service and c.deleted_at is null
     and (c.leader_id = p_profile or exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id = p_profile and m.is_active))
   order by (c.leader_id = p_profile) desc, c.code limit 1
$$;
create or replace function public.gestiona_sync_de(p_service uuid, p_profile uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case public.role_in(p_service)
           when 'admin' then true when 'residente' then true
           when 'supervisor' then public.cuadrilla_de(p_service, p_profile) = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[]))
           else false end
$$;

create or replace function public.sync_reintentar(p_service uuid, p_equipos jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare e jsonb; n int := 0; ya int := 0; v_ok boolean;
begin
  for e in select * from jsonb_array_elements(coalesce(p_equipos, '[]'::jsonb)) loop
    if not public.gestiona_sync_de(p_service, (e->>'profile_id')::uuid) then
      raise exception 'SIGOV: no gestionas la sincronización de ese equipo' using errcode = '42501';
    end if;
    insert into public.sync_reintentos (service_id, profile_id, device_id, solicitado_por)
    values (p_service, (e->>'profile_id')::uuid, e->>'device_id', auth.uid())
    on conflict (service_id, profile_id, device_id) where atendido_at is null do nothing
    returning true into v_ok;
    if v_ok then n := n + 1; else ya := ya + 1; end if;
    v_ok := null;
  end loop;
  return json_build_object('solicitados', n, 'ya_pendientes', ya);
end $$;
drop policy if exists sync_dispositivos_select on public.sync_dispositivos;
create policy sync_dispositivos_select on public.sync_dispositivos for select to authenticated
  using (profile_id = auth.uid() or public.gestiona_sync_de(service_id, profile_id));

revoke all on function public.sync_reintentar(uuid, jsonb) from public, anon;
grant execute on function public.sync_reintentar(uuid, jsonb) to authenticated;

create or replace function public.sync_conflicto_resolver(p_id uuid, p_accion text, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k public.sync_conflictos; v_rol text;
begin
  select * into k from public.sync_conflictos where id = p_id for update;
  if not found then raise exception 'SIGOV: el conflicto no existe'; end if;
  if k.estado <> 'abierto' then raise exception 'SIGOV: ese conflicto ya se resolvió'; end if;
  v_rol := public.role_in(k.service_id)::text;
  if not (v_rol in ('admin', 'residente') or (v_rol = 'supervisor' and k.crew_id = any(coalesce(public.mis_cuadrillas(k.service_id), '{}'::uuid[])))) then
    raise exception 'SIGOV: resuelve el conflicto el supervisor de la cuadrilla, el residente o el administrador' using errcode = '42501';
  end if;
  if p_accion = 'no_sobrescribir' then
    update public.sync_conflictos set estado = 'no_sobrescrito', resuelto_por = auth.uid(), resuelto_at = now(), motivo = nullif(trim(p_motivo), '') where id = p_id;
  elsif p_accion = 'aplicar' then
    if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo para aplicar la versión del dispositivo'; end if;
    perform set_config('sigov.resolviendo', '1', true);
    perform set_config('sigov.motivo', trim(p_motivo), true);
    update public.work_entries w set
      quantity = (k.datos_local->>'quantity')::numeric, prog_start_m = (k.datos_local->>'prog_start_m')::numeric,
      prog_end_m = (k.datos_local->>'prog_end_m')::numeric, side = coalesce(k.datos_local->>'side', w.side::text)::public.road_side,
      section_id = (k.datos_local->>'section_id')::uuid, observation = k.datos_local->>'observation',
      hora_inicio = (k.datos_local->>'hora_inicio')::time, hora_fin = (k.datos_local->>'hora_fin')::time,
      personas = (k.datos_local->>'personas')::integer, longitud_m = (k.datos_local->>'longitud_m')::numeric,
      ancho_m = (k.datos_local->>'ancho_m')::numeric, espesor_m = (k.datos_local->>'espesor_m')::numeric,
      exceso_motivo = k.datos_local->>'exceso_motivo'
     where w.id = k.registro_id;
    perform set_config('sigov.resolviendo', '', true);
    perform set_config('sigov.motivo', '', true);
    update public.sync_conflictos set estado = 'aplicado', resuelto_por = auth.uid(), resuelto_at = now(), motivo = trim(p_motivo) where id = p_id;
  else
    raise exception 'SIGOV: acción no válida';
  end if;
  perform public.aviso_resolver(k.profile_id, 'sync_conflicto', k.id::text);
  perform public.aviso_resolver(c.supervisor_id, 'sync_conflicto', k.id::text) from public.crews c where c.id = k.crew_id;
  perform public.aviso_vivo(k.service_id, k.profile_id, 'sync_conflicto_resuelto', k.id::text,
    case p_accion when 'aplicar' then 'Se aplicó tu versión' else 'Se conservó la versión del servidor' end,
    coalesce(k.referencia, '') || coalesce(' · ' || nullif(trim(p_motivo), ''), ''), '/sincronizacion', 'info', jsonb_build_object('conflicto', k.id));
  return json_build_object('ok', true);
end $$;
revoke all on function public.sync_conflicto_resolver(uuid, text, text) from public, anon;
grant execute on function public.sync_conflicto_resolver(uuid, text, text) to authenticated;

-- ── El panel de sincronización ────────────────────────────────────────────
create or replace function public.sincronizacion_dispositivos(p_service uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_rol text := public.role_in(p_service)::text; v_res json;
begin
  if v_rol is null or v_rol not in ('admin', 'residente', 'supervisor') then
    raise exception 'SIGOV: sin acceso a la sincronización del contrato' using errcode = '42501';
  end if;
  with personas as (
    select m.profile_id, m.role::text rol, p.full_name, p.email, c.id crew_id, c.code crew_code, c.name crew_name
      from public.service_members m join public.profiles p on p.id = m.profile_id
      left join public.crews c on c.id = public.cuadrilla_de(p_service, m.profile_id)
     where m.service_id = p_service and m.role <> 'visor' and public.gestiona_sync_de(p_service, m.profile_id)
  ), equipos as (
    select d.profile_id, d.device_id, d.device_label, d.plataforma, d.app_version, d.ultimo_contacto, d.ultima_confirmacion,
           d.registros_pendientes, d.fotos_pendientes, d.errores, d.ultimo_error, true latido
      from public.sync_dispositivos d where d.service_id = p_service and d.profile_id in (select profile_id from personas)
    union all
    -- Equipos que solo dejaron sesiones (versiones anteriores de la app o la web)
    select s.profile_id, s.device_id, max(s.device_label), case when s.device_id like 'DEV-%' then 'web' else 'android' end, null,
           max(coalesce(s.finished_at, s.started_at)), max(s.finished_at) filter (where s.failed_count = 0), 0, 0,
           (array_agg(s.failed_count order by s.started_at desc))[1], null, false
      from public.sync_sessions s
     where s.service_id = p_service and s.started_at > now() - interval '30 days' and s.profile_id in (select profile_id from personas)
       and not exists (select 1 from public.sync_dispositivos d where d.service_id = p_service and d.profile_id = s.profile_id and d.device_id = s.device_id)
     group by s.profile_id, s.device_id
  ), filas as (
    select e.*, pe.full_name, pe.email, pe.rol, pe.crew_id, pe.crew_code, pe.crew_name,
           (select count(*) from public.sync_conflictos k where k.service_id = p_service and k.profile_id = e.profile_id
              and coalesce(k.device_id, e.device_id) = e.device_id and k.estado = 'abierto') conflictos,
           exists (select 1 from public.sync_reintentos r where r.service_id = p_service and r.profile_id = e.profile_id
                     and r.device_id = e.device_id and r.atendido_at is null) reintento_pendiente
      from equipos e join personas pe on pe.profile_id = e.profile_id
  ), con_estado as (
    select f.*, case when f.conflictos > 0 then 'conflicto'
                     when f.ultimo_contacto < now() - interval '24 hours' then 'sin_conexion'
                     when f.errores > 0 then 'error'
                     when f.registros_pendientes + f.fotos_pendientes > 0 then 'en_cola'
                     else 'confirmado' end estado
      from filas f
  )
  select json_build_object(
    'dispositivos', (select coalesce(json_agg(json_build_object(
        'profile_id', x.profile_id, 'nombre', x.full_name, 'usuario', split_part(x.email, '@', 1), 'rol', x.rol,
        'crew_id', x.crew_id, 'crew_code', x.crew_code, 'crew_name', x.crew_name,
        'device_id', x.device_id, 'device_label', x.device_label, 'plataforma', x.plataforma, 'app_version', x.app_version,
        'ultimo_contacto', x.ultimo_contacto, 'ultima_confirmacion', x.ultima_confirmacion,
        'registros', x.registros_pendientes, 'fotos', x.fotos_pendientes, 'errores', x.errores, 'ultimo_error', x.ultimo_error,
        'conflictos', x.conflictos, 'reintento_pendiente', x.reintento_pendiente, 'latido', x.latido, 'estado', x.estado)
        order by x.crew_code nulls last, x.full_name, x.ultimo_contacto desc), '[]'::json) from con_estado x),
    'resumen', (select json_build_object(
        'confirmados', count(*) filter (where estado = 'confirmado'), 'en_cola', count(*) filter (where estado = 'en_cola'),
        'error', count(*) filter (where estado = 'error'), 'conflicto', count(*) filter (where estado = 'conflicto'),
        'sin_conexion', count(*) filter (where estado = 'sin_conexion')) from con_estado),
    'conflictos', (select coalesce(json_agg(json_build_object(
        'id', k.id, 'tabla', k.tabla, 'registro_id', k.registro_id, 'referencia', k.referencia, 'profile_id', k.profile_id,
        'device_id', k.device_id, 'crew_id', k.crew_id, 'version_local', k.version_local, 'version_servidor', k.version_servidor,
        'campos', k.campos, 'datos_local', k.datos_local, 'datos_servidor', k.datos_servidor,
        'servidor_por', (select split_part(p.email, '@', 1) from public.profiles p where p.id = k.servidor_por), 'servidor_at', k.servidor_at,
        'carga_at', k.carga_at, 'intentos', k.intentos, 'estado', k.estado, 'motivo', k.motivo, 'resuelto_at', k.resuelto_at,
        'resuelto_por', (select split_part(p.email, '@', 1) from public.profiles p where p.id = k.resuelto_por))
        order by k.estado = 'abierto' desc, k.carga_at desc), '[]'::json)
        from public.sync_conflictos k where k.service_id = p_service and public.gestiona_sync_de(p_service, k.profile_id)
          and (k.estado = 'abierto' or k.resuelto_at > now() - interval '30 days')),
    'sesiones', (select coalesce(json_agg(json_build_object('profile_id', s.profile_id, 'device_id', s.device_id, 'at', coalesce(s.finished_at, s.started_at),
        'enviados', s.pushed_count, 'recibidos', s.pulled_count, 'fallidos', s.failed_count) order by s.started_at desc), '[]'::json)
        from (select * from public.sync_sessions s where s.service_id = p_service and s.started_at > now() - interval '7 days'
                and public.gestiona_sync_de(p_service, s.profile_id) order by s.started_at desc limit 300) s),
    'reintentos', (select coalesce(json_agg(json_build_object('profile_id', r.profile_id, 'device_id', r.device_id, 'solicitado_at', r.solicitado_at,
        'atendido_at', r.atendido_at, 'por', (select split_part(p.email, '@', 1) from public.profiles p where p.id = r.solicitado_por)) order by r.solicitado_at desc), '[]'::json)
        from public.sync_reintentos r where r.service_id = p_service and r.solicitado_at > now() - interval '7 days' and public.gestiona_sync_de(p_service, r.profile_id)),
    'actualizado', now()
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.sincronizacion_dispositivos(uuid) from public, anon;
grant execute on function public.sincronizacion_dispositivos(uuid) to authenticated;
