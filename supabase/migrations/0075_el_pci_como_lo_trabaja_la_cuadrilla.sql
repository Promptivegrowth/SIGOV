-- ═══════════════════════════════════════════════════════════════════════
-- 0075 · El PCI como lo trabaja la cuadrilla y lo valida COVINCA
--
-- Consolidado de observaciones de Servicon (rol jefe de cuadrilla),
-- sección 4, y reunión con Elvis del 05-10-2026:
--
-- · Ciclo del ítem (OBS-10/13/14/15):
--     pendiente → en_atencion → levantado («pendiente de validación
--     COVINCA») → validado («conforme») | observado → subsanado → …
--   Levantar exige la foto del ANTES y la del DESPUÉS (la del durante se
--   recomienda) y el metrado registrado. COVINCA (rol visor) o quien
--   administra da conformidad u observa, con motivo obligatorio. Todo
--   cambio de estado queda en el historial del ítem.
-- · Solo atiende un ítem el líder de la cuadrilla a la que está asignado,
--   o quien administra. El ítem ya no se edita directamente: pasa por estas
--   funciones (antes el jefe podía, por la API, darlo por validado).
-- · Semáforo de plazos (OBS-11, Elvis): un día de desfase ya es rojo,
--   urgente; vencido es vencido. Con la fecha de Perú, no la del servidor.
-- · Un PCI con todos sus ítems conformes queda «cerrado» (COMPLETADO).
-- · Resumen por PCI y cuadrilla para la pantalla «primero el PCI, luego
--   sus ítems» (OBS-05/06/12).
-- ═══════════════════════════════════════════════════════════════════════

-- «rechazado» pasa a llamarse por lo que es
update public.pci_items set status = 'observado' where status = 'rechazado';

-- ─── El historial del ítem ─────────────────────────────────────────────
create table if not exists public.pci_item_eventos (
  id          bigserial primary key,
  service_id  uuid not null references public.services(id) on delete cascade,
  pci_item_id uuid not null references public.pci_items(id) on delete cascade,
  de          public.pci_item_status,
  a           public.pci_item_status not null,
  nota        text,
  quien       uuid references public.profiles(id),
  cuando      timestamptz not null default now()
);

create index if not exists pci_item_eventos_item_idx on public.pci_item_eventos (pci_item_id, cuando);

alter table public.pci_item_eventos enable row level security;
drop policy if exists pci_item_eventos_select on public.pci_item_eventos;
create policy pci_item_eventos_select on public.pci_item_eventos for select to authenticated
  using (service_id in (select public.mis_servicios()) or public.is_platform_admin());

