-- ═══════════════════════════════════════════════════════════════════════
-- 0105 · Inventario vial: tramos 1 a 4, un color por componente y la foto
-- de intervención con su estado (videos y bocetos de Elvis del 14/10/2026)
--
-- · Tramo 1, 2, 3 y 4 en vez de AQP-01, AQP-02, TAC-01 y TAC-02 («esa es la
--   codificación de la ficha; mejor tramo 1, tramo 2…»).
-- · Cada componente con su color, para distinguirlos en el mapa («la paleta
--   de colores no distingue muy bien»): los del boceto (alcantarilla morada,
--   drenaje azul, muro naranja, señales verde, guardavías rojo, puentes
--   turquesa) y los demás, distintos entre sí.
-- · La cuadrilla registra una foto de intervención sobre el elemento, con
--   comentario y semáforo: OK (verde) cuenta como intervención y reinicia su
--   plazo; Observado (rojo) lo marca en el mapa hasta que otra foto lo deje
--   OK. La foto base del inventario nunca se reemplaza.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Tramo 1 a 4 ─────────────────────────────────────────────────────
alter table public.road_sections add column if not exists numero smallint;
comment on column public.road_sections.numero is 'Tramo 1, 2, 3, 4… como lo nombra la cuadrilla (subtramo del contrato)';
update public.road_sections s set numero = m.n
  from (values ('AQP-01', 1), ('AQP-02', 2), ('TAC-01', 3), ('TAC-02', 4)) as m(code, n)
 where s.code = m.code and s.service_id = '22222222-2222-4222-8222-222222222221';

-- ─── Un color por componente ─────────────────────────────────────────
update public.asset_types t set color = m.color
  from (values
    ('ALC', '#7C3AED'), ('DRL', '#2563EB'), ('MUR', '#EA580C'), ('SEV', '#16A34A'),
    ('GUA', '#DC2626'), ('PUE', '#0D9488'), ('SEH', '#CA8A04'), ('BER', '#64748B'),
    ('CAL', '#1E293B'), ('PDL', '#92400E'), ('HIT', '#DB2777'), ('RDV', '#C026D3'),
    ('RES', '#0891B2'), ('BAR', '#4F46E5'), ('TUN', '#57534E')
  ) as m(code, color)
 where t.code = m.code and t.service_id is null;

-- ─── La foto de intervención ─────────────────────────────────────────
alter table public.evidences add column if not exists estado_activo text
  check (estado_activo in ('ok', 'observado'));
comment on column public.evidences.estado_activo is 'Foto de intervención en un elemento del inventario: ok u observado';

alter table public.road_assets add column if not exists observado boolean not null default false;
alter table public.road_assets add column if not exists observacion text;
alter table public.road_assets add column if not exists observado_at timestamptz;
comment on column public.road_assets.observado is 'La última foto de campo lo dejó observado (por ejemplo, panel doblado)';

create or replace function public.t_ev_foto_de_inventario()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fecha date := (coalesce(new.stamped_at, new.taken_at, now()) at time zone 'America/Lima')::date;
  v_cuadrilla uuid;
begin
  if new.asset_id is null or new.estado_activo is null or new.work_entry_id is not null then
    return null;
  end if;

  -- La foto queda en el historial del elemento; la base no se toca
  insert into public.evidence_links (evidence_id, service_id, asset_id, created_by, note)
  select new.id, new.service_id, new.asset_id, new.created_by,
         case when new.estado_activo = 'ok' then 'Intervención en campo · OK' else 'Observación en campo' end
  where not exists (select 1 from public.evidence_links l where l.evidence_id = new.id and l.asset_id = new.asset_id);

  if new.estado_activo = 'ok' then
    select id into v_cuadrilla from public.crews
     where service_id = new.service_id and leader_id = new.created_by and deleted_at is null limit 1;
    insert into public.asset_interventions (service_id, asset_id, intervened_on, action, notes, crew_id, created_by)
    values (new.service_id, new.asset_id, v_fecha, 'Intervención con foto', new.caption, v_cuadrilla, new.created_by);
    update public.road_assets
       set last_inspected_on = greatest(coalesce(last_inspected_on, v_fecha), v_fecha),
           observado = false, observacion = null, observado_at = null, updated_at = now()
     where id = new.asset_id;
  else
    update public.road_assets
       set observado = true, observacion = coalesce(nullif(trim(new.caption), ''), 'Observado en campo'),
           observado_at = now(), updated_at = now()
     where id = new.asset_id;
  end if;
  return null;
end $$;

drop trigger if exists t_ev_foto_de_inventario on public.evidences;
create trigger t_ev_foto_de_inventario after insert on public.evidences
  for each row execute function public.t_ev_foto_de_inventario();

-- ─── Las vistas llevan si está observado y el número de tramo ────────
create or replace view public.v_inventario with (security_invoker = true) as
WITH intervenciones AS (
         SELECT asset_interventions.asset_id,
            max(asset_interventions.intervened_on) AS ultima,
            count(*) AS total,
            count(DISTINCT asset_interventions.intervened_on) AS visitas
           FROM asset_interventions
          GROUP BY asset_interventions.asset_id
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
    COALESCE(i.visitas, 0::bigint) AS visitas,
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
    s.numero AS section_numero
   FROM road_assets a
     JOIN asset_types t ON t.id = a.type_id
     LEFT JOIN road_sections s ON s.id = a.section_id
     LEFT JOIN intervenciones i ON i.asset_id = a.id
     LEFT JOIN conteo_fotos cf ON cf.asset_id = a.id
     LEFT JOIN dos_fotos f ON f.asset_id = a.id
  WHERE a.deleted_at IS NULL;

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
    'atributos', coalesce(v.attributes, '{}'::jsonb)
                   - 'coordenada_excel' - 'coordenada_final' - 'inventario'
  )) order by v.progresiva_m), '[]'::jsonb)
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
$function$;

-- ─── El mapa web también sabe si el elemento está observado ──────────
do $$
declare d text;
begin
  d := pg_get_functiondef('public.assets_geojson(uuid, text[], text[], text[], uuid)'::regprocedure);
  if position('''observado''' in d) = 0 then
    d := replace(d, '''intervenciones'', v.intervenciones', '''intervenciones'', v.intervenciones,
          ''observado'', v.observado, ''observacion'', v.observacion, ''section_numero'', v.section_numero');
    if position('''observado''' in d) = 0 then raise exception 'assets_geojson: no se pudo ajustar'; end if;
    execute d;
  end if;
end $$;
