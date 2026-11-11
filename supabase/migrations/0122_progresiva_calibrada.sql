-- ═══════════════════════════════════════════════════════════════════════
-- 0122 · La progresiva calibrada con los hitos kilométricos
--
-- Elvis (respuesta 7, 11/11) pide precisión: que el GPS avise a ±10 m de
-- la progresiva escrita. Hasta ahora la progresiva se repartía pareja a lo
-- largo del trazo, del inicio al fin del tramo, y los kilómetros de la vía
-- no son parejos: comparado con el Inventario Vial 2024, el punto calculado
-- quedaba a 157 m de su coordenada de campo (mediana; 514 m en AQP-02).
-- Con esa base un aviso a 10 m saltaría siempre.
--
-- Los 447 hitos del inventario dicen dónde cae cada kilómetro. Entre dos
-- hitos la progresiva se reparte según su posición real sobre el trazo, y
-- el error mediano baja a 10 m (90 % a menos de 46 m, contando lo que el
-- elemento está al costado de la vía).
--
-- road_sections.calibracion guarda los puntos [progresiva, fracción] del
-- tramo; la app los baja con el tramo y calcula igual sin señal.
--
-- Las distancias pasan a ser ajustes del contrato (ajustes_del_servicio →
-- ubicacion), con valores más exigentes: aviso de GPS a 30 m y reubicación
-- en la vía a 50 m (antes 2 km, 150 m y 300 m).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.road_sections add column if not exists calibracion jsonb;
comment on column public.road_sections.calibracion is
  'Puntos [progresiva_m, fracción del trazo] de los hitos kilométricos, del inicio al fin del tramo; null = reparto parejo';

-- ─── Progresiva → fracción del trazo, y al revés ─────────────────────────
create or replace function public.fraccion_calibrada(p_cal jsonb, p_ini numeric, p_fin numeric, p_prog numeric)
returns double precision
language plpgsql
immutable
as $$
declare
  n integer := coalesce(jsonb_array_length(p_cal), 0);
  lo integer := 0;
  hi integer;
  m integer;
  pa numeric; pb numeric;
  fa float8; fb float8;
begin
  if p_prog is null then return null; end if;
  -- Sin calibración, o fuera de sus extremos: reparto parejo
  if n < 2 or p_prog <= (p_cal->0->>0)::numeric or p_prog >= (p_cal->(n - 1)->>0)::numeric then
    return least(1.0, greatest(0.0, ((p_prog - p_ini) / nullif(p_fin - p_ini, 0))::float8));
  end if;
  -- El último punto con progresiva <= p_prog (búsqueda binaria)
  hi := n - 1;
  while hi - lo > 1 loop
    m := (lo + hi) / 2;
    if (p_cal->m->>0)::numeric <= p_prog then lo := m; else hi := m; end if;
  end loop;
  pa := (p_cal->lo->>0)::numeric; fa := (p_cal->lo->>1)::float8;
  pb := (p_cal->hi->>0)::numeric; fb := (p_cal->hi->>1)::float8;
  return least(1.0, greatest(0.0, fa + (fb - fa) * ((p_prog - pa) / nullif(pb - pa, 0))::float8));
end $$;

create or replace function public.progresiva_calibrada(p_cal jsonb, p_ini numeric, p_fin numeric, p_frac double precision)
returns numeric
language plpgsql
immutable
as $$
declare
  n integer := coalesce(jsonb_array_length(p_cal), 0);
  lo integer := 0;
  hi integer;
  m integer;
  pa numeric; pb numeric;
  fa float8; fb float8;
begin
  if p_frac is null then return null; end if;
  if n < 2 or p_frac <= (p_cal->0->>1)::float8 or p_frac >= (p_cal->(n - 1)->>1)::float8 then
    return p_ini + (p_fin - p_ini) * p_frac::numeric;
  end if;
  hi := n - 1;
  while hi - lo > 1 loop
    m := (lo + hi) / 2;
    if (p_cal->m->>1)::float8 <= p_frac then lo := m; else hi := m; end if;
  end loop;
  pa := (p_cal->lo->>0)::numeric; fa := (p_cal->lo->>1)::float8;
  pb := (p_cal->hi->>0)::numeric; fb := (p_cal->hi->>1)::float8;
  return pa + (pb - pa) * ((p_frac - fa) / nullif(fb - fa, 0))::numeric;
