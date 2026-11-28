-- ═══════════════════════════════════════════════════════════════════════
-- 0179 · Ronda 5 (CP-07): reglas de evidencia por módulo, no una sola
-- configuración para todo. Cada módulo (PCI, MR, evidencia complementaria,
-- Inventario, Observaciones, ATS, Charla, Checklist, Vehículos e
-- Inspecciones SSOMA) declara mínimo de fotos, GPS, sello, galería,
-- formatos y quién revisa; con alcance general (contrato) o específico de
-- una cuadrilla, que prevalece sobre el general.
--   settings.evidencias.modulos.<modulo>               → general
--   settings.evidencias.cuadrillas.<crew_id>.<modulo>  → específica
-- PCI mantiene su estándar fijo: 1 Antes, 1 Durante y 1 a 3 Después.
-- La base aplica al cargar cada foto: GPS, sello y galería del módulo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.reglas_evidencia_modulo_guardar(p_service uuid, p_crew uuid, p_modulo text, p_reglas jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare k text; v text; ruta text[];
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  if p_modulo not in ('pci', 'mr', 'complementaria', 'inventario', 'observaciones', 'ats', 'charla', 'checklist', 'vehiculos', 'inspecciones') then
    raise exception 'SIGOV: módulo desconocido %', p_modulo;
  end if;
  if p_crew is not null and not exists (select 1 from public.crews where id = p_crew and service_id = p_service) then
    raise exception 'SIGOV: la cuadrilla no es de este contrato';
  end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_reglas, '{}'::jsonb)) loop
    if k = 'minimo' then
      if p_modulo = 'pci' then raise exception 'SIGOV: el estándar de fases del PCI (1 Antes, 1 Durante, 1 a 3 Después) es fijo'; end if;
      if v !~ '^\d{1,2}$' then raise exception 'SIGOV: el mínimo de fotos debe ser un número entero de 0 a 99'; end if;
    elsif k in ('gps', 'sello') then
      if v not in ('obligatoria', 'opcional') then raise exception 'SIGOV: valor no válido para %', k; end if;
    elsif k = 'galeria' then
      if v not in ('permitida', 'no_permitida') then raise exception 'SIGOV: valor no válido para galería'; end if;
    elsif k = 'formatos' then
      if length(v) > 60 then raise exception 'SIGOV: formatos demasiado largo'; end if;
    elsif k = 'revision' then
      if length(v) > 120 then raise exception 'SIGOV: revisión demasiado larga'; end if;
    else
      raise exception 'SIGOV: regla desconocida %', k;
    end if;
  end loop;
  ruta := case when p_crew is null then array['evidencias', 'modulos', p_modulo] else array['evidencias', 'cuadrillas', p_crew::text, p_modulo] end;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.services s
     set settings = jsonb_set(
           jsonb_set(
             jsonb_set(jsonb_set(coalesce(s.settings, '{}'::jsonb), '{evidencias}', coalesce(s.settings->'evidencias', '{}'::jsonb)),
                       '{evidencias,modulos}', coalesce(s.settings->'evidencias'->'modulos', '{}'::jsonb)),
             '{evidencias,cuadrillas}', coalesce(s.settings->'evidencias'->'cuadrillas', '{}'::jsonb)),
           ruta[1:array_length(ruta, 1) - 1],
           coalesce(s.settings #> ruta[1:array_length(ruta, 1) - 1], '{}'::jsonb))
   where s.id = p_service;
  -- Sin reglas = quitar la específica (vuelve a la general)
  if p_crew is not null and coalesce(p_reglas, '{}'::jsonb) = '{}'::jsonb then
    update public.services set settings = settings #- ruta, updated_at = now() where id = p_service;
  else
    update public.services set settings = jsonb_set(settings, ruta, coalesce(p_reglas, '{}'::jsonb)), updated_at = now() where id = p_service;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
revoke all on function public.reglas_evidencia_modulo_guardar(uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function public.reglas_evidencia_modulo_guardar(uuid, uuid, text, jsonb, text) to authenticated;

-- La regla vigente de una foto: específica de su cuadrilla › general del
-- módulo › regla global del contrato › valor por defecto
create or replace function public.regla_evidencia(p_service uuid, p_crew uuid, p_modulo text, p_clave text, p_defecto text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    case when p_crew is not null then s.settings->'evidencias'->'cuadrillas'->(p_crew::text)->p_modulo->>p_clave end,
    s.settings->'evidencias'->'modulos'->p_modulo->>p_clave,
    case when p_clave in ('gps', 'sello') then s.settings->'evidencias'->>p_clave end,
    p_defecto)
  from public.services s where s.id = p_service
$$;
revoke all on function public.regla_evidencia(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.regla_evidencia(uuid, uuid, text, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.t_evidencia_reglas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; v_mod text; v_crew uuid; v_nom text;
begin
  select settings->'evidencias' into r from public.services where id = new.service_id;
  -- Módulo y cuadrilla de la foto (CP-07)
  if new.pci_item_id is not null then
    v_mod := 'pci'; select assigned_crew_id into v_crew from public.pci_items where id = new.pci_item_id;
  elsif new.observacion_id is not null then
    v_mod := 'observaciones';
  elsif new.asset_id is not null then
    v_mod := 'inventario';
  elsif new.talk_id is not null then
    v_mod := 'charla';
  elsif new.work_entry_id is not null then
    v_mod := case when new.phase::text = 'general' then 'complementaria' else 'mr' end;
  else
    v_mod := 'complementaria';
  end if;
  if v_crew is null and new.work_entry_id is not null then
    select w.crew_id into v_crew from public.work_entries e join public.work_orders w on w.id = e.work_order_id where e.id = new.work_entry_id;
  end if;
  v_nom := case v_mod when 'pci' then 'PCI' when 'mr' then 'mantenimiento rutinario' when 'complementaria' then 'evidencia complementaria'
                      when 'inventario' then 'Inventario' when 'observaciones' then 'Observaciones' else v_mod end;
  if public.regla_evidencia(new.service_id, v_crew, v_mod, 'gps', 'opcional') = 'obligatoria' and (new.lat is null or new.lng is null) then
    raise exception 'SIGOV: en % el contrato exige GPS en las fotos; activa la ubicación y vuelve a tomarla', v_nom;
  end if;
  if public.regla_evidencia(new.service_id, v_crew, v_mod, 'sello', 'opcional') = 'obligatoria' and not coalesce(new.sello_aplicado, new.watermarked, false) then
    raise exception 'SIGOV: en % el contrato exige el sello (fecha, hora y ubicación) en la foto; tómala con la cámara de SIGOV o aplica el sello', v_nom;
  end if;
  if public.regla_evidencia(new.service_id, v_crew, v_mod, 'galeria', 'permitida') = 'no_permitida' and new.origen_captura = 'galeria' then
    raise exception 'SIGOV: en % no se admiten fotos de galería; tómala con la cámara de SIGOV', v_nom;
  end if;
  if coalesce(r->>'fecha_hora', 'obligatoria') = 'obligatoria' and new.taken_at is null then
    raise exception 'SIGOV: la foto necesita su fecha y hora de toma';
  end if;
  return new;
end $function$;

-- Guardar las reglas globales ya no reemplaza todo «evidencias»: se
-- combinan, para no borrar las reglas por módulo ni las específicas
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
  update public.services
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('evidencias', coalesce(settings->'evidencias', '{}'::jsonb) || p_reglas),
         updated_at = now()
   where id = p_service;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
