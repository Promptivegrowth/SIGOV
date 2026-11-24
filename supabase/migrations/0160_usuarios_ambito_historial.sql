-- ═══════════════════════════════════════════════════════════════════════════
-- 0160 · Usuarios y acceso con ámbito e historial (lámina ROL01, Elvis
-- 24/11/2026: «lo que importa es que se tengan todas las funciones»)
--
-- · usuarios_contrato: el ámbito (cobertura) de cada cuenta según su rol y
--   las cuadrillas que lidera o supervisa, para mostrarlo en la tabla.
-- · jefe_cuadrilla_asignar: cambiar la cuadrilla de un Jefe desde su ficha,
--   con motivo y bitácora (una cuadrilla tiene un solo jefe).
-- · usuario_historial: el historial de la cuenta en su ficha (alta, cambios
--   de rol, de datos, activación y de ámbito), desde la bitácora inalterable.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.usuarios_contrato(p_service uuid)
returns json language sql stable security definer set search_path to 'public', 'auth' as $function$
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'nombre', p.full_name, 'email', p.email, 'rol', m.role, 'dni', p.dni, 'telefono', p.phone, 'cargo', p.position,
           'activo', p.is_active, 'ultimo_ingreso', u.last_sign_in_at, 'creado', u.created_at,
           'bloqueado', coalesce(u.banned_until > now(), false) and p.is_active,
           'estado', case when not p.is_active then 'inactivo' when coalesce(u.banned_until > now(), false) then 'bloqueado'
                          when u.last_sign_in_at is null then 'pendiente' else 'activo' end,
           'cuadrilla', (select string_agg(c.name, ', ') from public.crews c where c.service_id = p_service and c.deleted_at is null
                          and (c.leader_id = p.id or c.supervisor_id = p.id or exists (select 1 from public.crew_members cm where cm.crew_id = c.id and cm.profile_id = p.id and cm.is_active))),
           'crew_lider', (select c.id from public.crews c where c.service_id = p_service and c.deleted_at is null and c.leader_id = p.id order by c.code limit 1),
           'crews_supervisa', (select coalesce(json_agg(c.id order by c.code), '[]'::json) from public.crews c
                                where c.service_id = p_service and c.deleted_at is null and c.supervisor_id = p.id),
           'ambito', case m.role
              when 'admin' then 'Contrato completo'
              when 'residente' then 'Contrato completo'
              when 'ing_seguridad' then 'Contrato completo · SSOMA'
              when 'visor' then 'Solo lo publicado a COVINCA'
              when 'supervisor' then coalesce((select 'Cuadrillas ' || string_agg(c.code, ', ' order by c.code) from public.crews c
                                                where c.service_id = p_service and c.deleted_at is null and c.supervisor_id = p.id), 'Sin cuadrillas asignadas')
              when 'jefe_cuadrilla' then coalesce((select 'Cuadrilla ' || string_agg(c.code, ', ' order by c.code) from public.crews c
                                                    where c.service_id = p_service and c.deleted_at is null and c.leader_id = p.id), 'Sin cuadrilla')
              else '—' end)
         order by p.full_name), '[]'::json)
    from public.service_members m
    join public.profiles p on p.id = m.profile_id
    left join auth.users u on u.id = p.id
   where m.service_id = p_service and public.es_admin(p_service)
$function$;
grant execute on function public.usuarios_contrato(uuid) to authenticated;

