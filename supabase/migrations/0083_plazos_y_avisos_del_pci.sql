-- ═══════════════════════════════════════════════════════════════════════
-- 0083 · Plazos fijos del PCI y sus avisos
--
-- OBS-08: el plazo de un ítem no es un número libre. La estructura
-- documental de COVINCA tiene una carpeta por plazo —1, 2, 3, 7 y 14 días—
-- y esos son los que se usan. El vencimiento lo fija quien administra el
-- contrato (supervisor, admin), con una tolerancia de 1 día.
--
-- OBS-11 y Elvis (26:22): «el plazo crítico debe ser un día: un día ya está
-- rojo, rojo urgente». Tres avisos:
--   · previo: vence en los próximos días (dias_aviso_pci, por omisión 2);
--   · el día: vence hoy;
--   · crítico: pasó la tolerancia → «ALERTA URGENTE – PCI FUERA DE PLAZO».
-- Al jefe de la cuadrilla y a quien administra; sin repetir en 20 horas.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Los ajustes, con el bloque de PCI ─────────────────────────────────
create or replace function public.ajustes_del_servicio(p_service_id uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Qué se imprime sobre la fotografía. Fecha y hora van siempre.
    'sello', (jsonb_build_object(
      'activo',     true,
      'fecha',      true,
      'hora',       true,
      'geo',        false,
      'precision',  false,
      'progresiva', false,
      'tramo',      false,
      'cuadrilla',  false,
      'actividad',  false,
      'pci',        false,
      'marca',      false
    ) || coalesce(s.settings->'sello', '{}'::jsonb))
      || jsonb_build_object('fecha', true, 'hora', true),

    'caja', jsonb_build_object(
      'monto_minimo_comprobante', 20
    ) || coalesce(s.settings->'caja', '{}'::jsonb),

    'alertas', jsonb_build_object(
      'dias_aviso_vencimiento', 30,
      'dias_aviso_pci', 2
    ) || coalesce(s.settings->'alertas', '{}'::jsonb),

    -- Los plazos que admite el contrato y la tolerancia antes de la alerta crítica
    'pci', jsonb_build_object(
      'plazos', jsonb_build_array(1, 2, 3, 7, 14),
      'tolerancia', 1
    ) || coalesce(s.settings->'pci', '{}'::jsonb)
  )::json
  from public.services s
  where s.id = p_service_id and s.deleted_at is null
$$;

grant execute on function public.ajustes_del_servicio(uuid) to authenticated;

-- ─── Fijar el plazo de uno o varios ítems ──────────────────────────────
create or replace function public.pci_fijar_plazo(p_items uuid[], p_plazo integer, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_servicio uuid;
  v_plazos jsonb;
  v_n int;
begin
  select distinct i.service_id into v_servicio from public.pci_items i where i.id = any(p_items);
  if v_servicio is null then raise exception 'SIGOV: no se encontraron los ítems'; end if;
  if (select count(distinct service_id) from public.pci_items where id = any(p_items)) > 1 then
    raise exception 'SIGOV: los ítems son de contratos distintos';
  end if;
  if not public.can_manage(v_servicio) then
    raise exception 'SIGOV: solo el supervisor o el administrador fija el plazo' using errcode = '42501';
  end if;
  v_plazos := (public.ajustes_del_servicio(v_servicio)::jsonb)->'pci'->'plazos';
  if not (v_plazos @> to_jsonb(p_plazo)) then
    raise exception 'SIGOV: el plazo debe ser uno de los del contrato: %', v_plazos;
  end if;

  -- El vencimiento se cuenta desde la recepción del PCI (o su notificación)
  update public.pci_items i
     set term_days = p_plazo,
         due_date = coalesce(p.received_on, p.notified_on) + p_plazo,
         notes = coalesce(nullif(trim(p_motivo), '') || coalesce(' · ' || i.notes, ''), i.notes),
         updated_at = now()
    from public.pcis p
   where p.id = i.pci_id and i.id = any(p_items) and i.deleted_at is null
     and i.status in ('pendiente', 'en_atencion', 'observado');
  get diagnostics v_n = row_count;

  -- Los contadores y el estado del PCI los recalcula su trigger
  return json_build_object('items', v_n, 'plazo', p_plazo);
end $$;

grant execute on function public.pci_fijar_plazo(uuid[], integer, text) to authenticated;
revoke execute on function public.pci_fijar_plazo(uuid[], integer, text) from anon;

-- ─── Los avisos de vencimiento ─────────────────────────────────────────
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
  -- Los ítems abiertos con su nivel de aviso y quién debe enterarse
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
    -- Destinatarios: el jefe de la cuadrilla (o el asignado) siempre; quien
    -- administra, el día del vencimiento y en lo crítico
    join lateral (
      select coalesce(x.assigned_to, c.leader_id) as profile_id
        from public.crews c where c.id = x.assigned_crew_id
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
