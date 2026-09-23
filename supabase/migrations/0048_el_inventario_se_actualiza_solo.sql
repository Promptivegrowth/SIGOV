-- ═══════════════════════════════════════════════════════════════════════
-- 0048 · El inventario se actualiza solo
--
-- Lo que pidió Elvis en la reunión del 22 de setiembre, con sus palabras:
--
--   «El supervisor visualiza su tramo, filtra por alcantarillas y le
--   aparecen los puntos. Reviso una alcantarilla y ahí me tiene que
--   aparecer el detalle: una foto y la fecha que se ejecutó. Si se ejecutó
--   el primero de julio y ya pasó mucho tiempo, tiene que verse rojo; si se
--   ejecutó ayer, en verdecito. Entonces el supervisor va a decir: ese es un
--   punto que no se interviene hace tiempo, tengo que ir.»
--
-- Y la parte que lo hace sostenible:
--
--   «Todo lo que se ejecuta diariamente se actualiza automáticamente en el
--   inventario. Las fotos que COVINCA nos entregó son del 2024: están
--   desactualizadas. Se tienen que ir actualizando solas mientras pasa el
--   tiempo.»
--
-- Eso es lo que hace esta migración. Hoy la cadena está rota en su punto
-- central: hay 2 724 elementos inventariados y **cero** intervenciones
-- registradas, porque nada conecta lo que la cuadrilla ejecuta en una
-- progresiva con el elemento que está en esa progresiva. El capataz limpia
-- la alcantarilla del km 150+000 y el inventario sigue diciendo que la
-- última vez que se tocó fue en enero.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1 · Cada cosa se interviene con su propia frecuencia ──────────────
-- Una alcantarilla se limpia antes de cada temporada de lluvias; una señal
-- vertical se revisa un par de veces al año. Un solo umbral para todo
-- pintaría de rojo medio inventario sin que eso signifique nada.

alter table public.asset_types
  add column if not exists dias_verde int not null default 45,
  add column if not exists dias_ambar int not null default 90;

comment on column public.asset_types.dias_verde is
  'Hasta cuántos días desde la última intervención se considera al día';
comment on column public.asset_types.dias_ambar is
  'A partir de cuántos días pasa a crítico; entre verde y ámbar, por vencer';

update public.asset_types set dias_verde = 30, dias_ambar = 75
  where code in ('ALC', 'CUN', 'BAD');       -- drenaje: antes de las lluvias
update public.asset_types set dias_verde = 60, dias_ambar = 120
  where code in ('SEV', 'HIT', 'PDL');       -- señalización: se revisa menos
update public.asset_types set dias_verde = 45, dias_ambar = 90
  where code in ('GUA', 'SOS');              -- seguridad vial
update public.asset_types set dias_verde = 90, dias_ambar = 180
  where code in ('MUR', 'PUE');              -- estructuras: inspección mayor

-- ─── 2 · El semáforo de intervención ───────────────────────────────────

do $$ begin
  create type public.semaforo_intervencion as enum
    ('al_dia', 'por_vencer', 'critico', 'sin_intervenir');
exception when duplicate_object then null; end $$;

create or replace function public.asset_semaforo(
  p_ultima date, p_dias_verde int, p_dias_ambar int
) returns public.semaforo_intervencion
language sql immutable as $$
  select case
    when p_ultima is null then 'sin_intervenir'::public.semaforo_intervencion
    when current_date - p_ultima <= coalesce(p_dias_verde, 45)
      then 'al_dia'::public.semaforo_intervencion
    when current_date - p_ultima <= coalesce(p_dias_ambar, 90)
      then 'por_vencer'::public.semaforo_intervencion
    else 'critico'::public.semaforo_intervencion
  end
$$;

-- ─── 3 · Lo ejecutado en campo interviene el inventario ────────────────
--
-- Cuando la cuadrilla registra trabajo entre dos progresivas de un tramo,
-- todo elemento inventariado que caiga en ese rango queda intervenido. La
-- tolerancia existe porque el capataz anota «150+000 a 150+300» y la
-- alcantarilla está en el 150+012: es el mismo trabajo.

