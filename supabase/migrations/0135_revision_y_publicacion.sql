-- ═══════════════════════════════════════════════════════════════════════════
-- 0135 · Revisión y publicación (revisión visual de Elvis del 18/11, T1)
--
-- Guía de roles, apartados 2.5, 2.15, 3.6 y 9; decisiones confirmadas:
--   · Estados separados: ejecución · evidencia · revisión SERVICON ·
--     publicación · revisión COVINCA · plazo.
--   · Solo el Residente publica a COVINCA, después de la validación
--     SERVICON. El Visor COVINCA ve únicamente lo publicado.
--   · Observar crea un caso (OBS-<ítem>-NN) con su hilo: Abierta →
--     Respondida → Cerrada; reabrir con motivo. Responder no crea otra
--     ejecución: se subsana la misma intervención con nueva versión.
--   · COVINCA decide sobre la versión vigente (control de versión) y no da
--     conformidad con evidencia incompleta.
--   · Un usuario no valida su propio trabajo.
--   · Avisos agrupados por PCI, nunca uno por ítem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Publicación y revisión COVINCA, en campos propios ─────────────────
alter table public.pci_items
  add column if not exists publicacion_version integer not null default 0,
  add column if not exists publicado_at timestamptz,
  add column if not exists publicado_por uuid references public.profiles(id),
  add column if not exists publicacion_pendiente boolean not null default false,
  add column if not exists covinca_estado text not null default 'sin_revisar'
    check (covinca_estado in ('sin_revisar', 'por_revisar', 'conforme', 'observado')),
  add column if not exists covinca_version integer;

comment on column public.pci_items.publicacion_version is 'Versión publicada a COVINCA (0 = borrador interno). Solo el Residente publica.';
comment on column public.pci_items.publicacion_pendiente is 'Hubo cambios de evidencia después de la última publicación: nueva versión pendiente.';
comment on column public.pci_items.covinca_estado is 'Revisión COVINCA de la versión publicada: sin_revisar, por_revisar, conforme u observado.';

alter table public.evidences
  add column if not exists publicada_version integer;
comment on column public.evidences.publicada_version is 'Primera versión publicada a COVINCA que incluye esta foto; null = interna, el Visor no la ve.';

alter table public.work_orders
  add column if not exists publicacion_version integer not null default 0,
  add column if not exists publicado_at timestamptz,
  add column if not exists publicado_por uuid references public.profiles(id);

-- Un parte validado no se modifica, salvo su publicación (que no toca el contenido)
create or replace function public.t_work_order_revision()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if (to_jsonb(new) - 'publicacion_version' - 'publicado_at' - 'publicado_por' - 'updated_at')
     = (to_jsonb(old) - 'publicacion_version' - 'publicado_at' - 'publicado_por' - 'updated_at') then
    return new;
  end if;
  if public.can_manage(new.service_id) then return new; end if;
  if new.status is distinct from old.status and new.status in ('validado', 'observado') then
    raise exception 'SIGOV: solo el supervisor valida u observa un parte' using errcode = '42501';
  end if;
  if old.status = 'validado' then
    raise exception 'SIGOV: el parte ya está validado; ya no se modifica' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_notes is distinct from old.review_notes then
    raise exception 'SIGOV: la revisión del parte la hace el supervisor' using errcode = '42501';
  end if;
  return new;
end $function$;

-- Lo histórico: lo que COVINCA ya revisó se dio por publicado (v1)
update public.pci_items
   set publicacion_version = 1, publicado_at = coalesce(validado_servicon_at, validated_at, observado_at, updated_at),
       covinca_estado = case when status = 'validado' then 'conforme' else 'observado' end, covinca_version = 1
 where publicacion_version = 0 and deleted_at is null
   and (status = 'validado' or (status = 'observado' and observado_entidad = 'COVINCA'));
update public.evidences e set publicada_version = 1
  from public.pci_items i
 where e.pci_item_id = i.id and i.publicacion_version = 1 and e.publicada_version is null and e.deleted_at is null;
-- Los partes ya validados quedan publicados como v1 (el Visor los consultaba)
update public.work_orders set publicacion_version = 1, publicado_at = coalesce(reviewed_at, updated_at)
 where status = 'validado' and publicacion_version = 0 and deleted_at is null;
update public.evidences e set publicada_version = 1
  from public.work_entries w join public.work_orders o on o.id = w.work_order_id
 where e.work_entry_id = w.id and o.publicacion_version = 1 and e.publicada_version is null and e.deleted_at is null;

-- Cada publicación, con lo que se compartió
create table if not exists public.pci_item_publicaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  pci_id uuid not null references public.pcis(id) on delete cascade,
  pci_item_id uuid not null references public.pci_items(id) on delete cascade,
  version integer not null,
  evidencias uuid[] not null default '{}',
  nota text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp(),
  unique (pci_item_id, version)
);
alter table public.pci_item_publicaciones enable row level security;
drop policy if exists pci_item_publicaciones_select on public.pci_item_publicaciones;
create policy pci_item_publicaciones_select on public.pci_item_publicaciones for select to authenticated
  using (exists (select 1 from public.pci_items i where i.id = pci_item_publicaciones.pci_item_id));
