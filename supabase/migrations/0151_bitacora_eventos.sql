-- ═══════════════════════════════════════════════════════════════════════════
-- 0151 · Bitácora del sistema (revisión visual 18/11, ADMIN_Auditoria_*_V2)
--
-- Eventos de la bitácora (audit_log) y accesos (accesos) en una sola lista,
-- con la acción dicha como en la obra (Envío, Validación, Reasignación,
-- Cambio de rol…), su resultado (Correcto, Advertencia, Fallido) y la
-- referencia del registro (PCI e ítem, parte y cuadrilla). Solo lectura:
-- nada aquí edita ni borra la bitácora. Solo el Administrador.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.bitacora_accion(t text, act text, a jsonb, b jsonb)
returns text language sql immutable as $$
  select case
    when act = 'INSERT' and t = 'evidences' then 'Carga de foto'
    when act = 'INSERT' and t = 'crew_members' then 'Alta de integrante'
    when act = 'INSERT' and t = 'service_members' then 'Alta de usuario'
    when act = 'INSERT' then 'Creación'
    when act = 'DELETE' then 'Eliminación'
    when t = 'service_members' and a->>'role' is distinct from b->>'role' then 'Cambio de rol'
    when t = 'permisos_rol' then 'Cambio de permisos'
    when t in ('pci_items', 'plan_items') and coalesce(a->>'assigned_crew_id', a->>'crew_id') is distinct from coalesce(b->>'assigned_crew_id', b->>'crew_id') then 'Reasignación'
    when t = 'plan_items' and a->>'scheduled_on' is distinct from b->>'scheduled_on' then 'Reprogramación'
    when t in ('pci_items', 'work_orders') and a->>'publicacion_version' is distinct from b->>'publicacion_version' then 'Publicación'
    when t = 'pci_items' and a->>'covinca_estado' is distinct from b->>'covinca_estado' and a->>'covinca_estado' = 'conforme' then 'Conformidad'
    when t = 'pci_items' and a->>'covinca_estado' is distinct from b->>'covinca_estado' and a->>'covinca_estado' = 'observado' then 'Observación'
    when t = 'work_orders' and a->>'status' is distinct from b->>'status' then
      case a->>'status' when 'enviado' then 'Envío' when 'validado' then 'Validación' when 'observado' then 'Observación' else 'Cambio de estado' end
    when t = 'weekly_plans' and a->>'status' is distinct from b->>'status' and a->>'status' = 'publicado' then 'Publicación'
    when a->>'status' is distinct from b->>'status' and a ? 'status' then 'Cambio de estado'
    when a->>'deleted_at' is not null and b->>'deleted_at' is null then 'Baja'
    else 'Modificación' end
$$;

create or replace function public.bitacora_eventos(p_service uuid, p_desde date, p_hasta date)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_res json;
begin
  if not public.es_admin(p_service) then
    raise exception 'SIGOV: la bitácora la consulta el Administrador' using errcode = '42501';
  end if;
  select coalesce(json_agg(x order by x->>'at' desc), '[]'::json) into v_res from (
    select json_build_object(
      'id', a.id::text, 'origen', 'bitacora', 'codigo', 'EVT' || lpad(a.id::text, 6, '0'), 'at', a.created_at,
      'usuario', coalesce(nullif(split_part(coalesce(a.actor_email, ''), '@', 1), ''), 'Sistema'), 'tabla', a.table_name,
      'record_id', a.record_id, 'motivo', a.motivo, 'version', coalesce(a.after_data->>'version', a.before_data->>'version'),
      'accion', public.bitacora_accion(a.table_name, a.action, a.after_data, a.before_data),
      'resultado', case when a.action = 'DELETE'
                          or public.bitacora_accion(a.table_name, a.action, a.after_data, a.before_data) in ('Observación', 'Baja')
                        then 'advertencia' else 'correcto' end,
      'referencia', case
        when a.table_name = 'pci_items' then
          (select 'PCI ' || regexp_replace(p.code, '^PCI-\d{4}-0*', '') from public.pcis p where p.id = (coalesce(a.after_data, a.before_data)->>'pci_id')::uuid)
          || ' · Ítem ' || (coalesce(a.after_data, a.before_data)->>'item_number')
        when a.table_name = 'work_orders' then
          (select c.code from public.crews c where c.id = (coalesce(a.after_data, a.before_data)->>'crew_id')::uuid)
          || ' · ' || to_char((coalesce(a.after_data, a.before_data)->>'work_date')::date, 'DD/MM/YYYY')
        when a.table_name in ('crews', 'vehicles', 'safety_equipment') then coalesce(a.after_data, a.before_data)->>'code'
        when a.table_name = 'service_members' then
          (select split_part(p.email, '@', 1) from public.profiles p where p.id = (coalesce(a.after_data, a.before_data)->>'profile_id')::uuid)
          || ' → ' || coalesce(a.after_data->>'role', a.before_data->>'role')
        else null end) x
      from public.audit_log a
     where a.service_id = p_service and a.created_at >= p_desde and a.created_at < p_hasta + 1
    union all
    select json_build_object(
      'id', ac.id::text, 'origen', 'acceso', 'codigo', 'ACC-' || upper(left(ac.id::text, 6)), 'at', ac.cuando,
      'usuario', coalesce(split_part(p.email, '@', 1), ac.usuario, '—'), 'tabla', 'accesos', 'record_id', ac.profile_id, 'motivo', ac.detalle,
      'accion', case ac.evento when 'ingreso' then 'Ingreso al sistema' when 'salida' then 'Salida' when 'fallido' then 'Intento de acceso'
                  when 'bloqueado' then 'Bloqueo de cuenta' when 'desbloqueo' then 'Desbloqueo' when 'restablecimiento' then 'Restablecimiento de contraseña'
                  else 'Cambio de dispositivo' end,
      'resultado', case ac.resultado when 'exitoso' then 'correcto' when 'bloqueado' then 'advertencia' else 'fallido' end,
      'referencia', concat_ws(' · ', ac.dispositivo, ac.ip)) x
      from public.accesos ac left join public.profiles p on p.id = ac.profile_id
     where ac.cuando >= p_desde and ac.cuando < p_hasta + 1
       and (ac.profile_id is null or exists (select 1 from public.service_members m where m.profile_id = ac.profile_id and m.service_id = p_service))
  ) z;
  return v_res;
end $$;
revoke all on function public.bitacora_eventos(uuid, date, date) from public, anon;
grant execute on function public.bitacora_eventos(uuid, date, date) to authenticated;
