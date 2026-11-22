-- ═══════════════════════════════════════════════════════════════════════════
-- 0144 · SSOMA: control de inspecciones, documentos con versiones, hallazgos,
--        evidencias e historial inmutable (revisión visual 18/11, T7)
--
-- · Inspecciones (INS-NNN): un registro único que indexa lo que la cuadrilla
--   ya llena (checklist vehicular, ATS, revisión de extintor/botiquín,
--   higiene, charla, checklist). No se captura de nuevo: se revisa.
-- · Estados separados: estado mecánico, vigencia documental, última
--   revisión y aptitud. Registrar una revisión NO cierra hallazgos.
-- · Documentos (DOC-NNN) con versiones: cargar una versión nueva no otorga
--   conformidad; cada versión se revisa (Conforme / Observado + motivo).
-- · Hallazgos (H-NNN): Abierto → Subsanación enviada → Por verificar →
--   Cerrado. «Vencido» es condición calculada (fecha límite pasada), no
--   estado. SSOMA verifica antes de cerrar; nada cambia el avance PCI.
-- · Evidencias (EV-NNN) reutilizables en inspección, hallazgo o documento.
-- · Eventos (EVT-NNN): solo lectura; ni se editan ni se borran.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Correlativos por contrato ────────────────────────────────────────────
create or replace function public.ssoma_siguiente(p_service uuid, p_tabla text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('ssoma:' || p_tabla || ':' || p_service));
  execute format('select coalesce(max(numero), 0) + 1 from public.%I where service_id = $1', p_tabla) into n using p_service;
  return n;
end $$;

-- ─── Inspecciones ─────────────────────────────────────────────────────────
create table if not exists public.ssoma_inspecciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('INS-' || lpad(numero::text, 3, '0')) stored,
  tipo text not null check (tipo in ('vehiculo', 'ats', 'botiquin', 'extintor', 'equipo', 'higiene', 'charla', 'checklist', 'otro')),
  crew_id uuid references public.crews(id),
  fecha timestamptz not null,
  origen_tabla text,
  origen_clave text unique,
  origen_id uuid,
  vehicle_id uuid references public.vehicles(id),
  equipment_id uuid references public.safety_equipment(id),
  inspector_id uuid references public.profiles(id),
  notas text,
  ultima_revision text not null default 'pendiente' check (ultima_revision in ('pendiente', 'conforme', 'observado')),
  revisado_por uuid references public.profiles(id),
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (service_id, numero)
);
create index if not exists ix_ssoma_insp on public.ssoma_inspecciones (service_id, fecha desc);

-- Lo que la cuadrilla registra entra solo a la bandeja de SSOMA
create or replace function public.t_ssoma_registrar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_tipo text; v_clave text; v_fecha timestamptz; v_crew uuid := null; v_veh uuid := null; v_eq uuid := null; v_kind text;
begin
  if new.deleted_at is not null then return null; end if;
  case tg_table_name
    when 'vehicle_checks' then v_tipo := 'vehiculo'; v_clave := 'vehicle_checks:' || new.id; v_fecha := coalesce(new.created_at, new.checked_on::timestamptz);
      v_crew := new.crew_id; v_veh := new.vehicle_id;
    when 'ats_iperc' then v_tipo := 'ats'; v_clave := 'ats_iperc:' || new.id; v_fecha := coalesce(new.created_at, new.doc_date::timestamptz);
      v_crew := new.crew_id; v_veh := new.vehicle_id;
    when 'safety_equipment_checks' then
      select kind::text, crew_id into v_kind, v_crew from public.safety_equipment where id = new.equipment_id;
      v_tipo := case v_kind when 'extintor' then 'extintor' when 'botiquin' then 'botiquin' else 'equipo' end;
      v_clave := 'safety_equipment_checks:' || new.id; v_fecha := coalesce(new.created_at, new.checked_on::timestamptz); v_eq := new.equipment_id;
    when 'hygiene_checks' then v_tipo := 'higiene'; v_clave := 'hygiene:' || new.crew_id || ':' || new.checked_on;
      v_fecha := coalesce(new.created_at, new.checked_on::timestamptz); v_crew := new.crew_id;
    when 'safety_talks' then v_tipo := 'charla'; v_clave := 'safety_talks:' || new.id; v_fecha := coalesce(new.created_at, new.talk_date::timestamptz); v_crew := new.crew_id;
    when 'checklist_responses' then v_tipo := 'checklist'; v_clave := 'checklist_responses:' || new.id; v_fecha := coalesce(new.created_at, new.responded_on::timestamptz); v_crew := new.crew_id;
    else return null;
  end case;
  if exists (select 1 from public.ssoma_inspecciones where origen_clave = v_clave) then return null; end if;
  insert into public.ssoma_inspecciones (service_id, numero, tipo, crew_id, fecha, origen_tabla, origen_clave, origen_id, vehicle_id, equipment_id, inspector_id)
  values (new.service_id, public.ssoma_siguiente(new.service_id, 'ssoma_inspecciones'), v_tipo, v_crew, v_fecha, tg_table_name, v_clave,
          case when tg_table_name = 'hygiene_checks' then null else new.id end, v_veh, v_eq, new.created_by)
  on conflict (origen_clave) do nothing;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['vehicle_checks', 'ats_iperc', 'safety_equipment_checks', 'hygiene_checks', 'safety_talks', 'checklist_responses'] loop
    execute format('drop trigger if exists t_ssoma_registrar on public.%I', t);
    execute format('create trigger t_ssoma_registrar after insert on public.%I for each row execute function public.t_ssoma_registrar()', t);
  end loop;
end $$;

