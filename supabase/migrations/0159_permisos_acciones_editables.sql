-- ═══════════════════════════════════════════════════════════════════════════
-- 0159 · Roles y permisos: acciones editables (A01/A02 · confirmado por Elvis
-- el 24/11/2026: «hazlas editables»)
--
-- Medidas:
-- · permisos_base: qué acciones admite cada rol en cada módulo (antes solo
--   descrito en la web). Solo esas se pueden encender o apagar: la matriz no
--   da a un rol lo que su función no permite (el Jefe no valida su propio
--   reporte, el Visor no crea, etc.). Segregación de funciones intacta.
-- · permisos_rol.acciones: lo que el Administrador apagó o volvió a encender
--   por contrato y rol. «Ver» nulo = el del menú por defecto.
-- · accion_permitida / exigir_accion: el servidor aplica la matriz en cada
--   operación (funciones de negocio y escrituras directas a las tablas, con
--   políticas RESTRICTIVE). Con «Ver» apagado tampoco se escribe en el módulo.
-- · El Administrador no se recorta; todo cambio exige motivo, versiona y
--   queda en la bitácora (antes permisos_rol no tenía auditoría).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.permisos_rol alter column ver drop not null;
alter table public.permisos_rol add column if not exists acciones jsonb not null default '{}'::jsonb;

create table if not exists public.permisos_base (
  rol public.user_role not null,
  modulo text not null,
  accion text not null check (accion in ('crear', 'editar', 'importar', 'asignar', 'validar', 'exportar')),
  primary key (rol, modulo, accion)
);
alter table public.permisos_base enable row level security;
drop policy if exists permisos_base_select on public.permisos_base;
create policy permisos_base_select on public.permisos_base for select to authenticated using (true);
grant select on public.permisos_base to authenticated;

delete from public.permisos_base;
insert into public.permisos_base (rol, modulo, accion)
select 'admin', m, a from unnest(array['programacion', 'pci', 'reporte_diario', 'observaciones', 'inventario', 'materiales', 'caja', 'ssoma', 'reportes', 'usuarios', 'configuracion']) m,
       unnest(array['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar']) a
union all
select r::public.user_role, m, a from (values
  ('supervisor', 'programacion', array['crear', 'editar', 'importar', 'asignar', 'exportar']),
  ('supervisor', 'pci', array['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar']),
  ('supervisor', 'reporte_diario', array['validar', 'exportar']),
  ('supervisor', 'observaciones', array['crear', 'editar', 'asignar', 'exportar']),
  ('supervisor', 'inventario', array['crear', 'editar', 'importar', 'exportar']),
  ('supervisor', 'materiales', array['crear', 'exportar']),
  ('supervisor', 'reportes', array['exportar']),
  ('residente', 'programacion', array['crear', 'editar', 'importar', 'asignar', 'exportar']),
  ('residente', 'pci', array['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar']),
  ('residente', 'reporte_diario', array['validar', 'exportar']),
  ('residente', 'observaciones', array['crear', 'editar', 'asignar', 'exportar']),
  ('residente', 'inventario', array['crear', 'editar', 'importar', 'exportar']),
  ('residente', 'materiales', array['crear', 'validar', 'exportar']),
  ('residente', 'caja', array['crear', 'validar', 'exportar']),
  ('residente', 'ssoma', array['exportar']),
  ('residente', 'reportes', array['exportar']),
  ('jefe_cuadrilla', 'pci', array['editar']),
  ('jefe_cuadrilla', 'reporte_diario', array['crear', 'editar']),
  ('jefe_cuadrilla', 'observaciones', array['crear']),
  ('jefe_cuadrilla', 'inventario', array['crear']),
  ('jefe_cuadrilla', 'materiales', array['crear']),
  ('jefe_cuadrilla', 'caja', array['crear']),
  ('jefe_cuadrilla', 'ssoma', array['crear']),
  ('ing_seguridad', 'ssoma', array['crear', 'editar', 'validar', 'exportar']),
  ('ing_seguridad', 'reportes', array['exportar']),
  ('visor', 'pci', array['validar']),
  ('visor', 'reportes', array['exportar'])
) x(r, m, acc), unnest(x.acc) a;

