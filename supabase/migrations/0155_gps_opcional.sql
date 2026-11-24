-- ═══════════════════════════════════════════════════════════════════════════
-- 0155 · GPS opcional en las fotos (revisión visual 18/11, ajuste J06 del
-- jefe): fecha y hora son obligatorias; el GPS no es un requisito universal.
-- Una foto tomada sin señal se guarda sin coordenadas (no con 0,0, que
-- inventa una ubicación en el océano). Lo demás de la evidencia sigue siendo
-- inmutable.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.evidences alter column lat drop not null;
alter table public.evidences alter column lng drop not null;

create or replace function public.evidence_set_geom()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  -- Sin GPS (o el 0,0 de un equipo sin señal) no hay punto
  if new.lat is null or new.lng is null or (new.lat = 0 and new.lng = 0) then
    new.lat := null; new.lng := null; new.geom := null;
  else
    new.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(new.lng, new.lat), 4326);
  end if;
  return new;
end $$;
