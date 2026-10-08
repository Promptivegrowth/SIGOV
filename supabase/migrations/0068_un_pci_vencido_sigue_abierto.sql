-- ═══════════════════════════════════════════════════════════════════════
-- 0068 · Un PCI vencido sigue abierto, y un ítem no es un PCI
--
-- OBS-12. Dos defectos de rótulo y uno de cuenta:
--
-- · dashboard_kpis contaba como «PCI abiertos» solo los de estado
--   'abierto' o 'en_atencion'. pci_refresh_counters pasa un PCI a
--   'vencido' en cuanto un ítem se pasa de fecha, así que justo los PCI
--   más urgentes salían de la cuenta: con los tres PCI del contrato
--   vencidos, la cifra era 0. Abierto es todo lo que no está 'levantado'
--   ni 'cerrado'. Se añade 'items_abiertos' para no mezclar documentos con
--   ítems.
-- · panel_resumen solo daba cifras de ítems, que la web rotulaba como
--   «PCI». Se añade 'pcis_abiertos' (documentos con algún ítem sin
--   levantar en las cuadrillas del supervisor); las demás claves no
--   cambian de significado.
-- · alertas_operativas titulaba «PCI vencidos» una cuenta de ítems.
--
-- El resto de cada función es el que está hoy en la base, sin cambios.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Alertas: los títulos dicen ítems ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.alertas_operativas(p_service_id uuid)
 RETURNS TABLE(clave text, severidad text, titulo text, detalle text, cantidad bigint, url text, orden integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  hoy as (select public.hoy_peru()::date as d),
  lunes as (
    select (select d from hoy) - ((extract(isodow from (select d from hoy))::int) - 1) as ini
  ),
  todas as (

    -- ── Ítems de PCI que ya pasaron su fecha límite ────────────────────────────
    select
      'pci_vencidos'::text                                             as clave,
      'critica'::text                                                  as severidad,
      'Ítems de PCI vencidos'::text                                     as titulo,
      'Pasaron la fecha límite pactada con el cliente. Cada día suma penalidad.'::text as detalle,
      count(*)::bigint                                                 as cantidad,
      '/pci/tablero'::text                                             as url,
      1                                                                as orden
    from public.pci_items i, alcance a
    where i.service_id = p_service_id and i.deleted_at is null
      and i.status in ('pendiente','en_atencion')
      and i.due_date < (select d from hoy)
      and (a.ids is null or i.assigned_crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Ítems de PCI que vencen esta semana ────────────────────────────────────
    select
      'pci_por_vencer', 'alta',
      'Ítems de PCI que vencen en 7 días',
      'Todavía se pueden levantar a tiempo si se programan ahora.',
      count(*)::bigint, '/pci/tablero', 2
    from public.pci_items i, alcance a
    where i.service_id = p_service_id and i.deleted_at is null
      and i.status in ('pendiente','en_atencion')
      and i.due_date between (select d from hoy) and (select d from hoy) + 7
      and (a.ids is null or i.assigned_crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Documentos de seguridad y vehículos por vencer ────────────────
    select
      'vencimientos', 'alta',
      'Documentos y equipos por vencer',
      'SOAT, revisiones, pólizas o equipos de seguridad con la fecha encima.',
      count(*)::bigint, '/vencimientos', 3
    from public.v_vencimientos v
    where v.service_id = p_service_id
      and v.alert_level in ('vencido','critico','urgente')
    having count(*) > 0

    union all
    -- ── Partes diarios esperando validación ───────────────────────────
    select
      'partes_por_validar', 'media',
      'Partes diarios por validar',
      'Las cuadrillas ya los enviaron y esperan revisión.',
      count(*)::bigint, '/campo?status=enviado', 4
    from public.work_orders w, alcance a
    where w.service_id = p_service_id and w.deleted_at is null
      and w.status = 'enviado'
      and (a.ids is null or w.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Solicitudes de material sin respuesta ─────────────────────────
    select
      'pedidos_sin_aprobar', 'media',
      'Solicitudes de material sin aprobar',
      'Las cuadrillas no pueden salir a campo hasta que se resuelvan.',
      count(*)::bigint, '/materiales', 5
    from public.supply_requests r, alcance a
    where r.service_id = p_service_id and r.deleted_at is null
      and r.status = 'solicitado'
      and (a.ids is null or r.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Registros que exigen foto y no la tienen ──────────────────────
    select
      'sin_evidencia', 'media',
      'Registros sin la evidencia exigida',
      'La actividad obliga a fotografiar y el registro llegó sin fotos.',
      count(*)::bigint, '/campo', 6
    from public.work_entries we
    join public.activities_catalog ac on ac.id = we.activity_id
    join public.work_orders wo on wo.id = we.work_order_id, alcance a
    where we.service_id = p_service_id and we.deleted_at is null
      and ac.requires_photo
      -- No basta con «sin fotos»: la actividad fija su mínimo y por debajo
      -- de ese número el registro no sustenta nada
      and (select count(*) from public.evidences e
            where e.work_entry_id = we.id and e.deleted_at is null)
          < greatest(coalesce(ac.min_photos, 1), 1)
      and (a.ids is null or wo.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Cuadrillas sin nada programado esta semana ────────────────────
    select
      'sin_programa', 'baja',
      'Cuadrillas sin programa esta semana',
      'No tienen ninguna partida asignada del lunes al domingo.',
      count(*)::bigint, '/programacion', 7
    from public.crews c, alcance a
    where c.service_id = p_service_id and c.deleted_at is null and c.is_active
      and (a.ids is null or c.id = any(a.ids))
      and not exists (
        select 1 from public.plan_items pi
         where pi.crew_id = c.id and pi.deleted_at is null
           and pi.scheduled_on between (select ini from lunes)
                                   and (select ini from lunes) + 6)
    having count(*) > 0

    union all
    -- ── Cajas chicas por debajo de su umbral ──────────────────────────
    select
      'caja_baja', 'media',
      'Cajas chicas con saldo bajo',
      'El saldo cayó por debajo del mínimo fijado para operar.',
      count(*)::bigint, '/caja', 8
    from public.v_cash_boxes b, alcance a
    where b.service_id = p_service_id and b.is_active
      and b.balance < b.low_balance_threshold
      and (a.ids is null or b.crew_id is null or b.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Gastos observados esperando corrección ────────────────────────
    select
      'gastos_observados', 'baja',
      'Gastos observados',
      'Se devolvieron al responsable y siguen sin subsanar.',
      count(*)::bigint, '/caja', 9
    from public.cash_movements m
    join public.cash_boxes b on b.id = m.cash_box_id, alcance a
    where m.service_id = p_service_id and m.deleted_at is null
      and m.status = 'observado'
      and (a.ids is null or b.crew_id is null or b.crew_id = any(a.ids))
    having count(*) > 0
  )
  select * from todas order by orden
$function$
;

-- ─── Panel general: PCI abiertos de verdad ────────────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_service_id uuid, p_from date DEFAULT (CURRENT_DATE - 30), p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
declare r jsonb;
begin
  if not public.is_member(p_service_id) then
    raise exception 'SIGOV: sin acceso a este servicio';
  end if;

  select jsonb_build_object(
    'rango', jsonb_build_object('desde', p_from, 'hasta', p_to),

    'produccion', (
      select jsonb_build_object(
        'registros',   count(*),
        'metrado',     coalesce(sum(we.quantity), 0),
        'partes',      count(distinct we.work_order_id),
        'cuadrillas',  count(distinct wo.crew_id),
        'evidencias',  coalesce((select count(*) from public.evidences e
                                 where e.service_id = p_service_id and e.deleted_at is null
                                   and e.taken_at::date between p_from and p_to), 0)
      )
      from public.work_entries we
      join public.work_orders wo on wo.id = we.work_order_id
      where we.service_id = p_service_id and we.deleted_at is null
        and wo.work_date between p_from and p_to
    ),

    'programacion', (
      select jsonb_build_object(
        'items',        count(*),
        'programados',  count(*) filter (where pi.status = 'programado'),
        'en_curso',     count(*) filter (where pi.status = 'en_curso'),
        'ejecutados',   count(*) filter (where pi.status = 'ejecutado'),
        'suspendidos',  count(*) filter (where pi.status = 'suspendido'),
        'meta',         coalesce(sum(pi.target_qty), 0),
        'avance',       coalesce(sum(pi.executed_qty), 0),
        'cumplimiento', case when coalesce(sum(pi.target_qty),0) > 0
                          then round(sum(pi.executed_qty) / sum(pi.target_qty) * 100, 1) else 0 end
      )
      from public.plan_items pi
      where pi.service_id = p_service_id and pi.deleted_at is null
        and pi.scheduled_on between p_from and p_to
    ),

    'pci', (
      select jsonb_build_object(
        -- El documento sigue abierto mientras no se levante o se cierre:
        -- «vencido» también cuenta (OBS-12).
        'pcis_abiertos', (select count(*) from public.pcis p
                          where p.service_id = p_service_id and p.deleted_at is null
                            and p.status not in ('levantado','cerrado')),
        'items_abiertos', count(*) filter (where i.status not in ('levantado','validado')),
        'items_total',   count(*),
        'pendientes',    count(*) filter (where i.status = 'pendiente'),
        'en_atencion',   count(*) filter (where i.status = 'en_atencion'),
        'levantados',    count(*) filter (where i.status in ('levantado','validado')),
        'vencidos',      count(*) filter (where i.due_date < current_date
                                            and i.status not in ('levantado','validado')),
        'por_vencer_7d', count(*) filter (where i.due_date between current_date and current_date + 7
                                            and i.status not in ('levantado','validado')),
        'semaforo', jsonb_build_object(
          'verde',   count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'verde'),
          'ambar',   count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'ambar'),
          'rojo',    count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'rojo'),
          'vencido', count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'vencido'),
          'ok',      count(*) filter (where public.pci_item_semaforo(i.due_date, i.term_days, i.status) = 'ok')
        )
      )
      from public.pci_items i
      where i.service_id = p_service_id and i.deleted_at is null
    ),

    'ssoma', (
      select jsonb_build_object(
        'charlas',     (select count(*) from public.safety_talks t
                        where t.service_id = p_service_id and t.deleted_at is null
                          and t.talk_date between p_from and p_to),
        'asistentes',  (select count(*) from public.talk_attendance a
                        join public.safety_talks t on t.id = a.talk_id
                        where t.service_id = p_service_id and t.talk_date between p_from and p_to),
        'checklists',  (select count(*) from public.checklist_responses cr
                        where cr.service_id = p_service_id and cr.deleted_at is null
                          and cr.responded_on between p_from and p_to),
        'hallazgos',   (select count(*) from public.checklist_responses cr
                        where cr.service_id = p_service_id and cr.deleted_at is null
                          and cr.has_findings and cr.responded_on between p_from and p_to),
        'ats',         (select count(*) from public.ats_iperc ai
                        where ai.service_id = p_service_id and ai.deleted_at is null
                          and ai.doc_date between p_from and p_to)
      )
    ),

    'inventario', (
      select jsonb_build_object(
        'total',    count(*),
        'bueno',    count(*) filter (where ra.condition = 'bueno'),
        'regular',  count(*) filter (where ra.condition = 'regular'),
        'malo',     count(*) filter (where ra.condition = 'malo'),
        'critico',  count(*) filter (where ra.condition = 'critico')
      )
      from public.road_assets ra
      where ra.service_id = p_service_id and ra.deleted_at is null
    ),

    'alertas', (
      select jsonb_build_object(
        'partes_sin_evidencia', (
          select count(*) from public.work_entries we
          join public.work_orders wo on wo.id = we.work_order_id
          join public.activities_catalog a on a.id = we.activity_id
          where we.service_id = p_service_id and we.deleted_at is null
            and wo.work_date between p_from and p_to
            and a.requires_photo
            and (select count(*) from public.evidences e
                 where e.work_entry_id = we.id and e.deleted_at is null) < a.min_photos
        ),
        'partes_por_validar', (
          select count(*) from public.work_orders wo
          where wo.service_id = p_service_id and wo.deleted_at is null
            and wo.status = 'enviado'
        ),
        'planes_suspendidos', (
          select count(*) from public.weekly_plans wp
          where wp.service_id = p_service_id and wp.deleted_at is null and wp.status = 'suspendido'
        )
      )
    )
  ) into r;

  return r;
end $function$
;

-- ─── Panel del supervisor: cuántos PCI, además de cuántos ítems ──────
CREATE OR REPLACE FUNCTION public.panel_resumen(p_service_id uuid, p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  plan as (
    select pi.status
      from public.plan_items pi, alcance a
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
       and (a.ids is null or pi.crew_id = any(a.ids))
  ),
  pci as (
    select i.pci_id, i.status, i.due_date
      from public.pci_items i, alcance a
     where i.service_id = p_service_id
       and i.deleted_at is null
       and (a.ids is null or i.assigned_crew_id = any(a.ids))
  )
  select json_build_object(
    'cuadrillas', (
      select count(*) from public.crews c, alcance a
       where c.service_id = p_service_id and c.deleted_at is null
         and (a.ids is null or c.id = any(a.ids))
    ),
    'asignadas',    (select count(*) from plan),
    'en_ejecucion', (select count(*) from plan where status = 'en_curso'),
    'culminadas',   (select count(*) from plan where status in ('ejecutado','por_validar')),
    'por_validar',  (select count(*) from plan where status = 'por_validar'),
    'pendientes',   (select count(*) from plan where status = 'programado'),
    'observadas',   (select count(*) from plan where status in ('suspendido','reprogramado')),
    'avance', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status in ('ejecutado','por_validar'))
                        / count(*), 0)
             end
        from plan
    ),
    -- Ítems y documentos son cifras distintas (OBS-12): 'pci_activos' y
    -- 'pci_vencidos' cuentan ítems; 'pcis_abiertos', los PCI que tienen
    -- algún ítem sin levantar en estas cuadrillas.
    'pcis_abiertos', (select count(distinct pci_id) from pci where status not in ('levantado','validado')),
    'pci_activos',   (select count(*) from pci where status in ('pendiente','en_atencion')),
    'pci_atendidos', (select count(*) from pci where status in ('levantado','validado')),
    'pci_vencidos',  (
      select count(*) from pci
       where status in ('pendiente','en_atencion')
         and due_date < public.hoy_peru()::date
    ),
    'pci_cumplimiento', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                        / count(*), 0)
             end
        from pci
    ),
    'materiales', (
      select json_build_object(
        'pendientes', count(*) filter (where r.status = 'solicitado'),
        'aprobadas',  count(*) filter (where r.status = 'aprobado'),
        'parciales',  count(*) filter (where r.status = 'parcial'),
        'entregadas', count(*) filter (where r.status = 'entregado')
      )
      from public.supply_requests r, alcance a
      where r.service_id = p_service_id and r.deleted_at is null
        and (a.ids is null or r.crew_id = any(a.ids))
    )
  )
$function$
;
