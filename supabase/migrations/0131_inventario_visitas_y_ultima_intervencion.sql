-- ═══════════════════════════════════════════════════════════════════════════
-- 0131 · Inventario: visitas y última intervención (4.º entregable, OBS 10 y 11)
--
-- Visitas: días distintos en que alguien estuvo en el elemento (intervención
-- u observación con foto), no cada foto. Última visita: fecha y hora, estado,
-- comentario y quién, tomados del registro más reciente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_inventario with (security_invoker = true) as
 WITH intervenciones AS (
         SELECT asset_interventions.asset_id,
            max(asset_interventions.intervened_on) AS ultima,
            count(*) AS total
           FROM asset_interventions
          GROUP BY asset_interventions.asset_id
        ), dias_de_visita AS (
         -- Una visita es un día en el elemento, no una foto (OBS 10): cuentan
         -- las intervenciones y las fotos de campo, observadas o no
         SELECT x.asset_id, count(DISTINCT x.dia) AS visitas
           FROM ( SELECT ai.asset_id, ai.intervened_on AS dia FROM asset_interventions ai
                  UNION
                  SELECT e.asset_id, (COALESCE(e.stamped_at, e.taken_at, e.created_at) AT TIME ZONE 'America/Lima')::date
                    FROM evidences e
                   WHERE e.asset_id IS NOT NULL AND e.estado_activo IS NOT NULL AND e.work_entry_id IS NULL AND e.deleted_at IS NULL) x
          GROUP BY x.asset_id
        ), conteo_fotos AS (
         SELECT l.asset_id,
            count(*) AS fotos
           FROM evidence_links l
             JOIN evidences e ON e.id = l.evidence_id AND e.deleted_at IS NULL
          WHERE l.asset_id IS NOT NULL
          GROUP BY l.asset_id
        ), dos_fotos AS (
         SELECT v_asset_fotos.asset_id,
            max(v_asset_fotos.storage_path) FILTER (WHERE v_asset_fotos.orden = 1) AS foto_actual,
            max(v_asset_fotos.taken_at) FILTER (WHERE v_asset_fotos.orden = 1) AS fecha_actual,
            max(v_asset_fotos.storage_path) FILTER (WHERE v_asset_fotos.orden = 2) AS foto_anterior,
            max(v_asset_fotos.taken_at) FILTER (WHERE v_asset_fotos.orden = 2) AS fecha_anterior,
            max(v_asset_fotos.visita) FILTER (WHERE v_asset_fotos.orden = 1) - max(v_asset_fotos.visita) FILTER (WHERE v_asset_fotos.orden = 2) AS dias_entre
           FROM v_asset_fotos
          WHERE v_asset_fotos.orden <= 2
          GROUP BY v_asset_fotos.asset_id
        )
 SELECT a.id,
    a.service_id,
    a.client_id,
    a.code,
    a.name,
    a.type_id,
    t.code AS type_code,
    t.name AS type_name,
    t.category AS type_category,
    t.icon AS type_icon,
    t.color AS type_color,
    t.dias_verde,
    t.dias_ambar,
    a.section_id,
    s.name AS section_name,
    s.code AS section_code,
    a.progresiva_m,
    fmt_progresiva(a.progresiva_m) AS progresiva_txt,
    a.side,
    a.lat,
    a.lng,
    a.condition,
    a.install_year,
    a.attributes,
    a.notes,
    GREATEST(a.last_inspected_on, i.ultima) AS ultima_intervencion,
    COALESCE(i.total, 0::bigint) AS intervenciones,
    COALESCE(dv.visitas, 0::bigint) AS visitas,
    CURRENT_DATE - GREATEST(a.last_inspected_on, i.ultima) AS dias_sin_intervenir,
    asset_semaforo(GREATEST(a.last_inspected_on, i.ultima), t.dias_verde, t.dias_ambar) AS semaforo,
    COALESCE(cf.fotos, 0::bigint) AS fotos,
    f.foto_actual,
    f.fecha_actual AS foto_actual_fecha,
    f.foto_anterior,
    f.fecha_anterior AS foto_anterior_fecha,
    f.dias_entre AS dias_entre_fotos,
    a.progresiva_fin_m,
    a.observado,
    a.observacion,
    a.observado_at,
    s.numero AS section_numero,
    uv.at AS ultima_visita_at,
    uv.estado AS ultima_visita_estado,
    uv.comentario AS ultima_visita_comentario,
    pu.full_name AS ultima_visita_por,
    uv.con_hora AS ultima_visita_con_hora
   FROM road_assets a
     JOIN asset_types t ON t.id = a.type_id
     LEFT JOIN road_sections s ON s.id = a.section_id
     LEFT JOIN intervenciones i ON i.asset_id = a.id
     LEFT JOIN conteo_fotos cf ON cf.asset_id = a.id
     LEFT JOIN dos_fotos f ON f.asset_id = a.id
     LEFT JOIN dias_de_visita dv ON dv.asset_id = a.id
     -- La última visita con su hora, estado, comentario y quién (OBS 11)
     LEFT JOIN LATERAL ( SELECT y.at, y.estado, y.comentario, y.por, y.con_hora
           FROM ( SELECT COALESCE(e.stamped_at, e.taken_at, e.created_at) AS at, e.estado_activo AS estado,
                         e.caption AS comentario, e.created_by AS por, true AS con_hora
                    FROM evidences e
                   WHERE e.asset_id = a.id AND e.estado_activo IS NOT NULL AND e.work_entry_id IS NULL AND e.deleted_at IS NULL
                  UNION ALL
                  -- Sin foto: vale la fecha de la intervención; la hora, solo si se registró ese mismo día
                  SELECT CASE WHEN (ai.created_at AT TIME ZONE 'America/Lima')::date = ai.intervened_on THEN ai.created_at
                              ELSE ai.intervened_on::timestamp AT TIME ZONE 'America/Lima' END,
                         'ok'::text, COALESCE(ai.notes, ai.action), ai.created_by,
                         (ai.created_at AT TIME ZONE 'America/Lima')::date = ai.intervened_on
                    FROM asset_interventions ai
                   WHERE ai.asset_id = a.id AND ai.evidence_id IS NULL) y
          ORDER BY y.at DESC
         LIMIT 1) uv ON true
     LEFT JOIN profiles pu ON pu.id = uv.por
  WHERE a.deleted_at IS NULL;

