-- ═══════════════════════════════════════════════════════════════════════════
-- 0133 · Edición simultánea e historial de supervisor (4.º entregable,
-- CASOS 35 y 37)
--
-- 1. Cada registro editable lleva su versión. Quien guarda envía la versión
--    que abrió; si otro la cambió entretanto, la base lo rechaza con el
--    mensaje de Elvis en vez de sobrescribir en silencio. Quien no envía
--    versión (la app, los procesos internos) no se ve afectado.
-- 2. El cambio de supervisor de una cuadrilla queda en un historial: el
--    ámbito cambia al instante y lo anterior no se toca.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Versión por registro ───────────────────────────────────────────────
alter table public.plan_items add column if not exists version integer not null default 1;
alter table public.observaciones_campo add column if not exists version integer not null default 1;
alter table public.road_assets add column if not exists version integer not null default 1;
alter table public.crews add column if not exists version integer not null default 1;
alter table public.pci_items add column if not exists version integer not null default 1;

create or replace function public.t_version_optimista()
returns trigger
language plpgsql
as $$
begin
  if new.version is distinct from old.version then
    -- No 40001: la API reintenta los conflictos de serialización y se quedaría en bucle
    raise exception 'SIGOV: Este registro fue actualizado por otro usuario. Actualice la información antes de continuar.';
  end if;
  new.version := old.version + 1;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['plan_items', 'observaciones_campo', 'road_assets', 'crews', 'pci_items'] loop
    execute format('drop trigger if exists t_version_optimista on public.%I', t);
    execute format('create trigger t_version_optimista before update on public.%I for each row execute function public.t_version_optimista()', t);
  end loop;
end $$;

create or replace view public.v_plan_items with (security_invoker = true) as
 SELECT pi.id,
    pi.plan_id,
    pi.service_id,
    pi.scheduled_on,
    wp.year,
    wp.week,
    wp.status AS plan_status,
    pi.activity_id,
    a.name AS activity_name,
    a.code AS activity_code,
    a.category AS activity_category,
    a.color AS activity_color,
    pi.section_id,
    s.name AS section_name,
    s.code AS section_code,
    pi.prog_start_m,
    pi.prog_end_m,
    fmt_progresiva(pi.prog_start_m) AS prog_start_txt,
    fmt_progresiva(pi.prog_end_m) AS prog_end_txt,
    pi.crew_id,
    c.name AS crew_name,
    c.color AS crew_color,
    pi.target_qty,
    pi.executed_qty,
        CASE
            WHEN pi.target_qty > 0::numeric THEN round(LEAST(pi.executed_qty / pi.target_qty, 1::numeric) * 100::numeric, 1)
            ELSE 0::numeric
        END AS progress_pct,
    u.symbol AS unit_symbol,
    pi.status,
    pi.priority,
    pi.sort_order,
    pi.notes,
    pi.suspended_by_pci_id,
    pi.original_date,
    pi.rescheduled_to,
    pci.code AS pci_code,
    pi.created_at,
    pi.updated_at,
    pi.started_at,
    pi.finished_at,
    pi.validated_at,
    pi.impedimento,
    pi.impedimento_at,
    quien_inicio.full_name AS started_by_name,
    quien_cerro.full_name AS finished_by_name,
    quien_valido.full_name AS validated_by_name,
    a.numero_covinca AS activity_numero,
    a.carpeta_ns AS activity_carpeta_ns,
    pi.lado,
    pi.origen,
    pi.pci_item_id,
    pit.item_number AS pci_item_number,
    pci_del_item.code AS pci_item_pci_code,
    pi.subcontratada,
    c.numero AS crew_numero,
    c.sede AS crew_sede,
    sup.full_name AS supervisor_name,
    (sector_de(pi.section_id, pi.prog_start_m)).code AS sector_code,
    pi.foto_referencia_path,
    f.fotos_antes,
    f.fotos_durante,
    f.fotos_despues,
    f.fotos_general,
    pi.version
   FROM plan_items pi
     JOIN weekly_plans wp ON wp.id = pi.plan_id
     JOIN activities_catalog a ON a.id = pi.activity_id
     JOIN road_sections s ON s.id = pi.section_id
     LEFT JOIN crews c ON c.id = pi.crew_id
     LEFT JOIN units u ON u.id = COALESCE(a.unit_id, pi.unit_id)
     LEFT JOIN pcis pci ON pci.id = pi.suspended_by_pci_id
     LEFT JOIN profiles quien_inicio ON quien_inicio.id = pi.started_by
     LEFT JOIN profiles quien_cerro ON quien_cerro.id = pi.finished_by
     LEFT JOIN profiles quien_valido ON quien_valido.id = pi.validated_by
     LEFT JOIN pci_items pit ON pit.id = pi.pci_item_id
     LEFT JOIN pcis pci_del_item ON pci_del_item.id = pit.pci_id
     LEFT JOIN profiles sup ON sup.id = c.supervisor_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE e.phase = 'antes'::evidence_phase) AS fotos_antes,
            count(*) FILTER (WHERE e.phase = 'durante'::evidence_phase) AS fotos_durante,
            count(*) FILTER (WHERE e.phase = 'despues'::evidence_phase) AS fotos_despues,
            count(*) FILTER (WHERE e.phase <> ALL (ARRAY['antes'::evidence_phase, 'durante'::evidence_phase, 'despues'::evidence_phase])) AS fotos_general
           FROM evidences e
             JOIN work_entries w ON w.id = e.work_entry_id
          WHERE w.plan_item_id = pi.id AND w.deleted_at IS NULL AND e.deleted_at IS NULL) f ON true
  WHERE pi.deleted_at IS NULL;

