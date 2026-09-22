-- ═══════════════════════════════════════════════════════════════════════
-- Flota del contrato
--
-- Una camioneta por cuadrilla, más los equipos pesados que comparte la obra.
-- Las placas siguen el formato peruano de tres letras y tres dígitos.
--
-- Los vencimientos se reparten por toda la escalera de aviso a propósito, y
-- alguno queda con el SOAT vencido: es el caso que hay que ver funcionar,
-- porque es el que impide que el vehículo salga.
--
--   node scripts/sql.mjs file supabase/seed/0108_vehiculos.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio uuid;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_fila     record;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then
    raise exception 'No se encontró el servicio SUR.';
  end if;

  -- Una camioneta por cuadrilla, a nombre de su jefe
  for v_fila in
    select c.id, c.code, c.name, c.leader_id,
           row_number() over (order by c.code) as n
      from public.crews c
     where c.service_id = v_servicio and c.deleted_at is null
     order by c.code
  loop
    insert into public.vehicles (
      service_id, kind, plate, code, brand, model, model_year, owner,
      crew_id, driver_id,
      soat_expires_on, inspection_expires_on, policy_expires_on,
      odometer_km, next_service_km, last_service_on
    )
    select v_servicio, 'camioneta',
           (array['V4A-712','V7B-284','V2C-596','V9D-130','V5E-847','V1F-369','V8G-025'])[v_fila.n],
           'VEH-' || lpad(v_fila.n::text, 2, '0'),
           (array['Toyota','Nissan','Mitsubishi','Toyota','Nissan','Toyota','Mitsubishi'])[v_fila.n],
           (array['Hilux 4x4','Frontier','L200','Hilux 4x4','Frontier','Hilux 4x2','L200'])[v_fila.n],
           (array[2021, 2019, 2022, 2020, 2018, 2023, 2021])[v_fila.n],
           'Propio',
           v_fila.id, v_fila.leader_id,
           -- SOAT: uno vencido, otro a 5 días, el resto con holgura
           v_hoy + (array[-8, 5, 22, 48, 95, 150, 210])[v_fila.n],
           v_hoy + (array[12, 40, 6, 70, 130, 25, 180])[v_fila.n],
           v_hoy + (array[60, 18, 90, 14, 160, 200, 33])[v_fila.n],
           (array[84500, 132400, 41200, 98700, 176300, 22100, 67900])[v_fila.n],
           (array[90000, 135000, 45000, 100000, 180000, 25000, 70000])[v_fila.n],
           v_hoy - 45
     where not exists (
       select 1 from public.vehicles x
        where x.service_id = v_servicio and x.code = 'VEH-' || lpad(v_fila.n::text, 2, '0')
     );
  end loop;

  -- El equipo pesado de la obra, sin cuadrilla fija
  for v_fila in
    select * from (values
      ('VOL-901', 'volquete',        'Volvo',      'FMX 6x4',    2019, -3,  25,  40, 210400, 215000),
      ('CIS-455', 'cisterna',        'Hino',       'GH 8x4',     2020, 17,  55,  80, 143800, 150000),
      ('CAR-238', 'cargador',        'Caterpillar','924K',       2018, 41,  11, 120,  9800,  10500),
      ('ROD-117', 'rodillo',         'Bomag',      'BW 211 D-40',2021, 88,  95,  60,  5400,   6000)
    ) as x(placa, tipo, marca, modelo, anio, soat, revision, poliza, km, km_servicio)
  loop
    insert into public.vehicles (
      service_id, kind, plate, code, brand, model, model_year, owner,
      soat_expires_on, inspection_expires_on, policy_expires_on,
      odometer_km, next_service_km, last_service_on
    )
    select v_servicio, v_fila.tipo::public.vehicle_kind, v_fila.placa,
           'EQP-' || substring(v_fila.placa from 1 for 3),
           v_fila.marca, v_fila.modelo, v_fila.anio, 'Alquilado',
           v_hoy + v_fila.soat,
           v_hoy + v_fila.revision,
           v_hoy + v_fila.poliza,
           v_fila.km, v_fila.km_servicio, v_hoy - 70
     where not exists (
       select 1 from public.vehicles x
        where x.service_id = v_servicio and x.plate = v_fila.placa
     );
  end loop;
end $$;
