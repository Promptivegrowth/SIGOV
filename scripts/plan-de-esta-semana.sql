-- ═══════════════════════════════════════════════════════════════════════
-- Trae la programación al presente.
--
-- El plan sembrado se quedó en una semana pasada y la aplicación de campo,
-- que siempre pregunta por hoy, abría vacía. Esto copia la última semana
-- publicada sobre la semana en curso respetando el día de cada partida: lo
-- que iba un lunes cae en el lunes de esta semana.
--
-- Es para el entorno de demostración. En producción la programación la
-- publica el supervisor desde la web.
--
--   node scripts/sql.mjs file scripts/plan-de-esta-semana.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio    uuid;
  v_plan_viejo  uuid;
  v_lunes_viejo date;
  v_lunes_nuevo date;
  v_plan_nuevo  uuid;
  v_copiadas    int;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then
    raise exception 'No se encontró el servicio SUR.';
  end if;

  -- El lunes de esta semana, en hora de Perú
  v_lunes_nuevo := date_trunc('week', (now() at time zone 'America/Lima'))::date;

  -- La última semana que tiene partidas
  select pi.plan_id, date_trunc('week', max(pi.scheduled_on))::date
    into v_plan_viejo, v_lunes_viejo
    from public.plan_items pi
   where pi.service_id = v_servicio and pi.deleted_at is null
   group by pi.plan_id
   order by max(pi.scheduled_on) desc
   limit 1;

  if v_plan_viejo is null then
    raise exception 'No hay ninguna semana publicada que copiar.';
  end if;

  if v_lunes_viejo = v_lunes_nuevo then
    raise notice 'La semana en curso ya tiene programación. No se toca nada.';
    return;
  end if;

  -- La semana nueva, publicada: es la que el capataz tiene que poder ver
  select id into v_plan_nuevo
    from public.weekly_plans
   where service_id = v_servicio and starts_on = v_lunes_nuevo
   limit 1;

  if v_plan_nuevo is null then
    insert into public.weekly_plans (
      service_id, year, week, starts_on, ends_on, status, published_at
    )
    values (
      v_servicio,
      extract(isoyear from v_lunes_nuevo)::int,
      extract(week    from v_lunes_nuevo)::int,
      v_lunes_nuevo,
      v_lunes_nuevo + 6,
      'publicado',
      now()
    )
    returning id into v_plan_nuevo;
  end if;

  -- Cada partida cae en el mismo día de la semana que tenía
  insert into public.plan_items (
    plan_id, service_id, activity_id, section_id, crew_id, scheduled_on,
    prog_start_m, prog_end_m, target_qty, unit_id, status, priority, sort_order, notes
  )
  select v_plan_nuevo, pi.service_id, pi.activity_id, pi.section_id, pi.crew_id,
         v_lunes_nuevo + (pi.scheduled_on - v_lunes_viejo),
         pi.prog_start_m, pi.prog_end_m, pi.target_qty, pi.unit_id,
         'programado', pi.priority, pi.sort_order, pi.notes
    from public.plan_items pi
   where pi.plan_id = v_plan_viejo
     and pi.deleted_at is null
     and pi.scheduled_on >= v_lunes_viejo
     and pi.scheduled_on <  v_lunes_viejo + 7
     and not exists (
       select 1 from public.plan_items ya
        where ya.plan_id = v_plan_nuevo
          and ya.activity_id is not distinct from pi.activity_id
          and ya.crew_id is not distinct from pi.crew_id
          and ya.scheduled_on = v_lunes_nuevo + (pi.scheduled_on - v_lunes_viejo)
     );

  get diagnostics v_copiadas = row_count;
  raise notice 'Semana del % copiada al %: % partidas.', v_lunes_viejo, v_lunes_nuevo, v_copiadas;
end $$;
