-- ═══════════════════════════════════════════════════════════════════════
-- 0087 · El PCI se publica (OBS-07)
--
-- El flujo que pide Elvis: se recibe el documento, se importa, se reparten
-- los ítems entre cuadrillas y recién entonces se publica. Hasta ahora el
-- jefe veía los ítems en cuanto alguien los cargaba, a medio importar y
-- antes de que se revisaran los plazos.
--
-- · pcis.published_at / published_by: un PCI sin publicar es un borrador.
-- · El jefe de cuadrilla no ve borradores (ni la cabecera ni sus ítems); el
--   resto de roles sí. Se aplica en las políticas, así que vale también para
--   la versión de la app que ya está instalada.
-- · publicar_pci(): solo quien administra; avisa a cada jefe con ítems.
--   Se puede volver a llamar tras reasignar: avisa solo a quien faltaba.
-- · Los PCI que ya existían quedan publicados: nadie pierde lo que veía.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pcis
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id);

update public.pcis set published_at = created_at where published_at is null;

-- ─── Qué PCI ve cada usuario ───────────────────────────────────────────
create or replace function public.pcis_visibles()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
    from public.pcis p
   where p.service_id in (select public.mis_servicios())
     and (p.published_at is not null
          or public.role_in(p.service_id) is distinct from 'jefe_cuadrilla')
$$;

grant execute on function public.pcis_visibles() to authenticated;

drop policy if exists pcis_select on public.pcis;
create policy pcis_select on public.pcis for select to authenticated
  using (public.is_member(service_id)
         and (published_at is not null or public.role_in(service_id) is distinct from 'jefe_cuadrilla'));

drop policy if exists pci_items_select on public.pci_items;
create policy pci_items_select on public.pci_items for select to authenticated
  using (pci_id in (select public.pcis_visibles()) or (select public.is_platform_admin()));

