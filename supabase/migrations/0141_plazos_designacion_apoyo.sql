-- ═══════════════════════════════════════════════════════════════════════════
-- 0141 · Plazos del PCI, designación de PCI completo y apoyo temporal
--        (revisión visual 18/11, T5; maquetas 06–11 de «compartidos»)
--
-- 1 · Plazos: dos modos. «Fechas oficiales directas» (las del oficio, por
--     plazo, con la casilla «He contrastado las fechas con el oficio») o
--     «Calcular vencimientos» (fecha base + N días). Cada cambio es una
--     versión con motivo; los ítems ya atendidos conservan su vencimiento.
-- 2 · Designación: el Supervisor designa un PCI completo a una cuadrilla y
--     jefe con vigencia operacional (no altera vencimientos oficiales). Un
--     ítem no queda en dos designaciones; lo ya atendido conserva quién lo
--     ejecutó. El retiro es exclusivo del Supervisor, con motivo, y solo
--     quita el acceso operativo: PCI, ítems, fotos, autoría y avance quedan.
-- 3 · Apoyo temporal: el Supervisor autoriza a otra cuadrilla a consultar y
--     registrar evidencias en ítems de un PCI, entre dos fechas y horas. No
--     cambia titular, cuadrilla permanente, roles ni vencimientos; nunca
--     permite validar ni publicar. Caduca solo. Lo cargado sin conexión
--     fuera de la vigencia se conserva pendiente de autorización: no cuenta
--     como evidencia hasta que el Supervisor lo autoriza, y no se borra solo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · Plazos: modo y versiones ─────────────────────────────────────────
alter table public.pcis
  add column if not exists modo_plazos text not null default 'calculo',
  add column if not exists plazos_version integer not null default 0,
  add column if not exists oficio_contrastado_at timestamptz,
  add column if not exists oficio_contrastado_por uuid references public.profiles(id);
do $$ begin
  alter table public.pcis add constraint pcis_modo_plazos_chk check (modo_plazos in ('oficiales', 'calculo'));
exception when duplicate_object then null; end $$;
update public.pcis set modo_plazos = 'oficiales' where vencimientos <> '{}'::jsonb and modo_plazos = 'calculo';
comment on column public.pcis.modo_plazos is 'oficiales: fechas del oficio por plazo; calculo: registered_on (fecha base) + N días';

create table if not exists public.pci_plazos_versiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  pci_id uuid not null references public.pcis(id) on delete cascade,
  version integer not null,
  modo text not null check (modo in ('oficiales', 'calculo')),
  fecha_base date,
  vencimientos jsonb not null default '{}'::jsonb,   -- resuelto: {"1": "2026-11-18", "7": "2026-11-26"}
  motivo text,
  items_actualizados integer not null default 0,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp(),
  unique (pci_id, version)
);
alter table public.pci_plazos_versiones enable row level security;
drop policy if exists pci_plazos_versiones_select on public.pci_plazos_versiones;
create policy pci_plazos_versiones_select on public.pci_plazos_versiones for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)) or public.is_platform_admin());
grant select on public.pci_plazos_versiones to authenticated;

-- Las fechas vigentes de cada plazo que usa el PCI
create or replace function public.pci_plazos_resueltos(p_pci uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(t.term_days::text, public.vencimiento_pci(p_pci, t.term_days)), '{}'::jsonb)
    from (select distinct term_days from public.pci_items
           where pci_id = p_pci and deleted_at is null and term_days is not null) t
$$;

-- La versión 1 de lo que ya existe: lo que rige hoy
insert into public.pci_plazos_versiones (service_id, pci_id, version, modo, fecha_base, vencimientos, motivo, cuando)
select p.service_id, p.id, 1, p.modo_plazos, p.registered_on, public.pci_plazos_resueltos(p.id), 'Configuración inicial', p.created_at
  from public.pcis p
 where p.deleted_at is null and p.plazos_version = 0
on conflict (pci_id, version) do nothing;
update public.pcis set plazos_version = 1 where plazos_version = 0 and deleted_at is null;

/**
 * Configura los plazos de un PCI. Administrador, Supervisor o Residente.
 *   p_modo 'oficiales': p_fechas {"1": "2026-11-18", …} para cada plazo que
 *     usan sus ítems y p_contrastado = true (lo contrastó con el oficio).
 *   p_modo 'calculo': p_fecha_base; vence base + N.
 * Desde la segunda versión exige motivo. Recalcula solo lo abierto.
 */
