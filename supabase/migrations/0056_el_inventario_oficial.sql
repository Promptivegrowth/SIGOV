-- ═══════════════════════════════════════════════════════════════════════
-- 0056 · El inventario oficial: sus tipos, sus campos y sus tramos
--
-- Servicon entregó el Inventario Vial Anual 2024 de COVINCA: cinco Excel
-- en el formato del MTC, una hoja por tipo de elemento, con sus fotos y la
-- lista de materiales. Esta migración prepara el esquema para recibirlo;
-- los datos entran después, con scripts/inventario/.
--
-- Cuatro cosas:
--
-- · Los tipos que el inventario tiene y el sistema no: berma, calzada,
--   señalización horizontal, drenaje longitudinal, túnel, barrera,
--   reductor de velocidad y resonador.
--
-- · Los campos de cada tipo, rehechos según el formato oficial. Los que
--   había se inventaron al empezar —la alcantarilla pedía un «tipo» con
--   cuatro opciones— y no coinciden con lo que el MTC registra: la
--   clasificación MCA/TMC/ACA, los ojos, el diámetro, el encauzamiento de
--   entrada y de salida. Con los campos viejos el dato se guardaba pero el
--   formulario no lo enseñaba.
--
-- · La progresiva final. Medio inventario son elementos lineales —la
--   calzada del kilómetro, un guardavía de seiscientos metros, un muro— y
--   el sistema solo guardaba dónde empiezan.
--
-- · Los tramos con su nombre oficial, y la vía alterna del Complejo
--   Fronterizo Santa Rosa, que es una obra adicional con kilometraje propio.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── La progresiva final ───────────────────────────────────────────────

alter table public.road_assets
  add column if not exists progresiva_fin_m numeric(12,2);

comment on column public.road_assets.progresiva_fin_m is
  'Dónde termina un elemento lineal (calzada, berma, guardavía, muro). '
  'Puede ser menor que la inicial: hay guardavías medidos en sentido '
  'contrario al del kilometraje.';

-- ─── Los campos comunes a todas las hojas del formato MTC ──────────────
-- Estado de uso y fecha de alta aparecen en todas; se repiten en cada tipo
-- para que el formulario los pida siempre en el mismo sitio.

create or replace function public._campos_comunes_mtc()
returns jsonb language sql immutable as $$
  select '[
    {"key":"uso","type":"select","label":"Estado de uso","options":["en_uso","en_desuso"]},
    {"key":"fecha_alta","type":"date","label":"Fecha de alta"}
  ]'::jsonb
$$;

-- ─── Los tipos, con los campos del inventario oficial ──────────────────

insert into public.asset_types (service_id, code, name, category, icon, color, dias_verde, dias_ambar, schema)
values
  (null, 'CAL', 'Calzada', 'Pavimento', 'road', '#475569', 90, 180, '[
    {"key":"ancho_m","type":"number","label":"Ancho (m)"},
    {"key":"rodadura","type":"select","label":"Rodadura","options":["CA","MAC","TSB","MAF"]},
    {"key":"espesor_cm","type":"number","label":"Espesor de rodadura (cm)"}
  ]'::jsonb),
  (null, 'BER', 'Berma', 'Pavimento', 'road', '#94A3B8', 90, 180, '[
    {"key":"ancho_m","type":"number","label":"Ancho (m)"},
    {"key":"rodadura","type":"select","label":"Rodadura","options":["CA","MAC","TSB","MAF"]},
    {"key":"espesor_cm","type":"number","label":"Espesor de rodadura (cm)"}
  ]'::jsonb),
  (null, 'SEH', 'Señalización horizontal', 'Señalización', 'minus', '#FACC15', 60, 120, '[
    {"key":"clasificacion","type":"select","label":"Clasificación","options":["Pintura de borde","Tacha de borde","Pintura de eje","Tacha de eje","Marca o letras","Giba","Tachas","Tachones"]},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb),
  (null, 'DRL', 'Drenaje longitudinal', 'Drenaje', 'waves', '#0284C7', 30, 75, '[
    {"key":"clasificacion","type":"select","label":"Clasificación","options":["Canal","Bajada de agua"]},
    {"key":"tipo","type":"select","label":"Tipo","options":["Concreto","Tierra","Mampostería"]},
    {"key":"seccion","type":"select","label":"Sección","options":["Trapezoidal","Rectangular","Tipo baúl","No aplica"]}
  ]'::jsonb),
  (null, 'TUN', 'Túnel', 'Estructuras', 'mountain', '#57534E', 90, 180, '[
    {"key":"longitud_m","type":"number","label":"Longitud total (m)"},
    {"key":"ficha_tecnica","type":"text","label":"Ficha técnica"}
  ]'::jsonb),
  (null, 'BAR', 'Barrera de seguridad', 'Seguridad vial', 'shield', '#334155', 45, 90, '[
    {"key":"clasificacion","type":"text","label":"Clasificación"},
    {"key":"material","type":"select","label":"Material","options":["Acero","Concreto","PVC concreto"]},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb),
  (null, 'RDV', 'Reductor de velocidad', 'Seguridad vial', 'triangle-alert', '#EA580C', 60, 120, '[
    {"key":"tipo_estructura","type":"select","label":"Tipo de estructura","options":["Reductor de velocidad","Giba"]},
    {"key":"largo_m","type":"number","label":"Largo (m)"},
    {"key":"ancho_m","type":"number","label":"Ancho (m)"},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb),
  (null, 'RES', 'Resonador', 'Seguridad vial', 'audio-lines', '#C2410C', 60, 120, '[
    {"key":"largo_m","type":"number","label":"Largo (m)"},
    {"key":"ancho_m","type":"number","label":"Ancho (m)"}
  ]'::jsonb)
