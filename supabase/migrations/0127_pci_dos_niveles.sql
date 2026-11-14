-- ═══════════════════════════════════════════════════════════════════════
-- 0127 · PCI en dos niveles, avisos por PCI, reasignación y trazabilidad
--
-- 4.º entregable (Elvis, 14/11), casos 6-8, 11, 26, 36, 39-41 y 45:
--
--   · Dos revisiones. La cuadrilla deja el ítem «Por validar»; SERVICON
--     (supervisor de la cuadrilla, residente o administrador) lo valida
--     internamente o lo observa; COVINCA (visor) da la conformidad u
--     observa, también después de la validación de SERVICON. El estado no
--     cambia de lista: «Validado SERVICON» es un ítem por validar con la
--     marca validado_servicon_at; «Conforme» es la conformidad de COVINCA.
--   · Cada revisión queda en pci_item_revisiones con su nivel, resultado,
--     motivo, quién, rol y entidad («Observado por: Visor COVINCA»).
--   · Avisos por PCI y no por ítem: «PCI 70 tiene 8 ítems observados»,
--     «PCI 70 · 5 ítems por validar». Un aviso vivo por PCI y persona que se
--     actualiza y se resuelve solo.
--   · Reasignar a otra cuadrilla deja cuadrilla anterior, nueva, quién,
--     cuándo y motivo, y avisa a la cuadrilla nueva.
--   · Metrado sobre lo solicitado: el avance guarda solicitado, ejecutado
--     acumulado, diferencia, motivo, quién y cuándo.
--   · pci_item_historial(ítem) reúne todo lo que pasó con un ítem.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Columnas ───────────────────────────────────────────────────────────
alter table public.pci_items
  add column if not exists validado_servicon_at timestamptz,
  add column if not exists validado_servicon_by uuid references public.profiles(id),
  add column if not exists observado_at timestamptz,
  add column if not exists observado_por uuid references public.profiles(id),
  add column if not exists observado_entidad text check (observado_entidad in ('SERVICON', 'COVINCA')),
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;

alter table public.work_entries
  add column if not exists solicitado numeric,
  add column if not exists exceso numeric,
  add column if not exists exceso_motivo text,
  add column if not exists exceso_por uuid references public.profiles(id),
  add column if not exists exceso_at timestamptz;
comment on column public.work_entries.exceso is
  'Lo ejecutado (acumulado de la partida o del ítem PCI) por encima de lo solicitado, al registrar o corregir este avance';

alter table public.import_batches
  add column if not exists pci_ids uuid[],
  add column if not exists rol text,
  add column if not exists valid_rows int,
  add column if not exists warning_rows int,
  add column if not exists nuevos int,
  add column if not exists duplicados int,
  add column if not exists accion text;

-- ─── El origen de cada foto (OBS 2; se usa en el historial) ────────────
alter table public.evidences
  add column if not exists origen_captura text check (origen_captura in ('camara_sigov', 'galeria', 'archivo_web')),
  add column if not exists fecha_original timestamptz,
  add column if not exists cargada_at timestamptz,
  add column if not exists sello_aplicado boolean;
comment on column public.evidences.origen_captura is 'Cámara SIGOV, galería del teléfono o archivo subido desde la web';
comment on column public.evidences.fecha_original is 'Fecha de toma que trae el archivo importado (EXIF), si la tiene';
comment on column public.evidences.cargada_at is 'Cuándo se guardó en el teléfono o se subió desde la web (no la sincronización)';

-- ─── Las revisiones, con su entidad ─────────────────────────────────────
create table if not exists public.pci_item_revisiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  pci_id uuid not null references public.pcis(id) on delete cascade,
  pci_item_id uuid not null references public.pci_items(id) on delete cascade,
  nivel text not null check (nivel in ('servicon', 'covinca')),
  resultado text not null check (resultado in ('conforme', 'observado')),
  motivo text,
  quien uuid references public.profiles(id),
  rol text,
  entidad text not null check (entidad in ('SERVICON', 'COVINCA')),
  cuando timestamptz not null default now(),
  evidencias uuid[]
);
create index if not exists ix_pci_item_revisiones_item on public.pci_item_revisiones (pci_item_id, cuando);
alter table public.pci_item_revisiones enable row level security;
drop policy if exists pci_item_revisiones_select on public.pci_item_revisiones;
create policy pci_item_revisiones_select on public.pci_item_revisiones for select to authenticated
  using (pci_item_id in (select i.id from public.pci_items i) or public.is_platform_admin());
