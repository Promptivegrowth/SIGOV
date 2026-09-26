-- ═══════════════════════════════════════════════════════════════════════
-- 0062 · El inventario del celular no carga nulos
--
-- Con el Inventario Vial 2024 cargado, lo que baja la app de campo pasó de
-- 2,700 elementos a 7,700: 7.4 MB de JSON. La mayoría de los elementos no
-- tiene todavía intervenciones, foto anterior ni progresiva final, y cada
-- uno de esos vacíos viajaba escrito —«"foto_anterior":null»—. Se quitan:
-- la app da por vacío lo que no llega.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.inventario_para_campo(p_service_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
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
    'progresiva_fin_m', v.progresiva_fin_m,
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
    'dias_entre_fotos', v.dias_entre_fotos,
    'atributos', coalesce(v.attributes, '{}'::jsonb)
                   - 'coordenada_excel' - 'coordenada_final' - 'inventario'
  )) order by v.progresiva_m), '[]'::jsonb)
  from public.v_inventario v
  where public.puede_leer_servicio(p_service_id)
    and v.service_id = p_service_id
    and v.lat is not null and v.lng is not null
$$;

revoke execute on function public.inventario_para_campo(uuid) from public, anon;
grant execute on function public.inventario_para_campo(uuid) to authenticated;
