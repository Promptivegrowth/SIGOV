-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0102 · Inventario vial georreferenciado
-- Los elementos se generan SOBRE la geometría real de cada tramo.
-- ═══════════════════════════════════════════════════════════════════════════

select setseed(0.42);

-- ─── Tipos de elemento vial ──────────────────────────────────────────────
insert into public.asset_types (code, name, category, icon, color, schema) values
 ('ALC','Alcantarilla','Drenaje','waves','#0891B2',
  '[{"key":"tipo","label":"Tipo","type":"select","options":["TMC","Marco","Cajón","Tubería PVC"]},
    {"key":"diametro","label":"Diámetro (m)","type":"number"},
    {"key":"longitud","label":"Longitud (m)","type":"number"},
    {"key":"obstruccion","label":"% obstrucción","type":"number"}]'::jsonb),
 ('GUA','Guardavía metálica','Seguridad vial','shield','#64748B',
  '[{"key":"longitud","label":"Longitud (m)","type":"number"},
    {"key":"postes","label":"N.º de postes","type":"number"},
    {"key":"terminal","label":"Terminal","type":"select","options":["Abocinado","Cola de pez","Amortiguador"]}]'::jsonb),
 ('SEV','Señal vertical','Señalización','signpost','#EAB308',
  '[{"key":"codigo_mtc","label":"Código MTC","type":"text"},
    {"key":"tipo","label":"Tipo","type":"select","options":["Preventiva","Reglamentaria","Informativa"]},
    {"key":"dimension","label":"Dimensión","type":"text"},
    {"key":"retroreflectividad","label":"Retroreflectividad","type":"select","options":["Tipo I","Tipo III","Tipo IV","Tipo XI"]}]'::jsonb),
 ('SOS','Poste SOS','Emergencia','phone-call','#7C3AED',
  '[{"key":"numero","label":"N.º de poste","type":"text"},
    {"key":"operativo","label":"Operativo","type":"bool"},
    {"key":"energia","label":"Energía","type":"select","options":["Solar","Red","Batería"]}]'::jsonb),
 ('BAD','Badén','Drenaje','shovel','#0E7490',
  '[{"key":"ancho","label":"Ancho (m)","type":"number"},{"key":"material","label":"Material","type":"text"}]'::jsonb),
 ('PDL','Poste delineador','Señalización','milestone','#A16207',
  '[{"key":"material","label":"Material","type":"select","options":["Plástico","Concreto","Metal"]}]'::jsonb),
 ('PUE','Puente','Estructuras','bridge','#DC2626',
  '[{"key":"luz","label":"Luz (m)","type":"number"},{"key":"tipo","label":"Tipo","type":"text"},
    {"key":"anio","label":"Año construcción","type":"number"}]'::jsonb),
 ('MUR','Muro de contención','Estructuras','brick-wall','#78716C',
  '[{"key":"altura","label":"Altura (m)","type":"number"},{"key":"tipo","label":"Tipo","type":"text"}]'::jsonb),
 ('CUN','Cuneta revestida','Drenaje','ruler','#06B6D4',
  '[{"key":"longitud","label":"Longitud (m)","type":"number"},{"key":"seccion","label":"Sección","type":"text"}]'::jsonb),
 ('HIT','Hito kilométrico','Señalización','map-pin','#F97316',
  '[{"key":"km","label":"Kilómetro","type":"number"}]'::jsonb)
on conflict (code) do nothing;

-- ─── Generación de elementos sobre cada tramo ────────────────────────────
with cfg as (
  select * from (values
    ('ALC', 42, 'derecho'), ('GUA', 58, 'derecho'), ('SEV', 96, 'derecho'),
    ('SOS', 22, 'derecho'), ('BAD', 14, 'eje'),     ('PDL',110, 'derecho'),
    ('PUE',  9, 'eje'),     ('MUR', 17, 'izquierdo'),('CUN', 46, 'izquierdo'),
    ('HIT', 40, 'derecho')
  ) as t(type_code, qty, side)
),
gen as (
  select
    s.service_id,
    s.id as section_id,
    at.id as type_id,
    c.type_code,
    c.side::road_side as side,
    g.n,
    s.prog_start_m + (s.prog_end_m - s.prog_start_m) * (g.n::numeric / (c.qty + 1)) as prog_m,
    extensions.ST_LineInterpolatePoint(
      s.geom,
      least(0.999, greatest(0.001, g.n::numeric / (c.qty + 1) + (random() - 0.5) * 0.004))
    ) as pt,
    s.code as section_code
  from public.road_sections s
  cross join cfg c
  join public.asset_types at on at.code = c.type_code
  cross join lateral generate_series(1, c.qty) as g(n)
  where s.deleted_at is null
)
insert into public.road_assets (service_id, type_id, code, name, section_id, progresiva_m, side,
                                lat, lng, condition, install_year, last_inspected_on, attributes)
