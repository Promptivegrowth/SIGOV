-- ═══════════════════════════════════════════════════════════════════════
-- 0111 · Videos de Elvis del 26/10 (observaciones de campo y PCI)
--
-- 1. La observación lleva su tipo de actividad (primero la categoría:
--    berma, calzada, drenaje…; luego la partida COVINCA), la progresiva
--    final si es un intervalo y el metrado. Así el supervisor la «jala» a
--    la programación con todo lo registrado.
-- 2. programar_observacion: crea la partida en la programación de la semana
--    con la actividad, el tramo, las progresivas, el lado y el metrado, y
--    deja la observación «programada». Cuando la partida se ejecuta, la
--    observación queda atendida; si se cancela, vuelve a pendiente.
-- 3. quitar_observacion: la que se registró por error se quita con sus
--    fotos (quien la registró mientras siga pendiente, o el supervisor).
-- 4. Los ítems PCI «atendidos» de la demostración tenían solo el antes y el
--    después: vuelven a ejecución, como manda la regla de las tres fotos.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Actividad, intervalo y metrado ────────────────────────────────
alter table public.observaciones_campo
  add column if not exists activity_id uuid references public.activities_catalog(id),
  add column if not exists progresiva_fin_m numeric(12, 2),
  add column if not exists metrado numeric(12, 2) check (metrado is null or metrado >= 0),
  add column if not exists plan_item_id uuid references public.plan_items(id) on delete set null;

create index if not exists observaciones_campo_partida on public.observaciones_campo (plan_item_id) where plan_item_id is not null;

-- ─── La vista, con la actividad, el sector y las llaves de las fotos ──
create or replace view public.v_observaciones_campo with (security_invoker = true) as
select o.id, o.client_id, o.service_id, o.crew_id, c.name as crew_name,
       o.section_id, s.code as section_code, s.name as section_name, s.numero as section_numero,
       o.progresiva_m, public.fmt_progresiva(o.progresiva_m) as progresiva_txt, o.side,
       o.descripcion, o.estado, o.lat, o.lng, o.observado_on, o.programada_on,
       o.atendida_at, o.nota_atencion, o.created_by, pr.full_name as created_by_name, o.created_at,
       coalesce((select array_agg(e.storage_path order by e.taken_at, e.id)
                   from public.evidences e
                  where e.observacion_id = o.id and e.deleted_at is null), '{}') as fotos,
       o.activity_id, a.code as activity_code, a.name as activity_name, a.category as activity_category,
       u.symbol as unit_symbol,
       o.progresiva_fin_m, public.fmt_progresiva(o.progresiva_fin_m) as progresiva_fin_txt,
       o.metrado, o.plan_item_id,
       (select ss.code from public.service_sectors ss
         where ss.section_id = o.section_id and o.progresiva_m >= ss.prog_start_m and o.progresiva_m <= ss.prog_end_m
         order by ss.orden limit 1) as sector_code,
       -- En el mismo orden que «fotos»: para quitar la que salió mal
       coalesce((select array_agg(coalesce(e.client_id, e.id)::text order by e.taken_at, e.id)
                   from public.evidences e
                  where e.observacion_id = o.id and e.deleted_at is null), '{}') as fotos_ids
  from public.observaciones_campo o
  left join public.crews c on c.id = o.crew_id
  left join public.road_sections s on s.id = o.section_id
  left join public.profiles pr on pr.id = o.created_by
  left join public.activities_catalog a on a.id = o.activity_id
  left join public.units u on u.id = a.unit_id
 where o.deleted_at is null;

grant select on public.v_observaciones_campo to authenticated;

