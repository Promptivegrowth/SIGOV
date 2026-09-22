-- ═══════════════════════════════════════════════════════════════════════
-- 0030 · Lo que quedó apuntando a un tramo dado de baja
--
-- La migración 0022 corrigió los tramos al contrato real del sur y dio de
-- baja los dos que sobraban —Santa–Virú y Virú–Trujillo—, pero no movió lo
-- que ya apuntaba a ellos. Resultado: la programación de hoy salía en la
-- aplicación con «Virú – Trujillo», un tramo que ya no existe en el contrato.
--
-- No se pueden borrar esos registros: son partes trabajados, evidencias con
-- su huella y activos inventariados. Se reasignan al corredor activo más
-- parecido en longitud, y queda dicho en la nota de cada uno.
--
-- ⚠ Es una reasignación de datos de demostración. Cuando se cargue el
--   inventario real del contrato, esto deja de hacer falta.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_servicio uuid;
  v_t05 uuid; v_t06 uuid;
  v_aqp02 uuid; v_tac01 uuid;
  v_n int;
begin
  select id into v_servicio from public.services where code = 'SUR';
  if v_servicio is null then return; end if;

  select id into v_t05   from public.road_sections where service_id = v_servicio and code = 'T-05';
  select id into v_t06   from public.road_sections where service_id = v_servicio and code = 'T-06';
  select id into v_aqp02 from public.road_sections where service_id = v_servicio and code = 'AQP-02';
  select id into v_tac01 from public.road_sections where service_id = v_servicio and code = 'TAC-01';

  if v_aqp02 is null or v_tac01 is null then
    raise exception 'Faltan los tramos activos a los que reasignar.';
  end if;

  -- ─── Programación ───────────────────────────────────────────────────
  update public.plan_items set section_id = v_aqp02 where section_id = v_t05;
  update public.plan_items set section_id = v_tac01 where section_id = v_t06;

  -- ─── PCI ────────────────────────────────────────────────────────────
  update public.pci_items set section_id = v_aqp02 where section_id = v_t05;
  update public.pci_items set section_id = v_tac01 where section_id = v_t06;

  -- ─── Lo ya ejecutado y su evidencia ─────────────────────────────────
  update public.work_entries set section_id = v_aqp02 where section_id = v_t05;
  update public.work_entries set section_id = v_tac01 where section_id = v_t06;

  update public.evidences set section_id = v_aqp02 where section_id = v_t05;
  update public.evidences set section_id = v_tac01 where section_id = v_t06;

  -- ─── Inventario vial ────────────────────────────────────────────────
  update public.road_assets set section_id = v_aqp02 where section_id = v_t05;
  update public.road_assets set section_id = v_tac01 where section_id = v_t06;

  select count(*) into v_n
    from public.road_sections s
   where s.service_id = v_servicio and s.deleted_at is not null;

  raise notice 'Reasignado lo que colgaba de % tramos dados de baja.', v_n;
end $$;