select
  gen.service_id, gen.type_id,
  gen.section_code || '-' || gen.type_code || '-' || lpad(gen.n::text, 3, '0'),
  case gen.type_code
    when 'ALC' then 'Alcantarilla ' || public.fmt_progresiva(gen.prog_m)
    when 'GUA' then 'Guardavía ' || public.fmt_progresiva(gen.prog_m)
    when 'SEV' then 'Señal vertical ' || public.fmt_progresiva(gen.prog_m)
    when 'SOS' then 'Poste SOS N.º ' || gen.n
    when 'BAD' then 'Badén ' || public.fmt_progresiva(gen.prog_m)
    when 'PDL' then 'Delineador ' || public.fmt_progresiva(gen.prog_m)
    when 'PUE' then 'Puente ' || public.fmt_progresiva(gen.prog_m)
    when 'MUR' then 'Muro ' || public.fmt_progresiva(gen.prog_m)
    when 'CUN' then 'Cuneta ' || public.fmt_progresiva(gen.prog_m)
    else 'Hito km ' || round(gen.prog_m/1000)
  end,
  gen.section_id, gen.prog_m, gen.side,
  extensions.ST_Y(gen.pt), extensions.ST_X(gen.pt),
  (case
    when random() < 0.52 then 'bueno'
    when random() < 0.78 then 'regular'
    when random() < 0.93 then 'malo'
    else 'critico' end)::asset_condition,
  (2008 + floor(random() * 17))::smallint,
  current_date - (floor(random() * 240))::int,
  case gen.type_code
    when 'ALC' then jsonb_build_object('tipo', (array['TMC','Marco','Cajón','Tubería PVC'])[1+floor(random()*4)],
                                       'diametro', round((0.6 + random()*1.8)::numeric, 2),
                                       'longitud', round((8 + random()*24)::numeric, 1),
                                       'obstruccion', floor(random()*70))
    when 'GUA' then jsonb_build_object('longitud', round((12 + random()*180)::numeric, 1),
                                       'postes', 4 + floor(random()*46),
                                       'terminal', (array['Abocinado','Cola de pez','Amortiguador'])[1+floor(random()*3)])
    when 'SEV' then jsonb_build_object('codigo_mtc', (array['P-1A','P-2B','R-30','R-16','I-18','P-49','R-1'])[1+floor(random()*7)],
                                       'tipo', (array['Preventiva','Reglamentaria','Informativa'])[1+floor(random()*3)],
                                       'dimension', (array['0.60x0.60','0.75x0.75','1.20x0.60','2.40x1.20'])[1+floor(random()*4)],
                                       'retroreflectividad', (array['Tipo I','Tipo III','Tipo IV','Tipo XI'])[1+floor(random()*4)])
    when 'SOS' then jsonb_build_object('numero', 'SOS-' || lpad(gen.n::text,3,'0'),
                                       'operativo', random() > 0.18,
                                       'energia', (array['Solar','Red','Batería'])[1+floor(random()*3)])
    when 'PUE' then jsonb_build_object('luz', round((12 + random()*90)::numeric,1),
                                       'tipo', (array['Viga losa','Arco','Atirantado','Losa maciza'])[1+floor(random()*4)],
                                       'anio', 1985 + floor(random()*38))
    when 'CUN' then jsonb_build_object('longitud', round((80 + random()*900)::numeric,0),
                                       'seccion', (array['Triangular','Trapezoidal','Rectangular'])[1+floor(random()*3)])
    when 'MUR' then jsonb_build_object('altura', round((1.2 + random()*5.5)::numeric,1),
                                       'tipo', (array['Gavión','Concreto ciclópeo','Tierra armada'])[1+floor(random()*3)])
    when 'HIT' then jsonb_build_object('km', round(gen.prog_m/1000))
    else '{}'::jsonb
  end
from gen
on conflict (service_id, code) do nothing;

-- Próxima inspección coherente con la condición
update public.road_assets
   set next_inspection_on = last_inspected_on + case condition
         when 'critico' then 15 when 'malo' then 30 when 'regular' then 90 else 180 end
 where next_inspection_on is null;

select count(*) as elementos_inventario,
       count(*) filter (where condition = 'critico') as criticos,
       count(distinct type_id) as tipos
  from public.road_assets;