-- ─── 2. Jalar la observación a la programación ───────────────────────
create or replace function public.programar_observacion(
  p_id uuid,
  p_fecha date,
  p_crew_id uuid default null,
  p_activity_id uuid default null,
  p_metrado numeric default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.observaciones_campo;
  v_actividad public.activities_catalog;
  v_lunes date := p_fecha - (extract(isodow from p_fecha)::int - 1);
  v_plan uuid;
  v_partida uuid;
  v_foto text;
begin
  select * into o from public.observaciones_campo where id = p_id and deleted_at is null for update;
  if o.id is null then
    raise exception 'SIGOV: la observación ya no existe';
  end if;
  if not public.can_manage(o.service_id) then
    raise exception 'SIGOV: solo el supervisor o el residente programan' using errcode = '42501';
  end if;
  if o.plan_item_id is not null and exists (
       select 1 from public.plan_items where id = o.plan_item_id and deleted_at is null and status <> 'cancelado') then
    raise exception 'SIGOV: la observación ya está programada';
  end if;
  if o.section_id is null or o.progresiva_m is null then
    raise exception 'SIGOV: la observación no tiene tramo ni progresiva; corrígela antes de programarla';
  end if;

  select * into v_actividad from public.activities_catalog
   where id = coalesce(p_activity_id, o.activity_id) and service_id = o.service_id and deleted_at is null;
  if v_actividad.id is null then
    raise exception 'SIGOV: elige el tipo de actividad para programarla';
  end if;

  -- La programación de esa semana, o una nueva en borrador
  select id into v_plan from public.weekly_plans
   where service_id = o.service_id and starts_on = v_lunes and deleted_at is null
   order by created_at limit 1;
  if v_plan is null then
    insert into public.weekly_plans (service_id, year, week, starts_on, ends_on, status, created_by)
    values (o.service_id, extract(isoyear from v_lunes)::smallint, extract(week from v_lunes)::smallint,
            v_lunes, v_lunes + 6, 'borrador', auth.uid())
    returning id into v_plan;
  end if;

  select e.storage_path into v_foto from public.evidences e
   where e.observacion_id = o.id and e.deleted_at is null order by e.taken_at limit 1;

  insert into public.plan_items (
    service_id, plan_id, activity_id, section_id, crew_id, unit_id, scheduled_on,
    prog_start_m, prog_end_m, target_qty, status, lado, origen, notes, foto_referencia_path, created_by
  ) values (
    o.service_id, v_plan, v_actividad.id, o.section_id, coalesce(p_crew_id, o.crew_id), v_actividad.unit_id, p_fecha,
    least(o.progresiva_m, coalesce(o.progresiva_fin_m, o.progresiva_m)),
    greatest(o.progresiva_m, coalesce(o.progresiva_fin_m, o.progresiva_m)),
    coalesce(p_metrado, o.metrado, 0), 'programado', o.side, 'MR',
    left('Observación de campo: ' || o.descripcion, 500), v_foto, auth.uid()
  ) returning id into v_partida;

  update public.observaciones_campo
     set estado = 'programada', programada_on = p_fecha, plan_item_id = v_partida,
         activity_id = v_actividad.id, metrado = coalesce(p_metrado, metrado)
   where id = o.id;
  return v_partida;
end $$;

revoke all on function public.programar_observacion(uuid, date, uuid, uuid, numeric) from public;
grant execute on function public.programar_observacion(uuid, date, uuid, uuid, numeric) to authenticated;

-- La partida manda: ejecutada → atendida; cancelada o borrada → pendiente
create or replace function public.t_partida_de_observacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.deleted_at is not null or new.status = 'cancelado' then
    update public.observaciones_campo
       set estado = 'pendiente', plan_item_id = null, programada_on = null
     where plan_item_id = new.id and estado <> 'atendida' and deleted_at is null;
  elsif new.status in ('por_validar', 'ejecutado') then
    update public.observaciones_campo
       set estado = 'atendida',
           nota_atencion = coalesce(nota_atencion, 'Atendida en la programación del ' || to_char(new.scheduled_on, 'DD/MM/YYYY'))
     where plan_item_id = new.id and estado <> 'atendida' and deleted_at is null;
  elsif new.scheduled_on is distinct from old.scheduled_on then
    update public.observaciones_campo
       set programada_on = new.scheduled_on
     where plan_item_id = new.id and estado = 'programada' and deleted_at is null;
  end if;
  return null;
end $$;

drop trigger if exists t_partida_de_observacion on public.plan_items;
create trigger t_partida_de_observacion after update on public.plan_items
  for each row
  when (old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at
        or old.scheduled_on is distinct from new.scheduled_on)
  execute function public.t_partida_de_observacion();

-- ─── 3. Quitar una observación registrada por error ──────────────────
create or replace function public.quitar_observacion(p_client_id uuid default null, p_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.observaciones_campo;
  v_estado public.plan_item_status;
begin
  select * into o from public.observaciones_campo
   where (p_id is not null and id = p_id) or (p_client_id is not null and client_id = p_client_id)
   limit 1;
  if o.id is null or o.deleted_at is not null then return; end if;  -- nunca llegó o ya se quitó

  if not (public.can_manage(o.service_id) or (o.created_by = auth.uid() and o.estado = 'pendiente')) then
    raise exception 'SIGOV: solo quien la registró (mientras siga pendiente) o el supervisor pueden quitarla'
      using errcode = '42501';
  end if;

  -- Programada y sin empezar: su partida se va con ella
  if o.plan_item_id is not null then
    select status into v_estado from public.plan_items where id = o.plan_item_id and deleted_at is null;
    if v_estado is not null and v_estado not in ('programado', 'reprogramado', 'cancelado') then
      raise exception 'SIGOV: la observación ya se está atendiendo en la programación; no se puede quitar';
    end if;
    update public.plan_items set deleted_at = now() where id = o.plan_item_id and deleted_at is null;
  end if;

  update public.observaciones_campo set deleted_at = now() where id = o.id;
  update public.evidences set deleted_at = now() where observacion_id = o.id and deleted_at is null;
end $$;

revoke all on function public.quitar_observacion(uuid, uuid) from public;
grant execute on function public.quitar_observacion(uuid, uuid) to authenticated;

-- ─── 4. «Atendido» es con sus tres fotos ─────────────────────────────
update public.pci_items i
   set status = 'en_atencion', closed_at = null, closed_by = null, started_at = coalesce(started_at, now())
 where i.deleted_at is null
   and i.status in ('levantado', 'subsanado')
   and i.requires_evidence
   and (select count(distinct e.phase::text) from public.evidences e
         where e.pci_item_id = i.id and e.deleted_at is null
           and e.phase::text in ('antes', 'durante', 'despues')) < 3;