end $$;

-- ─── La calibración de un tramo, desde sus hitos ─────────────────────────
-- Entra un hito si está a menos de 100 m de la vía, tiene coordenada de
-- campo y su kilómetro no deforma el tramo (entre el hito anterior y este,
-- el trazo mide entre la mitad y el doble de lo que dicen las progresivas).
create or replace function public.calibrar_tramo(p_section_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  h record;
  v_cal jsonb;
  v_p numeric;
  v_f float8;
  v_largo float8;
  v_escala float8;
  n integer := 0;
begin
  select * into s from public.road_sections where id = p_section_id;
  if s.id is null or s.geom is null or s.prog_end_m <= s.prog_start_m then
    update public.road_sections set calibracion = null where id = p_section_id and calibracion is not null;
    return 0;
  end if;
  v_largo := extensions.ST_Length(s.geom::extensions.geography);
  v_cal := jsonb_build_array(jsonb_build_array(s.prog_start_m, 0.0));
  v_p := s.prog_start_m;
  v_f := 0.0;
  for h in
    select x.prog, extensions.ST_LineLocatePoint(s.geom, x.pt) frac
      from (select a.progresiva_m prog,
                   extensions.ST_SetSRID(extensions.ST_MakePoint(coalesce(a.lng_inventario, a.lng), coalesce(a.lat_inventario, a.lat)), 4326) pt
              from public.road_assets a
              join public.asset_types t on t.id = a.type_id
             where a.section_id = s.id and a.deleted_at is null and t.code = 'HIT'
               and a.lat is not null and a.progresiva_m > s.prog_start_m and a.progresiva_m < s.prog_end_m
               -- ubicado por su progresiva, sin coordenada propia: no enseña nada
               and not (coalesce(a.attributes->>'ubicacion', '') = 'progresiva' and a.lat_inventario is null)) x
     where extensions.ST_Distance(s.geom::extensions.geography, x.pt::extensions.geography) <= 100
     order by x.prog
  loop
    if h.prog <= v_p or h.frac <= v_f then continue; end if;
    v_escala := (h.frac - v_f) * v_largo / (h.prog - v_p)::float8;
    if v_escala between 0.5 and 2.0 then
      v_cal := v_cal || jsonb_build_array(jsonb_build_array(h.prog, h.frac));
      v_p := h.prog;
      v_f := h.frac;
      n := n + 1;
    end if;
  end loop;
  v_cal := v_cal || jsonb_build_array(jsonb_build_array(s.prog_end_m, 1.0));
  update public.road_sections set calibracion = case when n > 0 then v_cal end where id = s.id;
  return n;
end $$;

-- Se recalibra sola cuando cambia el trazo del tramo o uno de sus hitos
create or replace function public.t_tramo_recalibrar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.calibrar_tramo(new.id);
  return null;
end $$;

drop trigger if exists t_tramo_recalibrar on public.road_sections;
create trigger t_tramo_recalibrar after insert or update of geom, prog_start_m, prog_end_m on public.road_sections
  for each row execute function public.t_tramo_recalibrar();

create or replace function public.t_hito_recalibrar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hit uuid := (select id from public.asset_types where code = 'HIT' limit 1);
begin
  -- El tramo de donde sale (o donde cambió) el hito
  if tg_op <> 'INSERT' and old.type_id = v_hit and old.section_id is not null
     and (tg_op = 'DELETE'
          or new.type_id is distinct from old.type_id or new.section_id is distinct from old.section_id
          or new.progresiva_m is distinct from old.progresiva_m or new.lat is distinct from old.lat
          or new.lng is distinct from old.lng or new.deleted_at is distinct from old.deleted_at) then
    perform public.calibrar_tramo(old.section_id);
  end if;
  -- El tramo adonde llega
  if tg_op <> 'DELETE' and new.type_id = v_hit and new.section_id is not null
     and (tg_op = 'INSERT' or new.section_id is distinct from old.section_id or new.type_id is distinct from old.type_id) then
    perform public.calibrar_tramo(new.section_id);
  end if;
  return null;
end $$;

drop trigger if exists t_hito_recalibrar on public.road_assets;
create trigger t_hito_recalibrar after insert or update or delete on public.road_assets
  for each row execute function public.t_hito_recalibrar();

-- ─── Las distancias, como ajustes del contrato ───────────────────────────
create or replace function public.ajuste_de_ubicacion(p_service_id uuid, p_clave text, p_omision numeric)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select (s.settings->'ubicacion'->>p_clave)::numeric from public.services s where s.id = p_service_id), p_omision)
$$;

