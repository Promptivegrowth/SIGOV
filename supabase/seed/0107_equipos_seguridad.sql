-- ═══════════════════════════════════════════════════════════════════════
-- Equipos de seguridad del contrato
--
-- Cada cuadrilla lleva extintor y botiquín en su camioneta; el almacén y la
-- oficina de obra tienen los suyos, más el kit antiderrame y la camilla.
--
-- Las fechas se reparten a propósito por toda la escalera de avisos —vencido,
-- 7, 15 y 30 días, y con holgura— para que la pantalla de vencimientos se
-- pueda probar de verdad y no con todo en verde.
--
--   node scripts/sql.mjs file supabase/seed/0107_equipos_seguridad.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio uuid;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_fila     record;
  v_cuadrilla uuid;
  v_n        int := 0;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then
    raise exception 'No se encontró el servicio SUR.';
  end if;

  -- Uno de cada equipo por cuadrilla, con vencimientos escalonados
  for v_fila in
    select c.id, c.code, c.name,
           row_number() over (order by c.code) as n
      from public.crews c
     where c.service_id = v_servicio and c.deleted_at is null
     order by c.code
  loop
    -- Extintor de la camioneta
    insert into public.safety_equipment (
      service_id, kind, code, description, brand, capacity,
      crew_id, location, holder_id, expires_on, next_check_on, last_check_on
    )
    select v_servicio, 'extintor',
           'EXT-' || lpad(v_fila.n::text, 3, '0'),
           'Extintor PQS de la camioneta · ' || v_fila.name,
           'Kidde', '6 kg PQS',
           v_fila.id, 'Camioneta de la cuadrilla',
           (select leader_id from public.crews where id = v_fila.id),
           -- −20, 5, 12, 25, 60, 120, 200 días según la cuadrilla
           v_hoy + (array[-20, 5, 12, 25, 60, 120, 200])[((v_fila.n - 1) % 7) + 1],
           v_hoy + (array[-5, 3, 20, 40, 75, 90, 150])[((v_fila.n - 1) % 7) + 1],
           v_hoy - 90
     where not exists (
       select 1 from public.safety_equipment e
        where e.service_id = v_servicio and e.code = 'EXT-' || lpad(v_fila.n::text, 3, '0')
     );

    -- Botiquín
    insert into public.safety_equipment (
      service_id, kind, code, description, brand, capacity,
      crew_id, location, holder_id, expires_on, next_check_on, last_check_on
    )
    select v_servicio, 'botiquin',
           'BOT-' || lpad(v_fila.n::text, 3, '0'),
           'Botiquín de primeros auxilios · ' || v_fila.name,
           'Medix', 'Tipo A',
           v_fila.id, 'Camioneta de la cuadrilla',
           (select leader_id from public.crews where id = v_fila.id),
           v_hoy + (array[10, -3, 45, 8, 90, 18, 150])[((v_fila.n - 1) % 7) + 1],
           v_hoy + (array[14, 30, 60, 6, 45, 22, 100])[((v_fila.n - 1) % 7) + 1],
           v_hoy - 60
     where not exists (
       select 1 from public.safety_equipment e
        where e.service_id = v_servicio and e.code = 'BOT-' || lpad(v_fila.n::text, 3, '0')
     );

    v_n := v_n + 1;
  end loop;

  -- Los del almacén y la oficina, sin cuadrilla asignada
  select id into v_cuadrilla from public.crews
   where service_id = v_servicio and code = 'CUA-01' limit 1;

  for v_fila in
    select * from (values
      ('EXT-101', 'extintor',        'Extintor del almacén de obra',     'Kidde', '12 kg PQS',  'Almacén de obra',     40,  25),
      ('EXT-102', 'extintor',        'Extintor de la oficina de obra',   'Kidde', '4 kg CO2',   'Oficina de obra',    -10,  -2),
      ('KIT-001', 'kit_antiderrame', 'Kit antiderrame de hidrocarburos', 'Spill', '50 L',       'Almacén de obra',     70,  35),
      ('KIT-002', 'kit_antiderrame', 'Kit antiderrame de la cisterna',   'Spill', '120 L',      'Cisterna de agua',    13,   9),
      ('CAM-001', 'camilla',         'Camilla rígida con inmovilizador', 'Medix', 'Estándar',   'Oficina de obra',    365, 180),
      ('LAV-001', 'lavaojos',        'Estación lavaojos portátil',       'Haws',  '16 L',       'Almacén de obra',     28,  11)
    ) as x(code, kind, descripcion, marca, capacidad, ubicacion, dias_vence, dias_revision)
  loop
    insert into public.safety_equipment (
      service_id, kind, code, description, brand, capacity,
      location, expires_on, next_check_on, last_check_on
    )
    select v_servicio, v_fila.kind::public.safety_equipment_kind, v_fila.code,
           v_fila.descripcion, v_fila.marca, v_fila.capacidad,
           v_fila.ubicacion,
           v_hoy + v_fila.dias_vence,
           v_hoy + v_fila.dias_revision,
           v_hoy - 75
     where not exists (
       select 1 from public.safety_equipment e
        where e.service_id = v_servicio and e.code = v_fila.code
     );
  end loop;

  raise notice 'Equipos de seguridad sembrados para % cuadrillas.', v_n;
end $$;
