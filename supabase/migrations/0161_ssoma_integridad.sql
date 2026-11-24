-- ═══════════════════════════════════════════════════════════════════════════
-- 0161 · SSOMA: integridad de evidencias y revisiones (repaso del 18/11,
-- puntos 21–22 del revisor)
-- · ssoma_evidencias con huella (sha256) y client_id: un reintento o el mismo
--   archivo en el mismo objeto no se duplica.
-- · ssoma_revisar recibe la versión que se revisa (p_version); solo la última
--   versión rige para el vehículo/equipo.
-- · ssoma_borrador: el último borrador de revisión de quien consulta, si es
--   posterior a la última revisión registrada, para recuperarlo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ssoma_evidencias add column if not exists sha256 text;
alter table public.ssoma_evidencias add column if not exists client_id uuid;
create unique index if not exists ux_ssoma_ev_client on public.ssoma_evidencias (client_id) where client_id is not null;
create index if not exists ix_ssoma_ev_sha on public.ssoma_evidencias (objeto_tipo, objeto_id, sha256) where sha256 is not null;

drop function if exists public.ssoma_evidencia_registrar(uuid, text, uuid, text, text, text, bigint, text, text, timestamptz, boolean, double precision, double precision);
drop function if exists public.ssoma_revisar(text, uuid, text, text, uuid[], boolean, boolean);

CREATE OR REPLACE FUNCTION public.ssoma_evidencia_registrar(p_service uuid, p_objeto_tipo text, p_objeto_id uuid, p_path text, p_nombre text, p_mime text, p_bytes bigint, p_descripcion text, p_origen text DEFAULT 'archivo'::text, p_tomada_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_borrador boolean DEFAULT false, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_sha256 text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text; v_insp uuid; v_hz uuid; v_doc uuid; x public.ssoma_evidencias;
begin
  perform public.exigir_accion(p_service, 'ssoma', 'crear');  -- Roles y permisos (0159)
  if not public.can_write(p_service) then raise exception 'SIGOV: sin permiso para adjuntar' using errcode = '42501'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'SIGOV: la descripción es obligatoria'; end if;
  if split_part(p_path, '/', 1) <> p_service::text then raise exception 'SIGOV: ruta de archivo no válida'; end if;
  -- Reintento de la misma carga: devuelve lo ya registrado, no duplica
  if p_client_id is not null then
    select * into x from public.ssoma_evidencias where client_id = p_client_id;
    if found then return json_build_object('id', x.id, 'codigo', x.codigo, 'repetida', true); end if;
  end if;
  -- El mismo archivo (misma huella) ya adjunto al mismo objeto: no se duplica
  if nullif(trim(p_sha256), '') is not null then
    select * into x from public.ssoma_evidencias where objeto_tipo = p_objeto_tipo and objeto_id = p_objeto_id and sha256 = lower(trim(p_sha256)) limit 1;
    if found then return json_build_object('id', x.id, 'codigo', x.codigo, 'duplicada', true); end if;
  end if;
  insert into public.ssoma_evidencias (service_id, numero, objeto_tipo, objeto_id, storage_path, nombre, mime, bytes, descripcion, origen, tomada_at, autor, lat, lng, borrador, sha256, client_id)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_evidencias'), p_objeto_tipo, p_objeto_id, p_path, p_nombre, p_mime, p_bytes,
          left(trim(p_descripcion), 250), coalesce(p_origen, 'archivo'), p_tomada_at, auth.uid(), p_lat, p_lng, coalesce(p_borrador, false), lower(nullif(trim(p_sha256), '')), p_client_id)
  returning id, codigo into v_id, v_cod;
  if p_objeto_tipo = 'inspeccion' then v_insp := p_objeto_id;
  elsif p_objeto_tipo = 'hallazgo' then v_hz := p_objeto_id; select inspeccion_id into v_insp from public.ssoma_hallazgos where id = p_objeto_id;
  else v_doc := p_objeto_id; end if;
  perform public.ssoma_evento(p_service, 'evidencia', case when p_borrador then 'Evidencia en borrador ' else 'Evidencia adjunta ' end || v_cod || ' · ' || p_nombre,
    left(trim(p_descripcion), 250), v_insp, v_hz, v_doc, null, null, null, null, array[v_id]);
  return json_build_object('id', v_id, 'codigo', v_cod);
