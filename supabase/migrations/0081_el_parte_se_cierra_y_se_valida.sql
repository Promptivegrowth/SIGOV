-- ═══════════════════════════════════════════════════════════════════════
-- 0081 · El reporte diario se cierra, se envía y se valida
--
-- OBS-34 (y reunión con Elvis: «el único que estamos viendo volverlo
-- digital es el reporte diario»): en la app el parte quedaba siempre en
-- «Borrador». Ahora:
--
--   borrador → (el jefe lo cierra y envía) → enviado → validado
--                                                     ↘ observado (con motivo) → enviado …
--
-- · enviar_parte: el jefe de la cuadrilla o quien administra; exige al
--   menos una actividad; avisa al supervisor.
-- · revisar_parte: solo quien administra (supervisor, admin); observar
--   exige motivo y avisa al jefe.
-- · actualizar_parte: clima, horario, personal y notas (OBS-27/33), solo
--   mientras está en borrador u observado.
-- · Nadie se valida a sí mismo: un trigger impide que quien no administra
--   ponga «validado» u «observado» o toque los datos de la revisión (antes
--   la política de UPDATE solo pedía can_write).
-- · Un parte validado no se toca: ni sus actividades.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.t_work_order_revision()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if public.can_manage(new.service_id) then return new; end if;
  if new.status is distinct from old.status and new.status in ('validado', 'observado') then
    raise exception 'SIGOV: solo el supervisor valida u observa un parte' using errcode = '42501';
  end if;
  if old.status = 'validado' then
    raise exception 'SIGOV: el parte ya está validado; ya no se modifica' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_notes is distinct from old.review_notes then
    raise exception 'SIGOV: la revisión del parte la hace el supervisor' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists t_work_order_revision on public.work_orders;
create trigger t_work_order_revision before update on public.work_orders
  for each row execute function public.t_work_order_revision();

create or replace function public.t_work_entry_parte_validado()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_estado public.work_order_status; v_servicio uuid;
begin
  select status, service_id into v_estado, v_servicio from public.work_orders
   where id = coalesce(new.work_order_id, old.work_order_id);
  if v_estado = 'validado' and not public.can_manage(v_servicio) then
    raise exception 'SIGOV: ese reporte diario ya está validado; sus actividades no se modifican' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_work_entry_parte_validado on public.work_entries;
create trigger t_work_entry_parte_validado before insert or update or delete on public.work_entries
  for each row execute function public.t_work_entry_parte_validado();

-- El parte por su id o por el client_id con que lo creó el teléfono
-- (o por cuadrilla y fecha: el teléfono puede haber abierto el parte del
-- día con su propio id mientras ya existía en la nube)
create or replace function public.parte_por(p_id uuid, p_crew_id uuid default null, p_fecha date default null)
returns public.work_orders language sql stable security definer set search_path to 'public' as $$
  select * from public.work_orders
   where deleted_at is null
     and ((id = p_id or client_id = p_id)
          or (p_crew_id is not null and p_fecha is not null and crew_id = p_crew_id and work_date = p_fecha))
   order by (id = p_id or client_id = p_id) desc
   limit 1
$$;

create or replace function public.puede_llevar_parte(p public.work_orders)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.can_manage(p.service_id)
      or exists (select 1 from public.crews c where c.id = p.crew_id and c.leader_id = auth.uid())
$$;

create or replace function public.actualizar_parte(
  p_id uuid,
  p_clima text default null,
  p_hora_inicio time default null,
  p_hora_fin time default null,
  p_personal integer default null,
  p_notas text default null,
  p_crew_id uuid default null,
  p_fecha date default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare v public.work_orders;
begin
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status not in ('borrador', 'observado') then
    raise exception 'SIGOV: el parte ya se envió; sus datos ya no se cambian';
  end if;
  update public.work_orders
     set weather = coalesce(nullif(trim(p_clima), ''), weather),
         start_time = coalesce(p_hora_inicio, start_time),
         end_time = coalesce(p_hora_fin, end_time),
         headcount = coalesce(p_personal, headcount),
         notes = coalesce(nullif(trim(p_notas), ''), notes),
         updated_at = now()
   where id = v.id;
  return json_build_object('ok', true);
end $$;

create or replace function public.enviar_parte(p_id uuid, p_crew_id uuid default null, p_fecha date default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v public.work_orders;
  v_sup uuid;
  v_cuadrilla text;
begin
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status = 'enviado' then return json_build_object('estado', 'enviado'); end if;
  if v.status = 'validado' then raise exception 'SIGOV: el parte ya está validado'; end if;
  if not exists (select 1 from public.work_entries e where e.work_order_id = v.id and e.deleted_at is null) then
    raise exception 'SIGOV: registra al menos una actividad antes de enviar el reporte';
  end if;

  update public.work_orders set status = 'enviado', submitted_at = now(), updated_at = now() where id = v.id;

  -- El supervisor de la cuadrilla se entera; si no tiene, los supervisores del contrato
  select c.supervisor_id, c.name into v_sup, v_cuadrilla from public.crews c where c.id = v.crew_id;
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v.service_id, p, 'parte_enviado',
         format('Reporte diario %s · %s', to_char(v.work_date, 'DD/MM/YYYY'), coalesce(v_cuadrilla, '')),
         'Listo para validar', '/campo/' || v.id, 'info', jsonb_build_object('work_order_id', v.id)
    from (select v_sup as p where v_sup is not null
          union
          select m.profile_id from public.service_members m
           where v_sup is null and m.service_id = v.service_id and m.role = 'supervisor') x;

  return json_build_object('estado', 'enviado');
end $$;

create or replace function public.revisar_parte(p_id uuid, p_validar boolean, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v public.work_orders;
  v_lider uuid;
begin
  v := public.parte_por(p_id);
  if v.id is null then raise exception 'SIGOV: ese parte ya no existe'; end if;
  if not public.can_manage(v.service_id) then
    raise exception 'SIGOV: solo el supervisor valida u observa un parte' using errcode = '42501';
  end if;
  if v.status <> 'enviado' then
    raise exception 'SIGOV: el parte no está enviado (está %)', v.status;
  end if;
  if not p_validar and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;

  update public.work_orders
     set status = case when p_validar then 'validado'::public.work_order_status else 'observado'::public.work_order_status end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         review_notes = case when p_validar then review_notes else trim(p_nota) end,
         updated_at = now()
   where id = v.id;

  if not p_validar then
    select c.leader_id into v_lider from public.crews c where c.id = v.crew_id;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v.service_id, v_lider, 'parte_observado',
              format('Reporte diario del %s observado', to_char(v.work_date, 'DD/MM/YYYY')),
              trim(p_nota), '/campo/' || v.id, 'warning', jsonb_build_object('work_order_id', v.id));
    end if;
  end if;
  return json_build_object('estado', case when p_validar then 'validado' else 'observado' end);
end $$;

grant execute on function public.actualizar_parte(uuid, text, time, time, integer, text, uuid, date),
  public.enviar_parte(uuid, uuid, date), public.revisar_parte(uuid, boolean, text) to authenticated;
revoke execute on function public.actualizar_parte(uuid, text, time, time, integer, text, uuid, date),
  public.enviar_parte(uuid, uuid, date), public.revisar_parte(uuid, boolean, text) from anon;
revoke execute on function public.parte_por(uuid, uuid, date), public.puede_llevar_parte(public.work_orders) from anon;

notify pgrst, 'reload schema';
