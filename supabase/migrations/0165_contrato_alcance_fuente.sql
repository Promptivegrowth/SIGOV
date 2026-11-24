-- ═══════════════════════════════════════════════════════════════════════════
-- 0165 · Configuración del sistema › Contrato (ADMIN_SUB_Config_Contrato,
-- repaso 18/11 punto 13): los sectores del alcance se eligen y se versionan,
-- con la fuente contractual y la etiqueta de versión. Guardar no reasigna
-- cuadrillas ni modifica plazos oficiales.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.contrato_guardar(p_service uuid, p_datos jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_ver int; s public.services; v_sect jsonb; v_malos text;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador edita el contrato' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo: el cambio se guarda como nueva versión'; end if;
  if (p_datos->>'ends_on')::date < (p_datos->>'starts_on')::date then raise exception 'SIGOV: el fin de la vigencia no puede ser anterior al inicio'; end if;
  -- Sectores del alcance: solo códigos que existen en el contrato y al menos uno
  if p_datos ? 'sectores' then
    if jsonb_typeof(p_datos->'sectores') <> 'array' or jsonb_array_length(p_datos->'sectores') = 0 then
      raise exception 'SIGOV: elige al menos un sector para el alcance del contrato';
    end if;
    select string_agg(x, ', ') into v_malos from jsonb_array_elements_text(p_datos->'sectores') x
     where not exists (select 1 from public.service_sectors ss where ss.service_id = p_service and ss.code = x);
    if v_malos is not null then raise exception 'SIGOV: sectores que no existen en el contrato: %', v_malos; end if;
    v_sect := p_datos->'sectores';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.services set
    name = coalesce(nullif(trim(p_datos->>'name'), ''), name), client_name = coalesce(nullif(trim(p_datos->>'client_name'), ''), client_name),
    contract_code = coalesce(nullif(trim(p_datos->>'contract_code'), ''), contract_code), description = coalesce(p_datos->>'description', description),
    starts_on = coalesce((p_datos->>'starts_on')::date, starts_on), ends_on = coalesce((p_datos->>'ends_on')::date, ends_on),
    settings = coalesce(settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'zona_horaria', p_datos->>'zona_horaria', 'operador', p_datos->>'operador', 'sectores_alcance', v_sect,
      'fuente_contractual', nullif(trim(p_datos->>'fuente_contractual'), ''), 'version_etiqueta', nullif(trim(p_datos->>'version_etiqueta'), ''))),
    updated_at = now()
   where id = p_service returning * into s;
  perform set_config('sigov.motivo', '', true);
  select coalesce(max(version), 0) + 1 into v_ver from public.contrato_versiones where service_id = p_service;
  insert into public.contrato_versiones (service_id, version, datos, motivo, quien)
  values (p_service, v_ver, jsonb_build_object('name', s.name, 'code', s.code, 'client_name', s.client_name, 'contract_code', s.contract_code, 'description', s.description,
          'starts_on', s.starts_on, 'ends_on', s.ends_on, 'status', s.status, 'zona_horaria', coalesce(s.settings->>'zona_horaria', 'America/Lima'), 'operador', s.settings->>'operador',
          'sectores', s.settings->'sectores_alcance', 'fuente_contractual', s.settings->>'fuente_contractual', 'version_etiqueta', s.settings->>'version_etiqueta'),
          trim(p_motivo), auth.uid());
  return json_build_object('version', v_ver);
end $$;
grant execute on function public.contrato_guardar(uuid, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