-- Lo que ya existe, en orden de fecha (una vez)
insert into public.ssoma_inspecciones (service_id, numero, tipo, crew_id, fecha, origen_tabla, origen_clave, origen_id, vehicle_id, equipment_id, inspector_id, ultima_revision, revisado_por, revisado_at)
select x.service_id, row_number() over (partition by x.service_id order by x.fecha, x.clave), x.tipo, x.crew_id, x.fecha, x.tabla, x.clave, x.oid, x.veh, x.eq, x.quien,
       x.rev, x.rev_por, x.rev_at
  from (
    select service_id, 'vehiculo' tipo, crew_id, coalesce(created_at, checked_on::timestamptz) fecha, 'vehicle_checks' tabla, 'vehicle_checks:' || id clave, id oid,
           vehicle_id veh, null::uuid eq, created_by quien, 'pendiente' rev, null::uuid rev_por, null::timestamptz rev_at
      from public.vehicle_checks where deleted_at is null
    union all
    select service_id, 'ats', crew_id, coalesce(created_at, doc_date::timestamptz), 'ats_iperc', 'ats_iperc:' || id, id, vehicle_id, null, created_by, 'pendiente', null, null
      from public.ats_iperc where deleted_at is null
    union all
    select c.service_id, case e.kind::text when 'extintor' then 'extintor' when 'botiquin' then 'botiquin' else 'equipo' end, e.crew_id,
           coalesce(c.created_at, c.checked_on::timestamptz), 'safety_equipment_checks', 'safety_equipment_checks:' || c.id, c.id, null, c.equipment_id, c.created_by,
           case c.revision_estado when 'conforme' then 'conforme' when 'observado' then 'observado' when 'requiere_correccion' then 'observado' else 'pendiente' end,
           c.revisado_por, c.revisado_at
      from public.safety_equipment_checks c join public.safety_equipment e on e.id = c.equipment_id where c.deleted_at is null
    union all
    select service_id, 'higiene', crew_id, min(coalesce(created_at, checked_on::timestamptz)), 'hygiene_checks', 'hygiene:' || crew_id || ':' || checked_on, null, null, null,
           (array_agg(created_by))[1], 'pendiente', null, null
      from public.hygiene_checks where deleted_at is null group by service_id, crew_id, checked_on
    union all
    select service_id, 'charla', crew_id, coalesce(created_at, talk_date::timestamptz), 'safety_talks', 'safety_talks:' || id, id, null, null, created_by, 'pendiente', null, null
      from public.safety_talks where deleted_at is null
    union all
    select service_id, 'checklist', crew_id, coalesce(created_at, responded_on::timestamptz), 'checklist_responses', 'checklist_responses:' || id, id, null, null, created_by, 'pendiente', null, null
      from public.checklist_responses where deleted_at is null
  ) x
 where not exists (select 1 from public.ssoma_inspecciones i where i.origen_clave = x.clave);

-- ─── Documentos con versiones ─────────────────────────────────────────────
create table if not exists public.ssoma_documentos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('DOC-' || lpad(numero::text, 3, '0')) stored,
  tipo text not null check (tipo in ('soat', 'revision_tecnica', 'poliza', 'licencia', 'extintor', 'botiquin', 'equipo', 'otro')),
  nombre text not null,
  vehicle_id uuid references public.vehicles(id),
  equipment_id uuid references public.safety_equipment(id),
  crew_id uuid references public.crews(id),
  titular_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (service_id, numero)
);
create unique index if not exists ux_ssoma_doc_vehiculo on public.ssoma_documentos (vehicle_id, tipo) where vehicle_id is not null;
create unique index if not exists ux_ssoma_doc_equipo on public.ssoma_documentos (equipment_id) where equipment_id is not null;

create table if not exists public.ssoma_documento_versiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  documento_id uuid not null references public.ssoma_documentos(id) on delete cascade,
  version integer not null,
  archivo_path text,
  archivo_nombre text,
  vence_on date,
  nota text,
  cargado_por uuid references public.profiles(id),
  cargado_at timestamptz not null default clock_timestamp(),
  revision text not null default 'pendiente' check (revision in ('pendiente', 'conforme', 'observado')),
  revisado_por uuid references public.profiles(id),
  revisado_at timestamptz,
  motivo text,
  unique (documento_id, version)
);

-- Lo que ya figuraba como fecha suelta (vehículos y equipos) queda como v1, por revisar
do $$
declare r record; v_doc uuid; n int;
begin
  for r in
    select v.service_id, v.id veh, v.crew_id, t.tipo, t.nombre, t.vence
      from public.vehicles v
     cross join lateral (values ('soat', 'SOAT', v.soat_expires_on), ('revision_tecnica', 'Revisión técnica', v.inspection_expires_on), ('poliza', 'Póliza', v.policy_expires_on)) t(tipo, nombre, vence)
     where v.deleted_at is null and t.vence is not null
       and not exists (select 1 from public.ssoma_documentos d where d.vehicle_id = v.id and d.tipo = t.tipo)
     order by v.service_id, v.code, t.tipo
  loop
    n := public.ssoma_siguiente(r.service_id, 'ssoma_documentos');
    insert into public.ssoma_documentos (service_id, numero, tipo, nombre, vehicle_id, crew_id)
    values (r.service_id, n, r.tipo, r.nombre || ' · ' || coalesce((select coalesce(code, plate) from public.vehicles where id = r.veh), ''), r.veh, r.crew_id)
    returning id into v_doc;
    insert into public.ssoma_documento_versiones (service_id, documento_id, version, vence_on, nota)
    values (r.service_id, v_doc, 1, r.vence, 'Fecha registrada antes del control de versiones (sin archivo)');
  end loop;
  for r in
    select e.service_id, e.id eq, e.crew_id, e.kind::text kind, e.code, e.expires_on
      from public.safety_equipment e
     where e.deleted_at is null and e.expires_on is not null
       and not exists (select 1 from public.ssoma_documentos d where d.equipment_id = e.id)
     order by e.service_id, e.code
  loop
    n := public.ssoma_siguiente(r.service_id, 'ssoma_documentos');
    insert into public.ssoma_documentos (service_id, numero, tipo, nombre, equipment_id, crew_id)
    values (r.service_id, n, case r.kind when 'extintor' then 'extintor' when 'botiquin' then 'botiquin' else 'equipo' end,
            initcap(replace(r.kind, '_', ' ')) || coalesce(' · ' || r.code, ''), r.eq, r.crew_id)
    returning id into v_doc;
    insert into public.ssoma_documento_versiones (service_id, documento_id, version, vence_on, nota)
    values (r.service_id, v_doc, 1, r.expires_on, 'Fecha registrada antes del control de versiones (sin archivo)');
  end loop;
end $$;

-- ─── Hallazgos, revisiones, evidencias y eventos ──────────────────────────
create table if not exists public.ssoma_hallazgos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('H-' || lpad(numero::text, 3, '0')) stored,
  inspeccion_id uuid references public.ssoma_inspecciones(id),
  documento_id uuid references public.ssoma_documentos(id),
  crew_id uuid references public.crews(id),
  descripcion text not null,
  responsable_id uuid references public.profiles(id),
  responsable_texto text,
  fecha_limite date not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'subsanacion_enviada', 'por_verificar', 'cerrado')),
  bloquea_aptitud boolean not null default true,
  creado_por uuid references public.profiles(id),
  creado_at timestamptz not null default clock_timestamp(),
  cerrado_por uuid references public.profiles(id),
  cerrado_at timestamptz,
  unique (service_id, numero)
);

