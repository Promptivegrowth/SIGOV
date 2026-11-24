-- 0162 · Inicio PCI del Visor (V01): «Últimos registros publicados» con la descripción del ítem
CREATE OR REPLACE FUNCTION public.inicio_pci(p_service uuid, p_pci uuid DEFAULT NULL::uuid, p_corte date DEFAULT CURRENT_DATE, p_crew uuid DEFAULT NULL::uuid, p_sector text DEFAULT NULL::text, p_busqueda text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_estado text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visor boolean := public.es_visor(p_service);
  v_res json;
begin
  if not public.is_member(p_service) then
    raise exception 'SIGOV: sin acceso a este contrato' using errcode = '42501';
  end if;

  with base as (
    select i.*, p.code pci_code, coalesce(p.notified_on, p.received_on, p.created_at::date) pci_fecha,
           (select s.code from public.sector_de(i.section_id, i.prog_start_m) s) sector_code,
           a.name activity_name
      from public.pci_items i
      join public.pcis p on p.id = i.pci_id
      left join public.activities_catalog a on a.id = i.activity_id
     where i.service_id = p_service and i.deleted_at is null and p.deleted_at is null
       -- el mismo alcance que la tabla (supervisor: sus cuadrillas; jefe: la suya)
       and i.pci_id in (select public.pcis_visibles())
       and (i.assigned_crew_id is null or i.assigned_crew_id in (select public.cuadrillas_visibles()))
       -- supervisor y jefe: solo lo asignado a sus cuadrillas (no lo que aún no tiene cuadrilla)
       and (public.role_in(p_service) not in ('supervisor', 'jefe_cuadrilla')
            or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
       and (p_pci is null or i.pci_id = p_pci)
       and (p_crew is null or i.assigned_crew_id = p_crew)
       and (p_desde is null or coalesce(p.notified_on, p.received_on, p.created_at::date) >= p_desde)
  ), filtrado as (
    select b.* from base b
     where (p_sector is null or b.sector_code = p_sector)
       and (p_busqueda is null or b.pci_code ilike '%' || p_busqueda || '%' or b.item_number::text = p_busqueda
            or b.description ilike '%' || p_busqueda || '%' or b.activity_name ilike '%' || p_busqueda || '%')
  ), fotos as (
    select f.id,
           count(e.id) filter (where e.phase = 'antes') antes,
           count(e.id) filter (where e.phase = 'durante') durante,
           count(e.id) filter (where e.phase = 'despues') despues
      from filtrado f
      left join public.evidences e on e.pci_item_id = f.id and e.deleted_at is null
                                  and (not v_visor or e.publicada_version is not null)
     group by f.id
  ), it0 as (
    select f.*,
           case when v_visor then f.publicacion_version > 0 and f.publicado_at::date <= p_corte
                else f.closed_at is not null and f.closed_at::date <= p_corte
                     and f.status not in ('pendiente', 'en_atencion') end atendido,
           (ph.antes > 0 and ph.durante > 0 and ph.despues > 0) completa,
           array_remove(array[case when ph.antes = 0 then 'antes' end, case when ph.durante = 0 then 'durante' end,
                              case when ph.despues = 0 then 'despues' end], null) faltan,
           (select count(*) from public.revision_observaciones o where o.pci_item_id = f.id and o.estado <> 'cerrada'
               and (not v_visor or o.origen = 'COVINCA' or f.publicacion_version > 0)) obs_abiertas
      from filtrado f join fotos ph on ph.id = f.id
  ), it as (
    -- Estado: atendidos, sin atención, observados, vencidos o con evidencia incompleta
    select * from it0
     where p_estado is null
        or (p_estado = 'atendido' and atendido) or (p_estado = 'sin_atencion' and not atendido)
        or (p_estado = 'observado' and (status = 'observado' or covinca_estado = 'observado' or obs_abiertas > 0))
        or (p_estado = 'vencido' and not atendido and due_date < p_corte)
        or (p_estado = 'evidencia_incompleta' and atendido and not completa)
  ), plazos as (
    select term_days plazo, min(due_date) vencimiento, count(*) total, count(*) filter (where atendido) atendidos
      from it group by term_days
  )
  select json_build_object(
    'visor', v_visor,
    'corte', p_corte,
    'total', (select count(*) from it),
    'atendidos', (select count(*) from it where atendido),
    'sin_atencion', (select count(*) from it where not atendido),
    'avance', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where atendido) / count(*), 1) end from it),
    'por_plazo', (select coalesce(json_agg(json_build_object(
                    'plazo', plazo, 'vencimiento', vencimiento, 'total', total, 'atendidos', atendidos,
                    'pendientes', total - atendidos,
                    'avance', case when total = 0 then null else round(100.0 * atendidos / total, 1) end) order by plazo), '[]'::json) from plazos),
    'evidencia', json_build_object(
       'completa', (select count(*) from it where atendido and completa),
       'incompleta', (select count(*) from it where atendido and not completa),
       'observaciones_abiertas', (select coalesce(sum(obs_abiertas), 0) from it),
       'conformes_covinca', (select count(*) from it where covinca_estado = 'conforme'),
       -- lo interno de SERVICON no se informa al Visor
       'por_validar', case when v_visor then null else (select count(*) from it where status in ('levantado', 'subsanado') and validado_servicon_at is null) end,
       'por_publicar', case when v_visor then null else (select count(*) from it where validado_servicon_at is not null and status in ('levantado', 'subsanado')
                          and (publicacion_version = 0 or publicacion_pendiente or covinca_estado = 'observado')) end,
       'por_revisar_covinca', (select count(*) from it where covinca_estado = 'por_revisar')),
    'incompletos', (select coalesce(json_agg(x), '[]'::json) from (
         select json_build_object('item_id', id, 'pci_id', pci_id, 'pci', pci_code, 'item', item_number, 'descripcion', description, 'faltan', faltan) x
           from it where atendido and not completa order by due_date, item_number limit 8) z),
    'ultimos_publicados', (select coalesce(json_agg(x), '[]'::json) from (
         select json_build_object('item_id', id, 'pci_id', pci_id, 'pci', pci_code, 'item', item_number, 'descripcion', description,
                                  'estado', case when covinca_estado = 'conforme' then 'Conforme'
                                                 when covinca_estado = 'observado' then 'Observado'
                                                 when not completa then 'Falta ' || public.fase_legible(faltan[1])
                                                 else 'Por revisar' end,
                                  'publicado_at', publicado_at) x
           from it where publicacion_version > 0 order by publicado_at desc nulls last limit 5) z),
    'plazos_por_completar', (select count(*) from plazos where total > atendidos),
    'vencidos', (select count(*) from it where not atendido and due_date < p_corte),
    'pcis', (select coalesce(json_agg(json_build_object('id', p.id, 'code', p.code) order by p.code desc), '[]'::json)
               from public.pcis p where p.service_id = p_service and p.deleted_at is null and p.id in (select distinct pci_id from base)),
    'sectores', (select coalesce(json_agg(distinct sector_code), '[]'::json) from base where sector_code is not null),
    'ultima_sincronizacion', (select max(s.finished_at) from public.sync_sessions s where s.service_id = p_service)
  ) into v_res;
  return v_res;
end $function$;

notify pgrst, 'reload schema';