create or replace function public.pci_configurar_plazos(
  p_pci uuid, p_modo text, p_fechas jsonb default '{}'::jsonb, p_fecha_base date default null,
  p_motivo text default null, p_contrastado boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  p public.pcis;
  v_plazos jsonb;
  v_usados int[];
  v_limpias jsonb := '{}'::jsonb;
  k text; v text; t int;
  v_n int;
  v_version int;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if public.role_in(p.service_id) is null or public.role_in(p.service_id) not in ('admin', 'supervisor', 'residente') then
    raise exception 'SIGOV: solo Administrador, Supervisor o Residente configuran los plazos' using errcode = '42501';
  end if;
  if p_modo not in ('oficiales', 'calculo') then raise exception 'SIGOV: modo de plazos no válido'; end if;
  -- La primera configuración (al importar un PCI nuevo) no pide motivo; un cambio, sí
  if p.plazos_version >= 1 and nullif(trim(p_motivo), '') is null then
    raise exception 'SIGOV: escribe el motivo del cambio de plazos: queda en el historial';
  end if;
  v_plazos := (public.ajustes_del_servicio(p.service_id)::jsonb)->'pci'->'plazos';
  select coalesce(array_agg(distinct term_days order by term_days), '{}') into v_usados
    from public.pci_items where pci_id = p.id and deleted_at is null and term_days is not null;

  if p_modo = 'oficiales' then
    if not coalesce(p_contrastado, false) then
      raise exception 'SIGOV: confirma que contrastaste las fechas con el oficio';
    end if;
    for k, v in select key, value from jsonb_each_text(coalesce(p_fechas, '{}'::jsonb)) loop
      if not (v_plazos @> to_jsonb(k::int)) then raise exception 'SIGOV: % días no es un plazo del contrato', k; end if;
      if nullif(trim(v), '') is null then continue; end if;
      v_limpias := v_limpias || jsonb_build_object(k, v::date);
    end loop;
    foreach t in array v_usados loop
      if not (v_limpias ? t::text) then
        raise exception 'SIGOV: falta la fecha oficial del plazo de % %', t, case when t = 1 then 'día' else 'días' end;
      end if;
    end loop;
    update public.pcis set modo_plazos = 'oficiales', vencimientos = v_limpias,
           oficio_contrastado_at = now(), oficio_contrastado_por = auth.uid(), updated_at = now()
     where id = p.id;
  else
    if p_fecha_base is null then raise exception 'SIGOV: indica la fecha base del cálculo'; end if;
    update public.pcis set modo_plazos = 'calculo', registered_on = p_fecha_base, vencimientos = '{}'::jsonb, updated_at = now()
     where id = p.id;
  end if;

  update public.pci_items i
     set due_date = public.vencimiento_pci(p.id, i.term_days), updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.term_days is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.due_date is distinct from public.vencimiento_pci(p.id, i.term_days);
  get diagnostics v_n = row_count;

  v_version := p.plazos_version + 1;
  update public.pcis set plazos_version = v_version where id = p.id;
  insert into public.pci_plazos_versiones (service_id, pci_id, version, modo, fecha_base, vencimientos, motivo, items_actualizados, quien)
  values (p.service_id, p.id, v_version, p_modo, case when p_modo = 'calculo' then p_fecha_base end,
          public.pci_plazos_resueltos(p.id), nullif(trim(p_motivo), ''), v_n, auth.uid());
  return json_build_object('version', v_version, 'items', v_n, 'vencimientos', public.pci_plazos_resueltos(p.id));
end $$;
revoke all on function public.pci_configurar_plazos(uuid, text, jsonb, date, text, boolean) from public, anon;
grant execute on function public.pci_configurar_plazos(uuid, text, jsonb, date, text, boolean) to authenticated;

-- Resumen para la tabla «Oficio de referencia» y el historial de versiones
create or replace function public.pci_plazos_resumen(p_pci uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'modo', p.modo_plazos, 'fecha_base', p.registered_on, 'version', p.plazos_version,
    'contrastado_at', p.oficio_contrastado_at,
    'plazos', (select coalesce(json_agg(json_build_object('plazo', t.term_days, 'items', t.n,
                         'vencimiento', public.vencimiento_pci(p.id, t.term_days), 'oficial', p.vencimientos ? t.term_days::text)
                       order by t.term_days), '[]'::json)
                 from (select term_days, count(*) n from public.pci_items
                        where pci_id = p.id and deleted_at is null and term_days is not null group by term_days) t),
    'versiones', (select coalesce(json_agg(json_build_object('version', v.version, 'modo', v.modo, 'fecha_base', v.fecha_base,
                           'vencimientos', v.vencimientos, 'motivo', v.motivo, 'items', v.items_actualizados,
                           'quien', pr.full_name, 'cuando', v.cuando) order by v.version desc), '[]'::json)
                    from public.pci_plazos_versiones v left join public.profiles pr on pr.id = v.quien where v.pci_id = p.id))
    from public.pcis p
   where p.id = p_pci and p.deleted_at is null and public.is_member(p.service_id) and not public.es_visor(p.service_id)
$$;
grant execute on function public.pci_plazos_resumen(uuid) to authenticated;

-- ─── 2 · Designación de PCI completo ──────────────────────────────────────
create table if not exists public.pci_designaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  pci_id uuid not null references public.pcis(id) on delete cascade,
  crew_id uuid not null references public.crews(id),
  jefe_id uuid references public.profiles(id),
  desde date not null,
  hasta date not null,
  motivo text not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'retirada', 'reemplazada')),
  items_asignados integer not null default 0,
  items_conservados integer not null default 0,
  creada_por uuid references public.profiles(id),
  creada_at timestamptz not null default clock_timestamp(),
  retirada_por uuid references public.profiles(id),
  retirada_at timestamptz,
  motivo_retiro text,
  items_liberados integer,
  check (hasta >= desde)
);
create unique index if not exists ux_pci_designacion_vigente on public.pci_designaciones (pci_id) where estado = 'vigente';
alter table public.pci_designaciones enable row level security;
drop policy if exists pci_designaciones_select on public.pci_designaciones;
create policy pci_designaciones_select on public.pci_designaciones for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)) or public.is_platform_admin());
grant select on public.pci_designaciones to authenticated;