create or replace function public.ajustes_del_servicio(p_service_id uuid)
returns json
language sql
stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Qué se imprime sobre la fotografía. Fecha y hora van siempre.
    'sello', (jsonb_build_object(
      'activo',     true,
      'fecha',      true,
      'hora',       true,
      'geo',        false,
      'precision',  false,
      'progresiva', false,
      'tramo',      false,
      'cuadrilla',  false,
      'actividad',  false,
      'pci',        false,
      'marca',      false
    ) || coalesce(s.settings->'sello', '{}'::jsonb))
      || jsonb_build_object('fecha', true, 'hora', true),

    'caja', '{}'::jsonb || coalesce(s.settings->'caja', '{}'::jsonb),

    'alertas', jsonb_build_object(
      'dias_aviso_vencimiento', 30,
      'dias_aviso_pci', 2
    ) || coalesce(s.settings->'alertas', '{}'::jsonb),

    -- Los plazos que admite el contrato y la tolerancia antes de la alerta crítica
    'pci', jsonb_build_object(
      'plazos', jsonb_build_array(1, 2, 3, 7, 14),
      'tolerancia', 1
    ) || coalesce(s.settings->'pci', '{}'::jsonb),

    -- Cuánto puede separarse un registro de su progresiva (metros)
    'ubicacion', jsonb_build_object(
      'aviso_gps_m', 30,
      'reubicar_activo_m', 50,
      'reubicar_avance_m', 50
    ) || coalesce(s.settings->'ubicacion', '{}'::jsonb)
  )::json
  from public.services s
  where s.id = p_service_id and s.deleted_at is null
$$;

-- ─── Lo que convierte progresivas, ahora calibrado ───────────────────────
create or replace function public.progresiva_from_point(p_section_id uuid, p_lng double precision, p_lat double precision)
returns numeric
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select case
    when s.geom is null then null
    else public.progresiva_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m,
           extensions.ST_LineLocatePoint(s.geom, extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)))
  end
  from public.road_sections s where s.id = p_section_id
$$;

create or replace function public.progresiva_con_distancia(p_section_id uuid, p_lng double precision, p_lat double precision)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select case
    when s.geom is null then
      jsonb_build_object('progresiva_m', null, 'distancia_m', null, 'sin_trazo', true)
    else jsonb_build_object(
      'progresiva_m', round(public.progresiva_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m,
        extensions.ST_LineLocatePoint(s.geom, extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)))),
      'distancia_m', round(
        extensions.ST_Distance(
          s.geom::extensions.geography,
          extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
        )
      ),
      'sin_trazo', false
    )
  end
  from public.road_sections s
  where s.id = p_section_id and s.deleted_at is null
$$;

create or replace function public.t_activo_sobre_la_via()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  p extensions.geometry;
  v_dist float8;
begin
  if new.lat is null or new.lng is null or new.progresiva_m is null or new.section_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.lat is not distinct from old.lat and new.lng is not distinct from old.lng
     and new.progresiva_m is not distinct from old.progresiva_m and new.section_id is not distinct from old.section_id then
    return new;
  end if;
  select * into s from public.road_sections where id = new.section_id;
  if s.geom is null or s.prog_end_m <= s.prog_start_m then return new; end if;
  v_dist := extensions.ST_Distance(
       extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326)::extensions.geography,
       s.geom::extensions.geography);
  if v_dist <= public.ajuste_de_ubicacion(new.service_id, 'reubicar_activo_m', 50) then
    return new;
  end if;
  p := extensions.ST_LineInterpolatePoint(s.geom,
         public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, new.progresiva_m));
  new.lat_inventario := coalesce(new.lat_inventario, new.lat);
  new.lng_inventario := coalesce(new.lng_inventario, new.lng);
  new.lat := extensions.ST_Y(p);
  new.lng := extensions.ST_X(p);
  new.geom := extensions.ST_SetSRID(p, 4326);
  new.attributes := coalesce(new.attributes, '{}'::jsonb)
    || jsonb_build_object('ubicacion', 'progresiva', 'motivo_ubicacion', format('a %s m de la vía', round(v_dist)));
  return new;
