-- ═══════════════════════════════════════════════════════════════════════════
-- 0136 · Inicio único PCI / MR (revisión visual del 18/11, T2)
--
-- Guía 3.1 y modelo compartido de dashboard: un solo Inicio con pestañas
-- PCI y MR, la misma consulta para el tablero y el Excel, alcance por rol.
--   · PCI se mide por ítems únicos: Total, Atendidos (atención reportada
--     autorizada al corte), Sin atención = Total − Atendidos, Avance.
--     Para el Visor COVINCA, atendido es lo publicado.
--   · Aparte: evidencia completa, observaciones abiertas, conformidad.
--   · MR se mide por actividad y unidad: programado, ejecutado, saldo y %;
--     nunca se suman unidades distintas; lo no programado va aparte.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Rendimiento por jornada (referencia de productividad) ─────────────────
-- Distinto de «rendimientos» (consumo de material por unidad de partida).
create table if not exists public.rendimientos_jornada (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  activity_id uuid not null references public.activities_catalog(id),
  crew_id uuid references public.crews(id),
  metodo text,
  unit_id uuid references public.units(id),
  cantidad numeric not null check (cantidad > 0),
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);
create unique index if not exists rendimientos_jornada_unico
  on public.rendimientos_jornada (service_id, activity_id, coalesce(crew_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(metodo), ''))
  where deleted_at is null;
alter table public.rendimientos_jornada enable row level security;
drop policy if exists rendimientos_jornada_select on public.rendimientos_jornada;
create policy rendimientos_jornada_select on public.rendimientos_jornada for select to authenticated
  using (public.ve_lo_interno(service_id));
drop policy if exists rendimientos_jornada_write on public.rendimientos_jornada;
create policy rendimientos_jornada_write on public.rendimientos_jornada for all to authenticated
  using (public.es_admin(service_id)) with check (public.es_admin(service_id));

-- La referencia que aplica: la de la cuadrilla; si no hay, la general
create or replace function public.rendimiento_referencia(p_service uuid, p_activity uuid, p_crew uuid default null)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select r.cantidad from public.rendimientos_jornada r
   where r.service_id = p_service and r.activity_id = p_activity and r.deleted_at is null
     and (r.crew_id = p_crew or r.crew_id is null)
   order by (r.crew_id is not null) desc, r.updated_at desc
   limit 1
$$;

