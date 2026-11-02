-- ═══════════════════════════════════════════════════════════════════════
-- 0119 · REV3-OBS-45: extintores, botiquines y equipos SSOMA por foto del
--        formato, con la revisión del Ingeniero SSOMA
--
-- El jefe de cuadrilla ya no evalúa Conforme / No conforme (el formato
-- físico lo dice): fotografía el formato de inspección y la inspección queda
-- «Pendiente de revisión SSOMA». El Ingeniero SSOMA la revisa y dictamina:
-- Conforme, Observado, Vencido o Requiere corrección. El equipo toma su
-- estado de ese dictamen. Las alertas de vencimiento siguen saliendo de las
-- fechas del equipo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.safety_equipment_checks
  alter column conforme drop not null,
  add column if not exists revision_estado text not null default 'pendiente'
    check (revision_estado in ('pendiente', 'conforme', 'observado', 'vencido', 'requiere_correccion')),
  add column if not exists revisado_por uuid references public.profiles(id),
  add column if not exists revisado_at timestamptz,
  add column if not exists revision_nota text;

-- Lo de antes ya traía la evaluación del jefe
update public.safety_equipment_checks
   set revision_estado = case when conforme then 'conforme' else 'observado' end
 where revision_estado = 'pendiente' and conforme is not null;

-- Al inspeccionar solo se anota la fecha; el estado lo pone la revisión
create or replace function public.al_inspeccionar_equipo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.safety_equipment
     set last_check_on = greatest(coalesce(last_check_on, new.checked_on), new.checked_on),
         status = case when new.conforme is false then 'observado'::public.safety_equipment_status else status end,
         updated_at = now()
   where id = new.equipment_id;
  return new;
end $$;

create or replace function public.revisar_inspeccion_equipo(p_id uuid, p_estado text, p_nota text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  k public.safety_equipment_checks;
begin
  select * into k from public.safety_equipment_checks where id = p_id and deleted_at is null;
  if k.id is null then raise exception 'SIGOV: esa inspección ya no existe'; end if;
  if not (public.puede_revisar_ssoma(k.service_id) or public.can_manage(k.service_id)) then
    raise exception 'SIGOV: solo el Ingeniero SSOMA o el supervisor revisan las inspecciones' using errcode = '42501';
  end if;
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
  return json_build_object('estado', p_estado);
end $$;

grant execute on function public.revisar_inspeccion_equipo(uuid, text, text) to authenticated;

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
    ( SELECT count(*) AS count
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
            AND (k.revision_estado IN ('observado', 'vencido', 'requiere_correccion') OR k.revision_estado = 'pendiente' AND k.conforme IS FALSE)) AS observaciones_abiertas,
    ( SELECT k.revision_estado
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) AS ultima_revision_estado,
    ( SELECT k.checked_on
           FROM safety_equipment_checks k
          WHERE k.equipment_id = e.id AND k.deleted_at IS NULL
          ORDER BY k.checked_on DESC, k.created_at DESC
         LIMIT 1) AS ultima_inspeccion_on
   FROM safety_equipment e
     LEFT JOIN crews c ON c.id = e.crew_id
     LEFT JOIN profiles p ON p.id = e.holder_id
  WHERE e.deleted_at IS NULL AND e.status <> 'dado_de_baja'::safety_equipment_status;