-- ── La matriz aplicada en el servidor ─────────────────────────────────────
-- Devuelve false solo si el Administrador apagó «Ver» del módulo o esa
-- acción para el rol de quien llama. Lo demás lo siguen decidiendo las reglas
-- de cada función (alcance, cuadrilla, segregación).
create or replace function public.accion_permitida(p_service uuid, p_modulo text, p_accion text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_rol public.user_role; r public.permisos_rol;
begin
  if p_service is null or p_modulo is null then return true; end if;
  v_rol := public.role_in(p_service);
  if v_rol is null or v_rol = 'admin' then return true; end if;
  select * into r from public.permisos_rol where service_id = p_service and rol = v_rol and modulo = p_modulo;
  if not found then return true; end if;
  if r.ver is false then return false; end if;
  if (r.acciones ->> p_accion) = 'false' then return false; end if;
  return true;
end $$;
revoke all on function public.accion_permitida(uuid, text, text) from public, anon;
grant execute on function public.accion_permitida(uuid, text, text) to authenticated;

create or replace function public.exigir_accion(p_service uuid, p_modulo text, p_accion text)
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.accion_permitida(p_service, p_modulo, p_accion) then
    raise exception 'SIGOV: tu rol no tiene habilitado «%» en %. Lo habilita el Administrador en Roles y permisos',
      initcap(p_accion),
      case p_modulo when 'programacion' then 'Programación' when 'pci' then 'PCI' when 'reporte_diario' then 'Reporte diario'
        when 'observaciones' then 'Observaciones' when 'inventario' then 'Inventario vial' when 'materiales' then 'Materiales'
        when 'caja' then 'Caja' when 'ssoma' then 'SSOMA' when 'reportes' then 'Reportes' when 'usuarios' then 'Usuarios'
        when 'configuracion' then 'Configuración' else p_modulo end
      using errcode = '42501';
  end if;
end $$;
revoke all on function public.exigir_accion(uuid, text, text) from public, anon;
grant execute on function public.exigir_accion(uuid, text, text) to authenticated;

-- Lo que el rol que llama tiene habilitado en el contrato (para menús y botones)
create or replace function public.mis_permisos(p_service uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_object_agg(m.modulo, m.acc), '{}'::json) from (
    select b.modulo, json_agg(b.accion order by b.accion) filter (where public.accion_permitida(p_service, b.modulo, b.accion)) acc
      from public.permisos_base b where b.rol = public.role_in(p_service) group by b.modulo) m
$$;
revoke all on function public.mis_permisos(uuid) from public, anon;
grant execute on function public.mis_permisos(uuid) to authenticated;

-- ── Guardar: «Ver» y acciones, con motivo, versión y bitácora ─────────────
-- p_cambios: { "pci": { "ver": true, "importar": false } } (o, como antes,
-- { "pci": true } para «Ver»).
create or replace function public.permisos_guardar(p_service uuid, p_rol public.user_role, p_cambios jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k text; a text; v jsonb; v_ver int; v_acc jsonb;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador cambia permisos' using errcode = '42501'; end if;
  if p_rol = 'admin' then raise exception 'SIGOV: los permisos del Administrador no se recortan desde aquí'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el motivo del cambio es obligatorio'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then raise exception 'SIGOV: no hay cambios que guardar'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.permisos_cambios where service_id = p_service;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  for k in select jsonb_object_keys(p_cambios) loop
    if k not in ('programacion', 'pci', 'reporte_diario', 'observaciones', 'inventario', 'materiales', 'caja', 'ssoma', 'reportes', 'usuarios', 'configuracion') then
      raise exception 'SIGOV: módulo no válido: %', k;
    end if;
    v := p_cambios -> k;
    if jsonb_typeof(v) = 'boolean' then v := jsonb_build_object('ver', v); end if;
    if jsonb_typeof(v) <> 'object' then raise exception 'SIGOV: cambio no válido en %', k; end if;
    v_acc := '{}'::jsonb;
    for a in select jsonb_object_keys(v) loop
      if a = 'ver' then continue; end if;
      if jsonb_typeof(v -> a) <> 'boolean' then raise exception 'SIGOV: valor no válido en % · %', k, a; end if;
      if not exists (select 1 from public.permisos_base b where b.rol = p_rol and b.modulo = k and b.accion = a) then
        raise exception 'SIGOV: «%» en % no está disponible para este rol (regla del sistema: separación de funciones)', initcap(a), k;
      end if;
      v_acc := v_acc || jsonb_build_object(a, v -> a);
    end loop;
    insert into public.permisos_rol (service_id, rol, modulo, ver, acciones, version, actualizado_por)
    values (p_service, p_rol, k, case when v ? 'ver' then (v ->> 'ver')::boolean end, v_acc, v_ver, auth.uid())
    on conflict (service_id, rol, modulo) do update
      set ver = case when v ? 'ver' then (v ->> 'ver')::boolean else permisos_rol.ver end,
          acciones = permisos_rol.acciones || v_acc,
          version = v_ver, actualizado_por = auth.uid(), actualizado_at = now();
  end loop;
  insert into public.permisos_cambios (service_id, rol, cambios, motivo, version, quien) values (p_service, p_rol, p_cambios, trim(p_motivo), v_ver, auth.uid());
  perform set_config('sigov.motivo', '', true);
  return json_build_object('version', v_ver);
end $$;
grant execute on function public.permisos_guardar(uuid, public.user_role, jsonb, text) to authenticated;

drop trigger if exists t_audit_permisos_rol on public.permisos_rol;
create trigger t_audit_permisos_rol after insert or update or delete on public.permisos_rol
  for each row execute function public.audit_trigger();

-- ── Exportar: Centro de reportes y descargas guardadas ────────────────────
create or replace function public.familia_permitida(p_service uuid, p_familia text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_rol text := public.role_in(p_service)::text;
  v_modulo text;
begin
  if v_rol is null then return false; end if;
  if not (case p_familia
      when 'pci'           then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'niveles'       then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'programacion'  then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'diario'        then v_rol in ('admin', 'supervisor', 'residente')
      when 'ssoma'         then v_rol in ('admin', 'residente', 'ing_seguridad')
      when 'caja'          then v_rol in ('admin', 'residente')
      when 'auditoria'     then v_rol = 'admin'
      when 'observaciones' then v_rol in ('admin', 'supervisor', 'residente')
      when 'inventario'    then v_rol in ('admin', 'supervisor', 'residente')
      when 'recursos'      then v_rol in ('admin', 'residente')
      when 'rendimientos'  then v_rol in ('admin', 'supervisor', 'residente')
      when 'materiales'    then v_rol in ('admin', 'supervisor', 'residente')
      else false end) then
    return false;
  end if;
  if v_rol = 'admin' then return true; end if;
  -- «Ver» y «Exportar» de Reportes, y los del módulo de la familia
  if not public.accion_permitida(p_service, 'reportes', 'exportar') then return false; end if;
  v_modulo := case p_familia when 'pci' then 'pci' when 'niveles' then 'pci' when 'programacion' then 'programacion' when 'diario' then 'reporte_diario'
                when 'ssoma' then 'ssoma' when 'caja' then 'caja' when 'observaciones' then 'observaciones'
                when 'inventario' then 'inventario' when 'materiales' then 'materiales' end;
  if v_modulo is not null and not public.accion_permitida(p_service, v_modulo, 'exportar') then return false; end if;
  return true;
end $$;
revoke all on function public.familia_permitida(uuid, text) from public, anon;
grant execute on function public.familia_permitida(uuid, text) to authenticated;

-- ── Escrituras directas a las tablas (web y app de campo) ─────────────────
-- Políticas RESTRICTIVE: se suman a las de siempre; las funciones de negocio
-- (security definer) no pasan por aquí y llevan su propia verificación.
do $$
declare t record;
begin
  for t in select * from (values
    ('weekly_plans', 'programacion'), ('plan_items', 'programacion'),
    ('pcis', 'pci'), ('pci_items', 'pci'),
    ('work_orders', 'reporte_diario'), ('work_entries', 'reporte_diario'), ('parte_recursos', 'reporte_diario'),
    ('observaciones_campo', 'observaciones'),
    ('road_assets', 'inventario'), ('asset_interventions', 'inventario'),
    ('supply_requests', 'materiales'),
    ('cash_movements', 'caja'), ('deposit_requests', 'caja'),
    ('ats_iperc', 'ssoma'), ('safety_talks', 'ssoma'), ('talk_attendance', 'ssoma'), ('checklist_responses', 'ssoma'),
    ('vehicle_checks', 'ssoma'), ('hygiene_checks', 'ssoma'), ('safety_equipment_checks', 'ssoma'),
    ('vehicles', 'ssoma'), ('safety_equipment', 'ssoma'), ('checklist_templates', 'ssoma')
  ) x(tabla, modulo) loop
    execute format('drop policy if exists permiso_crear on public.%I', t.tabla);
    execute format('create policy permiso_crear on public.%I as restrictive for insert to authenticated with check (public.accion_permitida(service_id, %L, %L))', t.tabla, t.modulo, 'crear');
    if t.tabla <> 'supply_requests' then
      execute format('drop policy if exists permiso_editar on public.%I', t.tabla);
      execute format('create policy permiso_editar on public.%I as restrictive for update to authenticated using (public.accion_permitida(service_id, %L, %L)) with check (public.accion_permitida(service_id, %L, %L))', t.tabla, t.modulo, 'editar', t.modulo, 'editar');
    end if;
  end loop;
end $$;

-- Importaciones desde Excel: «Importar» del módulo de destino
drop policy if exists permiso_importar on public.import_batches;
create policy permiso_importar on public.import_batches as restrictive for insert to authenticated
  with check (public.accion_permitida(service_id, case kind when 'pci' then 'pci' when 'programacion' then 'programacion'
                                                          when 'inventario' then 'inventario' else 'configuracion' end, 'importar'));

-- ── Funciones de negocio: verificación al inicio ──────────────────────────
-- (Generado desde las definiciones vigentes: una línea «perform public.exigir_accion(...)» al inicio de cada función.)

CREATE OR REPLACE FUNCTION public.actualizar_parte(p_id uuid, p_clima text DEFAULT NULL::text, p_hora_inicio time without time zone DEFAULT NULL::time without time zone, p_hora_fin time without time zone DEFAULT NULL::time without time zone, p_personal integer DEFAULT NULL::integer, p_notas text DEFAULT NULL::text, p_crew_id uuid DEFAULT NULL::uuid, p_fecha date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.work_orders;
begin
  perform public.exigir_accion((public.parte_por(p_id, p_crew_id, p_fecha)).service_id, 'reporte_diario', 'editar');  -- Roles y permisos (0159)
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status not in ('borrador', 'observado') then
    raise exception 'SIGOV: el parte ya se envió; sus datos ya no se cambian';
  end if;
  update public.work_orders
     set weather = coalesce(nullif(trim(p_clima), ''), weather),
         start_time = coalesce(p_hora_inicio, start_time),
         end_time = coalesce(p_hora_fin, end_time),
         headcount = coalesce(p_personal, headcount),
         notes = coalesce(nullif(trim(p_notas), ''), notes),
         updated_at = now()
   where id = v.id;
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.apoyo_autorizar(p_pci uuid, p_origen uuid, p_destino uuid, p_alcance text, p_items uuid[], p_desde timestamp with time zone, p_hasta timestamp with time zone, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.pcis; v_id uuid; v_tmp public.apoyos_temporales; v_n int; o public.crews;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci), 'pci', 'asignar');  -- Roles y permisos (0159)
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if public.role_in(p.service_id) not in ('supervisor', 'admin') or not public.revisa_cuadrilla(p.service_id, p_destino) then
    raise exception 'SIGOV: el apoyo lo concede el Supervisor de la cuadrilla titular' using errcode = '42501';
  end if;
  if p.published_at is null then raise exception 'SIGOV: publica el PCI antes de autorizar un apoyo'; end if;
  if p_origen = p_destino then raise exception 'SIGOV: el origen y el destino deben ser cuadrillas distintas'; end if;
  select * into o from public.crews where id = p_origen and service_id = p.service_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla de apoyo no existe en este contrato'; end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then raise exception 'SIGOV: revisa la vigencia (desde < hasta)'; end if;
  if p_hasta <= now() then raise exception 'SIGOV: la vigencia ya terminó'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del apoyo'; end if;
  if length(trim(p_motivo)) > 200 then raise exception 'SIGOV: el motivo admite hasta 200 caracteres'; end if;
  if coalesce(p_alcance, 'pci') = 'items' and coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'SIGOV: elige los ítems del apoyo';
  end if;
  if exists (select 1 from public.apoyos_temporales a where a.crew_origen = p_origen and a.pci_id = p_pci and a.estado = 'vigente'
              and a.hasta > now() and a.desde < p_hasta and a.hasta > p_desde) then
    raise exception 'SIGOV: esa cuadrilla ya tiene un apoyo vigente en este PCI que se solapa con esas fechas';
  end if;
  v_tmp.pci_id := p_pci; v_tmp.crew_destino := p_destino; v_tmp.alcance := coalesce(p_alcance, 'pci'); v_tmp.items := coalesce(p_items, '{}');
  select count(*) into v_n from public.apoyo_items(v_tmp);
  if v_n = 0 then raise exception 'SIGOV: el alcance no tiene ítems de la cuadrilla titular'; end if;

  insert into public.apoyos_temporales (service_id, pci_id, crew_origen, crew_destino, alcance, items, desde, hasta, motivo, creado_por)
  values (p.service_id, p_pci, p_origen, p_destino, coalesce(p_alcance, 'pci'),
          case when p_alcance = 'items' then p_items else '{}' end, p_desde, p_hasta, trim(p_motivo), auth.uid())
  returning id into v_id;
  if o.leader_id is not null then
    perform public.aviso_vivo(p.service_id, o.leader_id, 'apoyo_temporal', 'apoyo:' || v_id,
      format('Apoyo temporal · PCI %s', public.pci_corto(p.code)),
      format('%s ítems para consultar y registrar evidencias, del %s al %s.', v_n,
             to_char(p_desde at time zone 'America/Lima', 'DD/MM HH24:MI'), to_char(p_hasta at time zone 'America/Lima', 'DD/MM HH24:MI')),
      '/pci/' || p_pci, 'info', jsonb_build_object('pci_id', p_pci, 'apoyo_id', v_id));
  end if;
  return json_build_object('apoyo', v_id, 'items', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.apoyo_revocar(p_apoyo uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.apoyos_temporales; o public.crews;
begin
  perform public.exigir_accion((select service_id from public.apoyos_temporales where id = p_apoyo), 'pci', 'asignar');  -- Roles y permisos (0159)
  select * into a from public.apoyos_temporales where id = p_apoyo for update;
  if not found then raise exception 'SIGOV: el apoyo no existe'; end if;
  if public.role_in(a.service_id) not in ('supervisor', 'admin') or not public.revisa_cuadrilla(a.service_id, a.crew_destino) then
    raise exception 'SIGOV: el apoyo lo revoca el Supervisor de la cuadrilla titular' using errcode = '42501';
  end if;
  if a.estado <> 'vigente' then raise exception 'SIGOV: el apoyo ya fue revocado'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: la revocación requiere un motivo'; end if;
  update public.apoyos_temporales set estado = 'revocado', revocado_por = auth.uid(), revocado_at = now(), motivo_revocacion = trim(p_motivo)
   where id = a.id;
  select * into o from public.crews where id = a.crew_origen;
  if o.leader_id is not null then perform public.aviso_resolver(o.leader_id, 'apoyo_temporal', 'apoyo:' || a.id); end if;
  return json_build_object('revocado', true);
end $function$;

CREATE OR REPLACE FUNCTION public.apply_pci_suspension(p_pci_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_service uuid;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci_id), 'pci', 'editar');  -- Roles y permisos (0159)
  select service_id into v_service from public.pcis where id = p_pci_id and deleted_at is null;
  if v_service is null then
    raise exception 'SIGOV: ese PCI ya no existe';
  end if;
  if not public.can_manage(v_service) then
    raise exception 'SIGOV: solo el supervisor o el administrador reordenan la programación'
      using errcode = '42501';
  end if;
  return public.apply_pci_suspension_sin_permiso(p_pci_id);
end $function$;

CREATE OR REPLACE FUNCTION public.atender_solicitud_deposito(p_id uuid, p_monto numeric, p_comprobante text, p_operacion text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.deposit_requests;
  v_mov uuid;
begin
  perform public.exigir_accion((select service_id from public.deposit_requests where id = p_id), 'caja', 'validar');  -- Roles y permisos (0159)
  select * into s from public.deposit_requests where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la solicitud no existe'; end if;
  if public.role_in(s.service_id) is distinct from 'admin' then
    raise exception 'SIGOV: solo el administrador atiende los depósitos' using errcode = '42501';
  end if;
  if s.status in ('depositado', 'rechazado') then
    raise exception 'SIGOV: esta solicitud ya está cerrada';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'SIGOV: escribe el monto depositado'; end if;
  if coalesce(trim(p_comprobante), '') = '' then
    raise exception 'SIGOV: adjunta el comprobante del depósito';
  end if;
  if split_part(p_comprobante, '/', 1) <> s.service_id::text then
    raise exception 'SIGOV: el comprobante no es de este contrato';
  end if;

  insert into public.cash_movements (
    service_id, cash_box_id, kind, status, amount, description,
    receipt_kind, receipt_number, storage_path, created_by, reviewed_by, reviewed_at
  ) values (
    s.service_id, s.cash_box_id, 'deposito', 'aprobado', p_monto,
    'Depósito a caja · ' || s.reason, 'recibo', nullif(trim(p_operacion), ''), p_comprobante,
    auth.uid(), auth.uid(), now()
  ) returning id into v_mov;

  update public.deposit_requests
     set status = 'depositado',
         approved_amount = p_monto,
         bank_reference = nullif(trim(p_operacion), ''),
         voucher_path = p_comprobante,
         resolution_note = coalesce(nullif(trim(p_nota), ''), resolution_note),
         movement_id = v_mov
   where id = p_id;

  return json_build_object('movement_id', v_mov);
end $function$;

CREATE OR REPLACE FUNCTION public.caja_cerrar(p_service uuid, p_box uuid, p_desde date, p_hasta date, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e json; v_id uuid;
begin
  perform public.exigir_accion(p_service, 'caja', 'validar');  -- Roles y permisos (0159)
  e := public.caja_cierre_estado(p_service, p_box, p_desde, p_hasta);
  if (e->>'cerrado')::boolean then raise exception 'SIGOV: ese período ya está cerrado'; end if;
  if (e->>'bloqueado')::boolean then raise exception 'SIGOV: cierre bloqueado. %', e->>'motivo_bloqueo'; end if;
  insert into public.caja_cierres (service_id, cash_box_id, desde, hasta, conciliacion_id, saldo, nota)
  values (p_service, p_box, p_desde, p_hasta, (e->'conciliacion'->>'id')::uuid, (e->'conciliacion'->>'saldo_declarado')::numeric, nullif(trim(p_nota), ''))
  returning id into v_id;
  return json_build_object('id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.caja_movimiento_registrar(p_box uuid, p_tipo text, p_fecha date, p_concepto text, p_solicitado numeric, p_aprobado numeric, p_ejecutado numeric, p_comprobante text DEFAULT NULL::text, p_numero_comprobante text DEFAULT NULL::text, p_proveedor text DEFAULT NULL::text, p_ruta text DEFAULT NULL::text, p_justificacion text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.cash_boxes; v_id uuid; v_num int;
begin
  perform public.exigir_accion((select service_id from public.cash_boxes where id = p_box), 'caja', 'crear');  -- Roles y permisos (0159)
  select * into b from public.cash_boxes where id = p_box and deleted_at is null;
  if not found then raise exception 'SIGOV: elige la caja de la cuadrilla'; end if;
  if public.role_in(b.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: los movimientos de la caja presupuestal los registra administración' using errcode = '42501'; end if;
  if p_tipo not in ('deposito', 'gasto') then raise exception 'SIGOV: tipo de movimiento no válido (fondeo o gasto; la transferencia tiene su propio registro)'; end if;
  if nullif(trim(p_concepto), '') is null then raise exception 'SIGOV: escribe el concepto'; end if;
  if coalesce(p_ejecutado, 0) <= 0 then raise exception 'SIGOV: el importe ejecutado debe ser mayor que cero'; end if;
  if p_aprobado is not null and p_solicitado is not null and p_aprobado > p_solicitado then raise exception 'SIGOV: lo aprobado no puede superar lo solicitado'; end if;
  if p_tipo = 'gasto' and p_ruta is null and nullif(trim(p_justificacion), '') is null then
    raise exception 'SIGOV: adjunta el comprobante (PDF, JPG o PNG) o justifica por qué no hay';
  end if;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on,
                                     category, description, receipt_kind, receipt_number, supplier, storage_path, justification, created_by)
  values (b.service_id, p_box, b.crew_id, p_tipo::public.cash_movement_kind, 'registrado', p_ejecutado, p_solicitado, p_aprobado, coalesce(p_fecha, public.hoy_peru()),
          trim(p_concepto), trim(p_concepto),
          coalesce(nullif(p_comprobante, '')::public.receipt_kind, case when p_ruta is null then 'sin_comprobante' else 'boleta' end::public.receipt_kind),
          nullif(trim(p_numero_comprobante), ''), nullif(trim(p_proveedor), ''), p_ruta,
          coalesce(nullif(trim(p_justificacion), ''), case when p_ruta is null then trim(p_concepto) end), auth.uid())
  returning id, numero into v_id, v_num;
  return json_build_object('id', v_id, 'codigo', 'MOV' || lpad(v_num::text, 3, '0'));
end $function$;

CREATE OR REPLACE FUNCTION public.caja_transferir(p_desde_box uuid, p_hacia_box uuid, p_monto numeric, p_fecha date, p_concepto text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.cash_boxes; b public.cash_boxes; t uuid := gen_random_uuid(); v1 int; v2 int; saldo numeric;
begin
  perform public.exigir_accion((select service_id from public.cash_boxes where id = p_desde_box), 'caja', 'crear');  -- Roles y permisos (0159)
  select * into a from public.cash_boxes where id = p_desde_box and deleted_at is null;
  select * into b from public.cash_boxes where id = p_hacia_box and deleted_at is null;
  if a.id is null or b.id is null then raise exception 'SIGOV: elige la caja de origen y la de destino'; end if;
  if a.id = b.id then raise exception 'SIGOV: el origen y el destino deben ser cajas distintas'; end if;
  if a.service_id <> b.service_id then raise exception 'SIGOV: las cajas son de contratos distintos'; end if;
  if public.role_in(a.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: las transferencias internas las registra administración' using errcode = '42501'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'SIGOV: el monto debe ser mayor que cero'; end if;
  select balance into saldo from public.v_cash_boxes where id = a.id;
  if saldo < p_monto then raise exception 'SIGOV: la caja de origen tiene S/ % disponible; no alcanza para transferir S/ %', round(saldo, 2), round(p_monto, 2); end if;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on, category, description, transferencia_id, receipt_kind, justification, created_by, reviewed_by, reviewed_at)
  values (a.service_id, a.id, a.crew_id, 'devolucion', 'aprobado', p_monto, p_monto, p_monto, coalesce(p_fecha, public.hoy_peru()), 'Transferencia',
          'Transferencia a ' || b.name || coalesce(' · ' || nullif(trim(p_concepto), ''), ''), t, 'sin_comprobante', 'Transferencia interna entre cajas', auth.uid(), auth.uid(), now())
  returning numero into v1;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on, category, description, transferencia_id, receipt_kind, justification, created_by, reviewed_by, reviewed_at)
  values (b.service_id, b.id, b.crew_id, 'deposito', 'aprobado', p_monto, p_monto, p_monto, coalesce(p_fecha, public.hoy_peru()), 'Transferencia',
          'Transferencia desde ' || a.name || coalesce(' · ' || nullif(trim(p_concepto), ''), ''), t, 'sin_comprobante', 'Transferencia interna entre cajas', auth.uid(), auth.uid(), now())
  returning numero into v2;
  return json_build_object('transferencia_id', t, 'salida', 'MOV' || lpad(v1::text, 3, '0'), 'entrada', 'MOV' || lpad(v2::text, 3, '0'));
end $function$;

CREATE OR REPLACE FUNCTION public.cargar_pagina_documento(p_client_id uuid, p_service_id uuid, p_crew_id uuid, p_fecha date, p_tipo text, p_storage_path text, p_vehicle_id uuid DEFAULT NULL::uuid, p_titulo text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_taken_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sha256 text DEFAULT NULL::text, p_width integer DEFAULT NULL::integer, p_height integer DEFAULT NULL::integer, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc public.documentos_del_dia;
begin
  perform public.exigir_accion(p_service_id, 'ssoma', 'crear');  -- Roles y permisos (0159)
  if not public.can_write(p_service_id) then
    raise exception 'SIGOV: no tienes permiso para cargar documentos' using errcode = '42501';
  end if;
  -- El jefe carga los de su cuadrilla; SSOMA y quien administra, cualquiera
  if not (public.puede_revisar_ssoma(p_service_id)
          or exists (select 1 from public.crews c where c.id = p_crew_id and c.leader_id = auth.uid())) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_service_id::text then
    raise exception 'SIGOV: ruta de archivo inválida';
  end if;

  -- Reintento de la cola: la página ya está
  if exists (select 1 from public.documento_paginas where client_id = p_client_id) then
    select d.* into v_doc from public.documentos_del_dia d
      join public.documento_paginas p on p.documento_id = d.id
     where p.client_id = p_client_id;
    return json_build_object('documento_id', v_doc.id, 'estado', v_doc.estado);
  end if;

  select * into v_doc from public.documentos_del_dia
   where crew_id = p_crew_id and doc_date = p_fecha and tipo = p_tipo::public.documento_tipo
     and vehicle_id is not distinct from p_vehicle_id
     and coalesce(titulo, '') = coalesce(nullif(trim(p_titulo), ''), '')
     and deleted_at is null;

  if not found then
    insert into public.documentos_del_dia (service_id, crew_id, doc_date, tipo, vehicle_id, titulo, created_by)
    values (p_service_id, p_crew_id, p_fecha, p_tipo::public.documento_tipo, p_vehicle_id,
            nullif(trim(p_titulo), ''), auth.uid())
    returning * into v_doc;
  elsif v_doc.estado = 'observado' then
    -- Una foto nueva sobre lo observado es la subsanación: vuelve a revisión
    update public.documentos_del_dia
       set estado = 'subsanado', updated_at = now()
     where id = v_doc.id
    returning * into v_doc;
  elsif v_doc.estado = 'conforme' then
    raise exception 'SIGOV: ese documento ya está conforme; no se le agregan páginas';
  end if;

  insert into public.documento_paginas
    (client_id, documento_id, service_id, storage_path, lat, lng, taken_at, sha256, width, height, size_bytes, created_by)
  values
    (p_client_id, v_doc.id, p_service_id, p_storage_path, p_lat, p_lng, coalesce(p_taken_at, now()),
     p_sha256, p_width, p_height, p_size_bytes, auth.uid());

  return json_build_object('documento_id', v_doc.id, 'estado', v_doc.estado);
end $function$;

CREATE OR REPLACE FUNCTION public.conciliacion_aclarar(p_id uuid, p_monto numeric, p_texto text, p_adjunto text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.conciliaciones;
begin
  perform public.exigir_accion((select service_id from public.conciliaciones where id = p_id), 'caja', 'validar');  -- Roles y permisos (0159)
  select * into c from public.conciliaciones where id = p_id;
  if not found then raise exception 'SIGOV: la conciliación no existe'; end if;
  if public.role_in(c.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: las aclaraciones las registra administración' using errcode = '42501'; end if;
  if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: explica la diferencia'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'SIGOV: indica el monto que aclara (mayor que cero)'; end if;
  if abs(public.conciliacion_pendiente(p_id)) = 0 then raise exception 'SIGOV: esa conciliación ya no tiene diferencia por aclarar'; end if;
  insert into public.conciliacion_aclaraciones (conciliacion_id, service_id, monto, texto, adjunto) values (p_id, c.service_id, abs(p_monto), trim(p_texto), p_adjunto);
  return json_build_object('pendiente', public.conciliacion_pendiente(p_id));
end $function$;

CREATE OR REPLACE FUNCTION public.conciliacion_guardar(p_service uuid, p_box uuid, p_desde date, p_hasta date, p_items jsonb, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v json; v_decl numeric := 0; v_dif numeric := 0; i jsonb; v_id uuid; v_cod text; esp numeric;
begin
  perform public.exigir_accion(p_service, 'caja', 'validar');  -- Roles y permisos (0159)
  if public.role_in(p_service) not in ('admin', 'residente') then raise exception 'SIGOV: la conciliación la registra administración' using errcode = '42501'; end if;
  v := public.caja_periodo(p_service, p_box, p_desde, p_hasta);
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select coalesce((x->>'sustentado')::numeric, 0) + coalesce((x->>'pendiente')::numeric, 0) into esp
      from json_array_elements(v->'movimientos') x where x->>'id' = i->>'movement_id';
    v_decl := v_decl + coalesce((i->>'declarado')::numeric, 0);
    v_dif := v_dif + coalesce((i->>'declarado')::numeric, 0) - coalesce(esp, 0);
  end loop;
  if round(v_dif, 2) <> 0 and nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: hay diferencia de S/ %: escribe el motivo', round(v_dif, 2); end if;
  insert into public.conciliaciones (service_id, numero, cash_box_id, desde, hasta, fondo, sustentado, pendiente, declarado, diferencia, items, motivo, quien,
                                     saldo_esperado, saldo_declarado)
  values (p_service, public.ssoma_siguiente(p_service, 'conciliaciones'), p_box, p_desde, p_hasta, (v->>'fondo')::numeric, (v->>'sustentado')::numeric,
          (v->>'pendiente')::numeric, v_decl, round(v_dif, 2), coalesce(p_items, '[]'::jsonb), nullif(trim(p_motivo), ''), auth.uid(),
          (v->>'disponible')::numeric, (v->>'disponible')::numeric + round(v_dif, 2))
  returning id, codigo into v_id, v_cod;
  return json_build_object('id', v_id, 'codigo', v_cod, 'diferencia', round(v_dif, 2));
end $function$;

CREATE OR REPLACE FUNCTION public.conteo_decidir(p_conteo uuid, p_ajustar boolean, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k public.conteos_fisicos; v_mov uuid;
begin
  perform public.exigir_accion((select service_id from public.conteos_fisicos where id = p_conteo), 'materiales', 'validar');  -- Roles y permisos (0159)
  select * into k from public.conteos_fisicos where id = p_conteo for update;
  if not found then raise exception 'SIGOV: el conteo no existe'; end if;
  if k.estado <> 'registrado' then raise exception 'SIGOV: ese conteo ya se decidió'; end if;
  if public.role_in(k.service_id) not in ('admin', 'supervisor') or not public.revisa_cuadrilla(k.service_id, k.crew_id) then
    raise exception 'SIGOV: el ajuste lo autoriza el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el ajuste requiere motivo'; end if;
  if p_ajustar and k.diferencia <> 0 then
    insert into public.movimientos_cuadrilla (service_id, crew_id, supply_id, tipo, qty, occurred_on, notes, created_by, client_id)
    values (k.service_id, k.crew_id, k.supply_id, 'ajuste', k.diferencia, (k.contado_at at time zone 'America/Lima')::date,
            'Ajuste por conteo físico: ' || trim(p_motivo), auth.uid(), k.id)
    returning id into v_mov;
  end if;
  update public.conteos_fisicos set estado = case when p_ajustar then 'ajustado' else 'descartado' end, movimiento_id = v_mov,
         motivo_decision = trim(p_motivo), decidido_por = auth.uid(), decidido_at = now()
   where id = k.id;
  return json_build_object('movimiento', v_mov);
end $function$;

CREATE OR REPLACE FUNCTION public.conteo_registrar(p_crew uuid, p_supply uuid, p_contado numeric, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.crews; v_teorico numeric; v_id uuid;
begin
  perform public.exigir_accion((select service_id from public.crews where id = p_crew), 'materiales', 'crear');  -- Roles y permisos (0159)
  select * into c from public.crews where id = p_crew and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if public.role_in(c.service_id) not in ('admin', 'residente', 'supervisor') or not public.revisa_cuadrilla(c.service_id, p_crew) then
    raise exception 'SIGOV: el conteo lo registra el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if p_contado is null or p_contado < 0 then raise exception 'SIGOV: la cantidad contada no es válida'; end if;
  select coalesce(sum(entrada - salida), 0) into v_teorico
    from public.movimientos_confirmados(c.service_id, p_crew) where supply_id = p_supply and confirmado;
  insert into public.conteos_fisicos (service_id, crew_id, supply_id, contado, teorico, diferencia, nota, registrado_por)
  values (c.service_id, p_crew, p_supply, p_contado, v_teorico, p_contado - v_teorico, nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  return json_build_object('conteo', v_id, 'teorico', v_teorico, 'diferencia', p_contado - v_teorico);
end $function$;

CREATE OR REPLACE FUNCTION public.corregir_solicitud_deposito(p_id uuid, p_monto numeric, p_motivo text, p_prioridad text DEFAULT 'normal'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  perform public.exigir_accion((select service_id from public.deposit_requests where id = p_id), 'caja', 'editar');  -- Roles y permisos (0159)
  if p_monto is null or p_monto <= 0 then raise exception 'SIGOV: escribe cuánto necesitas'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'SIGOV: di para qué es el depósito'; end if;
  -- Las reglas (quién, en qué estado) las aplica el trigger
  update public.deposit_requests
     set amount = p_monto, reason = trim(p_motivo), priority = coalesce(p_prioridad, 'normal')
   where id = p_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la solicitud no existe'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crear_pedido(p_service_id uuid, p_crew_id uuid DEFAULT NULL::uuid, p_needed_on date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_section_id uuid DEFAULT NULL::uuid, p_plan_item_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb, p_aprobar boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id   uuid;
  v_item jsonb;
  v_aprobado boolean := p_aprobar and public.role_in(p_service_id) = 'admin';
begin
  perform public.exigir_accion(p_service_id, 'materiales', 'crear');  -- Roles y permisos (0159)
  if not public.can_manage(p_service_id) then
    raise exception 'Solo el supervisor, el residente o el administrador piden materiales.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  insert into public.supply_requests
    (service_id, crew_id, status, needed_on, reason, section_id, plan_item_id, created_by)
  values
    (p_service_id, p_crew_id,
     case when v_aprobado then 'aprobado' else 'solicitado' end::public.supply_request_status,
     coalesce(p_needed_on, public.hoy_peru()),
     nullif(btrim(p_reason), ''), p_section_id, p_plan_item_id, auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, qty_approved, notes)
    values (
      p_service_id, v_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      case when v_aprobado then (v_item->>'qty')::numeric end,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.duplicar_semana(p_service_id uuid, p_origen date, p_destino date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_destino uuid;
  v_copiadas int := 0;
  v_omitidas int := 0;
  v_existentes int := 0;
begin
  perform public.exigir_accion(p_service_id, 'programacion', 'crear');  -- Roles y permisos (0159)
  if not public.can_manage(p_service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador pueden programar';
  end if;

  if extract(isodow from p_origen) <> 1 or extract(isodow from p_destino) <> 1 then
    raise exception 'SIGOV: las semanas empiezan en lunes';
  end if;

  if p_origen = p_destino then
    raise exception 'SIGOV: la semana de origen y la de destino son la misma';
  end if;

  select count(*) into v_existentes
    from public.plan_items pi
   where pi.service_id = p_service_id
     and pi.deleted_at is null
     and pi.scheduled_on between p_destino and p_destino + 6;

  if v_existentes > 0 then
    return json_build_object(
      'copiadas', 0,
      'omitidas', 0,
      'existentes', v_existentes,
      'mensaje', format('La semana destino ya tiene %s partidas programadas.', v_existentes));
  end if;

  -- El plan de la semana destino, o uno nuevo en borrador
  select id into v_plan_destino
    from public.weekly_plans
   where service_id = p_service_id and starts_on = p_destino and deleted_at is null;

  if v_plan_destino is null then
    insert into public.weekly_plans (service_id, year, week, starts_on, ends_on, status, created_by)
    values (
      p_service_id,
      extract(isoyear from p_destino)::smallint,
      extract(week from p_destino)::smallint,
      p_destino,
      p_destino + 6,
      'borrador',
      auth.uid()
    )
    returning id into v_plan_destino;
  end if;

  -- Lo que no se copia: lo cancelado y lo que nació de un PCI
  select count(*) into v_omitidas
    from public.plan_items pi
   where pi.service_id = p_service_id
     and pi.deleted_at is null
     and pi.scheduled_on between p_origen and p_origen + 6
     and (pi.status = 'cancelado' or pi.suspended_by_pci_id is not null);

  insert into public.plan_items (
    service_id, plan_id, activity_id, section_id, crew_id, unit_id,
    scheduled_on, prog_start_m, prog_end_m, target_qty, executed_qty,
    status, priority, sort_order, notes, created_by, lado, foto_referencia_path
  )
  select
    pi.service_id,
    v_plan_destino,
    pi.activity_id,
    pi.section_id,
    pi.crew_id,
    pi.unit_id,
    -- El mismo día de la semana, siete días más adelante o atrás
    p_destino + (pi.scheduled_on - p_origen),
    pi.prog_start_m,
    pi.prog_end_m,
    pi.target_qty,
    0,
    'programado',
    pi.priority,
    pi.sort_order,
    pi.notes,
    auth.uid(),
    pi.lado,
    pi.foto_referencia_path
  from public.plan_items pi
  where pi.service_id = p_service_id
    and pi.deleted_at is null
    and pi.scheduled_on between p_origen and p_origen + 6
    and pi.status <> 'cancelado'
    and pi.suspended_by_pci_id is null;

  get diagnostics v_copiadas = row_count;

  return json_build_object(
    'copiadas', v_copiadas,
    'omitidas', v_omitidas,
    'existentes', 0,
    'plan_id', v_plan_destino,
    'mensaje', format('Se copiaron %s partidas.', v_copiadas));
end $function$;

CREATE OR REPLACE FUNCTION public.enviar_parte(p_id uuid, p_crew_id uuid DEFAULT NULL::uuid, p_fecha date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.work_orders;
  v_sup uuid;
  v_cuadrilla text;
  v_faltan text[];
begin
  perform public.exigir_accion((public.parte_por(p_id, p_crew_id, p_fecha)).service_id, 'reporte_diario', 'crear');  -- Roles y permisos (0159)
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status = 'enviado' then return json_build_object('estado', 'enviado'); end if;
  if v.status = 'validado' then raise exception 'SIGOV: el parte ya está validado'; end if;
  if not exists (select 1 from public.work_entries e where e.work_order_id = v.id and e.deleted_at is null) then
    raise exception 'SIGOV: registra al menos una actividad antes de enviar el reporte';
  end if;
  -- CASO 15: con fotos pero sin metrado, el reporte sigue incompleto
  v_faltan := public.parte_sin_metrado(v.id);
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: reporte incompleto: % sin metrado (%). Registra el metrado antes de enviarlo',
      case when cardinality(v_faltan) = 1 then '1 actividad' else cardinality(v_faltan) || ' actividades' end,
      array_to_string(v_faltan, ', ');
  end if;

  -- J04: un exceso de metrado se guarda (alerta, no bloqueo), pero el envío exige su motivo
  select array_agg(coalesce(a.name, 'actividad') order by a.name) into v_faltan
    from public.work_entries e left join public.activities_catalog a on a.id = e.activity_id
   where e.work_order_id = v.id and e.deleted_at is null and e.exceso is not null and nullif(trim(e.exceso_motivo), '') is null;
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: hay metrado por encima de lo solicitado sin motivo (%). Confirma el exceso con su motivo antes de enviar',
      array_to_string(v_faltan, ', ');
  end if;

  -- Jefe F4: cada formato requerido del día lleva al menos un adjunto
  v_faltan := public.parte_sin_adjuntos(v.id);
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: falta el adjunto de: %. Carga la foto del formato en Seguridad › Documentos del día antes de enviar el reporte',
      array_to_string(v_faltan, ', ');
  end if;

  update public.work_orders set status = 'enviado', submitted_at = now(), updated_at = now() where id = v.id;

  -- El supervisor de la cuadrilla se entera; si no tiene, los supervisores del contrato
  select c.supervisor_id, c.name into v_sup, v_cuadrilla from public.crews c where c.id = v.crew_id;
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v.service_id, p, 'parte_enviado',
         format('Reporte diario %s · %s', to_char(v.work_date, 'DD/MM/YYYY'), coalesce(v_cuadrilla, '')),
         'Listo para validar', '/campo/' || v.id, 'info', jsonb_build_object('work_order_id', v.id)
    from (select v_sup as p where v_sup is not null
          union
          select m.profile_id from public.service_members m
           where v_sup is null and m.service_id = v.service_id and m.role = 'supervisor') x;

  return json_build_object('estado', 'enviado');
end $function$;

CREATE OR REPLACE FUNCTION public.parte_publicar(p_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_o public.work_orders; v_n int := 0; v_omitidos int := 0;
begin
  perform public.exigir_accion((select service_id from public.work_orders where id = p_ids[1]), 'reporte_diario', 'validar');  -- Roles y permisos (0159)
  for v_o in select * from public.work_orders where id = any(p_ids) and deleted_at is null for update loop
    if public.role_in(v_o.service_id) is distinct from 'residente' then
      raise exception 'SIGOV: solo el Residente publica a COVINCA' using errcode = '42501';
    end if;
    if v_o.status <> 'validado' or v_o.publicacion_version > 0 then v_omitidos := v_omitidos + 1; continue; end if;
    update public.work_orders set publicacion_version = 1, publicado_at = now(), publicado_por = auth.uid()
     where id = v_o.id;
    update public.evidences e set publicada_version = 1
      from public.work_entries w
     where e.work_entry_id = w.id and w.work_order_id = v_o.id and e.deleted_at is null and e.publicada_version is null;
    v_n := v_n + 1;
  end loop;
  return json_build_object('publicados', v_n, 'omitidos', v_omitidos);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_configurar_plazos(p_pci uuid, p_modo text, p_fechas jsonb DEFAULT '{}'::jsonb, p_fecha_base date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_contrastado boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.pcis;
  v_plazos jsonb;
  v_usados int[];
  v_limpias jsonb := '{}'::jsonb;
  k text; v text; t int;
  v_n int;
  v_version int;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci), 'pci', 'importar');  -- Roles y permisos (0159)
  select * into p from public.pcis where id = p_pci and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if public.role_in(p.service_id) is null or public.role_in(p.service_id) not in ('admin', 'supervisor', 'residente') then
    raise exception 'SIGOV: solo Administrador, Supervisor o Residente configuran los plazos' using errcode = '42501';
  end if;
  if p_modo not in ('oficiales', 'calculo') then raise exception 'SIGOV: modo de plazos no válido'; end if;
  -- La primera configuración (al importar un PCI nuevo) no pide motivo; un cambio, sí
  if p.plazos_version >= 1 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo del cambio de plazos: queda en el historial';
  end if;
  v_plazos := (public.ajustes_del_servicio(p.service_id)::jsonb)->'pci'->'plazos';
  select coalesce(array_agg(distinct term_days order by term_days), '{}') into v_usados
    from public.pci_items where pci_id = p.id and deleted_at is null and term_days is not null;

  if p_modo = 'oficiales' then
    if not coalesce(p_contrastado, false) then
      raise exception 'SIGOV: confirma que contrastaste las fechas con el oficio';
    end if;
    for k, v in select key, value from jsonb_each_text(coalesce(p_fechas, '{}'::jsonb)) loop
      if not (v_plazos @> to_jsonb(k::int)) then raise exception 'SIGOV: % días no es un plazo del contrato', k; end if;
      if nullif(trim(v), '') is null then continue; end if;
      v_limpias := v_limpias || jsonb_build_object(k, v::date);
    end loop;
    foreach t in array v_usados loop
      if not (v_limpias ? t::text) then
        raise exception 'SIGOV: falta la fecha oficial del plazo de % %', t, case when t = 1 then 'día' else 'días' end;
      end if;
    end loop;
    update public.pcis set modo_plazos = 'oficiales', vencimientos = v_limpias,
           oficio_contrastado_at = now(), oficio_contrastado_por = auth.uid(), updated_at = now()
     where id = p.id;
  else
    if p_fecha_base is null then raise exception 'SIGOV: indica la fecha base del cálculo'; end if;
    update public.pcis set modo_plazos = 'calculo', registered_on = p_fecha_base, vencimientos = '{}'::jsonb, updated_at = now()
     where id = p.id;
  end if;

  update public.pci_items i
     set due_date = public.vencimiento_pci(p.id, i.term_days), updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.term_days is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.due_date is distinct from public.vencimiento_pci(p.id, i.term_days);
  get diagnostics v_n = row_count;

  v_version := p.plazos_version + 1;
  update public.pcis set plazos_version = v_version where id = p.id;
  insert into public.pci_plazos_versiones (service_id, pci_id, version, modo, fecha_base, vencimientos, motivo, items_actualizados, quien)
  values (p.service_id, p.id, v_version, p_modo, case when p_modo = 'calculo' then p_fecha_base end,
          public.pci_plazos_resueltos(p.id), nullif(trim(p_motivo), ''), v_n, auth.uid());
  return json_build_object('version', v_version, 'items', v_n, 'vencimientos', public.pci_plazos_resueltos(p.id));
end $function$;

CREATE OR REPLACE FUNCTION public.pci_designar(p_pci uuid, p_crew uuid, p_jefe uuid, p_desde date, p_hasta date, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.pcis; c public.crews; v_act public.pci_designaciones;
  v_rol public.user_role; v_n int; v_conservados int; v_fuera int; v_id uuid;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci), 'pci', 'asignar');  -- Roles y permisos (0159)
  select * into p from public.pcis where id = p_pci and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  v_rol := public.role_in(p.service_id);
  if v_rol is null or v_rol not in ('supervisor', 'admin') then
    raise exception 'SIGOV: designar un PCI es del Supervisor autorizado (o del Administrador)' using errcode = '42501';
  end if;
  select * into c from public.crews where id = p_crew and service_id = p.service_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe en este contrato'; end if;
  if not public.revisa_cuadrilla(p.service_id, p_crew) then
    raise exception 'SIGOV: esa cuadrilla no está a tu cargo' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la designación'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'SIGOV: revisa la vigencia (desde ≤ hasta)'; end if;
  if p_jefe is not null and p_jefe is distinct from c.leader_id
     and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id = p_jefe and m.is_active) then
    raise exception 'SIGOV: el jefe elegido no pertenece a esa cuadrilla';
  end if;

  select * into v_act from public.pci_designaciones where pci_id = p.id and estado = 'vigente' for update;
  if found and v_act.crew_id <> p_crew then
    raise exception 'SIGOV: el PCI ya está designado a otra cuadrilla; retira esa designación primero (con motivo)';
  end if;
  if found then
    update public.pci_designaciones set estado = 'reemplazada' where id = v_act.id;
  end if;

  -- Lo abierto pasa a la cuadrilla; lo atendido conserva quién lo ejecutó
  perform set_config('sigov.motivo', 'Designación PCI completo: ' || trim(p_motivo), true);
  update public.pci_items i set assigned_crew_id = p_crew, updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.assigned_crew_id is distinct from p_crew and public.revisa_cuadrilla(p.service_id, i.assigned_crew_id);
  get diagnostics v_n = row_count;
  perform set_config('sigov.motivo', '', true);
  select count(*) filter (where status not in ('pendiente', 'en_atencion', 'observado')),
         count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and assigned_crew_id is distinct from p_crew)
    into v_conservados, v_fuera from public.pci_items where pci_id = p.id and deleted_at is null;

  insert into public.pci_designaciones (service_id, pci_id, crew_id, jefe_id, desde, hasta, motivo, items_asignados, items_conservados, creada_por)
  values (p.service_id, p.id, p_crew, coalesce(p_jefe, c.leader_id), p_desde, p_hasta, trim(p_motivo), v_n, v_conservados, auth.uid())
  returning id into v_id;

  if c.leader_id is not null and p.published_at is not null then
    perform public.aviso_vivo(p.service_id, c.leader_id, 'pci_publicado', 'asig:' || p.id || ':' || p_crew,
      format('PCI %s designado a tu cuadrilla', public.pci_corto(p.code)),
      format('Vigencia operacional %s – %s.', to_char(p_desde, 'DD/MM/YYYY'), to_char(p_hasta, 'DD/MM/YYYY')),
      '/pci/' || p.id, 'info', jsonb_build_object('pci_id', p.id, 'crew_id', p_crew));
  end if;
  perform public.pci_avisos(p.id);
  return json_build_object('designacion', v_id, 'asignados', v_n, 'conservan_ejecucion', v_conservados, 'fuera_de_alcance', v_fuera);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_fijar_plazo(p_items uuid[], p_plazo integer, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_servicio uuid;
  v_plazos jsonb;
  v_n int;
begin
  perform public.exigir_accion((select service_id from public.pci_items where id = p_items[1]), 'pci', 'editar');  -- Roles y permisos (0159)
  select distinct i.service_id into v_servicio from public.pci_items i where i.id = any(p_items);
  if v_servicio is null then raise exception 'SIGOV: no se encontraron los ítems'; end if;
  if (select count(distinct service_id) from public.pci_items where id = any(p_items)) > 1 then
    raise exception 'SIGOV: los ítems son de contratos distintos';
  end if;
  if not public.can_manage(v_servicio) then
    raise exception 'SIGOV: solo el supervisor o el administrador fija el plazo' using errcode = '42501';
  end if;
  v_plazos := (public.ajustes_del_servicio(v_servicio)::jsonb)->'pci'->'plazos';
  if not (v_plazos @> to_jsonb(p_plazo)) then
    raise exception 'SIGOV: el plazo debe ser uno de los del contrato: %', v_plazos;
  end if;

  -- El vencimiento se cuenta desde la recepción del PCI (o su notificación)
  update public.pci_items i
     set term_days = p_plazo,
         due_date = public.vencimiento_pci(p.id, p_plazo),
         notes = coalesce(nullif(trim(p_motivo), '') || coalesce(' · ' || i.notes, ''), i.notes),
         updated_at = now()
    from public.pcis p
   where p.id = i.pci_id and i.id = any(p_items) and i.deleted_at is null
     and i.status in ('pendiente', 'en_atencion', 'observado');
  get diagnostics v_n = row_count;

  -- Los contadores y el estado del PCI los recalcula su trigger
  return json_build_object('items', v_n, 'plazo', p_plazo);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_fijar_vencimientos(p_pci uuid, p_fechas jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.pcis;
  v_plazos jsonb;
  v_limpias jsonb := '{}'::jsonb;
  k text;
  v text;
  v_n int;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci), 'pci', 'editar');  -- Roles y permisos (0159)
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if not public.can_manage(p.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador fija los vencimientos' using errcode = '42501';
  end if;
  v_plazos := (public.ajustes_del_servicio(p.service_id)::jsonb)->'pci'->'plazos';

  for k, v in select key, value from jsonb_each_text(coalesce(p_fechas, '{}'::jsonb)) loop
    if not (v_plazos @> to_jsonb(k::int)) then
      raise exception 'SIGOV: % días no es un plazo del contrato', k;
    end if;
    if nullif(trim(v), '') is null then continue; end if;
    if v::date <= p.registered_on then
      raise exception 'SIGOV: el vencimiento de % días debe ser posterior al registro (%)', k, to_char(p.registered_on, 'DD/MM/YYYY');
    end if;
    v_limpias := v_limpias || jsonb_build_object(k, v::date);
  end loop;

  update public.pcis set vencimientos = v_limpias, updated_at = now() where id = p.id;

  update public.pci_items i
     set due_date = public.vencimiento_pci(p.id, i.term_days), updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.term_days is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.due_date is distinct from public.vencimiento_pci(p.id, i.term_days);
  get diagnostics v_n = row_count;

  return json_build_object('items', v_n, 'vencimientos', v_limpias);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_iniciar_atencion(p_item uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila  public.pci_items;
  v_nuevo public.pci_item_status;
begin
  perform public.exigir_accion((select service_id from public.pci_items where id = p_item), 'pci', 'editar');  -- Roles y permisos (0159)
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status = 'en_atencion' then
    return json_build_object('estado', 'en_atencion');
  end if;
  if v_fila.status not in ('pendiente', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  v_nuevo := case when v_fila.status = 'observado'
                  then 'observado'::public.pci_item_status
                  else 'en_atencion'::public.pci_item_status end;

  update public.pci_items
     set status = v_nuevo,
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;
  return json_build_object('estado', v_nuevo);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_levantar(p_item uuid, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila    public.pci_items;
  v_antes   int;
  v_durante int;
  v_despues int;
  v_metrado numeric;
  v_nuevo   public.pci_item_status;
begin
  perform public.exigir_accion((select service_id from public.pci_items where id = p_item), 'pci', 'editar');  -- Roles y permisos (0159)
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status not in ('pendiente', 'en_atencion', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  if v_fila.requires_evidence then
    select count(*) filter (where e.phase = 'antes'),
           count(*) filter (where e.phase = 'durante'),
           count(*) filter (where e.phase = 'despues')
      into v_antes, v_durante, v_despues
      from public.evidences e
     where e.pci_item_id = p_item and e.deleted_at is null;
    if v_antes = 0 then
      raise exception 'SIGOV: falta la foto del antes';
    end if;
    if v_durante = 0 then
      raise exception 'SIGOV: falta la foto del durante: con las tres fotos el ítem pasa a «Por validar»';
    end if;
    if v_despues = 0 then
      raise exception 'SIGOV: falta la foto del después, que es la que sustenta el levantamiento';
    end if;
  end if;

  -- El metrado lo registra la cuadrilla; quien administra puede levantar
  -- desde la oficina un ítem que no se mide
  if not public.can_manage(v_fila.service_id) then
    select coalesce(sum(w.quantity), 0) into v_metrado
      from public.work_entries w
     where w.pci_item_id = p_item and w.deleted_at is null;
    if v_metrado <= 0 then
      raise exception 'SIGOV: registra primero el metrado ejecutado de este ítem';
    end if;
  end if;

  v_nuevo := case when v_fila.status = 'observado' then 'subsanado' else 'levantado' end;

  update public.pci_items
     set status = v_nuevo,
         closed_at = now(),
         closed_by = auth.uid(),
         validado_servicon_at = null,
         validado_servicon_by = null,
         notes = coalesce(nullif(trim(p_nota), ''), notes)
   where id = p_item;

  -- Un aviso por PCI a quienes revisan, no uno por ítem (CASO 26)
  perform public.pci_avisos(v_fila.pci_id);

  return json_build_object('estado', v_nuevo);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_publicar(p_items uuid[], p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item public.pci_items;
  v_sid uuid;
  v_version int;
  v_ev uuid[];
  v_pcis uuid[] := '{}';
  v_hechos int := 0;
  v_omitidos jsonb := '[]';
  r record;
begin
  perform public.exigir_accion((select service_id from public.pci_items where id = p_items[1]), 'pci', 'validar');  -- Roles y permisos (0159)
  if p_items is null or cardinality(p_items) = 0 then raise exception 'SIGOV: elige al menos un ítem'; end if;
  select service_id into v_sid from public.pci_items where id = p_items[1];
  if public.role_in(v_sid) is distinct from 'residente' then
    raise exception 'SIGOV: solo el Residente publica a COVINCA' using errcode = '42501';
  end if;

  for v_item in select * from public.pci_items where id = any(p_items) and deleted_at is null order by item_number for update loop
    if v_item.service_id <> v_sid then continue; end if;
    -- Solo lo validado por SERVICON y aún no publicado en esa versión
    if v_item.validado_servicon_at is null or v_item.status not in ('levantado', 'subsanado') then
      v_omitidos := v_omitidos || jsonb_build_object('item', v_item.item_number, 'motivo', 'sin validación SERVICON');
      continue;
    end if;
    if v_item.publicacion_version > 0 and not v_item.publicacion_pendiente and v_item.covinca_estado <> 'observado' then
      v_omitidos := v_omitidos || jsonb_build_object('item', v_item.item_number, 'motivo', 'ya publicado en v' || v_item.publicacion_version);
      continue;
    end if;
    v_version := v_item.publicacion_version + 1;
    update public.evidences set publicada_version = v_version
     where pci_item_id = v_item.id and deleted_at is null and publicada_version is null;
    select coalesce(array_agg(e.id order by e.created_at), '{}') into v_ev
      from public.evidences e where e.pci_item_id = v_item.id and e.deleted_at is null;
    update public.pci_items
       set publicacion_version = v_version, publicado_at = now(), publicado_por = auth.uid(),
           publicacion_pendiente = false, covinca_estado = 'por_revisar', updated_at = now()
     where id = v_item.id;
    insert into public.pci_item_publicaciones (service_id, pci_id, pci_item_id, version, evidencias, nota, quien)
    values (v_item.service_id, v_item.pci_id, v_item.id, v_version, v_ev, nullif(trim(p_nota), ''), auth.uid());
    -- La respuesta a lo que COVINCA observó queda «Respondida» al publicarse
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = v_item.id and o.origen = 'COVINCA' and o.estado = 'abierta' loop
      update public.revision_observaciones set estado = 'respondida' where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'publicada', format('Evidencia validada y publicada v%s', v_version), v_version, 'abierta', 'respondida', auth.uid(), 'SERVICON');
    end loop;
    v_hechos := v_hechos + 1;
    if not v_item.pci_id = any(v_pcis) then v_pcis := v_pcis || v_item.pci_id; end if;
  end loop;

  -- Un aviso por PCI, no por ítem
  for r in select unnest(v_pcis) pci loop
    perform public.pci_avisos(r.pci);
  end loop;
  return json_build_object('publicados', v_hechos, 'omitidos', v_omitidos);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_retirar_designacion(p_pci uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.pci_designaciones; p public.pcis; c public.crews; v_n int;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci), 'pci', 'asignar');  -- Roles y permisos (0159)
  select * into d from public.pci_designaciones where pci_id = p_pci and estado = 'vigente' for update;
  if not found then raise exception 'SIGOV: el PCI no tiene una designación vigente'; end if;
  select * into p from public.pcis where id = d.pci_id;
  if public.role_in(d.service_id) is distinct from 'supervisor' or not public.revisa_cuadrilla(d.service_id, d.crew_id) then
    raise exception 'SIGOV: el retiro es exclusivo del Supervisor autorizado de esa cuadrilla' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: elige el motivo de retiro'; end if;

  perform set_config('sigov.motivo', 'Retiro de designación: ' || trim(p_motivo), true);
  update public.pci_items i set assigned_crew_id = null, updated_at = now()
   where i.pci_id = d.pci_id and i.deleted_at is null and i.assigned_crew_id = d.crew_id
     and i.status in ('pendiente', 'en_atencion', 'observado');
  get diagnostics v_n = row_count;
  perform set_config('sigov.motivo', '', true);

  update public.pci_designaciones
     set estado = 'retirada', retirada_por = auth.uid(), retirada_at = now(), motivo_retiro = trim(p_motivo), items_liberados = v_n
   where id = d.id;
  select * into c from public.crews where id = d.crew_id;
  if c.leader_id is not null then
    perform public.aviso_resolver(c.leader_id, 'pci_publicado', 'asig:' || d.pci_id || ':' || d.crew_id);
    perform public.aviso_vivo(d.service_id, c.leader_id, 'pci_designacion_retirada', 'ret:' || d.pci_id,
      format('PCI %s: designación retirada', public.pci_corto(p.code)),
      'Se conservan tus fotos, tu autoría y el avance registrado. Motivo: ' || trim(p_motivo),
      '/pci', 'warning', jsonb_build_object('pci_id', d.pci_id, 'crew_id', d.crew_id));
  end if;
  perform public.pci_avisos(d.pci_id);
  return json_build_object('liberados', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_validar(p_item uuid, p_conforme boolean, p_nota text DEFAULT NULL::text, p_fase text DEFAULT NULL::text, p_version integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila public.pci_items;
  v_rol public.user_role;
  v_nivel text;
  v_entidad text;
  v_estado text;
  v_falta text[];
  v_obs uuid;
  r record;
begin
  perform public.exigir_accion((select service_id from public.pci_items where id = p_item), 'pci', 'validar');  -- Roles y permisos (0159)
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null for update;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  v_rol := public.role_in(v_fila.service_id);

  if v_rol = 'visor' then
    v_nivel := 'covinca'; v_entidad := 'COVINCA';
  elsif v_rol in ('admin', 'residente', 'supervisor') and public.revisa_cuadrilla(v_fila.service_id, v_fila.assigned_crew_id) then
    v_nivel := 'servicon'; v_entidad := 'SERVICON';
  else
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente, el administrador o COVINCA revisan este ítem' using errcode = '42501';
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe el motivo: la cuadrilla necesita saber qué corregir';
  end if;
  if p_fase is not null and p_fase not in ('antes', 'durante', 'despues', 'general', 'metrado', 'otro') then
    raise exception 'SIGOV: fase no válida';
  end if;

  if v_nivel = 'covinca' then
    -- COVINCA revisa la versión publicada, y solo la vigente
    if v_fila.publicacion_version = 0 then
      raise exception 'SIGOV: este ítem aún no se publica a COVINCA';
    end if;
    if p_version is not null and p_version <> v_fila.publicacion_version then
      raise exception 'SIGOV: se publicó la versión v% mientras revisabas la v%. Actualiza y revisa la versión vigente antes de decidir', v_fila.publicacion_version, p_version;
    end if;
    if v_fila.covinca_estado = 'conforme' and v_fila.covinca_version = v_fila.publicacion_version and p_conforme then
      raise exception 'SIGOV: la versión v% ya tiene conformidad COVINCA', v_fila.publicacion_version;
    end if;
    -- Lo observado espera la nueva versión publicada: no se conforma a medias
    if p_conforme and v_fila.covinca_estado <> 'por_revisar' then
      raise exception 'SIGOV: no hay una versión nueva por revisar: espera a que SERVICON subsane y el Residente publique';
    end if;
    if not p_conforme and v_fila.covinca_estado = 'observado' and v_fila.covinca_version = v_fila.publicacion_version then
      raise exception 'SIGOV: ya observaste la versión v%; agrega el detalle en la misma observación (Mantener observación)', v_fila.publicacion_version;
    end if;
    if p_conforme then
      v_falta := public.pci_item_fases_faltantes(p_item, true);
      if cardinality(v_falta) > 0 then
        raise exception 'SIGOV: Aceptar requiere resolver falta de evidencia (%). Observa el ítem indicando la fase', array_to_string(array(select public.fase_legible(x) from unnest(v_falta) x), ', ');
      end if;
    end if;
  else
    if v_fila.status not in ('levantado', 'subsanado') then
      raise exception 'SIGOV: el ítem no está por validar (está %)', v_fila.status;
    end if;
    if v_fila.validado_servicon_at is not null and p_conforme then
      raise exception 'SIGOV: SERVICON ya validó este ítem; falta la publicación y la conformidad de COVINCA';
    end if;
    if p_conforme then
      -- Nadie valida su propio trabajo (guía 2.3)
      if v_fila.closed_by = auth.uid() then
        raise exception 'SIGOV: no puedes validar un ítem que tú mismo culminaste' using errcode = '42501';
      end if;
      v_falta := public.pci_item_fases_faltantes(p_item, false);
      if v_fila.requires_evidence and cardinality(v_falta) > 0 then
        raise exception 'SIGOV: falta evidencia requerida (%). Devuelve el ítem al jefe con el motivo', array_to_string(array(select public.fase_legible(x) from unnest(v_falta) x), ', ');
      end if;
    end if;
  end if;

  if p_conforme and v_nivel = 'servicon' then
    update public.pci_items
       set validado_servicon_at = now(), validado_servicon_by = auth.uid(), updated_at = now()
     where id = p_item;
    v_estado := 'validado_servicon';
    -- Las observaciones SERVICON del ítem quedan cerradas con la validación
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = p_item and o.origen = 'SERVICON' and o.estado <> 'cerrada' loop
      update public.revision_observaciones set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_at = now() where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'cerrada', coalesce(nullif(trim(p_nota), ''), 'Subsanación verificada: validado SERVICON'), v_fila.publicacion_version, r.estado, 'cerrada', auth.uid(), 'SERVICON');
    end loop;
  elsif p_conforme then
    update public.pci_items
       set status = 'validado', validated_at = now(), validated_by = auth.uid(), reject_reason = null,
           covinca_estado = 'conforme', covinca_version = v_fila.publicacion_version, updated_at = now()
     where id = p_item;
    v_estado := 'validado';
    -- «Conformar y cerrar»: se cierran las observaciones COVINCA del ítem
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = p_item and o.origen = 'COVINCA' and o.estado <> 'cerrada' loop
      update public.revision_observaciones set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_at = now() where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'cerrada', coalesce(nullif(trim(p_nota), ''), 'Conforme COVINCA'), v_fila.publicacion_version, r.estado, 'cerrada', auth.uid(), 'COVINCA');
    end loop;
  else
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_nota),
           observado_at = now(), observado_por = auth.uid(), observado_entidad = v_entidad,
           validado_servicon_at = null, validado_servicon_by = null,
           covinca_estado = case when v_nivel = 'covinca' then 'observado' else covinca_estado end,
           covinca_version = case when v_nivel = 'covinca' then v_fila.publicacion_version else covinca_version end,
           updated_at = now()
     where id = p_item;
    v_estado := 'observado';
    -- El caso, con su hilo
    insert into public.revision_observaciones (codigo, service_id, pci_id, pci_item_id, origen, fase, motivo, crew_id,
                                               version_observada, creada_por)
    values (public.obs_codigo(p_item, v_fila.item_number), v_fila.service_id, v_fila.pci_id, p_item, v_entidad, p_fase,
            trim(p_nota), v_fila.assigned_crew_id, nullif(v_fila.publicacion_version, 0), auth.uid())
    returning id into v_obs;
    insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_nuevo, autor, organizacion)
    values (v_obs, 'creada', trim(p_nota), nullif(v_fila.publicacion_version, 0), 'abierta', auth.uid(), v_entidad);
  end if;

  insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad, evidencias)
  values (v_fila.service_id, v_fila.pci_id, p_item, v_nivel, case when p_conforme then 'conforme' else 'observado' end,
          nullif(trim(p_nota), ''), auth.uid(), v_rol::text, v_entidad,
          (select array_agg(e.id order by e.created_at) from public.evidences e where e.pci_item_id = p_item and e.deleted_at is null));

  perform public.pci_avisos(v_fila.pci_id);
  return json_build_object('estado', v_estado, 'nivel', v_nivel, 'observacion_id', v_obs);
end $function$;

CREATE OR REPLACE FUNCTION public.programar_observacion(p_id uuid, p_fecha date, p_crew_id uuid DEFAULT NULL::uuid, p_activity_id uuid DEFAULT NULL::uuid, p_metrado numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.observaciones_campo;
  v_actividad public.activities_catalog;
  v_lunes date := p_fecha - (extract(isodow from p_fecha)::int - 1);
  v_plan uuid;
  v_partida uuid;
  v_foto text;
begin
  perform public.exigir_accion((select service_id from public.observaciones_campo where id = p_id), 'observaciones', 'asignar');  -- Roles y permisos (0159)
  select * into o from public.observaciones_campo where id = p_id and deleted_at is null for update;
  if o.id is null then
    raise exception 'SIGOV: la observación ya no existe';
  end if;
  if not public.can_manage(o.service_id) then
    raise exception 'SIGOV: solo el supervisor o el residente programan' using errcode = '42501';
  end if;
  if o.plan_item_id is not null and exists (
       select 1 from public.plan_items where id = o.plan_item_id and deleted_at is null and status <> 'cancelado') then
    raise exception 'SIGOV: la observación ya está programada';
  end if;
  if o.section_id is null or o.progresiva_m is null then
    raise exception 'SIGOV: la observación no tiene tramo ni progresiva; corrígela antes de programarla';
  end if;

  select * into v_actividad from public.activities_catalog
   where id = coalesce(p_activity_id, o.activity_id) and service_id = o.service_id and deleted_at is null;
  if v_actividad.id is null then
    raise exception 'SIGOV: elige el tipo de actividad para programarla';
  end if;

  -- La programación de esa semana, o una nueva en borrador
  select id into v_plan from public.weekly_plans
   where service_id = o.service_id and starts_on = v_lunes and deleted_at is null
   order by created_at limit 1;
  if v_plan is null then
    insert into public.weekly_plans (service_id, year, week, starts_on, ends_on, status, created_by)
    values (o.service_id, extract(isoyear from v_lunes)::smallint, extract(week from v_lunes)::smallint,
            v_lunes, v_lunes + 6, 'borrador', auth.uid())
    returning id into v_plan;
  end if;

  select e.storage_path into v_foto from public.evidences e
   where e.observacion_id = o.id and e.deleted_at is null order by e.taken_at limit 1;

  insert into public.plan_items (
    service_id, plan_id, activity_id, section_id, crew_id, unit_id, scheduled_on,
    prog_start_m, prog_end_m, target_qty, status, lado, origen, notes, foto_referencia_path, created_by
  ) values (
    o.service_id, v_plan, v_actividad.id, o.section_id, coalesce(p_crew_id, o.crew_id), v_actividad.unit_id, p_fecha,
    least(o.progresiva_m, coalesce(o.progresiva_fin_m, o.progresiva_m)),
    greatest(o.progresiva_m, coalesce(o.progresiva_fin_m, o.progresiva_m)),
    coalesce(p_metrado, o.metrado, 0), 'programado', o.side, 'MR',
    left('Observación de campo: ' || o.descripcion, 500), v_foto, auth.uid()
  ) returning id into v_partida;

  update public.observaciones_campo
     set estado = 'programada', programada_on = p_fecha, plan_item_id = v_partida,
         activity_id = v_actividad.id, metrado = coalesce(p_metrado, metrado)
   where id = o.id;
  return v_partida;
end $function$;

CREATE OR REPLACE FUNCTION public.publicar_pci(p_pci_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.pcis;
  v_sin_cuadrilla int;
  v_avisados int;
begin
  perform public.exigir_accion((select service_id from public.pcis where id = p_pci_id), 'pci', 'crear');  -- Roles y permisos (0159)
  select * into p from public.pcis where id = p_pci_id and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if not public.can_manage(p.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador publica un PCI' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pci_items where pci_id = p.id and deleted_at is null) then
    raise exception 'SIGOV: el PCI no tiene ítems; impórtalos antes de publicarlo';
  end if;

  select count(*) into v_sin_cuadrilla
    from public.pci_items
   where pci_id = p.id and deleted_at is null and assigned_crew_id is null
     and status in ('pendiente', 'en_atencion', 'observado');

  if p.published_at is null then
    update public.pcis set published_at = now(), published_by = auth.uid(), updated_at = now()
     where id = p.id;
  end if;

  -- Un aviso por jefe con ítems abiertos, sin repetir al que ya lo recibió
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select p.service_id, c.leader_id, 'pci_publicado',
         format('Nuevo PCI · %s', p.code),
         format('%s ítem%s para tu cuadrilla. El primero vence el %s.',
                count(*), case when count(*) = 1 then '' else 's' end,
                to_char(min(i.due_date), 'DD/MM')),
         '/pci/' || p.id, 'warning',
         jsonb_build_object('pci_id', p.id, 'crew_id', c.id, 'items', count(*))
    from public.pci_items i
    join public.crews c on c.id = i.assigned_crew_id
   where i.pci_id = p.id and i.deleted_at is null and c.leader_id is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and not exists (select 1 from public.notifications n
                      where n.profile_id = c.leader_id and n.type = 'pci_publicado'
                        and n.data->>'pci_id' = p.id::text)
   group by c.id, c.leader_id;
  get diagnostics v_avisados = row_count;

  return json_build_object('avisados', v_avisados, 'sin_cuadrilla', v_sin_cuadrilla);
end $function$;

CREATE OR REPLACE FUNCTION public.reasignar_cuadrilla(p_tipo text, p_ids uuid[], p_crew uuid, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid;
  v_n int := 0;
  v_con_cuadrilla int;
  r record;
begin
  perform public.exigir_accion(case when p_tipo = 'pci' then (select service_id from public.pci_items where id = p_ids[1]) else (select service_id from public.plan_items where id = p_ids[1]) end, case when p_tipo = 'pci' then 'pci' else 'programacion' end, 'asignar');  -- Roles y permisos (0159)
  if p_tipo not in ('pci', 'partida') then raise exception 'SIGOV: tipo no válido'; end if;
  if p_tipo = 'pci' then
    select service_id, count(*) filter (where assigned_crew_id is not null and assigned_crew_id is distinct from p_crew)
      into v_sid, v_con_cuadrilla from public.pci_items where id = any(p_ids) group by service_id;
  else
    select service_id, count(*) filter (where crew_id is not null and crew_id is distinct from p_crew)
      into v_sid, v_con_cuadrilla from public.plan_items where id = any(p_ids) group by service_id;
  end if;
  if v_sid is null then return json_build_object('cambiados', 0); end if;
  if not public.revisa_cuadrilla(v_sid, p_crew) then
    raise exception 'SIGOV: no puedes asignar a esa cuadrilla' using errcode = '42501';
  end if;
  if v_con_cuadrilla > 0 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo de la reasignación: queda en el historial';
  end if;
  perform set_config('sigov.motivo', coalesce(trim(p_motivo), ''), true);

  if p_tipo = 'pci' then
    update public.pci_items i set assigned_crew_id = p_crew, updated_at = now()
     where i.id = any(p_ids) and i.assigned_crew_id is distinct from p_crew
       and public.revisa_cuadrilla(i.service_id, i.assigned_crew_id);
    get diagnostics v_n = row_count;
    -- Un aviso por PCI a la cuadrilla nueva, no uno por ítem (CASO 6)
    for r in
      select i.pci_id, p.code, p.service_id, c.leader_id, count(*) n
        from public.pci_items i join public.pcis p on p.id = i.pci_id join public.crews c on c.id = p_crew
       where i.id = any(p_ids) and p.published_at is not null
       group by i.pci_id, p.code, p.service_id, c.leader_id
    loop
      perform public.aviso_vivo(r.service_id, r.leader_id, 'pci_publicado', 'asig:' || r.pci_id || ':' || p_crew,
        format('PCI %s asignado a su cuadrilla', public.pci_corto(r.code)),
        format('%s %s para tu cuadrilla.', r.n, case when r.n = 1 then 'ítem' else 'ítems' end),
        '/pci/' || r.pci_id, 'info', jsonb_build_object('pci_id', r.pci_id, 'crew_id', p_crew, 'items', r.n));
      perform public.pci_avisos(r.pci_id);
    end loop;
  else
    update public.plan_items i set crew_id = p_crew, updated_at = now()
     where i.id = any(p_ids) and i.crew_id is distinct from p_crew
       and public.revisa_cuadrilla(i.service_id, i.crew_id);
    get diagnostics v_n = row_count;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('cambiados', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.reenviar_pedido(p_request_id uuid, p_items jsonb, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r public.supply_requests;
  v_item jsonb;
begin
  perform public.exigir_accion((select service_id from public.supply_requests where id = p_request_id), 'materiales', 'crear');  -- Roles y permisos (0159)
  select * into v_r from public.supply_requests where id = p_request_id and deleted_at is null for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  if v_r.status <> 'observado' then
    raise exception 'Solo se reenvía un pedido observado (este está %).', v_r.status;
  end if;
  if not (v_r.created_by = auth.uid() or public.can_manage(v_r.service_id)) then
    raise exception 'SIGOV: solo quien pidió o quien administra reenvía el pedido' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  update public.supply_request_items set deleted_at = now(), updated_at = now()
   where request_id = p_request_id and deleted_at is null;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, notes)
    values (
      v_r.service_id, p_request_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  -- El motivo se conserva; lo que se corrigió queda en la trazabilidad
  update public.supply_requests
     set status = 'solicitado',
         review_note = nullif(btrim(p_nota), ''), reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_request_id;
end $function$;

CREATE OR REPLACE FUNCTION public.rendicion_generar(p_box uuid, p_desde date, p_hasta date, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.cash_boxes; v_id uuid; v_cod text; v_n int;
begin
  perform public.exigir_accion((select service_id from public.cash_boxes where id = p_box), 'caja', 'crear');  -- Roles y permisos (0159)
  select * into b from public.cash_boxes where id = p_box and deleted_at is null;
  if not found then raise exception 'SIGOV: la caja no existe'; end if;
  if not (public.role_in(b.service_id) in ('admin', 'residente') or b.holder_id = auth.uid()) then
    raise exception 'SIGOV: la rendición la presenta el responsable de la caja o administración' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'SIGOV: revisa el periodo'; end if;
  select count(*) into v_n from public.cash_movements
   where cash_box_id = b.id and deleted_at is null and kind = 'gasto' and rendicion_id is null and status in ('registrado', 'observado')
     and occurred_on between p_desde and p_hasta;
  if v_n = 0 then raise exception 'SIGOV: no hay gastos por rendir en ese periodo'; end if;
  insert into public.rendiciones (service_id, numero, cash_box_id, crew_id, desde, hasta, responsable_id, nota, creado_por)
  values (b.service_id, public.ssoma_siguiente(b.service_id, 'rendiciones'), b.id, b.crew_id, p_desde, p_hasta, b.holder_id, nullif(trim(p_nota), ''), auth.uid())
  returning id, codigo into v_id, v_cod;
  update public.cash_movements set rendicion_id = v_id
   where cash_box_id = b.id and deleted_at is null and kind = 'gasto' and rendicion_id is null and status in ('registrado', 'observado')
     and occurred_on between p_desde and p_hasta;
  return json_build_object('id', v_id, 'codigo', v_cod, 'gastos', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.rendicion_revisar(p_rend uuid, p_aprobar boolean, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.rendiciones;
begin
  perform public.exigir_accion((select service_id from public.rendiciones where id = p_rend), 'caja', 'validar');  -- Roles y permisos (0159)
  select * into r from public.rendiciones where id = p_rend for update;
  if not found then raise exception 'SIGOV: la rendición no existe'; end if;
  if public.role_in(r.service_id) not in ('admin', 'residente') then
    raise exception 'SIGOV: solo personal autorizado aprueba rendiciones' using errcode = '42501';
  end if;
  if auth.uid() in (r.responsable_id, r.creado_por) then raise exception 'SIGOV: nadie aprueba su propia rendición' using errcode = '42501'; end if;
  if r.estado = 'aprobada' then raise exception 'SIGOV: la rendición ya está aprobada'; end if;
  if not p_aprobar and nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la observación'; end if;
  if length(coalesce(trim(p_motivo), '')) > 500 then raise exception 'SIGOV: el motivo admite hasta 500 caracteres'; end if;
  perform set_config('sigov.motivo', coalesce(trim(p_motivo), ''), true);
  update public.cash_movements set status = case when p_aprobar then 'aprobado'::cash_movement_status else 'observado'::cash_movement_status end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_motivo), '')
   where rendicion_id = r.id and deleted_at is null and status in ('registrado', 'observado');
  update public.rendiciones set estado = case when p_aprobar then 'aprobada' else 'observada' end, motivo = nullif(trim(p_motivo), ''),
         revisado_por = auth.uid(), revisado_at = now()
   where id = r.id;
  perform set_config('sigov.motivo', '', true);
  if r.responsable_id is not null then
    perform public.aviso_vivo(r.service_id, r.responsable_id, 'rendicion_revisada', 'rnd:' || r.id,
      format('Rendición %s %s', r.codigo, case when p_aprobar then 'aprobada' else 'observada' end),
      coalesce(nullif(trim(p_motivo), ''), 'Revisada por administración.'), '/caja', case when p_aprobar then 'info' else 'warning' end, jsonb_build_object('rendicion_id', r.id));
  end if;
  return json_build_object('estado', case when p_aprobar then 'aprobada' else 'observada' end);
end $function$;

CREATE OR REPLACE FUNCTION public.requerimiento_guardar(p_plan uuid, p_crew uuid, p_lineas jsonb, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w public.weekly_plans; l jsonb; v_version int;
begin
  perform public.exigir_accion((select service_id from public.weekly_plans where id = p_plan), 'materiales', 'crear');  -- Roles y permisos (0159)
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) or not public.revisa_cuadrilla(w.service_id, p_crew) then
    raise exception 'SIGOV: el requerimiento lo guarda el Supervisor de la cuadrilla' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'SIGOV: el requerimiento no tiene líneas'; end if;
  for l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((l->>'practica')::numeric, -1) < 0 then
      raise exception 'SIGOV: el pedido práctico de % no es válido', l->>'recurso';
    end if;
    -- El redondeo sugerido no pide motivo; apartarse de él (ajuste del Supervisor), sí
    if round((l->>'practica')::numeric, 3) <> round(coalesce((l->>'sugerido')::numeric, (l->>'requerir')::numeric, 0), 3)
       and nullif(trim(l->>'motivo'), '') is null then
      raise exception 'SIGOV: escribe el motivo del ajuste de % (pedido % frente a % sugerido)', l->>'recurso', l->>'practica', coalesce(l->>'sugerido', l->>'requerir');
    end if;
  end loop;
  select coalesce(max(version), 0) + 1 into v_version from public.requerimientos_insumos where plan_id = w.id and crew_id = p_crew;
  insert into public.requerimientos_insumos (service_id, plan_id, crew_id, version, lineas, nota, quien)
  values (w.service_id, w.id, p_crew, v_version, p_lineas, nullif(trim(p_nota), ''), auth.uid());
  return json_build_object('version', v_version);
end $function$;

CREATE OR REPLACE FUNCTION public.revert_pci_suspension(p_suspension_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_service uuid;
begin
  perform public.exigir_accion((select service_id from public.plan_suspensions where id = p_suspension_id), 'pci', 'editar');  -- Roles y permisos (0159)
  select service_id into v_service from public.plan_suspensions where id = p_suspension_id;
  if v_service is null then
    raise exception 'SIGOV: suspensión no encontrada';
  end if;
  if not public.can_manage(v_service) then
    raise exception 'SIGOV: solo el supervisor o el administrador reordenan la programación'
      using errcode = '42501';
  end if;
  return public.revert_pci_suspension_sin_permiso(p_suspension_id);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_documento(p_documento_id uuid, p_conforme boolean, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc   public.documentos_del_dia;
  v_lider uuid;
  v_nombre text;
begin
  perform public.exigir_accion((select service_id from public.documentos_del_dia where id = p_documento_id), 'ssoma', 'validar');  -- Roles y permisos (0159)
  select * into v_doc from public.documentos_del_dia where id = p_documento_id and deleted_at is null;
  if not found then raise exception 'SIGOV: ese documento ya no existe'; end if;
  if not public.puede_revisar_ssoma(v_doc.service_id) then
    raise exception 'SIGOV: solo el Ing. SSOMA o el supervisor revisan documentos' using errcode = '42501';
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;

  update public.documentos_del_dia
     set estado = case when p_conforme then 'conforme'::public.revision_ssoma else 'observado'::public.revision_ssoma end,
         observacion = case when p_conforme then observacion else trim(p_nota) end,
         revisado_por = auth.uid(),
         revisado_en = now(),
         updated_at = now()
   where id = p_documento_id;

  if not p_conforme then
    select c.leader_id into v_lider from public.crews c where c.id = v_doc.crew_id;
    v_nombre := case v_doc.tipo
      when 'ats' then 'ATS'
      when 'charla' then 'Charla de 5 minutos'
      when 'checklist_vehicular' then 'Checklist vehicular'
      when 'higiene' then 'Higiene'
      when 'inspeccion_equipos' then 'Inspección de equipos'
      else coalesce(v_doc.titulo, 'Documento') end;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v_doc.service_id, v_lider, 'ssoma_observado',
              format('%s del %s observado', v_nombre, to_char(v_doc.doc_date, 'DD/MM/YYYY')),
              trim(p_nota), '/ssoma', 'warning',
              jsonb_build_object('documento_id', v_doc.id));
    end if;
  end if;

  return json_build_object('estado', case when p_conforme then 'conforme' else 'observado' end);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_foto(p_evidencia uuid, p_conforme boolean, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v public.evidences;

  v_lider uuid;

  v_url text;

  v_que text;

begin
  perform public.exigir_accion((select service_id from public.evidences where id = p_evidencia), 'reporte_diario', 'validar');  -- Roles y permisos (0159)

  select * into v from public.evidences where id = p_evidencia and deleted_at is null;

  if not found then raise exception 'SIGOV: esa foto ya no existe'; end if;

  if not (public.revisa_cuadrilla(v.service_id, public.cuadrilla_de_evidencia(v.id)) or public.role_in(v.service_id) = 'visor') then

    raise exception 'SIGOV: solo COVINCA o el supervisor revisan las fotos' using errcode = '42501';

  end if;

  if not p_conforme and nullif(trim(p_nota), '') is null then

    raise exception 'SIGOV: escribe la observación: la cuadrilla necesita saber qué corregir';

  end if;



  update public.evidences

     set revision = case when p_conforme then 'conforme' else 'observada' end,

         revision_nota = nullif(trim(p_nota), ''),

         revisada_por = auth.uid(),

         revisada_at = now()

   where id = v.id;



  -- La cuadrilla se entera para tomarla de nuevo

  if not p_conforme then

    if v.work_entry_id is not null then

      select c.leader_id, '/campo/' || o.id, coalesce(a.name, 'actividad')

        into v_lider, v_url, v_que

        from public.work_entries we

        join public.work_orders o on o.id = we.work_order_id

        join public.crews c on c.id = o.crew_id

        left join public.activities_catalog a on a.id = we.activity_id

       where we.id = v.work_entry_id;

    elsif v.pci_item_id is not null then

      select c.leader_id, '/pci/' || i.pci_id, p.code || ' · ítem ' || i.item_number

        into v_lider, v_url, v_que

        from public.pci_items i

        join public.pcis p on p.id = i.pci_id

        left join public.crews c on c.id = i.assigned_crew_id

       where i.id = v.pci_item_id;

    end if;

    if v_lider is not null then

      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)

      values (v.service_id, v_lider, 'foto_observada', 'Foto observada · ' || v_que, trim(p_nota),

              v_url, 'warning', jsonb_build_object('evidence_id', v.id));

    end if;

  end if;



  return json_build_object('revision', case when p_conforme then 'conforme' else 'observada' end);

end $function$;

CREATE OR REPLACE FUNCTION public.revisar_inspeccion_equipo(p_id uuid, p_estado text, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k public.safety_equipment_checks;
  q public.safety_equipment;
  v_lider uuid;
begin
  perform public.exigir_accion((select service_id from public.safety_equipment_checks where id = p_id), 'ssoma', 'validar');  -- Roles y permisos (0159)
  select * into k from public.safety_equipment_checks where id = p_id and deleted_at is null;
  if k.id is null then raise exception 'SIGOV: esa inspección ya no existe'; end if;
  if not public.puede_revisar_ssoma(k.service_id) then
    raise exception 'SIGOV: solo el Ingeniero SSOMA revisa las inspecciones' using errcode = '42501';
  end if;
  -- El dictamen es la revisión; la vigencia sale de la fecha (OBS 14)
  if p_estado not in ('conforme', 'observado', 'vencido', 'requiere_correccion') then
    raise exception 'SIGOV: dictamen no válido';
  end if;
  if p_estado <> 'conforme' and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: di qué se observó, para que la cuadrilla lo corrija';
  end if;

  update public.safety_equipment_checks
     set revision_estado = p_estado, revisado_por = auth.uid(), revisado_at = now(),
         revision_nota = nullif(trim(p_nota), ''), conforme = (p_estado = 'conforme')
   where id = p_id;
  update public.safety_equipment
     set status = case when p_estado = 'conforme' then 'operativo'::public.safety_equipment_status
                       else 'observado'::public.safety_equipment_status end,
         updated_at = now()
   where id = k.equipment_id and status in ('operativo', 'observado');

  select * into q from public.safety_equipment where id = k.equipment_id;
  select c.leader_id into v_lider from public.crews c where c.id = q.crew_id;
  if p_estado = 'conforme' then
    -- La observación anterior quedó levantada
    update public.notifications set read_at = coalesce(read_at, now())
     where type = 'equipo_observado' and (data->>'equipment_id')::uuid = k.equipment_id;
  elsif v_lider is not null then
    -- Al jefe de la cuadrilla, para que la levante (OBS 15)
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    values (k.service_id, v_lider, 'equipo_observado',
            format('SSOMA observó %s', coalesce(nullif(q.code, ''), q.description, 'un equipo')),
            trim(p_nota), '/ssoma', 'warning',
            jsonb_build_object('equipment_id', k.equipment_id, 'check_id', k.id));
  end if;
  return json_build_object('estado', p_estado);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_parte(p_id uuid, p_validar boolean, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.work_orders;
  v_lider uuid;
  v_faltan text[];
begin
  perform public.exigir_accion((public.parte_por(p_id)).service_id, 'reporte_diario', 'validar');  -- Roles y permisos (0159)
  v := public.parte_por(p_id);
  if v.id is null then raise exception 'SIGOV: ese parte ya no existe'; end if;
  if not public.revisa_cuadrilla(v.service_id, v.crew_id) then
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente o el administrador validan u observan este parte' using errcode = '42501';
  end if;
  if v.status <> 'enviado' then
    raise exception 'SIGOV: el parte no está enviado (está %)', v.status;
  end if;
  if not p_validar and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;
  if p_validar then
    v_faltan := public.parte_sin_metrado(v.id);
    if cardinality(v_faltan) > 0 then
      raise exception 'SIGOV: no se puede validar: % sin metrado (%). Obsérvalo para que el jefe lo complete',
        case when cardinality(v_faltan) = 1 then '1 actividad' else cardinality(v_faltan) || ' actividades' end,
        array_to_string(v_faltan, ', ');
    end if;
  end if;

  update public.work_orders
     set status = case when p_validar then 'validado'::public.work_order_status else 'observado'::public.work_order_status end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         review_notes = case when p_validar then review_notes else trim(p_nota) end,
         updated_at = now()
   where id = v.id;

  -- La observación anterior queda resuelta al validar
  if p_validar then
    update public.notifications set read_at = coalesce(read_at, now())
     where type = 'parte_observado' and (data->>'work_order_id')::uuid = v.id;
  end if;

  if not p_validar then
    select c.leader_id into v_lider from public.crews c where c.id = v.crew_id;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v.service_id, v_lider, 'parte_observado',
              format('Reporte diario del %s observado', to_char(v.work_date, 'DD/MM/YYYY')),
              trim(p_nota), '/campo/' || v.id, 'warning', jsonb_build_object('work_order_id', v.id));
    end if;
  end if;
  return json_build_object('estado', case when p_validar then 'validado' else 'observado' end);
end $function$;

CREATE OR REPLACE FUNCTION public.revisar_pedido(p_request_id uuid, p_aprobar boolean, p_nota text, p_cantidades jsonb DEFAULT '{}'::jsonb)
 RETURNS supply_request_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r public.supply_requests;
  v_rol public.user_role;
  v_nuevo public.supply_request_status;
begin
  perform public.exigir_accion((select service_id from public.supply_requests where id = p_request_id), 'materiales', 'validar');  -- Roles y permisos (0159)
  select * into v_r from public.supply_requests where id = p_request_id and deleted_at is null for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  v_rol := public.role_in(v_r.service_id);

  if v_r.status = 'solicitado' then
    -- Primera revisión: el residente (o el administrador)
    if v_rol not in ('residente', 'admin') then
      raise exception 'SIGOV: este pedido lo revisa primero el ingeniero residente' using errcode = '42501';
    end if;
    if not p_aprobar and nullif(btrim(p_nota), '') is null then
      raise exception 'Escribe por qué se rechaza: quien lo pidió necesita saberlo.';
    end if;
    v_nuevo := case when p_aprobar then 'aprobado_residente' else 'rechazado' end;
    if p_aprobar then
      update public.supply_request_items i
         set qty_approved = coalesce((p_cantidades->>(i.id::text))::numeric, i.qty_requested), updated_at = now()
       where i.request_id = p_request_id and i.deleted_at is null;
    end if;
  elsif v_r.status = 'aprobado_residente' then
    -- Aprobación final: el visor COVINCA (o el administrador), que puede observarlo
    if v_rol not in ('visor', 'admin') then
      raise exception 'SIGOV: la aprobación final del pedido es del visor COVINCA' using errcode = '42501';
    end if;
    if not p_aprobar and nullif(btrim(p_nota), '') is null then
      raise exception 'Escribe la observación: quien lo pidió necesita saber qué corregir.';
    end if;
    v_nuevo := case when p_aprobar then 'aprobado' else 'observado' end;
  else
    raise exception 'El pedido % ya no está por revisar: está %.', v_r.code, v_r.status;
  end if;

  update public.supply_requests
     set status = v_nuevo, review_note = nullif(btrim(p_nota), ''), updated_at = now()
   where id = p_request_id;
  return v_nuevo;
end $function$;

CREATE OR REPLACE FUNCTION public.semana_guardar_borrador(p_plan uuid, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w public.weekly_plans; v_filas jsonb;
begin
  perform public.exigir_accion((select service_id from public.weekly_plans where id = p_plan), 'programacion', 'crear');  -- Roles y permisos (0159)
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) then raise exception 'SIGOV: solo quien programa guarda la semana' using errcode = '42501'; end if;
  v_filas := public.semana_filas(w.id);
  insert into public.weekly_plan_versiones (service_id, plan_id, version, tipo, filas, n_filas, motivo, quien)
  values (w.service_id, w.id, w.version_publicada, 'borrador', v_filas, jsonb_array_length(v_filas), nullif(trim(p_nota), ''), auth.uid());
  return json_build_object('filas', jsonb_array_length(v_filas), 'estado', w.status);
end $function$;

CREATE OR REPLACE FUNCTION public.semana_publicar(p_plan uuid, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w public.weekly_plans; v_filas jsonb; v_version int; r record;
begin
  perform public.exigir_accion((select service_id from public.weekly_plans where id = p_plan), 'programacion', 'crear');  -- Roles y permisos (0159)
  select * into w from public.weekly_plans where id = p_plan and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la semana no existe'; end if;
  if not public.can_manage(w.service_id) then raise exception 'SIGOV: solo quien programa publica la semana' using errcode = '42501'; end if;
  if w.status = 'cerrado' then raise exception 'SIGOV: la semana está cerrada'; end if;
  v_filas := public.semana_filas(w.id);
  if jsonb_array_length(v_filas) = 0 then raise exception 'SIGOV: la semana no tiene actividades'; end if;
  if w.version_publicada > 0 and w.status = 'publicado' and not w.cambios_sin_publicar then
    raise exception 'SIGOV: la versión v% ya está publicada y no hay cambios', w.version_publicada;
  end if;
  if w.version_publicada > 0 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo de la nueva versión: queda en el historial';
  end if;
  v_version := w.version_publicada + 1;
  update public.weekly_plans set status = 'publicado', published_at = now(), published_by = auth.uid(),
         version_publicada = v_version, cambios_sin_publicar = false, updated_at = now()
   where id = w.id;
  insert into public.weekly_plan_versiones (service_id, plan_id, version, tipo, filas, n_filas, motivo, quien)
  values (w.service_id, w.id, v_version, 'publicada', v_filas, jsonb_array_length(v_filas), nullif(trim(p_motivo), ''), auth.uid());
  for r in
    select c.leader_id, count(*) n from public.plan_items i join public.crews c on c.id = i.crew_id
     where i.plan_id = w.id and i.deleted_at is null and i.status <> 'cancelado' and c.leader_id is not null
     group by c.leader_id
  loop
    perform public.aviso_vivo(w.service_id, r.leader_id, 'programacion_publicada', 'sem:' || w.id,
      format('Programación semana %s%s', coalesce(w.semana_contrato::text, w.week::text), case when v_version > 1 then format(' · versión v%s', v_version) else '' end),
      format('%s %s para tu cuadrilla del %s al %s.', r.n, case when r.n = 1 then 'actividad' else 'actividades' end,
             to_char(w.starts_on, 'DD/MM'), to_char(w.ends_on, 'DD/MM')),
      '/programacion', 'info', jsonb_build_object('plan_id', w.id, 'version', v_version));
  end loop;
  return json_build_object('version', v_version, 'filas', jsonb_array_length(v_filas));
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_documento_crear(p_service uuid, p_tipo text, p_nombre text, p_vehicle uuid DEFAULT NULL::uuid, p_equipment uuid DEFAULT NULL::uuid, p_crew uuid DEFAULT NULL::uuid, p_titular uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid;
begin
  perform public.exigir_accion(p_service, 'ssoma', 'crear');  -- Roles y permisos (0159)
  if not public.can_write(p_service) then raise exception 'SIGOV: sin permiso' using errcode = '42501'; end if;
  insert into public.ssoma_documentos (service_id, numero, tipo, nombre, vehicle_id, equipment_id, crew_id, titular_id)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_documentos'), p_tipo, trim(p_nombre), p_vehicle, p_equipment,
          coalesce(p_crew, (select crew_id from public.vehicles where id = p_vehicle), (select crew_id from public.safety_equipment where id = p_equipment)), p_titular)
  returning id into v;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_documento_version(p_documento uuid, p_vence date, p_archivo_path text, p_archivo_nombre text, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.ssoma_documentos; prev public.ssoma_documento_versiones; v_ver int; v_id uuid;
begin
  perform public.exigir_accion((select service_id from public.ssoma_documentos where id = p_documento), 'ssoma', 'crear');  -- Roles y permisos (0159)
  select * into d from public.ssoma_documentos where id = p_documento;
  if not found then raise exception 'SIGOV: el documento no existe'; end if;
  -- Carga y versiona el jefe de la cuadrilla (o administración); SSOMA consulta y revisa, no reemplaza el documento
  if not (public.es_admin(d.service_id) or public.role_in(d.service_id) = 'residente'
          or (public.role_in(d.service_id) = 'jefe_cuadrilla' and public.cuadrilla_a_mi_cargo(d.service_id, d.crew_id))) then
    raise exception 'SIGOV: la nueva versión la carga el jefe de la cuadrilla; SSOMA la revisa' using errcode = '42501';
  end if;
  if p_archivo_path is null then raise exception 'SIGOV: adjunta el archivo de la nueva versión'; end if;
  select * into prev from public.ssoma_documento_versiones where documento_id = d.id order by version desc limit 1;
  v_ver := coalesce(prev.version, 0) + 1;
  insert into public.ssoma_documento_versiones (service_id, documento_id, version, archivo_path, archivo_nombre, vence_on, nota, cargado_por)
  values (d.service_id, d.id, v_ver, p_archivo_path, p_archivo_nombre, p_vence, nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  -- Un documento nuevo no reactiva el vehículo o equipo: su fecha se aplica cuando SSOMA lo revisa conforme
  perform public.ssoma_evento(d.service_id, 'nueva_version', 'Nueva versión ' || d.nombre, p_nota, null, null, d.id, v_ver, 'pendiente',
    case when prev.id is null then null else jsonb_build_object('version', prev.version, 'vence_on', prev.vence_on, 'revision', prev.revision) end,
    jsonb_build_object('version', v_ver, 'vence_on', p_vence, 'revision', 'pendiente'));
  return json_build_object('version', v_ver, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_evidencia_registrar(p_service uuid, p_objeto_tipo text, p_objeto_id uuid, p_path text, p_nombre text, p_mime text, p_bytes bigint, p_descripcion text, p_origen text DEFAULT 'archivo'::text, p_tomada_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_borrador boolean DEFAULT false, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text; v_insp uuid; v_hz uuid; v_doc uuid;
begin
  perform public.exigir_accion(p_service, 'ssoma', 'crear');  -- Roles y permisos (0159)
  if not public.can_write(p_service) then raise exception 'SIGOV: sin permiso para adjuntar' using errcode = '42501'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'SIGOV: la descripción es obligatoria'; end if;
  if split_part(p_path, '/', 1) <> p_service::text then raise exception 'SIGOV: ruta de archivo no válida'; end if;
  insert into public.ssoma_evidencias (service_id, numero, objeto_tipo, objeto_id, storage_path, nombre, mime, bytes, descripcion, origen, tomada_at, autor, lat, lng, borrador)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_evidencias'), p_objeto_tipo, p_objeto_id, p_path, p_nombre, p_mime, p_bytes,
          left(trim(p_descripcion), 250), coalesce(p_origen, 'archivo'), p_tomada_at, auth.uid(), p_lat, p_lng, coalesce(p_borrador, false))
  returning id, codigo into v_id, v_cod;
  if p_objeto_tipo = 'inspeccion' then v_insp := p_objeto_id;
  elsif p_objeto_tipo = 'hallazgo' then v_hz := p_objeto_id; select inspeccion_id into v_insp from public.ssoma_hallazgos where id = p_objeto_id;
  else v_doc := p_objeto_id; end if;
  perform public.ssoma_evento(p_service, 'evidencia', case when p_borrador then 'Evidencia en borrador ' else 'Evidencia adjunta ' end || v_cod || ' · ' || p_nombre,
    left(trim(p_descripcion), 250), v_insp, v_hz, v_doc, null, null, null, null, array[v_id]);
  return json_build_object('id', v_id, 'codigo', v_cod);
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_hallazgo_crear(p_inspeccion uuid, p_descripcion text, p_fecha_limite date, p_responsable uuid DEFAULT NULL::uuid, p_responsable_texto text DEFAULT NULL::text, p_documento uuid DEFAULT NULL::uuid, p_bloquea boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.ssoma_inspecciones; v_id uuid; v_cod text; v_resp uuid;
begin
  perform public.exigir_accion((select service_id from public.ssoma_inspecciones where id = p_inspeccion), 'ssoma', 'crear');  -- Roles y permisos (0159)
  select * into i from public.ssoma_inspecciones where id = p_inspeccion;
  if not found then raise exception 'SIGOV: la inspección no existe'; end if;
  if not public.puede_revisar_ssoma(i.service_id) then raise exception 'SIGOV: el hallazgo lo registra el Encargado SSOMA' using errcode = '42501'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'SIGOV: describe el hallazgo'; end if;
  if p_fecha_limite is null then raise exception 'SIGOV: indica la fecha límite'; end if;
  v_resp := coalesce(p_responsable, case when nullif(trim(p_responsable_texto), '') is null then (select leader_id from public.crews where id = i.crew_id) end);
  insert into public.ssoma_hallazgos (service_id, numero, inspeccion_id, documento_id, crew_id, descripcion, responsable_id, responsable_texto, fecha_limite, bloquea_aptitud, creado_por)
  values (i.service_id, public.ssoma_siguiente(i.service_id, 'ssoma_hallazgos'), i.id, p_documento, i.crew_id, trim(p_descripcion), v_resp,
          nullif(trim(p_responsable_texto), ''), p_fecha_limite, coalesce(p_bloquea, true), auth.uid())
  returning id, codigo into v_id, v_cod;
  perform public.ssoma_evento(i.service_id, 'hallazgo_creado', 'Hallazgo creado ' || v_cod, trim(p_descripcion), i.id, v_id, p_documento, null, 'observado');
  if v_resp is not null then
    perform public.aviso_vivo(i.service_id, v_resp, 'ssoma_hallazgo', 'hz:' || v_id, format('Hallazgo %s · %s', v_cod, trim(p_descripcion)),
      format('Subsanar hasta el %s. Responde con la evidencia desde el hallazgo.', to_char(p_fecha_limite, 'DD/MM/YYYY')),
      '/ssoma/hallazgos/' || v_id, 'warning', jsonb_build_object('hallazgo_id', v_id));
  end if;
  return json_build_object('id', v_id, 'codigo', v_cod);
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_hallazgo_responder(p_hallazgo uuid, p_texto text, p_evidencias uuid[] DEFAULT '{}'::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h public.ssoma_hallazgos; r record;
begin
  perform public.exigir_accion((select service_id from public.ssoma_hallazgos where id = p_hallazgo), 'ssoma', 'crear');  -- Roles y permisos (0159)
  select * into h from public.ssoma_hallazgos where id = p_hallazgo for update;
  if not found then raise exception 'SIGOV: el hallazgo no existe'; end if;
  if h.estado = 'cerrado' then raise exception 'SIGOV: el hallazgo ya está cerrado'; end if;
  -- Responde el responsable o su cuadrilla; SSOMA verifica, no subsana por ellos
  if not (h.responsable_id = auth.uid() or (public.role_in(h.service_id) = 'jefe_cuadrilla' and public.cuadrilla_a_mi_cargo(h.service_id, h.crew_id))
          or public.es_admin(h.service_id)) then
    raise exception 'SIGOV: solo el responsable o su cuadrilla responden el hallazgo' using errcode = '42501';
  end if;
  if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: describe la subsanación'; end if;
  update public.ssoma_hallazgos set estado = 'por_verificar' where id = h.id;
  perform public.ssoma_evento(h.service_id, 'respuesta', 'Respuesta del responsable', trim(p_texto), h.inspeccion_id, h.id, h.documento_id, null,
    'subsanacion_enviada', jsonb_build_object('estado', h.estado), jsonb_build_object('estado', 'subsanacion_enviada'), p_evidencias);
  perform public.ssoma_evento(h.service_id, 'verificacion_pendiente', 'Verificación pendiente', 'Comprobar la subsanación antes de cerrar.',
    h.inspeccion_id, h.id, h.documento_id, null, 'por_verificar');
  for r in select profile_id from public.service_members where service_id = h.service_id and role = 'ing_seguridad' loop
    perform public.aviso_vivo(h.service_id, r.profile_id, 'ssoma_hallazgo', 'hzr:' || h.id, format('Hallazgo %s · subsanación enviada', h.codigo),
      trim(p_texto), '/ssoma/hallazgos/' || h.id, 'info', jsonb_build_object('hallazgo_id', h.id));
  end loop;
  return json_build_object('estado', 'por_verificar');
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_inspeccion_crear(p_service uuid, p_tipo text, p_crew uuid, p_vehicle uuid DEFAULT NULL::uuid, p_equipment uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text;
begin
  perform public.exigir_accion(p_service, 'ssoma', 'crear');  -- Roles y permisos (0159)
  if not public.puede_revisar_ssoma(p_service) then raise exception 'SIGOV: la inspección la registra el Encargado SSOMA' using errcode = '42501'; end if;
  insert into public.ssoma_inspecciones (service_id, numero, tipo, crew_id, fecha, origen_tabla, vehicle_id, equipment_id, inspector_id, notas)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_inspecciones'), p_tipo, p_crew, now(), 'ssoma', p_vehicle, p_equipment, auth.uid(), nullif(trim(p_notas), ''))
  returning id, codigo into v_id, v_cod;
  perform public.ssoma_evento(p_service, 'inspeccion_registrada', 'Nueva inspección', nullif(trim(p_notas), ''), v_id);
  return json_build_object('id', v_id, 'codigo', v_cod);
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_revisar(p_objeto_tipo text, p_objeto_id uuid, p_resultado text, p_motivo text, p_evidencias uuid[] DEFAULT '{}'::uuid[], p_borrador boolean DEFAULT false, p_verificado boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; i public.ssoma_inspecciones; v public.ssoma_documento_versiones; d public.ssoma_documentos; h public.ssoma_hallazgos; v_txt text;
begin
  perform public.exigir_accion(case p_objeto_tipo when 'inspeccion' then (select service_id from public.ssoma_inspecciones where id = p_objeto_id) when 'documento' then (select service_id from public.ssoma_documentos where id = p_objeto_id) else (select service_id from public.ssoma_hallazgos where id = p_objeto_id) end, 'ssoma', 'validar');  -- Roles y permisos (0159)
  if p_objeto_tipo = 'inspeccion' then select * into i from public.ssoma_inspecciones where id = p_objeto_id for update; v_sid := i.service_id;
  elsif p_objeto_tipo = 'documento' then
    select * into d from public.ssoma_documentos where id = p_objeto_id; v_sid := d.service_id;
    select * into v from public.ssoma_documento_versiones where documento_id = d.id order by version desc limit 1 for update;
  elsif p_objeto_tipo = 'hallazgo' then select * into h from public.ssoma_hallazgos where id = p_objeto_id for update; v_sid := h.service_id;
  else raise exception 'SIGOV: objeto no válido'; end if;
  if v_sid is null then raise exception 'SIGOV: no existe'; end if;
  if not public.puede_revisar_ssoma(v_sid) then raise exception 'SIGOV: la revisión la registra el Encargado SSOMA' using errcode = '42501'; end if;

  if coalesce(p_borrador, false) then
    insert into public.ssoma_revisiones (service_id, objeto_tipo, objeto_id, version_id, resultado, motivo, evidencias, borrador, quien)
    values (v_sid, p_objeto_tipo, p_objeto_id, v.id, p_resultado, nullif(trim(p_motivo), ''), coalesce(p_evidencias, '{}'), true, auth.uid());
    perform public.ssoma_evento(v_sid, 'borrador', 'Borrador de revisión guardado', nullif(trim(p_motivo), ''),
      case when p_objeto_tipo = 'inspeccion' then i.id end, case when p_objeto_tipo = 'hallazgo' then h.id end,
      case when p_objeto_tipo = 'documento' then d.id end, v.version, 'pendiente');
    return json_build_object('borrador', true);
  end if;

  if p_resultado not in ('conforme', 'observado') then raise exception 'SIGOV: elige el resultado (Conforme u Observado)'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la revisión'; end if;
  if length(trim(p_motivo)) > 500 then raise exception 'SIGOV: el motivo admite hasta 500 caracteres'; end if;
  insert into public.ssoma_revisiones (service_id, objeto_tipo, objeto_id, version_id, resultado, motivo, evidencias, verificado, quien)
  values (v_sid, p_objeto_tipo, p_objeto_id, v.id, p_resultado, trim(p_motivo), coalesce(p_evidencias, '{}'), coalesce(p_verificado, false), auth.uid());
  v_txt := case p_resultado when 'conforme' then 'Conforme' else 'Observado' end;

  if p_objeto_tipo = 'inspeccion' then
    -- Registrar no cierra hallazgos: solo fija la última revisión
    update public.ssoma_inspecciones set ultima_revision = p_resultado, revisado_por = auth.uid(), revisado_at = now() where id = i.id;
    perform public.ssoma_evento(v_sid, 'revision', 'Revisión registrada: ' || v_txt, trim(p_motivo), i.id, null, null, null, p_resultado,
      jsonb_build_object('ultima_revision', i.ultima_revision), jsonb_build_object('ultima_revision', p_resultado), p_evidencias);
  elsif p_objeto_tipo = 'documento' then
    if v.id is null then raise exception 'SIGOV: el documento no tiene versiones'; end if;
    update public.ssoma_documento_versiones set revision = p_resultado, revisado_por = auth.uid(), revisado_at = now(), motivo = trim(p_motivo) where id = v.id;
    -- Recién conforme, la fecha de la versión rige para el vehículo o equipo
    if p_resultado = 'conforme' and v.vence_on is not null then
      if d.vehicle_id is not null then
        update public.vehicles set soat_expires_on = case when d.tipo = 'soat' then v.vence_on else soat_expires_on end,
               inspection_expires_on = case when d.tipo = 'revision_tecnica' then v.vence_on else inspection_expires_on end,
               policy_expires_on = case when d.tipo = 'poliza' then v.vence_on else policy_expires_on end, updated_at = now()
         where id = d.vehicle_id;
      elsif d.equipment_id is not null then
        update public.safety_equipment set expires_on = v.vence_on, updated_at = now() where id = d.equipment_id;
      end if;
    end if;
    perform public.ssoma_evento(v_sid, 'revision', 'Revisión de ' || d.nombre || ' v' || v.version || ': ' || v_txt, trim(p_motivo), null, null, d.id,
      v.version, p_resultado, jsonb_build_object('revision', v.revision), jsonb_build_object('revision', p_resultado), p_evidencias);
  else
    -- Hallazgo: se cierra solo con revisión conforme y verificación expresa
    if h.estado = 'cerrado' then raise exception 'SIGOV: el hallazgo ya está cerrado'; end if;
    if p_resultado = 'conforme' and not coalesce(p_verificado, false) then
      raise exception 'SIGOV: marca «He verificado el documento y el vehículo» para cerrar el hallazgo';
    end if;
    -- Cierra solo con evidencia: la de esta verificación, la adjunta al hallazgo o la de la subsanación
    if p_resultado = 'conforme' and cardinality(coalesce(p_evidencias, '{}')) = 0
       and not exists (select 1 from public.ssoma_evidencias x where x.objeto_tipo = 'hallazgo' and x.objeto_id = h.id)
       and not exists (select 1 from public.ssoma_eventos x where x.hallazgo_id = h.id and cardinality(x.evidencias) > 0) then
      raise exception 'SIGOV: el hallazgo se cierra con evidencia: adjunta la evidencia de la subsanación o de tu verificación';
    end if;
    update public.ssoma_hallazgos set estado = case when p_resultado = 'conforme' then 'cerrado' else 'abierto' end,
           cerrado_por = case when p_resultado = 'conforme' then auth.uid() end, cerrado_at = case when p_resultado = 'conforme' then now() end
     where id = h.id;
    perform public.ssoma_evento(v_sid, case when p_resultado = 'conforme' then 'hallazgo_cerrado' else 'hallazgo_reabierto' end,
      case when p_resultado = 'conforme' then 'Hallazgo cerrado tras verificación' else 'Subsanación observada: vuelve a abierto' end,
      trim(p_motivo), h.inspeccion_id, h.id, h.documento_id, null, p_resultado,
      jsonb_build_object('estado', h.estado), jsonb_build_object('estado', case when p_resultado = 'conforme' then 'cerrado' else 'abierto' end), p_evidencias);
    if h.responsable_id is not null then
      perform public.aviso_vivo(v_sid, h.responsable_id, 'ssoma_hallazgo', 'hz:' || h.id,
        format('Hallazgo %s %s', h.codigo, case when p_resultado = 'conforme' then 'cerrado' else 'observado otra vez' end),
        trim(p_motivo), '/ssoma/hallazgos/' || h.id, case when p_resultado = 'conforme' then 'info' else 'warning' end,
        jsonb_build_object('hallazgo_id', h.id));
    end if;
  end if;
  return json_build_object('ok', true, 'resultado', p_resultado);
end $function$;

notify pgrst, 'reload schema';