/** Lo que muestran «Designación actual», «Ver ítems», «Revisar disponibilidad», «Revisar cambios» y «Ver impacto». */
create or replace function public.pci_designacion_resumen(p_pci uuid, p_crew uuid default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare p public.pcis; v_res json;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found or not public.is_member(p.service_id) or public.es_visor(p.service_id) then
    raise exception 'SIGOV: sin acceso a este PCI' using errcode = '42501';
  end if;
  with it as (
    select i.*, (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null) fotos
      from public.pci_items i where i.pci_id = p.id and i.deleted_at is null
  ), act as (
    select d.*, c.name crew_name, c.code crew_code, pr.full_name jefe_nombre
      from public.pci_designaciones d join public.crews c on c.id = d.crew_id left join public.profiles pr on pr.id = d.jefe_id
     where d.pci_id = p.id and d.estado = 'vigente'
  )
  select json_build_object(
    'pci', json_build_object('id', p.id, 'code', p.code, 'title', p.title, 'publicado', p.published_at is not null),
    'total', (select count(*) from it),
    'por_plazo', (select coalesce(json_agg(json_build_object('plazo', term_days, 'n', n) order by term_days), '[]'::json)
                    from (select term_days, count(*) n from it group by term_days) x),
    'abiertos', (select count(*) from it where status in ('pendiente', 'en_atencion', 'observado')),
    'atendidos', (select count(*) from it where status not in ('pendiente', 'en_atencion', 'observado')),
    'por_cuadrilla', (select coalesce(json_agg(json_build_object('crew_id', x.assigned_crew_id, 'nombre', coalesce(c.name, 'Sin cuadrilla'),
                                'abiertos', x.ab, 'atendidos', x.at, 'gestionable', public.revisa_cuadrilla(p.service_id, x.assigned_crew_id))
                              order by c.code nulls first), '[]'::json)
                        from (select assigned_crew_id, count(*) filter (where status in ('pendiente', 'en_atencion', 'observado')) ab,
                                     count(*) filter (where status not in ('pendiente', 'en_atencion', 'observado')) at
                                from it group by assigned_crew_id) x left join public.crews c on c.id = x.assigned_crew_id),
    'actual', (select row_to_json(a) from (select id, crew_id, crew_name, crew_code, jefe_id, jefe_nombre, desde, hasta, motivo, creada_at,
                     case when hasta < public.hoy_peru() then 'vencida' when desde > public.hoy_peru() then 'programada' else 'vigente' end vigencia,
                     public.revisa_cuadrilla(p.service_id, crew_id) and public.role_in(p.service_id) = 'supervisor' puedo_retirar
                from act) a),
    -- Ver impacto del retiro: lo abierto que pierde acceso operativo; nada se borra
    'impacto', (select json_build_object('abiertos', count(*) filter (where status in ('pendiente', 'en_atencion', 'observado')),
                                         'con_fotos', count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and fotos > 0),
                                         'atendidos', count(*) filter (where status not in ('pendiente', 'en_atencion', 'observado')))
                  from it where it.assigned_crew_id = (select crew_id from act)),
    -- Revisar cambios para la cuadrilla elegida
    'cambios', case when p_crew is null then null else (select json_build_object(
                  'pasan', count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and assigned_crew_id is distinct from p_crew
                                            and public.revisa_cuadrilla(p.service_id, assigned_crew_id)),
                  'ya_suyos', count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and assigned_crew_id = p_crew),
                  'fuera_de_alcance', count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and assigned_crew_id is distinct from p_crew
                                                       and not public.revisa_cuadrilla(p.service_id, assigned_crew_id)),
                  'conservan_ejecucion', count(*) filter (where status not in ('pendiente', 'en_atencion', 'observado')))
                from it) end,
    -- Revisar disponibilidad de la cuadrilla elegida
    'disponibilidad', case when p_crew is null then null else json_build_object(
                  'designaciones', (select coalesce(json_agg(json_build_object('pci', x.code, 'desde', d.desde, 'hasta', d.hasta)), '[]'::json)
                                      from public.pci_designaciones d join public.pcis x on x.id = d.pci_id
                                     where d.crew_id = p_crew and d.estado = 'vigente' and d.pci_id <> p.id),
                  'abiertos_asignados', (select count(*) from public.pci_items i where i.assigned_crew_id = p_crew and i.deleted_at is null
                                           and i.status in ('pendiente', 'en_atencion', 'observado')),
                  'vencen_7d', (select count(*) from public.pci_items i where i.assigned_crew_id = p_crew and i.deleted_at is null
                                  and i.status in ('pendiente', 'en_atencion', 'observado') and i.due_date <= public.hoy_peru() + 7)) end,
    'historial', (select coalesce(json_agg(json_build_object('estado', d.estado, 'cuadrilla', c.name, 'jefe', pj.full_name,
                         'desde', d.desde, 'hasta', d.hasta, 'motivo', d.motivo, 'asignados', d.items_asignados, 'conservados', d.items_conservados,
                         'por', pc.full_name, 'cuando', d.creada_at, 'retirada_por', pr.full_name, 'retirada_at', d.retirada_at,
                         'motivo_retiro', d.motivo_retiro, 'liberados', d.items_liberados) order by d.creada_at desc), '[]'::json)
                    from public.pci_designaciones d join public.crews c on c.id = d.crew_id
                    left join public.profiles pj on pj.id = d.jefe_id left join public.profiles pc on pc.id = d.creada_por
                    left join public.profiles pr on pr.id = d.retirada_por
                   where d.pci_id = p.id)
  ) into v_res;
  return v_res;
