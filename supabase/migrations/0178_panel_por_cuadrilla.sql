-- ═══════════════════════════════════════════════════════════════════════
-- 0178 · Ronda 5 (CP-04): «Mis cuadrillas» pasa del resumen global al
-- detalle de una cuadrilla. p_crew acota dentro del alcance del que
-- pregunta (mis_cuadrillas): elegir una cuadrilla ajena da cero, no la abre.
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.panel_resumen(uuid, date, date);
drop function if exists public.panel_ultimas(uuid, integer);
CREATE OR REPLACE FUNCTION public.panel_resumen(p_service_id uuid, p_from date, p_to date, p_crew uuid DEFAULT NULL::uuid)
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
       and (p_crew is null or pi.crew_id = p_crew)
  ),
  pci as (
    select i.pci_id, i.status, i.due_date
      from public.pci_items i, alcance a
     where i.service_id = p_service_id
       and i.deleted_at is null
       and (a.ids is null or i.assigned_crew_id = any(a.ids))
       and (p_crew is null or i.assigned_crew_id = p_crew)
  )
  select json_build_object(
    'cuadrillas', (
      select count(*) from public.crews c, alcance a
       where c.service_id = p_service_id and c.deleted_at is null
         and (a.ids is null or c.id = any(a.ids))
         and (p_crew is null or c.id = p_crew)
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
        and (p_crew is null or r.crew_id = p_crew)
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.panel_ultimas(p_service_id uuid, p_limite integer DEFAULT 12, p_crew uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, reportado_en timestamp with time zone, work_date date, crew_name text, crew_color text, activity_name text, progresiva text, cantidad numeric, unidad text, evidencias bigint, estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids)
  select
    w.id,
    w.created_at,
    w.work_date,
    w.crew_name,
    w.crew_color,
    w.activity_name,
    coalesce(
      nullif(trim(coalesce(w.prog_start_txt, '') ||
        case when w.prog_end_txt is not null and w.prog_end_txt <> w.prog_start_txt
             then ' - ' || w.prog_end_txt else '' end), ''),
      '—'),
    w.quantity,
    w.unit_symbol,
    coalesce(w.evidence_count, 0)::bigint,
    w.order_status::text
  from public.v_work_entries w, alcance a
  where w.service_id = p_service_id
    and (a.ids is null or w.crew_id = any(a.ids))
    and (p_crew is null or w.crew_id = p_crew)
  order by w.created_at desc
  limit greatest(p_limite, 1)
$function$;

grant execute on function public.panel_resumen(uuid, date, date, uuid) to authenticated;
grant execute on function public.panel_ultimas(uuid, integer, uuid) to authenticated;
