-- ═══════════════════════════════════════════════════════════════════════
-- 0046 · Las trazas de los tramos, donde de verdad están
--
-- El contrato es Arequipa – Moquegua – Tacna y el mapa dibujaba sus cuatro
-- tramos en la costa de Áncash: latitudes de −8.9 a −10.7 en vez de −16 a
-- −18. La geometría venía de la semilla del otro contrato.
--
-- No es un detalle estético. Los ítems de PCI, las evidencias y el
-- inventario no guardan un punto propio del mapa: se sitúan interpolando su
-- progresiva sobre la línea del tramo. Con la línea equivocada, cada PCI que
-- el cliente abra en el mapa aparece a mil kilómetros de donde ocurrió.
--
-- Aquí van trazas aproximadas de la Panamericana Sur por los puntos que dan
-- nombre a cada tramo. Las progresivas oficiales del contrato siguen
-- pendientes de SERVICON; cuando lleguen, se reemplazan estas líneas y todo
-- lo que cuelga de ellas vuelve a situarse solo.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_sur uuid := '22222222-2222-4222-8222-222222222221';
begin

  -- ─── Las cuatro trazas ─────────────────────────────────────────────
  -- Segmentadas cada ~500 m para que la interpolación no dé saltos.

  update public.road_sections set geom = extensions.ST_Segmentize(
    extensions.ST_GeomFromText('LINESTRING(
      -72.7100 -16.6230, -72.5500 -16.5500, -72.4000 -16.4700,
      -72.1850 -16.3720, -72.0500 -16.4500, -71.9800 -16.5300,
      -71.9050 -16.7030)', 4326)::extensions.geography, 500)::extensions.geometry
  where service_id = v_sur and code = 'AQP-01';

  update public.road_sections set geom = extensions.ST_Segmentize(
    extensions.ST_GeomFromText('LINESTRING(
      -71.8000 -16.6600, -71.8600 -16.7600, -71.6500 -16.9200,
      -71.4500 -17.0200, -71.2000 -17.1000, -71.0200 -17.1800,
      -70.9350 -17.1950)', 4326)::extensions.geography, 500)::extensions.geometry
  where service_id = v_sur and code = 'AQP-02';

  update public.road_sections set geom = extensions.ST_Segmentize(
    extensions.ST_GeomFromText('LINESTRING(
      -70.2530 -18.0060, -70.3500 -17.9500, -70.5200 -17.8800,
      -70.6800 -17.8000, -70.8200 -17.7200, -70.9500 -17.6300)', 4326)::extensions.geography, 500)::extensions.geometry
  where service_id = v_sur and code = 'TAC-01';

  update public.road_sections set geom = extensions.ST_Segmentize(
    extensions.ST_GeomFromText('LINESTRING(
      -70.2530 -18.0060, -70.2700 -18.0600, -70.3000 -18.1400,
      -70.3200 -18.2100)', 4326)::extensions.geography, 500)::extensions.geometry
  where service_id = v_sur and code = 'TAC-02';

  -- ─── Lo que colgaba de la traza vieja ──────────────────────────────
  -- El inventario vial sí guarda punto propio, así que hay que moverlo.
  -- El punto se calcula aparte porque una subconsulta lateral no puede
  -- mirar la tabla que el update está tocando.

  update public.road_assets a
  set geom = p.punto,
      lng  = extensions.ST_X(p.punto),
      lat  = extensions.ST_Y(p.punto)
  from (
    select x.id,
           extensions.ST_LineInterpolatePoint(s.geom, least(0.999, greatest(0.001,
             (x.progresiva_m - s.prog_start_m)::numeric
             / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8) as punto
    from public.road_assets x
    join public.road_sections s on s.id = x.section_id
    where x.service_id = v_sur and x.progresiva_m is not null and s.geom is not null
  ) p
  where p.id = a.id;

  -- Las evidencias llevan la coordenada que dio el GPS del celular, y un
  -- guardián impide cambiarla: una evidencia que se puede mover de sitio no
  -- prueba nada. Aquí se aparta un momento, y solo para este contrato de
  -- demostración, porque lo que se corrige es la siembra, no un registro de
  -- campo. En producción el guardián se queda donde está.

  alter table public.evidences disable trigger t_ev_guard;

  update public.evidences e
  set geom = p.punto,
      lng  = extensions.ST_X(p.punto),
      lat  = extensions.ST_Y(p.punto)
  from (
    select x.id,
           extensions.ST_SetSRID(extensions.ST_MakePoint(
             extensions.ST_X(q.base) + (random() - 0.5) * 0.0004,
             extensions.ST_Y(q.base) + (random() - 0.5) * 0.0004), 4326) as punto
    from public.evidences x
    join public.road_sections s on s.id = x.section_id
    cross join lateral (select extensions.ST_LineInterpolatePoint(s.geom, least(0.999, greatest(0.001,
      (x.progresiva_m - s.prog_start_m)::numeric
      / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8) as base) q
    where x.service_id = v_sur and x.progresiva_m is not null
      and x.lat is not null and s.geom is not null
  ) p
  where p.id = e.id;

  alter table public.evidences enable trigger t_ev_guard;

  -- Y lo ejecutado en campo. Guarda un punto, no una línea: el mapa marca
  -- dónde trabajó la cuadrilla, y se toma el medio del tramo atendido.

  update public.work_entries w
  set geom = p.punto
  from (
    select x.id,
           extensions.ST_LineInterpolatePoint(s.geom, (q.desde + q.hasta) / 2) as punto
    from public.work_entries x
    join public.road_sections s on s.id = x.section_id
    cross join lateral (select
      least(0.999, greatest(0.0, (x.prog_start_m - s.prog_start_m)::numeric
        / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8 as desde,
      least(1.0, greatest(0.001, (coalesce(x.prog_end_m, x.prog_start_m) - s.prog_start_m)::numeric
        / nullif(s.prog_end_m - s.prog_start_m, 0)))::float8 as hasta) q
    where x.service_id = v_sur and x.prog_start_m is not null
      and x.geom is not null and s.geom is not null and q.hasta > q.desde
  ) p
  where p.id = w.id;

end $$;
