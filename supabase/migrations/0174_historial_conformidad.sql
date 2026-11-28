-- ═══════════════════════════════════════════════════════════════════════
-- 0174 · Ronda 5 (TR-07): el historial del ítem explica la conformidad.
-- Cada revisión muestra su motivo (también la excepción de una
-- conformidad) y la fase; un ítem «Conforme COVINCA» sin evento de
-- conformidad (llegó así en la carga histórica) lo dice expresamente, con
-- la fase que falta, sin inventar autor ni motivo. No se cambia ningún
-- estado histórico.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pci_item_historial(p_item uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with item as (
    select i.* from public.pci_items i
     where i.id = p_item and public.is_member(i.service_id)
       and (i.publicacion_version > 0 or not public.es_visor(i.service_id))
  ), eventos as (
    select i.created_at cuando, 'creado' tipo,
           case when b.id is not null then 'Importado del Excel «' || coalesce(b.file_name, '') || '»' else 'Registrado' end detalle,
           coalesce(pb.full_name, pc.full_name) quien, 'SERVICON'::text entidad, null::int version
      from item i
      left join public.import_batches b on b.id = i.import_batch_id
      left join public.profiles pb on pb.id = b.created_by
      left join public.profiles pc on pc.id = i.created_by
    union all
    select r.cuando, 'asignado',
           case when r.crew_de is null then 'Asignado a ' || ca.name else 'Reasignado de ' || cd.name || ' a ' || coalesce(ca.name, 'sin cuadrilla') end
             || coalesce(' · motivo: ' || r.motivo, ''),
           pq.full_name, 'SERVICON', null
      from public.reasignaciones r join item i on i.id = r.registro_id
      left join public.crews cd on cd.id = r.crew_de left join public.crews ca on ca.id = r.crew_a
      left join public.profiles pq on pq.id = r.quien
    union all
    select w.created_at, 'avance',
           case when public.es_visor(i.service_id) then 'Registró atención' else
           format('Registró atención · metrado %s%s%s', trim(to_char(w.quantity, 'FM999999990.###')),
                  case when w.exceso is not null then format(' · supera lo solicitado (%s) en %s%s', trim(to_char(w.solicitado, 'FM999999990.###')),
                       trim(to_char(w.exceso, 'FM999999990.###')), coalesce(' · motivo: ' || w.exceso_motivo, '')) else '' end,
                  coalesce(' · ejecutó: ' || w.ejecutado_por, '')) end,
           pw.full_name, 'SERVICON', null
      from public.work_entries w join item i on i.id = w.pci_item_id
      left join public.profiles pw on pw.id = w.created_by
     where w.deleted_at is null and (not public.es_visor(i.service_id) or i.publicacion_version > 0)
    union all
    select e.created_at, 'foto',
           format('Foto %s%s', public.fase_legible(coalesce(e.phase::text, 'general')),
                  case when e.origen_captura is not null then ' · origen: ' || e.origen_captura else '' end),
           pe.full_name, 'SERVICON', e.publicada_version
      from public.evidences e join item i on i.id = e.pci_item_id
      left join public.profiles pe on pe.id = e.created_by
     where e.deleted_at is null and (e.publicada_version is not null or not public.es_visor(i.service_id))
    union all
    select v.cuando, 'revision',
           case v.resultado when 'conforme' then case v.nivel when 'covinca' then 'Conforme COVINCA' else 'Validó (SERVICON)' end
                  || coalesce(' · motivo/excepción: ' || nullif(v.motivo, ''), '')
                else 'Observó: ' || coalesce(v.motivo, '') end
             || coalesce(' · fase: ' || public.fase_legible(v.fase), ''),
           pv.full_name, v.entidad, v.version
      from public.pci_item_revisiones v join item i on i.id = v.pci_item_id
      left join public.profiles pv on pv.id = v.quien
    union all
    -- TR-07: conforme sin evento de conformidad registrado (carga histórica): se dice, no se inventa
    select coalesce(i.validated_at, greatest(i.created_at, i.closed_at)), 'conformidad',
           'Conforme COVINCA · no hay evento de conformidad registrado en SIGOV: el estado llegó con la carga histórica; no constan autor, versión ni motivo'
             || case when f.falta <> '' then ' · evidencia incompleta (falta ' || f.falta || '); no consta una excepción autorizada' else '' end,
           null, 'COVINCA', null
      from item i
      cross join lateral (
        select concat_ws(', ',
                 case when not exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'antes') then 'Antes' end,
                 case when not exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'durante') then 'Durante' end,
                 case when not exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'despues') then 'Después' end) falta
      ) f
     where i.status = 'validado'
       and not exists (select 1 from public.pci_item_revisiones v where v.pci_item_id = i.id and v.nivel = 'covinca' and v.resultado = 'conforme')
    union all
    select p.cuando, 'publicado', 'Publicó a COVINCA' || coalesce(' · ' || p.nota, ''), pp.full_name, 'SERVICON', p.version
      from public.pci_item_publicaciones p join item i on i.id = p.pci_item_id
      left join public.profiles pp on pp.id = p.quien
  )
  select coalesce(json_agg(json_build_object('cuando', cuando, 'tipo', tipo, 'detalle', detalle, 'quien', quien,
                                             'entidad', entidad, 'version', version) order by cuando), '[]'::json)
    from eventos where cuando is not null
$function$;