create table if not exists public.ssoma_evidencias (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('EV-' || lpad(numero::text, 3, '0')) stored,
  objeto_tipo text not null check (objeto_tipo in ('inspeccion', 'hallazgo', 'documento')),
  objeto_id uuid not null,
  storage_path text not null,
  nombre text not null,
  mime text,
  bytes bigint,
  descripcion text not null,
  origen text not null default 'archivo' check (origen in ('camara', 'galeria', 'archivo')),
  tomada_at timestamptz,
  subida_at timestamptz not null default now(),
  autor uuid references public.profiles(id),
  lat double precision,
  lng double precision,
  borrador boolean not null default false,
  unique (service_id, numero)
);
create index if not exists ix_ssoma_ev_objeto on public.ssoma_evidencias (objeto_tipo, objeto_id);

create table if not exists public.ssoma_revisiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  objeto_tipo text not null check (objeto_tipo in ('inspeccion', 'documento', 'hallazgo')),
  objeto_id uuid not null,
  version_id uuid references public.ssoma_documento_versiones(id),
  resultado text check (resultado in ('conforme', 'observado')),
  motivo text,
  evidencias uuid[] not null default '{}',
  borrador boolean not null default false,
  verificado boolean not null default false,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp()
);

create table if not exists public.ssoma_eventos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('EVT-' || lpad(numero::text, 3, '0')) stored,
  inspeccion_id uuid references public.ssoma_inspecciones(id),
  hallazgo_id uuid references public.ssoma_hallazgos(id),
  documento_id uuid references public.ssoma_documentos(id),
  tipo text not null,
  titulo text not null,
  detalle text,
  version integer,
  resultado text,
  antes jsonb,
  despues jsonb,
  evidencias uuid[] not null default '{}',
  actor uuid references public.profiles(id),
  actor_nombre text,
  cuando timestamptz not null default clock_timestamp(),
  unique (service_id, numero)
);
create index if not exists ix_ssoma_evt on public.ssoma_eventos (service_id, cuando desc);

