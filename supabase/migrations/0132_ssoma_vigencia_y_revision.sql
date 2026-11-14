-- ═══════════════════════════════════════════════════════════════════════════
-- 0132 · Equipos SSOMA: vigencia y revisión por separado (4.º entregable,
-- OBS 14 y 15, CASO 23)
--
-- La vigencia (vigente / vencido) sale de la fecha de vencimiento; la
-- revisión SSOMA (pendiente / conforme / observado) del dictamen. Las
-- observaciones abiertas cuentan solo después de la última conformidad, y se
-- distingue la observación anterior pendiente de la nueva inspección
-- enviada. Al observar, el jefe de la cuadrilla recibe el aviso.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_safety_equipment with (security_invoker = true) as
 SELECT e.id,
    e.service_id,
    e.kind,
    e.status,
    e.code,
    e.description,
    e.brand,
    e.capacity,
    e.serial_number,
    e.crew_id,
    c.name AS crew_name,
    e.location,
    e.holder_id,
    p.full_name AS holder_name,
    e.expires_on,
    e.next_check_on,
    e.last_check_on,
    e.notes,
    e.expires_on - CURRENT_DATE AS days_left,
    vencimiento_semaforo(e.expires_on) AS semaforo,
    vencimiento_aviso(e.expires_on) AS alert_level,
    e.next_check_on - CURRENT_DATE AS check_days_left,
    vencimiento_semaforo(e.next_check_on) AS check_semaforo,
    -- Las observaciones abiertas: solo las posteriores a la última conformidad (OBS 15)
    ( SELECT count(*) AS count
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
            AND k.revision_estado = ANY (ARRAY['observado'::text, 'vencido'::text, 'requiere_correccion'::text])
            AND (lc.id IS NULL OR (k.checked_on, k.created_at) > (lc.checked_on, lc.created_at))) AS observaciones_abiertas,
    ( SELECT k.revision_estado
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) AS ultima_revision_estado,
    ( SELECT k.checked_on
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) AS ultima_inspeccion_on,
    -- La vigencia, aparte del dictamen (OBS 14): un equipo puede estar
    -- vencido y tener su última revisión SSOMA conforme
    CASE WHEN e.expires_on IS NULL THEN 'sin_fecha'
         WHEN e.expires_on < CURRENT_DATE THEN 'vencido'
         ELSE 'vigente' END AS vigencia,
    lc.checked_on AS ultima_conforme_on,
    lc.revisado_at AS ultima_conforme_at,
    -- Observación anterior pendiente de levantamiento y nueva inspección
    -- enviada a SSOMA, cada una por su lado (OBS 15)
    ob.revision_nota AS observacion_pendiente_nota,
    ob.checked_on AS observacion_pendiente_on,
    ob.revisado_at AS observacion_pendiente_at,
    np.checked_on AS inspeccion_pendiente_on,
    np.created_at AS inspeccion_pendiente_at
   FROM safety_equipment e
     LEFT JOIN crews c ON c.id = e.crew_id
     LEFT JOIN profiles p ON p.id = e.holder_id
     LEFT JOIN LATERAL ( SELECT k.id, k.checked_on, k.created_at, k.revisado_at
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL AND k.revision_estado = 'conforme'
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) lc ON true
     LEFT JOIN LATERAL ( SELECT k.revision_nota, k.checked_on, k.created_at, k.revisado_at
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
            AND k.revision_estado = ANY (ARRAY['observado'::text, 'vencido'::text, 'requiere_correccion'::text])
            AND (lc.id IS NULL OR (k.checked_on, k.created_at) > (lc.checked_on, lc.created_at))
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) ob ON true
     LEFT JOIN LATERAL ( SELECT k.checked_on, k.created_at
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL AND k.revision_estado = 'pendiente'
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) np ON true
  WHERE e.deleted_at IS NULL AND e.status <> 'dado_de_baja'::safety_equipment_status;

create or replace function public.revisar_inspeccion_equipo(p_id uuid, p_estado text, p_nota text default null)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  k public.safety_equipment_checks;
  q public.safety_equipment;
  v_lider uuid;
begin
  select * into k from public.safety_equipment_checks where id = p_id and deleted_at is null;
  if k.id is null then raise exception 'SIGOV: esa inspección ya no existe'; end if;
  if not public.puede_revisar_ssoma(k.service_id) then
    raise exception 'SIGOV: solo el Ingeniero SSOMA revisa las inspecciones' using errcode = '42501';
  end if;
  -- El dictamen es la revisión; la vigencia sale de la fecha (OBS 14)
  if p_estado not in ('conforme', 'observado', 'vencido', 'requiere_correccion') then
    raise exception 'SIGOV: dictamen no válido';
  end if;
  if p_estado <> 'conforme' and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: di qué se observó, para que la cuadrilla lo corrija';
  end if;

  update public.safety_equipment_checks
     set revision_estado = p_estado, revisado_por = auth.uid(), revisado_at = now(),
         revision_nota = nullif(trim(p_nota), ''), conforme = (p_estado = 'conforme')
   where id = p_id;
  update public.safety_equipment
     set status = case when p_estado = 'conforme' then 'operativo'::public.safety_equipment_status
                       else 'observado'::public.safety_equipment_status end,
         updated_at = now()
   where id = k.equipment_id and status in ('operativo', 'observado');

  select * into q from public.safety_equipment where id = k.equipment_id;
  select c.leader_id into v_lider from public.crews c where c.id = q.crew_id;
  if p_estado = 'conforme' then
    -- La observación anterior quedó levantada
    update public.notifications set read_at = coalesce(read_at, now())
     where type = 'equipo_observado' and (data->>'equipment_id')::uuid = k.equipment_id;
  elsif v_lider is not null then
    -- Al jefe de la cuadrilla, para que la levante (OBS 15)
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    values (k.service_id, v_lider, 'equipo_observado',
            format('SSOMA observó %s', coalesce(nullif(q.code, ''), q.description, 'un equipo')),
            trim(p_nota), '/ssoma', 'warning',
            jsonb_build_object('equipment_id', k.equipment_id, 'check_id', k.id));
  end if;
  return json_build_object('estado', p_estado);
end $function$;