insert into public.pci_item_publicaciones (service_id, pci_id, pci_item_id, version, evidencias, nota, cuando)
select i.service_id, i.pci_id, i.id, 1,
       coalesce((select array_agg(e.id order by e.created_at) from public.evidences e where e.pci_item_id = i.id and e.publicada_version = 1), '{}'),
       'Publicación inicial (registro histórico)', i.publicado_at
  from public.pci_items i
 where i.publicacion_version = 1
on conflict do nothing;

-- ── 2 · Observaciones de revisión: casos con hilo ─────────────────────────
create table if not exists public.revision_observaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  service_id uuid not null references public.services(id),
  pci_id uuid references public.pcis(id) on delete cascade,
  pci_item_id uuid references public.pci_items(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  origen text not null check (origen in ('SERVICON', 'COVINCA')),
  fase text check (fase in ('antes', 'durante', 'despues', 'general', 'metrado', 'otro')),
  motivo text not null check (length(trim(motivo)) > 0),
  crew_id uuid references public.crews(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'respondida', 'cerrada')),
  version_observada integer,
  creada_por uuid references public.profiles(id),
  creada_at timestamptz not null default clock_timestamp(),
  cerrada_por uuid references public.profiles(id),
  cerrada_at timestamptz,
  check (pci_item_id is not null or work_order_id is not null)
);
create index if not exists revision_observaciones_item on public.revision_observaciones (pci_item_id, estado);
create index if not exists revision_observaciones_srv on public.revision_observaciones (service_id, estado, creada_at desc);

create table if not exists public.revision_observacion_eventos (
  id uuid primary key default gen_random_uuid(),
  observacion_id uuid not null references public.revision_observaciones(id) on delete cascade,
  tipo text not null check (tipo in ('creada', 'respuesta', 'validada', 'publicada', 'mantenida', 'cerrada', 'reabierta', 'comentario')),
  texto text,
  evidencias uuid[] not null default '{}',
  version integer,
  estado_anterior text,
  estado_nuevo text,
  autor uuid references public.profiles(id),
  organizacion text not null default 'SERVICON' check (organizacion in ('SERVICON', 'COVINCA', 'SISTEMA')),
  cuando timestamptz not null default clock_timestamp()
);
create index if not exists revision_observacion_eventos_obs on public.revision_observacion_eventos (observacion_id, cuando);

alter table public.revision_observaciones enable row level security;
alter table public.revision_observacion_eventos enable row level security;
drop policy if exists revision_observaciones_select on public.revision_observaciones;
-- Lo ve quien ve su ítem o su parte (el Visor solo lo publicado)
create policy revision_observaciones_select on public.revision_observaciones for select to authenticated
  using ((pci_item_id is not null and exists (select 1 from public.pci_items i where i.id = revision_observaciones.pci_item_id))
      or (work_order_id is not null and exists (select 1 from public.work_orders o where o.id = revision_observaciones.work_order_id)));
drop policy if exists revision_observacion_eventos_select on public.revision_observacion_eventos;
create policy revision_observacion_eventos_select on public.revision_observacion_eventos for select to authenticated
  using (exists (select 1 from public.revision_observaciones o where o.id = revision_observacion_eventos.observacion_id));

-- Los casos de lo ya observado, para no perder lo vigente
insert into public.revision_observaciones (codigo, service_id, pci_id, pci_item_id, origen, motivo, crew_id, estado,
                                           version_observada, creada_por, creada_at)
select 'OBS-' || i.item_number || '-01', i.service_id, i.pci_id, i.id, coalesce(i.observado_entidad, 'SERVICON'),
       coalesce(nullif(trim(i.reject_reason), ''), 'Observación registrada'), i.assigned_crew_id, 'abierta',
       nullif(i.publicacion_version, 0), i.observado_por, coalesce(i.observado_at, i.updated_at)
  from public.pci_items i
 where i.status = 'observado' and i.deleted_at is null
   and not exists (select 1 from public.revision_observaciones o where o.pci_item_id = i.id);
insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_nuevo, autor, organizacion, cuando)
select o.id, 'creada', o.motivo, o.version_observada, 'abierta', o.creada_por, o.origen, o.creada_at
  from public.revision_observaciones o
 where not exists (select 1 from public.revision_observacion_eventos e where e.observacion_id = o.id);

-- ── 3 · El Visor COVINCA solo ve lo publicado ─────────────────────────────
create or replace function public.es_visor(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) = 'visor'
$$;

drop policy if exists pci_items_select on public.pci_items;
create policy pci_items_select on public.pci_items for select to authenticated
  using (((pci_id in (select public.pcis_visibles()))
          and ((assigned_crew_id is null) or (assigned_crew_id in (select public.cuadrillas_visibles())))
          and (publicacion_version > 0 or not public.es_visor(service_id)))
         or public.is_platform_admin());

drop policy if exists evidences_select on public.evidences;
create policy evidences_select on public.evidences for select to authenticated
  using (((service_id in (select public.mis_servicios()))
          and (publicada_version is not null or not public.es_visor(service_id)))
         or (select public.is_platform_admin()));

drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders for select to authenticated
  using (((service_id in (select public.mis_servicios()))
          and ((crew_id is null) or (crew_id in (select public.cuadrillas_visibles())))
          and (publicacion_version > 0 or not public.es_visor(service_id)))
         or public.is_platform_admin());

-- ── 4 · Helpers ───────────────────────────────────────────────────────────
-- Las tres fases mínimas (una Antes, una Durante, al menos una Después);
-- p_publicadas: solo las fotos ya publicadas (lo que ve COVINCA)
create or replace function public.pci_item_fases_faltantes(p_item uuid, p_publicadas boolean default false)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select array_remove(array[
           case when count(*) filter (where e.phase = 'antes') = 0 then 'antes' end,
           case when count(*) filter (where e.phase = 'durante') = 0 then 'durante' end,
           case when count(*) filter (where e.phase = 'despues') = 0 then 'despues' end], null)
    from public.evidences e
   where e.pci_item_id = p_item and e.deleted_at is null
     and (not p_publicadas or e.publicada_version is not null)
$$;

create or replace function public.fase_legible(p text)
returns text language sql immutable as $$
  select case p when 'antes' then 'Antes' when 'durante' then 'Durante' when 'despues' then 'Después'
                when 'general' then 'General' when 'metrado' then 'Metrado' else coalesce(p, '') end
$$;

-- OBS-<ítem>-NN, correlativo por ítem
create or replace function public.obs_codigo(p_item uuid, p_numero integer)
returns text language sql stable security definer set search_path to 'public' as $$
  select 'OBS-' || p_numero || '-' || lpad((count(*) + 1)::text, 2, '0')
    from public.revision_observaciones where pci_item_id = p_item
$$;

-- ── 5 · Validar u observar (SERVICON o COVINCA), con caso de observación ──
drop function if exists public.pci_validar(uuid, boolean, text);
create or replace function public.pci_validar(p_item uuid, p_conforme boolean, p_nota text default null,
                                              p_fase text default null, p_version integer default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.pci_items;
  v_rol public.user_role;
  v_nivel text;
  v_entidad text;
  v_estado text;
  v_falta text[];
  v_obs uuid;
  r record;
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
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe el motivo: la cuadrilla necesita saber qué corregir';
  end if;
  if p_fase is not null and p_fase not in ('antes', 'durante', 'despues', 'general', 'metrado', 'otro') then
    raise exception 'SIGOV: fase no válida';
  end if;

  if v_nivel = 'covinca' then
    -- COVINCA revisa la versión publicada, y solo la vigente
    if v_fila.publicacion_version = 0 then
      raise exception 'SIGOV: este ítem aún no se publica a COVINCA';
    end if;
    if p_version is not null and p_version <> v_fila.publicacion_version then
      raise exception 'SIGOV: se publicó la versión v% mientras revisabas la v%. Actualiza y revisa la versión vigente antes de decidir', v_fila.publicacion_version, p_version;
    end if;
    if v_fila.covinca_estado = 'conforme' and v_fila.covinca_version = v_fila.publicacion_version and p_conforme then
      raise exception 'SIGOV: la versión v% ya tiene conformidad COVINCA', v_fila.publicacion_version;
    end if;
    -- Lo observado espera la nueva versión publicada: no se conforma a medias
    if p_conforme and v_fila.covinca_estado <> 'por_revisar' then
      raise exception 'SIGOV: no hay una versión nueva por revisar: espera a que SERVICON subsane y el Residente publique';
    end if;
    if not p_conforme and v_fila.covinca_estado = 'observado' and v_fila.covinca_version = v_fila.publicacion_version then
      raise exception 'SIGOV: ya observaste la versión v%; agrega el detalle en la misma observación (Mantener observación)', v_fila.publicacion_version;
    end if;
    if p_conforme then
      v_falta := public.pci_item_fases_faltantes(p_item, true);
      if cardinality(v_falta) > 0 then
        raise exception 'SIGOV: Aceptar requiere resolver falta de evidencia (%). Observa el ítem indicando la fase', array_to_string(array(select public.fase_legible(x) from unnest(v_falta) x), ', ');
      end if;
    end if;
  else
    if v_fila.status not in ('levantado', 'subsanado') then
      raise exception 'SIGOV: el ítem no está por validar (está %)', v_fila.status;
    end if;
    if v_fila.validado_servicon_at is not null and p_conforme then
      raise exception 'SIGOV: SERVICON ya validó este ítem; falta la publicación y la conformidad de COVINCA';
    end if;
    if p_conforme then
      -- Nadie valida su propio trabajo (guía 2.3)
      if v_fila.closed_by = auth.uid() then
        raise exception 'SIGOV: no puedes validar un ítem que tú mismo culminaste' using errcode = '42501';
      end if;
      v_falta := public.pci_item_fases_faltantes(p_item, false);
      if v_fila.requires_evidence and cardinality(v_falta) > 0 then
        raise exception 'SIGOV: falta evidencia requerida (%). Devuelve el ítem al jefe con el motivo', array_to_string(array(select public.fase_legible(x) from unnest(v_falta) x), ', ');
      end if;
    end if;
  end if;

  if p_conforme and v_nivel = 'servicon' then
    update public.pci_items
       set validado_servicon_at = now(), validado_servicon_by = auth.uid(), updated_at = now()
     where id = p_item;
    v_estado := 'validado_servicon';
    -- Las observaciones SERVICON del ítem quedan cerradas con la validación
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = p_item and o.origen = 'SERVICON' and o.estado <> 'cerrada' loop
      update public.revision_observaciones set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_at = now() where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'cerrada', coalesce(nullif(trim(p_nota), ''), 'Subsanación verificada: validado SERVICON'), v_fila.publicacion_version, r.estado, 'cerrada', auth.uid(), 'SERVICON');
    end loop;
  elsif p_conforme then
    update public.pci_items
       set status = 'validado', validated_at = now(), validated_by = auth.uid(), reject_reason = null,
           covinca_estado = 'conforme', covinca_version = v_fila.publicacion_version, updated_at = now()
     where id = p_item;
    v_estado := 'validado';
    -- «Conformar y cerrar»: se cierran las observaciones COVINCA del ítem
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = p_item and o.origen = 'COVINCA' and o.estado <> 'cerrada' loop
      update public.revision_observaciones set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_at = now() where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'cerrada', coalesce(nullif(trim(p_nota), ''), 'Conforme COVINCA'), v_fila.publicacion_version, r.estado, 'cerrada', auth.uid(), 'COVINCA');
    end loop;
  else
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_nota),
           observado_at = now(), observado_por = auth.uid(), observado_entidad = v_entidad,
           validado_servicon_at = null, validado_servicon_by = null,
           covinca_estado = case when v_nivel = 'covinca' then 'observado' else covinca_estado end,
           covinca_version = case when v_nivel = 'covinca' then v_fila.publicacion_version else covinca_version end,
           updated_at = now()
     where id = p_item;
    v_estado := 'observado';
    -- El caso, con su hilo
    insert into public.revision_observaciones (codigo, service_id, pci_id, pci_item_id, origen, fase, motivo, crew_id,
                                               version_observada, creada_por)
    values (public.obs_codigo(p_item, v_fila.item_number), v_fila.service_id, v_fila.pci_id, p_item, v_entidad, p_fase,
            trim(p_nota), v_fila.assigned_crew_id, nullif(v_fila.publicacion_version, 0), auth.uid())
    returning id into v_obs;
    insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_nuevo, autor, organizacion)
    values (v_obs, 'creada', trim(p_nota), nullif(v_fila.publicacion_version, 0), 'abierta', auth.uid(), v_entidad);
  end if;

  insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad, evidencias)
  values (v_fila.service_id, v_fila.pci_id, p_item, v_nivel, case when p_conforme then 'conforme' else 'observado' end,
          nullif(trim(p_nota), ''), auth.uid(), v_rol::text, v_entidad,
          (select array_agg(e.id order by e.created_at) from public.evidences e where e.pci_item_id = p_item and e.deleted_at is null));

  perform public.pci_avisos(v_fila.pci_id);
  return json_build_object('estado', v_estado, 'nivel', v_nivel, 'observacion_id', v_obs);
