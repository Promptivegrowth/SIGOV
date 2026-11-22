-- ═══════════════════════════════════════════════════════════════════════════
-- 0140 · Bandeja «Revisión de reportes» (revisión visual 18/11, T4)
--
-- Supervisor: Por validar / Observados / Validados, solo de sus cuadrillas.
-- Residente y Administrador: todo el contrato, con Por publicar (validado
-- SERVICON sin publicar, con versión nueva u observado por COVINCA) y el
-- Historial de lo publicado. Cada fila trae las fases A/D/Dp para ver de un
-- vistazo qué falta antes de abrir el ítem. Las reglas de validar/publicar
-- siguen en pci_validar y pci_publicar: esto solo lista.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.bandeja_revision(
  p_service uuid, p_tab text default 'por_validar', p_crew uuid default null, p_pci uuid default null,
  p_supervisor uuid default null, p_desde date default null, p_hasta date default null, p_q text default null,
  p_limite integer default 200)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_rol public.user_role := public.role_in(p_service); v_res json;
begin
  if v_rol is null or v_rol not in ('admin', 'residente', 'supervisor') then
    raise exception 'SIGOV: sin acceso a la revisión de reportes' using errcode = '42501';
  end if;
  with base as (
    select i.id, i.pci_id, p.code pci_code, i.item_number, i.status, i.closed_at, i.due_date, i.term_days,
           i.validado_servicon_at, i.observado_entidad, i.reject_reason, i.publicacion_version,
           i.publicacion_pendiente, i.covinca_estado, i.prog_start_m, i.prog_end_m,
           a.code activity_code, a.name activity_name, c.id crew_id, c.code crew_code, c.name crew_name,
           c.supervisor_id,
           (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'antes') f_a,
           (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'durante') f_d,
           (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'despues') f_dp,
           case
             when i.status = 'observado' then 'observados'
             when i.status in ('levantado', 'subsanado') and i.validado_servicon_at is null then 'por_validar'
             when i.status in ('levantado', 'subsanado')
                  and (i.publicacion_version = 0 or i.publicacion_pendiente or i.covinca_estado = 'observado') then 'por_publicar'
             when i.status in ('levantado', 'subsanado') then 'en_covinca'
             when i.status = 'validado' then 'conformes'
           end grupo
      from public.pci_items i
      join public.pcis p on p.id = i.pci_id and p.deleted_at is null
      left join public.activities_catalog a on a.id = i.activity_id
      left join public.crews c on c.id = i.assigned_crew_id
     where i.service_id = p_service and i.deleted_at is null
       and i.status in ('levantado', 'subsanado', 'observado', 'validado')
       and (v_rol <> 'supervisor' or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
       and (p_crew is null or i.assigned_crew_id = p_crew)
       and (p_pci is null or i.pci_id = p_pci)
       and (p_supervisor is null or c.supervisor_id = p_supervisor)
       and (p_desde is null or (i.closed_at at time zone 'America/Lima')::date >= p_desde)
       and (p_hasta is null or (i.closed_at at time zone 'America/Lima')::date <= p_hasta)
       and (coalesce(trim(p_q), '') = ''
            or p.code ilike '%' || trim(p_q) || '%' or i.item_number::text = trim(p_q)
            or a.name ilike '%' || trim(p_q) || '%' or a.code ilike '%' || trim(p_q) || '%'
            or public.fmt_progresiva(i.prog_start_m) ilike '%' || trim(p_q) || '%')
  ), filas as (
    select b.* from base b
     where case p_tab
             when 'todos' then true
             -- validados: lo que SERVICON ya dio por bueno (publicado o no, y lo conforme)
             when 'validados' then b.grupo in ('por_publicar', 'en_covinca', 'conformes')
             when 'historial' then b.publicacion_version > 0
             else b.grupo = p_tab end
     order by b.closed_at desc nulls last, b.item_number
     limit greatest(1, least(p_limite, 500))
  )
  select json_build_object(
    'conteos', json_build_object(
      'todos', (select count(*) from base),
      'por_validar', (select count(*) from base where grupo = 'por_validar'),
      'observados', (select count(*) from base where grupo = 'observados'),
      'por_publicar', (select count(*) from base where grupo = 'por_publicar'),
      'en_covinca', (select count(*) from base where grupo = 'en_covinca'),
      'conformes', (select count(*) from base where grupo = 'conformes'),
      'validados', (select count(*) from base where grupo in ('por_publicar', 'en_covinca', 'conformes')),
      'historial', (select count(*) from base where publicacion_version > 0)),
    'filas', (select coalesce(json_agg(json_build_object(
        'id', f.id, 'pci_id', f.pci_id, 'pci_code', f.pci_code, 'item', f.item_number, 'estado', f.status,
        'grupo', f.grupo, 'reportado', f.closed_at, 'vence', f.due_date, 'plazo', f.term_days,
        'actividad', coalesce(f.activity_code || ' · ', '') || coalesce(f.activity_name, '—'),
        'prog_ini', f.prog_start_m, 'prog_fin', f.prog_end_m,
        'cuadrilla', f.crew_code, 'cuadrilla_nombre', f.crew_name,
        'antes', f.f_a, 'durante', f.f_d, 'despues', f.f_dp,
        'motivo', case when f.status = 'observado' then f.reject_reason end, 'observado_por', f.observado_entidad,
        'version', f.publicacion_version, 'pendiente', f.publicacion_pendiente, 'covinca', f.covinca_estado)), '[]'::json)
        from filas f),
    -- las opciones de los filtros salen del alcance, no de lo ya filtrado
    'cuadrillas', (select coalesce(json_agg(jsonb_build_object('id', c.id, 'codigo', c.code, 'nombre', c.name) order by c.code), '[]'::json)
                     from public.crews c where c.service_id = p_service and c.deleted_at is null
                      and (v_rol <> 'supervisor' or c.id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))),
    'pcis', (select coalesce(json_agg(jsonb_build_object('id', x.id, 'codigo', x.code) order by x.code), '[]'::json)
               from public.pcis x where x.service_id = p_service and x.deleted_at is null
                and exists (select 1 from public.pci_items i where i.pci_id = x.id and i.deleted_at is null
                             and i.status in ('levantado', 'subsanado', 'observado', 'validado')
                             and (v_rol <> 'supervisor' or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[]))))),
    'supervisores', (select coalesce(json_agg(jsonb_build_object('id', pr.id, 'nombre', pr.full_name) order by pr.full_name), '[]'::json)
                       from public.profiles pr where pr.id in (select c.supervisor_id from public.crews c
                                                               where c.service_id = p_service and c.deleted_at is null and v_rol <> 'supervisor'))
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.bandeja_revision(uuid, text, uuid, uuid, uuid, date, date, text, integer) from public, anon;
grant execute on function public.bandeja_revision(uuid, text, uuid, uuid, uuid, date, date, text, integer) to authenticated;

-- Publicar un parte validado una sola vez: validado, ya no cambia, así que
-- volver a publicarlo solo inflaría la versión.
create or replace function public.parte_publicar(p_ids uuid[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_o public.work_orders; v_n int := 0; v_omitidos int := 0;
begin
  for v_o in select * from public.work_orders where id = any(p_ids) and deleted_at is null for update loop
    if public.role_in(v_o.service_id) is distinct from 'residente' then
      raise exception 'SIGOV: solo el Residente publica a COVINCA' using errcode = '42501';
    end if;
    if v_o.status <> 'validado' or v_o.publicacion_version > 0 then v_omitidos := v_omitidos + 1; continue; end if;
    update public.work_orders set publicacion_version = 1, publicado_at = now(), publicado_por = auth.uid()
     where id = v_o.id;
    update public.evidences e set publicada_version = 1
      from public.work_entries w
     where e.work_entry_id = w.id and w.work_order_id = v_o.id and e.deleted_at is null and e.publicada_version is null;
    v_n := v_n + 1;
  end loop;
  return json_build_object('publicados', v_n, 'omitidos', v_omitidos);
end $$;
revoke all on function public.parte_publicar(uuid[]) from public, anon;
grant execute on function public.parte_publicar(uuid[]) to authenticated;
