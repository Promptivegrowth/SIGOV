-- ═══════════════════════════════════════════════════════════════════════
-- 0063 · El trazo de la vía alterna del Complejo Fronterizo Santa Rosa
--
-- La vía alterna (VA-01) no viene en el KMZ de la supervisión: el tramo
-- existía sin línea y el mapa no tenía dónde dibujarla. El inventario sí
-- la describe: sus dos calzadas, 0+000 → 1+000 y 1+000 → 1+380, con la
-- coordenada de cada extremo. Esa es la línea.
--
-- Con la línea se corrigen cuatro señales verticales cuya coordenada en el
-- Excel no está en la vía alterna sino en la ciudad de Tacna —y una, la
-- 0+100, 25 km al este—. Se ubican por su progresiva, como el resto de
-- los elementos cuya coordenada no era de fiar, y la del Excel se guarda.
-- ═══════════════════════════════════════════════════════════════════════

update public.road_sections set
  geom = extensions.ST_SetSRID(extensions.ST_MakeLine(array[
    extensions.ST_MakePoint(-70.314870, -18.304740),   -- 0+000, inicio de la calzada 1
    extensions.ST_MakePoint(-70.316871, -18.308940),   -- 1+000, fin de la 1 e inicio de la 2
    extensions.ST_MakePoint(-70.314331, -18.309680)    -- 1+380, fin de la calzada 2
  ]), 4326),
  updated_at = now()
where code = 'VA-01' and geom is null;

-- Las señales: cada una en su progresiva, sobre la línea. La línea medida
-- es más corta que los 1,380 m nominales —tres vértices no siguen cada
-- curva—, así que se reparte en proporción.
with via as (
  select id, geom, prog_end_m
  from public.road_sections
  where code = 'VA-01'
),
movidas as (
  select
    a.id,
    extensions.ST_LineInterpolatePoint(v.geom, least(1, a.progresiva_m / v.prog_end_m)) as punto,
    a.lat as lat_excel,
    a.lng as lng_excel,
    extensions.ST_Distance(
      extensions.ST_SetSRID(extensions.ST_MakePoint(a.lng, a.lat), 4326)::extensions.geography,
      v.geom::extensions.geography
    ) as distancia
  from public.road_assets a
  join via v on v.id = a.section_id
  where a.deleted_at is null
    and a.code in ('VA01-SEV-0002', 'VA01-SEV-0003', 'VA01-SEV-0004', 'VA01-SEV-0005')
    and coalesce(a.attributes->>'ubicacion', 'campo') = 'campo'
)
update public.road_assets a set
  lat = extensions.ST_Y(m.punto),
  lng = extensions.ST_X(m.punto),
  geom = m.punto,
  attributes = a.attributes || jsonb_build_object(
    'ubicacion', 'progresiva',
    'coordenada_excel', jsonb_build_object('lat', m.lat_excel, 'lng', m.lng_excel),
    'motivo_ubicacion', format('a %s km de la vía alterna', round((m.distancia / 1000)::numeric))
  ),
  updated_at = now()
from movidas m
where a.id = m.id;
