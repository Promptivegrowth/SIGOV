-- ═══════════════════════════════════════════════════════════════════════════
-- 0169 · Reglas configurables y permisos restantes (repaso 18/11, puntos 7 y 11)
-- · Configuración › Evidencias se aplica: ATS/charla/checklist «Mínimo 1» u
--   «Opcional» al enviar el reporte; GPS «Obligatoria» exige coordenadas en
--   la foto; fecha y hora «Obligatoria» exige la hora de toma.
-- · reglas_adjuntos: qué formatos pide el contrato (la app lo guarda para
--   avisar sin señal).
-- · Roles y permisos también en: quitar observación, avance de partidas,
--   validación de partida, quitar del parte y quitar página de documento; y
--   las fotos de campo (Crear de Reporte diario).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reglas_adjuntos(p_service uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select array(select t from unnest(array['ats', 'charla', 'checklist_vehicular']) t
                where coalesce((select settings->'evidencias'->>(case t when 'checklist_vehicular' then 'checklist' else t end) from public.services where id = p_service), 'minimo_1') <> 'opcional')
$$;
revoke all on function public.reglas_adjuntos(uuid) from public, anon;
grant execute on function public.reglas_adjuntos(uuid) to authenticated;

create or replace function public.parte_sin_adjuntos(p_work_order uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  with wo as (select id, service_id, crew_id, work_date from public.work_orders where id = p_work_order),
  req as (select unnest(public.reglas_adjuntos((select service_id from wo))) t),
  esperados as (
    select x.tipo, null::uuid as vehicle_id, null::text as placa, x.orden
      from (values ('ats', 1), ('charla', 2)) x(tipo, orden)
    union all
    select 'checklist_vehicular', v.id, v.plate, 3
      from wo join public.crew_vehicle_assignments a on a.crew_id = wo.crew_id
      join public.vehicles v on v.id = a.vehicle_id
     where wo.work_date >= a.start_on and (a.end_on is null or wo.work_date < a.end_on)
  )
  select coalesce(array_agg(case e.tipo when 'ats' then 'ATS' when 'charla' then 'charla'
                                else 'checklist vehicular ' || coalesce(e.placa, '') end
                            order by e.orden, e.placa), '{}')
    from esperados e cross join wo
   where e.tipo in (select t from req)
     and not exists (
     select 1 from public.documentos_del_dia d
       join public.documento_paginas p on p.documento_id = d.id and p.deleted_at is null
      where d.crew_id = wo.crew_id and d.doc_date = wo.work_date and d.tipo::text = e.tipo
        and d.vehicle_id is not distinct from e.vehicle_id and d.deleted_at is null)
$$;

-- Reglas de foto del contrato al cargar evidencias de campo
create or replace function public.t_evidencia_reglas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  select settings->'evidencias' into r from public.services where id = new.service_id;
  if coalesce(r->>'gps', 'opcional') = 'obligatoria' and (new.lat is null or new.lng is null) then
    raise exception 'SIGOV: el contrato exige GPS en las fotos; activa la ubicación y vuelve a tomarla';
  end if;
  if coalesce(r->>'fecha_hora', 'obligatoria') = 'obligatoria' and new.taken_at is null then
    raise exception 'SIGOV: la foto necesita su fecha y hora de toma';
  end if;
  return new;
end $$;
drop trigger if exists t_evidencia_reglas on public.evidences;
create trigger t_evidencia_reglas before insert on public.evidences for each row execute function public.t_evidencia_reglas();

-- Fotos de campo: «Crear» de Reporte diario
drop policy if exists permiso_crear on public.evidences;
create policy permiso_crear on public.evidences as restrictive for insert to authenticated
  with check (public.accion_permitida(service_id, 'reporte_diario', 'crear'));

CREATE OR REPLACE FUNCTION public.partida_finalizar(p_item uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila public.plan_items;
  v_registros int;
begin
  perform public.exigir_accion((select service_id from public.plan_items where id = p_item), 'reporte_diario', 'crear');  -- Roles y permisos (0169)
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.puedo_mover_partida(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: esa partida no es de tu cuadrilla' using errcode = '42501';
  end if;

  if v_fila.status not in ('en_curso','programado') then
    raise exception 'SIGOV: la partida está % y no se puede finalizar', v_fila.status;
  end if;

  -- Cerrar sin haber registrado nada dejaría una partida culminada con
  -- cero metrado, que en la valorización no sustenta ni un sol
  select count(*) into v_registros
    from public.work_entries we
   where we.plan_item_id = p_item and we.deleted_at is null;

  if v_registros = 0 then
    raise exception 'SIGOV: registra primero el avance ejecutado';
  end if;

  update public.plan_items
     set status = 'por_validar',
         finished_at = now(),
         finished_by = auth.uid()
   where id = p_item;

  return json_build_object('estado', 'por_validar');
end $function$;

CREATE OR REPLACE FUNCTION public.partida_impedimento(p_item uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila public.plan_items;
begin
  perform public.exigir_accion((select service_id from public.plan_items where id = p_item), 'reporte_diario', 'crear');  -- Roles y permisos (0169)
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'SIGOV: escribe por qué no se pudo ejecutar';
  end if;

  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.puedo_mover_partida(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: esa partida no es de tu cuadrilla' using errcode = '42501';
  end if;

  if v_fila.status in ('ejecutado','cancelado') then
    raise exception 'SIGOV: la partida ya está cerrada';
  end if;

  update public.plan_items
     set status = 'suspendido',
         impedimento = trim(p_motivo),
         impedimento_at = now(),
         impedimento_by = auth.uid()
   where id = p_item;

  -- El supervisor se entera ahora, no cuando revise el parte del día
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select
    v_fila.service_id,
    m.profile_id,
    'partida_impedida',
    format('%s no pudo ejecutarse', coalesce(a.name, 'Una partida')),
    left(trim(p_motivo), 160),
    '/programacion',
    'warning',
    jsonb_build_object('plan_item_id', p_item)
  from public.service_members m
  left join public.activities_catalog a on a.id = v_fila.activity_id
  where m.service_id = v_fila.service_id
    and m.role in ('admin', 'supervisor', 'residente');

  return json_build_object('estado', 'suspendido');
end $function$;

CREATE OR REPLACE FUNCTION public.partida_iniciar(p_item uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila public.plan_items;
begin
  perform public.exigir_accion((select service_id from public.plan_items where id = p_item), 'reporte_diario', 'crear');  -- Roles y permisos (0169)
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.puedo_mover_partida(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: esa partida no es de tu cuadrilla' using errcode = '42501';
  end if;

  if v_fila.status = 'suspendido' and not public.can_manage(v_fila.service_id) then
    raise exception 'SIGOV: la partida se reportó como No ejecutada; el supervisor la reprograma';
  end if;
  if v_fila.status not in ('programado', 'suspendido') then
    raise exception 'SIGOV: la partida ya está %', v_fila.status;
  end if;

  update public.plan_items
     set status = 'en_curso',
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;

  return json_build_object('estado', 'en_curso');
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

CREATE OR REPLACE FUNCTION public.quitar_del_parte(p_tabla text, p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  perform public.exigir_accion(coalesce((select service_id from public.movimientos_cuadrilla where client_id = p_client_id limit 1), (select service_id from public.parte_recursos where client_id = p_client_id limit 1)), 'reporte_diario', 'editar');  -- Roles y permisos (0169)
  if p_tabla = 'movimientos_cuadrilla' then
    update public.movimientos_cuadrilla set deleted_at = now(), updated_at = now()
     where client_id = p_client_id and deleted_at is null and tipo = 'consumo';
  elsif p_tabla = 'parte_recursos' then
    update public.parte_recursos set deleted_at = now(), updated_at = now()
     where client_id = p_client_id and deleted_at is null;
  else
    raise exception 'SIGOV: no se puede quitar eso desde el parte';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.quitar_observacion(p_client_id uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.observaciones_campo;
  v_estado public.plan_item_status;
  v_heredera uuid;
begin
  perform public.exigir_accion((select service_id from public.observaciones_campo where id = p_id or client_id = p_client_id limit 1), 'observaciones', 'crear');  -- Roles y permisos (0169)
  select * into o from public.observaciones_campo
   where (p_id is not null and id = p_id) or (p_client_id is not null and client_id = p_client_id)
   limit 1;
  if o.id is null or o.deleted_at is not null then return; end if;

  if not (public.can_manage(o.service_id) or (o.created_by = auth.uid() and o.estado = 'pendiente')) then
    raise exception 'SIGOV: solo quien la registró (mientras siga pendiente) o el supervisor pueden quitarla'
      using errcode = '42501';
  end if;

  if o.plan_item_id is not null then
    select status into v_estado from public.plan_items where id = o.plan_item_id and deleted_at is null;
    if v_estado is not null and v_estado not in ('programado', 'reprogramado', 'cancelado') then
      raise exception 'SIGOV: la observación ya se está atendiendo en la programación; no se puede quitar';
    end if;
    update public.plan_items set deleted_at = now() where id = o.plan_item_id and deleted_at is null;
  end if;

  update public.observaciones_campo set deleted_at = now() where id = o.id;

  -- Otra actividad del mismo punto se queda con las fotos
  select id into v_heredera from public.observaciones_campo
   where deleted_at is null and coalesce(punto_id, id) = coalesce(o.punto_id, o.id) and id <> o.id
   order by created_at limit 1;
  if v_heredera is not null then
    update public.evidences set observacion_id = v_heredera where observacion_id = o.id and deleted_at is null;
  else
    update public.evidences set deleted_at = now() where observacion_id = o.id and deleted_at is null;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.quitar_pagina_documento(p_client_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pag public.documento_paginas;
  v_doc public.documentos_del_dia;
begin
  perform public.exigir_accion((select service_id from public.documento_paginas where client_id = p_client_id), 'ssoma', 'crear');  -- Roles y permisos (0169)
  select * into v_pag from public.documento_paginas where client_id = p_client_id and deleted_at is null;
  if not found then return json_build_object('ok', true); end if;
  select * into v_doc from public.documentos_del_dia where id = v_pag.documento_id;
  if not (public.puede_revisar_ssoma(v_doc.service_id)
          or (v_pag.created_by = auth.uid() and public.can_write(v_doc.service_id))) then
    raise exception 'SIGOV: no puedes quitar esa página' using errcode = '42501';
  end if;
  if v_doc.estado = 'conforme' then
    raise exception 'SIGOV: el documento ya está conforme';
  end if;
  update public.documento_paginas set deleted_at = now() where id = v_pag.id;
  return json_build_object('ok', true);
end $function$;

notify pgrst, 'reload schema';