on conflict (code) do update set
  name = excluded.name, category = excluded.category, icon = excluded.icon,
  color = excluded.color, dias_verde = excluded.dias_verde, dias_ambar = excluded.dias_ambar,
  schema = excluded.schema;

-- Los que ya existían, con los campos del formato oficial.
update public.asset_types set schema = '[
    {"key":"clasificacion","type":"select","label":"Clasificación (MTC)","options":["MCA","TMC","ACA","TCA","MPE"]},
    {"key":"ojos","type":"number","label":"Ojos o vanos"},
    {"key":"diametro_m","type":"number","label":"Diámetro / ancho (m)"},
    {"key":"altura_m","type":"number","label":"Altura (m)"},
    {"key":"encauzamiento_entrada","type":"select","label":"Encauzamiento de entrada","options":["Muro cabezal","Canales","Quebrada","Sin estructura"]},
    {"key":"encauzamiento_salida","type":"select","label":"Encauzamiento de salida","options":["Muro cabezal","Canales","Quebrada","Sin estructura"]}
  ]'::jsonb where code = 'ALC' and service_id is null;

update public.asset_types set schema = '[
    {"key":"ancho_m","type":"number","label":"Ancho (m)"},
    {"key":"longitud_m","type":"number","label":"Longitud (m)"},
    {"key":"encauzamiento_entrada","type":"select","label":"Encauzamiento de entrada","options":["Muro cabezal","Canales","Quebrada","Sin estructura"]},
    {"key":"encauzamiento_salida","type":"select","label":"Encauzamiento de salida","options":["Muro cabezal","Canales","Quebrada","Sin estructura"]}
  ]'::jsonb where code = 'BAD' and service_id is null;

update public.asset_types set schema = '[
    {"key":"clasificacion","type":"text","label":"Clasificación"},
    {"key":"material","type":"select","label":"Material","options":["Acero","Concreto","PVC concreto"]},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb where code = 'GUA' and service_id is null;

update public.asset_types set schema = '[
    {"key":"clasificacion","type":"text","label":"Clasificación"},
    {"key":"material","type":"select","label":"Material","options":["PVC concreto","Concreto","Acero"]},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb where code = 'PDL' and service_id is null;

update public.asset_types set schema = '[
    {"key":"clasificacion","type":"select","label":"Clasificación","options":["Preventiva","Reglamentaria","Informativa"]},
    {"key":"calzada","type":"text","label":"Calzada"}
  ]'::jsonb where code = 'SEV' and service_id is null;

update public.asset_types set schema = '[]'::jsonb where code = 'HIT' and service_id is null;

update public.asset_types set schema = '[
    {"key":"tipo_estructura","type":"select","label":"Tipo de estructura","options":["Concreto","Mampostería","Gavión","Geobolsas","Geosintético"]}
  ]'::jsonb where code = 'MUR' and service_id is null;

-- Los puentes del inventario incluyen pontones: el nombre lo dice.
update public.asset_types set name = 'Puente o pontón', schema = '[
    {"key":"longitud_m","type":"number","label":"Longitud total (m)"},
    {"key":"ficha_tecnica","type":"text","label":"Ficha técnica"}
  ]'::jsonb where code = 'PUE' and service_id is null;

-- Los campos comunes, al final de cada formulario del formato MTC.
update public.asset_types
set schema = coalesce(schema, '[]'::jsonb) || public._campos_comunes_mtc()
where service_id is null
  and code in ('ALC','BAD','CAL','BER','SEH','DRL','TUN','BAR','RDV','RES','GUA','PDL','SEV','HIT','MUR','PUE')
  and not (coalesce(schema, '[]'::jsonb) @> '[{"key":"uso"}]'::jsonb);

-- ─── Los tramos, con su nombre oficial ─────────────────────────────────
-- Los que había eran descriptivos y se armaron al empezar. Los oficiales
-- son los que encabezan cada tomo del inventario anual.

do $$
declare
  v_sur uuid := '22222222-2222-4222-8222-222222222221';