create or replace function public.intervenir_por_ejecucion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_desde numeric;
  v_hasta numeric;
  v_tolerancia numeric := 25;   -- metros de gracia a cada lado
  v_fecha date;
  v_crew uuid;
begin
  if new.section_id is null or new.prog_start_m is null then
    return new;
  end if;

  v_desde := least(new.prog_start_m, coalesce(new.prog_end_m, new.prog_start_m)) - v_tolerancia;
  v_hasta := greatest(new.prog_start_m, coalesce(new.prog_end_m, new.prog_start_m)) + v_tolerancia;

  select w.work_date, w.crew_id into v_fecha, v_crew
  from public.work_orders w where w.id = new.work_order_id;
  v_fecha := coalesce(v_fecha, current_date);

  -- Una intervención por elemento alcanzado. Si la cuadrilla vuelve al
  -- mismo sitio el mismo día no se duplica: es la misma jornada.
  -- `client_id` se deja al valor por omisión: es el identificador propio de
  -- cada fila para que un reenvío no duplique, no el del contrato.
  insert into public.asset_interventions (
    service_id, asset_id, work_entry_id, pci_item_id,
    intervened_on, action, condition_before, crew_id, created_by, notes
  )
  select
    a.service_id, a.id, new.id, new.pci_item_id,
    v_fecha, 'mantenimiento', a.condition, v_crew, new.created_by,
    'Registrado desde la ejecución en campo'
  from public.road_assets a
  where a.service_id = new.service_id
    and a.section_id = new.section_id
    and a.deleted_at is null
    and a.progresiva_m between v_desde and v_hasta
    and (new.side is null or a.side is null
         or a.side = 'ambos' or new.side = 'ambos' or a.side = new.side)
    and not exists (
      select 1 from public.asset_interventions i
      where i.asset_id = a.id and i.intervened_on = v_fecha
        and i.work_entry_id = new.id
    );

  -- Y el elemento queda con su fecha al día, que es lo que mira el mapa
  update public.road_assets a
  set last_inspected_on = greatest(coalesce(a.last_inspected_on, v_fecha), v_fecha),
      updated_at = now()
  where a.service_id = new.service_id
    and a.section_id = new.section_id
    and a.deleted_at is null
    and a.progresiva_m between v_desde and v_hasta
    and (new.side is null or a.side is null
         or a.side = 'ambos' or new.side = 'ambos' or a.side = new.side);

  return new;
end $$;

drop trigger if exists t_we_interviene on public.work_entries;

create trigger t_we_interviene
  after insert on public.work_entries
  for each row execute function public.intervenir_por_ejecucion();

-- ─── 4 · Las fotos de campo cuelgan del elemento ───────────────────────
--
-- La foto la toma el capataz para sustentar su parte, pero es la misma que
-- el supervisor necesita ver en la ficha del elemento. En vez de pedirle
-- que la suba dos veces, se enlaza.

create or replace function public.enlazar_evidencia_al_activo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.work_entry_id is null then
    return new;
  end if;

  insert into public.evidence_links (
    evidence_id, service_id, work_entry_id, asset_id, created_by, note
  )
  select new.id, new.service_id, new.work_entry_id, i.asset_id, new.created_by,
         'Enlazada desde la ejecución en campo'
  from public.asset_interventions i
  where i.work_entry_id = new.work_entry_id
    and not exists (
      select 1 from public.evidence_links l
      where l.evidence_id = new.id and l.asset_id = i.asset_id
    );

  return new;
end $$;

drop trigger if exists t_ev_enlaza_activo on public.evidences;

create trigger t_ev_enlaza_activo
  after insert on public.evidences
  for each row execute function public.enlazar_evidencia_al_activo();

-- ─── 5 · La vista que alimenta el mapa y la ficha ──────────────────────

drop view if exists public.v_asset_fotos cascade;

create view public.v_asset_fotos
with (security_invoker = true) as
select
  l.asset_id,
  e.id              as evidence_id,
  e.storage_path,
  e.thumb_path,
  e.phase,
  e.taken_at,
  e.caption,
  e.watermarked,
  e.lat, e.lng,
  e.service_id,
  row_number() over (partition by l.asset_id order by e.taken_at desc) as orden
