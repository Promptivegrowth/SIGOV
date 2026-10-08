-- ═══════════════════════════════════════════════════════════════════════
-- 0078 · Los documentos del día
--
-- Reunión con Elvis (05-10-2026, 00:07–01:23) y OBS-53 a OBS-60:
--
-- · ATS, charla de 5 minutos y checklist vehicular se llenan en papel,
--   como hoy («mejor que lo manejen con foto, que rellenen en físico»), y la
--   app guarda la FOTO del formato: «simplemente debo guardar las fotos».
--   Solo el reporte diario se digitaliza.
-- · Cada formato es diario: si el de hoy falta, aparece en ROJO.
-- · El Ing. SSOMA revisa: pendiente de revisión → conforme | observado
--   (con motivo, y el jefe se entera) → subsanado → …
--
-- Una cabecera por cuadrilla, fecha y tipo (y vehículo, para el checklist
-- vehicular), con sus páginas: un ATS puede tener dos hojas. Todo pasa por
-- funciones de la base: nadie se pone «conforme» a sí mismo.
--
-- Un documento cuenta como cargado también si se llenó el formulario
-- digital que ya existía (ATS, charla, checklist, higiene): no se pierde lo
-- que las cuadrillas ya registraron.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.documento_tipo as enum
    ('ats', 'charla', 'checklist_vehicular', 'higiene', 'inspeccion_equipos', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.revision_ssoma as enum
    ('pendiente_revision', 'conforme', 'observado', 'subsanado');
exception when duplicate_object then null; end $$;

create table if not exists public.documentos_del_dia (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  crew_id       uuid not null references public.crews(id),
  doc_date      date not null,
  tipo          public.documento_tipo not null,
  vehicle_id    uuid references public.vehicles(id),
  titulo        text,
  estado        public.revision_ssoma not null default 'pendiente_revision',
  observacion   text,
  revisado_por  uuid references public.profiles(id),
  revisado_en   timestamptz,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint documentos_observado_con_motivo
    check (estado <> 'observado' or nullif(trim(observacion), '') is not null)
);

comment on table public.documentos_del_dia is
  'Formato físico diario fotografiado (ATS, charla, checklist vehicular…) por cuadrilla y fecha, con su revisión SSOMA.';

create unique index if not exists documentos_del_dia_unico
  on public.documentos_del_dia (crew_id, doc_date, tipo,
     coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(titulo, ''))
  where deleted_at is null;
create index if not exists documentos_del_dia_servicio_fecha
  on public.documentos_del_dia (service_id, doc_date);

create table if not exists public.documento_paginas (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null unique,
  documento_id uuid not null references public.documentos_del_dia(id) on delete cascade,
  service_id   uuid not null references public.services(id) on delete cascade,
  storage_path text not null,
  lat          double precision,
  lng          double precision,
  taken_at     timestamptz not null default now(),
  sha256       text,
  width        integer,
  height       integer,
  size_bytes   bigint,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists documento_paginas_documento on public.documento_paginas (documento_id);

alter table public.documentos_del_dia enable row level security;
alter table public.documento_paginas enable row level security;

-- Se leen como cualquier dato del contrato; se escriben solo por funciones
drop policy if exists documentos_del_dia_select on public.documentos_del_dia;
create policy documentos_del_dia_select on public.documentos_del_dia for select to authenticated
  using (public.is_member(service_id));
drop policy if exists documento_paginas_select on public.documento_paginas;
create policy documento_paginas_select on public.documento_paginas for select to authenticated
  using (public.is_member(service_id));

drop trigger if exists t_audit_documentos_del_dia on public.documentos_del_dia;
create trigger t_audit_documentos_del_dia after insert or update or delete on public.documentos_del_dia
  for each row execute function public.audit_trigger();
drop trigger if exists t_audit_documento_paginas on public.documento_paginas;
create trigger t_audit_documento_paginas after insert or update or delete on public.documento_paginas
  for each row execute function public.audit_trigger();

-- ─── Quién revisa: el Ing. SSOMA, el supervisor y quien administra ─────
create or replace function public.puede_revisar_ssoma(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) in ('admin', 'supervisor', 'ing_seguridad')
$$;

-- ─── Cargar una página (la cola de la app la llama con su client_id) ───
create or replace function public.cargar_pagina_documento(
  p_client_id    uuid,
  p_service_id   uuid,
  p_crew_id      uuid,
  p_fecha        date,
  p_tipo         text,
  p_storage_path text,
  p_vehicle_id   uuid default null,
  p_titulo       text default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_taken_at     timestamptz default null,
  p_sha256       text default null,
  p_width        integer default null,
  p_height       integer default null,
  p_size_bytes   bigint default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_doc public.documentos_del_dia;
begin
  if not public.can_write(p_service_id) then
    raise exception 'SIGOV: no tienes permiso para cargar documentos' using errcode = '42501';
  end if;
  -- El jefe carga los de su cuadrilla; SSOMA y quien administra, cualquiera
  if not (public.puede_revisar_ssoma(p_service_id)
          or exists (select 1 from public.crews c where c.id = p_crew_id and c.leader_id = auth.uid())) then
    raise exception 'SIGOV: esa cuadrilla no es la tuya' using errcode = '42501';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_service_id::text then
    raise exception 'SIGOV: ruta de archivo inválida';
  end if;

  -- Reintento de la cola: la página ya está
  if exists (select 1 from public.documento_paginas where client_id = p_client_id) then
    select d.* into v_doc from public.documentos_del_dia d
      join public.documento_paginas p on p.documento_id = d.id
     where p.client_id = p_client_id;
    return json_build_object('documento_id', v_doc.id, 'estado', v_doc.estado);
  end if;

  select * into v_doc from public.documentos_del_dia
   where crew_id = p_crew_id and doc_date = p_fecha and tipo = p_tipo::public.documento_tipo
     and vehicle_id is not distinct from p_vehicle_id
     and coalesce(titulo, '') = coalesce(nullif(trim(p_titulo), ''), '')
     and deleted_at is null;

  if not found then
    insert into public.documentos_del_dia (service_id, crew_id, doc_date, tipo, vehicle_id, titulo, created_by)
    values (p_service_id, p_crew_id, p_fecha, p_tipo::public.documento_tipo, p_vehicle_id,
            nullif(trim(p_titulo), ''), auth.uid())
    returning * into v_doc;
  elsif v_doc.estado = 'observado' then
    -- Una foto nueva sobre lo observado es la subsanación: vuelve a revisión
    update public.documentos_del_dia
       set estado = 'subsanado', updated_at = now()
     where id = v_doc.id
    returning * into v_doc;
  elsif v_doc.estado = 'conforme' then
    raise exception 'SIGOV: ese documento ya está conforme; no se le agregan páginas';
  end if;

  insert into public.documento_paginas
    (client_id, documento_id, service_id, storage_path, lat, lng, taken_at, sha256, width, height, size_bytes, created_by)
  values
    (p_client_id, v_doc.id, p_service_id, p_storage_path, p_lat, p_lng, coalesce(p_taken_at, now()),
     p_sha256, p_width, p_height, p_size_bytes, auth.uid());

  return json_build_object('documento_id', v_doc.id, 'estado', v_doc.estado);
end $$;

-- ─── Quitar una página mal tomada, mientras nadie la revisó ────────────
create or replace function public.quitar_pagina_documento(p_client_id uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_pag public.documento_paginas;
  v_doc public.documentos_del_dia;
begin
  select * into v_pag from public.documento_paginas where client_id = p_client_id and deleted_at is null;
  if not found then return json_build_object('ok', true); end if;
  select * into v_doc from public.documentos_del_dia where id = v_pag.documento_id;
  if not (public.puede_revisar_ssoma(v_doc.service_id)
          or (v_pag.created_by = auth.uid() and public.can_write(v_doc.service_id))) then
    raise exception 'SIGOV: no puedes quitar esa página' using errcode = '42501';
  end if;
  if v_doc.estado = 'conforme' then
    raise exception 'SIGOV: el documento ya está conforme';
  end if;
  update public.documento_paginas set deleted_at = now() where id = v_pag.id;
  return json_build_object('ok', true);
end $$;

-- ─── La revisión SSOMA ─────────────────────────────────────────────────
create or replace function public.revisar_documento(p_documento_id uuid, p_conforme boolean, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_doc   public.documentos_del_dia;
  v_lider uuid;
  v_nombre text;
begin
  select * into v_doc from public.documentos_del_dia where id = p_documento_id and deleted_at is null;
  if not found then raise exception 'SIGOV: ese documento ya no existe'; end if;
  if not public.puede_revisar_ssoma(v_doc.service_id) then
    raise exception 'SIGOV: solo el Ing. SSOMA o el supervisor revisan documentos' using errcode = '42501';
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;

  update public.documentos_del_dia
     set estado = case when p_conforme then 'conforme'::public.revision_ssoma else 'observado'::public.revision_ssoma end,
         observacion = case when p_conforme then observacion else trim(p_nota) end,
         revisado_por = auth.uid(),
         revisado_en = now(),
         updated_at = now()
   where id = p_documento_id;

  if not p_conforme then
    select c.leader_id into v_lider from public.crews c where c.id = v_doc.crew_id;
    v_nombre := case v_doc.tipo
      when 'ats' then 'ATS'
      when 'charla' then 'Charla de 5 minutos'
      when 'checklist_vehicular' then 'Checklist vehicular'
      when 'higiene' then 'Higiene'
      when 'inspeccion_equipos' then 'Inspección de equipos'
      else coalesce(v_doc.titulo, 'Documento') end;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v_doc.service_id, v_lider, 'ssoma_observado',
              format('%s del %s observado', v_nombre, to_char(v_doc.doc_date, 'DD/MM/YYYY')),
              trim(p_nota), '/ssoma', 'warning',
              jsonb_build_object('documento_id', v_doc.id));
    end if;
  end if;

  return json_build_object('estado', case when p_conforme then 'conforme' else 'observado' end);
end $$;

-- ─── El tablero: cuadrilla × día × documento ───────────────────────────
create or replace function public.ssoma_tablero(
  p_service_id uuid,
  p_desde date,
  p_hasta date,
  p_crew_id uuid default null
) returns table (
  crew_id uuid, crew_code text, crew_name text, crew_numero smallint,
  fecha date, tipo text, vehicle_id uuid, placa text, titulo text,
  documento_id uuid, estado text, paginas integer, observacion text, digital boolean
) language sql stable security definer set search_path to 'public' as $$
  with cuadrillas as (
    select c.id, c.code, c.name, c.numero
      from public.crews c
     where c.service_id = p_service_id and c.deleted_at is null and c.is_active
       and (p_crew_id is null or c.id = p_crew_id)
       and public.is_member(p_service_id)
  ),
  dias as (select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha),
  esperados as (
    select c.id as crew_id, x.tipo, null::uuid as vehicle_id, null::text as placa
      from cuadrillas c cross join (values ('ats'), ('charla'), ('higiene')) x(tipo)
    union all
    select v.crew_id, 'checklist_vehicular', v.id, v.plate
      from public.vehicles v join cuadrillas c on c.id = v.crew_id
     where v.deleted_at is null and coalesce(v.status::text, 'operativo') <> 'dado_de_baja'
  ),
  base as (
    select c.id as crew_id, c.code, c.name, c.numero, d.fecha, e.tipo, e.vehicle_id, e.placa,
           doc.id as documento_id, doc.estado::text as estado_doc, doc.observacion,
           case e.tipo
             when 'ats' then exists (select 1 from public.ats_iperc a
                                      where a.crew_id = c.id and a.doc_date = d.fecha and a.deleted_at is null)
             when 'charla' then exists (select 1 from public.safety_talks t
                                         where t.crew_id = c.id and t.talk_date = d.fecha and t.deleted_at is null)
             when 'higiene' then exists (select 1 from public.hygiene_checks h
                                          where h.crew_id = c.id and h.checked_on = d.fecha and h.deleted_at is null)
             when 'checklist_vehicular' then exists (select 1 from public.vehicle_checks k
                                          where k.vehicle_id = e.vehicle_id and k.checked_on = d.fecha and k.deleted_at is null)
             else false
           end as digital
      from cuadrillas c
      join esperados e on e.crew_id = c.id
      cross join dias d
      left join public.documentos_del_dia doc
        on doc.crew_id = c.id and doc.doc_date = d.fecha and doc.tipo::text = e.tipo
       and doc.vehicle_id is not distinct from e.vehicle_id and doc.titulo is null and doc.deleted_at is null
  )
  select b.crew_id, b.code, b.name, b.numero, b.fecha, b.tipo, b.vehicle_id, b.placa, null::text,
         b.documento_id,
         coalesce(b.estado_doc, case when b.digital then 'cargado' else 'pendiente' end),
         coalesce((select count(*)::int from public.documento_paginas p
                    where p.documento_id = b.documento_id and p.deleted_at is null), 0),
         b.observacion, b.digital
    from base b
  union all
  -- Lo que no es diario fijo: inspecciones y otros formatos que se suban
  select c.id, c.code, c.name, c.numero, doc.doc_date, doc.tipo::text, doc.vehicle_id, v.plate, doc.titulo,
         doc.id, doc.estado::text,
         (select count(*)::int from public.documento_paginas p where p.documento_id = doc.id and p.deleted_at is null),
         doc.observacion, false
    from public.documentos_del_dia doc
    join cuadrillas c on c.id = doc.crew_id
    left join public.vehicles v on v.id = doc.vehicle_id
   where doc.deleted_at is null and doc.doc_date between p_desde and p_hasta
     and doc.tipo in ('inspeccion_equipos', 'otro')
  union all
  -- El reporte diario, que sí es digital: su estado es el del parte
  select c.id, c.code, c.name, c.numero, d.fecha, 'reporte_diario', null, null, null,
         wo.id, coalesce(wo.status::text, 'pendiente'),
         0, wo.review_notes, wo.id is not null
    from cuadrillas c cross join dias d
    left join public.work_orders wo on wo.crew_id = c.id and wo.work_date = d.fecha and wo.deleted_at is null
$$;

-- El de un día y una cuadrilla, para la app
create or replace function public.documentos_del_dia_de(p_service_id uuid, p_crew_id uuid, p_fecha date)
returns setof json language sql stable security definer set search_path to 'public' as $$
  select row_to_json(t) from public.ssoma_tablero(p_service_id, p_fecha, p_fecha, p_crew_id) t
$$;

grant execute on function
  public.cargar_pagina_documento(uuid, uuid, uuid, date, text, text, uuid, text, double precision, double precision, timestamptz, text, integer, integer, bigint),
  public.quitar_pagina_documento(uuid),
  public.revisar_documento(uuid, boolean, text),
  public.ssoma_tablero(uuid, date, date, uuid),
  public.documentos_del_dia_de(uuid, uuid, date),
  public.puede_revisar_ssoma(uuid)
to authenticated;
revoke execute on function
  public.cargar_pagina_documento(uuid, uuid, uuid, date, text, text, uuid, text, double precision, double precision, timestamptz, text, integer, integer, bigint),
  public.quitar_pagina_documento(uuid),
  public.revisar_documento(uuid, boolean, text),
  public.ssoma_tablero(uuid, date, date, uuid),
  public.documentos_del_dia_de(uuid, uuid, date)
from anon;

notify pgrst, 'reload schema';

-- Las fotos de los formatos se guardan como las de obra (WebP): el bucket
-- de documentos solo admitía PDF, Office, JPG y PNG.
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['image/webp']))
 where id = 'documentos' and not ('image/webp' = any(allowed_mime_types));
