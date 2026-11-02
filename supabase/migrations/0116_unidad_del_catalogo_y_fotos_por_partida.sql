-- ═══════════════════════════════════════════════════════════════════════
-- 0116 · Consolidado del 3er entregable
--
-- REV3-OBS-01: la unidad sale del catálogo de actividades. Partidas, ítems
--   PCI y avances toman siempre la unidad de su actividad (nadie la escribe
--   ni la elige), y las vistas la leen del catálogo.
-- REV3-OBS-05/09: la tarjeta de una partida cuenta sus fotos por fase con lo
--   que ya está en la nube (A · D · DP · General), no solo lo del teléfono.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.t_unidad_del_catalogo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_unidad uuid;
begin
  if new.activity_id is null then return new; end if;
  select unit_id into v_unidad from public.activities_catalog where id = new.activity_id;
  if v_unidad is not null then new.unit_id := v_unidad; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['plan_items', 'pci_items', 'work_entries'] loop
    execute format('drop trigger if exists t_unidad_del_catalogo on public.%I', t);
    execute format('create trigger t_unidad_del_catalogo before insert or update of activity_id, unit_id on public.%I
                      for each row execute function public.t_unidad_del_catalogo()', t);
  end loop;
end $$;

-- Lo que ya estaba con otra unidad se alinea con el catálogo
update public.plan_items pi set unit_id = a.unit_id
  from public.activities_catalog a
 where a.id = pi.activity_id and a.unit_id is not null and pi.unit_id is distinct from a.unit_id;
update public.pci_items i set unit_id = a.unit_id
  from public.activities_catalog a
 where a.id = i.activity_id and a.unit_id is not null and i.unit_id is distinct from a.unit_id;
update public.work_entries w set unit_id = a.unit_id
  from public.activities_catalog a
 where a.id = w.activity_id and a.unit_id is not null and w.unit_id is distinct from a.unit_id;

create or replace view public.v_plan_items with (security_invoker = true) as
SELECT pi.id,
    pi.plan_id,
    pi.service_id,
    pi.scheduled_on,
    wp.year,
    wp.week,
    wp.status AS plan_status,
    pi.activity_id,
    a.name AS activity_name,
    a.code AS activity_code,
    a.category AS activity_category,
    a.color AS activity_color,
    pi.section_id,
    s.name AS section_name,
    s.code AS section_code,
    pi.prog_start_m,
    pi.prog_end_m,
    fmt_progresiva(pi.prog_start_m) AS prog_start_txt,
    fmt_progresiva(pi.prog_end_m) AS prog_end_txt,
    pi.crew_id,
    c.name AS crew_name,
    c.color AS crew_color,
    pi.target_qty,
    pi.executed_qty,
        CASE
            WHEN pi.target_qty > 0::numeric THEN round(LEAST(pi.executed_qty / pi.target_qty, 1::numeric) * 100::numeric, 1)
            ELSE 0::numeric
        END AS progress_pct,
    u.symbol AS unit_symbol,
    pi.status,
    pi.priority,
    pi.sort_order,
    pi.notes,
    pi.suspended_by_pci_id,
    pi.original_date,
    pi.rescheduled_to,
    pci.code AS pci_code,
    pi.created_at,
    pi.updated_at,
    pi.started_at,
    pi.finished_at,
    pi.validated_at,
    pi.impedimento,
    pi.impedimento_at,
    quien_inicio.full_name AS started_by_name,
    quien_cerro.full_name AS finished_by_name,
    quien_valido.full_name AS validated_by_name,
    a.numero_covinca AS activity_numero,
    a.carpeta_ns AS activity_carpeta_ns,
    pi.lado,
    pi.origen,
    pi.pci_item_id,
    pit.item_number AS pci_item_number,
    pci_del_item.code AS pci_item_pci_code,
    pi.subcontratada,
    c.numero AS crew_numero,
    c.sede AS crew_sede,
    sup.full_name AS supervisor_name,
    (sector_de(pi.section_id, pi.prog_start_m)).code AS sector_code,
    pi.foto_referencia_path,
    f.fotos_antes,
    f.fotos_durante,
    f.fotos_despues,
    f.fotos_general
   FROM plan_items pi
     JOIN weekly_plans wp ON wp.id = pi.plan_id
     JOIN activities_catalog a ON a.id = pi.activity_id
     JOIN road_sections s ON s.id = pi.section_id
     LEFT JOIN crews c ON c.id = pi.crew_id
     LEFT JOIN units u ON u.id = COALESCE(a.unit_id, pi.unit_id)
     LEFT JOIN pcis pci ON pci.id = pi.suspended_by_pci_id
     LEFT JOIN profiles quien_inicio ON quien_inicio.id = pi.started_by
     LEFT JOIN profiles quien_cerro ON quien_cerro.id = pi.finished_by
     LEFT JOIN profiles quien_valido ON quien_valido.id = pi.validated_by
     LEFT JOIN pci_items pit ON pit.id = pi.pci_item_id
     LEFT JOIN pcis pci_del_item ON pci_del_item.id = pit.pci_id
     LEFT JOIN profiles sup ON sup.id = c.supervisor_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE e.phase = 'antes'::evidence_phase) AS fotos_antes,
            count(*) FILTER (WHERE e.phase = 'durante'::evidence_phase) AS fotos_durante,
            count(*) FILTER (WHERE e.phase = 'despues'::evidence_phase) AS fotos_despues,
            count(*) FILTER (WHERE e.phase NOT IN ('antes'::evidence_phase, 'durante'::evidence_phase, 'despues'::evidence_phase)) AS fotos_general
           FROM evidences e
             JOIN work_entries w ON w.id = e.work_entry_id
          WHERE w.plan_item_id = pi.id AND w.deleted_at IS NULL AND e.deleted_at IS NULL) f ON true
  WHERE pi.deleted_at IS NULL;