end $function$;

CREATE OR REPLACE FUNCTION public.ssoma_revisar(p_objeto_tipo text, p_objeto_id uuid, p_resultado text, p_motivo text, p_evidencias uuid[] DEFAULT '{}'::uuid[], p_borrador boolean DEFAULT false, p_verificado boolean DEFAULT false, p_version uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; i public.ssoma_inspecciones; v public.ssoma_documento_versiones; d public.ssoma_documentos; h public.ssoma_hallazgos; v_txt text; v_ultima int;
begin
  perform public.exigir_accion(case p_objeto_tipo when 'inspeccion' then (select service_id from public.ssoma_inspecciones where id = p_objeto_id) when 'documento' then (select service_id from public.ssoma_documentos where id = p_objeto_id) else (select service_id from public.ssoma_hallazgos where id = p_objeto_id) end, 'ssoma', 'validar');  -- Roles y permisos (0159)
  if p_objeto_tipo = 'inspeccion' then select * into i from public.ssoma_inspecciones where id = p_objeto_id for update; v_sid := i.service_id;
  elsif p_objeto_tipo = 'documento' then
    select * into d from public.ssoma_documentos where id = p_objeto_id; v_sid := d.service_id;
    select max(version) into v_ultima from public.ssoma_documento_versiones where documento_id = d.id;
    -- La revisión va sobre la versión que se está viendo (o la última si no se indica)
    if p_version is not null then
      select * into v from public.ssoma_documento_versiones where id = p_version and documento_id = d.id for update;
      if not found then raise exception 'SIGOV: esa versión no es de este documento'; end if;
    else
      select * into v from public.ssoma_documento_versiones where documento_id = d.id order by version desc limit 1 for update;
    end if;
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
    -- Solo la versión vigente (la última) actualiza el vehículo o equipo; revisar una anterior no lo cambia
    if p_resultado = 'conforme' and v.vence_on is not null and v.version = v_ultima then
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

grant execute on function public.ssoma_evidencia_registrar(uuid, text, uuid, text, text, text, bigint, text, text, timestamptz, boolean, double precision, double precision, text, uuid) to authenticated;
revoke execute on function public.ssoma_evidencia_registrar(uuid, text, uuid, text, text, text, bigint, text, text, timestamptz, boolean, double precision, double precision, text, uuid) from anon;
grant execute on function public.ssoma_revisar(text, uuid, text, text, uuid[], boolean, boolean, uuid) to authenticated;
revoke execute on function public.ssoma_revisar(text, uuid, text, text, uuid[], boolean, boolean, uuid) from anon;

create or replace function public.ssoma_borrador(p_objeto_tipo text, p_objeto_id uuid, p_version uuid default null)
returns json language sql stable security definer set search_path to 'public' as $$
  select row_to_json(b) from (
    select r.id, r.resultado, r.motivo, r.evidencias, r.version_id, r.cuando
      from public.ssoma_revisiones r
     where r.objeto_tipo = p_objeto_tipo and r.objeto_id = p_objeto_id and r.borrador and r.quien = auth.uid()
       and (p_version is null or r.version_id = p_version)
       and r.cuando > coalesce((select max(f.cuando) from public.ssoma_revisiones f
                                 where f.objeto_tipo = p_objeto_tipo and f.objeto_id = p_objeto_id and not f.borrador
                                   and (p_version is null or f.version_id = p_version)), '-infinity')
     order by r.cuando desc limit 1) b
$$;
revoke all on function public.ssoma_borrador(text, uuid, uuid) from public, anon;
grant execute on function public.ssoma_borrador(text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