from public.evidence_links l
join public.evidences e on e.id = l.evidence_id
where l.asset_id is not null
  and e.deleted_at is null;

comment on view public.v_asset_fotos is
  'Las fotografías de cada elemento del inventario, de la más reciente a la '
  'más antigua. `orden` = 1 es la foto actual y `orden` = 2 la anterior, que '
  'son las dos que se comparan en la ficha.';

drop view if exists public.v_inventario cascade;

create view public.v_inventario
with (security_invoker = true) as
select
  a.id,
  a.service_id,
  a.client_id,
  a.code,
  a.name,
  a.type_id,
  t.code            as type_code,
  t.name            as type_name,
  t.category        as type_category,
  t.icon            as type_icon,
  t.color           as type_color,
  t.dias_verde,
  t.dias_ambar,
  a.section_id,
  s.name            as section_name,
  s.code            as section_code,
  a.progresiva_m,
  public.fmt_progresiva(a.progresiva_m) as progresiva_txt,
  a.side,
  a.lat, a.lng,
  a.condition,
  a.install_year,
  a.attributes,
  a.notes,
  -- La última vez que alguien tocó este elemento, venga de donde venga
  greatest(
    a.last_inspected_on,
    (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
  ) as ultima_intervencion,
  (select count(*) from public.asset_interventions i where i.asset_id = a.id) as intervenciones,
  current_date - greatest(
    a.last_inspected_on,
    (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
  ) as dias_sin_intervenir,
  public.asset_semaforo(
    greatest(
      a.last_inspected_on,
      (select max(i.intervened_on) from public.asset_interventions i where i.asset_id = a.id)
    ),
    t.dias_verde, t.dias_ambar
  ) as semaforo,
  (select count(*) from public.evidence_links l
    join public.evidences e on e.id = l.evidence_id and e.deleted_at is null
   where l.asset_id = a.id) as fotos,
  (select f.storage_path from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 1) as foto_actual,
  (select f.taken_at from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 1) as foto_actual_fecha,
  (select f.storage_path from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 2) as foto_anterior,
  (select f.taken_at from public.v_asset_fotos f
    where f.asset_id = a.id and f.orden = 2) as foto_anterior_fecha
from public.road_assets a
join public.asset_types t on t.id = a.type_id
left join public.road_sections s on s.id = a.section_id
where a.deleted_at is null;

comment on view public.v_inventario is
  'El inventario vial con su semáforo de intervención y sus dos últimas '
  'fotografías. Es lo que dibuja el mapa y lo que abre la ficha del elemento.';

-- ─── 6 · El mapa, con semáforo y fotografía ────────────────────────────

create or replace function public.assets_geojson(
  p_service_id uuid,
  p_type_codes text[] default null,
  p_conditions text[] default null,
  p_semaforos text[] default null,
  p_section_id uuid default null
) returns jsonb
language sql stable
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(v.lng, v.lat)),
        'properties', jsonb_build_object(
          'id', v.id, 'code', v.code, 'name', v.name,
          'type_code', v.type_code, 'type_name', v.type_name,
          'category', v.type_category,
          'color', v.type_color, 'icon', v.type_icon,
          'condition', v.condition,
          'section', v.section_name,
          'section_id', v.section_id,
          'progresiva', v.progresiva_txt,
          'progresiva_m', v.progresiva_m,
          'side', v.side,
          'semaforo', v.semaforo,
          'dias', v.dias_sin_intervenir,
          'ultima_intervencion', v.ultima_intervencion,
          'fotos', v.fotos,
          'intervenciones', v.intervenciones,
          'attributes', v.attributes
        )
      )
    ), '[]'::jsonb)
  )
  from public.v_inventario v
  where v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
    and (p_type_codes is null or v.type_code = any(p_type_codes))
    and (p_conditions is null or v.condition::text = any(p_conditions))
    and (p_semaforos is null or v.semaforo::text = any(p_semaforos))
    and (p_section_id is null or v.section_id = p_section_id)
$$;