end $$;
grant execute on function public.pci_designacion_resumen(uuid, uuid) to authenticated;

/** Designar el PCI completo a una cuadrilla y su jefe, con vigencia operacional. */
create or replace function public.pci_designar(p_pci uuid, p_crew uuid, p_jefe uuid, p_desde date, p_hasta date, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  p public.pcis; c public.crews; v_act public.pci_designaciones;
  v_rol public.user_role; v_n int; v_conservados int; v_fuera int; v_id uuid;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  v_rol := public.role_in(p.service_id);
  if v_rol is null or v_rol not in ('supervisor', 'admin') then
    raise exception 'SIGOV: designar un PCI es del Supervisor autorizado (o del Administrador)' using errcode = '42501';
  end if;
  select * into c from public.crews where id = p_crew and service_id = p.service_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla no existe en este contrato'; end if;
  if not public.revisa_cuadrilla(p.service_id, p_crew) then
    raise exception 'SIGOV: esa cuadrilla no está a tu cargo' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la designación'; end if;
  if length(trim(p_motivo)) > 250 then raise exception 'SIGOV: el motivo admite hasta 250 caracteres'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'SIGOV: revisa la vigencia (desde ≤ hasta)'; end if;
  if p_jefe is not null and p_jefe is distinct from c.leader_id
     and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id = p_jefe and m.is_active) then
    raise exception 'SIGOV: el jefe elegido no pertenece a esa cuadrilla';
  end if;

  select * into v_act from public.pci_designaciones where pci_id = p.id and estado = 'vigente' for update;
  if found and v_act.crew_id <> p_crew then
    raise exception 'SIGOV: el PCI ya está designado a otra cuadrilla; retira esa designación primero (con motivo)';
  end if;
  if found then
    update public.pci_designaciones set estado = 'reemplazada' where id = v_act.id;
  end if;

  -- Lo abierto pasa a la cuadrilla; lo atendido conserva quién lo ejecutó
  perform set_config('sigov.motivo', 'Designación PCI completo: ' || trim(p_motivo), true);
  update public.pci_items i set assigned_crew_id = p_crew, updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.assigned_crew_id is distinct from p_crew and public.revisa_cuadrilla(p.service_id, i.assigned_crew_id);
  get diagnostics v_n = row_count;
  perform set_config('sigov.motivo', '', true);
  select count(*) filter (where status not in ('pendiente', 'en_atencion', 'observado')),
         count(*) filter (where status in ('pendiente', 'en_atencion', 'observado') and assigned_crew_id is distinct from p_crew)
    into v_conservados, v_fuera from public.pci_items where pci_id = p.id and deleted_at is null;

  insert into public.pci_designaciones (service_id, pci_id, crew_id, jefe_id, desde, hasta, motivo, items_asignados, items_conservados, creada_por)
  values (p.service_id, p.id, p_crew, coalesce(p_jefe, c.leader_id), p_desde, p_hasta, trim(p_motivo), v_n, v_conservados, auth.uid())
  returning id into v_id;

  if c.leader_id is not null and p.published_at is not null then
    perform public.aviso_vivo(p.service_id, c.leader_id, 'pci_publicado', 'asig:' || p.id || ':' || p_crew,
      format('PCI %s designado a tu cuadrilla', public.pci_corto(p.code)),
      format('Vigencia operacional %s – %s.', to_char(p_desde, 'DD/MM/YYYY'), to_char(p_hasta, 'DD/MM/YYYY')),
      '/pci/' || p.id, 'info', jsonb_build_object('pci_id', p.id, 'crew_id', p_crew));
  end if;
  perform public.pci_avisos(p.id);
  return json_build_object('designacion', v_id, 'asignados', v_n, 'conservan_ejecucion', v_conservados, 'fuera_de_alcance', v_fuera);