-- Lectura: todo el contrato salvo el visor. Escritura solo por las funciones.
do $$ declare t text; begin
  foreach t in array array['ssoma_inspecciones', 'ssoma_documentos', 'ssoma_documento_versiones', 'ssoma_hallazgos', 'ssoma_evidencias', 'ssoma_revisiones', 'ssoma_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ve_lo_interno(service_id) or public.is_platform_admin())', t || '_select', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.ssoma_evento(p_service uuid, p_tipo text, p_titulo text, p_detalle text default null,
  p_inspeccion uuid default null, p_hallazgo uuid default null, p_documento uuid default null, p_version integer default null,
  p_resultado text default null, p_antes jsonb default null, p_despues jsonb default null, p_evidencias uuid[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid;
begin
  insert into public.ssoma_eventos (service_id, numero, inspeccion_id, hallazgo_id, documento_id, tipo, titulo, detalle, version, resultado, antes, despues, evidencias, actor, actor_nombre)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_eventos'), p_inspeccion, p_hallazgo, p_documento, p_tipo, p_titulo, p_detalle, p_version,
          p_resultado, p_antes, p_despues, coalesce(p_evidencias, '{}'), auth.uid(),
          coalesce((select full_name from public.profiles where id = auth.uid()), 'Sistema'))
  returning id into v;
  return v;
end $$;

-- ─── Vista de inspecciones con sus cuatro estados ─────────────────────────
create or replace view public.v_ssoma_inspecciones with (security_invoker = true) as
select i.*, c.name crew_name, c.code crew_code,
       coalesce(v.code, v.plate, e.code) objeto,
       -- Vigencia documental (vehículo: SOAT, revisión técnica y póliza; equipo: su vencimiento)
       case when i.vehicle_id is not null then
              case when least(v.soat_expires_on, v.inspection_expires_on, v.policy_expires_on) < public.hoy_peru() then 'vencido'
                   when coalesce(v.soat_expires_on, v.inspection_expires_on, v.policy_expires_on) is null then 'sin_dato' else 'vigente' end
            when i.equipment_id is not null then
              case when e.expires_on < public.hoy_peru() then 'vencido' when e.expires_on is null then 'sin_dato' else 'vigente' end
            else 'no_aplica' end vigencia,
       case when i.origen_tabla = 'vehicle_checks' then (select upper(coalesce(vc.general_status, case when vc.conforme then 'operativo' else 'observado' end)) from public.vehicle_checks vc where vc.id = i.origen_id)
            when i.equipment_id is not null then upper(replace(e.status::text, '_', ' '))
            else null end estado_mecanico,
       (select count(*) from public.ssoma_hallazgos h where h.inspeccion_id = i.id and h.estado <> 'cerrado') hallazgos_abiertos,
       (select count(*) from public.ssoma_hallazgos h where h.inspeccion_id = i.id) hallazgos,
       case when (i.vehicle_id is not null and least(v.soat_expires_on, v.inspection_expires_on, v.policy_expires_on) < public.hoy_peru())
              or (i.equipment_id is not null and e.expires_on < public.hoy_peru())
              or exists (select 1 from public.ssoma_hallazgos h where h.inspeccion_id = i.id and h.estado <> 'cerrado' and h.bloquea_aptitud)
              or i.ultima_revision = 'observado' then 'no_apto'
            when i.ultima_revision = 'conforme' then 'apto' else 'pendiente' end aptitud,
       pr.full_name inspector_nombre, rv.full_name revisado_por_nombre
  from public.ssoma_inspecciones i
  left join public.crews c on c.id = i.crew_id
  left join public.vehicles v on v.id = i.vehicle_id
  left join public.safety_equipment e on e.id = i.equipment_id
  left join public.profiles pr on pr.id = i.inspector_id
  left join public.profiles rv on rv.id = i.revisado_por;
grant select on public.v_ssoma_inspecciones to authenticated;

-- ─── Panel «Control SSOMA» ────────────────────────────────────────────────
create or replace function public.ssoma_panel(p_service uuid, p_desde date, p_hasta date, p_crew uuid default null, p_tipo text default null,
                                              p_estado text default null, p_q text default null, p_limite integer default 10, p_desde_fila integer default 0)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_res json;
begin
  if not public.ve_lo_interno(p_service) then raise exception 'SIGOV: sin acceso' using errcode = '42501'; end if;
  with base as (
    select * from public.v_ssoma_inspecciones i
     where i.service_id = p_service and (i.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
       and (p_crew is null or i.crew_id = p_crew) and (p_tipo is null or i.tipo = p_tipo)
       and (p_estado is null or i.ultima_revision = p_estado or i.vigencia = p_estado or i.aptitud = p_estado)
       and (coalesce(trim(p_q), '') = '' or i.codigo ilike '%' || trim(p_q) || '%' or i.crew_name ilike '%' || trim(p_q) || '%'
            or i.objeto ilike '%' || trim(p_q) || '%' or i.tipo ilike '%' || trim(p_q) || '%')
  ), ult as (
    select distinct on (d.id) d.*, v.version, v.vence_on, v.revision, c.name crew_name
      from public.ssoma_documentos d join public.ssoma_documento_versiones v on v.documento_id = d.id
      left join public.crews c on c.id = d.crew_id
     where d.service_id = p_service order by d.id, v.version desc
  )
  select json_build_object(
    'kpis', json_build_object(
      'cuadrillas', (select count(*) from public.crews where service_id = p_service and deleted_at is null),
      'revisiones_pendientes', (select count(*) from base where ultima_revision = 'pendiente'),
      'documentos_vencidos', (select count(*) from ult where vence_on < public.hoy_peru()),
      'hallazgos_abiertos', (select count(*) from public.ssoma_hallazgos where service_id = p_service and estado <> 'cerrado')),
    'total', (select count(*) from base),
    'filas', (select coalesce(json_agg(row_to_json(b)), '[]'::json) from (
                select id, codigo, tipo, crew_name, objeto, fecha, vigencia, ultima_revision, aptitud, hallazgos, hallazgos_abiertos
                  from base order by fecha desc, numero desc limit p_limite offset p_desde_fila) b),
    'alertas', (select coalesce(json_agg(a), '[]'::json) from (
                  select json_build_object('tipo', 'documento', 'texto', u.nombre || ' vencido', 'cuadrilla', u.crew_name, 'nivel', 'rojo', 'estado', 'No apto') a
                    from ult u where u.vence_on < public.hoy_peru()
                  union all
                  select json_build_object('tipo', 'hallazgo', 'texto', h.codigo || ' · ' || h.descripcion, 'cuadrilla', c.name,
                                           'nivel', case when h.fecha_limite < public.hoy_peru() then 'rojo' else 'ambar' end,
                                           'estado', case h.estado when 'abierto' then 'Abierto' when 'por_verificar' then 'Por verificar' else 'Subsanación enviada' end,
                                           'id', h.id)
                    from public.ssoma_hallazgos h left join public.crews c on c.id = h.crew_id
                   where h.service_id = p_service and h.estado <> 'cerrado'
                  limit 8) x)
  ) into v_res;
  return v_res;
end $$;
grant execute on function public.ssoma_panel(uuid, date, date, uuid, text, text, text, integer, integer) to authenticated;

-- ─── Documentos: lista con versiones ──────────────────────────────────────
create or replace function public.ssoma_documentos_lista(p_service uuid, p_crew uuid default null, p_tipo text default null,
                                                         p_vigencia text default null, p_revision text default null, p_q text default null)
returns json language sql stable security definer set search_path to 'public' as $$
  with d as (
    select d.*, c.name crew_name, coalesce(vh.code, vh.plate, e.code) objeto,
           (select row_to_json(x) from (select v.id, v.version, v.vence_on, v.revision, v.archivo_path, v.archivo_nombre, v.cargado_at, v.nota,
                                               p.full_name cargado_por, r.full_name revisado_por, v.revisado_at, v.motivo
                                          from public.ssoma_documento_versiones v left join public.profiles p on p.id = v.cargado_por
                                          left join public.profiles r on r.id = v.revisado_por
                                         where v.documento_id = d.id order by v.version desc limit 1) x) ultima,
           (select coalesce(json_agg(json_build_object('id', v.id, 'version', v.version, 'vence_on', v.vence_on, 'revision', v.revision,
                                                       'archivo_path', v.archivo_path, 'archivo_nombre', v.archivo_nombre, 'cargado_at', v.cargado_at, 'motivo', v.motivo)
                                     order by v.version desc), '[]'::json)
              from public.ssoma_documento_versiones v where v.documento_id = d.id) versiones
      from public.ssoma_documentos d
      left join public.crews c on c.id = d.crew_id
      left join public.vehicles vh on vh.id = d.vehicle_id
      left join public.safety_equipment e on e.id = d.equipment_id
     where d.service_id = p_service and public.ve_lo_interno(p_service)
       and (p_crew is null or d.crew_id = p_crew) and (p_tipo is null or d.tipo = p_tipo)
       and (coalesce(trim(p_q), '') = '' or d.codigo ilike '%' || trim(p_q) || '%' or d.nombre ilike '%' || trim(p_q) || '%' or c.name ilike '%' || trim(p_q) || '%')
  ), f as (
    select d.*, case when (d.ultima->>'vence_on') is null then 'no_aplica'
                     when (d.ultima->>'vence_on')::date < public.hoy_peru() then 'vencido' else 'vigente' end vigencia
      from d
  )
  select json_build_object(
    'kpis', json_build_object('documentos', (select count(*) from f),
                              'pendiente', (select count(*) from f where ultima->>'revision' = 'pendiente'),
                              'observado', (select count(*) from f where ultima->>'revision' = 'observado'),
                              'conformes', (select count(*) from f where ultima->>'revision' = 'conforme'),
                              'vencidos', (select count(*) from f where vigencia = 'vencido')),
    'filas', (select coalesce(json_agg(json_build_object('id', f.id, 'codigo', f.codigo, 'tipo', f.tipo, 'nombre', f.nombre, 'crew_name', f.crew_name,
                        'objeto', f.objeto, 'vehicle_id', f.vehicle_id, 'equipment_id', f.equipment_id, 'vigencia', f.vigencia,
                        'ultima', f.ultima, 'versiones', f.versiones) order by (f.vigencia = 'vencido') desc, f.nombre), '[]'::json)
                from f where (p_vigencia is null or f.vigencia = p_vigencia) and (p_revision is null or f.ultima->>'revision' = p_revision))
  )
$$;
grant execute on function public.ssoma_documentos_lista(uuid, uuid, text, text, text, text) to authenticated;

/** Crear un documento (p. ej. una licencia) y cargar una versión nueva. Cargar no otorga conformidad. */
create or replace function public.ssoma_documento_crear(p_service uuid, p_tipo text, p_nombre text, p_vehicle uuid default null,
                                                        p_equipment uuid default null, p_crew uuid default null, p_titular uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid;
begin
  if not public.can_write(p_service) then raise exception 'SIGOV: sin permiso' using errcode = '42501'; end if;
  insert into public.ssoma_documentos (service_id, numero, tipo, nombre, vehicle_id, equipment_id, crew_id, titular_id)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_documentos'), p_tipo, trim(p_nombre), p_vehicle, p_equipment,
          coalesce(p_crew, (select crew_id from public.vehicles where id = p_vehicle), (select crew_id from public.safety_equipment where id = p_equipment)), p_titular)
  returning id into v;
  return v;
end $$;
grant execute on function public.ssoma_documento_crear(uuid, text, text, uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.ssoma_documento_version(p_documento uuid, p_vence date, p_archivo_path text, p_archivo_nombre text, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare d public.ssoma_documentos; prev public.ssoma_documento_versiones; v_ver int; v_id uuid;
begin
  select * into d from public.ssoma_documentos where id = p_documento;
  if not found then raise exception 'SIGOV: el documento no existe'; end if;
  if not public.can_write(d.service_id) then raise exception 'SIGOV: sin permiso para cargar documentos' using errcode = '42501'; end if;
  if p_archivo_path is null then raise exception 'SIGOV: adjunta el archivo de la nueva versión'; end if;
  select * into prev from public.ssoma_documento_versiones where documento_id = d.id order by version desc limit 1;
  v_ver := coalesce(prev.version, 0) + 1;
  insert into public.ssoma_documento_versiones (service_id, documento_id, version, archivo_path, archivo_nombre, vence_on, nota, cargado_por)
  values (d.service_id, d.id, v_ver, p_archivo_path, p_archivo_nombre, p_vence, nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  -- La fecha operativa del vehículo o equipo sigue a la última versión
  if d.vehicle_id is not null and p_vence is not null then
    update public.vehicles set soat_expires_on = case when d.tipo = 'soat' then p_vence else soat_expires_on end,
           inspection_expires_on = case when d.tipo = 'revision_tecnica' then p_vence else inspection_expires_on end,
           policy_expires_on = case when d.tipo = 'poliza' then p_vence else policy_expires_on end, updated_at = now()
     where id = d.vehicle_id;
  elsif d.equipment_id is not null and p_vence is not null then
    update public.safety_equipment set expires_on = p_vence, updated_at = now() where id = d.equipment_id;
  end if;
  perform public.ssoma_evento(d.service_id, 'nueva_version', 'Nueva versión ' || d.nombre, p_nota, null, null, d.id, v_ver, 'pendiente',
    case when prev.id is null then null else jsonb_build_object('version', prev.version, 'vence_on', prev.vence_on, 'revision', prev.revision) end,
    jsonb_build_object('version', v_ver, 'vence_on', p_vence, 'revision', 'pendiente'));
  return json_build_object('version', v_ver, 'id', v_id);
end $$;
grant execute on function public.ssoma_documento_version(uuid, date, text, text, text) to authenticated;

-- ─── Revisión (inspección, versión de documento o verificación de hallazgo) ─
create or replace function public.ssoma_revisar(p_objeto_tipo text, p_objeto_id uuid, p_resultado text, p_motivo text,
                                                p_evidencias uuid[] default '{}', p_borrador boolean default false, p_verificado boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_sid uuid; i public.ssoma_inspecciones; v public.ssoma_documento_versiones; d public.ssoma_documentos; h public.ssoma_hallazgos; v_txt text;
begin
  if p_objeto_tipo = 'inspeccion' then select * into i from public.ssoma_inspecciones where id = p_objeto_id for update; v_sid := i.service_id;
  elsif p_objeto_tipo = 'documento' then
    select * into d from public.ssoma_documentos where id = p_objeto_id; v_sid := d.service_id;
    select * into v from public.ssoma_documento_versiones where documento_id = d.id order by version desc limit 1 for update;
  elsif p_objeto_tipo = 'hallazgo' then select * into h from public.ssoma_hallazgos where id = p_objeto_id for update; v_sid := h.service_id;
  else raise exception 'SIGOV: objeto no válido'; end if;
  if v_sid is null then raise exception 'SIGOV: no existe'; end if;
  if not public.puede_revisar_ssoma(v_sid) then raise exception 'SIGOV: la revisión la registra el Encargado SSOMA' using errcode = '42501'; end if;

  if coalesce(p_borrador, false) then
    insert into public.ssoma_revisiones (service_id, objeto_tipo, objeto_id, version_id, resultado, motivo, evidencias, borrador, quien)
    values (v_sid, p_objeto_tipo, p_objeto_id, v.id, p_resultado, nullif(trim(p_motivo), ''), coalesce(p_evidencias, '{}'), true, auth.uid());
    perform public.ssoma_evento(v_sid, 'borrador', 'Borrador de revisión guardado', nullif(trim(p_motivo), ''),
      case when p_objeto_tipo = 'inspeccion' then i.id end, case when p_objeto_tipo = 'hallazgo' then h.id end,
      case when p_objeto_tipo = 'documento' then d.id end, v.version, 'pendiente');
    return json_build_object('borrador', true);
  end if;

  if p_resultado not in ('conforme', 'observado') then raise exception 'SIGOV: elige el resultado (Conforme u Observado)'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la revisión'; end if;
  if length(trim(p_motivo)) > 500 then raise exception 'SIGOV: el motivo admite hasta 500 caracteres'; end if;
  insert into public.ssoma_revisiones (service_id, objeto_tipo, objeto_id, version_id, resultado, motivo, evidencias, verificado, quien)
  values (v_sid, p_objeto_tipo, p_objeto_id, v.id, p_resultado, trim(p_motivo), coalesce(p_evidencias, '{}'), coalesce(p_verificado, false), auth.uid());
  v_txt := case p_resultado when 'conforme' then 'Conforme' else 'Observado' end;

  if p_objeto_tipo = 'inspeccion' then
    -- Registrar no cierra hallazgos: solo fija la última revisión
    update public.ssoma_inspecciones set ultima_revision = p_resultado, revisado_por = auth.uid(), revisado_at = now() where id = i.id;
    perform public.ssoma_evento(v_sid, 'revision', 'Revisión registrada: ' || v_txt, trim(p_motivo), i.id, null, null, null, p_resultado,
      jsonb_build_object('ultima_revision', i.ultima_revision), jsonb_build_object('ultima_revision', p_resultado), p_evidencias);
  elsif p_objeto_tipo = 'documento' then
    if v.id is null then raise exception 'SIGOV: el documento no tiene versiones'; end if;
    update public.ssoma_documento_versiones set revision = p_resultado, revisado_por = auth.uid(), revisado_at = now(), motivo = trim(p_motivo) where id = v.id;
    perform public.ssoma_evento(v_sid, 'revision', 'Revisión de ' || d.nombre || ' v' || v.version || ': ' || v_txt, trim(p_motivo), null, null, d.id,
      v.version, p_resultado, jsonb_build_object('revision', v.revision), jsonb_build_object('revision', p_resultado), p_evidencias);
  else
    -- Hallazgo: se cierra solo con revisión conforme y verificación expresa
    if h.estado = 'cerrado' then raise exception 'SIGOV: el hallazgo ya está cerrado'; end if;
    if p_resultado = 'conforme' and not coalesce(p_verificado, false) then
      raise exception 'SIGOV: marca «He verificado el documento y el vehículo» para cerrar el hallazgo';
    end if;
    update public.ssoma_hallazgos set estado = case when p_resultado = 'conforme' then 'cerrado' else 'abierto' end,
           cerrado_por = case when p_resultado = 'conforme' then auth.uid() end, cerrado_at = case when p_resultado = 'conforme' then now() end
     where id = h.id;
    perform public.ssoma_evento(v_sid, case when p_resultado = 'conforme' then 'hallazgo_cerrado' else 'hallazgo_reabierto' end,
      case when p_resultado = 'conforme' then 'Hallazgo cerrado tras verificación' else 'Subsanación observada: vuelve a abierto' end,
      trim(p_motivo), h.inspeccion_id, h.id, h.documento_id, null, p_resultado,
      jsonb_build_object('estado', h.estado), jsonb_build_object('estado', case when p_resultado = 'conforme' then 'cerrado' else 'abierto' end), p_evidencias);
    if h.responsable_id is not null then
      perform public.aviso_vivo(v_sid, h.responsable_id, 'ssoma_hallazgo', 'hz:' || h.id,
        format('Hallazgo %s %s', h.codigo, case when p_resultado = 'conforme' then 'cerrado' else 'observado otra vez' end),
        trim(p_motivo), '/ssoma/hallazgos/' || h.id, case when p_resultado = 'conforme' then 'info' else 'warning' end,
        jsonb_build_object('hallazgo_id', h.id));
    end if;
  end if;
  return json_build_object('ok', true, 'resultado', p_resultado);
end $$;
grant execute on function public.ssoma_revisar(text, uuid, text, text, uuid[], boolean, boolean) to authenticated;

-- ─── Hallazgos ────────────────────────────────────────────────────────────
create or replace function public.ssoma_hallazgo_crear(p_inspeccion uuid, p_descripcion text, p_fecha_limite date,
  p_responsable uuid default null, p_responsable_texto text default null, p_documento uuid default null, p_bloquea boolean default true)
returns json language plpgsql security definer set search_path to 'public' as $$
declare i public.ssoma_inspecciones; v_id uuid; v_cod text; v_resp uuid;
begin
  select * into i from public.ssoma_inspecciones where id = p_inspeccion;
  if not found then raise exception 'SIGOV: la inspección no existe'; end if;
  if not public.puede_revisar_ssoma(i.service_id) then raise exception 'SIGOV: el hallazgo lo registra el Encargado SSOMA' using errcode = '42501'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'SIGOV: describe el hallazgo'; end if;
  if p_fecha_limite is null then raise exception 'SIGOV: indica la fecha límite'; end if;
  v_resp := coalesce(p_responsable, case when nullif(trim(p_responsable_texto), '') is null then (select leader_id from public.crews where id = i.crew_id) end);
  insert into public.ssoma_hallazgos (service_id, numero, inspeccion_id, documento_id, crew_id, descripcion, responsable_id, responsable_texto, fecha_limite, bloquea_aptitud, creado_por)
  values (i.service_id, public.ssoma_siguiente(i.service_id, 'ssoma_hallazgos'), i.id, p_documento, i.crew_id, trim(p_descripcion), v_resp,
          nullif(trim(p_responsable_texto), ''), p_fecha_limite, coalesce(p_bloquea, true), auth.uid())
  returning id, codigo into v_id, v_cod;
  perform public.ssoma_evento(i.service_id, 'hallazgo_creado', 'Hallazgo creado ' || v_cod, trim(p_descripcion), i.id, v_id, p_documento, null, 'observado');
  if v_resp is not null then
    perform public.aviso_vivo(i.service_id, v_resp, 'ssoma_hallazgo', 'hz:' || v_id, format('Hallazgo %s · %s', v_cod, trim(p_descripcion)),
      format('Subsanar hasta el %s. Responde con la evidencia desde el hallazgo.', to_char(p_fecha_limite, 'DD/MM/YYYY')),
      '/ssoma/hallazgos/' || v_id, 'warning', jsonb_build_object('hallazgo_id', v_id));
  end if;
  return json_build_object('id', v_id, 'codigo', v_cod);
end $$;
grant execute on function public.ssoma_hallazgo_crear(uuid, text, date, uuid, text, uuid, boolean) to authenticated;

/** La respuesta del responsable (subsanación enviada): pasa a «Por verificar». No cierra nada. */
create or replace function public.ssoma_hallazgo_responder(p_hallazgo uuid, p_texto text, p_evidencias uuid[] default '{}')
returns json language plpgsql security definer set search_path to 'public' as $$
declare h public.ssoma_hallazgos; r record;
begin
  select * into h from public.ssoma_hallazgos where id = p_hallazgo for update;
  if not found then raise exception 'SIGOV: el hallazgo no existe'; end if;
  if h.estado = 'cerrado' then raise exception 'SIGOV: el hallazgo ya está cerrado'; end if;
  if not (h.responsable_id = auth.uid() or public.cuadrilla_a_mi_cargo(h.service_id, h.crew_id) or public.puede_revisar_ssoma(h.service_id)) then
    raise exception 'SIGOV: solo el responsable o su cuadrilla responden el hallazgo' using errcode = '42501';
  end if;
  if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: describe la subsanación'; end if;
  update public.ssoma_hallazgos set estado = 'por_verificar' where id = h.id;
  perform public.ssoma_evento(h.service_id, 'respuesta', 'Respuesta del responsable', trim(p_texto), h.inspeccion_id, h.id, h.documento_id, null,
    'subsanacion_enviada', jsonb_build_object('estado', h.estado), jsonb_build_object('estado', 'subsanacion_enviada'), p_evidencias);
  perform public.ssoma_evento(h.service_id, 'verificacion_pendiente', 'Verificación pendiente', 'Comprobar la subsanación antes de cerrar.',
    h.inspeccion_id, h.id, h.documento_id, null, 'por_verificar');
  for r in select profile_id from public.service_members where service_id = h.service_id and role = 'ing_seguridad' loop
    perform public.aviso_vivo(h.service_id, r.profile_id, 'ssoma_hallazgo', 'hzr:' || h.id, format('Hallazgo %s · subsanación enviada', h.codigo),
      trim(p_texto), '/ssoma/hallazgos/' || h.id, 'info', jsonb_build_object('hallazgo_id', h.id));
  end loop;
  return json_build_object('estado', 'por_verificar');
end $$;
grant execute on function public.ssoma_hallazgo_responder(uuid, text, uuid[]) to authenticated;

create or replace function public.ssoma_hallazgos_lista(p_service uuid, p_crew uuid default null, p_responsable uuid default null, p_estado text default null,
                                                        p_desde date default null, p_hasta date default null, p_q text default null)
returns json language sql stable security definer set search_path to 'public' as $$
  with h as (
    select h.*, c.name crew_name, i.codigo inspeccion_codigo, coalesce(p.full_name, h.responsable_texto) responsable,
           h.estado <> 'cerrado' and h.fecha_limite < public.hoy_peru() vencido,
           (select row_to_json(x) from (select e.detalle, e.cuando, e.actor_nombre, e.evidencias from public.ssoma_eventos e
                                         where e.hallazgo_id = h.id and e.tipo = 'respuesta' order by e.cuando desc limit 1) x) respuesta
      from public.ssoma_hallazgos h
      left join public.crews c on c.id = h.crew_id
      left join public.ssoma_inspecciones i on i.id = h.inspeccion_id
      left join public.profiles p on p.id = h.responsable_id
     where h.service_id = p_service and public.ve_lo_interno(p_service)
       and (p_crew is null or h.crew_id = p_crew) and (p_responsable is null or h.responsable_id = p_responsable)
       and (p_desde is null or h.creado_at::date >= p_desde) and (p_hasta is null or h.creado_at::date <= p_hasta)
       and (coalesce(trim(p_q), '') = '' or h.codigo ilike '%' || trim(p_q) || '%' or h.descripcion ilike '%' || trim(p_q) || '%'
            or i.codigo ilike '%' || trim(p_q) || '%')
  )
  select json_build_object(
    'kpis', json_build_object('abiertos', (select count(*) from h where estado = 'abierto'), 'por_verificar', (select count(*) from h where estado in ('por_verificar', 'subsanacion_enviada')),
                              'cerrados', (select count(*) from h where estado = 'cerrado'), 'vencidos', (select count(*) from h where vencido)),
    'responsables', (select coalesce(json_agg(distinct jsonb_build_object('id', responsable_id, 'nombre', responsable)), '[]'::json) from h where responsable_id is not null),
    'filas', (select coalesce(json_agg(row_to_json(x) order by x.creado_at desc), '[]'::json) from (
                select id, codigo, descripcion, inspeccion_id, inspeccion_codigo, crew_name, responsable, fecha_limite, estado, vencido, respuesta, creado_at
                  from h where p_estado is null or (p_estado = 'vencido' and vencido) or estado = p_estado) x)
  )
$$;
grant execute on function public.ssoma_hallazgos_lista(uuid, uuid, uuid, text, date, date, text) to authenticated;

-- ─── Evidencias ───────────────────────────────────────────────────────────
create or replace function public.ssoma_evidencia_registrar(p_service uuid, p_objeto_tipo text, p_objeto_id uuid, p_path text, p_nombre text,
  p_mime text, p_bytes bigint, p_descripcion text, p_origen text default 'archivo', p_tomada_at timestamptz default null,
  p_borrador boolean default false, p_lat double precision default null, p_lng double precision default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_cod text; v_insp uuid; v_hz uuid; v_doc uuid;
begin
  if not public.can_write(p_service) then raise exception 'SIGOV: sin permiso para adjuntar' using errcode = '42501'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'SIGOV: la descripción es obligatoria'; end if;
  if split_part(p_path, '/', 1) <> p_service::text then raise exception 'SIGOV: ruta de archivo no válida'; end if;
  insert into public.ssoma_evidencias (service_id, numero, objeto_tipo, objeto_id, storage_path, nombre, mime, bytes, descripcion, origen, tomada_at, autor, lat, lng, borrador)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_evidencias'), p_objeto_tipo, p_objeto_id, p_path, p_nombre, p_mime, p_bytes,
          left(trim(p_descripcion), 250), coalesce(p_origen, 'archivo'), p_tomada_at, auth.uid(), p_lat, p_lng, coalesce(p_borrador, false))
  returning id, codigo into v_id, v_cod;
  if p_objeto_tipo = 'inspeccion' then v_insp := p_objeto_id;
  elsif p_objeto_tipo = 'hallazgo' then v_hz := p_objeto_id; select inspeccion_id into v_insp from public.ssoma_hallazgos where id = p_objeto_id;
  else v_doc := p_objeto_id; end if;
  perform public.ssoma_evento(p_service, 'evidencia', case when p_borrador then 'Evidencia en borrador ' else 'Evidencia adjunta ' end || v_cod || ' · ' || p_nombre,
    left(trim(p_descripcion), 250), v_insp, v_hz, v_doc, null, null, null, null, array[v_id]);
  return json_build_object('id', v_id, 'codigo', v_cod);
end $$;
grant execute on function public.ssoma_evidencia_registrar(uuid, text, uuid, text, text, text, bigint, text, text, timestamptz, boolean, double precision, double precision) to authenticated;

-- ─── Detalle de inspección e historial ────────────────────────────────────
create or replace function public.ssoma_inspeccion(p_id uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare i record; v_res json;
begin
  select * into i from public.v_ssoma_inspecciones where id = p_id;
  if not found or not public.ve_lo_interno(i.service_id) then raise exception 'SIGOV: sin acceso' using errcode = '42501'; end if;
  select json_build_object(
    'inspeccion', (select row_to_json(x) from public.v_ssoma_inspecciones x where x.id = p_id),
    'documentos', (select coalesce(json_agg(json_build_object('id', d.id, 'codigo', d.codigo, 'tipo', d.tipo, 'nombre', d.nombre,
                     'version', v.version, 'vence_on', v.vence_on, 'revision', v.revision, 'archivo_path', v.archivo_path,
                     'vigencia', case when v.vence_on is null then 'no_aplica' when v.vence_on < public.hoy_peru() then 'vencido' else 'vigente' end)
                   order by d.tipo), '[]'::json)
                     from public.ssoma_documentos d
                     left join lateral (select * from public.ssoma_documento_versiones v where v.documento_id = d.id order by v.version desc limit 1) v on true
                    where (i.vehicle_id is not null and d.vehicle_id = i.vehicle_id) or (i.equipment_id is not null and d.equipment_id = i.equipment_id)),
    'hallazgos', (select coalesce(json_agg(json_build_object('id', h.id, 'codigo', h.codigo, 'descripcion', h.descripcion,
                    'responsable', coalesce(p.full_name, h.responsable_texto), 'fecha_limite', h.fecha_limite, 'estado', h.estado,
                    'vencido', h.estado <> 'cerrado' and h.fecha_limite < public.hoy_peru()) order by h.numero), '[]'::json)
                    from public.ssoma_hallazgos h left join public.profiles p on p.id = h.responsable_id where h.inspeccion_id = p_id),
    'evidencias', (select coalesce(json_agg(json_build_object('id', e.id, 'codigo', e.codigo, 'nombre', e.nombre, 'mime', e.mime, 'bytes', e.bytes,
                     'storage_path', e.storage_path, 'descripcion', e.descripcion, 'origen', e.origen, 'tomada_at', e.tomada_at, 'subida_at', e.subida_at,
                     'autor', p.full_name, 'lat', e.lat, 'lng', e.lng, 'borrador', e.borrador, 'objeto_tipo', e.objeto_tipo) order by e.numero), '[]'::json)
                     from public.ssoma_evidencias e left join public.profiles p on p.id = e.autor
                    where (e.objeto_tipo = 'inspeccion' and e.objeto_id = p_id)
                       or (e.objeto_tipo = 'hallazgo' and e.objeto_id in (select id from public.ssoma_hallazgos where inspeccion_id = p_id))),
    -- Las fotos que ya trae el registro de campo (no se duplican: se enlazan)
    'fotos_origen', (case i.origen_tabla
                       when 'safety_equipment_checks' then (select coalesce(json_agg(json_build_object('path', c.storage_path, 'bucket', 'documentos', 'nombre', 'Foto de la revisión')), '[]'::json)
                                                              from public.safety_equipment_checks c where c.id = i.origen_id and c.storage_path is not null)
                       when 'hygiene_checks' then (select coalesce(json_agg(json_build_object('path', h.storage_path, 'bucket', 'documentos', 'nombre', 'Higiene · ' || h.item)), '[]'::json)
                                                     from public.hygiene_checks h where h.crew_id = i.crew_id and h.checked_on = (i.fecha at time zone 'America/Lima')::date
                                                      and h.storage_path is not null and h.deleted_at is null)
                       else (select coalesce(json_agg(json_build_object('path', p.storage_path, 'bucket', 'documentos', 'nombre', 'Formato · ' || dd.tipo)), '[]'::json)
                               from public.documentos_del_dia dd join public.documento_paginas p on p.documento_id = dd.id
                              where dd.crew_id = i.crew_id and dd.doc_date = (i.fecha at time zone 'America/Lima')::date and dd.deleted_at is null and p.deleted_at is null
                                and dd.tipo::text = case i.tipo when 'vehiculo' then 'checklist_vehicular' when 'ats' then 'ats' when 'charla' then 'charla' when 'checklist' then 'checklist' else '-' end)
                     end),
    'revision_borrador', (select row_to_json(r) from (select resultado, motivo, cuando from public.ssoma_revisiones
                            where objeto_tipo = 'inspeccion' and objeto_id = p_id and borrador and quien = auth.uid() order by cuando desc limit 1) r)
  ) into v_res;
  return v_res;
end $$;
grant execute on function public.ssoma_inspeccion(uuid) to authenticated;

create or replace function public.ssoma_historial(p_inspeccion uuid default null, p_hallazgo uuid default null, p_documento uuid default null)
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(json_build_object('id', e.id, 'codigo', e.codigo, 'tipo', e.tipo, 'titulo', e.titulo, 'detalle', e.detalle,
           'version', e.version, 'resultado', e.resultado, 'antes', e.antes, 'despues', e.despues, 'actor', coalesce(e.actor_nombre, 'Sistema'),
           'cuando', e.cuando, 'hallazgo_id', e.hallazgo_id, 'documento_id', e.documento_id,
           'hallazgo_codigo', (select codigo from public.ssoma_hallazgos where id = e.hallazgo_id),
           'evidencias', (select coalesce(json_agg(json_build_object('id', x.id, 'codigo', x.codigo, 'nombre', x.nombre, 'storage_path', x.storage_path, 'bytes', x.bytes, 'mime', x.mime)), '[]'::json)
                            from public.ssoma_evidencias x where x.id = any(e.evidencias)))
         order by e.cuando desc), '[]'::json)
    from public.ssoma_eventos e
   where public.ve_lo_interno(e.service_id)
     and ((p_inspeccion is not null and (e.inspeccion_id = p_inspeccion
            or e.hallazgo_id in (select id from public.ssoma_hallazgos where inspeccion_id = p_inspeccion)
            or e.documento_id in (select d.id from public.ssoma_documentos d join public.ssoma_inspecciones i on i.id = p_inspeccion
                                   where (i.vehicle_id is not null and d.vehicle_id = i.vehicle_id) or (i.equipment_id is not null and d.equipment_id = i.equipment_id))))
       or (p_hallazgo is not null and e.hallazgo_id = p_hallazgo)
       or (p_documento is not null and e.documento_id = p_documento))
$$;
grant execute on function public.ssoma_historial(uuid, uuid, uuid) to authenticated;

/** Una inspección registrada por SSOMA (sin registro de campo detrás). */
create or replace function public.ssoma_inspeccion_crear(p_service uuid, p_tipo text, p_crew uuid, p_vehicle uuid default null, p_equipment uuid default null, p_notas text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_cod text;
begin
  if not public.puede_revisar_ssoma(p_service) then raise exception 'SIGOV: la inspección la registra el Encargado SSOMA' using errcode = '42501'; end if;
  insert into public.ssoma_inspecciones (service_id, numero, tipo, crew_id, fecha, origen_tabla, vehicle_id, equipment_id, inspector_id, notas)
  values (p_service, public.ssoma_siguiente(p_service, 'ssoma_inspecciones'), p_tipo, p_crew, now(), 'ssoma', p_vehicle, p_equipment, auth.uid(), nullif(trim(p_notas), ''))
  returning id, codigo into v_id, v_cod;
  perform public.ssoma_evento(p_service, 'inspeccion_registrada', 'Nueva inspección', nullif(trim(p_notas), ''), v_id);
  return json_build_object('id', v_id, 'codigo', v_cod);
end $$;
grant execute on function public.ssoma_inspeccion_crear(uuid, text, uuid, uuid, uuid, text) to authenticated;

revoke all on function public.ssoma_siguiente(uuid, text), public.ssoma_evento(uuid, text, text, text, uuid, uuid, uuid, integer, text, jsonb, jsonb, uuid[]) from public, anon, authenticated;