-- ─── 7 · El resumen para el panel de filtros ───────────────────────────
-- Cuántos elementos hay de cada tipo y cómo está su semáforo, para que el
-- supervisor vea de un vistazo dónde está el problema antes de filtrar.

create or replace function public.inventario_resumen(
  p_service_id uuid,
  p_section_id uuid default null
) returns table (
  type_code text, type_name text, category text, color text, icon text,
  total bigint, al_dia bigint, por_vencer bigint, critico bigint, sin_intervenir bigint
)
language sql stable
set search_path to 'public', 'extensions'
as $$
  select
    v.type_code, v.type_name, v.type_category, v.type_color, v.type_icon,
    count(*),
    count(*) filter (where v.semaforo = 'al_dia'),
    count(*) filter (where v.semaforo = 'por_vencer'),
    count(*) filter (where v.semaforo = 'critico'),
    count(*) filter (where v.semaforo = 'sin_intervenir')
  from public.v_inventario v
  where v.service_id = p_service_id
    and (p_section_id is null or v.section_id = p_section_id)
  group by v.type_code, v.type_name, v.type_category, v.type_color, v.type_icon
  order by v.type_category, v.type_name
$$;

-- ─── 8 · Lo ya ejecutado también cuenta ────────────────────────────────
-- Los registros de campo que ya estaban en el sistema no dispararon el
-- trigger porque no existía. Se recorren una vez para que el inventario
-- arranque diciendo la verdad.

do $$
declare
  r record;
  v_tol numeric := 25;
begin
  for r in
    select w.id, w.service_id, w.section_id, w.prog_start_m, w.prog_end_m,
           w.side, w.pci_item_id, w.created_by, o.work_date, o.crew_id
    from public.work_entries w
    join public.work_orders o on o.id = w.work_order_id
    where w.section_id is not null and w.prog_start_m is not null
      and w.deleted_at is null
  loop
    insert into public.asset_interventions (
      service_id, asset_id, work_entry_id, pci_item_id,
      intervened_on, action, condition_before, crew_id, created_by, notes
    )
    select a.service_id, a.id, r.id, r.pci_item_id,
           coalesce(r.work_date, current_date), 'mantenimiento', a.condition,
           r.crew_id, r.created_by, 'Reconstruido de la ejecución ya registrada'
    from public.road_assets a
    where a.service_id = r.service_id
      and a.section_id = r.section_id
      and a.deleted_at is null
      and a.progresiva_m between
          least(r.prog_start_m, coalesce(r.prog_end_m, r.prog_start_m)) - v_tol
      and greatest(r.prog_start_m, coalesce(r.prog_end_m, r.prog_start_m)) + v_tol
      and not exists (
        select 1 from public.asset_interventions i
        where i.asset_id = a.id and i.work_entry_id = r.id
      );
  end loop;

  -- Y las fotos de esos registros, a sus elementos
  insert into public.evidence_links (evidence_id, service_id, work_entry_id, asset_id, note)
  select distinct e.id, e.service_id, e.work_entry_id, i.asset_id,
         'Reconstruido de la ejecución ya registrada'
  from public.evidences e
  join public.asset_interventions i on i.work_entry_id = e.work_entry_id
  where e.work_entry_id is not null and e.deleted_at is null
    and not exists (
      select 1 from public.evidence_links l
      where l.evidence_id = e.id and l.asset_id = i.asset_id
    );

  -- La fecha de cada elemento queda con su intervención más reciente
  update public.road_assets a
  set last_inspected_on = greatest(a.last_inspected_on, x.ultima)
  from (
    select asset_id, max(intervened_on) ultima
    from public.asset_interventions group by asset_id
  ) x
  where x.asset_id = a.id;
end $$;

-- ─── 9 · Índices para que el mapa no se arrastre ───────────────────────

create index if not exists ix_assets_seccion_prog
  on public.road_assets (service_id, section_id, progresiva_m)
  where deleted_at is null;

create index if not exists ix_intervenciones_activo
  on public.asset_interventions (asset_id, intervened_on desc);

create index if not exists ix_evidence_links_activo
  on public.evidence_links (asset_id);