end $$;

create or replace function public.work_entry_geom()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  v_lejos boolean := false;
begin
  select * into s from public.road_sections where id = new.section_id;

  -- Lo que midió el GPS manda, mientras caiga sobre la vía
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
    if s.geom is not null and new.prog_start_m is not null then
      v_lejos := extensions.ST_Distance(new.geom::extensions.geography, s.geom::extensions.geography)
                 > public.ajuste_de_ubicacion(new.service_id, 'reubicar_avance_m', 50);
    end if;
    if not v_lejos then return new; end if;
    new.geom := null;
  end if;

  -- Sin lectura, o lejos del corredor: por la progresiva declarada
  if new.geom is null and s.geom is not null and new.prog_start_m is not null and s.prog_end_m > s.prog_start_m then
    new.geom := extensions.ST_LineInterpolatePoint(s.geom, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m,
                  (coalesce(new.prog_end_m, new.prog_start_m) + new.prog_start_m) / 2.0));
  end if;

  return new;
end $$;

create or replace function public.t_observacion_ubicar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  otro public.road_sections;
  p extensions.geometry;
begin
  if new.progresiva_m is not null then
    select * into s from public.road_sections where id = new.section_id;
    -- El tramo que no contiene la progresiva no es el tramo
    if s.id is null or new.progresiva_m < s.prog_start_m or new.progresiva_m > s.prog_end_m then
      select * into otro from public.road_sections
       where service_id = new.service_id and deleted_at is null
         and new.progresiva_m between prog_start_m and prog_end_m
       order by (geom is null), code
       limit 1;
      if otro.id is not null then
        new.section_id := otro.id;
        s := otro;
      end if;
    end if;
  end if;

  -- La cuadrilla escribe el km; el mapa lo ubica. Sin progresiva vale el
  -- punto que mandó el teléfono.
  if new.progresiva_m is not null and (
       tg_op = 'INSERT'
       or new.progresiva_m is distinct from old.progresiva_m
       or new.section_id is distinct from old.section_id
       or new.lat is null) then
    if s.id is not null and s.geom is not null and s.prog_end_m > s.prog_start_m then
      p := extensions.ST_LineInterpolatePoint(s.geom,
             public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, new.progresiva_m));
      new.lat := extensions.ST_Y(p);
      new.lng := extensions.ST_X(p);
    end if;
  end if;
  if new.lat is null and new.gps_lat is not null then
    new.lat := new.gps_lat;
    new.lng := new.gps_lng;
  end if;

  if new.estado = 'atendida' and (tg_op = 'INSERT' or old.estado <> 'atendida') then
    new.atendida_at := now();
    new.atendida_por := auth.uid();
  end if;
  if new.estado = 'programada' and new.programada_on is null then
    new.programada_on := (now() at time zone 'America/Lima')::date;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.pci_geojson(p_service_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', extensions.ST_AsGeoJSON(
          extensions.ST_LineInterpolatePoint(
            s.geom,
            least(0.999, greatest(0.001,
              public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_start_m)))
          ))::jsonb,
        'properties', jsonb_build_object(
          'id', i.id, 'pci_id', i.pci_id, 'pci_code', p.code,
          'item', i.item_number,
          'descripcion', left(i.description, 160),
          'semaforo', public.pci_item_semaforo(i.due_date, i.term_days, i.status),
          'status', i.status, 'due_date', i.due_date,
          'days_left', (i.due_date - current_date),
          'priority', p.priority,
          'section', s.name,
          'progresiva', public.fmt_progresiva(i.prog_start_m),
          -- Más de 20 m entre progresivas: un tramo, no un punto (Elvis, 26/10)
          'linea', case when i.prog_end_m is not null and i.prog_end_m - i.prog_start_m > 20 then
            extensions.ST_AsGeoJSON(extensions.ST_LineSubstring(
              s.geom,
              least(0.999, greatest(0.0, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_start_m))),
              least(1.0, greatest(0.001, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, i.prog_end_m)))
            ))::jsonb end
        )
      )
    ), '[]'::jsonb)
  )
  from public.pci_items i
  join public.pcis p on p.id = i.pci_id
  join public.road_sections s on s.id = i.section_id
  where i.service_id = p_service_id
    and i.deleted_at is null
    and s.geom is not null
    and i.prog_start_m is not null
