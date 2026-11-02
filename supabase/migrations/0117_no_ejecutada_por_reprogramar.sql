-- ═══════════════════════════════════════════════════════════════════════
-- 0117 · REV3-OBS-11: lo No ejecutado lo reprograma el supervisor
--
-- La cuadrilla podía «Retomar» una partida que ya reportó como No ejecutada,
-- y al hacerlo se borraba la causal. Ahora queda «Pendiente de
-- reprogramación»: la cuadrilla no la reabre; el supervisor la reprograma
-- (al cambiarle la fecha vuelve a «programado») y la causal se conserva como
-- antecedente.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.partida_iniciar(p_item uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fila public.plan_items;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.puedo_mover_partida(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: esa partida no es de tu cuadrilla' using errcode = '42501';
  end if;

  if v_fila.status = 'suspendido' and not public.can_manage(v_fila.service_id) then
    raise exception 'SIGOV: la partida se reportó como No ejecutada; el supervisor la reprograma';
  end if;
  if v_fila.status not in ('programado', 'suspendido') then
    raise exception 'SIGOV: la partida ya está %', v_fila.status;
  end if;

  update public.plan_items
     set status = 'en_curso',
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $$;

-- Reprogramar = cambiarle la fecha: vuelve a «programado», con su causal
-- guardada en la nota para que se sepa por qué se movió
create or replace function public.t_partida_reprogramada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status = 'suspendido' and new.status = 'suspendido' and new.scheduled_on is distinct from old.scheduled_on then
    new.status := 'programado';
    new.original_date := coalesce(old.original_date, old.scheduled_on);
    if old.impedimento is not null then
      new.notes := left(concat_ws(' · ', nullif(trim(new.notes), ''),
        format('No ejecutada el %s: %s', to_char(old.scheduled_on, 'DD/MM/YYYY'), old.impedimento)), 1000);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_partida_reprogramada on public.plan_items;
create trigger t_partida_reprogramada before update of scheduled_on on public.plan_items
  for each row execute function public.t_partida_reprogramada();
