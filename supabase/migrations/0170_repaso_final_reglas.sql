-- ═══════════════════════════════════════════════════════════════════════════
-- 0170 · Repaso independiente final (T30): reglas de servidor
-- · COVINCA observa sin borrar la validación SERVICON (estados separados).
-- · Las decisiones del ítem guardan versión, fase y cambio de estado.
-- · No se valida el reporte ni la partida propios; devolver pide motivo.
-- · Supervisor no revisa ítems sin cuadrilla; apoyo temporal solo Supervisor.
-- · Fotos pendientes de autorización no se publican; MR cuenta lo enviado.
-- · Integrantes sin cuenta, solapes al ampliar vigencia, sin borrado físico.
-- · Cuadrilla exige supervisor y sector; caja edita lo visible.
-- · SSOMA por cuadrilla (tablas y funciones); «Ver» apagado limita lectura.
-- · Regla «Sello» de Configuración › Evidencias.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pci_item_revisiones add column if not exists version integer;
alter table public.pci_item_revisiones add column if not exists fase text;
alter table public.pci_item_revisiones add column if not exists estado_anterior text;
alter table public.pci_item_revisiones add column if not exists estado_nuevo text;

-- SSOMA: alcance por cuadrilla (residente, administrador y SSOMA ven el contrato)
create or replace function public.ssoma_ve(sid uuid, crew uuid, vehicle uuid, equipment uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin() or public.role_in(sid) in ('admin', 'residente', 'ing_seguridad')
      or (crew is not null and public.cuadrilla_a_mi_cargo(sid, crew))
      or (vehicle is not null and exists (select 1 from public.crew_vehicle_assignments a where a.vehicle_id = vehicle
            and (a.end_on is null or a.end_on > public.hoy_peru()) and public.cuadrilla_a_mi_cargo(sid, a.crew_id)))
      or (equipment is not null and exists (select 1 from public.safety_equipment e where e.id = equipment and e.crew_id is not null
            and public.cuadrilla_a_mi_cargo(sid, e.crew_id)))
$$;
create or replace function public.ssoma_ve_evento(sid uuid, insp uuid, hz uuid, doc uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin() or public.role_in(sid) in ('admin', 'residente', 'ing_seguridad')
      or exists (select 1 from public.ssoma_inspecciones i where i.id = insp and public.ssoma_ve(i.service_id, i.crew_id, i.vehicle_id, i.equipment_id))
      or exists (select 1 from public.ssoma_hallazgos h where h.id = hz and (public.ssoma_ve(h.service_id, h.crew_id, null, null) or h.responsable_id = auth.uid()))
      or exists (select 1 from public.ssoma_documentos d where d.id = doc and (public.ssoma_ve(d.service_id, d.crew_id, d.vehicle_id, d.equipment_id) or d.titular_id = auth.uid()))
$$;
revoke all on function public.ssoma_ve(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.ssoma_ve(uuid, uuid, uuid, uuid) to authenticated;
revoke all on function public.ssoma_ve_evento(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.ssoma_ve_evento(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists ssoma_inspecciones_select on public.ssoma_inspecciones;
create policy ssoma_inspecciones_select on public.ssoma_inspecciones for select to authenticated
  using ((public.ve_lo_interno(service_id) and public.ssoma_ve(service_id, crew_id, vehicle_id, equipment_id)) or public.is_platform_admin());
drop policy if exists ssoma_hallazgos_select on public.ssoma_hallazgos;
create policy ssoma_hallazgos_select on public.ssoma_hallazgos for select to authenticated
  using ((public.ve_lo_interno(service_id) and (public.ssoma_ve(service_id, crew_id, null, null) or responsable_id = auth.uid())) or public.is_platform_admin());
drop policy if exists ssoma_documentos_select on public.ssoma_documentos;
create policy ssoma_documentos_select on public.ssoma_documentos for select to authenticated
  using ((public.ve_lo_interno(service_id) and (public.ssoma_ve(service_id, crew_id, vehicle_id, equipment_id) or titular_id = auth.uid())) or public.is_platform_admin());
drop policy if exists ssoma_documento_versiones_select on public.ssoma_documento_versiones;
create policy ssoma_documento_versiones_select on public.ssoma_documento_versiones for select to authenticated
  using (exists (select 1 from public.ssoma_documentos d where d.id = documento_id));
drop policy if exists ssoma_evidencias_select on public.ssoma_evidencias;
create policy ssoma_evidencias_select on public.ssoma_evidencias for select to authenticated
  using ((public.ve_lo_interno(service_id) and public.ssoma_ve_evento(service_id, case when objeto_tipo = 'inspeccion' then objeto_id end,
          case when objeto_tipo = 'hallazgo' then objeto_id end, case when objeto_tipo = 'documento' then objeto_id end)) or public.is_platform_admin());
drop policy if exists ssoma_revisiones_select on public.ssoma_revisiones;
create policy ssoma_revisiones_select on public.ssoma_revisiones for select to authenticated
  using ((public.ve_lo_interno(service_id) and public.ssoma_ve_evento(service_id, case when objeto_tipo = 'inspeccion' then objeto_id end,
          case when objeto_tipo = 'hallazgo' then objeto_id end, case when objeto_tipo = 'documento' then objeto_id end)) or public.is_platform_admin());
drop policy if exists ssoma_eventos_select on public.ssoma_eventos;
create policy ssoma_eventos_select on public.ssoma_eventos for select to authenticated
  using ((public.ve_lo_interno(service_id) and public.ssoma_ve_evento(service_id, inspeccion_id, hallazgo_id, documento_id)) or public.is_platform_admin());

-- «Ver» apagado también limita la lectura de las tablas propias de cada módulo
do $$
declare t record;
begin
  for t in select * from (values
    ('cash_movements', 'caja'), ('cash_boxes', 'caja'), ('deposit_requests', 'caja'), ('rendiciones', 'caja'), ('conciliaciones', 'caja'),
    ('conciliacion_aclaraciones', 'caja'), ('caja_cierres', 'caja'),
    ('ssoma_inspecciones', 'ssoma'), ('ssoma_hallazgos', 'ssoma'), ('ssoma_documentos', 'ssoma'), ('ssoma_documento_versiones', 'ssoma'),
    ('ssoma_evidencias', 'ssoma'), ('ssoma_revisiones', 'ssoma'), ('ssoma_eventos', 'ssoma'),
    ('observaciones_campo', 'observaciones'), ('road_assets', 'inventario'), ('asset_interventions', 'inventario'),
    ('supply_requests', 'materiales'), ('supply_request_items', 'materiales')
  ) x(tabla, modulo) loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.tabla and column_name = 'service_id') then
      execute format('drop policy if exists permiso_ver on public.%I', t.tabla);
      execute format('create policy permiso_ver on public.%I as restrictive for select to authenticated using (public.accion_permitida(service_id, %L, %L))', t.tabla, t.modulo, 'ver');
    end if;
  end loop;
end $$;

-- Integrantes: la pertenencia histórica no se borra físicamente
drop policy if exists crew_members_sin_borrado on public.crew_members;
create policy crew_members_sin_borrado on public.crew_members as restrictive for delete to authenticated using (false);

-- Caja: aprobar, observar o anular un gasto pasa por una función con reglas
create or replace function public.caja_gasto_revisar(p_id uuid, p_estado text, p_nota text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare m public.cash_movements;
begin
  select * into m from public.cash_movements where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el movimiento no existe'; end if;
  perform public.exigir_accion(m.service_id, 'caja', 'validar');
  if public.role_in(m.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: revisa los gastos administración' using errcode = '42501'; end if;
  if p_estado not in ('aprobado', 'observado', 'anulado') then raise exception 'SIGOV: decisión no válida'; end if;
  if m.created_by = auth.uid() then raise exception 'SIGOV: no puedes revisar un gasto que tú mismo registraste' using errcode = '42501'; end if;
  if p_estado <> 'aprobado' and nullif(trim(p_nota), '') is null then raise exception 'SIGOV: escribe el motivo'; end if;
  if m.status = 'aprobado' then raise exception 'SIGOV: el gasto ya está aprobado'; end if;
  perform set_config('sigov.motivo', coalesce(nullif(trim(p_nota), ''), 'Gasto aprobado'), true);
  update public.cash_movements set status = p_estado::public.cash_movement_status, review_note = nullif(trim(p_nota), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = m.id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('estado', p_estado);
end $$;
revoke all on function public.caja_gasto_revisar(uuid, text, text) from public, anon;
grant execute on function public.caja_gasto_revisar(uuid, text, text) to authenticated;

drop function if exists public.integrante_agregar(uuid, uuid, date, date, text);

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
           validado_servicon_at = case when v_entidad = 'COVINCA' then validado_servicon_at end, validado_servicon_by = case when v_entidad = 'COVINCA' then validado_servicon_by end,
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

  insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad, version, fase, estado_anterior, estado_nuevo, evidencias)
  values (v_fila.service_id, v_fila.pci_id, p_item, v_nivel, case when p_conforme then 'conforme' else 'observado' end,
          nullif(trim(p_nota), ''), auth.uid(), v_rol::text, v_entidad, coalesce(p_version, nullif(v_fila.publicacion_version, 0)), nullif(p_fase, ''), v_fila.status::text, case when p_conforme then case when v_rol = 'visor' then 'conforme_covinca' else 'validado_servicon' end else 'observado' end,
          (select array_agg(e.id order by e.created_at) from public.evidences e where e.pci_item_id = p_item and e.deleted_at is null));

  perform public.pci_avisos(v_fila.pci_id);
  return json_build_object('estado', v_estado, 'nivel', v_nivel, 'observacion_id', v_obs);
end $function$;

CREATE OR REPLACE FUNCTION public.observacion_accion(p_obs uuid, p_accion text, p_texto text DEFAULT NULL::text, p_evidencias uuid[] DEFAULT '{}'::uuid[], p_version integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.revision_observaciones;
  v_rol public.user_role;
  v_org text;
  v_item public.pci_items;
  v_nuevo text;
begin
  select * into o from public.revision_observaciones where id = p_obs for update;
  if o.id is null then raise exception 'SIGOV: esa observación ya no existe'; end if;
  v_rol := public.role_in(o.service_id);
  if v_rol is null then raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501'; end if;
  v_org := case when v_rol = 'visor' then 'COVINCA' else 'SERVICON' end;
  if o.pci_item_id is not null then select * into v_item from public.pci_items where id = o.pci_item_id; end if;
  -- Roles y permisos: responder o comentar = Crear; mantener o reabrir = Editar (Observaciones)
  perform public.exigir_accion(o.service_id, 'observaciones', case when p_accion in ('mantener', 'reabrir') then 'editar' else 'crear' end);
  -- La decisión se toma sobre la versión que se está viendo (V11/V12)
  if p_version is not null and v_item.id is not null and coalesce(v_item.publicacion_version, 0) <> p_version then
    raise exception 'SIGOV: el ítem cambió de versión (ahora v%) mientras revisabas. Actualiza la página antes de decidir', coalesce(v_item.publicacion_version, 0);
  end if;

  if p_accion = 'responder' then
    -- Responde quien ejecuta o supervisa la cuadrilla, sobre la misma intervención
    if v_rol = 'visor' or (o.crew_id is not null and not public.cuadrilla_a_mi_cargo(o.service_id, o.crew_id)) then
      raise exception 'SIGOV: solo SERVICON responde una observación de su cuadrilla' using errcode = '42501';
    end if;
    if o.estado = 'cerrada' then raise exception 'SIGOV: la observación está cerrada'; end if;
    if nullif(trim(p_texto), '') is null and cardinality(coalesce(p_evidencias, '{}')) = 0 then
      raise exception 'SIGOV: escribe la respuesta o adjunta la evidencia';
    end if;
    -- Una observación SERVICON queda respondida; la de COVINCA, al publicarse
    v_nuevo := case when o.origen = 'SERVICON' then 'respondida' else o.estado end;
  elsif p_accion = 'mantener' then
    if v_org <> o.origen then raise exception 'SIGOV: solo % mantiene su observación', o.origen using errcode = '42501'; end if;
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: explica qué falta para mantener la observación'; end if;
    if o.estado = 'cerrada' then raise exception 'SIGOV: la observación está cerrada; usa Reabrir'; end if;
    v_nuevo := 'abierta';
  elsif p_accion = 'reabrir' then
    if v_org <> o.origen then raise exception 'SIGOV: solo % reabre su observación', o.origen using errcode = '42501'; end if;
    if o.estado <> 'cerrada' then raise exception 'SIGOV: solo se reabre una observación cerrada'; end if;
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: escribe el motivo para reabrir'; end if;
    v_nuevo := 'abierta';
  elsif p_accion = 'comentar' then
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: escribe el comentario'; end if;
    v_nuevo := o.estado;
  else
    raise exception 'SIGOV: acción no válida';
  end if;

  update public.revision_observaciones
     set estado = v_nuevo,
         cerrada_at = case when v_nuevo = 'cerrada' then cerrada_at else null end,
         cerrada_por = case when v_nuevo = 'cerrada' then cerrada_por else null end
   where id = p_obs;
  insert into public.revision_observacion_eventos (observacion_id, tipo, texto, evidencias, version, estado_anterior, estado_nuevo, autor, organizacion)
  values (p_obs, case p_accion when 'responder' then 'respuesta' when 'mantener' then 'mantenida' when 'reabrir' then 'reabierta' else 'comentario' end,
          nullif(trim(p_texto), ''), coalesce(p_evidencias, '{}'), nullif(v_item.publicacion_version, 0), o.estado, v_nuevo, auth.uid(), v_org);

  -- Mantener o reabrir devuelve el ítem a subsanar
  if p_accion in ('mantener', 'reabrir') and v_item.id is not null then
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_texto), observado_at = now(), observado_por = auth.uid(),
           observado_entidad = o.origen, validado_servicon_at = case when o.origen = 'COVINCA' then validado_servicon_at end, validado_servicon_by = case when o.origen = 'COVINCA' then validado_servicon_by end,
           covinca_estado = case when o.origen = 'COVINCA' then 'observado' else covinca_estado end,
           covinca_version = case when o.origen = 'COVINCA' then v_item.publicacion_version else covinca_version end,
           updated_at = now()
     where id = v_item.id;
    insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad)
    values (v_item.service_id, v_item.pci_id, v_item.id, lower(o.origen), 'observado', trim(p_texto), auth.uid(), v_rol::text, o.origen);
  end if;
  if v_item.id is not null then perform public.pci_avisos(v_item.pci_id); end if;
  return json_build_object('estado', v_nuevo);
end $function$;

CREATE OR REPLACE FUNCTION public.pci_item_historial(p_item uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with item as (
    select i.* from public.pci_items i
     where i.id = p_item and public.is_member(i.service_id)
       and (i.publicacion_version > 0 or not public.es_visor(i.service_id))
  ), eventos as (
    select i.created_at cuando, 'creado' tipo,
           case when b.id is not null then 'Importado del Excel «' || coalesce(b.file_name, '') || '»' else 'Registrado' end detalle,
           coalesce(pb.full_name, pc.full_name) quien, 'SERVICON'::text entidad, null::int version
      from item i
      left join public.import_batches b on b.id = i.import_batch_id
      left join public.profiles pb on pb.id = b.created_by
      left join public.profiles pc on pc.id = i.created_by
    union all
    select r.cuando, 'asignado',
           case when r.crew_de is null then 'Asignado a ' || ca.name else 'Reasignado de ' || cd.name || ' a ' || coalesce(ca.name, 'sin cuadrilla') end
             || coalesce(' · motivo: ' || r.motivo, ''),
           pq.full_name, 'SERVICON', null
      from public.reasignaciones r join item i on i.id = r.registro_id
      left join public.crews cd on cd.id = r.crew_de left join public.crews ca on ca.id = r.crew_a
      left join public.profiles pq on pq.id = r.quien
    union all
    select w.created_at, 'avance',
           case when public.es_visor(i.service_id) then 'Registró atención' else
           format('Registró atención · metrado %s%s%s', trim(to_char(w.quantity, 'FM999999990.###')),
                  case when w.exceso is not null then format(' · supera lo solicitado (%s) en %s%s', trim(to_char(w.solicitado, 'FM999999990.###')),
                       trim(to_char(w.exceso, 'FM999999990.###')), coalesce(' · motivo: ' || w.exceso_motivo, '')) else '' end,
                  coalesce(' · ejecutó: ' || w.ejecutado_por, '')) end,
           pw.full_name, 'SERVICON', null
      from public.work_entries w join item i on i.id = w.pci_item_id
      left join public.profiles pw on pw.id = w.created_by
     where w.deleted_at is null and (not public.es_visor(i.service_id) or i.publicacion_version > 0)
    union all
    select e.created_at, 'foto',
           format('Foto %s%s', public.fase_legible(coalesce(e.phase::text, 'general')),
                  case when e.origen_captura is not null then ' · origen: ' || e.origen_captura else '' end),
           pe.full_name, 'SERVICON', e.publicada_version
      from public.evidences e join item i on i.id = e.pci_item_id
      left join public.profiles pe on pe.id = e.created_by
     where e.deleted_at is null and (e.publicada_version is not null or not public.es_visor(i.service_id))
    union all
    select v.cuando, 'revision',
           case v.resultado when 'conforme' then case v.nivel when 'covinca' then 'Conforme COVINCA' else 'Validó (SERVICON)' end
                else 'Observó: ' || coalesce(v.motivo, '') end,
           pv.full_name, v.entidad, v.version
      from public.pci_item_revisiones v join item i on i.id = v.pci_item_id
      left join public.profiles pv on pv.id = v.quien
    union all
    select p.cuando, 'publicado', 'Publicó a COVINCA' || coalesce(' · ' || p.nota, ''), pp.full_name, 'SERVICON', p.version
      from public.pci_item_publicaciones p join item i on i.id = p.pci_item_id
      left join public.profiles pp on pp.id = p.quien
  )
  select coalesce(json_agg(json_build_object('cuando', cuando, 'tipo', tipo, 'detalle', detalle, 'quien', quien,
                                             'entidad', entidad, 'version', version) order by cuando), '[]'::json)
    from eventos where cuando is not null
$function$;

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
  if p_validar and v.created_by = auth.uid() then
    raise exception 'SIGOV: no puedes validar un reporte que tú mismo registraste: lo valida otra persona' using errcode = '42501';
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

CREATE OR REPLACE FUNCTION public.partida_validar(p_item uuid, p_aceptar boolean DEFAULT true, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila public.plan_items;
begin
  perform public.exigir_accion((select service_id from public.plan_items where id = p_item), 'reporte_diario', 'validar');  -- Roles y permisos (0169)
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;

  -- Quien ejecuta no valida: si fueran el mismo, el control no existe
  if not public.revisa_cuadrilla(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente o el administrador validan esta partida';
  end if;

  if v_fila.finished_by = auth.uid() then
    raise exception 'SIGOV: no puedes validar una partida que tú mismo diste por terminada' using errcode = '42501';
  end if;
  if not p_aceptar and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe el motivo para devolver la partida a campo';
  end if;
  if v_fila.status <> 'por_validar' then
    raise exception 'SIGOV: la cuadrilla todavía no dio por terminada esta partida';
  end if;

  if p_aceptar then
    update public.plan_items
       set status = 'ejecutado',
           validated_at = now(),
           validated_by = auth.uid(),
           notes = coalesce(nullif(trim(p_nota), ''), notes)
     where id = p_item;
    return json_build_object('estado', 'ejecutado');
  end if;

  -- Devolver a campo: vuelve a estar en curso, con el motivo a la vista
  update public.plan_items
     set status = 'en_curso',
         finished_at = null,
         finished_by = null,
         impedimento = coalesce(nullif(trim(p_nota), ''), 'Devuelta por el supervisor'),
         impedimento_at = now(),
         impedimento_by = auth.uid()
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $function$;

CREATE OR REPLACE FUNCTION public.revisa_cuadrilla(sid uuid, crew uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case public.role_in(sid)
    when 'admin' then true
    when 'residente' then true
    when 'supervisor' then crew is not null and crew = any(coalesce(public.mis_cuadrillas(sid), '{}'::uuid[]))
    else false
  end
$function$;

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
  if public.role_in(p.service_id) <> 'supervisor' or not public.revisa_cuadrilla(p.service_id, p_destino) then
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
  if public.role_in(a.service_id) <> 'supervisor' or not public.revisa_cuadrilla(a.service_id, a.crew_destino) then
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
     where pci_item_id = v_item.id and deleted_at is null and publicada_version is null and not coalesce(autorizacion_pendiente, false);
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

CREATE OR REPLACE FUNCTION public.inicio_mr(p_service uuid, p_desde date, p_hasta date, p_crew uuid DEFAULT NULL::uuid, p_supervisor uuid DEFAULT NULL::uuid, p_activity uuid DEFAULT NULL::uuid, p_unit uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with prog as (
    select pi.id, pi.activity_id, coalesce(pi.unit_id, a.unit_id) unit_id, pi.crew_id, pi.scheduled_on, pi.section_id,
           pi.prog_start_m, pi.prog_end_m, coalesce(pi.target_qty, 0) programado, pi.status
      from public.plan_items pi
      join public.activities_catalog a on a.id = pi.activity_id
      left join public.crews c on c.id = pi.crew_id
     where pi.service_id = p_service and pi.deleted_at is null
       and pi.scheduled_on between p_desde and p_hasta
       and pi.status not in ('suspendido', 'cancelado', 'reprogramado')
       and pi.pci_item_id is null
       -- el Visor solo ve la programación publicada
       and (not public.es_visor(p_service) or exists (select 1 from public.weekly_plans wp where wp.id = pi.plan_id and wp.status in ('publicado', 'cerrado')))
       and (p_crew is null or pi.crew_id = p_crew)
       and (p_supervisor is null or c.supervisor_id = p_supervisor)
       and (p_activity is null or pi.activity_id = p_activity)
       and (p_unit is null or coalesce(pi.unit_id, a.unit_id) = p_unit)
  ), ejec as (
    select w.id, w.plan_item_id, w.activity_id, coalesce(w.unit_id, a.unit_id) unit_id, o.crew_id, o.work_date, w.quantity
      from public.work_entries w
      join public.work_orders o on o.id = w.work_order_id and o.status in ('enviado', 'validado')
      join public.activities_catalog a on a.id = w.activity_id
      left join public.crews c on c.id = o.crew_id
     where w.service_id = p_service and w.deleted_at is null and o.deleted_at is null
       and o.work_date between p_desde and p_hasta
       and w.pci_item_id is null
       and (p_crew is null or o.crew_id = p_crew)
       and (p_supervisor is null or c.supervisor_id = p_supervisor)
       and (p_activity is null or w.activity_id = p_activity)
       and (p_unit is null or coalesce(w.unit_id, a.unit_id) = p_unit)
  ), por_act as (
    select coalesce(p.activity_id, e.activity_id) activity_id, coalesce(p.unit_id, e.unit_id) unit_id,
           coalesce(p.programado, 0) programado, coalesce(e.ejecutado, 0) ejecutado
      from (select activity_id, unit_id, sum(programado) programado from prog group by 1, 2) p
      full join (select activity_id, unit_id, sum(quantity) ejecutado from ejec
                  where plan_item_id in (select id from prog) group by 1, 2) e
        on e.activity_id = p.activity_id and e.unit_id is not distinct from p.unit_id
  ), detalle as (
    select p.id, p.scheduled_on, p.crew_id, p.section_id, p.prog_start_m, p.prog_end_m, p.programado,
           coalesce((select sum(e.quantity) from ejec e where e.plan_item_id = p.id), 0) ejecutado, p.status
      from prog p
  )
  select json_build_object(
    'homogeneo', p_activity is not null and (select count(distinct unit_id) from prog) <= 1,
    'unidad', (select u.symbol from public.units u where u.id = coalesce(p_unit, (select min(unit_id::text)::uuid from prog))),
    'programado', (select sum(programado) from prog),
    'ejecutado', (select sum(ejecutado) from detalle),
    'actividades', (select count(*) from por_act where programado > 0),
    'culminadas', (select count(*) from por_act where programado > 0 and ejecutado >= programado),
    'por_actividad', (select coalesce(json_agg(json_build_object(
          'activity_id', pa.activity_id, 'actividad', a.name, 'codigo', a.code, 'unidad', u.symbol,
          'programado', pa.programado, 'ejecutado', pa.ejecutado, 'saldo', greatest(pa.programado - pa.ejecutado, 0),
          'avance', case when pa.programado > 0 then round(100.0 * pa.ejecutado / pa.programado, 1) end)
          order by a.name), '[]'::json)
        from por_act pa join public.activities_catalog a on a.id = pa.activity_id left join public.units u on u.id = pa.unit_id
       where pa.programado > 0),
    'no_programadas', (select coalesce(json_agg(json_build_object('actividad', a.name, 'unidad', u.symbol, 'ejecutado', x.ej) order by a.name), '[]'::json)
        from (select activity_id, unit_id, sum(quantity) ej from ejec where plan_item_id is null or plan_item_id not in (select id from prog) group by 1, 2) x
        join public.activities_catalog a on a.id = x.activity_id left join public.units u on u.id = x.unit_id),
    'por_dia', (select coalesce(json_agg(json_build_object('fecha', d, 'programado', coalesce(pp.v, 0), 'ejecutado', coalesce(ee.v, 0)) order by d), '[]'::json)
        from generate_series(p_desde, p_hasta, interval '1 day') g(d)
        left join (select scheduled_on f, sum(programado) v from prog group by 1) pp on pp.f = g.d::date
        left join (select work_date f, sum(quantity) v from ejec where plan_item_id in (select id from prog) group by 1) ee on ee.f = g.d::date
       where p_activity is not null and (p_hasta - p_desde) <= 62),
    'por_cuadrilla', (select coalesce(json_agg(json_build_object('crew_id', c.id, 'cuadrilla', c.name, 'programado', x.pr, 'ejecutado', x.ej,
          'saldo', greatest(x.pr - x.ej, 0), 'avance', case when x.pr > 0 then round(100.0 * x.ej / x.pr, 1) end) order by c.code), '[]'::json)
        from (select crew_id, sum(programado) pr, sum(ejecutado) ej from detalle group by 1) x join public.crews c on c.id = x.crew_id
       where p_activity is not null),
    'detalle', (select coalesce(json_agg(json_build_object('plan_item_id', d.id, 'fecha', d.scheduled_on, 'cuadrilla', c.name,
          'sector', (select s.code from public.sector_de(d.section_id, d.prog_start_m) s),
          'prog_inicio', d.prog_start_m, 'prog_fin', d.prog_end_m, 'programado', d.programado, 'ejecutado', d.ejecutado,
          'saldo', greatest(d.programado - d.ejecutado, 0), 'estado', d.status) order by d.scheduled_on, c.code), '[]'::json)
        from detalle d left join public.crews c on c.id = d.crew_id
       where p_activity is not null),
    'jornadas', (select count(distinct (crew_id, work_date)) from ejec where p_activity is not null and plan_item_id in (select id from prog)),
    'referencia', case when p_activity is not null then public.rendimiento_referencia(p_service, p_activity, p_crew) end,
    'partes_publicados', (select count(distinct o.id) from public.work_orders o where o.service_id = p_service and o.deleted_at is null
                             and o.work_date between p_desde and p_hasta and o.publicacion_version > 0
                             and (p_crew is null or o.crew_id = p_crew)),
    'observaciones_abiertas', (select count(*) from public.revision_observaciones r join public.work_orders o on o.id = r.work_order_id
                             where r.service_id = p_service and r.estado <> 'cerrada' and o.work_date between p_desde and p_hasta),
    'ultima_sincronizacion', (select max(s.finished_at) from public.sync_sessions s where s.service_id = p_service)
  )
$function$;

CREATE OR REPLACE FUNCTION public.integrante_agregar(p_crew uuid, p_profile uuid, p_desde date, p_hasta date, p_motivo text, p_nombre text DEFAULT NULL::text, p_dni text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.crews; p public.profiles; v_otro text; v_id uuid;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if not public.es_admin(c.service_id) then raise exception 'SIGOV: solo el Administrador gestiona integrantes' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la incorporación'; end if;
  if p_desde is null or (p_hasta is not null and p_hasta < p_desde) then raise exception 'SIGOV: revisa las fechas Desde / Hasta'; end if;
  if p_profile is null then
    -- Trabajador sin cuenta en SIGOV (obrero de la cuadrilla): nombre obligatorio, DNI para evitar duplicados
    if nullif(trim(p_nombre), '') is null then raise exception 'SIGOV: escribe el nombre del trabajador'; end if;
    p.full_name := trim(p_nombre); p.dni := nullif(trim(p_dni), ''); p.position := nullif(trim(p_cargo), '');
  else
    select * into p from public.profiles where id = p_profile;
    if not found or not exists (select 1 from public.service_members where service_id = c.service_id and profile_id = p_profile) then
      raise exception 'SIGOV: la persona no pertenece al personal del contrato';
    end if;
  end if;
  select cr.name into v_otro from public.crew_members m join public.crews cr on cr.id = m.crew_id
   where ((p_profile is not null and m.profile_id = p_profile) or (p_profile is null and p.dni is not null and m.dni = p.dni)) and cr.service_id = c.service_id and cr.deleted_at is null and m.crew_id <> p_crew
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
end $function$;

CREATE OR REPLACE FUNCTION public.integrante_vigencia(p_id uuid, p_desde date, p_hasta date, p_motivo text, p_finalizar boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Ampliar la vigencia no puede superponerla con otra cuadrilla
  if not p_finalizar and exists (
      select 1 from public.crew_members o join public.crews cr on cr.id = o.crew_id
       where o.id <> m.id and cr.service_id = c.service_id and cr.deleted_at is null and o.crew_id <> m.crew_id
         and ((m.profile_id is not null and o.profile_id = m.profile_id) or (m.profile_id is null and m.dni is not null and o.dni = m.dni))
         and daterange(coalesce(o.desde, '-infinity'::date), coalesce(o.hasta, 'infinity'::date), '[]')
          && daterange(coalesce(p_desde, m.desde, '-infinity'::date), coalesce(p_hasta, 'infinity'::date), '[]')
         and (o.is_active or o.hasta is not null)) then
    raise exception 'SIGOV: con esas fechas se superpone con otra cuadrilla del mismo trabajador';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.crew_members set desde = coalesce(p_desde, desde), hasta = p_hasta,
         is_active = not p_finalizar and (p_hasta is null or p_hasta >= public.hoy_peru()), motivo = trim(p_motivo)
   where id = p_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.cuadrilla_guardar(p_crew uuid, p_leader uuid, p_supervisor uuid, p_sectores text[], p_desde date, p_hasta date, p_motivo text, p_nombre text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.crews;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if not public.es_admin(c.service_id) then raise exception 'SIGOV: solo el Administrador gestiona cuadrillas' using errcode = '42501'; end if;
  if p_leader is null then raise exception 'SIGOV: elige el jefe de cuadrilla'; end if;
  if p_desde is null then raise exception 'SIGOV: indica la vigencia desde'; end if;
  if p_supervisor is null then raise exception 'SIGOV: elige el supervisor de la cuadrilla'; end if;
  if coalesce(cardinality(p_sectores), 0) = 0 then raise exception 'SIGOV: elige al menos un sector de la cuadrilla'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.caja_movimiento_editar(p_id uuid, p_fecha date, p_concepto text, p_solicitado numeric, p_aprobado numeric, p_ejecutado numeric, p_numero_comprobante text, p_proveedor text, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.cash_movements;
begin
  select * into m from public.cash_movements where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el movimiento no existe'; end if;
  perform public.exigir_accion(m.service_id, 'caja', 'editar');
  if public.role_in(m.service_id) not in ('admin', 'residente') then
    raise exception 'SIGOV: los movimientos de la caja presupuestal los edita administración' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio: queda en el historial del movimiento'; end if;
  if m.transferencia_id is not null then raise exception 'SIGOV: una transferencia interna no se edita; regístrala de nuevo con el monto correcto y anula la anterior'; end if;
  if m.status = 'aprobado' then raise exception 'SIGOV: el movimiento ya está aprobado; para corregirlo, registra un ajuste con su motivo'; end if;
  if m.rendicion_id is not null then raise exception 'SIGOV: el movimiento ya forma parte de una rendición'; end if;
  if coalesce(p_ejecutado, 0) <= 0 then raise exception 'SIGOV: el monto ejecutado debe ser mayor que cero'; end if;
  if nullif(trim(p_concepto), '') is null then raise exception 'SIGOV: el concepto es obligatorio'; end if;
  if p_aprobado is not null and p_solicitado is not null and p_aprobado > p_solicitado then
    raise exception 'SIGOV: el monto aprobado no puede superar al solicitado';
  end if;
  if exists (select 1 from public.caja_cierres c where c.service_id = m.service_id and (c.cash_box_id is null or c.cash_box_id = m.cash_box_id)
              and (m.occurred_on between c.desde and c.hasta or coalesce(p_fecha, m.occurred_on) between c.desde and c.hasta)) then
    raise exception 'SIGOV: la fecha cae en un período de caja cerrado; no se edita';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.cash_movements set occurred_on = coalesce(p_fecha, occurred_on), description = trim(p_concepto), category = case when category is null then null else trim(p_concepto) end,
         monto_solicitado = p_solicitado, monto_aprobado = p_aprobado, amount = p_ejecutado,
         receipt_number = nullif(trim(p_numero_comprobante), ''), supplier = nullif(trim(p_proveedor), ''), updated_at = now()
   where id = m.id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.t_evidencia_reglas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  select settings->'evidencias' into r from public.services where id = new.service_id;
  if coalesce(r->>'gps', 'opcional') = 'obligatoria' and (new.lat is null or new.lng is null) then
    raise exception 'SIGOV: el contrato exige GPS en las fotos; activa la ubicación y vuelve a tomarla';
  end if;
  if coalesce(r->>'sello', 'opcional') = 'obligatoria' and not coalesce(new.sello_aplicado, new.watermarked, false) then
    raise exception 'SIGOV: el contrato exige el sello (fecha, hora y ubicación) en la foto; tómala con la cámara de SIGOV';
  end if;
  if coalesce(r->>'fecha_hora', 'obligatoria') = 'obligatoria' and new.taken_at is null then
    raise exception 'SIGOV: la foto necesita su fecha y hora de toma';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_panel(p_service uuid, p_desde date, p_hasta date, p_crew uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_limite integer DEFAULT 10, p_desde_fila integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_res json;
begin
  if not public.ve_lo_interno(p_service) then raise exception 'SIGOV: sin acceso' using errcode = '42501'; end if;
  with base as (
    select * from public.v_ssoma_inspecciones i
     where i.service_id = p_service and public.ssoma_ve(i.service_id, i.crew_id, i.vehicle_id, i.equipment_id) and (i.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
       and (p_crew is null or i.crew_id = p_crew) and (p_tipo is null or i.tipo = p_tipo)
       and (p_estado is null or i.ultima_revision = p_estado or i.vigencia = p_estado or i.aptitud = p_estado)
       and (coalesce(trim(p_q), '') = '' or i.codigo ilike '%' || trim(p_q) || '%' or i.crew_name ilike '%' || trim(p_q) || '%'
            or i.objeto ilike '%' || trim(p_q) || '%' or i.tipo ilike '%' || trim(p_q) || '%')
  ), ult as (
    select distinct on (d.id) d.*, v.version, v.vence_on, v.revision, c.name crew_name
      from public.ssoma_documentos d join public.ssoma_documento_versiones v on v.documento_id = d.id
      left join public.crews c on c.id = d.crew_id
     where d.service_id = p_service and public.ssoma_ve(d.service_id, d.crew_id, d.vehicle_id, d.equipment_id) order by d.id, v.version desc
  )
  select json_build_object(
    'kpis', json_build_object(
      'cuadrillas', (select count(*) from public.crews where service_id = p_service and deleted_at is null),
      'revisiones_pendientes', (select count(*) from base where ultima_revision = 'pendiente'),
      'documentos_vencidos', (select count(*) from ult where vence_on < public.hoy_peru()),
      'hallazgos_abiertos', (select count(*) from public.ssoma_hallazgos where service_id = p_service and estado <> 'cerrado' and public.ssoma_ve(service_id, crew_id, null, null))),
    'total', (select count(*) from base),
    'filas', (select coalesce(json_agg(row_to_json(b)), '[]'::json) from (
                select id, codigo, tipo, crew_name, objeto, fecha, vigencia, ultima_revision, aptitud, hallazgos, hallazgos_abiertos
                  from base order by fecha desc, numero desc limit p_limite offset p_desde_fila) b),
    'alertas', (select coalesce(json_agg(a), '[]'::json) from (
                  select json_build_object('tipo', 'documento', 'texto', u.nombre || ' vencido', 'cuadrilla', u.crew_name, 'nivel', 'rojo', 'estado', 'No apto') a
                    from ult u where u.vence_on < public.hoy_peru()
                  union all
                  select json_build_object('tipo', 'hallazgo', 'texto', h.codigo || ' · ' || h.descripcion, 'cuadrilla', c.name,
                                           'nivel', case when h.fecha_limite < public.hoy_peru() then 'rojo' else 'ambar' end,
                                           'estado', case h.estado when 'abierto' then 'Abierto' when 'por_verificar' then 'Por verificar' else 'Subsanación enviada' end,
                                           'id', h.id)
                    from public.ssoma_hallazgos h left join public.crews c on c.id = h.crew_id
                   where h.service_id = p_service and h.estado <> 'cerrado' and public.ssoma_ve(h.service_id, h.crew_id, null, null)
                  limit 8) x)
  ) into v_res;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_hallazgos_lista(p_service uuid, p_crew uuid DEFAULT NULL::uuid, p_responsable uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_q text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with h as (
    select h.*, c.name crew_name, i.codigo inspeccion_codigo, coalesce(p.full_name, h.responsable_texto) responsable,
           h.estado <> 'cerrado' and h.fecha_limite < public.hoy_peru() vencido,
           (select row_to_json(x) from (select e.detalle, e.cuando, e.actor_nombre, e.evidencias from public.ssoma_eventos e
                                         where e.hallazgo_id = h.id and e.tipo = 'respuesta' order by e.cuando desc limit 1) x) respuesta
      from public.ssoma_hallazgos h
      left join public.crews c on c.id = h.crew_id
      left join public.ssoma_inspecciones i on i.id = h.inspeccion_id
      left join public.profiles p on p.id = h.responsable_id
     where h.service_id = p_service and public.ve_lo_interno(p_service) and (public.ssoma_ve(h.service_id, h.crew_id, null, null) or h.responsable_id = auth.uid())
       and (p_crew is null or h.crew_id = p_crew) and (p_responsable is null or h.responsable_id = p_responsable)
       and (p_desde is null or h.creado_at::date >= p_desde) and (p_hasta is null or h.creado_at::date <= p_hasta)
       and (coalesce(trim(p_q), '') = '' or h.codigo ilike '%' || trim(p_q) || '%' or h.descripcion ilike '%' || trim(p_q) || '%'
            or i.codigo ilike '%' || trim(p_q) || '%')
  )
  select json_build_object(
    'kpis', json_build_object('abiertos', (select count(*) from h where estado = 'abierto'), 'por_verificar', (select count(*) from h where estado in ('por_verificar', 'subsanacion_enviada')),
                              'cerrados', (select count(*) from h where estado = 'cerrado'), 'vencidos', (select count(*) from h where vencido)),
    'responsables', (select coalesce(json_agg(distinct jsonb_build_object('id', responsable_id, 'nombre', responsable)), '[]'::json) from h where responsable_id is not null),
    'filas', (select coalesce(json_agg(row_to_json(x) order by x.creado_at desc), '[]'::json) from (
                select id, codigo, descripcion, inspeccion_id, inspeccion_codigo, crew_name, responsable, fecha_limite, estado, vencido, respuesta, creado_at
                  from h where p_estado is null or (p_estado = 'vencido' and vencido) or estado = p_estado) x)
  )
$function$;

CREATE OR REPLACE FUNCTION public.ssoma_documentos_lista(p_service uuid, p_crew uuid DEFAULT NULL::uuid, p_tipo text DEFAULT NULL::text, p_vigencia text DEFAULT NULL::text, p_revision text DEFAULT NULL::text, p_q text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (
    select d.*, c.name crew_name, coalesce(vh.code, vh.plate, e.code) objeto,
           (select row_to_json(x) from (select v.id, v.version, v.vence_on, v.revision, v.archivo_path, v.archivo_nombre, v.cargado_at, v.nota,
                                               p.full_name cargado_por, r.full_name revisado_por, v.revisado_at, v.motivo
                                          from public.ssoma_documento_versiones v left join public.profiles p on p.id = v.cargado_por
                                          left join public.profiles r on r.id = v.revisado_por
                                         where v.documento_id = d.id order by v.version desc limit 1) x) ultima,
           (select coalesce(json_agg(json_build_object('id', v.id, 'version', v.version, 'vence_on', v.vence_on, 'revision', v.revision,
                                                       'archivo_path', v.archivo_path, 'archivo_nombre', v.archivo_nombre, 'cargado_at', v.cargado_at, 'motivo', v.motivo)
                                     order by v.version desc), '[]'::json)
              from public.ssoma_documento_versiones v where v.documento_id = d.id) versiones
      from public.ssoma_documentos d
      left join public.crews c on c.id = d.crew_id
      left join public.vehicles vh on vh.id = d.vehicle_id
      left join public.safety_equipment e on e.id = d.equipment_id
     where d.service_id = p_service and public.ve_lo_interno(p_service) and (public.ssoma_ve(d.service_id, d.crew_id, d.vehicle_id, d.equipment_id) or d.titular_id = auth.uid())
       and (p_crew is null or d.crew_id = p_crew) and (p_tipo is null or d.tipo = p_tipo)
       and (coalesce(trim(p_q), '') = '' or d.codigo ilike '%' || trim(p_q) || '%' or d.nombre ilike '%' || trim(p_q) || '%' or c.name ilike '%' || trim(p_q) || '%')
  ), f as (
    select d.*, case when (d.ultima->>'vence_on') is null then 'no_aplica'
                     when (d.ultima->>'vence_on')::date < public.hoy_peru() then 'vencido' else 'vigente' end vigencia
      from d
  )
  select json_build_object(
    'kpis', json_build_object('documentos', (select count(*) from f),
                              'pendiente', (select count(*) from f where ultima->>'revision' = 'pendiente'),
                              'observado', (select count(*) from f where ultima->>'revision' = 'observado'),
                              'conformes', (select count(*) from f where ultima->>'revision' = 'conforme'),
                              'vencidos', (select count(*) from f where vigencia = 'vencido')),
    'filas', (select coalesce(json_agg(json_build_object('id', f.id, 'codigo', f.codigo, 'tipo', f.tipo, 'nombre', f.nombre, 'crew_name', f.crew_name,
                        'objeto', f.objeto, 'vehicle_id', f.vehicle_id, 'equipment_id', f.equipment_id, 'vigencia', f.vigencia,
                        'ultima', f.ultima, 'versiones', f.versiones) order by (f.vigencia = 'vencido') desc, f.nombre), '[]'::json)
                from f where (p_vigencia is null or f.vigencia = p_vigencia) and (p_revision is null or f.ultima->>'revision' = p_revision))
  )
$function$;

CREATE OR REPLACE FUNCTION public.ssoma_inspeccion(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i record; v_res json;
begin
  select * into i from public.v_ssoma_inspecciones where id = p_id;
  if not found or not public.ve_lo_interno(i.service_id) or not public.ssoma_ve(i.service_id, i.crew_id, i.vehicle_id, i.equipment_id) then raise exception 'SIGOV: sin acceso' using errcode = '42501'; end if;
  select json_build_object(
    'inspeccion', (select row_to_json(x) from public.v_ssoma_inspecciones x where x.id = p_id),
    'documentos', (select coalesce(json_agg(json_build_object('id', d.id, 'codigo', d.codigo, 'tipo', d.tipo, 'nombre', d.nombre,
                     'version', v.version, 'vence_on', v.vence_on, 'revision', v.revision, 'archivo_path', v.archivo_path,
                     'vigencia', case when v.vence_on is null then 'no_aplica' when v.vence_on < public.hoy_peru() then 'vencido' else 'vigente' end)
                   order by d.tipo), '[]'::json)
                     from public.ssoma_documentos d
                     left join lateral (select * from public.ssoma_documento_versiones v where v.documento_id = d.id order by v.version desc limit 1) v on true
                    where (i.vehicle_id is not null and d.vehicle_id = i.vehicle_id) or (i.equipment_id is not null and d.equipment_id = i.equipment_id)),
    'hallazgos', (select coalesce(json_agg(json_build_object('id', h.id, 'codigo', h.codigo, 'descripcion', h.descripcion,
                    'responsable', coalesce(p.full_name, h.responsable_texto), 'fecha_limite', h.fecha_limite, 'estado', h.estado,
                    'vencido', h.estado <> 'cerrado' and h.fecha_limite < public.hoy_peru()) order by h.numero), '[]'::json)
                    from public.ssoma_hallazgos h left join public.profiles p on p.id = h.responsable_id where h.inspeccion_id = p_id),
    'evidencias', (select coalesce(json_agg(json_build_object('id', e.id, 'codigo', e.codigo, 'nombre', e.nombre, 'mime', e.mime, 'bytes', e.bytes,
                     'storage_path', e.storage_path, 'descripcion', e.descripcion, 'origen', e.origen, 'tomada_at', e.tomada_at, 'subida_at', e.subida_at,
                     'autor', p.full_name, 'lat', e.lat, 'lng', e.lng, 'borrador', e.borrador, 'objeto_tipo', e.objeto_tipo) order by e.numero), '[]'::json)
                     from public.ssoma_evidencias e left join public.profiles p on p.id = e.autor
                    where (e.objeto_tipo = 'inspeccion' and e.objeto_id = p_id)
                       or (e.objeto_tipo = 'hallazgo' and e.objeto_id in (select id from public.ssoma_hallazgos where inspeccion_id = p_id))),
    -- Las fotos que ya trae el registro de campo (no se duplican: se enlazan)
    'fotos_origen', (case i.origen_tabla
                       when 'safety_equipment_checks' then (select coalesce(json_agg(json_build_object('path', c.storage_path, 'bucket', 'documentos', 'nombre', 'Foto de la revisión')), '[]'::json)
                                                              from public.safety_equipment_checks c where c.id = i.origen_id and c.storage_path is not null)
                       when 'hygiene_checks' then (select coalesce(json_agg(json_build_object('path', h.storage_path, 'bucket', 'documentos', 'nombre', 'Higiene · ' || h.item)), '[]'::json)
                                                     from public.hygiene_checks h where h.crew_id = i.crew_id and h.checked_on = (i.fecha at time zone 'America/Lima')::date
                                                      and h.storage_path is not null and h.deleted_at is null)
                       else (select coalesce(json_agg(json_build_object('path', p.storage_path, 'bucket', 'documentos', 'nombre', 'Formato · ' || dd.tipo)), '[]'::json)
                               from public.documentos_del_dia dd join public.documento_paginas p on p.documento_id = dd.id
                              where dd.crew_id = i.crew_id and dd.doc_date = (i.fecha at time zone 'America/Lima')::date and dd.deleted_at is null and p.deleted_at is null
                                and dd.tipo::text = case i.tipo when 'vehiculo' then 'checklist_vehicular' when 'ats' then 'ats' when 'charla' then 'charla' when 'checklist' then 'checklist' else '-' end)
                     end),
    'revision_borrador', (select row_to_json(r) from (select resultado, motivo, cuando from public.ssoma_revisiones
                            where objeto_tipo = 'inspeccion' and objeto_id = p_id and borrador and quien = auth.uid() order by cuando desc limit 1) r)
  ) into v_res;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_historial(p_inspeccion uuid DEFAULT NULL::uuid, p_hallazgo uuid DEFAULT NULL::uuid, p_documento uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_agg(json_build_object('id', e.id, 'codigo', e.codigo, 'tipo', e.tipo, 'titulo', e.titulo, 'detalle', e.detalle,
           'version', e.version, 'resultado', e.resultado, 'antes', e.antes, 'despues', e.despues, 'actor', coalesce(e.actor_nombre, 'Sistema'),
           'cuando', e.cuando, 'hallazgo_id', e.hallazgo_id, 'documento_id', e.documento_id,
           'hallazgo_codigo', (select codigo from public.ssoma_hallazgos where id = e.hallazgo_id),
           'evidencias', (select coalesce(json_agg(json_build_object('id', x.id, 'codigo', x.codigo, 'nombre', x.nombre, 'storage_path', x.storage_path, 'bytes', x.bytes, 'mime', x.mime)), '[]'::json)
                            from public.ssoma_evidencias x where x.id = any(e.evidencias)))
         order by e.cuando desc), '[]'::json)
    from public.ssoma_eventos e
   where public.ve_lo_interno(e.service_id) and public.ssoma_ve_evento(e.service_id, e.inspeccion_id, e.hallazgo_id, e.documento_id)
     and ((p_inspeccion is not null and (e.inspeccion_id = p_inspeccion
            or e.hallazgo_id in (select id from public.ssoma_hallazgos where inspeccion_id = p_inspeccion)
            or e.documento_id in (select d.id from public.ssoma_documentos d join public.ssoma_inspecciones i on i.id = p_inspeccion
                                   where (i.vehicle_id is not null and d.vehicle_id = i.vehicle_id) or (i.equipment_id is not null and d.equipment_id = i.equipment_id))))
       or (p_hallazgo is not null and e.hallazgo_id = p_hallazgo)
       or (p_documento is not null and e.documento_id = p_documento))
$function$;

grant execute on function public.integrante_agregar(uuid, uuid, date, date, text, text, text, text) to authenticated;
revoke execute on function public.integrante_agregar(uuid, uuid, date, date, text, text, text, text) from anon;
notify pgrst, 'reload schema';