create or replace view public.v_observaciones_campo with (security_invoker = true) as
 SELECT o.id,
    o.client_id,
    o.service_id,
    o.crew_id,
    c.name AS crew_name,
    o.section_id,
    s.code AS section_code,
    s.name AS section_name,
    s.numero AS section_numero,
    o.progresiva_m,
    fmt_progresiva(o.progresiva_m) AS progresiva_txt,
    o.side,
    o.descripcion,
    o.estado,
    o.lat,
    o.lng,
    o.observado_on,
    o.programada_on,
    o.atendida_at,
    o.nota_atencion,
    o.created_by,
    pr.full_name AS created_by_name,
    o.created_at,
    COALESCE(( SELECT array_agg(e.storage_path ORDER BY e.taken_at, e.id) AS array_agg
           FROM evidences e
             JOIN observaciones_campo h ON h.id = e.observacion_id
          WHERE COALESCE(h.punto_id, h.id) = COALESCE(o.punto_id, o.id) AND e.deleted_at IS NULL), '{}'::text[]) AS fotos,
    o.activity_id,
    a.code AS activity_code,
    a.name AS activity_name,
    a.category AS activity_category,
    u.symbol AS unit_symbol,
    o.progresiva_fin_m,
    fmt_progresiva(o.progresiva_fin_m) AS progresiva_fin_txt,
    o.metrado,
    o.plan_item_id,
    ( SELECT ss.code
           FROM service_sectors ss
          WHERE ss.section_id = o.section_id AND o.progresiva_m >= ss.prog_start_m AND o.progresiva_m <= ss.prog_end_m
          ORDER BY ss.orden
         LIMIT 1) AS sector_code,
    COALESCE(( SELECT array_agg(COALESCE(e.client_id, e.id)::text ORDER BY e.taken_at, e.id) AS array_agg
           FROM evidences e
             JOIN observaciones_campo h ON h.id = e.observacion_id
          WHERE COALESCE(h.punto_id, h.id) = COALESCE(o.punto_id, o.id) AND e.deleted_at IS NULL), '{}'::text[]) AS fotos_ids,
    COALESCE(o.punto_id, o.id) AS punto_id,
    'OBS-'::text || lpad(o.numero::text, 5, '0'::text) AS codigo,
    o.gps_lat,
    o.gps_lng,
    o.gps_precision_m,
        CASE
            WHEN o.gps_lat IS NOT NULL AND o.lat IS NOT NULL AND o.progresiva_m IS NOT NULL THEN round(st_distance(st_setsrid(st_makepoint(o.gps_lng, o.gps_lat), 4326)::geography, st_setsrid(st_makepoint(o.lng, o.lat), 4326)::geography))::integer
            ELSE NULL::integer
        END AS gps_distancia_m,
    o.version
   FROM observaciones_campo o
     LEFT JOIN crews c ON c.id = o.crew_id
     LEFT JOIN road_sections s ON s.id = o.section_id
     LEFT JOIN profiles pr ON pr.id = o.created_by
     LEFT JOIN activities_catalog a ON a.id = o.activity_id
     LEFT JOIN units u ON u.id = a.unit_id
  WHERE o.deleted_at IS NULL;