-- ── Inicio · PCI ──────────────────────────────────────────────────────────
create or replace function public.inicio_pci(p_service uuid, p_pci uuid default null, p_corte date default current_date,
                                             p_crew uuid default null, p_sector text default null, p_busqueda text default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_visor boolean := public.es_visor(p_service);
  v_res json;
begin
  if not public.is_member(p_service) then
    raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501';
  end if;

  with base as (
    select i.*, p.code pci_code,
           (select s.code from public.sector_de(i.section_id, i.prog_start_m) s) sector_code,
           a.name activity_name
      from public.pci_items i
      join public.pcis p on p.id = i.pci_id
      left join public.activities_catalog a on a.id = i.activity_id
     where i.service_id = p_service and i.deleted_at is null and p.deleted_at is null
       -- el mismo alcance que la tabla (supervisor: sus cuadrillas; jefe: la suya)
       and i.pci_id in (select public.pcis_visibles())
       and (i.assigned_crew_id is null or i.assigned_crew_id in (select public.cuadrillas_visibles()))
       -- supervisor y jefe: solo lo asignado a sus cuadrillas (no lo que aún no tiene cuadrilla)
       and (public.role_in(p_service) not in ('supervisor', 'jefe_cuadrilla')
            or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
       and (p_pci is null or i.pci_id = p_pci)
       and (p_crew is null or i.assigned_crew_id = p_crew)
  ), filtrado as (
    select b.* from base b
     where (p_sector is null or b.sector_code = p_sector)
       and (p_busqueda is null or b.pci_code ilike '%' || p_busqueda || '%' or b.item_number::text = p_busqueda
            or b.description ilike '%' || p_busqueda || '%' or b.activity_name ilike '%' || p_busqueda || '%')
  ), fotos as (
    select f.id,
           count(e.id) filter (where e.phase = 'antes') antes,
           count(e.id) filter (where e.phase = 'durante') durante,
           count(e.id) filter (where e.phase = 'despues') despues
      from filtrado f
      left join public.evidences e on e.pci_item_id = f.id and e.deleted_at is null
                                  and (not v_visor or e.publicada_version is not null)
     group by f.id
  ), it as (
    select f.*,
           case when v_visor then f.publicacion_version > 0 and f.publicado_at::date <= p_corte
                else f.closed_at is not null and f.closed_at::date <= p_corte
                     and f.status not in ('pendiente', 'en_atencion') end atendido,
           (ph.antes > 0 and ph.durante > 0 and ph.despues > 0) completa,
           array_remove(array[case when ph.antes = 0 then 'antes' end, case when ph.durante = 0 then 'durante' end,
                              case when ph.despues = 0 then 'despues' end], null) faltan,
           (select count(*) from public.revision_observaciones o where o.pci_item_id = f.id and o.estado <> 'cerrada'
               and (not v_visor or o.origen = 'COVINCA' or f.publicacion_version > 0)) obs_abiertas
      from filtrado f join fotos ph on ph.id = f.id
  ), plazos as (
    select term_days plazo, min(due_date) vencimiento, count(*) total, count(*) filter (where atendido) atendidos
      from it group by term_days
  )
  select json_build_object(
    'visor', v_visor,
    'corte', p_corte,
    'total', (select count(*) from it),
    'atendidos', (select count(*) from it where atendido),
    'sin_atencion', (select count(*) from it where not atendido),
    'avance', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where atendido) / count(*), 1) end from it),
    'por_plazo', (select coalesce(json_agg(json_build_object(
                    'plazo', plazo, 'vencimiento', vencimiento, 'total', total, 'atendidos', atendidos,
                    'pendientes', total - atendidos,
                    'avance', case when total = 0 then null else round(100.0 * atendidos / total, 1) end) order by plazo), '[]'::json) from plazos),
    'evidencia', json_build_object(
       'completa', (select count(*) from it where atendido and completa),
       'incompleta', (select count(*) from it where atendido and not completa),
       'observaciones_abiertas', (select coalesce(sum(obs_abiertas), 0) from it),
       'conformes_covinca', (select count(*) from it where covinca_estado = 'conforme'),
       -- lo interno de SERVICON no se informa al Visor
       'por_validar', case when v_visor then null else (select count(*) from it where status in ('levantado', 'subsanado') and validado_servicon_at is null) end,
       'por_publicar', case when v_visor then null else (select count(*) from it where validado_servicon_at is not null and status in ('levantado', 'subsanado')
                          and (publicacion_version = 0 or publicacion_pendiente or covinca_estado = 'observado')) end,
       'por_revisar_covinca', (select count(*) from it where covinca_estado = 'por_revisar')),
    'incompletos', (select coalesce(json_agg(x), '[]'::json) from (
         select json_build_object('item_id', id, 'pci_id', pci_id, 'pci', pci_code, 'item', item_number, 'faltan', faltan) x
           from it where atendido and not completa order by due_date, item_number limit 8) z),
    'ultimos_publicados', (select coalesce(json_agg(x), '[]'::json) from (
         select json_build_object('item_id', id, 'pci_id', pci_id, 'pci', pci_code, 'item', item_number,
                                  'estado', case when covinca_estado = 'conforme' then 'Conforme'
                                                 when covinca_estado = 'observado' then 'Observado'
                                                 when not completa then 'Falta ' || public.fase_legible(faltan[1])
                                                 else 'Por revisar' end,
                                  'publicado_at', publicado_at) x
           from it where publicacion_version > 0 order by publicado_at desc nulls last limit 5) z),
    'plazos_por_completar', (select count(*) from plazos where total > atendidos),
    'vencidos', (select count(*) from it where not atendido and due_date < p_corte),
    'pcis', (select coalesce(json_agg(json_build_object('id', p.id, 'code', p.code) order by p.code desc), '[]'::json)
               from public.pcis p where p.service_id = p_service and p.deleted_at is null and p.id in (select distinct pci_id from base)),
    'sectores', (select coalesce(json_agg(distinct sector_code), '[]'::json) from base where sector_code is not null),
    'ultima_sincronizacion', (select max(s.finished_at) from public.sync_sessions s where s.service_id = p_service)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.inicio_pci(uuid, uuid, date, uuid, text, text) from public, anon;
grant execute on function public.inicio_pci(uuid, uuid, date, uuid, text, text) to authenticated;