-- La app recibe la última visita con el inventario
CREATE OR REPLACE FUNCTION public.inventario_para_campo(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(

    'id', v.id,

    'code', v.code,

    'name', v.name,

    'type_code', v.type_code,

    'type_name', v.type_name,

    'type_category', v.type_category,

    'type_color', v.type_color,

    'section_id', v.section_id,

    'section_name', v.section_name,

    'progresiva_m', v.progresiva_m,

    'progresiva_fin_m', v.progresiva_fin_m,

    'progresiva_txt', v.progresiva_txt,

    'side', v.side,

    'lat', v.lat,

    'lng', v.lng,

    'condition', v.condition,

    'semaforo', v.semaforo,

    'dias_sin_intervenir', v.dias_sin_intervenir,

    'ultima_intervencion', v.ultima_intervencion,

    'intervenciones', v.intervenciones,

    'visitas', v.visitas,

    'fotos', v.fotos,

    'foto_actual', v.foto_actual,

    'foto_actual_fecha', v.foto_actual_fecha,

    'foto_anterior', v.foto_anterior,

    'foto_anterior_fecha', v.foto_anterior_fecha,

    'dias_entre_fotos', v.dias_entre_fotos,

    'section_code', v.section_code,

    'section_numero', v.section_numero,

    'type_icon', v.type_icon,

    'observado', v.observado,

    'observacion', v.observacion,
    -- La última visita, con su hora, estado, comentario y quién (OBS 11)
    'ultima_visita_at', v.ultima_visita_at,
    'ultima_visita_estado', v.ultima_visita_estado,
    'ultima_visita_comentario', v.ultima_visita_comentario,
    'ultima_visita_por', v.ultima_visita_por,
    'ultima_visita_con_hora', v.ultima_visita_con_hora,

    'atributos', coalesce(v.attributes, '{}'::jsonb)

                   - 'coordenada_excel' - 'coordenada_final' - 'inventario'

  )) order by v.progresiva_m), '[]'::jsonb)

  from public.v_inventario v

  where public.puede_leer_servicio(p_service_id)

    and v.service_id = p_service_id

    and v.lat is not null and v.lng is not null

$function$;