create or replace view public.v_road_assets with (security_invoker = true) as
 SELECT ra.id,
    ra.service_id,
    ra.code,
    ra.name,
    ra.type_id,
    t.name AS type_name,
    t.category AS type_category,
    t.icon AS type_icon,
    t.color AS type_color,
    ra.section_id,
    s.name AS section_name,
    ra.progresiva_m,
    fmt_progresiva(ra.progresiva_m) AS progresiva_txt,
    ra.side,
    ra.lat,
    ra.lng,
    ra.condition,
    ra.install_year,
    ra.last_inspected_on,
    ra.next_inspection_on,
    ra.attributes,
    ra.notes,
    ( SELECT count(*) AS count
           FROM asset_interventions ai
          WHERE ai.asset_id = ra.id) AS interventions_count,
    ( SELECT max(ai.intervened_on) AS max
           FROM asset_interventions ai
          WHERE ai.asset_id = ra.id) AS last_intervention_on,
    ra.created_at,
    ra.updated_at,
    ra.version
   FROM road_assets ra
     JOIN asset_types t ON t.id = ra.type_id
     LEFT JOIN road_sections s ON s.id = ra.section_id
  WHERE ra.deleted_at IS NULL;

-- ── 2 · Historial de supervisor de cada cuadrilla (CASO 37) ────────────────
create table if not exists public.crew_supervisores (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  service_id uuid not null references public.services(id),
  supervisor_anterior uuid references public.profiles(id),
  supervisor_nuevo uuid references public.profiles(id),
  motivo text,
  por uuid references public.profiles(id),
  at timestamptz not null default clock_timestamp()
);
create index if not exists crew_supervisores_crew on public.crew_supervisores (crew_id, at);
alter table public.crew_supervisores enable row level security;
drop policy if exists crew_supervisores_select on public.crew_supervisores;
create policy crew_supervisores_select on public.crew_supervisores for select to authenticated
  using (public.is_member(service_id));

create or replace function public.t_crew_supervisor_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supervisor_id is distinct from old.supervisor_id then
    insert into public.crew_supervisores (crew_id, service_id, supervisor_anterior, supervisor_nuevo, motivo, por)
    values (new.id, new.service_id, old.supervisor_id, new.supervisor_id,
            nullif(current_setting('sigov.motivo', true), ''), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists t_crew_supervisor_historial on public.crews;
create trigger t_crew_supervisor_historial after update of supervisor_id on public.crews
  for each row execute function public.t_crew_supervisor_historial();

-- El punto de partida: el supervisor de hoy de cada cuadrilla
insert into public.crew_supervisores (crew_id, service_id, supervisor_anterior, supervisor_nuevo, motivo, at)
select c.id, c.service_id, null, c.supervisor_id, 'Asignación vigente al 14/11/2026', coalesce(c.updated_at, c.created_at)
  from public.crews c
 where c.supervisor_id is not null and c.deleted_at is null
   and not exists (select 1 from public.crew_supervisores h where h.crew_id = c.id);

create or replace function public.crew_historial_supervisor(p_crew uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'at', h.at, 'anterior', pa.full_name, 'nuevo', pn.full_name, 'por', pp.full_name, 'motivo', h.motivo)
           order by h.at desc), '[]'::json)
    from public.crew_supervisores h
    left join public.profiles pa on pa.id = h.supervisor_anterior
    left join public.profiles pn on pn.id = h.supervisor_nuevo
    left join public.profiles pp on pp.id = h.por
   where h.crew_id = p_crew
$$;
revoke all on function public.crew_historial_supervisor(uuid) from public, anon;
grant execute on function public.crew_historial_supervisor(uuid) to authenticated;

-- El cambio de supervisor con su motivo: solo el administrador (CASO 37)
create or replace function public.cambiar_supervisor(p_crew uuid, p_supervisor uuid, p_motivo text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare c public.crews;
begin
  select * into c from public.crews where id = p_crew and deleted_at is null;
  if c.id is null then raise exception 'SIGOV: esa cuadrilla ya no existe'; end if;
  if not public.es_admin(c.service_id) then
    raise exception 'SIGOV: solo el administrador cambia el supervisor de una cuadrilla' using errcode = '42501';
  end if;
  if p_supervisor is not null and not exists (
    select 1 from public.service_members m where m.service_id = c.service_id and m.profile_id = p_supervisor and m.role = 'supervisor') then
    raise exception 'SIGOV: elige a un supervisor del contrato';
  end if;
  if p_supervisor is not distinct from c.supervisor_id then return json_build_object('cambio', false); end if;
  perform set_config('sigov.motivo', coalesce(nullif(trim(p_motivo), ''), ''), true);
  update public.crews set supervisor_id = p_supervisor, updated_at = now() where id = p_crew;
  return json_build_object('cambio', true);
end $$;
revoke all on function public.cambiar_supervisor(uuid, uuid, text) from public, anon;
grant execute on function public.cambiar_supervisor(uuid, uuid, text) to authenticated;