-- Los ítems detrás de una cifra (abrir un KPI o un plazo): misma regla
create or replace function public.inicio_pci_items(p_service uuid, p_pci uuid default null, p_corte date default current_date,
                                                   p_crew uuid default null, p_sector text default null,
                                                   p_cifra text default 'total', p_plazo integer default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_visor boolean := public.es_visor(p_service); v_res json;
begin
  if not public.is_member(p_service) then raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501'; end if;
  select coalesce(json_agg(x order by (x->>'item')::int), '[]'::json) into v_res from (
    select json_build_object('item_id', i.id, 'pci_id', i.pci_id, 'pci', p.code, 'item', i.item_number, 'plazo', i.term_days,
                             'vencimiento', i.due_date, 'estado', i.status, 'covinca', i.covinca_estado,
                             'publicacion_version', i.publicacion_version, 'crew', c.name, 'description', i.description) x
      from public.pci_items i join public.pcis p on p.id = i.pci_id left join public.crews c on c.id = i.assigned_crew_id
     where i.service_id = p_service and i.deleted_at is null
       and i.pci_id in (select public.pcis_visibles())
       and (i.assigned_crew_id is null or i.assigned_crew_id in (select public.cuadrillas_visibles()))
       and (public.role_in(p_service) not in ('supervisor', 'jefe_cuadrilla')
            or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
       and (p_pci is null or i.pci_id = p_pci) and (p_crew is null or i.assigned_crew_id = p_crew)
       and (p_plazo is null or i.term_days = p_plazo)
       and (p_sector is null or (select s.code from public.sector_de(i.section_id, i.prog_start_m) s) = p_sector)
       and (v_visor is false or i.publicacion_version > 0 or p_cifra in ('total', 'sin_atencion'))
       and case p_cifra
             when 'atendidos' then case when v_visor then i.publicacion_version > 0 and i.publicado_at::date <= p_corte
                                        else i.closed_at is not null and i.closed_at::date <= p_corte and i.status not in ('pendiente', 'en_atencion') end
             when 'sin_atencion' then not case when v_visor then i.publicacion_version > 0 and i.publicado_at::date <= p_corte
                                        else i.closed_at is not null and i.closed_at::date <= p_corte and i.status not in ('pendiente', 'en_atencion') end
             else true end
  ) z;
  return v_res;
end $$;
revoke all on function public.inicio_pci_items(uuid, uuid, date, uuid, text, text, integer) from public, anon;
grant execute on function public.inicio_pci_items(uuid, uuid, date, uuid, text, text, integer) to authenticated;

-- ── Inicio · MR ───────────────────────────────────────────────────────────
-- Con permisos del que consulta (RLS): el supervisor ve sus cuadrillas; el
-- Visor, solo los partes publicados.
create or replace function public.inicio_mr(p_service uuid, p_desde date, p_hasta date, p_crew uuid default null,
                                            p_supervisor uuid default null, p_activity uuid default null, p_unit uuid default null)
returns json language sql stable security invoker set search_path to 'public' as $$
  with prog as (
    select pi.id, pi.activity_id, coalesce(pi.unit_id, a.unit_id) unit_id, pi.crew_id, pi.scheduled_on, pi.section_id,
           pi.prog_start_m, pi.prog_end_m, coalesce(pi.target_qty, 0) programado, pi.status
      from public.plan_items pi
      join public.activities_catalog a on a.id = pi.activity_id
      left join public.crews c on c.id = pi.crew_id
     where pi.service_id = p_service and pi.deleted_at is null
       and pi.scheduled_on between p_desde and p_hasta
       and pi.status not in ('suspendido', 'cancelado', 'reprogramado')
       and pi.pci_item_id is null
       -- el Visor solo ve la programación publicada
       and (not public.es_visor(p_service) or exists (select 1 from public.weekly_plans wp where wp.id = pi.plan_id and wp.status in ('publicado', 'cerrado')))
       and (p_crew is null or pi.crew_id = p_crew)
       and (p_supervisor is null or c.supervisor_id = p_supervisor)
       and (p_activity is null or pi.activity_id = p_activity)
       and (p_unit is null or coalesce(pi.unit_id, a.unit_id) = p_unit)
  ), ejec as (
    select w.id, w.plan_item_id, w.activity_id, coalesce(w.unit_id, a.unit_id) unit_id, o.crew_id, o.work_date, w.quantity
      from public.work_entries w
      join public.work_orders o on o.id = w.work_order_id
      join public.activities_catalog a on a.id = w.activity_id
      left join public.crews c on c.id = o.crew_id
     where w.service_id = p_service and w.deleted_at is null and o.deleted_at is null
       and o.work_date between p_desde and p_hasta
       and w.pci_item_id is null
       and (p_crew is null or o.crew_id = p_crew)
       and (p_supervisor is null or c.supervisor_id = p_supervisor)
       and (p_activity is null or w.activity_id = p_activity)
       and (p_unit is null or coalesce(w.unit_id, a.unit_id) = p_unit)
  ), por_act as (
    select coalesce(p.activity_id, e.activity_id) activity_id, coalesce(p.unit_id, e.unit_id) unit_id,
           coalesce(p.programado, 0) programado, coalesce(e.ejecutado, 0) ejecutado
      from (select activity_id, unit_id, sum(programado) programado from prog group by 1, 2) p
      full join (select activity_id, unit_id, sum(quantity) ejecutado from ejec
                  where plan_item_id in (select id from prog) group by 1, 2) e
        on e.activity_id = p.activity_id and e.unit_id is not distinct from p.unit_id
  ), detalle as (
    select p.id, p.scheduled_on, p.crew_id, p.section_id, p.prog_start_m, p.prog_end_m, p.programado,
           coalesce((select sum(e.quantity) from ejec e where e.plan_item_id = p.id), 0) ejecutado, p.status
      from prog p
  )
  select json_build_object(
    'homogeneo', p_activity is not null and (select count(distinct unit_id) from prog) <= 1,
    'unidad', (select u.symbol from public.units u where u.id = coalesce(p_unit, (select min(unit_id::text)::uuid from prog))),
    'programado', (select sum(programado) from prog),
    'ejecutado', (select sum(ejecutado) from detalle),
    'actividades', (select count(*) from por_act where programado > 0),
    'culminadas', (select count(*) from por_act where programado > 0 and ejecutado >= programado),
    'por_actividad', (select coalesce(json_agg(json_build_object(
          'activity_id', pa.activity_id, 'actividad', a.name, 'codigo', a.code, 'unidad', u.symbol,
          'programado', pa.programado, 'ejecutado', pa.ejecutado, 'saldo', greatest(pa.programado - pa.ejecutado, 0),
          'avance', case when pa.programado > 0 then round(100.0 * pa.ejecutado / pa.programado, 1) end)
          order by a.name), '[]'::json)
        from por_act pa join public.activities_catalog a on a.id = pa.activity_id left join public.units u on u.id = pa.unit_id
       where pa.programado > 0),
    'no_programadas', (select coalesce(json_agg(json_build_object('actividad', a.name, 'unidad', u.symbol, 'ejecutado', x.ej) order by a.name), '[]'::json)
        from (select activity_id, unit_id, sum(quantity) ej from ejec where plan_item_id is null or plan_item_id not in (select id from prog) group by 1, 2) x
        join public.activities_catalog a on a.id = x.activity_id left join public.units u on u.id = x.unit_id),
    'por_dia', (select coalesce(json_agg(json_build_object('fecha', d, 'programado', coalesce(pp.v, 0), 'ejecutado', coalesce(ee.v, 0)) order by d), '[]'::json)
        from generate_series(p_desde, p_hasta, interval '1 day') g(d)
        left join (select scheduled_on f, sum(programado) v from prog group by 1) pp on pp.f = g.d::date
        left join (select work_date f, sum(quantity) v from ejec where plan_item_id in (select id from prog) group by 1) ee on ee.f = g.d::date
       where p_activity is not null and (p_hasta - p_desde) <= 62),
    'por_cuadrilla', (select coalesce(json_agg(json_build_object('crew_id', c.id, 'cuadrilla', c.name, 'programado', x.pr, 'ejecutado', x.ej,
          'saldo', greatest(x.pr - x.ej, 0), 'avance', case when x.pr > 0 then round(100.0 * x.ej / x.pr, 1) end) order by c.code), '[]'::json)
        from (select crew_id, sum(programado) pr, sum(ejecutado) ej from detalle group by 1) x join public.crews c on c.id = x.crew_id
       where p_activity is not null),
    'detalle', (select coalesce(json_agg(json_build_object('plan_item_id', d.id, 'fecha', d.scheduled_on, 'cuadrilla', c.name,
          'sector', (select s.code from public.sector_de(d.section_id, d.prog_start_m) s),
          'prog_inicio', d.prog_start_m, 'prog_fin', d.prog_end_m, 'programado', d.programado, 'ejecutado', d.ejecutado,
          'saldo', greatest(d.programado - d.ejecutado, 0), 'estado', d.status) order by d.scheduled_on, c.code), '[]'::json)
        from detalle d left join public.crews c on c.id = d.crew_id
       where p_activity is not null),
    'jornadas', (select count(distinct (crew_id, work_date)) from ejec where p_activity is not null and plan_item_id in (select id from prog)),
    'referencia', case when p_activity is not null then public.rendimiento_referencia(p_service, p_activity, p_crew) end,
    'partes_publicados', (select count(distinct o.id) from public.work_orders o where o.service_id = p_service and o.deleted_at is null
                             and o.work_date between p_desde and p_hasta and o.publicacion_version > 0
                             and (p_crew is null or o.crew_id = p_crew)),
    'observaciones_abiertas', (select count(*) from public.revision_observaciones r join public.work_orders o on o.id = r.work_order_id
                             where r.service_id = p_service and r.estado <> 'cerrada' and o.work_date between p_desde and p_hasta),
    'ultima_sincronizacion', (select max(s.finished_at) from public.sync_sessions s where s.service_id = p_service)
  )
$$;
revoke all on function public.inicio_mr(uuid, date, date, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.inicio_mr(uuid, date, date, uuid, uuid, uuid, uuid) to authenticated;
