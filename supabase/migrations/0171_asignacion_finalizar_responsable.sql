-- ═══════════════════════════════════════════════════════════════════════════
-- 0171 · Recursos › Asignaciones (ADMIN_SUB_Recursos_Asignaciones, repaso
-- final): una asignación sin «Hasta» se puede finalizar con fecha y motivo
-- (antes dejaba el vehículo bloqueado), y la asignación de vehículo lleva
-- responsable.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.crew_vehicle_assignments add column if not exists responsable_id uuid references public.profiles(id);

create or replace function public.asignacion_finalizar(p_tipo text, p_id uuid, p_fin date, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_sid uuid; v_ini date;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la finalización'; end if;
  if p_tipo = 'vehiculo' then
    select service_id, start_on into v_sid, v_ini from public.crew_vehicle_assignments where id = p_id;
  elsif p_tipo = 'equipo' then
    select service_id, desde into v_sid, v_ini from public.equipo_asignaciones where id = p_id;
  else raise exception 'SIGOV: tipo no válido'; end if;
  if v_sid is null then raise exception 'SIGOV: la asignación no existe'; end if;
  if not public.es_admin(v_sid) then raise exception 'SIGOV: las asignaciones las gestiona el Administrador' using errcode = '42501'; end if;
  if p_fin is null or p_fin < v_ini then raise exception 'SIGOV: la fecha de fin no puede ser anterior al inicio (%)', to_char(v_ini, 'DD/MM/YYYY'); end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  if p_tipo = 'vehiculo' then
    update public.crew_vehicle_assignments set end_on = p_fin, end_reason = trim(p_motivo), updated_at = now() where id = p_id;
  else
    update public.equipo_asignaciones set hasta = p_fin, motivo = trim(p_motivo) where id = p_id;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
revoke all on function public.asignacion_finalizar(text, uuid, date, text) from public, anon;
grant execute on function public.asignacion_finalizar(text, uuid, date, text) to authenticated;
notify pgrst, 'reload schema';
