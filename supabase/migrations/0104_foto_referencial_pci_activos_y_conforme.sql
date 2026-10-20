-- ═══════════════════════════════════════════════════════════════════════
-- 0104 · Foto referencial, tramo de cada cuadrilla, PCI activos y el
-- estado del ítem PCI por sus fotos (videos de Elvis del 13/10/2026)
--
-- · Foto referencial: la carga el supervisor al programar una partida, y el
--   supervisor o el visor COVINCA en un ítem PCI, para que el capataz vea
--   «dónde queda, a la izquierda, a la derecha, dónde está una piedra».
-- · Tramo fijo de cada cuadrilla, por su subtramo (1 → AQP-01, 2 → AQP-02,
--   3 → TAC-01, 4 → TAC-02: los sectores 1.x, 2.x, 3.x y 4.x).
-- · PCI activos: el supervisor puede pausar un PCI para una cuadrilla; al
--   publicarlo queda activo.
-- · El ítem cambia solo con las fotos: con la primera pasa a «en ejecución»
--   y con las tres etapas (antes, durante y después) queda conforme y pasa a
--   revisión de COVINCA. Ya no hace falta «levantarlo» a mano.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Foto referencial ────────────────────────────────────────────────
alter table public.plan_items add column if not exists foto_referencia_path text;
alter table public.pci_items add column if not exists foto_referencia_path text;
comment on column public.plan_items.foto_referencia_path is 'Foto referencial de la partida (bucket documentos), la carga el supervisor al programar';
comment on column public.pci_items.foto_referencia_path is 'Foto referencial del ítem (bucket documentos), la cargan el supervisor o el visor COVINCA';

-- El visor no escribe en documentos, salvo sus fotos referenciales
drop policy if exists documentos_insert_referencias on storage.objects;
create policy documentos_insert_referencias on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and name like '%/referencias/%'
    and public.role_in(public.storage_service_id(name)) = 'visor'
  );

/** Fija o quita (p_path null) la foto referencial de una partida o de un ítem PCI. */
create or replace function public.fijar_foto_referencial(p_tabla text, p_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_servicio uuid;
begin
  if p_tabla = 'plan_items' then
    select service_id into v_servicio from public.plan_items where id = p_id and deleted_at is null;
  elsif p_tabla = 'pci_items' then
    select service_id into v_servicio from public.pci_items where id = p_id and deleted_at is null;
  else
    raise exception 'SIGOV: tabla no válida';
  end if;
  if v_servicio is null then raise exception 'SIGOV: no se encontró el registro'; end if;

  if not (public.can_manage(v_servicio)
          or (p_tabla = 'pci_items' and public.role_in(v_servicio) = 'visor')) then
    raise exception 'SIGOV: la foto referencial la cargan el supervisor o el visor COVINCA' using errcode = '42501';
  end if;
  if p_path is not null and (split_part(p_path, '/', 1) <> v_servicio::text or position('/referencias/' in p_path) = 0) then
    raise exception 'SIGOV: ruta de la foto no válida';
  end if;

  if p_tabla = 'plan_items' then
    update public.plan_items set foto_referencia_path = p_path, updated_at = now() where id = p_id;
  else
    update public.pci_items set foto_referencia_path = p_path, updated_at = now() where id = p_id;
  end if;
end $$;

revoke execute on function public.fijar_foto_referencial(text, uuid, text) from anon, public;
grant execute on function public.fijar_foto_referencial(text, uuid, text) to authenticated;

-- ─── El tramo de cada cuadrilla ──────────────────────────────────────
update public.crews c set section_id = s.id, updated_at = now()
  from (values (1, 'AQP-01'), (2, 'AQP-02'), (3, 'TAC-01'), (4, 'TAC-02')) as m(subtramo, tramo)
  join public.road_sections s on s.code = m.tramo
 where c.service_id = '22222222-2222-4222-8222-222222222221'
   and s.service_id = c.service_id and s.deleted_at is null
   and c.subtramo = m.subtramo and c.deleted_at is null;

-- ─── PCI activos por cuadrilla ───────────────────────────────────────
create table if not exists public.pci_cuadrilla_pausada (
  pci_id     uuid not null references public.pcis(id) on delete cascade,
  crew_id    uuid not null references public.crews(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (pci_id, crew_id)
);
comment on table public.pci_cuadrilla_pausada is 'PCI que el supervisor pausó para una cuadrilla: la cuadrilla no lo ve en su celular hasta reactivarlo';
alter table public.pci_cuadrilla_pausada enable row level security;
drop policy if exists pci_cuadrilla_pausada_select on public.pci_cuadrilla_pausada;
create policy pci_cuadrilla_pausada_select on public.pci_cuadrilla_pausada for select using (public.is_member(service_id));
drop policy if exists pci_cuadrilla_pausada_escribir on public.pci_cuadrilla_pausada;
create policy pci_cuadrilla_pausada_escribir on public.pci_cuadrilla_pausada for all
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));
grant select, insert, delete on public.pci_cuadrilla_pausada to authenticated;

