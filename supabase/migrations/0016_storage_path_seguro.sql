-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0016 · Endurecer la resolución de servicio desde la ruta de Storage
--
-- Hallazgo de la auditoría de flujo: `storage_service_id` hacía un cast directo
-- a uuid del primer segmento de la ruta. Si ese segmento no era un uuid, el
-- cast lanzaba una excepción y la política de RLS de Storage fallaba entera,
-- dejando la imagen inaccesible en lugar de simplemente denegarla.
--
-- Ahora devuelve NULL ante cualquier ruta que no empiece por un uuid: la
-- política deniega el acceso de forma limpia, sin romper la evaluación.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.storage_service_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_first text;
begin
  v_first := split_part(coalesce(p_name, ''), '/', 1);
  if v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_first::uuid;
exception when others then
  return null;
end $$;

grant execute on function public.storage_service_id(text) to authenticated;
