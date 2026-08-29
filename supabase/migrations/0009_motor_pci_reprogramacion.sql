-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0009 · MOTOR DE REPROGRAMACIÓN POR PCI PRIORITARIO
--
-- Requisito crítico de la propuesta:
--   "la programación semanal puede suspenderse o reordenarse automáticamente
--    cuando ingresa un PCI prioritario"
--
-- Lógica:
--  1. Se detectan los ítems del plan vigente que colisionan con el PCI
--     (mismo tramo y solapamiento de progresivas, o misma cuadrilla asignada).
--  2. Esos ítems se marcan 'suspendido' y se reprograman al final de la semana
--     (o a la siguiente si no cabe), preservando su fecha original.
--  3. Se crean ítems de plan nuevos para atender el PCI, con prioridad 1.
--  4. Se registra todo en plan_suspensions con el diff antes/después.
--  5. Se notifica por push a las cuadrillas afectadas.
-- Todo dentro de una transacción: o se aplica completo, o no se aplica.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.apply_pci_suspension(p_pci_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pci          public.pcis%rowtype;
  v_plan         public.weekly_plans%rowtype;
  v_detail       jsonb := '[]'::jsonb;
  v_affected     int := 0;
  v_created      int := 0;
  v_susp_id      uuid;
  v_item         record;
  v_new_date     date;
  v_max_order    int;
  v_crew         uuid;
begin
  select * into v_pci from public.pcis where id = p_pci_id and deleted_at is null;
  if not found then
    raise exception 'SIGOV: PCI % no existe', p_pci_id;
  end if;

  if v_pci.priority not in ('alta','critica') then
    return jsonb_build_object('applied', false, 'reason', 'El PCI no es prioritario (alta/critica)');
  end if;

  if v_pci.suspension_applied_at is not null then
    return jsonb_build_object('applied', false, 'reason', 'La suspensión ya fue aplicada para este PCI');
  end if;

  -- Plan vigente del servicio: el que contiene la fecha de notificación,
  -- o el publicado más cercano hacia adelante.
  select * into v_plan
    from public.weekly_plans
   where service_id = v_pci.service_id
     and deleted_at is null
     and status in ('publicado','borrador','suspendido')
     and ends_on >= v_pci.notified_on
   order by starts_on asc
   limit 1;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'No hay programación vigente que suspender');
  end if;

  select coalesce(max(sort_order), 0) into v_max_order
    from public.plan_items where plan_id = v_plan.id;

  -- ── 1 y 2. Suspender los ítems en conflicto ────────────────────────────
  for v_item in
    select pi.*
      from public.plan_items pi
     where pi.plan_id = v_plan.id
       and pi.deleted_at is null
       and pi.status in ('programado','en_curso')
       and pi.scheduled_on >= greatest(v_pci.notified_on, v_plan.starts_on)
       and exists (
         select 1 from public.pci_items it
          where it.pci_id = v_pci.id
            and it.deleted_at is null
            and it.section_id = pi.section_id
            and (it.prog_start_m is null or it.prog_end_m is null
                 or (it.prog_start_m <= pi.prog_end_m and it.prog_end_m >= pi.prog_start_m))
       )
     order by pi.scheduled_on, pi.sort_order
  loop
    -- reprogramar al día siguiente hábil dentro de la semana, si no cabe → fin de semana
    v_new_date := least(v_item.scheduled_on + 2, v_plan.ends_on);

    update public.plan_items
       set status = 'suspendido',
           suspended_by_pci_id = v_pci.id,
           original_date = coalesce(original_date, scheduled_on),
           rescheduled_to = v_new_date,
           scheduled_on = v_new_date,
           updated_at = now()
     where id = v_item.id;

    v_affected := v_affected + 1;
    v_detail := v_detail || jsonb_build_object(
      'plan_item_id', v_item.id,
      'accion', 'suspendido_reprogramado',
      'fecha_anterior', v_item.scheduled_on,
      'fecha_nueva', v_new_date,
      'section_id', v_item.section_id,
      'crew_id', v_item.crew_id
    );
  end loop;

  -- ── 3. Crear ítems de plan para atender el PCI (prioridad máxima) ──────
  for v_item in
    select it.*, coalesce(it.assigned_crew_id,
             (select pi2.crew_id from public.plan_items pi2
               where pi2.plan_id = v_plan.id and pi2.section_id = it.section_id
                 and pi2.crew_id is not null limit 1)) as target_crew
      from public.pci_items it
     where it.pci_id = v_pci.id
       and it.deleted_at is null
       and it.status = 'pendiente'
       and it.section_id is not null
       and it.activity_id is not null
     order by it.due_date asc, it.item_number asc
     limit 60
  loop
    v_max_order := v_max_order + 1;
    v_new_date := greatest(
      least(v_item.due_date - 1, v_plan.ends_on),
      greatest(v_pci.notified_on, v_plan.starts_on, current_date)
    );

    insert into public.plan_items (
      plan_id, service_id, activity_id, section_id, crew_id, scheduled_on,
      prog_start_m, prog_end_m, target_qty, unit_id, status, priority,
      sort_order, notes, suspended_by_pci_id, created_by
    ) values (
      v_plan.id, v_pci.service_id, v_item.activity_id, v_item.section_id,
      v_item.target_crew, v_new_date,
      coalesce(v_item.prog_start_m, 0), coalesce(v_item.prog_end_m, v_item.prog_start_m, 0),
      coalesce(v_item.quantity, 0), v_item.unit_id, 'programado', 1,
      v_max_order,
      format('PCI %s · ítem %s · %s', v_pci.code, v_item.item_number, left(v_item.description, 120)),
      v_pci.id, auth.uid()
    );

    v_created := v_created + 1;
    v_detail := v_detail || jsonb_build_object(
      'pci_item_id', v_item.id,
      'accion', 'insertado_por_pci',
      'fecha', v_new_date,
      'item_number', v_item.item_number
    );
  end loop;

  -- ── 4. Registrar la suspensión ─────────────────────────────────────────
  insert into public.plan_suspensions (
    service_id, plan_id, pci_id, reason, items_affected, detail, applied_by
  ) values (
    v_pci.service_id, v_plan.id, v_pci.id,
    format('PCI %s (%s) — %s', v_pci.code, v_pci.priority, v_pci.title),
    v_affected, v_detail, auth.uid()
  ) returning id into v_susp_id;

  update public.weekly_plans
     set status = case when v_affected > 0 then 'suspendido'::plan_status else status end,
         updated_at = now()
   where id = v_plan.id;

  update public.pcis
     set suspends_plan = true,
         suspension_applied_at = now(),
         status = 'en_atencion',
         updated_at = now()
   where id = v_pci.id;

  -- ── 5. Notificar a las cuadrillas afectadas ────────────────────────────
  for v_crew in
    select distinct crew_id from public.plan_items
     where plan_id = v_plan.id and suspended_by_pci_id = v_pci.id and crew_id is not null
  loop
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select v_pci.service_id, c.leader_id, 'pci_prioritario',
           format('PCI %s prioritario · programación reordenada', v_pci.code),
           format('Se reordenó tu programación de la semana %s. Revisa tus nuevas asignaciones.', v_plan.week),
           '/campo/programacion', 'danger',
           jsonb_build_object('pci_id', v_pci.id, 'plan_id', v_plan.id)
      from public.crews c
     where c.id = v_crew and c.leader_id is not null;
  end loop;

  return jsonb_build_object(
    'applied', true,
    'suspension_id', v_susp_id,
    'plan_id', v_plan.id,
    'plan_week', v_plan.week,
    'items_suspended', v_affected,
    'items_created', v_created,
    'detail', v_detail
  );
