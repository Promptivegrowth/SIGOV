-- ═══════════════════════════════════════════════════════════════════════
-- 0106 · El checklist vehicular se cumple con la foto del formato físico
--
-- SEG-V2-OBS-05/07 del consolidado: el registro es la foto del checklist
-- llenado en papel. La revisión digital «antes de salir» queda como apoyo
-- opcional y ya no da el documento por cargado.
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare d text;
begin
  d := pg_get_functiondef('public.ssoma_tablero(uuid, date, date, uuid)'::regprocedure);
  if position('when ''checklist_vehicular'' then exists' in d) > 0 then
    d := regexp_replace(d,
      'when ''checklist_vehicular'' then exists \(select 1 from public\.vehicle_checks k\s+where k\.vehicle_id = e\.vehicle_id and k\.checked_on = d\.fecha and k\.deleted_at is null\)',
      'when ''checklist_vehicular'' then false');
    if position('when ''checklist_vehicular'' then false' in d) = 0 then
      raise exception 'ssoma_tablero: no se pudo ajustar';
    end if;
    execute d;
  end if;
end $$;

-- ─── El motivo del reemplazo admite «otro» (SEG-V2-OBS-10) ───────────
do $$
declare d text;
begin
  d := pg_get_functiondef('public.registrar_reemplazo(uuid, uuid, text, text, text, text, date, text, integer, text)'::regprocedure);
  if position('''cambio_temporal'', ''otro''' in d) = 0 then
    d := replace(d, '(''mantenimiento'', ''averia'', ''reparacion'', ''cambio_temporal'')',
                    '(''mantenimiento'', ''averia'', ''reparacion'', ''cambio_temporal'', ''otro'')');
    if position('''cambio_temporal'', ''otro''' in d) = 0 then raise exception 'registrar_reemplazo: no se pudo ajustar'; end if;
    execute d;
  end if;
end $$;
