-- ═══════════════════════════════════════════════════════════════════════
-- 0086 · Mi Avance: el resumen de la semana de una cuadrilla (OBS-49)
--
-- Elvis pide que «Mi Avance» resuma, además del día:
--   · programación semanal: asignadas, ejecutadas, en ejecución, pendientes, %;
--   · PCI: asignados, ítems pendientes, levantados, vencimientos;
--   · evidencias: completas e incompletas;
--   · otros: gastos, solicitudes (y lo pendiente de sincronizar, que lo sabe
--     el propio celular).
--
-- Una sola llamada en vez de seis: el jefe de cuadrilla consulta su avance
-- donde la señal es mala, y el celular guarda la última respuesta.
-- ═══════════════════════════════════════════════════════════════════════

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
    join public.pcis p on p.id = i.pci_id and p.deleted_at is null
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