end $$;

-- ─── Simulación (dry-run): muestra el diff SIN aplicar nada ───────────────
create or replace function public.preview_pci_suspension(p_pci_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pci   public.pcis%rowtype;
  v_plan  public.weekly_plans%rowtype;
  v_items jsonb;
  v_new   jsonb;
begin
  select * into v_pci from public.pcis where id = p_pci_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'PCI no encontrado'); end if;

  select * into v_plan from public.weekly_plans
   where service_id = v_pci.service_id and deleted_at is null
     and status in ('publicado','borrador','suspendido') and ends_on >= v_pci.notified_on
   order by starts_on asc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'Sin programación vigente'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pi.id, 'actividad', a.name, 'tramo', s.name,
           'fecha_actual', pi.scheduled_on,
           'fecha_propuesta', least(pi.scheduled_on + 2, v_plan.ends_on),
           'cuadrilla', c.name,
           'progresiva', public.fmt_progresiva(pi.prog_start_m) || ' – ' || public.fmt_progresiva(pi.prog_end_m)
         ) order by pi.scheduled_on), '[]'::jsonb)
    into v_items
    from public.plan_items pi
    join public.activities_catalog a on a.id = pi.activity_id
    join public.road_sections s on s.id = pi.section_id
    left join public.crews c on c.id = pi.crew_id
   where pi.plan_id = v_plan.id and pi.deleted_at is null
     and pi.status in ('programado','en_curso')
     and pi.scheduled_on >= greatest(v_pci.notified_on, v_plan.starts_on)
     and exists (select 1 from public.pci_items it
                  where it.pci_id = v_pci.id and it.deleted_at is null
                    and it.section_id = pi.section_id
                    and (it.prog_start_m is null or it.prog_end_m is null
                         or (it.prog_start_m <= pi.prog_end_m and it.prog_end_m >= pi.prog_start_m)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_number', it.item_number, 'descripcion', it.description,
           'tramo', s.name, 'vence', it.due_date,
           'fecha_propuesta', greatest(least(it.due_date - 1, v_plan.ends_on),
                                       greatest(v_pci.notified_on, v_plan.starts_on, current_date))
         ) order by it.due_date), '[]'::jsonb)
    into v_new
    from public.pci_items it
    left join public.road_sections s on s.id = it.section_id
   where it.pci_id = v_pci.id and it.deleted_at is null and it.status = 'pendiente'
     and it.section_id is not null and it.activity_id is not null;

  return jsonb_build_object(
    'ok', true,
    'pci', jsonb_build_object('id', v_pci.id, 'code', v_pci.code, 'priority', v_pci.priority, 'title', v_pci.title),
    'plan', jsonb_build_object('id', v_plan.id, 'week', v_plan.week, 'starts_on', v_plan.starts_on, 'ends_on', v_plan.ends_on),
    'to_suspend', v_items,
    'to_create', v_new,
    'already_applied', v_pci.suspension_applied_at is not null
  );
