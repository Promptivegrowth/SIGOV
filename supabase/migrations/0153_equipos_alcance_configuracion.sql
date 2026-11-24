-- ═══════════════════════════════════════════════════════════════════════════
-- 0153 · Equipos operativos, alcance editable y configuración versionada
-- (revisión visual 18/11: ADMIN_SUB_Recursos_Equipos, A01/A02 Roles,
-- guía funciones 16 y 17)
--
-- · equipos: equipos menores (hidrolavadora, desbrozadora, compactadora) con
--   serie, modelo, responsable, estado y mantenimiento. Sin control SOAT.
--   Las asignaciones suman HORAS de uso (2 h + 3 h = 5 h); la cantidad
--   física del equipo sigue siendo 1.
-- · alcance_supervisor_guardar: las cuadrillas asignadas a un supervisor,
--   desde Roles y permisos, con motivo (queda en la bitácora).
-- · config_versiones: Marca y formatos, Alertas y Exportación, cada cambio
--   como versión con motivo; la versión vigente es la última. Lo exportado
--   antes conserva el formato con que salió.
-- · alertas_sistema lee las reglas vigentes (anticipación, activo) y avisa
--   también mantenimiento de equipos y conflictos de sincronización.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Equipos ───────────────────────────────────────────────────────────────
create table if not exists public.equipos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo text not null default 'Equipo',
  serie text,
  modelo text,
  crew_id uuid references public.crews(id),
  responsable_id uuid references public.profiles(id),
  estado text not null default 'operativo' check (estado in ('operativo', 'no_operativo', 'mantenimiento')),
  mantenimiento_on date,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (service_id, codigo)
);
create table if not exists public.equipo_asignaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  crew_id uuid references public.crews(id),
  responsable_id uuid references public.profiles(id),
  desde date not null,
  hasta date,
  horas numeric(10, 2) not null default 0 check (horas >= 0),
  motivo text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) default auth.uid()
);
create index if not exists equipo_asignaciones_equipo on public.equipo_asignaciones (equipo_id, desde desc);
alter table public.equipos enable row level security;
alter table public.equipo_asignaciones enable row level security;
drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos for select to authenticated
  using (public.role_in(service_id) in ('admin', 'residente', 'supervisor', 'ing_seguridad') or (public.role_in(service_id) = 'jefe_cuadrilla' and crew_id = any(coalesce(public.mis_cuadrillas(service_id), '{}'::uuid[]))));
drop policy if exists equipo_asignaciones_select on public.equipo_asignaciones;
create policy equipo_asignaciones_select on public.equipo_asignaciones for select to authenticated
  using (public.role_in(service_id) in ('admin', 'residente', 'supervisor', 'ing_seguridad'));
grant select on public.equipos, public.equipo_asignaciones to authenticated;

do $$ begin
  drop trigger if exists audit_equipos on public.equipos;
  create trigger audit_equipos after insert or update or delete on public.equipos for each row execute function public.audit_trigger();
  drop trigger if exists audit_equipo_asignaciones on public.equipo_asignaciones;
  create trigger audit_equipo_asignaciones after insert or update or delete on public.equipo_asignaciones for each row execute function public.audit_trigger();
end $$;