-- ─── Publicar ──────────────────────────────────────────────────────────
create or replace function public.publicar_pci(p_pci_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.pcis;
  v_sin_cuadrilla int;
  v_avisados int;
begin
  select * into p from public.pcis where id = p_pci_id and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if not public.can_manage(p.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador publica un PCI' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pci_items where pci_id = p.id and deleted_at is null) then
    raise exception 'SIGOV: el PCI no tiene ítems; impórtalos antes de publicarlo';
  end if;

  select count(*) into v_sin_cuadrilla
    from public.pci_items
   where pci_id = p.id and deleted_at is null and assigned_crew_id is null
     and status in ('pendiente', 'en_atencion', 'observado');

  if p.published_at is null then
    update public.pcis set published_at = now(), published_by = auth.uid(), updated_at = now()
     where id = p.id;
  end if;

  -- Un aviso por jefe con ítems abiertos, sin repetir al que ya lo recibió
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select p.service_id, c.leader_id, 'pci_publicado',
         format('Nuevo PCI · %s', p.code),
         format('%s ítem%s para tu cuadrilla. El primero vence el %s.',
                count(*), case when count(*) = 1 then '' else 's' end,
                to_char(min(i.due_date), 'DD/MM')),
         '/pci/' || p.id, 'warning',
         jsonb_build_object('pci_id', p.id, 'crew_id', c.id, 'items', count(*))
    from public.pci_items i
    join public.crews c on c.id = i.assigned_crew_id
   where i.pci_id = p.id and i.deleted_at is null and c.leader_id is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and not exists (select 1 from public.notifications n
                      where n.profile_id = c.leader_id and n.type = 'pci_publicado'
                        and n.data->>'pci_id' = p.id::text)
   group by c.id, c.leader_id;
  get diagnostics v_avisados = row_count;

  return json_build_object('avisados', v_avisados, 'sin_cuadrilla', v_sin_cuadrilla);
end $$;

grant execute on function public.publicar_pci(uuid) to authenticated;
revoke execute on function public.publicar_pci(uuid) from anon;

-- ─── Los avisos de plazo: al jefe solo de lo publicado ─────────────────
-- Mismo cuerpo que 0083; cambia la lista de destinatarios.
create or replace function public.evaluate_pci_deadlines()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_previo int := 0; v_hoy int := 0; v_critico int := 0;
  v_hoy_peru date := public.hoy_peru();
begin
  create temp table if not exists _avisos_pci (
    service_id uuid, pci_id uuid, code text, profile_id uuid, nivel text,
    cuantos int, primer date, dias_max int
  ) on commit drop;
  delete from _avisos_pci;

  insert into _avisos_pci
  select x.service_id, x.pci_id, x.code, d.profile_id, x.nivel,
         count(*), min(x.due_date), max(v_hoy_peru - x.due_date)
    from (
      select i.service_id, p.id as pci_id, p.code, i.due_date, i.assigned_crew_id, i.assigned_to,
             p.published_at is not null as publicado,
             case
               when v_hoy_peru - i.due_date > coalesce(((public.ajustes_del_servicio(i.service_id)::jsonb)->'pci'->>'tolerancia')::int, 1)
                 then 'critico'
               when i.due_date = v_hoy_peru then 'hoy'
               when i.due_date > v_hoy_peru
                and i.due_date - v_hoy_peru <= coalesce(((public.ajustes_del_servicio(i.service_id)::jsonb)->'alertas'->>'dias_aviso_pci')::int, 2)
                 then 'previo'
             end as nivel
        from public.pci_items i
        join public.pcis p on p.id = i.pci_id and p.deleted_at is null
       where i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
    ) x
    join lateral (
      -- El jefe (o el asignado), solo si el PCI ya se le publicó
      select coalesce(x.assigned_to, c.leader_id) as profile_id
        from public.crews c where c.id = x.assigned_crew_id and x.publicado
      union
      select m.profile_id from public.service_members m
       where m.service_id = x.service_id and m.role in ('admin', 'supervisor') and x.nivel in ('hoy', 'critico')
    ) d on d.profile_id is not null
   where x.nivel is not null
   group by x.service_id, x.pci_id, x.code, d.profile_id, x.nivel;

  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select a.service_id, a.profile_id,
         case a.nivel when 'critico' then 'pci_fuera_de_plazo' when 'hoy' then 'pci_vence_hoy' else 'pci_por_vencer' end,
         case a.nivel
           when 'critico' then format('🔴 ALERTA URGENTE – PCI FUERA DE PLAZO · %s', a.code)
           when 'hoy' then format('%s · %s ítem%s vence%s hoy', a.code, a.cuantos,
                                  case when a.cuantos = 1 then '' else 's' end, case when a.cuantos = 1 then '' else 'n' end)
           else format('%s · %s ítem%s por vencer', a.code, a.cuantos, case when a.cuantos = 1 then '' else 's' end)
         end,
         case a.nivel
           when 'critico' then format('%s ítem%s fuera de plazo; el más atrasado lleva %s día%s.', a.cuantos,
                                      case when a.cuantos = 1 then '' else 's' end, a.dias_max, case when a.dias_max = 1 then '' else 's' end)
           when 'hoy' then 'Atiéndelos hoy: mañana ya están fuera de plazo.'
           else format('El primero vence %s.', case when a.primer = v_hoy_peru + 1 then 'mañana'
                                                    else 'en ' || (a.primer - v_hoy_peru) || ' días' end)
         end,
         '/pci/' || a.pci_id,
         case a.nivel when 'critico' then 'danger' when 'hoy' then 'warning' else 'info' end,
         jsonb_build_object('pci_id', a.pci_id, 'items', a.cuantos, 'nivel', a.nivel)
    from _avisos_pci a
   where not exists (
     select 1 from public.notifications n
      where n.profile_id = a.profile_id
        and n.data->>'pci_id' = a.pci_id::text
        and n.data->>'nivel' = a.nivel
        and n.created_at > now() - interval '20 hours');

  select count(*) filter (where nivel = 'previo'), count(*) filter (where nivel = 'hoy'), count(*) filter (where nivel = 'critico')
    into v_previo, v_hoy, v_critico from _avisos_pci;

  return jsonb_build_object('previo', v_previo, 'hoy', v_hoy, 'critico', v_critico, 'evaluated_at', now());
end $$;

revoke execute on function public.evaluate_pci_deadlines() from anon, authenticated;

-- ─── Mi Avance: solo cuenta los PCI publicados ─────────────────────────
-- Igual que 0086, salvo el filtro de publicación en el bloque de PCI.
create or replace function public.mi_avance(p_crew_id uuid, p_desde date, p_hasta date)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_servicio uuid;
  v_hoy date := public.hoy_peru();
  v_aviso int;
  v_semana jsonb;
  v_dias jsonb;
  v_pci jsonb;
  v_evid jsonb;
  v_gastos jsonb;
  v_solic jsonb;
begin
  select c.service_id into v_servicio from public.crews c where c.id = p_crew_id and c.deleted_at is null;
  if v_servicio is null then raise exception 'SIGOV: la cuadrilla no existe'; end if;
  if not public.is_member(v_servicio) then
    raise exception 'SIGOV: no perteneces a este contrato' using errcode = '42501';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'SIGOV: el periodo debe ser de hasta dos meses';
  end if;

  v_aviso := coalesce(((public.ajustes_del_servicio(v_servicio)::jsonb)->'alertas'->>'dias_aviso_pci')::int, 2);

  -- ─── La programación del periodo ─────────────────────────────────────
  -- Lo reprogramado sale de la cuenta (vive en su nueva fecha) y lo
  -- cancelado no se le pidió a nadie.
  select jsonb_build_object(
           'asignadas',    count(*),
           'ejecutadas',   count(*) filter (where status in ('ejecutado', 'por_validar')),
           'por_validar',  count(*) filter (where status = 'por_validar'),
           'en_ejecucion', count(*) filter (where status = 'en_curso'),
           'pendientes',   count(*) filter (where status = 'programado'),
           'atrasadas',    count(*) filter (where status = 'programado' and scheduled_on < v_hoy),
           'suspendidas',  count(*) filter (where status = 'suspendido'))
    into v_semana
    from public.plan_items
   where crew_id = p_crew_id and deleted_at is null
     and scheduled_on between p_desde and p_hasta
     and status not in ('cancelado', 'reprogramado');

  select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'asignadas', d.asignadas, 'ejecutadas', d.ejecutadas)
                            order by d.fecha), '[]'::jsonb)
    into v_dias
    from (
      select g::date as fecha,
             count(pi.id) as asignadas,
             count(pi.id) filter (where pi.status in ('ejecutado', 'por_validar')) as ejecutadas
        from generate_series(p_desde, p_hasta, interval '1 day') g
        left join public.plan_items pi
          on pi.crew_id = p_crew_id and pi.deleted_at is null and pi.scheduled_on = g::date
         and pi.status not in ('cancelado', 'reprogramado')
       group by g
    ) d;

  -- ─── El PCI de la cuadrilla (todo lo abierto, sin importar el periodo) ──
  select jsonb_build_object(
           'documentos',  count(distinct i.pci_id) filter (where i.status not in ('validado')),
           'items',       count(*),
           'pendientes',  count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado', 'rechazado')),
           'en_atencion', count(*) filter (where i.status = 'en_atencion'),
           'observados',  count(*) filter (where i.status in ('observado', 'rechazado')),
           'levantados',  count(*) filter (where i.status in ('levantado', 'subsanado', 'validado')),
           'conformes',   count(*) filter (where i.status = 'validado'),
           'vence_hoy',   count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado', 'rechazado') and i.due_date = v_hoy),
           'por_vencer',  count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado', 'rechazado')
                                             and i.due_date > v_hoy and i.due_date - v_hoy <= v_aviso),
           'vencidos',    count(*) filter (where i.status in ('pendiente', 'en_atencion', 'observado', 'rechazado') and i.due_date < v_hoy),
           'proximo_vencimiento', min(i.due_date) filter (where i.status in ('pendiente', 'en_atencion', 'observado', 'rechazado') and i.due_date >= v_hoy))
    into v_pci
    from public.pci_items i
    join public.pcis p on p.id = i.pci_id and p.deleted_at is null and p.published_at is not null
   where i.assigned_crew_id = p_crew_id and i.deleted_at is null;

  -- ─── Las evidencias de lo registrado en el periodo ───────────────────
  -- Completa: tiene al menos las fotos mínimas de su actividad y, si empezó
  -- con «antes», también tiene su «después».
  with r as (
    select we.id,
           coalesce(a.requires_photo, true) as pide_foto,
           greatest(coalesce(a.min_photos, 1), 1) as minimo,
           count(e.id) as fotos,
           count(e.id) filter (where e.phase = 'antes') as antes,
           count(e.id) filter (where e.phase = 'despues') as despues
      from public.work_entries we
      join public.work_orders wo on wo.id = we.work_order_id and wo.deleted_at is null
      left join public.activities_catalog a on a.id = we.activity_id
      left join public.evidences e on e.work_entry_id = we.id and e.deleted_at is null
     where wo.crew_id = p_crew_id and we.deleted_at is null
       and wo.work_date between p_desde and p_hasta
     group by we.id, a.requires_photo, a.min_photos
  )
  select jsonb_build_object(
           'registros',   count(*),
           'fotos',       coalesce(sum(fotos), 0),
           'completas',   count(*) filter (where not pide_foto or (fotos >= minimo and (antes = 0 or despues > 0))),
           'incompletas', count(*) filter (where pide_foto and (fotos < minimo or (antes > 0 and despues = 0))),
           'sin_fotos',   count(*) filter (where pide_foto and fotos = 0),
           'faltan_fotos', count(*) filter (where pide_foto and fotos > 0 and fotos < minimo),
           'sin_despues', count(*) filter (where pide_foto and fotos >= minimo and antes > 0 and despues = 0))
    into v_evid
    from r;

  -- ─── Los gastos de la caja de la cuadrilla en el periodo ─────────────
  select jsonb_build_object(
           'total',       coalesce(sum(m.amount) filter (where m.kind = 'gasto'), 0),
           'cantidad',    count(*) filter (where m.kind = 'gasto'),
           'por_revisar', count(*) filter (where m.kind = 'gasto' and m.status = 'registrado'),
           'observados',  count(*) filter (where m.kind = 'gasto' and m.status = 'observado'),
           'depositos',   coalesce(sum(m.amount) filter (where m.kind = 'deposito'), 0),
           'saldo',       (select b.balance from public.v_cash_boxes b where b.crew_id = p_crew_id and b.is_active limit 1))
    into v_gastos
    from public.cash_movements m
    join public.cash_boxes b on b.id = m.cash_box_id
   where b.crew_id = p_crew_id and m.deleted_at is null and m.status <> 'anulado'
     and m.occurred_on between p_desde and p_hasta;

  -- ─── Las solicitudes abiertas (depósito y materiales) ────────────────
  select jsonb_build_object(
           'depositos_abiertas',   (select count(*) from public.deposit_requests d join public.cash_boxes b on b.id = d.cash_box_id
                                     where b.crew_id = p_crew_id and d.deleted_at is null
                                       and d.status in ('solicitado', 'en_evaluacion', 'aprobado')),
           'depositos_observadas', (select count(*) from public.deposit_requests d join public.cash_boxes b on b.id = d.cash_box_id
                                     where b.crew_id = p_crew_id and d.deleted_at is null and d.status = 'observado'),
           'depositos_atendidas',  (select count(*) from public.deposit_requests d join public.cash_boxes b on b.id = d.cash_box_id
                                     where b.crew_id = p_crew_id and d.deleted_at is null and d.status = 'depositado'
                                       and (d.resolved_at at time zone 'America/Lima')::date between p_desde and p_hasta),
           'materiales_abiertos',  (select count(*) from public.supply_requests s
                                     where s.crew_id = p_crew_id and s.deleted_at is null
                                       and s.status in ('solicitado', 'aprobado', 'parcial')),
           'materiales_borrador',  (select count(*) from public.supply_requests s
                                     where s.crew_id = p_crew_id and s.deleted_at is null and s.status = 'borrador'))
    into v_solic;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'hoy', v_hoy, 'calculado', now(),
    'semana', v_semana, 'dias', v_dias, 'pci', v_pci,
    'evidencias', v_evid, 'gastos', v_gastos, 'solicitudes', v_solic
  )::json;
end $$;

grant execute on function public.mi_avance(uuid, date, date) to authenticated;
revoke execute on function public.mi_avance(uuid, date, date) from anon;