end $$;

-- ─── Revertir una suspensión ─────────────────────────────────────────────
create or replace function public.revert_pci_suspension(p_suspension_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s public.plan_suspensions%rowtype; v_n int := 0;
begin
  select * into v_s from public.plan_suspensions where id = p_suspension_id;
  if not found then raise exception 'SIGOV: suspensión no encontrada'; end if;
  if v_s.reverted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'Ya fue revertida');
  end if;

  update public.plan_items
     set scheduled_on = original_date,
         status = 'programado',
         rescheduled_to = null,
         suspended_by_pci_id = null,
         updated_at = now()
   where suspended_by_pci_id = v_s.pci_id and original_date is not null and status = 'suspendido';
  get diagnostics v_n = row_count;

  delete from public.plan_items
   where suspended_by_pci_id = v_s.pci_id and original_date is null;

  update public.plan_suspensions set reverted_at = now(), reverted_by = auth.uid() where id = v_s.id;
  update public.pcis set suspends_plan = false, suspension_applied_at = null where id = v_s.pci_id;
  update public.weekly_plans set status = 'publicado' where id = v_s.plan_id;

  return jsonb_build_object('ok', true, 'restored', v_n);
end $$;

-- ─── Cron: evaluar vencimientos de PCI y generar notificaciones ──────────
create or replace function public.evaluate_pci_deadlines()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_warn int := 0; v_over int := 0;
begin
  -- Ítems que vencen en 48 h
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select i.service_id, coalesce(i.assigned_to, c.leader_id), 'pci_por_vencer',
         format('PCI %s · ítem %s vence en %s día(s)', p.code, i.item_number, (i.due_date - current_date)),
         left(i.description, 160), '/pci/' || p.id, 'warning',
         jsonb_build_object('pci_item_id', i.id)
    from public.pci_items i
    join public.pcis p on p.id = i.pci_id
    left join public.crews c on c.id = i.assigned_crew_id
   where i.deleted_at is null
     and i.status not in ('levantado','validado')
     and i.due_date between current_date and current_date + 2
     and coalesce(i.assigned_to, c.leader_id) is not null
     and not exists (select 1 from public.notifications n
                      where n.type = 'pci_por_vencer'
                        and n.data->>'pci_item_id' = i.id::text
                        and n.created_at > now() - interval '20 hours');
  get diagnostics v_warn = row_count;

  -- Ítems vencidos → supervisores y admins del servicio
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select i.service_id, m.profile_id, 'pci_vencido',
         format('PCI %s · ítem %s VENCIDO', p.code, i.item_number),
         left(i.description, 160), '/pci/' || p.id, 'danger',
         jsonb_build_object('pci_item_id', i.id)
    from public.pci_items i
    join public.pcis p on p.id = i.pci_id
    join public.service_members m on m.service_id = i.service_id and m.role in ('admin','supervisor')
   where i.deleted_at is null
     and i.status not in ('levantado','validado')
     and i.due_date < current_date
     and not exists (select 1 from public.notifications n
                      where n.type = 'pci_vencido'
                        and n.data->>'pci_item_id' = i.id::text
                        and n.profile_id = m.profile_id
                        and n.created_at > now() - interval '20 hours');
  get diagnostics v_over = row_count;

  return jsonb_build_object('por_vencer', v_warn, 'vencidos', v_over, 'evaluated_at', now());
end $$;