end $$;
revoke all on function public.pci_validar(uuid, boolean, text, text, integer) from public, anon;
grant execute on function public.pci_validar(uuid, boolean, text, text, integer) to authenticated;

-- ── 6 · Publicar a COVINCA (solo el Residente) ────────────────────────────
create or replace function public.pci_publicar(p_items uuid[], p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_item public.pci_items;
  v_sid uuid;
  v_version int;
  v_ev uuid[];
  v_pcis uuid[] := '{}';
  v_hechos int := 0;
  v_omitidos jsonb := '[]';
  r record;
begin
  if p_items is null or cardinality(p_items) = 0 then raise exception 'SIGOV: elige al menos un ítem'; end if;
  select service_id into v_sid from public.pci_items where id = p_items[1];
  if public.role_in(v_sid) is distinct from 'residente' then
    raise exception 'SIGOV: solo el Residente publica a COVINCA' using errcode = '42501';
  end if;

  for v_item in select * from public.pci_items where id = any(p_items) and deleted_at is null order by item_number for update loop
    if v_item.service_id <> v_sid then continue; end if;
    -- Solo lo validado por SERVICON y aún no publicado en esa versión
    if v_item.validado_servicon_at is null or v_item.status not in ('levantado', 'subsanado') then
      v_omitidos := v_omitidos || jsonb_build_object('item', v_item.item_number, 'motivo', 'sin validación SERVICON');
      continue;
    end if;
    if v_item.publicacion_version > 0 and not v_item.publicacion_pendiente and v_item.covinca_estado <> 'observado' then
      v_omitidos := v_omitidos || jsonb_build_object('item', v_item.item_number, 'motivo', 'ya publicado en v' || v_item.publicacion_version);
      continue;
    end if;
    v_version := v_item.publicacion_version + 1;
    update public.evidences set publicada_version = v_version
     where pci_item_id = v_item.id and deleted_at is null and publicada_version is null;
    select coalesce(array_agg(e.id order by e.created_at), '{}') into v_ev
      from public.evidences e where e.pci_item_id = v_item.id and e.deleted_at is null;
    update public.pci_items
       set publicacion_version = v_version, publicado_at = now(), publicado_por = auth.uid(),
           publicacion_pendiente = false, covinca_estado = 'por_revisar', updated_at = now()
     where id = v_item.id;
    insert into public.pci_item_publicaciones (service_id, pci_id, pci_item_id, version, evidencias, nota, quien)
    values (v_item.service_id, v_item.pci_id, v_item.id, v_version, v_ev, nullif(trim(p_nota), ''), auth.uid());
    -- La respuesta a lo que COVINCA observó queda «Respondida» al publicarse
    for r in select * from public.revision_observaciones o
              where o.pci_item_id = v_item.id and o.origen = 'COVINCA' and o.estado = 'abierta' loop
      update public.revision_observaciones set estado = 'respondida' where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'publicada', format('Evidencia validada y publicada v%s', v_version), v_version, 'abierta', 'respondida', auth.uid(), 'SERVICON');
    end loop;
    v_hechos := v_hechos + 1;
    if not v_item.pci_id = any(v_pcis) then v_pcis := v_pcis || v_item.pci_id; end if;
  end loop;

  -- Un aviso por PCI, no por ítem
  for r in select unnest(v_pcis) pci loop
    perform public.pci_avisos(r.pci);
  end loop;
  return json_build_object('publicados', v_hechos, 'omitidos', v_omitidos);
