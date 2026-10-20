-- ═══════════════════════════════════════════════════════════════════════
-- 0103 · Los documentos del día: el ATS del conductor y el PETAR
--
-- · El ATS del conductor se pide por cada vehículo asignado ese día, como el
--   checklist (P43): se fotografía, ya no se llena en el celular.
-- · El PETAR aparece cuando se sube; no es obligatorio (P44).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  antes text := pg_get_functiondef('public.ssoma_tablero(uuid, date, date, uuid)'::regprocedure);
  despues text;
begin
  -- Antes de «base as (», el cierre de «esperados»: ahí va el ATS del conductor
  despues := regexp_replace(antes, '\)\s*,\s*base as \(', $r$
    union all
    -- El ATS del conductor, uno por vehículo asignado ese día (Elvis, P43)
    select a.crew_id, d.fecha, 'ats_conductor', v.id, v.plate
      from public.crew_vehicle_assignments a
      join cuadrillas c on c.id = a.crew_id
      join public.vehicles v on v.id = a.vehicle_id
      join dias d on d.fecha >= a.start_on and (a.end_on is null or d.fecha < a.end_on)
  ),
  base as ($r$);
  despues := replace(despues, $c$doc.tipo in ('inspeccion_equipos', 'otro')$c$, $c$doc.tipo in ('inspeccion_equipos', 'petar', 'otro')$c$);
  if despues = antes or position('ats_conductor' in despues) = 0 or position('''petar''' in despues) = 0 then
    raise exception 'SIGOV 0103: ssoma_tablero cambió';
  end if;
  execute despues;
end $$;