create or replace function public.t_pci_item_evento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.pci_item_eventos (service_id, pci_item_id, de, a, nota, quien)
    values (new.service_id, new.id,
            case when tg_op = 'UPDATE' then old.status end,
            new.status,
            case when new.status = 'observado' then new.reject_reason end,
            auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists t_pci_item_evento on public.pci_items;
create trigger t_pci_item_evento after insert or update of status on public.pci_items
  for each row execute function public.t_pci_item_evento();

-- ─── El semáforo: un día ya es urgente ────────────────────────────────
create or replace function public.pci_item_semaforo(p_due date, p_term_days smallint, p_status public.pci_item_status)
returns text language sql stable set search_path to 'public' as $$
  select case
    when p_status in ('levantado', 'validado', 'subsanado') then 'ok'
    when p_due is null then 'verde'
    when p_due < public.hoy_peru() then 'vencido'
    when p_due - public.hoy_peru() <= 1 then 'rojo'
    when p_due - public.hoy_peru() <= 3 then 'ambar'
    else 'verde'
  end
$$;

-- ─── Quién puede atender un ítem ──────────────────────────────────────
create or replace function public.puede_atender_item(p_item public.pci_items)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.can_manage(p_item.service_id)
      or exists (select 1 from public.crews c
                  where c.id = p_item.assigned_crew_id and c.leader_id = auth.uid())
      or (p_item.assigned_crew_id is null and public.can_write(p_item.service_id))
$$;

create or replace function public.pci_iniciar_atencion(p_item uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_fila public.pci_items;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status = 'en_atencion' then
    return json_build_object('estado', 'en_atencion');
  end if;
  if v_fila.status not in ('pendiente', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  update public.pci_items
     set status = case when v_fila.status = 'observado' then 'observado' else 'en_atencion' end,
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;
  return json_build_object('estado', 'en_atencion');
end $$;

-- ─── Levantar ──────────────────────────────────────────────────────────
create or replace function public.pci_levantar(p_item uuid, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila    public.pci_items;
  v_antes   int;
  v_despues int;
  v_metrado numeric;
  v_nuevo   public.pci_item_status;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status not in ('pendiente', 'en_atencion', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  if v_fila.requires_evidence then
    select count(*) filter (where e.phase = 'antes'),
           count(*) filter (where e.phase = 'despues')
      into v_antes, v_despues
      from public.evidences e
     where e.pci_item_id = p_item and e.deleted_at is null;
    if v_antes = 0 then
      raise exception 'SIGOV: falta la foto del antes';
    end if;
    if v_despues = 0 then
      raise exception 'SIGOV: falta la foto del después, que es la que sustenta el levantamiento';
    end if;
  end if;

  -- El metrado lo registra la cuadrilla; quien administra puede levantar
  -- desde la oficina un ítem que no se mide
  if not public.can_manage(v_fila.service_id) then
    select coalesce(sum(w.quantity), 0) into v_metrado
      from public.work_entries w
     where w.pci_item_id = p_item and w.deleted_at is null;
    if v_metrado <= 0 then
      raise exception 'SIGOV: registra primero el metrado ejecutado de este ítem';
    end if;
  end if;

  v_nuevo := case when v_fila.status = 'observado' then 'subsanado' else 'levantado' end;

  update public.pci_items
     set status = v_nuevo,
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(trim(p_nota), ''), notes)
   where id = p_item;

  -- Quien lleva el contrato se entera de que hay algo que presentar
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v_fila.service_id, m.profile_id, 'pci_levantado',
         format('%s · ítem %s %s', p.code, v_fila.item_number,
                case when v_nuevo = 'subsanado' then 'subsanado' else 'levantado' end),
         left(v_fila.description, 160), '/pci/' || v_fila.pci_id, 'info',
         jsonb_build_object('pci_item_id', p_item)
    from public.service_members m
    join public.pcis p on p.id = v_fila.pci_id
   where m.service_id = v_fila.service_id and m.role in ('admin', 'supervisor', 'visor');

  return json_build_object('estado', v_nuevo);
end $$;

-- ─── Validar: conforme u observado ────────────────────────────────────
create or replace function public.pci_validar(p_item uuid, p_conforme boolean, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.pci_items;
  v_lider uuid;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not (public.can_manage(v_fila.service_id) or public.role_in(v_fila.service_id) = 'visor') then
    raise exception 'SIGOV: solo COVINCA o el supervisor validan un ítem' using errcode = '42501';
  end if;
  if v_fila.status not in ('levantado', 'subsanado') then
    raise exception 'SIGOV: el ítem no está levantado (está %)', v_fila.status;
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: la cuadrilla necesita saber qué corregir';
  end if;

  if p_conforme then
    update public.pci_items
       set status = 'validado', validated_at = now(), validated_by = auth.uid(), reject_reason = null
     where id = p_item;
  else
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_nota)
     where id = p_item;

    -- La cuadrilla tiene que enterarse: vuelve a su bandeja
    select c.leader_id into v_lider from public.crews c where c.id = v_fila.assigned_crew_id;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      select v_fila.service_id, v_lider, 'pci_observado',
             format('%s · ítem %s observado', p.code, v_fila.item_number),
             trim(p_nota), '/pci/' || v_fila.pci_id, 'warning',
             jsonb_build_object('pci_item_id', p_item)
        from public.pcis p where p.id = v_fila.pci_id;
    end if;
  end if;

  return json_build_object('estado', case when p_conforme then 'validado' else 'observado' end);
end $$;

grant execute on function public.pci_iniciar_atencion(uuid), public.pci_levantar(uuid, text),
  public.pci_validar(uuid, boolean, text) to authenticated;
revoke execute on function public.pci_iniciar_atencion(uuid), public.pci_levantar(uuid, text),
  public.pci_validar(uuid, boolean, text) from anon;

-- ─── Los contadores y el estado del PCI ───────────────────────────────
create or replace function public.pci_refresh_counters()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_pci uuid;
begin
  v_pci := coalesce(new.pci_id, old.pci_id);
  update public.pcis p set
    items_total = x.total,
    items_done  = x.cumplidos,
    status = case
      when x.total = 0 then p.status
      when x.conformes = x.total then 'cerrado'::public.pci_status
      when x.cumplidos = x.total then 'levantado'::public.pci_status
      when x.vencidos > 0 then 'vencido'::public.pci_status
      when x.trabajando > 0 then 'en_atencion'::public.pci_status
      else 'abierto'::public.pci_status
    end
  from (
    select count(*) as total,
           count(*) filter (where i.status in ('levantado', 'validado', 'subsanado')) as cumplidos,
           count(*) filter (where i.status = 'validado') as conformes,
           count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado')
                              and i.due_date < public.hoy_peru()) as vencidos,
           count(*) filter (where i.status in ('en_atencion', 'observado')) as trabajando
      from public.pci_items i
     where i.pci_id = v_pci and i.deleted_at is null
  ) x
  where p.id = v_pci;
  return coalesce(new, old);
end $$;

-- El trigger que exigía «alguna» foto queda cubierto por pci_levantar
drop trigger if exists t_pcii_evidence on public.pci_items;

-- ─── El ítem ya no se edita directamente por quien no administra ──────
drop policy if exists "pci_items_update" on public.pci_items;
create policy "pci_items_update" on public.pci_items for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));
drop policy if exists "pci_items_insert" on public.pci_items;
create policy "pci_items_insert" on public.pci_items for insert to authenticated
  with check (public.can_manage(service_id));
drop policy if exists "pcis_update" on public.pcis;
create policy "pcis_update" on public.pcis for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));
drop policy if exists "pcis_insert" on public.pcis;
create policy "pcis_insert" on public.pcis for insert to authenticated
  with check (public.can_manage(service_id));