create or replace function public.jefe_cuadrilla_asignar(p_service uuid, p_jefe uuid, p_crew uuid, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_antes text; v_crew public.crews;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador cambia el ámbito' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: el motivo del cambio es obligatorio'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  if not exists (select 1 from public.service_members where service_id = p_service and profile_id = p_jefe and role = 'jefe_cuadrilla') then
    raise exception 'SIGOV: esa cuenta no es jefe de cuadrilla de este contrato';
  end if;
  if p_crew is not null then
    select * into v_crew from public.crews where id = p_crew and service_id = p_service and deleted_at is null;
    if not found then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  end if;
  select string_agg(code, ', ') into v_antes from public.crews where service_id = p_service and leader_id = p_jefe and deleted_at is null;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.crews set leader_id = null, updated_at = now()
   where service_id = p_service and leader_id = p_jefe and deleted_at is null and id is distinct from p_crew;
  if p_crew is not null then
    update public.crews set leader_id = p_jefe, updated_at = now() where id = p_crew and leader_id is distinct from p_jefe;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('antes', v_antes, 'despues', v_crew.code);
end $$;
revoke all on function public.jefe_cuadrilla_asignar(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.jefe_cuadrilla_asignar(uuid, uuid, uuid, text) to authenticated;

create or replace function public.usuario_historial(p_service uuid, p_profile uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_res json; v text := p_profile::text;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: el historial lo consulta el Administrador' using errcode = '42501'; end if;
  select coalesce(json_agg(x order by x->>'at' desc), '[]'::json) into v_res from (
    select json_build_object(
      'id', a.id, 'codigo', 'EVT' || lpad(a.id::text, 6, '0'), 'at', a.created_at, 'motivo', a.motivo,
      'actor', coalesce(nullif(split_part(coalesce(a.actor_email, ''), '@', 1), ''), 'Sistema'),
      'accion', case
        when a.table_name = 'service_members' and a.action = 'INSERT' then 'Alta en el contrato · ' || coalesce(a.after_data->>'role', '')
        when a.table_name = 'service_members' and a.action = 'DELETE' then 'Retiro del contrato'
        when a.table_name = 'service_members' then 'Cambio de rol · ' || coalesce(a.before_data->>'role', '—') || ' → ' || coalesce(a.after_data->>'role', '—')
        when a.table_name = 'profiles' and (a.before_data->>'is_active') is distinct from (a.after_data->>'is_active')
          then case when (a.after_data->>'is_active')::boolean then 'Cuenta activada' else 'Cuenta desactivada' end
        when a.table_name = 'profiles' and a.action = 'INSERT' then 'Cuenta creada'
        when a.table_name = 'profiles' then 'Datos de la cuenta actualizados'
        when a.table_name = 'crews' and (a.after_data->>'leader_id') = v and (a.before_data->>'leader_id') is distinct from v
          then 'Ámbito · jefe de ' || coalesce(a.after_data->>'code', 'cuadrilla')
        when a.table_name = 'crews' and (a.before_data->>'leader_id') = v and (a.after_data->>'leader_id') is distinct from v
          then 'Ámbito · deja de ser jefe de ' || coalesce(a.before_data->>'code', 'cuadrilla')
        when a.table_name = 'crews' and (a.after_data->>'supervisor_id') = v and (a.before_data->>'supervisor_id') is distinct from v
          then 'Ámbito · supervisa ' || coalesce(a.after_data->>'code', 'cuadrilla')
        when a.table_name = 'crews' and (a.before_data->>'supervisor_id') = v and (a.after_data->>'supervisor_id') is distinct from v
          then 'Ámbito · deja de supervisar ' || coalesce(a.before_data->>'code', 'cuadrilla')
        else 'Modificación' end) x
      from public.audit_log a
     where (a.table_name = 'service_members' and a.service_id = p_service and coalesce(a.after_data, a.before_data)->>'profile_id' = v)
        or (a.table_name = 'profiles' and a.record_id = p_profile and (a.action <> 'UPDATE' or exists (
              select 1 from unnest(array['full_name', 'position', 'phone', 'dni', 'is_active', 'role']) k
               where (a.before_data->>k) is distinct from (a.after_data->>k))))
        or (a.table_name = 'crews' and a.service_id = p_service and (
              ((a.after_data->>'leader_id') is distinct from (a.before_data->>'leader_id') and v in (a.after_data->>'leader_id', a.before_data->>'leader_id'))
           or ((a.after_data->>'supervisor_id') is distinct from (a.before_data->>'supervisor_id') and v in (a.after_data->>'supervisor_id', a.before_data->>'supervisor_id'))))
     order by a.created_at desc
     limit 100) t(x);
  return v_res;
end $$;
revoke all on function public.usuario_historial(uuid, uuid) from public, anon;
grant execute on function public.usuario_historial(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
