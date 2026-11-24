-- ═══════════════════════════════════════════════════════════════════════════
-- 0156 · Exceso de metrado con motivo al enviar (revisión visual 18/11, J04)
-- Guardar un avance por encima de lo solicitado sigue permitido (alerta con
-- quién y cuándo); enviar el reporte exige el motivo de cada exceso, para
-- que la confirmación quede trazada también si el dato llega por la web o
-- la API, no solo desde la app.
-- ═══════════════════════════════════════════════════════════════════════════
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