begin
  update public.road_sections set name = 'Dv. Quilca – Dv. Arequipa (Repartición)'
   where service_id = v_sur and code = 'AQP-01';
  update public.road_sections set name = 'Dv. Matarani – Dv. Moquegua'
   where service_id = v_sur and code = 'AQP-02';
  update public.road_sections set name = 'Dv. Ilo – Tacna'
   where service_id = v_sur and code = 'TAC-01';
  update public.road_sections set name = 'Tacna – La Concordia'
   where service_id = v_sur and code = 'TAC-02';

  -- La vía alterna del Complejo Fronterizo Santa Rosa: obra adicional, con
  -- kilometraje propio de 0+000 a 1+380. Su traza sale de las coordenadas
  -- de su propia calzada en el inventario; no está en el KMZ.
  insert into public.road_sections (service_id, code, name, route_code, prog_start_m, prog_end_m, surface, lanes, color, is_active)
  select v_sur, 'VA-01', 'Vía alterna · Complejo Fronterizo Santa Rosa', 'PE001S', 0, 1380, 'CA', 2, '#7C3AED', true
  where not exists (select 1 from public.road_sections where service_id = v_sur and code = 'VA-01');
end $$;

-- ─── Las unidades de la lista de materiales ────────────────────────────
-- La lista usa unidades de almacén que el sistema no tenía.

insert into public.units (service_id, code, name, symbol) values
  (null, 'GAL', 'Galón', 'gal'),
  (null, 'KG',  'Kilogramo', 'kg'),
  (null, 'BLS', 'Bolsa', 'bls'),
  (null, 'SAC', 'Saco', 'sac'),
  (null, 'BJ',  'Balde', 'bj'),
  (null, 'CIL', 'Cilindro', 'cil'),
  (null, 'JGO', 'Juego', 'jgo'),
  (null, 'PQT', 'Paquete', 'pqt')
on conflict (code) do nothing;

-- ─── El código correlativo de los materiales ───────────────────────────
--
-- Cada material lleva un prefijo por categoría y un correlativo dentro de
-- ella —PIN-001 pintura, SEN-001 señalización—, que es el formato que ya
-- usaba el almacén. Al crear uno sin código, se le da el siguiente de su
-- categoría. El correlativo se calcula sobre lo que hay, incluidos los
-- dados de baja: un código no se reutiliza, porque un pedido antiguo que
-- diga PIN-014 tiene que seguir apuntando al mismo material.

create table if not exists public.supply_categories (
  code   text primary key,
  name   text not null unique,
  orden  smallint not null default 0
);

comment on table public.supply_categories is
  'Las categorías del maestro de materiales y su prefijo de código.';

insert into public.supply_categories (code, name, orden) values
  ('PIN', 'Pinturas y solventes', 10),
  ('SEN', 'Señalización', 20),
  ('SEG', 'Seguridad vial', 30),
  ('ASF', 'Asfaltos y emulsiones', 40),
  ('AGR', 'Agregados y cemento', 50),
  ('FER', 'Ferretería y fijaciones', 60),
  ('ADH', 'Adhesivos y aditivos', 70),
  ('LIM', 'Limpieza', 80),
  ('OTR', 'Otros', 99)
on conflict (code) do nothing;

alter table public.supply_categories enable row level security;
drop policy if exists supply_categories_select on public.supply_categories;
create policy supply_categories_select on public.supply_categories
  for select to authenticated using (true);

create or replace function public.siguiente_codigo_material(p_service_id uuid, p_prefijo text)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select upper(p_prefijo) || '-' || lpad(
    (coalesce(max(nullif(regexp_replace(s.code, '^' || upper(p_prefijo) || '-', ''), s.code)::int), 0) + 1)::text,
    3, '0')
  from public.supplies s
  where s.service_id = p_service_id
    and s.code ~ ('^' || upper(p_prefijo) || '-\d+$')
$$;

comment on function public.siguiente_codigo_material is
  'El siguiente código libre de una categoría: PIN-015 si el último es PIN-014.';

grant execute on function public.siguiente_codigo_material(uuid, text) to authenticated;

create or replace function public.t_supply_codigo()
returns trigger language plpgsql as $$
declare
  v_pref text;
begin
  if new.code is null or btrim(new.code) = '' then
    select c.code into v_pref from public.supply_categories c where c.name = new.category;
    -- Se bloquea el contrato mientras se calcula: dos altas a la vez no
    -- pueden llevarse el mismo número.
    perform pg_advisory_xact_lock(hashtext('supplies:' || new.service_id::text));
    new.code := public.siguiente_codigo_material(new.service_id, coalesce(v_pref, 'OTR'));
  end if;
  return new;
end $$;

drop trigger if exists t_supply_codigo on public.supplies;
create trigger t_supply_codigo
  before insert on public.supplies
  for each row execute function public.t_supply_codigo();

-- Un código no puede repetirse dentro del contrato.
create unique index if not exists ux_supplies_servicio_codigo
  on public.supplies (service_id, upper(code));
