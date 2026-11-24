-- ═══════════════════════════════════════════════════════════════════════════
-- 0158 · Adjuntos requeridos al enviar el reporte (guía de roles · Jefe F4)
-- «Completar ATS, charla, checklist y los formatos aplicables con al menos un
-- adjunto por formato requerido» (confirmado por Elvis el 24/11/2026).
-- Requeridos del día de la cuadrilla: ATS, charla y el checklist vehicular de
-- cada vehículo asignado ese día (los mismos que pide ssoma_tablero). Cuenta
-- solo una página cargada (foto o PDF del formato; el bucket no admite vídeo).
-- Higiene es digital y no pide adjunto. El reporte diario no se fotografía.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.parte_sin_adjuntos(p_work_order uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  with wo as (select id, crew_id, work_date from public.work_orders where id = p_work_order),
  esperados as (
    select x.tipo, null::uuid as vehicle_id, null::text as placa, x.orden
      from (values ('ats', 1), ('charla', 2)) x(tipo, orden)
    union all
    select 'checklist_vehicular', v.id, v.plate, 3
      from wo join public.crew_vehicle_assignments a on a.crew_id = wo.crew_id
      join public.vehicles v on v.id = a.vehicle_id
     where wo.work_date >= a.start_on and (a.end_on is null or wo.work_date < a.end_on)
  )
  select coalesce(array_agg(case e.tipo when 'ats' then 'ATS' when 'charla' then 'charla'
                                else 'checklist vehicular ' || coalesce(e.placa, '') end
                            order by e.orden, e.placa), '{}')
    from esperados e cross join wo
   where not exists (
     select 1 from public.documentos_del_dia d
       join public.documento_paginas p on p.documento_id = d.id and p.deleted_at is null
      where d.crew_id = wo.crew_id and d.doc_date = wo.work_date and d.tipo::text = e.tipo
        and d.vehicle_id is not distinct from e.vehicle_id and d.deleted_at is null)
$$;
revoke execute on function public.parte_sin_adjuntos(uuid) from anon;
grant execute on function public.parte_sin_adjuntos(uuid) to authenticated;

create or replace function public.enviar_parte(p_id uuid, p_crew_id uuid default null, p_fecha date default null)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v public.work_orders;
  v_sup uuid;
  v_cuadrilla text;
  v_faltan text[];
begin
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status = 'enviado' then return json_build_object('estado', 'enviado'); end if;
  if v.status = 'validado' then raise exception 'SIGOV: el parte ya está validado'; end if;
  if not exists (select 1 from public.work_entries e where e.work_order_id = v.id and e.deleted_at is null) then
    raise exception 'SIGOV: registra al menos una actividad antes de enviar el reporte';
  end if;
  -- CASO 15: con fotos pero sin metrado, el reporte sigue incompleto
  v_faltan := public.parte_sin_metrado(v.id);
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: reporte incompleto: % sin metrado (%). Registra el metrado antes de enviarlo',
      case when cardinality(v_faltan) = 1 then '1 actividad' else cardinality(v_faltan) || ' actividades' end,
      array_to_string(v_faltan, ', ');
  end if;

  -- J04: un exceso de metrado se guarda (alerta, no bloqueo), pero el envío exige su motivo
  select array_agg(coalesce(a.name, 'actividad') order by a.name) into v_faltan
    from public.work_entries e left join public.activities_catalog a on a.id = e.activity_id
   where e.work_order_id = v.id and e.deleted_at is null and e.exceso is not null and nullif(trim(e.exceso_motivo), '') is null;
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: hay metrado por encima de lo solicitado sin motivo (%). Confirma el exceso con su motivo antes de enviar',
      array_to_string(v_faltan, ', ');
  end if;

  -- Jefe F4: cada formato requerido del día lleva al menos un adjunto
  v_faltan := public.parte_sin_adjuntos(v.id);
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: falta el adjunto de: %. Carga la foto del formato en Seguridad › Documentos del día antes de enviar el reporte',
      array_to_string(v_faltan, ', ');
  end if;

  update public.work_orders set status = 'enviado', submitted_at = now(), updated_at = now() where id = v.id;

  -- El supervisor de la cuadrilla se entera; si no tiene, los supervisores del contrato
  select c.supervisor_id, c.name into v_sup, v_cuadrilla from public.crews c where c.id = v.crew_id;
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v.service_id, p, 'parte_enviado',
         format('Reporte diario %s · %s', to_char(v.work_date, 'DD/MM/YYYY'), coalesce(v_cuadrilla, '')),
         'Listo para validar', '/campo/' || v.id, 'info', jsonb_build_object('work_order_id', v.id)
    from (select v_sup as p where v_sup is not null
          union
          select m.profile_id from public.service_members m
           where v_sup is null and m.service_id = v.service_id and m.role = 'supervisor') x;

  return json_build_object('estado', 'enviado');
end $function$;

notify pgrst, 'reload schema';
