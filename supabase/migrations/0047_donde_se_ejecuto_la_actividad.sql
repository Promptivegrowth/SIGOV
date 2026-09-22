-- ═══════════════════════════════════════════════════════════════════════
-- 0047 · Dónde se ejecutó la actividad
--
-- `work_entries` guarda un punto en `geom` y la capa «Ejecución en campo»
-- del mapa se dibuja con él. Pero la app nunca lo mandaba: los 500 registros
-- que se ven en el mapa son los de la siembra, y los tres que se registraron
-- de verdad desde el celular no aparecen en ninguna parte.
--
-- Se añaden `lat` y `lng` —como ya las tiene `evidences`— para que la app
-- mande la lectura del GPS tal cual, y un disparador que arma el punto. Si
-- el GPS no enganchó, el punto se deriva de la progresiva declarada sobre la
-- traza del tramo: peor que una lectura real, pero sitúa el trabajo donde
-- dice el parte, que es lo que el cliente va a revisar.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.work_entries
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy_m real;

create or replace function public.work_entry_geom()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $$
declare
  v_frac float8;
begin
  -- Lo que midió el GPS manda
  if new.lat is not null and new.lng is not null then
    new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
    return new;
  end if;

  -- Si no hubo lectura, se sitúa por la progresiva declarada
  if new.geom is null and new.section_id is not null and new.prog_start_m is not null then
    select least(0.999, greatest(0.001,
             ((coalesce(new.prog_end_m, new.prog_start_m) + new.prog_start_m) / 2.0
               - s.prog_start_m)::numeric
             / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8
      into v_frac
    from public.road_sections s
    where s.id = new.section_id and s.geom is not null;

    if v_frac is not null then
      select extensions.ST_LineInterpolatePoint(s.geom, v_frac)
        into new.geom
      from public.road_sections s where s.id = new.section_id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists t_we_geom on public.work_entries;

create trigger t_we_geom
  before insert or update of lat, lng, section_id, prog_start_m, prog_end_m
  on public.work_entries
  for each row execute function public.work_entry_geom();

-- Los que ya estaban sin punto, situados por su progresiva
update public.work_entries set prog_start_m = prog_start_m
where geom is null and section_id is not null and prog_start_m is not null;
