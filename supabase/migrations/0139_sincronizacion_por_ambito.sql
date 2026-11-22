-- ═══════════════════════════════════════════════════════════════════════════
-- 0139 · Sincronización por ámbito (revisión visual, T4; guía 3.7 y 4.14)
--
-- El Supervisor ve los dispositivos de sus cuadrillas; Residente y
-- Administrador, los del contrato. Último contacto, envíos y fallos por
-- persona y equipo. «Sin conexión» no es error ni envío confirmado: lo que
-- un teléfono aún no manda no se inventa aquí; se informa el último contacto.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.sincronizacion_ambito(p_service uuid, p_dias integer default 7)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_rol public.user_role := public.role_in(p_service); v_res json;
begin
  if v_rol is null or v_rol not in ('admin', 'residente', 'supervisor') then
    raise exception 'SIGOV: sin acceso a la sincronización del contrato' using errcode = '42501';
  end if;
  with personas as (
    select m.profile_id, m.role, p.full_name, c.id crew_id, c.code crew_code, c.name crew_name
      from public.service_members m
      join public.profiles p on p.id = m.profile_id
      left join public.crews c on c.leader_id = m.profile_id and c.service_id = p_service and c.deleted_at is null
     where m.service_id = p_service
       and (v_rol in ('admin', 'residente')
            or (m.role = 'jefe_cuadrilla' and c.id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[]))))
  ), sesiones as (
    select s.profile_id, s.device_id, max(s.device_label) device_label, max(s.finished_at) ultimo,
           count(*) filter (where s.started_at > now() - make_interval(days => p_dias)) n,
           sum(s.pushed_count) filter (where s.started_at > now() - make_interval(days => p_dias)) enviados,
           sum(s.failed_count) filter (where s.started_at > now() - make_interval(days => p_dias)) fallidos,
           (array_agg(s.failed_count order by s.started_at desc))[1] fallos_ultima,
           row_number() over (partition by s.profile_id order by max(s.finished_at) desc nulls last) orden
      from public.sync_sessions s
     where s.service_id = p_service and s.profile_id in (select profile_id from personas)
     group by s.profile_id, s.device_id
  ), por_persona as (
    -- el estado de la persona es el de su equipo con el último contacto
    select pe.*, (select max(se.ultimo) from sesiones se where se.profile_id = pe.profile_id) ultimo,
           (select se.fallos_ultima from sesiones se where se.profile_id = pe.profile_id and se.orden = 1) fallos_ultima,
           (select count(*) from sesiones se where se.profile_id = pe.profile_id) n_equipos,
           (select coalesce(sum(se.enviados), 0) from sesiones se where se.profile_id = pe.profile_id) enviados
      from personas pe
     where pe.role = 'jefe_cuadrilla' or v_rol <> 'supervisor'
  )
  select json_build_object(
    'personas', (select coalesce(json_agg(json_build_object(
        'profile_id', pp.profile_id, 'nombre', pp.full_name, 'rol', pp.role, 'cuadrilla', pp.crew_name, 'codigo', pp.crew_code,
        'ultimo', pp.ultimo, 'equipos', pp.n_equipos,
        'dispositivos', (select coalesce(json_agg(json_build_object('device', coalesce(se.device_label, se.device_id), 'ultimo', se.ultimo,
                           'sesiones', se.n, 'enviados', coalesce(se.enviados, 0), 'fallidos', coalesce(se.fallidos, 0),
                           'estado', case when se.fallos_ultima > 0 then 'error'
                                          when se.ultimo is null then 'sin_registro'
                                          when se.ultimo < now() - interval '24 hours' then 'sin_conexion'
                                          else 'confirmado' end) order by se.ultimo desc nulls last), '[]'::json)
                          from sesiones se where se.profile_id = pp.profile_id and se.orden <= 3))
        -- primero las cuadrillas (por código), luego el resto del equipo del contrato
        order by pp.crew_code is null, pp.crew_code, pp.ultimo desc nulls last, pp.full_name), '[]'::json) from por_persona pp),
    'resumen', json_build_object(
        'personas', (select count(*) from por_persona),
        'al_dia', (select count(*) from por_persona where ultimo >= now() - interval '24 hours' and coalesce(fallos_ultima, 0) = 0),
        'sin_conexion_24h', (select count(*) from por_persona where ultimo < now() - interval '24 hours' and coalesce(fallos_ultima, 0) = 0),
        'con_error', (select count(*) from por_persona where fallos_ultima > 0),
        'sin_registro', (select count(*) from por_persona where ultimo is null),
        'enviados', (select coalesce(sum(enviados), 0) from por_persona)),
    'ultima', (select max(ultimo) from por_persona)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.sincronizacion_ambito(uuid, integer) from public, anon;
grant execute on function public.sincronizacion_ambito(uuid, integer) to authenticated;