$$;

-- ─── Calibrar los tramos y volver a ubicar lo que se ubicó sin calibrar ──
select public.calibrar_tramo(id) from public.road_sections where deleted_at is null;

-- Sin disparar auditoría ni recálculos de avance: solo cambian coordenadas
set session_replication_role = replica;

-- Elementos que ya estaban por su progresiva, al punto calibrado
update public.road_assets a
   set lat = extensions.ST_Y(x.p), lng = extensions.ST_X(x.p), geom = extensions.ST_SetSRID(x.p, 4326)
  from (select a2.id, extensions.ST_LineInterpolatePoint(s.geom,
               public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, a2.progresiva_m)) p
          from public.road_assets a2 join public.road_sections s on s.id = a2.section_id
         where a2.deleted_at is null and a2.attributes->>'ubicacion' = 'progresiva'
           and a2.progresiva_m is not null and s.geom is not null and s.prog_end_m > s.prog_start_m) x
 where a.id = x.id;

-- Elementos con coordenada de campo a más de 50 m de la vía (antes 150 m)
update public.road_assets a
   set lat_inventario = coalesce(a.lat_inventario, a.lat), lng_inventario = coalesce(a.lng_inventario, a.lng),
       lat = extensions.ST_Y(x.p), lng = extensions.ST_X(x.p), geom = extensions.ST_SetSRID(x.p, 4326),
       attributes = coalesce(a.attributes, '{}'::jsonb)
         || jsonb_build_object('ubicacion', 'progresiva', 'motivo_ubicacion', format('a %s m de la vía', round(x.dist)))
  from (select a2.id, x2.dist, extensions.ST_LineInterpolatePoint(s.geom,
               public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, a2.progresiva_m)) p
          from public.road_assets a2 join public.road_sections s on s.id = a2.section_id
          cross join lateral (select extensions.ST_Distance(s.geom::extensions.geography,
                   extensions.ST_SetSRID(extensions.ST_MakePoint(a2.lng, a2.lat), 4326)::extensions.geography) dist) x2
         where a2.deleted_at is null and coalesce(a2.attributes->>'ubicacion', '') <> 'progresiva'
           and a2.lat is not null and a2.progresiva_m is not null and s.geom is not null and s.prog_end_m > s.prog_start_m
           and x2.dist > public.ajuste_de_ubicacion(a2.service_id, 'reubicar_activo_m', 50)) x
 where a.id = x.id;

-- Observaciones de campo, en el punto calibrado de su progresiva
update public.observaciones_campo o
   set lat = extensions.ST_Y(x.p), lng = extensions.ST_X(x.p)
  from (select o2.id, extensions.ST_LineInterpolatePoint(s.geom,
               public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m, o2.progresiva_m)) p
          from public.observaciones_campo o2 join public.road_sections s on s.id = o2.section_id
         where o2.progresiva_m is not null and s.geom is not null and s.prog_end_m > s.prog_start_m) x
 where o.id = x.id;

-- Avances sin GPS o con el GPS lejos de la vía
update public.work_entries w
   set geom = x.p
  from (select w2.id, extensions.ST_LineInterpolatePoint(s.geom, public.fraccion_calibrada(s.calibracion, s.prog_start_m, s.prog_end_m,
                 (coalesce(w2.prog_end_m, w2.prog_start_m) + w2.prog_start_m) / 2.0)) p
          from public.work_entries w2 join public.road_sections s on s.id = w2.section_id
         where w2.prog_start_m is not null and s.geom is not null and s.prog_end_m > s.prog_start_m
           and (w2.lat is null or w2.lng is null
                or extensions.ST_Distance(s.geom::extensions.geography,
                     extensions.ST_SetSRID(extensions.ST_MakePoint(w2.lng, w2.lat), 4326)::extensions.geography)
                   > public.ajuste_de_ubicacion(w2.service_id, 'reubicar_avance_m', 50))) x
 where w.id = x.id;

set session_replication_role = origin;