-- ─── El estado del ítem por sus fotos ────────────────────────────────
create or replace function public.t_pci_item_por_fotos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item uuid := coalesce(new.pci_item_id, old.pci_item_id);
  i public.pci_items;
  a int; d int; dp int;
  v_nuevo public.pci_item_status;
begin
  if v_item is null then return null; end if;
  select * into i from public.pci_items where id = v_item and deleted_at is null for update;
  if not found or not i.requires_evidence then return null; end if;

  select count(*) filter (where phase = 'antes'),
         count(*) filter (where phase = 'durante'),
         count(*) filter (where phase = 'despues')
    into a, d, dp
    from public.evidences where pci_item_id = v_item and deleted_at is null;

  v_nuevo := case
    -- Las tres etapas: conforme, a revisión de COVINCA
    when a > 0 and d > 0 and dp > 0 and i.status in ('pendiente', 'en_atencion') then 'levantado'
    -- Lo observado que se vuelve a fotografiar con las tres etapas: subsanado
    when a > 0 and d > 0 and dp > 0 and i.status = 'observado' and tg_op = 'INSERT' then 'subsanado'
    -- La primera foto: en ejecución
    when (a + d + dp) > 0 and i.status = 'pendiente' then 'en_atencion'
    -- Si se quitó una foto antes de la revisión, vuelve a ejecución
    when not (a > 0 and d > 0 and dp > 0) and i.status in ('levantado', 'subsanado') then 'en_atencion'
    else null
  end;
  if v_nuevo is null or v_nuevo = i.status then return null; end if;

  update public.pci_items
     set status = v_nuevo,
         started_at = coalesce(started_at, now()),
         closed_at = case when v_nuevo in ('levantado', 'subsanado') then now() else null end,
         closed_by = case when v_nuevo in ('levantado', 'subsanado') then coalesce(new.created_by, auth.uid()) else null end,
         updated_at = now()
   where id = v_item;

  -- Quien revisa se entera de que hay algo que mirar
  if v_nuevo in ('levantado', 'subsanado') then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select i.service_id, m.profile_id, 'pci_levantado',
           format('%s · ítem %s %s', p.code, i.item_number,
                  case when v_nuevo = 'subsanado' then 'subsanado' else 'con sus tres fotos' end),
           left(i.description, 160), '/pci/' || i.pci_id, 'info',
           jsonb_build_object('pci_item_id', i.id)
      from public.service_members m
      join public.pcis p on p.id = i.pci_id
     where m.service_id = i.service_id and m.role in ('admin', 'supervisor', 'residente', 'visor');
  end if;
  return null;
end $$;

drop trigger if exists t_pci_item_por_fotos on public.evidences;
create trigger t_pci_item_por_fotos after insert or update of deleted_at, phase, pci_item_id or delete on public.evidences
  for each row execute function public.t_pci_item_por_fotos();

-- Lo que ya tenía sus tres fotos queda conforme desde ya
update public.pci_items i set status = 'levantado', closed_at = coalesce(closed_at, now()), updated_at = now()
 where i.deleted_at is null and i.requires_evidence and i.status in ('pendiente', 'en_atencion')
   and exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'antes')
   and exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'durante')
   and exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'despues');

-- ─── Las vistas llevan la foto referencial y si el PCI está activo ───
create or replace view public.v_pci_items with (security_invoker = true) as
SELECT i.id,
    i.pci_id,
    i.service_id,
    i.item_number,
    i.description,
    i.section_id,
    s.name AS section_name,
    s.code AS section_code,
    i.prog_start_m,
    i.prog_end_m,
    i.side,
    fmt_progresiva(i.prog_start_m) AS prog_start_txt,
    fmt_progresiva(i.prog_end_m) AS prog_end_txt,
    i.activity_id,
    a.name AS activity_name,
    i.quantity,
    u.symbol AS unit_symbol,
    i.term_days,
    i.due_date,
    i.due_date - hoy_peru() AS days_left,
    pci_item_semaforo(i.due_date, i.term_days, i.status) AS semaforo,
    i.status,
    i.assigned_crew_id,
    c.name AS crew_name,
    i.assigned_to,
    p.full_name AS assignee_name,
    i.requires_evidence,
    i.closed_at,
    i.validated_at,
    i.notes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL) AS evidence_count,
    pc.code AS pci_code,
    pc.title AS pci_title,
    pc.priority AS pci_priority,
    i.created_at,
    i.updated_at,
    i.started_at,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'antes'::evidence_phase) AS fotos_antes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'despues'::evidence_phase) AS fotos_despues,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE e.pci_item_id = i.id AND e.deleted_at IS NULL AND e.phase = 'durante'::evidence_phase) AS fotos_durante,
    ( SELECT COALESCE(sum(w.quantity), 0::numeric) AS "coalesce"
           FROM work_entries w
          WHERE w.pci_item_id = i.id AND w.deleted_at IS NULL) AS metrado_registrado,
    i.reject_reason AS observacion,
    pc.status AS pci_status,
    a.code AS activity_code,
    i.foto_referencia_path,
    NOT (EXISTS ( SELECT 1 FROM pci_cuadrilla_pausada z WHERE z.pci_id = i.pci_id AND z.crew_id = i.assigned_crew_id)) AS activo_para_cuadrilla
   FROM pci_items i
     JOIN pcis pc ON pc.id = i.pci_id
     LEFT JOIN road_sections s ON s.id = i.section_id
     LEFT JOIN activities_catalog a ON a.id = i.activity_id
     LEFT JOIN units u ON u.id = i.unit_id
     LEFT JOIN crews c ON c.id = i.assigned_crew_id
     LEFT JOIN profiles p ON p.id = i.assigned_to
  WHERE i.deleted_at IS NULL;