create or replace view public.v_pci_items with (security_invoker = true) as
SELECT i.id,
    i.pci_id,
    i.service_id,
    i.item_number,
    i.description,
    i.section_id,
    s.name AS section_name,
    s.code AS section_code,
    i.prog_start_m,
    i.prog_end_m,
    i.side,
    fmt_progresiva(i.prog_start_m) AS prog_start_txt,
    fmt_progresiva(i.prog_end_m) AS prog_end_txt,
    i.activity_id,
    a.name AS activity_name,
    i.quantity,
    u.symbol AS unit_symbol,
    i.term_days,
    i.due_date,
    i.due_date - hoy_peru() AS days_left,
    pci_item_semaforo(i.due_date, i.term_days, i.status) AS semaforo,
    i.status,
    i.assigned_crew_id,
    c.name AS crew_name,
    i.assigned_to,
    p.full_name AS assignee_name,
    i.requires_evidence,
    i.closed_at,
    i.validated_at,
    i.notes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL) AS evidence_count,
    pc.code AS pci_code,
    pc.title AS pci_title,
    pc.priority AS pci_priority,
    i.created_at,
    i.updated_at,
    i.started_at,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'antes'::evidence_phase) AS fotos_antes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'despues'::evidence_phase) AS fotos_despues,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'durante'::evidence_phase) AS fotos_durante,
    ( SELECT COALESCE(sum(w.quantity), 0::numeric) AS "coalesce"
           FROM work_entries w
          WHERE w.pci_item_id = i.id AND w.deleted_at IS NULL) AS metrado_registrado,
    i.reject_reason AS observacion,
    pc.status AS pci_status,
    a.code AS activity_code,
    i.foto_referencia_path,
    NOT (EXISTS ( SELECT 1
           FROM pci_cuadrilla_pausada z
          WHERE z.pci_id = i.pci_id AND z.crew_id = i.assigned_crew_id)) AS activo_para_cuadrilla
   FROM pci_items i
     JOIN pcis pc ON pc.id = i.pci_id
     LEFT JOIN road_sections s ON s.id = i.section_id
     LEFT JOIN activities_catalog a ON a.id = i.activity_id
     LEFT JOIN units u ON u.id = COALESCE(a.unit_id, i.unit_id)
     LEFT JOIN crews c ON c.id = i.assigned_crew_id
     LEFT JOIN profiles p ON p.id = i.assigned_to
  WHERE i.deleted_at IS NULL;
