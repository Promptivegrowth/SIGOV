-- ═══════════════════════════════════════════════════════════════════════
-- 0060 · El mapa comprueba el permiso una vez, no en cada fila
--
-- Después de la 0059 el mapa del inventario volvió a cargar, pero en cuatro
-- segundos, y la app de campo en dos y medio. La misma consulta sin
-- permisos de por medio tarda 665 ms.
--
-- La vista del inventario junta cinco tablas —elementos, tipos, tramos,
-- intervenciones, fotos y sus vínculos— y cada una aplica su política de
-- lectura a cada fila que recorre: miles de comprobaciones para responder
-- una sola pregunta, «¿esta persona pertenece a este contrato?».
--
-- Estas tres funciones leen siempre un contrato entero, el que se les pide.
-- Así que la pregunta se hace una vez, al entrar, y después se lee sin
-- filtro por fila. Concede exactamente lo mismo que antes: el inventario lo
-- ve cualquier miembro del contrato —las políticas de estas tablas nunca
-- distinguieron por cuadrilla ni por rol— y el administrador de
-- plataforma. Quien no es miembro recibe lo mismo que recibía: nada.
--
-- La condición no depende de la fila, así que el planificador la evalúa
-- una sola vez. Dentro de una función security definer, auth.uid() sigue
-- siendo quien llama: lo lee de la sesión, no del rol.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.puede_leer_servicio(p_service_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select p_service_id in (select public.mis_servicios()) or public.is_platform_admin()
$$;

comment on function public.puede_leer_servicio is
  'Si quien consulta pertenece al contrato. Es la misma regla que las '
  'políticas de lectura del inventario, para las funciones que leen un '
  'contrato entero y la comprueban una vez al entrar.';

revoke execute on function public.puede_leer_servicio(uuid) from public, anon;
grant execute on function public.puede_leer_servicio(uuid) to authenticated;

-- ─── El mapa de la web ─────────────────────────────────────────────────

create or replace function public.assets_geojson(
  p_service_id uuid,
  p_type_codes text[] default null,
  p_conditions text[] default null,
  p_semaforos text[] default null,
  p_section_id uuid default null
) returns jsonb
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(v.lng, v.lat)),
        'properties', jsonb_build_object(
          'id', v.id, 'code', v.code, 'name', v.name,
          'type_code', v.type_code, 'type_name', v.type_name,
          'category', v.type_category,
          'color', v.type_color, 'icon', v.type_icon,
          'condition', v.condition,
          'section', v.section_name,
          'section_id', v.section_id,
          'progresiva', v.progresiva_txt,
          'progresiva_m', v.progresiva_m,
          'side', v.side,
          'semaforo', v.semaforo,
          'dias', v.dias_sin_intervenir,
          'ultima_intervencion', v.ultima_intervencion,
          'fotos', v.fotos,
          'visitas', v.visitas,
          'intervenciones', v.intervenciones
        )
      )
    ), '[]'::jsonb)
  )
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
    and (p_type_codes is null or v.type_code = any(p_type_codes))
    and (p_conditions is null or v.condition::text = any(p_conditions))
    and (p_semaforos is null or v.semaforo::text = any(p_semaforos))
    and (p_section_id is null or v.section_id = p_section_id)
$$;

-- ─── La app de campo ───────────────────────────────────────────────────

create or replace function public.inventario_para_campo(p_service_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'code', v.code,
    'name', v.name,
    'type_code', v.type_code,
    'type_name', v.type_name,
    'type_category', v.type_category,
    'type_color', v.type_color,
    'section_id', v.section_id,
    'section_name', v.section_name,
    'progresiva_m', v.progresiva_m,
    'progresiva_txt', v.progresiva_txt,
    'side', v.side,
    'lat', v.lat,
    'lng', v.lng,
    'condition', v.condition,
    'semaforo', v.semaforo,
    'dias_sin_intervenir', v.dias_sin_intervenir,
    'ultima_intervencion', v.ultima_intervencion,
    'intervenciones', v.intervenciones,
    'visitas', v.visitas,
    'fotos', v.fotos,
    'foto_actual', v.foto_actual,
    'foto_actual_fecha', v.foto_actual_fecha,
    'foto_anterior', v.foto_anterior,
    'foto_anterior_fecha', v.foto_anterior_fecha,
    'dias_entre_fotos', v.dias_entre_fotos
  ) order by v.progresiva_m), '[]'::jsonb)
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
$$;

-- ─── Los recuentos de los filtros ──────────────────────────────────────

create or replace function public.inventario_resumen(p_service_id uuid, p_section_id uuid default null)
returns table(type_code text, type_name text, category text, color text, icon text,
              total bigint, al_dia bigint, por_vencer bigint, critico bigint, sin_intervenir bigint)
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select
    v.type_code, v.type_name, v.type_category, v.type_color, v.type_icon,
    count(*),
    count(*) filter (where v.semaforo = 'al_dia'),
    count(*) filter (where v.semaforo = 'por_vencer'),
    count(*) filter (where v.semaforo = 'critico'),
    count(*) filter (where v.semaforo = 'sin_intervenir')
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and (p_section_id is null or v.section_id = p_section_id)
  group by v.type_code, v.type_name, v.type_category, v.type_color, v.type_icon
  order by v.type_category, v.type_name
$$;

-- Solo usuarios con sesión: sin ella no hay contrato del que ser miembro.
revoke execute on function public.assets_geojson(uuid, text[], text[], text[], uuid) from public, anon;
revoke execute on function public.inventario_para_campo(uuid) from public, anon;
revoke execute on function public.inventario_resumen(uuid, uuid) from public, anon;
grant execute on function public.assets_geojson(uuid, text[], text[], text[], uuid) to authenticated;
grant execute on function public.inventario_para_campo(uuid) to authenticated;
grant execute on function public.inventario_resumen(uuid, uuid) to authenticated;
