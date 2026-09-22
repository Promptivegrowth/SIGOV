-- ═══════════════════════════════════════════════════════════════════════
-- 0036 · Duplicar la semana
--
-- La conservación rutinaria se repite: la misma cuadrilla, en el mismo
-- tramo, haciendo lo mismo, semana tras semana. Hoy el supervisor vuelve
-- a teclear veinticuatro partidas cada lunes, o importa otra vez el mismo
-- Excel. La especificación pide un botón que copie la semana.
--
-- Copia el plan, no la ejecución: las partidas nacen en «programado» y con
-- el avance en cero. Y no copia lo que ya no toca —lo cancelado y lo que
-- nació de un PCI, que tiene su propia fecha límite y no se repite—.
--
-- Es idempotente por sentido común, no por magia: si la semana destino ya
-- tiene partidas, no las duplica; devuelve cuántas omitió para que la
-- pantalla lo diga en lugar de dejar el plan doble.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.duplicar_semana(
  p_service_id uuid,
  p_origen date,   -- lunes de la semana que se copia
  p_destino date   -- lunes de la semana que se crea
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan_destino uuid;
  v_copiadas int := 0;
  v_omitidas int := 0;
  v_existentes int := 0;
begin
  if not public.can_manage(p_service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador pueden programar';
  end if;

  if extract(isodow from p_origen) <> 1 or extract(isodow from p_destino) <> 1 then
    raise exception 'SIGOV: las semanas empiezan en lunes';
  end if;

  if p_origen = p_destino then
    raise exception 'SIGOV: la semana de origen y la de destino son la misma';
  end if;

  select count(*) into v_existentes
    from public.plan_items pi
   where pi.service_id = p_service_id
     and pi.deleted_at is null
     and pi.scheduled_on between p_destino and p_destino + 6;

  if v_existentes > 0 then
    return json_build_object(
      'copiadas', 0,
      'omitidas', 0,
      'existentes', v_existentes,
      'mensaje', format('La semana destino ya tiene %s partidas programadas.', v_existentes));
  end if;

  -- El plan de la semana destino, o uno nuevo en borrador
  select id into v_plan_destino
    from public.weekly_plans
   where service_id = p_service_id and starts_on = p_destino and deleted_at is null;

  if v_plan_destino is null then
    insert into public.weekly_plans (service_id, year, week, starts_on, ends_on, status, created_by)
    values (
      p_service_id,
      extract(isoyear from p_destino)::smallint,
      extract(week from p_destino)::smallint,
      p_destino,
      p_destino + 6,
      'borrador',
      auth.uid()
    )
    returning id into v_plan_destino;
  end if;

  -- Lo que no se copia: lo cancelado y lo que nació de un PCI
  select count(*) into v_omitidas
    from public.plan_items pi
   where pi.service_id = p_service_id
     and pi.deleted_at is null
     and pi.scheduled_on between p_origen and p_origen + 6
     and (pi.status = 'cancelado' or pi.suspended_by_pci_id is not null);

  insert into public.plan_items (
    service_id, plan_id, activity_id, section_id, crew_id, unit_id,
    scheduled_on, prog_start_m, prog_end_m, target_qty, executed_qty,
    status, priority, sort_order, notes, created_by
  )
  select
    pi.service_id,
    v_plan_destino,
    pi.activity_id,
    pi.section_id,
    pi.crew_id,
    pi.unit_id,
    -- El mismo día de la semana, siete días más adelante o atrás
    p_destino + (pi.scheduled_on - p_origen),
    pi.prog_start_m,
    pi.prog_end_m,
    pi.target_qty,
    0,
    'programado',
    pi.priority,
    pi.sort_order,
    pi.notes,
    auth.uid()
  from public.plan_items pi
  where pi.service_id = p_service_id
    and pi.deleted_at is null
    and pi.scheduled_on between p_origen and p_origen + 6
    and pi.status <> 'cancelado'
    and pi.suspended_by_pci_id is null;

  get diagnostics v_copiadas = row_count;

  return json_build_object(
    'copiadas', v_copiadas,
    'omitidas', v_omitidas,
    'existentes', 0,
    'plan_id', v_plan_destino,
    'mensaje', format('Se copiaron %s partidas.', v_copiadas));
end $$;

grant execute on function public.duplicar_semana(uuid, date, date) to authenticated;