create or replace view public.v_pci_resumen with (security_invoker = true) as
SELECT pc.id AS pci_id,
    pc.service_id,
    pc.code,
    pc.title,
    pc.status AS pci_status,
    pc.received_on,
    pc.notified_on,
    i.assigned_crew_id AS crew_id,
    count(*) AS items,
    count(*) FILTER (WHERE i.status = 'pendiente'::pci_item_status) AS pendientes,
    count(*) FILTER (WHERE i.status = 'en_atencion'::pci_item_status) AS en_atencion,
    count(*) FILTER (WHERE i.status = ANY (ARRAY['levantado'::pci_item_status, 'subsanado'::pci_item_status])) AS por_validar,
    count(*) FILTER (WHERE i.status = 'observado'::pci_item_status) AS observados,
    count(*) FILTER (WHERE i.status = 'validado'::pci_item_status) AS conformes,
    count(*) FILTER (WHERE (i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status])) AND i.due_date < hoy_peru()) AS vencidos,
    count(*) FILTER (WHERE (i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status])) AND (i.due_date - hoy_peru()) >= 0 AND (i.due_date - hoy_peru()) <= 1) AS urgentes,
    min(i.due_date) FILTER (WHERE i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status])) AS proximo_vencimiento,
    NOT (EXISTS ( SELECT 1 FROM pci_cuadrilla_pausada z WHERE z.pci_id = pc.id AND z.crew_id = i.assigned_crew_id)) AS activo
   FROM pcis pc
     JOIN pci_items i ON i.pci_id = pc.id AND i.deleted_at IS NULL
  WHERE pc.deleted_at IS NULL
  GROUP BY pc.id, i.assigned_crew_id;

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
    pi.foto_referencia_path
   FROM plan_items pi
     JOIN weekly_plans wp ON wp.id = pi.plan_id
     JOIN activities_catalog a ON a.id = pi.activity_id
     JOIN road_sections s ON s.id = pi.section_id
     LEFT JOIN crews c ON c.id = pi.crew_id
     LEFT JOIN units u ON u.id = pi.unit_id
     LEFT JOIN pcis pci ON pci.id = pi.suspended_by_pci_id
     LEFT JOIN profiles quien_inicio ON quien_inicio.id = pi.started_by
     LEFT JOIN profiles quien_cerro ON quien_cerro.id = pi.finished_by
     LEFT JOIN profiles quien_valido ON quien_valido.id = pi.validated_by
     LEFT JOIN pci_items pit ON pit.id = pi.pci_item_id
     LEFT JOIN pcis pci_del_item ON pci_del_item.id = pit.pci_id
     LEFT JOIN profiles sup ON sup.id = c.supervisor_id
  WHERE pi.deleted_at IS NULL;


-- ─── Duplicar la semana copia también el lado y la foto referencial ──
do $$
declare d text;
begin
  d := pg_get_functiondef('public.duplicar_semana'::regproc);
  if position('foto_referencia_path' in d) = 0 then
    d := replace(d, 'status, priority, sort_order, notes, created_by
  )', 'status, priority, sort_order, notes, created_by, lado, foto_referencia_path
  )');
    d := replace(d, '    pi.notes,
    auth.uid()
  from public.plan_items pi', '    pi.notes,
    auth.uid(),
    pi.lado,
    pi.foto_referencia_path
  from public.plan_items pi');
    if position('pi.foto_referencia_path' in d) = 0 or position('created_by, lado, foto_referencia_path' in d) = 0 then
      raise exception 'duplicar_semana: no se pudo ajustar';
    end if;
    execute d;
  end if;
end $$;
