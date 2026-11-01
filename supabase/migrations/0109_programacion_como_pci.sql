-- ═══════════════════════════════════════════════════════════════════════
-- 0109 · Videos de Elvis del 22/10 (programación y reporte diario)
--
-- 1. Quitar un material o un equipo anotado por error, también si ya subió
--    a la nube («me equivoqué… y no sé dónde para poder eliminarlo»). Lo
--    hace quien lo anotó (las políticas de la tabla siguen mandando).
-- 2. La partida programada se maneja como un ítem PCI («son prácticamente
--    como los PCIs… no tener tantas vueltas»): con avance registrado y sus
--    fotos de antes, durante y después pasa sola a «por validar», sin el
--    botón Finalizar. Si se quita una foto o el avance antes de la
--    validación, vuelve a «en curso».
-- 3. Al supervisor le llega el aviso cuando una partida queda por validar
--    («no sé si estará llegando al rol de supervisor»).
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Quitar un material o un equipo ───────────────────────────────
create or replace function public.quitar_del_parte(p_tabla text, p_client_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if p_tabla = 'movimientos_cuadrilla' then
    update public.movimientos_cuadrilla set deleted_at = now(), updated_at = now()
     where client_id = p_client_id and deleted_at is null and tipo = 'consumo';
  elsif p_tabla = 'parte_recursos' then
    update public.parte_recursos set deleted_at = now(), updated_at = now()
     where client_id = p_client_id and deleted_at is null;
  else
    raise exception 'SIGOV: no se puede quitar eso desde el parte';
  end if;
end $$;

revoke execute on function public.quitar_del_parte(text, uuid) from public, anon;
grant execute on function public.quitar_del_parte(text, uuid) to authenticated;

-- ─── 2 y 3. La partida por sus fotos y su avance ─────────────────────
-- Lo cerrado solo por las fotos puede reabrirse solo; lo que cerró la
-- persona con «Finalizar», no
alter table public.plan_items add column if not exists finished_auto boolean not null default false;
create or replace function public.t_partida_por_fotos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan uuid;
  p public.plan_items;
  a int; d int; dp int; v_avance numeric;
  v_nuevo text;
begin
  -- La partida de la foto (por su actividad) o del avance
  if tg_table_name = 'evidences' then
    select we.plan_item_id into v_plan from public.work_entries we
     where we.id = coalesce(new.work_entry_id, old.work_entry_id);
  else
    v_plan := coalesce(new.plan_item_id, old.plan_item_id);
  end if;
  if v_plan is null then return null; end if;

  select * into p from public.plan_items where id = v_plan and deleted_at is null for update;
  if not found then return null; end if;
  -- Ya validada, rechazada o no ejecutada: eso lo decide el supervisor
  if p.status::text not in ('programado', 'en_curso', 'por_validar') then return null; end if;

  select count(*) filter (where ev.phase = 'antes'),
         count(*) filter (where ev.phase = 'durante'),
         count(*) filter (where ev.phase = 'despues')
    into a, d, dp
    from public.evidences ev join public.work_entries we on we.id = ev.work_entry_id
   where we.plan_item_id = v_plan and we.deleted_at is null and ev.deleted_at is null;
  select coalesce(sum(quantity), 0) into v_avance from public.work_entries
   where plan_item_id = v_plan and deleted_at is null;

  v_nuevo := case
    when v_avance > 0 and a > 0 and d > 0 and dp > 0 and p.status::text <> 'por_validar' then 'por_validar'
    when not (v_avance > 0 and a > 0 and d > 0 and dp > 0) and p.status::text = 'por_validar' and p.finished_auto then 'en_curso'
    else null
  end;
  if v_nuevo is null then return null; end if;

  update public.plan_items
     set status = v_nuevo::public.plan_item_status,
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid()),
         finished_at = case when v_nuevo = 'por_validar' then now() else null end,
         finished_by = case when v_nuevo = 'por_validar' then auth.uid() else null end,
         finished_auto = (v_nuevo = 'por_validar'),
         updated_at = now()
   where id = v_plan;

  if v_nuevo = 'por_validar' then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select p.service_id, m.profile_id, 'partida_por_validar',
           format('Partida por validar · %s', coalesce(c.name, 'cuadrilla')),
           coalesce(ac.name, 'Partida') || ' · ' || coalesce(public.fmt_progresiva(p.prog_start_m), '') ||
             ' · avance ' || trim(to_char(v_avance, 'FM999999990.##')),
           '/programacion', 'info', jsonb_build_object('plan_item_id', p.id)
      from public.service_members m
      left join public.crews c on c.id = p.crew_id
      left join public.activities_catalog ac on ac.id = p.activity_id
     where m.service_id = p.service_id and m.role in ('supervisor', 'residente');
  end if;
  return null;
end $$;


drop trigger if exists t_partida_por_fotos on public.evidences;
create trigger t_partida_por_fotos after insert or update of deleted_at, phase, work_entry_id on public.evidences
  for each row execute function public.t_partida_por_fotos();
drop trigger if exists t_partida_por_avance on public.work_entries;
create trigger t_partida_por_avance after insert or update of quantity, deleted_at, plan_item_id on public.work_entries
  for each row execute function public.t_partida_por_fotos();