-- ─── La vista del ítem, con lo nuevo al final ─────────────────────────
create or replace view public.v_pci_items
with (security_invoker = true) as
select
  i.id, i.pci_id, i.service_id, i.item_number, i.description,
  i.section_id, s.name as section_name, s.code as section_code,
  i.prog_start_m, i.prog_end_m, i.side,
  public.fmt_progresiva(i.prog_start_m) as prog_start_txt,
  public.fmt_progresiva(i.prog_end_m) as prog_end_txt,
  i.activity_id, a.name as activity_name,
  i.quantity, u.symbol as unit_symbol,
  i.term_days, i.due_date,
  (i.due_date - public.hoy_peru()) as days_left,
  public.pci_item_semaforo(i.due_date, i.term_days, i.status) as semaforo,
  i.status, i.assigned_crew_id, c.name as crew_name,
  i.assigned_to, p.full_name as assignee_name,
  i.requires_evidence, i.closed_at, i.validated_at, i.notes,
  (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null) as evidence_count,
  pc.code as pci_code, pc.title as pci_title, pc.priority as pci_priority,
  i.created_at, i.updated_at, i.started_at,
  (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'antes') as fotos_antes,
  (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'despues') as fotos_despues,
  -- Lo nuevo
  (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'durante') as fotos_durante,
  (select coalesce(sum(w.quantity), 0) from public.work_entries w where w.pci_item_id = i.id and w.deleted_at is null) as metrado_registrado,
  i.reject_reason as observacion,
  pc.status as pci_status,
  a.code as activity_code
from public.pci_items i
join public.pcis pc on pc.id = i.pci_id
left join public.road_sections s on s.id = i.section_id
left join public.activities_catalog a on a.id = i.activity_id
left join public.units u on u.id = i.unit_id
left join public.crews c on c.id = i.assigned_crew_id
left join public.profiles p on p.id = i.assigned_to
where i.deleted_at is null;

-- ─── El resumen por PCI y cuadrilla ───────────────────────────────────
create or replace view public.v_pci_resumen
with (security_invoker = true) as
select
  pc.id as pci_id,
  pc.service_id,
  pc.code,
  pc.title,
  pc.status as pci_status,
  pc.received_on,
  pc.notified_on,
  i.assigned_crew_id as crew_id,
  count(*) as items,
  count(*) filter (where i.status = 'pendiente') as pendientes,
  count(*) filter (where i.status = 'en_atencion') as en_atencion,
  count(*) filter (where i.status in ('levantado', 'subsanado')) as por_validar,
  count(*) filter (where i.status = 'observado') as observados,
  count(*) filter (where i.status = 'validado') as conformes,
  count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado')
                     and i.due_date < public.hoy_peru()) as vencidos,
  count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado')
                     and i.due_date - public.hoy_peru() between 0 and 1) as urgentes,
  min(i.due_date) filter (where i.status in ('pendiente', 'en_atencion', 'observado')) as proximo_vencimiento
from public.pcis pc
join public.pci_items i on i.pci_id = pc.id and i.deleted_at is null
where pc.deleted_at is null
group by pc.id, i.assigned_crew_id;

grant select on public.v_pci_resumen to authenticated;