create or replace function public.equipo_guardar(p_service uuid, p_id uuid, p_datos jsonb, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: los equipos los registra el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_datos->>'serie'), '') is null or nullif(trim(p_datos->>'modelo'), '') is null or nullif(p_datos->>'mantenimiento_on', '') is null then
    raise exception 'SIGOV: serie, modelo y mantenimiento son obligatorios';
  end if;
  perform set_config('sigov.motivo', coalesce(nullif(trim(p_motivo), ''), ''), true);
  if p_id is null then
    if nullif(trim(p_datos->>'codigo'), '') is null or nullif(trim(p_datos->>'nombre'), '') is null then raise exception 'SIGOV: código y nombre del equipo son obligatorios'; end if;
    insert into public.equipos (service_id, codigo, nombre, tipo, serie, modelo, crew_id, responsable_id, estado, mantenimiento_on, notas)
    values (p_service, upper(trim(p_datos->>'codigo')), trim(p_datos->>'nombre'), coalesce(nullif(trim(p_datos->>'tipo'), ''), 'Equipo'),
            trim(p_datos->>'serie'), trim(p_datos->>'modelo'), nullif(p_datos->>'crew_id', '')::uuid, nullif(p_datos->>'responsable_id', '')::uuid,
            coalesce(nullif(p_datos->>'estado', ''), 'operativo'), (p_datos->>'mantenimiento_on')::date, nullif(trim(p_datos->>'notas'), ''))
    returning id into v_id;
  else
    update public.equipos set
      nombre = coalesce(nullif(trim(p_datos->>'nombre'), ''), nombre), serie = trim(p_datos->>'serie'), modelo = trim(p_datos->>'modelo'),
      estado = coalesce(nullif(p_datos->>'estado', ''), estado), mantenimiento_on = (p_datos->>'mantenimiento_on')::date,
      responsable_id = case when p_datos ? 'responsable_id' then nullif(p_datos->>'responsable_id', '')::uuid else responsable_id end,
      notas = case when p_datos ? 'notas' then nullif(trim(p_datos->>'notas'), '') else notas end, updated_at = now()
     where id = p_id and service_id = p_service and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'SIGOV: el equipo no existe'; end if;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('id', v_id);
