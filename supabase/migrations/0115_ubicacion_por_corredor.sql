-- ═══════════════════════════════════════════════════════════════════════
-- 0115 · REV3-OBS-26: nada fuera del corredor
--
-- 1. Inventario: la reubicación de la 0110 fue de una sola vez. Ahora es
--    regla: el elemento que se importa o edita a más de 150 m de su vía se
--    lleva a su progresiva sobre la geometría oficial, y la coordenada del
--    Excel queda guardada aparte (lat_inventario / lng_inventario).
-- 2. Avances: el GPS manda mientras caiga sobre la vía. Si quedó a más de
--    300 m del corredor (se registró desde el campamento, o el GPS no había
--    fijado), el punto se toma de tramo + progresiva.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Inventario ────────────────────────────────────────────────────
create or replace function public.t_activo_sobre_la_via()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  p extensions.geometry;
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
  if extensions.ST_Distance(
       extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326)::extensions.geography,
       s.geom::extensions.geography) <= 150 then
    return new;
  end if;
  p := extensions.ST_LineInterpolatePoint(s.geom,
         least(1.0, greatest(0.0, (new.progresiva_m - s.prog_start_m) / (s.prog_end_m - s.prog_start_m))));
  new.lat_inventario := coalesce(new.lat_inventario, new.lat);
  new.lng_inventario := coalesce(new.lng_inventario, new.lng);
  new.lat := extensions.ST_Y(p);
  new.lng := extensions.ST_X(p);
  new.geom := extensions.ST_SetSRID(p, 4326);
  new.attributes := coalesce(new.attributes, '{}'::jsonb) || jsonb_build_object('ubicacion', 'progresiva');
  return new;
end $$;

drop trigger if exists t_activo_sobre_la_via on public.road_assets;
create trigger t_activo_sobre_la_via before insert or update on public.road_assets
  for each row execute function public.t_activo_sobre_la_via();

-- Los que ya se movieron en la 0110 dicen que se ubicaron por progresiva
update public.road_assets
   set attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object('ubicacion', 'progresiva')
 where lat_inventario is not null and coalesce(attributes ->> 'ubicacion', '') <> 'progresiva';

-- ─── 2. Avances ───────────────────────────────────────────────────────
create or replace function public.work_entry_geom()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $$
declare
  v_frac float8;
  s public.road_sections;
  v_lejos boolean := false;
begin
  select * into s from public.road_sections where id = new.section_id;

  -- Lo que midió el GPS manda, mientras caiga sobre la vía
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
    if s.geom is not null and new.prog_start_m is not null then
      v_lejos := extensions.ST_Distance(new.geom::extensions.geography, s.geom::extensions.geography) > 300;
    end if;
    if not v_lejos then return new; end if;
    new.geom := null;
  end if;

  -- Sin lectura, o lejos del corredor: por la progresiva declarada
  if new.geom is null and s.geom is not null and new.prog_start_m is not null and s.prog_end_m > s.prog_start_m then
    v_frac := least(0.999, greatest(0.001,
                ((coalesce(new.prog_end_m, new.prog_start_m) + new.prog_start_m) / 2.0 - s.prog_start_m)::numeric
                / (s.prog_end_m - s.prog_start_m)))::float8;
    new.geom := extensions.ST_LineInterpolatePoint(s.geom, v_frac);
  end if;

  return new;
end $$;
