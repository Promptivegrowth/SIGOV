-- ═══════════════════════════════════════════════════════════════════════════
-- 0130 · Evidencias: captura, carga y sincronización (4.º entregable, OBS 6)
--
-- La vista lleva de dónde vino cada foto (cámara SIGOV, galería, archivo
-- web), si tiene el sello SIGOV, la fecha original del archivo y cuándo se
-- cargó; la sincronización es `created_at` (cuando llegó a la nube).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_evidences with (security_invoker = true) as
 SELECT e.id,
    e.client_id,
    e.service_id,
    e.phase,
    e.storage_path,
    e.thumb_path,
    e.mime_type,
    e.size_bytes,
    e.width,
    e.height,
    e.lat,
    e.lng,
    e.accuracy_m,
    e.taken_at,
    e.sha256,
    e.watermarked,
    e.caption,
    e.created_at,
    e.created_by,
    p.full_name AS created_by_name,
    e.work_entry_id,
    e.pci_item_id,
        CASE
            WHEN e.work_entry_id IS NOT NULL THEN 'parte'::text
            WHEN e.pci_item_id IS NOT NULL THEN 'pci'::text
            ELSE 'suelta'::text
        END AS origen,
    COALESCE(wo.crew_id, pi.assigned_crew_id) AS crew_id,
    COALESCE(cwo.name, cpi.name) AS crew_name,
    COALESCE(awe.name, api.name) AS activity_name,
    COALESCE(swe.name, spi.name) AS section_name,
    COALESCE(swe.code, spi.code) AS section_code,
    COALESCE(e.section_id, we.section_id, pi.section_id) AS section_id,
    COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m) AS progresiva_m,
    COALESCE(wo.work_date, (COALESCE(e.stamped_at, e.taken_at) AT TIME ZONE 'America/Lima'::text)::date) AS work_date,
    pci.code AS pci_code,
    e.stamped_at,
    COALESCE(e.stamped_at, e.taken_at) AS fecha_sello,
    COALESCE(awe.id, api.id) AS activity_id,
    COALESCE(awe.code, api.code) AS activity_code,
    COALESCE(awe.carpeta_ns, api.carpeta_ns) AS activity_carpeta_ns,
    pi.pci_id,
    pi.item_number AS pci_item_number,
    pi.term_days AS pci_term_days,
    we.work_order_id,
    COALESCE(we.side::text, pi.side::text) AS side,
    COALESCE(cwo.numero, cpi.numero) AS crew_numero,
    COALESCE(cwo.sede, cpi.sede) AS crew_sede,
    e.altitude_m,
    e.device_model,
    sec.code AS sector_code,
    sec.folder AS sector_folder,
    COALESCE(cwo.code, cpi.code) AS crew_code,
    e.master_path,
    e.master_width,
    e.master_height,
    e.master_bytes,
    e.revision,
    e.revision_nota,
    e.revisada_at,
    e.cargada_at,
    e.origen_captura,
    e.sello_aplicado,
    e.fecha_original
   FROM evidences e
     LEFT JOIN work_entries we ON we.id = e.work_entry_id AND we.deleted_at IS NULL
     LEFT JOIN work_orders wo ON wo.id = we.work_order_id AND wo.deleted_at IS NULL
     LEFT JOIN pci_items pi ON pi.id = e.pci_item_id AND pi.deleted_at IS NULL
     LEFT JOIN pcis pci ON pci.id = pi.pci_id
     LEFT JOIN crews cwo ON cwo.id = wo.crew_id
     LEFT JOIN crews cpi ON cpi.id = pi.assigned_crew_id
     LEFT JOIN activities_catalog awe ON awe.id = we.activity_id
     LEFT JOIN activities_catalog api ON api.id = pi.activity_id
     LEFT JOIN road_sections swe ON swe.id = COALESCE(e.section_id, we.section_id)
     LEFT JOIN road_sections spi ON spi.id = pi.section_id
     LEFT JOIN profiles p ON p.id = e.created_by
     LEFT JOIN LATERAL sector_de(COALESCE(e.section_id, we.section_id, pi.section_id), COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m)) sec(id, service_id, section_id, code, folder, prog_start_m, prog_end_m, orden, created_at) ON sec.id IS NOT NULL
  WHERE e.deleted_at IS NULL;