end $$;
revoke all on function public.equipo_guardar(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.equipo_guardar(uuid, uuid, jsonb, text) to authenticated;

-- Asignar: sin solapes de fechas con otra cuadrilla; las horas se suman al uso
create or replace function public.equipo_asignar(p_equipo uuid, p_crew uuid, p_responsable uuid, p_desde date, p_hasta date, p_horas numeric, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare e public.equipos; v_conf text; v_id uuid;
begin
  select * into e from public.equipos where id = p_equipo and deleted_at is null;
  if not found then raise exception 'SIGOV: el equipo no existe'; end if;
  if not public.es_admin(e.service_id) then raise exception 'SIGOV: las asignaciones las hace el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la asignación'; end if;
  if p_desde is null or (p_hasta is not null and p_hasta < p_desde) then raise exception 'SIGOV: revisa las fechas'; end if;
  if e.estado = 'no_operativo' then raise exception 'SIGOV: el equipo está no operativo; no se asigna'; end if;
  select c.name into v_conf from public.equipo_asignaciones a join public.crews c on c.id = a.crew_id
   where a.equipo_id = p_equipo and a.crew_id is distinct from p_crew
     and daterange(a.desde, coalesce(a.hasta, 'infinity'::date), '[]') && daterange(p_desde, coalesce(p_hasta, 'infinity'::date), '[]') limit 1;
  if v_conf is not null then raise exception 'SIGOV: el equipo ya está asignado a % en esas fechas (asignación en conflicto)', v_conf; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  insert into public.equipo_asignaciones (service_id, equipo_id, crew_id, responsable_id, desde, hasta, horas, motivo)
  values (e.service_id, p_equipo, p_crew, p_responsable, p_desde, p_hasta, coalesce(p_horas, 0), trim(p_motivo)) returning id into v_id;
  update public.equipos set crew_id = coalesce(p_crew, crew_id), responsable_id = coalesce(p_responsable, responsable_id), updated_at = now() where id = p_equipo;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('id', v_id);
end $$;
revoke all on function public.equipo_asignar(uuid, uuid, uuid, date, date, numeric, text) from public, anon;
grant execute on function public.equipo_asignar(uuid, uuid, uuid, date, date, numeric, text) to authenticated;

create or replace view public.v_equipos with (security_invoker = on) as
select e.*, c.code crew_code, c.name crew_name, p.full_name responsable_nombre, split_part(p.email, '@', 1) responsable_usuario,
       1 as cantidad_fisica,
       (select count(*) from public.equipo_asignaciones a where a.equipo_id = e.id) asignaciones,
       coalesce((select sum(a.horas) from public.equipo_asignaciones a where a.equipo_id = e.id), 0) uso_horas,
       (select coalesce(json_agg(a.horas order by a.desde), '[]'::json) from public.equipo_asignaciones a where a.equipo_id = e.id) horas_por_asignacion,
       case when e.mantenimiento_on is null then 'sin_fecha' when e.mantenimiento_on < public.hoy_peru() then 'vencido'
            when e.mantenimiento_on <= public.hoy_peru() + 15 then 'proximo' else 'vigente' end mantenimiento_estado
  from public.equipos e left join public.crews c on c.id = e.crew_id left join public.profiles p on p.id = e.responsable_id
 where e.deleted_at is null;
grant select on public.v_equipos to authenticated;

-- ── Alcance del supervisor (Roles y permisos) ─────────────────────────────
create or replace function public.alcance_supervisor_guardar(p_service uuid, p_supervisor uuid, p_crews uuid[], p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare n_add int; n_del int;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador cambia el alcance' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el motivo del cambio es obligatorio'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  if not exists (select 1 from public.service_members where service_id = p_service and profile_id = p_supervisor and role = 'supervisor') then
    raise exception 'SIGOV: esa cuenta no es supervisor de este contrato';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.crews set supervisor_id = null, updated_at = now()
   where service_id = p_service and supervisor_id = p_supervisor and deleted_at is null and not (id = any(coalesce(p_crews, '{}'::uuid[])));
  get diagnostics n_del = row_count;
  update public.crews set supervisor_id = p_supervisor, updated_at = now()
   where service_id = p_service and deleted_at is null and id = any(coalesce(p_crews, '{}'::uuid[])) and supervisor_id is distinct from p_supervisor;
  get diagnostics n_add = row_count;
  perform set_config('sigov.motivo', '', true);
  insert into public.permisos_cambios (service_id, rol, cambios, motivo, version, quien)
  values (p_service, 'supervisor', jsonb_build_object('alcance', jsonb_build_object('supervisor', p_supervisor, 'cuadrillas', to_jsonb(p_crews))),
          trim(p_motivo), (select coalesce(max(version), 0) + 1 from public.permisos_cambios where service_id = p_service), auth.uid());
  return json_build_object('agregadas', n_add, 'retiradas', n_del);
end $$;
revoke all on function public.alcance_supervisor_guardar(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.alcance_supervisor_guardar(uuid, uuid, uuid[], text) to authenticated;

-- ── Configuración versionada ──────────────────────────────────────────────
create table if not exists public.config_versiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  seccion text not null check (seccion in ('marca', 'alertas', 'exportacion')),
  version integer not null,
  datos jsonb not null,
  motivo text not null,
  quien uuid references public.profiles(id) default auth.uid(),
  cuando timestamptz not null default now(),
  unique (service_id, seccion, version)
);
alter table public.config_versiones enable row level security;
drop policy if exists config_versiones_select on public.config_versiones;
create policy config_versiones_select on public.config_versiones for select to authenticated
  using (public.is_member(service_id) and public.role_in(service_id) <> 'visor');
grant select on public.config_versiones to authenticated;

create or replace function public.config_vigente(p_service uuid, p_seccion text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select datos from public.config_versiones where service_id = p_service and seccion = p_seccion order by version desc limit 1
$$;
grant execute on function public.config_vigente(uuid, text) to authenticated;

create or replace function public.config_guardar(p_service uuid, p_seccion text, p_datos jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v int;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: la configuración la cambia el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  if p_seccion = 'exportacion' and (p_datos->'filtros_y_permisos') is not null then
    raise exception 'SIGOV: los filtros y permisos de la exportación no se desactivan desde Configuración';
  end if;
  if p_seccion = 'exportacion' and coalesce((p_datos->>'retencion_dias')::int, 30) not between 1 and 365 then
    raise exception 'SIGOV: la retención de copias temporales va de 1 a 365 días';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.config_versiones where service_id = p_service and seccion = p_seccion;
  insert into public.config_versiones (service_id, seccion, version, datos, motivo) values (p_service, p_seccion, v, p_datos, trim(p_motivo));
  return json_build_object('version', v);
end $$;
revoke all on function public.config_guardar(uuid, text, jsonb, text) from public, anon;
grant execute on function public.config_guardar(uuid, text, jsonb, text) to authenticated;

-- Copias temporales que vencen según la retención (los originales y la bitácora no se tocan)
alter table public.exportaciones drop constraint if exists exportaciones_estado_check;
alter table public.exportaciones add constraint exportaciones_estado_check check (estado in ('en_proceso', 'listo', 'error', 'cancelado', 'expirado'));

-- ── Alertas del sistema con reglas configurables ──────────────────────────
create or replace function public.alerta_regla(p_service uuid, p_evento text, p_campo text, p_defecto text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.config_vigente(p_service, 'alertas')->'reglas'->p_evento->>p_campo, p_defecto)
$$;

create or replace function public.alertas_sistema(p_service uuid)
returns json language sql stable security definer set search_path to 'public', 'auth' as $$
  with a as (
    select 'sync:' || s.profile_id || ':' || s.device_id clave, 'critica' severidad, 'Sincronización fallida' titulo,
           format('El equipo de %s no pudo enviar %s registros.', p.full_name, s.failed_count) descripcion, s.finished_at cuando, 'Sincronización' tipo,
           coalesce(s.device_label, s.device_id) referencia, 'Reintentar' accion, '/sincronizacion' url
      from (select distinct on (profile_id, device_id) * from public.sync_sessions where service_id = p_service
              and started_at > now() - make_interval(hours => public.alerta_regla(p_service, 'sync', 'horas', '48')::int)
             order by profile_id, device_id, started_at desc) s join public.profiles p on p.id = s.profile_id
     where s.failed_count > 0 and public.alerta_regla(p_service, 'sync', 'activo', 'true')::boolean
    union all
    select 'conf:' || k.id, 'critica', 'Conflicto de sincronización', format('%s: versión local %s frente a servidor %s; no se sobrescribió.', coalesce(k.referencia, 'Avance'), k.version_local, k.version_servidor),
           k.carga_at, 'Sincronización', coalesce(k.referencia, ''), 'Comparar versiones', '/sincronizacion'
      from public.sync_conflictos k where k.service_id = p_service and k.estado = 'abierto' and public.alerta_regla(p_service, 'sync', 'activo', 'true')::boolean
    union all
    select 'bloq:' || u.id, 'critica', 'Usuario bloqueado', format('%s superó el número de intentos de acceso y fue bloqueado.', p.full_name),
           (select max(cuando) from public.accesos x where x.profile_id = u.id and x.evento = 'bloqueado'), 'Usuario', split_part(p.email, '@', 1), 'Desbloquear', '/gestion/usuarios'
      from auth.users u join public.profiles p on p.id = u.id join public.service_members m on m.profile_id = u.id and m.service_id = p_service
     where u.banned_until > now() and p.is_active
    union all
    select 'caja:' || b.id, 'critica', 'Saldo bajo en caja presupuestal', format('La caja %s tiene saldo S/ %s, bajo el umbral S/ %s.', b.name, round(b.balance, 2), b.low_balance_threshold),
           b.last_movement_on::timestamptz, 'Presupuesto', b.name, 'Escalar', '/caja'
      from public.v_cash_boxes b where b.service_id = p_service and b.is_active and b.low_balance_threshold is not null and b.balance < b.low_balance_threshold
       and public.alerta_regla(p_service, 'caja', 'activo', 'true')::boolean
    union all
    select 'sup:' || c.id, 'pendiente', 'Cuadrilla sin supervisor asignado', format('La cuadrilla %s no tiene supervisor asignado.', c.name), c.updated_at, 'Cuadrilla', c.code, 'Asignar', '/gestion/cuadrillas'
      from public.crews c where c.service_id = p_service and c.deleted_at is null and c.is_active and c.supervisor_id is null
    union all
    select 'pci:venc', 'pendiente', 'Ítems PCI vencidos', format('Existen %s ítems del PCI con fecha de vencimiento superada.', count(*)), max(i.due_date)::timestamptz, 'PCI', count(*) || ' ítems', 'Actualizar', '/pci'
      from public.pci_items i where i.service_id = p_service and i.deleted_at is null and i.due_date < public.hoy_peru() and i.status in ('pendiente', 'en_atencion', 'observado')
       and public.alerta_regla(p_service, 'pci', 'activo', 'true')::boolean
    having count(*) > 0
    union all
    -- Por vencer: un aviso agrupado por PCI con la anticipación configurada
    select 'pci:porvencer:' || p.id, 'pendiente', 'Ítems PCI por vencer', format('%s ítems del %s vencen en los próximos %s días.', count(*), p.code, public.alerta_regla(p_service, 'pci', 'anticipacion', '2')),
           min(i.due_date)::timestamptz, 'PCI', p.code, 'Revisar', '/pci/' || p.id
      from public.pci_items i join public.pcis p on p.id = i.pci_id
     where i.service_id = p_service and i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
       and i.due_date between public.hoy_peru() and public.hoy_peru() + public.alerta_regla(p_service, 'pci', 'anticipacion', '2')::int
       and public.alerta_regla(p_service, 'pci', 'activo', 'true')::boolean
     group by p.id, p.code
    union all
    select 'ev:' || i.id, 'pendiente', 'Evidencia incompleta', format('El ítem %s del %s no cuenta con las tres fases de foto.', i.item_number, p.code), i.updated_at, 'Actividad',
           p.code || ' / ítem ' || i.item_number, 'Completar', '/pci/' || i.pci_id || '/item/' || i.id
      from public.pci_items i join public.pcis p on p.id = i.pci_id
     where i.service_id = p_service and i.deleted_at is null and i.status in ('levantado', 'subsanado') and cardinality(public.pci_item_fases_faltantes(i.id)) > 0
       and public.alerta_regla(p_service, 'evidencia', 'activo', 'true')::boolean
    union all
    select 'mant:' || v.id, 'informativa', 'Mantenimiento pendiente de vehículo', format('El vehículo %s tiene mantenimiento preventivo el %s.', coalesce(v.code, v.plate), to_char(v.next_service_on, 'DD/MM/YYYY')),
           v.next_service_on::timestamptz, 'Vehículo', coalesce(v.code, v.plate), 'Programar', '/recursos'
      from public.vehicles v where v.service_id = p_service and v.deleted_at is null
       and v.next_service_on between public.hoy_peru() - 30 and public.hoy_peru() + public.alerta_regla(p_service, 'mantenimiento', 'anticipacion', '7')::int
       and public.alerta_regla(p_service, 'mantenimiento', 'activo', 'true')::boolean
    union all
    select 'meq:' || e.id, 'informativa', 'Mantenimiento de equipo', format('El equipo %s (%s) tiene mantenimiento el %s.', e.codigo, e.nombre, to_char(e.mantenimiento_on, 'DD/MM/YYYY')),
           e.mantenimiento_on::timestamptz, 'Equipo', e.codigo, 'Programar', '/recursos?tab=equipos'
      from public.equipos e where e.service_id = p_service and e.deleted_at is null
       and e.mantenimiento_on between public.hoy_peru() - 30 and public.hoy_peru() + public.alerta_regla(p_service, 'mantenimiento', 'anticipacion', '7')::int
       and public.alerta_regla(p_service, 'mantenimiento', 'activo', 'true')::boolean
    union all
    select 'rend:' || b.id, 'informativa', 'Ausencia de rendición', format('La caja %s tiene %s gastos de más de %s días sin rendición.', b.name, count(*), public.alerta_regla(p_service, 'rendicion', 'dias', '7')), min(m.occurred_on)::timestamptz,
           'Rendición', b.name, 'Registrar', '/caja?tab=rendiciones'
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id
     where m.service_id = p_service and m.deleted_at is null and m.kind = 'gasto' and m.rendicion_id is null and m.status = 'registrado'
       and m.occurred_on < public.hoy_peru() - public.alerta_regla(p_service, 'rendicion', 'dias', '7')::int
       and public.alerta_regla(p_service, 'rendicion', 'activo', 'true')::boolean
     group by b.id, b.name
  )
  select coalesce(json_agg(json_build_object('clave', a.clave, 'severidad', case when t.clave is not null then 'resuelta' else a.severidad end, 'titulo', a.titulo,
           'descripcion', a.descripcion, 'cuando', a.cuando, 'tipo', a.tipo, 'referencia', a.referencia, 'accion', a.accion, 'url', a.url,
           'atendida_at', t.cuando) order by (t.clave is not null), case a.severidad when 'critica' then 0 when 'pendiente' then 1 else 2 end, a.cuando desc nulls last), '[]'::json)
    from a left join public.alertas_atendidas t on t.service_id = p_service and t.clave = a.clave
   where public.es_admin(p_service)
$$;
grant execute on function public.alertas_sistema(uuid) to authenticated;

-- Cada usuario elimina sus propias copias temporales vencidas (retención)
drop policy if exists "exportaciones_delete" on storage.objects;
create policy "exportaciones_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exportaciones' and (storage.foldername(name))[1] = auth.uid()::text);