grant select on public.pci_item_revisiones to authenticated;

-- ─── Reasignaciones de cuadrilla (CASO 36) ─────────────────────────────
create table if not exists public.reasignaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  tipo text not null check (tipo in ('pci', 'partida')),
  registro_id uuid not null,
  crew_de uuid references public.crews(id),
  crew_a uuid references public.crews(id),
  motivo text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now()
);
create index if not exists ix_reasignaciones_registro on public.reasignaciones (registro_id, cuando);
alter table public.reasignaciones enable row level security;
drop policy if exists reasignaciones_select on public.reasignaciones;
create policy reasignaciones_select on public.reasignaciones for select to authenticated
  using (service_id in (select public.mis_servicios()) or public.is_platform_admin());
grant select on public.reasignaciones to authenticated;

-- Todo cambio de cuadrilla queda anotado, venga de donde venga; el motivo lo
-- pone reasignar_cuadrilla()
create or replace function public.t_anotar_reasignacion()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_de uuid;
  v_a uuid;
begin
  if tg_table_name = 'pci_items' then
    v_de := old.assigned_crew_id; v_a := new.assigned_crew_id;
  else
    v_de := old.crew_id; v_a := new.crew_id;
  end if;
  if v_de is distinct from v_a then
    insert into public.reasignaciones (service_id, tipo, registro_id, crew_de, crew_a, motivo, quien)
    values (new.service_id, case when tg_table_name = 'pci_items' then 'pci' else 'partida' end, new.id, v_de, v_a,
            nullif(current_setting('sigov.motivo', true), ''), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists t_anotar_reasignacion on public.pci_items;
create trigger t_anotar_reasignacion after update of assigned_crew_id on public.pci_items
  for each row execute function public.t_anotar_reasignacion();
drop trigger if exists t_anotar_reasignacion on public.plan_items;
create trigger t_anotar_reasignacion after update of crew_id on public.plan_items
  for each row execute function public.t_anotar_reasignacion();

-- ─── Avisos vivos: uno por clave y persona ─────────────────────────────
create or replace function public.aviso_vivo(
  p_service uuid, p_profile uuid, p_tipo text, p_clave text,
  p_titulo text, p_cuerpo text, p_url text, p_severidad text, p_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if p_profile is null then return; end if;
  select id into v_id from public.notifications
   where profile_id = p_profile and type = p_tipo and resuelta_at is null and data->>'clave' = p_clave
   order by created_at desc limit 1;
  if v_id is null then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    values (p_service, p_profile, p_tipo, p_titulo, p_cuerpo, p_url, p_severidad, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('clave', p_clave));
  else
    update public.notifications
       set title = p_titulo, body = p_cuerpo, url = p_url, severity = p_severidad,
           data = coalesce(p_data, '{}'::jsonb) || jsonb_build_object('clave', p_clave),
           read_at = null, pushed_at = null, actualizada_at = now()
     where id = v_id;
  end if;
end $$;

create or replace function public.aviso_resolver(p_profile uuid, p_tipo text, p_clave text)
returns void language sql security definer set search_path to 'public' as $$
  update public.notifications set resuelta_at = now()
   where profile_id = p_profile and type = p_tipo and resuelta_at is null and data->>'clave' = p_clave
$$;

-- Los avisos de un PCI, recalculados: el jefe de cada cuadrilla ve cuántos
-- ítems suyos están observados; SERVICON, cuántos esperan su validación (el
-- supervisor, solo de sus cuadrillas); COVINCA, cuántos esperan su conformidad.
create or replace function public.pci_avisos(p_pci uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  p public.pcis;
  r record;
  v_n int;
begin
  select * into p from public.pcis where id = p_pci;
  if p.id is null then return; end if;

  -- Observados, al jefe de cada cuadrilla (CASO 41)
  for r in
    select c.id crew_id, c.leader_id,
           count(i.id) filter (where i.status = 'observado') n,
           (array_agg(i.item_number order by i.observado_at desc nulls last) filter (where i.status = 'observado'))[1] ultimo,
           (array_agg(i.reject_reason order by i.observado_at desc nulls last) filter (where i.status = 'observado'))[1] motivo,
           (array_agg(i.observado_entidad order by i.observado_at desc nulls last) filter (where i.status = 'observado'))[1] entidad
      from public.crews c
      left join public.pci_items i on i.assigned_crew_id = c.id and i.pci_id = p_pci and i.deleted_at is null
     where c.service_id = p.service_id and c.deleted_at is null and c.leader_id is not null
     group by c.id, c.leader_id
  loop
    if r.n > 0 then
      perform public.aviso_vivo(p.service_id, r.leader_id, 'pci_observado', 'obs:' || p_pci || ':' || r.crew_id,
        format('PCI %s tiene %s %s', public.pci_corto(p.code), r.n, case when r.n = 1 then 'ítem observado' else 'ítems observados' end),
        format('Último: ítem %s · %s%s', r.ultimo, coalesce(r.motivo, ''),
               case when r.entidad is not null then ' (' || case r.entidad when 'COVINCA' then 'Visor COVINCA' else 'Supervisor SERVICON' end || ')' else '' end),
        '/pci/' || p_pci || '?estado=observado', 'warning',
        jsonb_build_object('pci_id', p_pci, 'crew_id', r.crew_id, 'items', r.n, 'estado', 'observado'));
    else
      perform public.aviso_resolver(r.leader_id, 'pci_observado', 'obs:' || p_pci || ':' || r.crew_id);
    end if;
  end loop;

  -- Por validar, a SERVICON: el supervisor de cada cuadrilla, residente y administrador
  for r in
    select m.profile_id, m.role,
           count(i.id) n
      from public.service_members m
      left join public.pci_items i
        on i.pci_id = p_pci and i.deleted_at is null
       and i.status in ('levantado', 'subsanado') and i.validado_servicon_at is null
       and (m.role in ('admin', 'residente')
            or exists (select 1 from public.crews c where c.id = i.assigned_crew_id and c.supervisor_id = m.profile_id))
     where m.service_id = p.service_id and m.role in ('admin', 'residente', 'supervisor')
     group by m.profile_id, m.role
  loop
    if r.n > 0 then
      perform public.aviso_vivo(p.service_id, r.profile_id, 'pci_por_validar', 'val:' || p_pci,
        format('PCI %s · %s %s', public.pci_corto(p.code), r.n, case when r.n = 1 then 'ítem por validar' else 'ítems por validar' end),
        'La cuadrilla culminó con sus tres fotos. Revisa y valida, u observa con el motivo.',
        '/pci/' || p_pci || '?estado=por_validar', 'info',
        jsonb_build_object('pci_id', p_pci, 'items', r.n, 'estado', 'por_validar'));
    else
      perform public.aviso_resolver(r.profile_id, 'pci_por_validar', 'val:' || p_pci);
    end if;
  end loop;

  -- Por la conformidad de COVINCA
  select count(*) into v_n from public.pci_items i
   where i.pci_id = p_pci and i.deleted_at is null and i.status in ('levantado', 'subsanado');
  for r in select m.profile_id from public.service_members m where m.service_id = p.service_id and m.role = 'visor' loop
    if v_n > 0 then
      perform public.aviso_vivo(p.service_id, r.profile_id, 'pci_por_validar', 'cov:' || p_pci,
        format('PCI %s · %s %s', public.pci_corto(p.code), v_n, case when v_n = 1 then 'ítem por revisar' else 'ítems por revisar' end),
        'Ítems culminados por la cuadrilla. Da la conformidad u observa con el motivo.',
        '/pci/' || p_pci || '?estado=por_validar', 'info',
        jsonb_build_object('pci_id', p_pci, 'items', v_n, 'estado', 'por_validar'));
    else
      perform public.aviso_resolver(r.profile_id, 'pci_por_validar', 'cov:' || p_pci);
    end if;
  end loop;
end $$;

-- «PCI-2026-070» → «70», como lo nombra la cuadrilla
create or replace function public.pci_corto(p_codigo text)
returns text language sql immutable as $$
  select coalesce(ltrim((regexp_match(p_codigo, '(\d+)\D*$'))[1], '0'), p_codigo)
$$;

-- ─── Validar u observar, en dos niveles ─────────────────────────────────
create or replace function public.pci_validar(p_item uuid, p_conforme boolean, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.pci_items;
  v_rol public.user_role;
  v_nivel text;
  v_entidad text;
  v_estado text;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null for update;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  v_rol := public.role_in(v_fila.service_id);

  if v_rol = 'visor' then
    v_nivel := 'covinca'; v_entidad := 'COVINCA';
  elsif v_rol in ('admin', 'residente', 'supervisor') and public.revisa_cuadrilla(v_fila.service_id, v_fila.assigned_crew_id) then
    v_nivel := 'servicon'; v_entidad := 'SERVICON';
  else
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente, el administrador o COVINCA revisan este ítem' using errcode = '42501';
  end if;

  if v_fila.status not in ('levantado', 'subsanado') then
    raise exception 'SIGOV: el ítem no está por validar (está %)', v_fila.status;
  end if;
  if v_nivel = 'servicon' and v_fila.validado_servicon_at is not null and p_conforme then
    raise exception 'SIGOV: SERVICON ya validó este ítem; falta la conformidad de COVINCA';
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: la cuadrilla necesita saber qué corregir';
  end if;

  if p_conforme and v_nivel = 'servicon' then
    update public.pci_items
       set validado_servicon_at = now(), validado_servicon_by = auth.uid(), updated_at = now()
     where id = p_item;
    v_estado := 'validado_servicon';
  elsif p_conforme then
    update public.pci_items
       set status = 'validado', validated_at = now(), validated_by = auth.uid(), reject_reason = null, updated_at = now()
     where id = p_item;
    v_estado := 'validado';
  else
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_nota),
           observado_at = now(), observado_por = auth.uid(), observado_entidad = v_entidad,
           validado_servicon_at = null, validado_servicon_by = null, updated_at = now()
     where id = p_item;
    v_estado := 'observado';
  end if;

  insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad, evidencias)
  values (v_fila.service_id, v_fila.pci_id, p_item, v_nivel, case when p_conforme then 'conforme' else 'observado' end,
          nullif(trim(p_nota), ''), auth.uid(), v_rol::text, v_entidad,
          (select array_agg(e.id order by e.created_at) from public.evidences e where e.pci_item_id = p_item and e.deleted_at is null));

  perform public.pci_avisos(v_fila.pci_id);
  return json_build_object('estado', v_estado, 'nivel', v_nivel);
end $$;
grant execute on function public.pci_validar(uuid, boolean, text) to authenticated;

-- ─── Situación del PCI con todas sus cuadrillas (CASO 6) ───────────────
create or replace function public.pci_situacion(p_pci uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'pci_id', p.id, 'code', p.code,
    'items', count(i.id),
    'por_atender', count(i.id) filter (where i.status = 'pendiente'),
    'en_ejecucion', count(i.id) filter (where i.status = 'en_atencion'),
    'por_validar', count(i.id) filter (where i.status in ('levantado', 'subsanado') and i.validado_servicon_at is null),
    'validado_servicon', count(i.id) filter (where i.status in ('levantado', 'subsanado') and i.validado_servicon_at is not null),
    'observados', count(i.id) filter (where i.status = 'observado'),
    'conformes', count(i.id) filter (where i.status = 'validado'),
    'cuadrillas', (select json_agg(json_build_object('crew', c.code, 'nombre', c.name,
                     'items', x.n, 'culminados', x.hechos) order by c.code)
                   from (select assigned_crew_id, count(*) n,
                                count(*) filter (where status in ('levantado', 'subsanado', 'validado')) hechos
                           from public.pci_items where pci_id = p.id and deleted_at is null and assigned_crew_id is not null
                          group by assigned_crew_id) x
                   join public.crews c on c.id = x.assigned_crew_id))
  from public.pcis p
  left join public.pci_items i on i.pci_id = p.id and i.deleted_at is null
  where p.id = p_pci and public.is_member(p.service_id)
  group by p.id
$$;
grant execute on function public.pci_situacion(uuid) to authenticated;

-- ─── Reasignar con motivo ───────────────────────────────────────────────
create or replace function public.reasignar_cuadrilla(p_tipo text, p_ids uuid[], p_crew uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_sid uuid;
  v_n int := 0;
  v_con_cuadrilla int;
  r record;
begin
  if p_tipo not in ('pci', 'partida') then raise exception 'SIGOV: tipo no válido'; end if;
  if p_tipo = 'pci' then
    select service_id, count(*) filter (where assigned_crew_id is not null and assigned_crew_id is distinct from p_crew)
      into v_sid, v_con_cuadrilla from public.pci_items where id = any(p_ids) group by service_id;
  else
    select service_id, count(*) filter (where crew_id is not null and crew_id is distinct from p_crew)
      into v_sid, v_con_cuadrilla from public.plan_items where id = any(p_ids) group by service_id;
  end if;
  if v_sid is null then return json_build_object('cambiados', 0); end if;
  if not public.revisa_cuadrilla(v_sid, p_crew) then
    raise exception 'SIGOV: no puedes asignar a esa cuadrilla' using errcode = '42501';
  end if;
  if v_con_cuadrilla > 0 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo de la reasignación: queda en el historial';
  end if;
  perform set_config('sigov.motivo', coalesce(trim(p_motivo), ''), true);

  if p_tipo = 'pci' then
    update public.pci_items i set assigned_crew_id = p_crew, updated_at = now()
     where i.id = any(p_ids) and i.assigned_crew_id is distinct from p_crew
       and public.revisa_cuadrilla(i.service_id, i.assigned_crew_id);
    get diagnostics v_n = row_count;
    -- Un aviso por PCI a la cuadrilla nueva, no uno por ítem (CASO 6)
    for r in
      select i.pci_id, p.code, p.service_id, c.leader_id, count(*) n
        from public.pci_items i join public.pcis p on p.id = i.pci_id join public.crews c on c.id = p_crew
       where i.id = any(p_ids) and p.published_at is not null
       group by i.pci_id, p.code, p.service_id, c.leader_id
    loop
      perform public.aviso_vivo(r.service_id, r.leader_id, 'pci_publicado', 'asig:' || r.pci_id || ':' || p_crew,
        format('PCI %s asignado a su cuadrilla', public.pci_corto(r.code)),
        format('%s %s para tu cuadrilla.', r.n, case when r.n = 1 then 'ítem' else 'ítems' end),
        '/pci/' || r.pci_id, 'info', jsonb_build_object('pci_id', r.pci_id, 'crew_id', p_crew, 'items', r.n));
      perform public.pci_avisos(r.pci_id);
    end loop;
  else
    update public.plan_items i set crew_id = p_crew, updated_at = now()
     where i.id = any(p_ids) and i.crew_id is distinct from p_crew
       and public.revisa_cuadrilla(i.service_id, i.crew_id);
    get diagnostics v_n = row_count;
  end if;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('cambiados', v_n);
end $$;
grant execute on function public.reasignar_cuadrilla(text, uuid[], uuid, text) to authenticated;

-- ─── Metrado sobre lo solicitado (OBS 1, CASO 11 y 13) ─────────────────
create or replace function public.t_avance_exceso()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_solicitado numeric;
  v_otros numeric;
begin
  if new.deleted_at is not null or (new.pci_item_id is null and new.plan_item_id is null) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.quantity is not distinct from old.quantity
     and new.exceso_motivo is not distinct from old.exceso_motivo then
    return new;
  end if;
  if new.pci_item_id is not null then
    select quantity into v_solicitado from public.pci_items where id = new.pci_item_id;
    select coalesce(sum(quantity), 0) into v_otros from public.work_entries
     where pci_item_id = new.pci_item_id and deleted_at is null and id <> new.id;
  else
    select target_qty into v_solicitado from public.plan_items where id = new.plan_item_id;
    select coalesce(sum(quantity), 0) into v_otros from public.work_entries
     where plan_item_id = new.plan_item_id and deleted_at is null and id <> new.id;
  end if;
  new.solicitado := v_solicitado;
  if v_solicitado is not null and v_solicitado > 0 and v_otros + coalesce(new.quantity, 0) > v_solicitado then
    new.exceso := v_otros + coalesce(new.quantity, 0) - v_solicitado;
    new.exceso_por := coalesce(auth.uid(), new.created_by);
    new.exceso_at := now();
  else
    new.exceso := null; new.exceso_por := null; new.exceso_at := null;
  end if;
  return new;
end $$;
drop trigger if exists t_avance_exceso on public.work_entries;
create trigger t_avance_exceso before insert or update of quantity, exceso_motivo, deleted_at on public.work_entries
  for each row execute function public.t_avance_exceso();

-- ─── Historial completo de un ítem (CASO 45) ───────────────────────────
create or replace function public.pci_item_historial(p_item uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  with item as (
    select i.* from public.pci_items i
     where i.id = p_item and public.is_member(i.service_id)
  ), eventos as (
    select i.created_at cuando, 'creado' tipo,
           case when b.id is not null then 'Importado del Excel «' || coalesce(b.file_name, '') || '»' else 'Registrado' end detalle,
           coalesce(pb.full_name, pc.full_name) quien, null::text entidad
      from item i
      left join public.import_batches b on b.id = i.import_batch_id
      left join public.profiles pb on pb.id = b.created_by
      left join public.profiles pc on pc.id = i.created_by
    union all
    select p.published_at, 'publicado', 'PCI publicado a las cuadrillas', pr.full_name, null
      from item i join public.pcis p on p.id = i.pci_id left join public.profiles pr on pr.id = p.published_by
     where p.published_at is not null
    union all
    select r.cuando, 'asignado',
           case when r.crew_de is null then 'Asignado a ' || ca.name else 'Reasignado de ' || cd.name || ' a ' || coalesce(ca.name, 'sin cuadrilla') end
             || coalesce(' · motivo: ' || r.motivo, ''),
           pq.full_name, null
      from public.reasignaciones r join item i on i.id = r.registro_id
      left join public.crews cd on cd.id = r.crew_de left join public.crews ca on ca.id = r.crew_a
      left join public.profiles pq on pq.id = r.quien
    union all
    select w.created_at, 'avance',
           format('Metrado %s%s%s', trim(to_char(w.quantity, 'FM999999990.###')),
                  case when w.exceso is not null then format(' · supera lo solicitado (%s) en %s%s', trim(to_char(w.solicitado, 'FM999999990.###')),
                       trim(to_char(w.exceso, 'FM999999990.###')), coalesce(' · motivo: ' || w.exceso_motivo, '')) else '' end,
                  coalesce(' · ejecutó: ' || w.ejecutado_por, '')),
           pw.full_name, null
      from public.work_entries w join item i on i.id = w.pci_item_id
      left join public.profiles pw on pw.id = w.created_by
     where w.deleted_at is null
    union all
    select e.created_at, 'foto',
           format('Foto %s%s', coalesce(e.phase::text, 'general'),
                  case when e.origen_captura is not null then ' · origen: ' || e.origen_captura else '' end),
           pe.full_name, null
      from public.evidences e join item i on i.id = e.pci_item_id
      left join public.profiles pe on pe.id = e.created_by
     where e.deleted_at is null
    union all
    select v.cuando, 'revision',
           case v.resultado when 'conforme' then case v.nivel when 'covinca' then 'Conforme COVINCA' else 'Validado SERVICON' end
                else 'Observado: ' || coalesce(v.motivo, '') end,
           pv.full_name, v.entidad
      from public.pci_item_revisiones v join item i on i.id = v.pci_item_id
      left join public.profiles pv on pv.id = v.quien
  )
  select coalesce(json_agg(json_build_object('cuando', cuando, 'tipo', tipo, 'detalle', detalle, 'quien', quien, 'entidad', entidad)
                  order by cuando), '[]'::json)
    from eventos where cuando is not null
$$;
grant execute on function public.pci_item_historial(uuid) to authenticated;

-- ─── Levantar y las fotos: sin aviso por ítem, el aviso es por PCI ─────
CREATE OR REPLACE FUNCTION public.pci_levantar(p_item uuid, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila    public.pci_items;
  v_antes   int;
  v_durante int;
  v_despues int;
  v_metrado numeric;
  v_nuevo   public.pci_item_status;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status not in ('pendiente', 'en_atencion', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  if v_fila.requires_evidence then
    select count(*) filter (where e.phase = 'antes'),
           count(*) filter (where e.phase = 'durante'),
           count(*) filter (where e.phase = 'despues')
      into v_antes, v_durante, v_despues
      from public.evidences e
     where e.pci_item_id = p_item and e.deleted_at is null;
    if v_antes = 0 then
      raise exception 'SIGOV: falta la foto del antes';
    end if;
    if v_durante = 0 then
      raise exception 'SIGOV: falta la foto del durante: con las tres fotos el ítem pasa a «Por validar»';
    end if;
    if v_despues = 0 then
      raise exception 'SIGOV: falta la foto del después, que es la que sustenta el levantamiento';
    end if;
  end if;

  -- El metrado lo registra la cuadrilla; quien administra puede levantar
  -- desde la oficina un ítem que no se mide
  if not public.can_manage(v_fila.service_id) then
    select coalesce(sum(w.quantity), 0) into v_metrado
      from public.work_entries w
     where w.pci_item_id = p_item and w.deleted_at is null;
    if v_metrado <= 0 then
      raise exception 'SIGOV: registra primero el metrado ejecutado de este ítem';
    end if;
  end if;

  v_nuevo := case when v_fila.status = 'observado' then 'subsanado' else 'levantado' end;

  update public.pci_items
     set status = v_nuevo,
         closed_at = now(),
         closed_by = auth.uid(),
         validado_servicon_at = null,
         validado_servicon_by = null,
         notes = coalesce(nullif(trim(p_nota), ''), notes)
   where id = p_item;

  -- Un aviso por PCI a quienes revisan, no uno por ítem (CASO 26)
  perform public.pci_avisos(v_fila.pci_id);

  return json_build_object('estado', v_nuevo);
end $function$;
CREATE OR REPLACE FUNCTION public.t_pci_item_por_fotos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         validado_servicon_at = null,
         validado_servicon_by = null,
         updated_at = now()
   where id = v_item;

  -- Los avisos del PCI, recalculados (uno por PCI y persona)
  perform public.pci_avisos(i.pci_id);
  return null;
end $function$;

-- ─── Las vistas, con las dos revisiones (columnas nuevas al final) ─────
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
    (i.due_date - hoy_peru()) AS days_left,
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
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL))) AS evidence_count,
    pc.code AS pci_code,
    pc.title AS pci_title,
    pc.priority AS pci_priority,
    i.created_at,
    i.updated_at,
    i.started_at,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'antes'::evidence_phase))) AS fotos_antes,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'despues'::evidence_phase))) AS fotos_despues,
    ( SELECT count(*) AS count
           FROM evidences e
          WHERE ((e.pci_item_id = i.id) AND (e.deleted_at IS NULL) AND (e.phase = 'durante'::evidence_phase))) AS fotos_durante,
    ( SELECT COALESCE(sum(w.quantity), (0)::numeric) AS "coalesce"
           FROM work_entries w
          WHERE ((w.pci_item_id = i.id) AND (w.deleted_at IS NULL))) AS metrado_registrado,
    i.reject_reason AS observacion,
    pc.status AS pci_status,
    a.code AS activity_code,
    i.foto_referencia_path,
    (NOT (EXISTS ( SELECT 1
           FROM pci_cuadrilla_pausada z
          WHERE ((z.pci_id = i.pci_id) AND (z.crew_id = i.assigned_crew_id))))) AS activo_para_cuadrilla,
    i.encargado,
    ( SELECT string_agg(DISTINCT w.ejecutado_por, ', '::text ORDER BY w.ejecutado_por) AS string_agg
           FROM work_entries w
          WHERE ((w.pci_item_id = i.id) AND (w.deleted_at IS NULL) AND (w.ejecutado_por IS NOT NULL))) AS ejecutado_por,
    i.validado_servicon_at,
    ( SELECT pv.full_name FROM profiles pv WHERE (pv.id = i.validado_servicon_by)) AS validado_servicon_por,
    i.observado_at,
    i.observado_entidad,
    ( SELECT po.full_name FROM profiles po WHERE (po.id = i.observado_por)) AS observado_por_nombre,
    ( SELECT pc2.full_name FROM profiles pc2 WHERE (pc2.id = i.validated_by)) AS conforme_por
   FROM ((((((pci_items i
     JOIN pcis pc ON ((pc.id = i.pci_id)))
     LEFT JOIN road_sections s ON ((s.id = i.section_id)))
     LEFT JOIN activities_catalog a ON ((a.id = i.activity_id)))
     LEFT JOIN units u ON ((u.id = COALESCE(a.unit_id, i.unit_id))))
     LEFT JOIN crews c ON ((c.id = i.assigned_crew_id)))
     LEFT JOIN profiles p ON ((p.id = i.assigned_to)))
  WHERE (i.deleted_at IS NULL);

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
    count(*) FILTER (WHERE (i.status = 'pendiente'::pci_item_status)) AS pendientes,
    count(*) FILTER (WHERE (i.status = 'en_atencion'::pci_item_status)) AS en_atencion,
    count(*) FILTER (WHERE ((i.status = ANY (ARRAY['levantado'::pci_item_status, 'subsanado'::pci_item_status])) AND (i.validado_servicon_at IS NULL))) AS por_validar,
    count(*) FILTER (WHERE (i.status = 'observado'::pci_item_status)) AS observados,
    count(*) FILTER (WHERE (i.status = 'validado'::pci_item_status)) AS conformes,
    count(*) FILTER (WHERE ((i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status])) AND (i.due_date < hoy_peru()))) AS vencidos,
    count(*) FILTER (WHERE ((i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status])) AND ((i.due_date - hoy_peru()) >= 0) AND ((i.due_date - hoy_peru()) <= 1))) AS urgentes,
    min(i.due_date) FILTER (WHERE (i.status = ANY (ARRAY['pendiente'::pci_item_status, 'en_atencion'::pci_item_status, 'observado'::pci_item_status]))) AS proximo_vencimiento,
    (NOT (EXISTS ( SELECT 1
           FROM pci_cuadrilla_pausada z
          WHERE ((z.pci_id = pc.id) AND (z.crew_id = i.assigned_crew_id))))) AS activo,
    count(*) FILTER (WHERE ((i.status = ANY (ARRAY['levantado'::pci_item_status, 'subsanado'::pci_item_status])) AND (i.validado_servicon_at IS NOT NULL))) AS validado_servicon
   FROM (pcis pc
     JOIN pci_items i ON (((i.pci_id = pc.id) AND (i.deleted_at IS NULL))))
  WHERE (pc.deleted_at IS NULL)
  GROUP BY pc.id, i.assigned_crew_id;

-- Los avisos de los PCI vigentes, ya consolidados
select public.pci_avisos(id) from public.pcis where deleted_at is null;

-- Los avisos viejos por ítem quedan en el historial
update public.notifications set resuelta_at = now()
 where resuelta_at is null and type in ('pci_levantado', 'pci_observado') and data ? 'pci_item_id';
