-- ═══════════════════════════════════════════════════════════════════════
-- 0125 · Quién ejecutó, a la vista (sigue a 0124)
--
-- v_work_entries lleva ejecutado_por (el jefe o el subjefe que usaba el
-- celular) y v_pci_items el ENCARGADO del control del PCI y quién registró
-- el ítem. Las columnas van al final: el resto de cada vista no cambia.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_work_entries with (security_invoker = true) as
SELECT we.id,
    we.work_order_id,
    we.service_id,
    we.plan_item_id,
    we.pci_item_id,
    wo.work_date,
    wo.status AS order_status,
    wo.crew_id,
    c.name AS crew_name,
    c.color AS crew_color,
    we.activity_id,
    a.name AS activity_name,
    a.category AS activity_category,
    a.color AS activity_color,
    we.section_id,
    s.name AS section_name,
    we.prog_start_m,
    we.prog_end_m,
    we.side,
    fmt_progresiva(we.prog_start_m) AS prog_start_txt,
    fmt_progresiva(we.prog_end_m) AS prog_end_txt,
    we.quantity,
    u.symbol AS unit_symbol,
    we.observation,
    we.started_at,
    we.finished_at,
    st_y((we.geom)::geometry) AS lat,
    st_x((we.geom)::geometry) AS lng,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.work_entry_id = we.id) AND (e.deleted_at IS NULL))) AS evidence_count,
    p.full_name AS created_by_name,
    we.created_at,
    a.code AS activity_code,
    a.numero_covinca AS activity_numero,
    we.origen,
    pci.code AS pci_code,
    pit.item_number AS pci_item_number,
    we.hora_inicio,
    we.hora_fin,
    we.personas,
    we.longitud_m,
    we.ancho_m,
    we.espesor_m,
    ( SELECT sd.code
           FROM sector_de(we.section_id, we.prog_start_m) sd(id, service_id, section_id, code, folder, prog_start_m, prog_end_m, orden, created_at)) AS sector_code,
    we.ejecutado_por
   FROM ((((((((work_entries we
     JOIN work_orders wo ON ((wo.id = we.work_order_id)))
     JOIN activities_catalog a ON ((a.id = we.activity_id)))
     JOIN road_sections s ON ((s.id = we.section_id)))
     LEFT JOIN crews c ON ((c.id = wo.crew_id)))
     LEFT JOIN units u ON ((u.id = we.unit_id)))
     LEFT JOIN profiles p ON ((p.id = we.created_by)))
     LEFT JOIN pci_items pit ON ((pit.id = we.pci_item_id)))
     LEFT JOIN pcis pci ON ((pci.id = pit.pci_id)))
  WHERE (we.deleted_at IS NULL);

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
    (i.due_date - hoy_peru()) AS days_left,
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
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL))) AS evidence_count,
    pc.code AS pci_code,
    pc.title AS pci_title,
    pc.priority AS pci_priority,
    i.created_at,
    i.updated_at,
    i.started_at,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'antes'::evidence_phase))) AS fotos_antes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'despues'::evidence_phase))) AS fotos_despues,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'durante'::evidence_phase))) AS fotos_durante,
    ( SELECT COALESCE(sum(w.quantity), (0)::numeric) AS "coalesce"
           FROM work_entries w
          WHERE ((w.pci_item_id = i.id) AND (w.deleted_at IS NULL))) AS metrado_registrado,
    i.reject_reason AS observacion,
    pc.status AS pci_status,
    a.code AS activity_code,
    i.foto_referencia_path,
    (NOT (EXISTS ( SELECT 1
           FROM pci_cuadrilla_pausada z
          WHERE ((z.pci_id = i.pci_id) AND (z.crew_id = i.assigned_crew_id))))) AS activo_para_cuadrilla,
    i.encargado,
    ( SELECT string_agg(DISTINCT w.ejecutado_por, ', ' ORDER BY w.ejecutado_por)
           FROM work_entries w
          WHERE ((w.pci_item_id = i.id) AND (w.deleted_at IS NULL) AND (w.ejecutado_por IS NOT NULL))) AS ejecutado_por
   FROM ((((((pci_items i
     JOIN pcis pc ON ((pc.id = i.pci_id)))
     LEFT JOIN road_sections s ON ((s.id = i.section_id)))
     LEFT JOIN activities_catalog a ON ((a.id = i.activity_id)))
     LEFT JOIN units u ON ((u.id = COALESCE(a.unit_id, i.unit_id))))
     LEFT JOIN crews c ON ((c.id = i.assigned_crew_id)))
     LEFT JOIN profiles p ON ((p.id = i.assigned_to)))
  WHERE (i.deleted_at IS NULL);
