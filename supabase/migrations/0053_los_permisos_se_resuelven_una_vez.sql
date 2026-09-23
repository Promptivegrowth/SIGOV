-- ═══════════════════════════════════════════════════════════════════════
-- 0053 · Los permisos se resuelven una vez, no una vez por fila
--
-- Pedir el inventario con su semáforo tardaba casi cinco segundos y la app
-- de campo moría de «statement timeout» al pasar de la primera página.
-- Midiendo columna por columna salió dónde: pedir solo `id` costaba 840 ms,
-- pero añadir `semaforo` lo llevaba a 3 800. Todo lo que toca
-- `asset_interventions` —el semáforo, la última intervención, el conteo— se
-- disparaba; lo de fotografías, no.
--
-- La causa es cómo se escribieron las políticas de lectura:
--
--     using ( is_member(service_id) )
--
-- `is_member` recibe una columna, así que PostgreSQL no puede resolverla una
-- vez: la llama por cada fila. Sobre las 12 379 intervenciones del contrato
-- son 12 379 llamadas, cada una con su `exists` contra `service_members` y
-- su comprobación de administrador de plataforma.
--
-- La forma equivalente que sí se resuelve una sola vez es preguntar por
-- pertenencia a un conjunto que no dependa de la fila:
--
--     using ( service_id in (select ... where profile_id = auth.uid()) )
--
-- Ese subselect no mira la fila, así que el planificador lo evalúa una vez,
-- lo mete en una tabla hash y cada fila pasa a ser una búsqueda. Concede
-- exactamente lo mismo que antes —quien es miembro del contrato lee, quien
-- no, no— y además sigue dejando entrar al administrador de plataforma.
--
-- Se cambian solo las tablas grandes, que son donde se nota. El resto
-- quedan como están: en una tabla de doscientas filas la diferencia no
-- justifica tocar una política de seguridad.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── El conjunto de contratos del usuario, resuelto de una vez ─────────

create or replace function public.mis_servicios()
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select m.service_id
  from public.service_members m
  where m.profile_id = auth.uid()
$$;

comment on function public.mis_servicios is
  'Los contratos a los que pertenece quien consulta. Se usa dentro de las '
  'políticas de lectura como subconsulta no correlacionada, para que el '
  'permiso se resuelva una vez por consulta y no una vez por fila.';

grant execute on function public.mis_servicios() to authenticated;

-- ─── Las tablas donde se nota ──────────────────────────────────────────

do $$
declare
  t text;
  -- Las que tienen volumen: miles de filas que se leen juntas
  tablas text[] := array[
    'asset_interventions',
    'road_assets',
    'evidences',
    'evidence_links',
    'work_entries',
    'plan_items',
    'pci_items'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          service_id in (select public.mis_servicios())
          or (select public.is_platform_admin())
        )
    $f$, t || '_select', t);
  end loop;
end $$;

-- ─── `evidence_links` no siempre trae el contrato ──────────────────────
-- Algunas filas antiguas se guardaron sin `service_id`; con la política
-- nueva dejarían de verse. Se completa desde la evidencia a la que apuntan.

update public.evidence_links l
set service_id = e.service_id
from public.evidences e
where l.evidence_id = e.id
  and l.service_id is null
  and e.service_id is not null;

-- ─── Lo que las agrupaciones recorren ──────────────────────────────────

create index if not exists ix_intervenciones_servicio_activo
  on public.asset_interventions (service_id, asset_id);

create index if not exists ix_evidence_links_servicio
  on public.evidence_links (service_id, asset_id)
  where asset_id is not null;