end $$;
revoke all on function public.pci_designar(uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function public.pci_designar(uuid, uuid, uuid, date, date, text) to authenticated;

/** Retirar la designación: exclusivo del Supervisor de esa cuadrilla, con motivo. */
create or replace function public.pci_retirar_designacion(p_pci uuid, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.pci_designaciones; p public.pcis; c public.crews; v_n int;
begin
  select * into d from public.pci_designaciones where pci_id = p_pci and estado = 'vigente' for update;
  if not found then raise exception 'SIGOV: el PCI no tiene una designación vigente'; end if;
  select * into p from public.pcis where id = d.pci_id;
  if public.role_in(d.service_id) is distinct from 'supervisor' or not public.revisa_cuadrilla(d.service_id, d.crew_id) then
    raise exception 'SIGOV: el retiro es exclusivo del Supervisor autorizado de esa cuadrilla' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: elige el motivo de retiro'; end if;

  perform set_config('sigov.motivo', 'Retiro de designación: ' || trim(p_motivo), true);
  update public.pci_items i set assigned_crew_id = null, updated_at = now()
   where i.pci_id = d.pci_id and i.deleted_at is null and i.assigned_crew_id = d.crew_id
     and i.status in ('pendiente', 'en_atencion', 'observado');
  get diagnostics v_n = row_count;
  perform set_config('sigov.motivo', '', true);

  update public.pci_designaciones
     set estado = 'retirada', retirada_por = auth.uid(), retirada_at = now(), motivo_retiro = trim(p_motivo), items_liberados = v_n
   where id = d.id;
  select * into c from public.crews where id = d.crew_id;
  if c.leader_id is not null then
    perform public.aviso_resolver(c.leader_id, 'pci_publicado', 'asig:' || d.pci_id || ':' || d.crew_id);
    perform public.aviso_vivo(d.service_id, c.leader_id, 'pci_designacion_retirada', 'ret:' || d.pci_id,
      format('PCI %s: designación retirada', public.pci_corto(p.code)),
      'Se conservan tus fotos, tu autoría y el avance registrado. Motivo: ' || trim(p_motivo),
      '/pci', 'warning', jsonb_build_object('pci_id', d.pci_id, 'crew_id', d.crew_id));
  end if;
  perform public.pci_avisos(d.pci_id);
  return json_build_object('liberados', v_n);
end $$;
revoke all on function public.pci_retirar_designacion(uuid, text) from public, anon;
grant execute on function public.pci_retirar_designacion(uuid, text) to authenticated;

-- ─── 3 · Apoyo temporal entre cuadrillas ──────────────────────────────────
create table if not exists public.apoyos_temporales (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  pci_id uuid not null references public.pcis(id) on delete cascade,
  crew_origen uuid not null references public.crews(id),
  crew_destino uuid not null references public.crews(id),
  alcance text not null default 'pci' check (alcance in ('pci', 'items')),
  items uuid[] not null default '{}',
  desde timestamptz not null,
  hasta timestamptz not null,
  motivo text not null,
  permiso_consultar boolean not null default true,
  permiso_evidencias boolean not null default true,
  estado text not null default 'vigente' check (estado in ('vigente', 'revocado')),
  creado_por uuid references public.profiles(id),
  creado_at timestamptz not null default clock_timestamp(),
  revocado_por uuid references public.profiles(id),
  revocado_at timestamptz,
  motivo_revocacion text,
  check (crew_origen <> crew_destino),
  check (hasta > desde)
);
create index if not exists ix_apoyos_origen on public.apoyos_temporales (crew_origen, estado, hasta);
alter table public.apoyos_temporales enable row level security;
drop policy if exists apoyos_temporales_select on public.apoyos_temporales;
create policy apoyos_temporales_select on public.apoyos_temporales for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id)) or public.is_platform_admin());
grant select on public.apoyos_temporales to authenticated;

alter table public.evidences
  add column if not exists apoyo_id uuid references public.apoyos_temporales(id),
  add column if not exists autorizacion_pendiente boolean not null default false;
comment on column public.evidences.autorizacion_pendiente is 'Cargada en apoyo temporal fuera de su vigencia (sin conexión): no cuenta como evidencia hasta que el Supervisor la autoriza';

-- Los ítems que abarca un apoyo: los del titular en ese PCI, o los elegidos
create or replace function public.apoyo_items(a public.apoyos_temporales)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select i.id from public.pci_items i
   where i.pci_id = a.pci_id and i.deleted_at is null
     and case when a.alcance = 'items' then i.id = any(a.items) else i.assigned_crew_id = a.crew_destino end
$$;

-- Lo que mi cuadrilla puede consultar ahora por un apoyo vigente (caduca solo)
create or replace function public.apoyo_items_activos()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select x.id
    from public.apoyos_temporales a
   cross join lateral public.apoyo_items(a) x(id)
   where a.estado = 'vigente' and a.permiso_consultar and now() >= a.desde and now() < a.hasta
     and public.role_in(a.service_id) = 'jefe_cuadrilla'
     and a.crew_origen = any(coalesce(public.mis_cuadrillas(a.service_id), '{}'::uuid[]))
$$;

-- Para cargar fotos: la misma regla, con margen para lo que llega tarde por
-- falta de señal (se marca pendiente de autorización si se tomó fuera)
create or replace function public.apoyo_items_para_carga()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select x.id
    from public.apoyos_temporales a
   cross join lateral public.apoyo_items(a) x(id)
   where a.estado = 'vigente' and a.permiso_evidencias and now() >= a.desde and now() < a.hasta + interval '7 days'
     and public.role_in(a.service_id) = 'jefe_cuadrilla'
     and a.crew_origen = any(coalesce(public.mis_cuadrillas(a.service_id), '{}'::uuid[]))
$$;

drop policy if exists pci_items_select on public.pci_items;
create policy pci_items_select on public.pci_items for select to authenticated
  using (((pci_id in (select public.pcis_visibles()))
          and ((assigned_crew_id is null) or (assigned_crew_id in (select public.cuadrillas_visibles())))
          and ((publicacion_version > 0) or (not public.es_visor(service_id))))
         or id in (select public.apoyo_items_activos())
         or public.is_platform_admin());

