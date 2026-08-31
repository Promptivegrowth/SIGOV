-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0017 · Carga de geometría de tramos y apoyo a las altas pendientes
--
-- Cierra los huecos que la auditoría dejó abiertos:
--   · un tramo creado a mano salía sin línea en el mapa
--   · no había forma de dibujar el trazo desde la interfaz
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Trazo de un tramo desde coordenadas ─────────────────────────────────
-- Recibe [[lng,lat],[lng,lat],…] tal como salen de un KML, un KMZ o un GeoJSON
-- y lo guarda como LineString. Valida que quien llama pueda administrar el
-- servicio dueño del tramo.
create or replace function public.set_section_geometry(
  p_section_id uuid,
  p_coords jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_service uuid;
  v_n       int;
  v_wkt     text;
  v_len_m   numeric;
begin
  select service_id into v_service
    from public.road_sections where id = p_section_id and deleted_at is null;

  if v_service is null then
    raise exception 'SIGOV: el tramo no existe';
  end if;

  if not public.can_manage(v_service) then
    raise exception 'SIGOV: sin permisos para editar tramos de este servicio';
  end if;

  v_n := jsonb_array_length(coalesce(p_coords, '[]'::jsonb));
  if v_n < 2 then
    raise exception 'SIGOV: el trazo necesita al menos 2 puntos (se recibieron %)', v_n;
  end if;

  -- Se arma el WKT validando que cada par sea numérico y esté en rango
  select 'LINESTRING(' || string_agg(
           round((pt->>0)::numeric, 6) || ' ' || round((pt->>1)::numeric, 6),
           ',' order by ord
         ) || ')'
    into v_wkt
    from jsonb_array_elements(p_coords) with ordinality as t(pt, ord)
   where (pt->>0)::numeric between -180 and 180
     and (pt->>1)::numeric between -90 and 90;

  if v_wkt is null then
    raise exception 'SIGOV: ninguna coordenada válida en el archivo';
  end if;

  update public.road_sections
     set geom = extensions.ST_GeomFromText(v_wkt, 4326),
         updated_at = now()
   where id = p_section_id;

  select extensions.ST_Length(geom::extensions.geography)
    into v_len_m
    from public.road_sections where id = p_section_id;

  return jsonb_build_object(
    'ok', true,
    'puntos', v_n,
    'longitud_m', round(coalesce(v_len_m, 0)),
    'longitud_km', round(coalesce(v_len_m, 0) / 1000.0, 2)
  );
end $$;

grant execute on function public.set_section_geometry(uuid, jsonb) to authenticated;

-- ─── Quitar el trazo ─────────────────────────────────────────────────────
create or replace function public.clear_section_geometry(p_section_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_service uuid;
begin
  select service_id into v_service from public.road_sections where id = p_section_id;
  if v_service is null then raise exception 'SIGOV: el tramo no existe'; end if;
  if not public.can_manage(v_service) then
    raise exception 'SIGOV: sin permisos';
  end if;
  update public.road_sections set geom = null, updated_at = now() where id = p_section_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.clear_section_geometry(uuid) to authenticated;

-- ─── Alta de servicio con su membresía en un solo paso ───────────────────
-- Crear un contrato y no quedar dentro de él es un error fácil de cometer:
-- esta función deja al creador como miembro administrador del servicio nuevo.
create or replace function public.create_service(
  p_code text,
  p_name text,
  p_client_name text default null,
  p_contract_code text default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_color text default '#1D4ED8',
  p_modules jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'SIGOV: solo un administrador puede crear servicios';
  end if;

  select org_id into v_org from public.profiles where id = auth.uid();
  if v_org is null then
    select id into v_org from public.organizations order by created_at limit 1;
  end if;
  if v_org is null then
    raise exception 'SIGOV: no hay una organización configurada';
  end if;

  insert into public.services (
    org_id, code, name, client_name, contract_code,
    starts_on, ends_on, color, modules, status, created_by
  ) values (
    v_org, upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_client_name,'')), ''),
    nullif(trim(coalesce(p_contract_code,'')), ''),
    p_starts_on, p_ends_on, coalesce(p_color, '#1D4ED8'),
    coalesce(p_modules, '{
      "programacion": true, "campo": true, "pci": true, "ssoma": true,
      "inventario": true, "reportes": true, "mapa": true
    }'::jsonb),
    'activo', auth.uid()
  )
  returning id into v_id;

  -- El creador entra como administrador de su propio contrato
  insert into public.service_members (service_id, profile_id, role)
  values (v_id, auth.uid(), 'admin')
  on conflict (service_id, profile_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', upper(trim(p_code)));
exception when unique_violation then
  raise exception 'SIGOV: ya existe un servicio con el código %', upper(trim(p_code));
end $$;

grant execute on function public.create_service(text, text, text, text, date, date, text, jsonb) to authenticated;

-- ─── Correlativo sugerido para el código de un elemento del inventario ───
-- Evita que el usuario tenga que inventar códigos únicos a mano.
create or replace function public.next_asset_code(
  p_service_id uuid,
  p_section_id uuid,
  p_type_id uuid
) returns text
language sql stable security invoker set search_path = public
as $$
  select coalesce(s.code, 'GEN') || '-' || coalesce(t.code, 'ELE') || '-' ||
         lpad((
           coalesce((
             select max(substring(a.code from '[0-9]+$')::int)
               from public.road_assets a
              where a.service_id = p_service_id
                and a.type_id = p_type_id
                and (p_section_id is null or a.section_id = p_section_id)
                and a.code ~ '[0-9]+$'
           ), 0) + 1
         )::text, 3, '0')
    from public.asset_types t
    left join public.road_sections s on s.id = p_section_id
   where t.id = p_type_id
$$;

grant execute on function public.next_asset_code(uuid, uuid, uuid) to authenticated;

-- ─── Índice que faltaba para el historial de intervenciones ──────────────
create index if not exists idx_ai_service_date
  on public.asset_interventions(service_id, intervened_on desc);
