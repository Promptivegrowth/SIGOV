-- ═══════════════════════════════════════════════════════════════════════
-- 0067 · El jefe de cuadrilla no programa
--
-- Regla 1.1 de las observaciones del cliente: la programación la hacen el
-- supervisor o el administrador; el jefe de cuadrilla la ejecuta. La web y
-- la app ya no le ofrecen crear ni editar partidas, pero la base medía
-- weekly_plans y plan_items con can_write(), que incluye al jefe: con su
-- sesión podía crear, mover o borrar programación por la API.
--
-- Antes de cerrar se revisaron todas las vías por las que hoy un jefe
-- escribe en plan_items, para no romper el trabajo de campo:
--
-- · partida_iniciar, partida_finalizar, partida_impedimento (0039): las
--   usa la app para mover la partida. Son SECURITY DEFINER —corren como
--   el dueño de las tablas, que se salta las políticas—, así que siguen
--   funcionando. Pero solo miraban can_write(): cualquier jefe podía
--   iniciar o cerrar la partida de otra cuadrilla. Ahora además exigen que
--   la partida sea de una cuadrilla que él dirige (crews.leader_id), salvo
--   que sea supervisor o administrador.
-- · sync_plan_progress (trigger de work_entries): sube executed_qty al
--   registrar avance. SECURITY DEFINER, no depende de las políticas.
-- · partida_validar y duplicar_semana: ya exigían can_manage().
-- · apply_pci_suspension y revert_pci_suspension (0009): reordenan la
--   semana por un PCI prioritario. SECURITY DEFINER y SIN ninguna
--   comprobación de permiso: cualquiera con sesión podía suspender y
--   mover la programación del contrato. Ahora exigen can_manage(), que es
--   lo que la web ya pedía para mostrar el botón.
-- · La app no escribe plan_items ni weekly_plans por inserción directa
--   (no están en su cola), así que cambiar las políticas no deja nada
--   colgado en los celulares.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Políticas: crear, cambiar y borrar programación ──────────────────
drop policy if exists weekly_plans_insert on public.weekly_plans;
create policy weekly_plans_insert on public.weekly_plans
  for insert to authenticated with check (public.can_manage(service_id));

drop policy if exists weekly_plans_update on public.weekly_plans;
create policy weekly_plans_update on public.weekly_plans
  for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

drop policy if exists weekly_plans_delete on public.weekly_plans;
create policy weekly_plans_delete on public.weekly_plans
  for delete to authenticated using (public.can_manage(service_id));

drop policy if exists plan_items_insert on public.plan_items;
create policy plan_items_insert on public.plan_items
  for insert to authenticated with check (public.can_manage(service_id));

drop policy if exists plan_items_update on public.plan_items;
create policy plan_items_update on public.plan_items
  for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

drop policy if exists plan_items_delete on public.plan_items;
create policy plan_items_delete on public.plan_items
  for delete to authenticated using (public.can_manage(service_id));

-- ─── ¿Puede este usuario mover esta partida? ──────────────────────────
-- El supervisor o el administrador, cualquiera; el jefe, solo las de la
-- cuadrilla que dirige. Una partida sin cuadrilla es solo de quien
-- programa: no hay jefe al que le toque.
create or replace function public.puedo_mover_partida(p_service_id uuid, p_crew_id uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.can_manage(p_service_id)
      or (public.can_write(p_service_id)
          and p_crew_id is not null
          and exists (select 1 from public.crews c
                       where c.id = p_crew_id
                         and c.service_id = p_service_id
                         and c.deleted_at is null
                         and c.leader_id = auth.uid()))
$$;

revoke all on function public.puedo_mover_partida(uuid, uuid) from public, anon;
grant execute on function public.puedo_mover_partida(uuid, uuid) to authenticated;

-- ─── Las tres acciones de campo, con la comprobación de cuadrilla ─────
-- El cuerpo es el de la 0039 tal como está en la base; solo cambia la
-- comprobación de permiso.
create or replace function public.partida_iniciar(p_item uuid)
returns json
language plpgsql security definer set search_path to 'public' as $$
declare v_fila public.plan_items;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.puedo_mover_partida(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: esa partida no es de tu cuadrilla' using errcode = '42501';
  end if;

  if v_fila.status not in ('programado','suspendido') then
    raise exception 'SIGOV: la partida ya está %', v_fila.status;
  end if;

  update public.plan_items
     set status = 'en_curso',
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid()),
         -- Al retomar, el impedimento deja de estar vigente
         impedimento = null, impedimento_at = null, impedimento_by = null
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $$;

create or replace function public.partida_finalizar(p_item uuid)
returns json
language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.plan_items;
  v_registros int;
begin
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
end $$;

create or replace function public.partida_impedimento(p_item uuid, p_motivo text)
returns json
language plpgsql security definer set search_path to 'public' as $$
declare v_fila public.plan_items;
begin
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
    and m.role in ('admin','supervisor');

  return json_build_object('estado', 'suspendido');
end $$;

-- ─── La reprogramación por PCI prioritario: solo quien programa ───────
-- No se reescriben enteras (son largas y no cambia nada más): se les
-- antepone la comprobación envolviéndolas. La función original pasa a
-- llamarse *_sin_permiso y deja de estar expuesta a los usuarios.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'apply_pci_suspension_sin_permiso'
                   and pronamespace = 'public'::regnamespace) then
    alter function public.apply_pci_suspension(uuid) rename to apply_pci_suspension_sin_permiso;
  end if;
  if not exists (select 1 from pg_proc where proname = 'revert_pci_suspension_sin_permiso'
                   and pronamespace = 'public'::regnamespace) then
    alter function public.revert_pci_suspension(uuid) rename to revert_pci_suspension_sin_permiso;
  end if;
end $$;

revoke all on function public.apply_pci_suspension_sin_permiso(uuid) from public, anon, authenticated;
revoke all on function public.revert_pci_suspension_sin_permiso(uuid) from public, anon, authenticated;

create or replace function public.apply_pci_suspension(p_pci_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_service uuid;
begin
  select service_id into v_service from public.pcis where id = p_pci_id and deleted_at is null;
  if v_service is null then
    raise exception 'SIGOV: ese PCI ya no existe';
  end if;
  if not public.can_manage(v_service) then
    raise exception 'SIGOV: solo el supervisor o el administrador reordenan la programación'
      using errcode = '42501';
  end if;
  return public.apply_pci_suspension_sin_permiso(p_pci_id);
end $$;

create or replace function public.revert_pci_suspension(p_suspension_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_service uuid;
begin
  select service_id into v_service from public.plan_suspensions where id = p_suspension_id;
  if v_service is null then
    raise exception 'SIGOV: suspensión no encontrada';
  end if;
  if not public.can_manage(v_service) then
    raise exception 'SIGOV: solo el supervisor o el administrador reordenan la programación'
      using errcode = '42501';
  end if;
  return public.revert_pci_suspension_sin_permiso(p_suspension_id);
end $$;

revoke all on function public.apply_pci_suspension(uuid) from public, anon;
revoke all on function public.revert_pci_suspension(uuid) from public, anon;
grant execute on function public.apply_pci_suspension(uuid) to authenticated;
grant execute on function public.revert_pci_suspension(uuid) to authenticated;