drop policy if exists ev_insert on public.evidences;
create policy ev_insert on public.evidences for insert to authenticated
  with check (public.can_write(service_id)
    and ((work_entry_id is null) or (public.puede_campo(service_id) and exists (
          select 1 from public.work_entries we join public.work_orders wo on wo.id = we.work_order_id
           where we.id = evidences.work_entry_id and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))))
    and ((pci_item_id is null) or (public.puede_campo(service_id) and (
          exists (select 1 from public.pci_items pi
                   where pi.id = evidences.pci_item_id and public.cuadrilla_a_mi_cargo(pi.service_id, pi.assigned_crew_id))
          or pci_item_id in (select public.apoyo_items_para_carga())))));

-- Marca la foto del apoyo y, si se tomó fuera de la vigencia, la deja pendiente
create or replace function public.t_evidencia_de_apoyo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare a public.apoyos_temporales; v_titular uuid;
begin
  if new.pci_item_id is null then return new; end if;
  select assigned_crew_id into v_titular from public.pci_items where id = new.pci_item_id;
  if public.cuadrilla_a_mi_cargo(new.service_id, v_titular) then return new; end if;
  select ap.* into a from public.apoyos_temporales ap
   where ap.estado = 'vigente' and ap.permiso_evidencias
     and ap.crew_origen = any(coalesce(public.mis_cuadrillas(ap.service_id), '{}'::uuid[]))
     and new.pci_item_id in (select public.apoyo_items(ap))
   order by ap.hasta desc limit 1;
  if not found then return new; end if;
  new.apoyo_id := a.id;
  new.autorizacion_pendiente := coalesce(new.taken_at, now()) < a.desde or coalesce(new.taken_at, now()) >= a.hasta;
  return new;
end $$;
drop trigger if exists t_evidencia_de_apoyo on public.evidences;
create trigger t_evidencia_de_apoyo before insert on public.evidences
  for each row execute function public.t_evidencia_de_apoyo();

-- Lo pendiente de autorización no cuenta como evidencia
create or replace function public.pci_item_fases_faltantes(p_item uuid, p_publicadas boolean default false)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select array_remove(array[
           case when count(*) filter (where e.phase = 'antes') = 0 then 'antes' end,
           case when count(*) filter (where e.phase = 'durante') = 0 then 'durante' end,
           case when count(*) filter (where e.phase = 'despues') = 0 then 'despues' end], null)
    from public.evidences e
   where e.pci_item_id = p_item and e.deleted_at is null and not e.autorizacion_pendiente
     and (not p_publicadas or e.publicada_version is not null)
$$;

create or replace function public.t_pci_item_por_fotos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_item uuid := coalesce(new.pci_item_id, old.pci_item_id);
  i public.pci_items;
  a int; d int; dp int;
  v_nuevo public.pci_item_status;
begin
  if v_item is null then return null; end if;
  select * into i from public.pci_items where id = v_item and deleted_at is null for update;
  if not found or not i.requires_evidence then return null; end if;

  -- Solo cuenta lo autorizado (una foto de apoyo fuera de vigencia, no)
  select count(*) filter (where phase = 'antes'),
         count(*) filter (where phase = 'durante'),
         count(*) filter (where phase = 'despues')
    into a, d, dp
    from public.evidences where pci_item_id = v_item and deleted_at is null and not autorizacion_pendiente;

  v_nuevo := case
    -- Las tres etapas: atendido, a revisión
    when a > 0 and d > 0 and dp > 0 and i.status in ('pendiente', 'en_atencion') then 'levantado'
    -- Lo observado que se vuelve a fotografiar con las tres etapas: subsanado
    when a > 0 and d > 0 and dp > 0 and i.status = 'observado'
         and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.autorizacion_pendiente and not new.autorizacion_pendiente)) then 'subsanado'
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

  perform public.pci_avisos(i.pci_id);
  return null;
end $$;
drop trigger if exists t_pci_item_por_fotos on public.evidences;
create trigger t_pci_item_por_fotos after insert or update of deleted_at, phase, pci_item_id, autorizacion_pendiente or delete on public.evidences
  for each row execute function public.t_pci_item_por_fotos();

