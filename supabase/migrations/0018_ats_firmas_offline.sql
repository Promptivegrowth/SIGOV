-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0018 · Firmas del ATS sincronizables sin conexión
--
-- El ATS se llena al pie del frente, muchas veces sin señal. Para que la cola
-- de sincronización pueda subir también las firmas del equipo, la tabla
-- necesita el mismo `client_id` idempotente que el resto de tablas de campo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ats_signatures
  add column if not exists client_id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ats_signatures_client_id_key'
  ) then
    alter table public.ats_signatures
      add constraint ats_signatures_client_id_key unique (client_id);
  end if;
end $$;

-- Las políticas de ats_signatures ya se apoyan en el service_id de su ATS
-- (migración 0010), así que no hay nada que cambiar en RLS.
