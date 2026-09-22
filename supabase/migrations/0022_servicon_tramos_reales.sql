-- ═══════════════════════════════════════════════════════════════════════
-- 0022 · El contrato real de Grupo Servicon
--
-- Hasta ahora la base traía los tramos de la costa norte, que eran los del
-- demo original. El servicio que se opera es el del sur: Arequipa, Moquegua
-- y Tacna, con COVINCA como cliente.
--
-- Los tramos NO se borran: se corrigen en su sitio. Los partes, las fotos y
-- los PCI ya registrados apuntan a esos identificadores, y borrarlos dejaría
-- huérfano el sustento de lo trabajado.
--
-- ⚠ Las progresivas de abajo son las del kilometraje de ruta y hay que
--   confirmarlas contra el contrato antes de valorizar. Están todas en este
--   bloque para que corregirlas sea cambiar cuatro líneas.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio uuid;
begin

  -- ─── El servicio ────────────────────────────────────────────────────
  select id into v_servicio from public.services where code = 'RV4';
  if v_servicio is null then
    raise notice 'No se encontró el servicio RV4; no hay nada que corregir.';
    return;
  end if;

  update public.services
     set code          = 'SUR',
         name          = 'Conservación Vial · Arequipa – Moquegua – Tacna',
         client_name   = 'COVINCA',
         contract_code = coalesce(contract_code, 'C-2026-SUR-001'),
         updated_at    = now()
   where id = v_servicio;

  -- ─── Los tramos ─────────────────────────────────────────────────────
  -- Cada corredor lleva su propio kilometraje de ruta, que es como se dicta
  -- en obra: «estamos en el 940».

  update public.road_sections
     set code = 'AQP-01', name = 'Camaná – El Pedregal – La Joya',
         prog_start_m = 840000, prog_end_m = 965000,
         color = '#6BB43B', deleted_at = null, is_active = true, updated_at = now()
   where service_id = v_servicio and code = 'T-01';

  update public.road_sections
     set code = 'AQP-02', name = 'San Camilo – Montalvo – Moquegua',
         prog_start_m = 965000, prog_end_m = 1155000,
         color = '#072D70', deleted_at = null, is_active = true, updated_at = now()
   where service_id = v_servicio and code = 'T-02';

  update public.road_sections
     set code = 'TAC-01', name = 'Tacna – Desvío Ilo',
         prog_start_m = 0, prog_end_m = 140000,
         color = '#F96414', deleted_at = null, is_active = true, updated_at = now()
   where service_id = v_servicio and code = 'T-03';

  update public.road_sections
     set code = 'TAC-02', name = 'Tacna – La Concordia',
         prog_start_m = 1293000, prog_end_m = 1333000,
         color = '#019D3F', deleted_at = null, is_active = true, updated_at = now()
   where service_id = v_servicio and code = 'T-04';

  -- Los dos tramos que sobran quedan dados de baja, no borrados: lo que se
  -- registró sobre ellos sigue teniendo dónde apoyarse.
  update public.road_sections
     set is_active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
   where service_id = v_servicio and code in ('T-05', 'T-06');

  -- ─── Las cuadrillas ─────────────────────────────────────────────────
  -- Son siete. Las cuatro que ya existían se quedan con su historia y se
  -- agregan las tres que faltaban.
  update public.crews set name = 'Cuadrilla 1 · Calzada y Drenaje',    code = 'CUA-01' where service_id = v_servicio and code = 'CUA-A';
  update public.crews set name = 'Cuadrilla 2 · Señalización',          code = 'CUA-02' where service_id = v_servicio and code = 'CUA-B';
  update public.crews set name = 'Cuadrilla 3 · Derecho de vía',        code = 'CUA-03' where service_id = v_servicio and code = 'CUA-C';
  update public.crews set name = 'Cuadrilla 4 · Emergencias 24/7',      code = 'CUA-04' where service_id = v_servicio and code = 'CUA-D';

  insert into public.crews (service_id, code, name, is_active)
  select v_servicio, x.code, x.name, true
    from (values
      ('CUA-05', 'Cuadrilla 5 · Conservación rutinaria'),
      ('CUA-06', 'Cuadrilla 6 · Puentes y obras de arte'),
      ('CUA-07', 'Cuadrilla 7 · Limpieza y roce')
    ) as x(code, name)
   where not exists (
     select 1 from public.crews c
      where c.service_id = v_servicio and c.code = x.code
   );

end $$;
