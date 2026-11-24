-- 0163 · Observación del ítem (V11/V12): la decisión va atada a la versión que se ve y
-- respeta la matriz de Roles y permisos (responder/comentar = Crear; mantener/reabrir = Editar).
drop function if exists public.observacion_accion(uuid, text, text, uuid[]);
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
           observado_entidad = o.origen, validado_servicon_at = null, validado_servicon_by = null,
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
grant execute on function public.observacion_accion(uuid, text, text, uuid[], integer) to authenticated;
revoke execute on function public.observacion_accion(uuid, text, text, uuid[], integer) from anon;
notify pgrst, 'reload schema';