/** Comprobaciones antes de autorizar: alcance, titular, solapamientos y sincronización. */
create or replace function public.apoyo_verificar(p_pci uuid, p_origen uuid, p_destino uuid, p_alcance text default 'pci',
                                                  p_items uuid[] default '{}', p_desde timestamptz default null, p_hasta timestamptz default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare p public.pcis; v_tmp public.apoyos_temporales; v_res json; o public.crews; t public.crews;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found or not public.is_member(p.service_id) or public.role_in(p.service_id) not in ('supervisor', 'admin', 'residente') then
    raise exception 'SIGOV: sin acceso' using errcode = '42501';
  end if;
  select * into o from public.crews where id = p_origen;
  select * into t from public.crews where id = p_destino;
  v_tmp.pci_id := p_pci; v_tmp.crew_destino := p_destino; v_tmp.alcance := coalesce(p_alcance, 'pci'); v_tmp.items := coalesce(p_items, '{}');
  with it as (select i.* from public.pci_items i where i.id in (select public.apoyo_items(v_tmp)))
  select json_build_object(
    'items', (select count(*) from it),
    'por_plazo', (select coalesce(json_agg(json_build_object('plazo', term_days, 'n', n) order by term_days), '[]'::json)
                    from (select term_days, count(*) n from it group by term_days) x),
    'titular', json_build_object('cuadrilla', t.name, 'jefe', (select full_name from public.profiles where id = t.leader_id)),
    'origen', json_build_object('cuadrilla', o.name, 'jefe', (select full_name from public.profiles where id = o.leader_id)),
    'solapamientos', (select coalesce(json_agg(json_build_object('pci', x.code, 'destino', cd.name, 'desde', a.desde, 'hasta', a.hasta)), '[]'::json)
                        from public.apoyos_temporales a join public.pcis x on x.id = a.pci_id join public.crews cd on cd.id = a.crew_destino
                       where a.crew_origen = p_origen and a.estado = 'vigente' and a.hasta > now()
                         and p_desde is not null and p_hasta is not null and a.desde < p_hasta and a.hasta > p_desde),
    'carga_origen', (select count(*) from public.pci_items i where i.assigned_crew_id = p_origen and i.deleted_at is null
                       and i.status in ('pendiente', 'en_atencion', 'observado')
                       and p_hasta is not null and i.due_date <= (p_hasta at time zone 'America/Lima')::date),
    'sincronizacion', (select json_build_object('ultimo', max(s.finished_at), 'fallos_ultima', (array_agg(s.failed_count order by s.started_at desc))[1])
                         from public.sync_sessions s where s.profile_id = o.leader_id and s.service_id = p.service_id),
    'publicado', p.published_at is not null
  ) into v_res;
  return v_res;
end $$;
grant execute on function public.apoyo_verificar(uuid, uuid, uuid, text, uuid[], timestamptz, timestamptz) to authenticated;

/** Autorizar el apoyo. Solo el Supervisor (o el Administrador) de la cuadrilla titular. */
create or replace function public.apoyo_autorizar(p_pci uuid, p_origen uuid, p_destino uuid, p_alcance text, p_items uuid[],
                                                  p_desde timestamptz, p_hasta timestamptz, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare p public.pcis; v_id uuid; v_tmp public.apoyos_temporales; v_n int; o public.crews;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if public.role_in(p.service_id) not in ('supervisor', 'admin') or not public.revisa_cuadrilla(p.service_id, p_destino) then
    raise exception 'SIGOV: el apoyo lo concede el Supervisor de la cuadrilla titular' using errcode = '42501';
  end if;
  if p.published_at is null then raise exception 'SIGOV: publica el PCI antes de autorizar un apoyo'; end if;
  if p_origen = p_destino then raise exception 'SIGOV: el origen y el destino deben ser cuadrillas distintas'; end if;
  select * into o from public.crews where id = p_origen and service_id = p.service_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la cuadrilla de apoyo no existe en este contrato'; end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then raise exception 'SIGOV: revisa la vigencia (desde < hasta)'; end if;
  if p_hasta <= now() then raise exception 'SIGOV: la vigencia ya terminó'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del apoyo'; end if;
  if length(trim(p_motivo)) > 200 then raise exception 'SIGOV: el motivo admite hasta 200 caracteres'; end if;
  if coalesce(p_alcance, 'pci') = 'items' and coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'SIGOV: elige los ítems del apoyo';
  end if;
  if exists (select 1 from public.apoyos_temporales a where a.crew_origen = p_origen and a.pci_id = p_pci and a.estado = 'vigente'
              and a.hasta > now() and a.desde < p_hasta and a.hasta > p_desde) then
    raise exception 'SIGOV: esa cuadrilla ya tiene un apoyo vigente en este PCI que se solapa con esas fechas';
  end if;
  v_tmp.pci_id := p_pci; v_tmp.crew_destino := p_destino; v_tmp.alcance := coalesce(p_alcance, 'pci'); v_tmp.items := coalesce(p_items, '{}');
  select count(*) into v_n from public.apoyo_items(v_tmp);
  if v_n = 0 then raise exception 'SIGOV: el alcance no tiene ítems de la cuadrilla titular'; end if;

  insert into public.apoyos_temporales (service_id, pci_id, crew_origen, crew_destino, alcance, items, desde, hasta, motivo, creado_por)
  values (p.service_id, p_pci, p_origen, p_destino, coalesce(p_alcance, 'pci'),
          case when p_alcance = 'items' then p_items else '{}' end, p_desde, p_hasta, trim(p_motivo), auth.uid())
  returning id into v_id;
  if o.leader_id is not null then
    perform public.aviso_vivo(p.service_id, o.leader_id, 'apoyo_temporal', 'apoyo:' || v_id,
      format('Apoyo temporal · PCI %s', public.pci_corto(p.code)),
      format('%s ítems para consultar y registrar evidencias, del %s al %s.', v_n,
             to_char(p_desde at time zone 'America/Lima', 'DD/MM HH24:MI'), to_char(p_hasta at time zone 'America/Lima', 'DD/MM HH24:MI')),
      '/pci/' || p_pci, 'info', jsonb_build_object('pci_id', p_pci, 'apoyo_id', v_id));
  end if;
  return json_build_object('apoyo', v_id, 'items', v_n);
end $$;
revoke all on function public.apoyo_autorizar(uuid, uuid, uuid, text, uuid[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.apoyo_autorizar(uuid, uuid, uuid, text, uuid[], timestamptz, timestamptz, text) to authenticated;

/** Revocar el apoyo antes de que caduque: con motivo; conserva autoría e historial. */
create or replace function public.apoyo_revocar(p_apoyo uuid, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare a public.apoyos_temporales; o public.crews;
begin
  select * into a from public.apoyos_temporales where id = p_apoyo for update;
  if not found then raise exception 'SIGOV: el apoyo no existe'; end if;
  if public.role_in(a.service_id) not in ('supervisor', 'admin') or not public.revisa_cuadrilla(a.service_id, a.crew_destino) then
    raise exception 'SIGOV: el apoyo lo revoca el Supervisor de la cuadrilla titular' using errcode = '42501';
  end if;
  if a.estado <> 'vigente' then raise exception 'SIGOV: el apoyo ya fue revocado'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: la revocación requiere un motivo'; end if;
  update public.apoyos_temporales set estado = 'revocado', revocado_por = auth.uid(), revocado_at = now(), motivo_revocacion = trim(p_motivo)
   where id = a.id;
  select * into o from public.crews where id = a.crew_origen;
  if o.leader_id is not null then perform public.aviso_resolver(o.leader_id, 'apoyo_temporal', 'apoyo:' || a.id); end if;
  return json_build_object('revocado', true);
end $$;
revoke all on function public.apoyo_revocar(uuid, text) from public, anon;
grant execute on function public.apoyo_revocar(uuid, text) to authenticated;

/** Autorizar (o descartar) una foto de apoyo cargada fuera de la vigencia. */
create or replace function public.evidencia_autorizar(p_ev uuid, p_aceptar boolean, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare e public.evidences; v_titular uuid;
begin
  select * into e from public.evidences where id = p_ev and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la foto no existe'; end if;
  if not e.autorizacion_pendiente then raise exception 'SIGOV: esa foto no está pendiente de autorización'; end if;
  select assigned_crew_id into v_titular from public.pci_items where id = e.pci_item_id;
  if public.role_in(e.service_id) not in ('supervisor', 'admin') or not public.revisa_cuadrilla(e.service_id, v_titular) then
    raise exception 'SIGOV: la autoriza el Supervisor de la cuadrilla titular' using errcode = '42501';
  end if;
  if p_aceptar then
    update public.evidences set autorizacion_pendiente = false where id = e.id;
  else
    if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe por qué no se autoriza'; end if;
    update public.evidences set deleted_at = now(), revision = 'observada', revisada_at = now(), revisada_por = auth.uid(),
           revision_nota = 'No autorizada (apoyo fuera de vigencia): ' || trim(p_motivo)
     where id = e.id;
  end if;
  return json_build_object('ok', true);
end $$;
revoke all on function public.evidencia_autorizar(uuid, boolean, text) from public, anon;
grant execute on function public.evidencia_autorizar(uuid, boolean, text) to authenticated;

/** Lista de apoyos de un PCI (o del contrato) con su estado efectivo. */
create or replace function public.apoyos_lista(p_service uuid, p_pci uuid default null)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(json_build_object(
           'id', a.id, 'pci_id', a.pci_id, 'pci', x.code, 'origen', co.name, 'origen_id', a.crew_origen,
           'destino', cd.name, 'destino_id', a.crew_destino, 'alcance', a.alcance,
           'items', (select count(*) from public.apoyo_items(a)), 'desde', a.desde, 'hasta', a.hasta, 'motivo', a.motivo,
           'estado', case when a.estado = 'revocado' then 'revocado' when now() >= a.hasta then 'caducado'
                          when now() < a.desde then 'programado' else 'vigente' end,
           'por', pc.full_name, 'cuando', a.creado_at, 'revocado_por', pr.full_name, 'revocado_at', a.revocado_at,
           'motivo_revocacion', a.motivo_revocacion,
           'fotos', (select count(*) from public.evidences e where e.apoyo_id = a.id and e.deleted_at is null),
           'pendientes', (select count(*) from public.evidences e where e.apoyo_id = a.id and e.deleted_at is null and e.autorizacion_pendiente),
           'puedo_revocar', a.estado = 'vigente' and now() < a.hasta and public.role_in(a.service_id) in ('supervisor', 'admin')
                            and public.revisa_cuadrilla(a.service_id, a.crew_destino))
         order by a.creado_at desc), '[]'::json)
    from public.apoyos_temporales a
    join public.pcis x on x.id = a.pci_id
    join public.crews co on co.id = a.crew_origen join public.crews cd on cd.id = a.crew_destino
    left join public.profiles pc on pc.id = a.creado_por left join public.profiles pr on pr.id = a.revocado_por
   where a.service_id = p_service and (p_pci is null or a.pci_id = p_pci)
     and public.is_member(p_service) and not public.es_visor(p_service)
     and (public.role_in(p_service) in ('admin', 'residente')
          or a.crew_origen = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[]))
          or a.crew_destino = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
$$;
grant execute on function public.apoyos_lista(uuid, uuid) to authenticated;
