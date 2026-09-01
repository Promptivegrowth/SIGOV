-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0021 · La base de datos trabaja en hora del Perú
--
-- El servidor venía en UTC. Como Lima va cinco horas por detrás, todos los
-- días a partir de las 19:00 la base ya creía estar en el día siguiente: un
-- parte abierto a las 20:00 del 31 nacía fechado el 1. Y los plazos de PCI,
-- las charlas y los checklists heredaban el mismo error.
--
-- Toda la operación ocurre en el Perú, así que la zona de la base es
-- America/Lima. Los `timestamptz` ya guardados no se mueven —siguen siendo el
-- mismo instante—, solo cambian de qué lado se leen `current_date` y `now()`.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_db text := current_database();
begin
  execute format('alter database %I set timezone to %L', v_db, 'America/Lima');
end $$;

-- Los roles con los que entra la aplicación, para que no dependa de qué
-- conexión atienda la petición
do $$
declare
  r text;
begin
  foreach r in array array['authenticator', 'anon', 'authenticated', 'service_role', 'postgres'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter role %I set timezone to %L', r, 'America/Lima');
    end if;
  end loop;
end $$;

-- ─── Fecha de hoy en el Perú, para usar en el código ─────────────────────
-- Deja explícito lo que significa «hoy» aunque alguna conexión llegue con
-- otra zona configurada.
create or replace function public.hoy_peru()
returns date
language sql stable
set search_path = public
as $$
  select (now() at time zone 'America/Lima')::date
$$;

grant execute on function public.hoy_peru() to authenticated, anon, service_role;

comment on function public.hoy_peru() is
  'La fecha de hoy en hora del Perú. Usar en lugar de current_date cuando importe el día calendario de la operación.';
