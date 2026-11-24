-- ═══════════════════════════════════════════════════════════════════════════
-- 0157 · Reglas del repaso final (revisión visual 18/11)
-- · Historial del ítem: COVINCA ve «Registró atención» del ítem publicado (sin la cifra interna).
-- · SSOMA: la nueva versión de un documento la carga el jefe (o administración), no SSOMA;
--   un documento nuevo no reactiva el vehículo hasta que SSOMA lo revisa conforme;
--   el hallazgo se cierra solo con evidencia; SSOMA no subsana por el responsable.
-- · Recursos: SOAT o revisión técnica vencidos = no apto para circular; no se asigna.
-- · Caja: el Disponible se calcula en el mismo período que los demás KPIs.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pci_item_historial(p_item uuid)
returns json language sql stable security definer set search_path to 'public' as $$
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
           pv.full_name, v.entidad, null
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
$$;

create or replace function public.ssoma_documento_version(p_documento uuid, p_vence date, p_archivo_path text, p_archivo_nombre text, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.ssoma_documentos; prev public.ssoma_documento_versiones; v_ver int; v_id uuid;
begin
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
end $$;

create or replace function public.ssoma_revisar(p_objeto_tipo text, p_objeto_id uuid, p_resultado text, p_motivo text,
                                                p_evidencias uuid[] default '{}', p_borrador boolean default false, p_verificado boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_sid uuid; i public.ssoma_inspecciones; v public.ssoma_documento_versiones; d public.ssoma_documentos; h public.ssoma_hallazgos; v_txt text;
begin
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
end $$;

create or replace function public.ssoma_hallazgo_responder(p_hallazgo uuid, p_texto text, p_evidencias uuid[] default '{}')
returns json language plpgsql security definer set search_path to 'public' as $$
declare h public.ssoma_hallazgos; r record;
begin
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
end $$;

create or replace function public.asignacion_verificar(p_vehicle uuid, p_crew uuid, p_desde date, p_hasta date)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'conflictos', (select coalesce(json_agg(json_build_object('cuadrilla', c.name, 'tipo', a.kind, 'desde', a.start_on, 'hasta', a.end_on)), '[]'::json)
                     from public.crew_vehicle_assignments a join public.crews c on c.id = a.crew_id
                    where a.vehicle_id = p_vehicle and a.crew_id is distinct from p_crew
                      and daterange(a.start_on, coalesce(a.end_on, 'infinity'::date), '[]') && daterange(p_desde, coalesce(p_hasta, 'infinity'::date), '[]')),
    'de_la_cuadrilla', (select count(*) from public.crew_vehicle_assignments a where a.crew_id = p_crew and a.end_on is null),
    'vehiculo', (select json_build_object('estado', v.status, 'soat', v.soat_expires_on, 'revision', v.inspection_expires_on, 'poliza', v.policy_expires_on,
                                          'validacion', v.validation_status,
                                          -- Operativo mecánico no es apto para circular: con SOAT o revisión técnica vencidos, no circula
                                          'apto', (v.soat_expires_on is null or v.soat_expires_on >= coalesce(p_desde, public.hoy_peru()))
                                                  and (v.inspection_expires_on is null or v.inspection_expires_on >= coalesce(p_desde, public.hoy_peru()))
                                                  and coalesce(v.status::text, 'operativo') not in ('inoperativo', 'dado_de_baja'),
                                          'motivo_no_apto', case
                                            when v.soat_expires_on < coalesce(p_desde, public.hoy_peru()) then 'SOAT vencido el ' || to_char(v.soat_expires_on, 'DD/MM/YYYY')
                                            when v.inspection_expires_on < coalesce(p_desde, public.hoy_peru()) then 'Revisión técnica vencida el ' || to_char(v.inspection_expires_on, 'DD/MM/YYYY')
                                            when v.status::text in ('inoperativo', 'dado_de_baja') then 'Vehículo ' || replace(v.status::text, '_', ' ') end)
                 from public.vehicles v where v.id = p_vehicle)
  )
$$;

create or replace function public.asignacion_guardar(p_vehicle uuid, p_crew uuid, p_kind text, p_desde date, p_hasta date, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v public.vehicles; c json; v_id uuid;
begin
  select * into v from public.vehicles where id = p_vehicle and deleted_at is null;
  if not found then raise exception 'SIGOV: el vehículo no existe'; end if;
  if not public.es_admin(v.service_id) then raise exception 'SIGOV: las asignaciones de recursos las hace el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la asignación'; end if;
  if p_desde is null or (p_hasta is not null and p_hasta < p_desde) then raise exception 'SIGOV: revisa las fechas'; end if;
  c := public.asignacion_verificar(p_vehicle, p_crew, p_desde, p_hasta);
  if not coalesce((c->'vehiculo'->>'apto')::boolean, true) then
    raise exception 'SIGOV: el vehículo no es apto para circular (%); no se asigna', c->'vehiculo'->>'motivo_no_apto';
  end if;
  if json_array_length(c->'conflictos') > 0 then
    raise exception 'SIGOV: el vehículo ya está asignado a % en esas fechas (asignación en conflicto)', (c->'conflictos'->0->>'cuadrilla');
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  insert into public.crew_vehicle_assignments (service_id, vehicle_id, crew_id, kind, start_on, end_on, reason)
  values (v.service_id, p_vehicle, p_crew, coalesce(p_kind, 'titular'), p_desde, p_hasta, trim(p_motivo))
  returning id into v_id;
  update public.vehicles set crew_id = p_crew, updated_at = now() where id = p_vehicle and (p_hasta is null or p_hasta >= public.hoy_peru());
  perform set_config('sigov.motivo', '', true);
  return json_build_object('id', v_id);
end $$;

create or replace function public.caja_periodo(p_service uuid, p_box uuid, p_desde date, p_hasta date)
returns json language sql stable security definer set search_path to 'public' as $$
  with m as (
    select m.*, b.name caja, b.holder_id, c.name cuadrilla, c.code crew_code, hp.full_name responsable,
           dr.amount dr_solicitado, dr.approved_amount dr_aprobado, r.codigo rendicion_codigo, r.estado rendicion_estado,
           cp.full_name creado_por_nombre, rp.full_name revisado_por_nombre
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id
      left join public.crews c on c.id = b.crew_id
      left join public.profiles hp on hp.id = b.holder_id
      left join public.profiles cp on cp.id = m.created_by
      left join public.profiles rp on rp.id = m.reviewed_by
      left join public.deposit_requests dr on dr.movement_id = m.id and dr.deleted_at is null
      left join public.rendiciones r on r.id = m.rendicion_id
     where m.service_id = p_service and m.deleted_at is null and m.status <> 'anulado' and (p_box is null or m.cash_box_id = p_box)
       and m.occurred_on between p_desde and p_hasta
       and public.role_in(p_service) in ('admin', 'residente', 'supervisor')
  )
  select json_build_object(
    -- Las transferencias internas reasignan fondos: no son fondo nuevo ni gasto
    'fondo', (select coalesce(sum(amount), 0) from m where kind in ('apertura', 'deposito') and transferencia_id is null),
    'sustentado', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status = 'aprobado'),
    'pendiente', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status in ('registrado', 'observado')),
    -- Del mismo período: entradas menos salidas (las transferencias internas se compensan entre cajas)
    'disponible', (select coalesce(sum(case when kind in ('apertura', 'deposito', 'ajuste') then amount when kind in ('gasto', 'devolucion') then -amount else 0 end), 0) from m),
    'saldo_actual', (select coalesce(sum(balance), 0) from public.v_cash_boxes where service_id = p_service and (p_box is null or id = p_box)),
    'movimientos', (select coalesce(json_agg(json_build_object(
                      'id', id, 'numero', numero, 'codigo', 'MOV' || lpad(coalesce(numero, 0)::text, 3, '0'), 'fecha', occurred_on,
                      'caja', caja, 'cash_box_id', cash_box_id, 'cuadrilla', coalesce(cuadrilla, caja), 'crew_code', crew_code,
                      'responsable', responsable, 'responsable_id', holder_id,
                      'tipo', case when transferencia_id is not null then 'transferencia' else kind::text end,
                      'concepto', coalesce(category, description), 'descripcion', description,
                      'comprobante', case when transferencia_id is not null then 'Interno' when receipt_kind = 'sin_comprobante' then 'Sin comprobante' else initcap(receipt_kind::text) end,
                      'numero_comprobante', receipt_number, 'proveedor', supplier,
                      'monto', amount,
                      'solicitado', coalesce(monto_solicitado, dr_solicitado, amount),
                      'aprobado', coalesce(monto_aprobado, dr_aprobado, case when status = 'aprobado' or kind <> 'gasto' then amount end),
                      'ejecutado', amount,
                      'estado', status,
                      'estado_ui', case when transferencia_id is not null then 'interno'
                                        when status = 'aprobado' then 'conforme' when status = 'observado' then 'observado'
                                        when kind = 'gasto' then 'pendiente' else 'registrado' end,
                      'nota', review_note, 'justificacion', justification,
                      'sustentado', case when kind = 'gasto' and status = 'aprobado' then amount else 0 end,
                      'pendiente', case when kind = 'gasto' and status in ('registrado', 'observado') then amount else 0 end,
                      'rendicion_id', rendicion_id, 'rendicion_codigo', rendicion_codigo, 'rendicion_estado', rendicion_estado,
                      'archivo', storage_path, 'creado_at', created_at, 'creado_por', creado_por_nombre,
                      'revisado_at', reviewed_at, 'revisado_por', revisado_por_nombre, 'transferencia_id', transferencia_id)
                    order by occurred_on desc, numero desc), '[]'::json) from m)
  )
$$;