end $$;
revoke all on function public.pci_publicar(uuid[], text) from public, anon;
grant execute on function public.pci_publicar(uuid[], text) to authenticated;

-- Una foto nueva o quitada después de publicar deja una nueva versión pendiente
create or replace function public.t_evidencia_pendiente_de_publicar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_item uuid := coalesce(new.pci_item_id, old.pci_item_id);
begin
  if v_item is null then return null; end if;
  update public.pci_items set publicacion_pendiente = true
   where id = v_item and publicacion_version > 0 and not publicacion_pendiente;
  return null;
end $$;
drop trigger if exists t_evidencia_pendiente_de_publicar on public.evidences;
create trigger t_evidencia_pendiente_de_publicar after insert or update of deleted_at on public.evidences
  for each row execute function public.t_evidencia_pendiente_de_publicar();

-- Publicar un reporte diario validado (Residente)
create or replace function public.parte_publicar(p_ids uuid[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_o public.work_orders; v_n int := 0;
begin
  for v_o in select * from public.work_orders where id = any(p_ids) and deleted_at is null for update loop
    if public.role_in(v_o.service_id) is distinct from 'residente' then
      raise exception 'SIGOV: solo el Residente publica a COVINCA' using errcode = '42501';
    end if;
    if v_o.status <> 'validado' then continue; end if;
    update public.work_orders set publicacion_version = publicacion_version + 1, publicado_at = now(), publicado_por = auth.uid()
     where id = v_o.id;
    update public.evidences e set publicada_version = v_o.publicacion_version + 1
      from public.work_entries w
     where e.work_entry_id = w.id and w.work_order_id = v_o.id and e.deleted_at is null and e.publicada_version is null;
    v_n := v_n + 1;
  end loop;
  return json_build_object('publicados', v_n);
end $$;
revoke all on function public.parte_publicar(uuid[]) from public, anon;
grant execute on function public.parte_publicar(uuid[]) to authenticated;

-- ── 7 · Responder, mantener, reabrir y comentar una observación ───────────
create or replace function public.observacion_accion(p_obs uuid, p_accion text, p_texto text default null,
                                                     p_evidencias uuid[] default '{}')
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  o public.revision_observaciones;
  v_rol public.user_role;
  v_org text;
  v_item public.pci_items;
  v_nuevo text;
begin
  select * into o from public.revision_observaciones where id = p_obs for update;
  if o.id is null then raise exception 'SIGOV: esa observación ya no existe'; end if;
  v_rol := public.role_in(o.service_id);
  if v_rol is null then raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501'; end if;
  v_org := case when v_rol = 'visor' then 'COVINCA' else 'SERVICON' end;
  if o.pci_item_id is not null then select * into v_item from public.pci_items where id = o.pci_item_id; end if;

  if p_accion = 'responder' then
    -- Responde quien ejecuta o supervisa la cuadrilla, sobre la misma intervención
    if v_rol = 'visor' or (o.crew_id is not null and not public.cuadrilla_a_mi_cargo(o.service_id, o.crew_id)) then
      raise exception 'SIGOV: solo SERVICON responde una observación de su cuadrilla' using errcode = '42501';
    end if;
    if o.estado = 'cerrada' then raise exception 'SIGOV: la observación está cerrada'; end if;
    if nullif(trim(p_texto), '') is null and cardinality(coalesce(p_evidencias, '{}')) = 0 then
      raise exception 'SIGOV: escribe la respuesta o adjunta la evidencia';
    end if;
    -- Una observación SERVICON queda respondida; la de COVINCA, al publicarse
    v_nuevo := case when o.origen = 'SERVICON' then 'respondida' else o.estado end;
  elsif p_accion = 'mantener' then
    if v_org <> o.origen then raise exception 'SIGOV: solo % mantiene su observación', o.origen using errcode = '42501'; end if;
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: explica qué falta para mantener la observación'; end if;
    if o.estado = 'cerrada' then raise exception 'SIGOV: la observación está cerrada; usa Reabrir'; end if;
    v_nuevo := 'abierta';
  elsif p_accion = 'reabrir' then
    if v_org <> o.origen then raise exception 'SIGOV: solo % reabre su observación', o.origen using errcode = '42501'; end if;
    if o.estado <> 'cerrada' then raise exception 'SIGOV: solo se reabre una observación cerrada'; end if;
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: escribe el motivo para reabrir'; end if;
    v_nuevo := 'abierta';
  elsif p_accion = 'comentar' then
    if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: escribe el comentario'; end if;
    v_nuevo := o.estado;
  else
    raise exception 'SIGOV: acción no válida';
  end if;

  update public.revision_observaciones
     set estado = v_nuevo,
         cerrada_at = case when v_nuevo = 'cerrada' then cerrada_at else null end,
         cerrada_por = case when v_nuevo = 'cerrada' then cerrada_por else null end
   where id = p_obs;
  insert into public.revision_observacion_eventos (observacion_id, tipo, texto, evidencias, version, estado_anterior, estado_nuevo, autor, organizacion)
  values (p_obs, case p_accion when 'responder' then 'respuesta' when 'mantener' then 'mantenida' when 'reabrir' then 'reabierta' else 'comentario' end,
          nullif(trim(p_texto), ''), coalesce(p_evidencias, '{}'), nullif(v_item.publicacion_version, 0), o.estado, v_nuevo, auth.uid(), v_org);

  -- Mantener o reabrir devuelve el ítem a subsanar
  if p_accion in ('mantener', 'reabrir') and v_item.id is not null then
    update public.pci_items
       set status = 'observado', reject_reason = trim(p_texto), observado_at = now(), observado_por = auth.uid(),
           observado_entidad = o.origen, validado_servicon_at = null, validado_servicon_by = null,
           covinca_estado = case when o.origen = 'COVINCA' then 'observado' else covinca_estado end,
           covinca_version = case when o.origen = 'COVINCA' then v_item.publicacion_version else covinca_version end,
           updated_at = now()
     where id = v_item.id;
    insert into public.pci_item_revisiones (service_id, pci_id, pci_item_id, nivel, resultado, motivo, quien, rol, entidad)
    values (v_item.service_id, v_item.pci_id, v_item.id, lower(o.origen), 'observado', trim(p_texto), auth.uid(), v_rol::text, o.origen);
  end if;
  if v_item.id is not null then perform public.pci_avisos(v_item.pci_id); end if;
  return json_build_object('estado', v_nuevo);
end $$;
revoke all on function public.observacion_accion(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.observacion_accion(uuid, text, text, uuid[]) to authenticated;

-- El jefe subsana con sus fotos y culmina de nuevo: eso es su respuesta
create or replace function public.t_respuesta_al_culminar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if old.status = 'observado' and new.status = 'subsanado' then
    for r in select * from public.revision_observaciones o where o.pci_item_id = new.id and o.estado = 'abierta' loop
      update public.revision_observaciones set estado = case when r.origen = 'SERVICON' then 'respondida' else 'abierta' end where id = r.id;
      insert into public.revision_observacion_eventos (observacion_id, tipo, texto, evidencias, version, estado_anterior, estado_nuevo, autor, organizacion)
      values (r.id, 'respuesta', coalesce(nullif(trim(new.notes), ''), 'Subsanado por la cuadrilla con nueva evidencia'),
              coalesce((select array_agg(e.id order by e.created_at) from public.evidences e
                         where e.pci_item_id = new.id and e.deleted_at is null and e.created_at > r.creada_at), '{}'),
              nullif(new.publicacion_version, 0), r.estado,
              case when r.origen = 'SERVICON' then 'respondida' else 'abierta' end, new.closed_by, 'SERVICON');
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists t_respuesta_al_culminar on public.pci_items;
create trigger t_respuesta_al_culminar after update of status on public.pci_items
  for each row execute function public.t_respuesta_al_culminar();

-- ── 8 · Estado del ítem por ejes y su historial completo ──────────────────
create or replace function public.pci_item_estado(p_item uuid)
returns json language sql stable security invoker set search_path to 'public' as $$
  select json_build_object(
    'ejecucion', case when i.status = 'pendiente' then 'por_atender' when i.status = 'en_atencion' then 'en_ejecucion' else 'atendido_reportado' end,
    'evidencia', case when not exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null
                                        and (e.publicada_version is not null or not public.es_visor(i.service_id))) then 'sin_evidencia'
                      when cardinality(public.pci_item_fases_faltantes(i.id, public.es_visor(i.service_id))) > 0 then 'incompleta'
                      else 'completa' end,
    'fases_faltantes', public.pci_item_fases_faltantes(i.id, public.es_visor(i.service_id)),
    'servicon', case when i.validado_servicon_at is not null or i.publicacion_version > 0 and i.status in ('levantado', 'subsanado', 'validado') then 'validado'
                     when i.status = 'observado' and i.observado_entidad = 'SERVICON' then 'observado'
                     when i.status in ('levantado', 'subsanado') then 'por_validar' else 'sin_enviar' end,
    'publicacion', case when i.publicacion_version = 0 then 'no_publicada'
                        when i.publicacion_pendiente then 'nueva_version_pendiente' else 'publicada' end,
    'publicacion_version', i.publicacion_version,
    'covinca', i.covinca_estado,
    'plazo', case when i.status = 'validado' then 'cerrado' when i.due_date < current_date then 'vencido'
                  when i.due_date <= current_date + 2 then 'por_vencer' else 'en_plazo' end,
    'observaciones_abiertas', (select count(*) from public.revision_observaciones o where o.pci_item_id = i.id and o.estado <> 'cerrada'))
    from public.pci_items i where i.id = p_item
$$;
grant execute on function public.pci_item_estado(uuid) to authenticated;

create or replace function public.pci_item_historial(p_item uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  with item as (
    select i.* from public.pci_items i
     where i.id = p_item and public.is_member(i.service_id)
       and (i.publicacion_version > 0 or not public.es_visor(i.service_id))
  ), eventos as (
    select i.created_at cuando, 'creado' tipo,
           case when b.id is not null then 'Importado del Excel «' || coalesce(b.file_name, '') || '»' else 'Registrado' end detalle,
           coalesce(pb.full_name, pc.full_name) quien, 'SERVICON'::text entidad, null::int version
      from item i
      left join public.import_batches b on b.id = i.import_batch_id
      left join public.profiles pb on pb.id = b.created_by
      left join public.profiles pc on pc.id = i.created_by
    union all
    select r.cuando, 'asignado',
           case when r.crew_de is null then 'Asignado a ' || ca.name else 'Reasignado de ' || cd.name || ' a ' || coalesce(ca.name, 'sin cuadrilla') end
             || coalesce(' · motivo: ' || r.motivo, ''),
           pq.full_name, 'SERVICON', null
      from public.reasignaciones r join item i on i.id = r.registro_id
      left join public.crews cd on cd.id = r.crew_de left join public.crews ca on ca.id = r.crew_a
      left join public.profiles pq on pq.id = r.quien
    union all
    select w.created_at, 'avance',
           format('Registró atención · metrado %s%s%s', trim(to_char(w.quantity, 'FM999999990.###')),
                  case when w.exceso is not null then format(' · supera lo solicitado (%s) en %s%s', trim(to_char(w.solicitado, 'FM999999990.###')),
                       trim(to_char(w.exceso, 'FM999999990.###')), coalesce(' · motivo: ' || w.exceso_motivo, '')) else '' end,
                  coalesce(' · ejecutó: ' || w.ejecutado_por, '')),
           pw.full_name, 'SERVICON', null
      from public.work_entries w join item i on i.id = w.pci_item_id
      left join public.profiles pw on pw.id = w.created_by
     where w.deleted_at is null and not public.es_visor(i.service_id)
    union all
    select e.created_at, 'foto',
           format('Foto %s%s', public.fase_legible(coalesce(e.phase::text, 'general')),
                  case when e.origen_captura is not null then ' · origen: ' || e.origen_captura else '' end),
           pe.full_name, 'SERVICON', e.publicada_version
      from public.evidences e join item i on i.id = e.pci_item_id
      left join public.profiles pe on pe.id = e.created_by
     where e.deleted_at is null and (e.publicada_version is not null or not public.es_visor(i.service_id))
    union all
    select v.cuando, 'revision',
           case v.resultado when 'conforme' then case v.nivel when 'covinca' then 'Conforme COVINCA' else 'Validó (SERVICON)' end
                else 'Observó: ' || coalesce(v.motivo, '') end,
           pv.full_name, v.entidad, null
      from public.pci_item_revisiones v join item i on i.id = v.pci_item_id
      left join public.profiles pv on pv.id = v.quien
    union all
    select p.cuando, 'publicado', 'Publicó a COVINCA' || coalesce(' · ' || p.nota, ''), pp.full_name, 'SERVICON', p.version
      from public.pci_item_publicaciones p join item i on i.id = p.pci_item_id
      left join public.profiles pp on pp.id = p.quien
  )
  select coalesce(json_agg(json_build_object('cuando', cuando, 'tipo', tipo, 'detalle', detalle, 'quien', quien,
                                             'entidad', entidad, 'version', version) order by cuando), '[]'::json)
    from eventos where cuando is not null
$$;

-- El hilo de las observaciones de un ítem (o de un parte)
create or replace function public.observaciones_de(p_item uuid default null, p_parte uuid default null)
returns json language sql stable security invoker set search_path to 'public' as $$
  select coalesce(json_agg(json_build_object(
           'id', o.id, 'codigo', o.codigo, 'origen', o.origen, 'fase', o.fase, 'motivo', o.motivo, 'estado', o.estado,
           'version_observada', o.version_observada, 'creada_at', o.creada_at, 'creada_por', pc.full_name,
           'cerrada_at', o.cerrada_at, 'cerrada_por', pk.full_name,
           'eventos', (select coalesce(json_agg(json_build_object(
                          'tipo', e.tipo, 'texto', e.texto, 'evidencias', e.evidencias, 'version', e.version,
                          'estado_anterior', e.estado_anterior, 'estado_nuevo', e.estado_nuevo,
                          'autor', pa.full_name, 'organizacion', e.organizacion, 'cuando', e.cuando) order by e.cuando), '[]'::json)
                         from public.revision_observacion_eventos e left join public.profiles pa on pa.id = e.autor
                        where e.observacion_id = o.id))
           order by o.creada_at desc), '[]'::json)
    from public.revision_observaciones o
    left join public.profiles pc on pc.id = o.creada_por
    left join public.profiles pk on pk.id = o.cerrada_por
   where (p_item is not null and o.pci_item_id = p_item) or (p_parte is not null and o.work_order_id = p_parte)
$$;
grant execute on function public.observaciones_de(uuid, uuid) to authenticated;

-- ── 9 · Avisos agrupados por PCI, con la publicación ──────────────────────
create or replace function public.pci_avisos(p_pci uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  p public.pcis;
  r record;
  v_n int;
  v_resp int;
begin
  select * into p from public.pcis where id = p_pci;
  if p.id is null then return; end if;

  -- Observados, al jefe de cada cuadrilla
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

  -- Por validar, a SERVICON (supervisor de la cuadrilla, residente y administrador)
  for r in
    select m.profile_id, count(i.id) n
      from public.service_members m
      left join public.pci_items i
        on i.pci_id = p_pci and i.deleted_at is null
       and i.status in ('levantado', 'subsanado') and i.validado_servicon_at is null
       and (m.role in ('admin', 'residente')
            or exists (select 1 from public.crews c where c.id = i.assigned_crew_id and c.supervisor_id = m.profile_id))
     where m.service_id = p.service_id and m.role in ('admin', 'residente', 'supervisor')
     group by m.profile_id
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

  -- Por publicar, al Residente: validado SERVICON sin publicar o con versión nueva
  select count(*) into v_n from public.pci_items i
   where i.pci_id = p_pci and i.deleted_at is null and i.validado_servicon_at is not null
     and i.status in ('levantado', 'subsanado')
     and (i.publicacion_version = 0 or i.publicacion_pendiente or i.covinca_estado = 'observado');
  for r in select m.profile_id from public.service_members m where m.service_id = p.service_id and m.role = 'residente' loop
    if v_n > 0 then
      perform public.aviso_vivo(p.service_id, r.profile_id, 'pci_por_publicar', 'pub:' || p_pci,
        format('PCI %s · %s %s', public.pci_corto(p.code), v_n, case when v_n = 1 then 'ítem validado por publicar' else 'ítems validados por publicar' end),
        'Validados por SERVICON. Publícalos a COVINCA cuando corresponda.',
        '/pci/' || p_pci || '?estado=por_publicar', 'info',
        jsonb_build_object('pci_id', p_pci, 'items', v_n, 'estado', 'por_publicar'));
    else
      perform public.aviso_resolver(r.profile_id, 'pci_por_publicar', 'pub:' || p_pci);
    end if;
  end loop;

  -- A COVINCA: lo publicado por revisar, y cuántas son respuestas a sus observaciones
  select count(*) filter (where i.covinca_estado = 'por_revisar'),
         count(*) filter (where i.covinca_estado = 'por_revisar' and exists (
           select 1 from public.revision_observaciones o where o.pci_item_id = i.id and o.origen = 'COVINCA' and o.estado = 'respondida'))
    into v_n, v_resp
    from public.pci_items i where i.pci_id = p_pci and i.deleted_at is null and i.publicacion_version > 0;
  for r in select m.profile_id from public.service_members m where m.service_id = p.service_id and m.role = 'visor' loop
    if v_n > 0 then
      perform public.aviso_vivo(p.service_id, r.profile_id, 'pci_por_validar', 'cov:' || p_pci,
        format('PCI %s · %s %s', public.pci_corto(p.code), v_n, case when v_n = 1 then 'ítem publicado por revisar' else 'ítems publicados por revisar' end),
        case when v_resp > 0 then format('%s %s a tus observaciones. ', v_resp, case when v_resp = 1 then 'es respuesta' else 'son respuestas' end) else '' end
          || 'Da la conformidad u observa con el motivo y la fase.',
        '/pci/' || p_pci || '?estado=por_revisar', 'info',
        jsonb_build_object('pci_id', p_pci, 'items', v_n, 'respondidos', v_resp, 'estado', 'por_revisar'));
    else
      perform public.aviso_resolver(r.profile_id, 'pci_por_validar', 'cov:' || p_pci);
    end if;
  end loop;
end $$;

-- Revisiones con la hora real: el historial las ordena bien aunque ocurran seguidas
alter table public.pci_item_revisiones alter column cuando set default clock_timestamp();

-- El sector del ítem, deducido de su progresiva (para la revisión)
create or replace function public.pci_item_sector(p_item uuid)
returns text language sql stable security invoker set search_path to 'public' as $$
  select (select s.code from public.sector_de(i.section_id, i.prog_start_m) s) from public.pci_items i where i.id = p_item
$$;
grant execute on function public.pci_item_sector(uuid) to authenticated;
