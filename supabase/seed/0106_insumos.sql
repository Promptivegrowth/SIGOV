-- ═══════════════════════════════════════════════════════════════════════
-- Catálogo de insumos de conservación vial
--
-- Son los materiales que realmente se consumen en mantenimiento rutinario:
-- asfaltos para bacheo y sellado, pinturas y microesferas para señalización
-- horizontal, elementos de señalización vertical, y el EPP que la cuadrilla
-- gasta. Los mínimos son el punto donde conviene reponer, no un inventario
-- objetivo.
--
--   node scripts/sql.mjs file supabase/seed/0106_insumos.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio uuid;
  v_fila     record;
  v_unidad   uuid;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then
    raise exception 'No se encontró el servicio SUR.';
  end if;

  for v_fila in
    select * from (values
      ('EMU-001', 'Emulsión asfáltica CSS-1h',            'Asfaltos',      'TN',   2.0,   2850.00),
      ('EMU-002', 'Emulsión asfáltica CRS-1',             'Asfaltos',      'TN',   1.5,   2950.00),
      ('ASF-001', 'Mezcla asfáltica en frío',             'Asfaltos',      'TN',   3.0,   1450.00),
      ('ASF-002', 'Sellador asfáltico para fisuras',      'Asfaltos',      'KG', 200.0,     12.50),
      ('AGR-001', 'Arena fina zarandeada',                'Agregados',     'M3',   8.0,     85.00),
      ('AGR-002', 'Piedra chancada de 1/2"',              'Agregados',     'M3',   6.0,    110.00),
      ('AGR-003', 'Afirmado granular',                    'Agregados',     'M3',  10.0,     75.00),
      ('PIN-001', 'Pintura de tráfico blanca',            'Señalización',  'GL',  40.0,     78.00),
      ('PIN-002', 'Pintura de tráfico amarilla',          'Señalización',  'GL',  30.0,     78.00),
      ('PIN-003', 'Microesferas de vidrio',               'Señalización',  'KG', 120.0,      9.80),
      ('PIN-004', 'Solvente para pintura de tráfico',     'Señalización',  'GL',  15.0,     42.00),
      ('SEN-001', 'Señal preventiva 0.75 × 0.75 m',       'Señalización',  'UND', 10.0,    320.00),
      ('SEN-002', 'Señal reglamentaria 0.60 × 0.90 m',    'Señalización',  'UND',  8.0,    340.00),
      ('SEN-003', 'Poste de soporte galvanizado 3 m',     'Señalización',  'UND', 15.0,    165.00),
      ('SEN-004', 'Delineador de piso reflectivo',        'Señalización',  'UND', 50.0,     18.00),
      ('GUA-001', 'Guardavía metálica tipo W · 4.00 m',   'Seguridad vial','UND',  6.0,    395.00),
      ('GUA-002', 'Poste para guardavía',                 'Seguridad vial','UND', 12.0,    128.00),
      ('GUA-003', 'Perno galvanizado para guardavía',     'Seguridad vial','UND', 80.0,      6.50),
      ('CEM-001', 'Cemento Portland tipo I · 42.5 kg',    'Obras de arte', 'UND', 20.0,     34.00),
      ('EPP-001', 'Casco de seguridad con barbiquejo',    'EPP',           'UND', 10.0,     38.00),
      ('EPP-002', 'Chaleco reflectivo clase 2',           'EPP',           'UND', 15.0,     29.00),
      ('EPP-003', 'Guantes de badana',                    'EPP',           'PAR', 30.0,     14.00),
      ('EPP-004', 'Lentes de seguridad oscuros',          'EPP',           'UND', 20.0,     12.00),
      ('EPP-005', 'Zapato de seguridad punta de acero',   'EPP',           'PAR',  8.0,    115.00),
      ('EPP-006', 'Bloqueador solar FPS 50 · 120 ml',     'EPP',           'UND', 25.0,     32.00),
      ('SEG-001', 'Cono de seguridad 70 cm',              'Seguridad vial','UND', 30.0,     45.00),
      ('SEG-002', 'Tranquera plegable',                   'Seguridad vial','UND',  8.0,    210.00),
      ('SEG-003', 'Cinta de seguridad · rollo 200 m',     'Seguridad vial','UND', 10.0,     22.00),
      ('HER-001', 'Escoba metálica',                      'Herramientas',  'UND', 10.0,     28.00),
      ('HER-002', 'Lampa cuchara',                        'Herramientas',  'UND',  8.0,     42.00),
      ('HER-003', 'Pico de acero',                        'Herramientas',  'UND',  6.0,     48.00),
      ('HER-004', 'Carretilla buggy',                     'Herramientas',  'UND',  4.0,    185.00)
    ) as x(code, name, category, unidad, minimo, costo)
  loop
    select id into v_unidad from public.units where code = v_fila.unidad;

    insert into public.supplies (service_id, code, name, category, unit_id, min_stock, unit_cost)
    select v_servicio, v_fila.code, v_fila.name, v_fila.category, v_unidad, v_fila.minimo, v_fila.costo
     where not exists (
       select 1 from public.supplies s
        where s.service_id = v_servicio and s.code = v_fila.code
     );
  end loop;

  -- Un ingreso inicial para que el almacén no arranque en cero: tres veces
  -- el mínimo de cada insumo, que es lo que suele tener una obra al abrir.
  insert into public.stock_movements (
    service_id, supply_id, kind, qty, occurred_on, supplier, document, notes
  )
  select v_servicio, s.id, 'ingreso', greatest(s.min_stock * 3, 1),
         (now() at time zone 'America/Lima')::date - 14,
         'Almacén central', 'Inventario de apertura',
         'Carga inicial del almacén del contrato'
    from public.supplies s
   where s.service_id = v_servicio
     and s.deleted_at is null
     and not exists (
       select 1 from public.stock_movements m
        where m.supply_id = s.id and m.document = 'Inventario de apertura'
     );
end $$;
