-- ═══════════════════════════════════════════════════════════════════════
-- 0089 · El original de cada foto (OBS-23)
--
-- COVINCA exige las fotos en JPG de 4080 × 3072. Con el plan gratuito de
-- Supabase (1 GB, ya al 92 %) el celular guardaba solo un WebP de 1600 px y
-- borraba la toma: exportar a 4080 × 3072 era ampliar una foto chica.
-- Con el plan Pro cada foto conserva además su original:
--
-- · el WebP liviano sigue siendo lo que se ve y lo que sube primero;
-- · el original JPG 4080 × 3072 (sellado y con EXIF) sube aparte, por
--   defecto solo con Wi-Fi, y se registra con fijar_original_evidencia();
-- · la exportación COVINCA entrega el original tal cual, sin recomprimir.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.evidences
  add column if not exists master_path   text,
  add column if not exists master_width  integer,
  add column if not exists master_height integer,
  add column if not exists master_bytes  bigint,
  add column if not exists master_sha256 text,
  add column if not exists master_uploaded_at timestamptz;

-- ─── Registrar el original, una vez subido el archivo ─────────────────
create or replace function public.fijar_original_evidencia(
  p_client_id uuid, p_path text, p_width integer, p_height integer, p_bytes bigint, p_sha256 text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.evidences;
begin
  select * into e from public.evidences where client_id = p_client_id;
  if not found then
    raise exception 'SIGOV: la foto todavía no está en la nube';
  end if;
  if e.created_by is distinct from auth.uid() and not public.can_manage(e.service_id) then
    raise exception 'SIGOV: solo quien tomó la foto registra su original' using errcode = '42501';
  end if;
  if p_path is null or p_path not like e.service_id::text || '/%' or lower(p_path) not like '%.jpg' then
    raise exception 'SIGOV: la ruta del original no es válida';
  end if;
  update public.evidences
     set master_path = p_path, master_width = p_width, master_height = p_height,
         master_bytes = p_bytes, master_sha256 = p_sha256, master_uploaded_at = now()
   where id = e.id;
end $$;

grant execute on function public.fijar_original_evidencia(uuid, text, integer, integer, bigint, text) to authenticated;
revoke execute on function public.fijar_original_evidencia(uuid, text, integer, integer, bigint, text) from anon;

-- ─── La vista, con el original ─────────────────────────────────────────
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
            WHEN (e.work_entry_id IS NOT NULL) THEN 'parte'::text
            WHEN (e.pci_item_id IS NOT NULL) THEN 'pci'::text
            ELSE 'suelta'::text
        END AS origen,
    COALESCE(wo.crew_id, pi.assigned_crew_id) AS crew_id,
    COALESCE(cwo.name, cpi.name) AS crew_name,
    COALESCE(awe.name, api.name) AS activity_name,
    COALESCE(swe.name, spi.name) AS section_name,
    COALESCE(swe.code, spi.code) AS section_code,
    COALESCE(e.section_id, we.section_id, pi.section_id) AS section_id,
    COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m) AS progresiva_m,
    COALESCE(wo.work_date, ((COALESCE(e.stamped_at, e.taken_at) AT TIME ZONE 'America/Lima'::text))::date) AS work_date,
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
    COALESCE((we.side)::text, (pi.side)::text) AS side,
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
    e.master_bytes
   FROM ((((((((((((evidences e
     LEFT JOIN work_entries we ON (((we.id = e.work_entry_id) AND (we.deleted_at IS NULL))))
     LEFT JOIN work_orders wo ON (((wo.id = we.work_order_id) AND (wo.deleted_at IS NULL))))
     LEFT JOIN pci_items pi ON (((pi.id = e.pci_item_id) AND (pi.deleted_at IS NULL))))
     LEFT JOIN pcis pci ON ((pci.id = pi.pci_id)))
     LEFT JOIN crews cwo ON ((cwo.id = wo.crew_id)))
     LEFT JOIN crews cpi ON ((cpi.id = pi.assigned_crew_id)))
     LEFT JOIN activities_catalog awe ON ((awe.id = we.activity_id)))
     LEFT JOIN activities_catalog api ON ((api.id = pi.activity_id)))
     LEFT JOIN road_sections swe ON ((swe.id = COALESCE(e.section_id, we.section_id))))
     LEFT JOIN road_sections spi ON ((spi.id = pi.section_id)))
     LEFT JOIN profiles p ON ((p.id = e.created_by)))
     LEFT JOIN LATERAL sector_de(COALESCE(e.section_id, we.section_id, pi.section_id), COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m)) sec(id, service_id, section_id, code, folder, prog_start_m, prog_end_m, orden, created_at) ON ((sec.id IS NOT NULL)))
  WHERE (e.deleted_at IS NULL);
