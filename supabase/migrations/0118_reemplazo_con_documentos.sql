-- ═══════════════════════════════════════════════════════════════════════
-- 0118 · REV3-OBS-42: el vehículo de reemplazo llega con sus documentos
--
-- Se podía registrar un reemplazo sin SOAT, sin revisión técnica y sin
-- póliza, y quedaba como operativo. Ahora el reemplazo trae las fechas de
-- vencimiento de sus tres documentos (las que la flota ya conoce se
-- completan solas); el que falte deja al vehículo «No habilitado» en la app
-- hasta que se registre.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.registrar_reemplazo(uuid, uuid, text, text, text, text, date, text, integer, text);

create or replace function public.registrar_reemplazo(
  p_crew uuid, p_titular uuid, p_placa text, p_tipo text default 'camioneta', p_marca text default null,
  p_modelo text default null, p_fecha date default null, p_motivo text default 'mantenimiento',
  p_km integer default null, p_obs text default null,
  p_soat date default null, p_revision date default null, p_poliza date default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_crew public.crews;
  v_tit public.crew_vehicle_assignments;
  v_veh uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_nueva uuid;
begin
  select * into v_crew from public.crews where id = p_crew;
  if not public.puede_llevar_cuadrilla(p_crew) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if p_motivo not in ('mantenimiento', 'averia', 'reparacion', 'cambio_temporal', 'otro') then
    raise exception 'SIGOV: motivo de reemplazo no válido';
  end if;
  if p_km is null or p_km <= 0 then raise exception 'SIGOV: escribe el kilometraje inicial del reemplazo'; end if;

  select * into v_tit from public.crew_vehicle_assignments
   where crew_id = p_crew and vehicle_id = p_titular and end_on is null limit 1;
  if v_tit.id is null then raise exception 'SIGOV: ese vehículo no está asignado a la cuadrilla'; end if;

  v_veh := public.vehiculo_por_placa(v_crew.service_id, p_placa, p_tipo, p_marca, p_modelo, p_km);
  if v_veh = p_titular then raise exception 'SIGOV: el reemplazo no puede ser el mismo vehículo'; end if;
  if exists (select 1 from public.crew_vehicle_assignments where vehicle_id = v_veh and end_on is null) then
    raise exception 'SIGOV: ese vehículo ya está asignado a otra cuadrilla';
  end if;

  -- Sus documentos: lo que se escribió manda sobre lo que había
  update public.vehicles
     set soat_expires_on = coalesce(p_soat, soat_expires_on),
         inspection_expires_on = coalesce(p_revision, inspection_expires_on),
         policy_expires_on = coalesce(p_poliza, policy_expires_on),
         updated_at = now()
   where id = v_veh;

  update public.crew_vehicle_assignments
     set end_on = greatest(v_fecha, start_on), end_reason = p_motivo, updated_at = now()
   where id = v_tit.id;
  if p_motivo in ('mantenimiento', 'averia', 'reparacion') then
    update public.vehicles set status = 'taller', updated_at = now() where id = p_titular;
  end if;

  insert into public.crew_vehicle_assignments
    (service_id, crew_id, vehicle_id, kind, replaces_id, start_on, reason, odometer_start, notes)
  values (v_crew.service_id, p_crew, v_veh, 'reemplazo', v_tit.id, v_fecha, p_motivo, p_km, nullif(trim(p_obs), ''))
  returning id into v_nueva;
  update public.vehicles set odometer_km = greatest(coalesce(odometer_km, 0), p_km), updated_at = now() where id = v_veh;

  return json_build_object('asignacion', v_nueva, 'vehiculo', v_veh);
end $$;

grant execute on function public.registrar_reemplazo(uuid, uuid, text, text, text, text, date, text, integer, text, date, date, date) to authenticated;
