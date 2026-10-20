-- ═══════════════════════════════════════════════════════════════════════
-- 0095 · Residente, depósitos del administrador y revisión de fotos
--
-- Respuestas de Elvis al cuestionario (13/10/2026):
-- · P17: el residente coordina a los supervisores. Hace lo mismo que el
--   supervisor, pero sobre todas las cuadrillas (mis_cuadrillas ya deja sin
--   acotar a quien no es supervisor ni jefe). El visor COVINCA no da
--   conformidad de caja, pero sí de ítems, PCI y fotos.
-- · P47: los depósitos los piden el jefe de cuadrilla y el supervisor; los
--   recibe y atiende solo el administrador, emitiendo el comprobante del
--   depósito.
-- · P48: no hay monto mínimo para el comprobante: si lo hay, se adjunta.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. El residente donde hoy está el supervisor ─────────────────────
do $$
declare
  f record;
  antes text;
  despues text;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('can_manage', 'can_write', 'puede_revisar_ssoma', 'alta_vehiculo_temporal',
                         'evaluate_pci_deadlines', 'partida_impedimento', 'pci_levantar')
  loop
    antes := pg_get_functiondef(f.oid);
    despues := regexp_replace(antes, '''admin'',\s*''supervisor''', '''admin'', ''supervisor'', ''residente''', 'g');
    if despues = antes then
      raise exception 'SIGOV 0095: % no menciona al supervisor', f.proname;
    end if;
    execute despues;
  end loop;
end $$;

-- ─── 2. P48: sin monto mínimo para el comprobante ────────────────────
do $$
declare
  antes text := pg_get_functiondef('public.ajustes_del_servicio(uuid)'::regprocedure);
  despues text;
begin
  despues := regexp_replace(antes, 'jsonb_build_object\(\s*''monto_minimo_comprobante'',\s*20\s*\)', '''{}''::jsonb');
  if despues = antes then
    raise exception 'SIGOV 0095: ajustes_del_servicio ya no tiene el monto mínimo';
  end if;
  execute despues;
end $$;

-- ─── 3. P47: el depósito lo atiende el administrador, con comprobante ─
alter table public.deposit_requests add column if not exists voucher_path text;
comment on column public.deposit_requests.voucher_path is
  'Foto o PDF del comprobante del depósito (bucket documentos), que adjunta el administrador al atenderlo';

create or replace function public.t_deposit_request_reglas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
begin
  if v_uid is null then
    return new;   -- tareas del sistema
  end if;
  v_admin := public.role_in(coalesce(old.service_id, new.service_id)) = 'admin';

  if tg_op = 'INSERT' then
    -- La piden el jefe de cuadrilla o el supervisor: entra como solicitud
    if not v_admin then
      new.status := 'solicitado';
      new.approved_amount := null;
      new.resolved_by := null;
      new.resolved_at := null;
      new.resolution_note := null;
      new.bank_reference := null;
      new.movement_id := null;
      new.voucher_path := null;
      new.created_by := v_uid;
    end if;
    return new;
  end if;

  -- Solo el administrador la responde (Elvis, P47)
  if v_admin then
    if new.status is distinct from old.status then
      if new.status in ('observado', 'rechazado') and coalesce(trim(new.resolution_note), '') = '' then
        raise exception 'SIGOV: escribe el motivo; quien pidió el depósito necesita saber qué corregir';
      end if;
      if new.status <> 'solicitado' then
        new.resolved_by := v_uid;
        new.resolved_at := now();
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- Quien la pidió: lo de administración se queda como estaba
  new.service_id      := old.service_id;
  new.cash_box_id     := old.cash_box_id;
  new.client_id       := old.client_id;
  new.created_by      := old.created_by;
  new.created_at      := old.created_at;
  new.deleted_at      := old.deleted_at;
  new.status          := old.status;
  new.approved_amount := old.approved_amount;
  new.resolved_by     := old.resolved_by;
  new.resolved_at     := old.resolved_at;
  new.resolution_note := old.resolution_note;
  new.bank_reference  := old.bank_reference;
  new.movement_id     := old.movement_id;
  new.voucher_path    := old.voucher_path;

  if (new.amount, new.reason, new.needed_by, new.priority)
     is distinct from (old.amount, old.reason, old.needed_by, old.priority) then
    if old.created_by is distinct from v_uid then
      raise exception 'SIGOV: solo quien pidió el depósito puede corregirlo' using errcode = '42501';
    end if;
    if old.status not in ('solicitado', 'observado') then
      raise exception 'SIGOV: administración ya respondió esta solicitud; no se puede corregir' using errcode = '42501';
    end if;
    if old.status = 'observado' then
      new.status := 'solicitado';   -- corregida, vuelve a la bandeja
      new.resolution_note := null;  -- la observación ya se atendió
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.t_deposit_request_avisos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caja text;
  v_monto text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  select coalesce(c.name, b.name, b.code) into v_caja
    from public.cash_boxes b left join public.crews c on c.id = b.crew_id
   where b.id = new.cash_box_id;
  v_monto := 'S/ ' || to_char(coalesce(new.approved_amount, new.amount), 'FM999G999G990D00');

  -- La solicitud le llega al administrador, que es quien la atiende
  if new.status = 'solicitado' then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select new.service_id, m.profile_id, 'deposito_solicitado',
           case when new.priority = 'urgente' then '🔴 Depósito URGENTE · ' else 'Solicitud de depósito · ' end
             || coalesce(v_caja, 'caja') || ' · S/ ' || to_char(new.amount, 'FM999G999G990D00'),
           case when tg_op = 'UPDATE' then 'Corregida: ' else '' end || new.reason,
           '/caja', case when new.priority = 'urgente' then 'warning' else 'info' end,
           jsonb_build_object('deposit_request_id', new.id)
      from public.service_members m
     where m.service_id = new.service_id and m.role = 'admin'
       and m.profile_id is distinct from new.created_by;
    return null;
  end if;

  if new.created_by is null then
    return null;
  end if;

  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  values (
    new.service_id, new.created_by, 'deposito_' || new.status,
    case new.status
      when 'en_evaluacion' then 'Tu solicitud de depósito está en evaluación'
      when 'aprobado'      then 'Depósito aprobado · ' || v_monto
      when 'depositado'    then 'Depósito atendido · ' || v_monto
      when 'observado'     then 'Solicitud de depósito observada'
      when 'rechazado'     then 'Solicitud de depósito rechazada'
      else 'Solicitud de depósito: ' || new.status
    end,
    coalesce(new.resolution_note,
             case when new.status = 'depositado' then
               'Con su comprobante' || coalesce(' · operación ' || new.bank_reference, '') end,
             new.reason),
    '/caja',
    case new.status when 'rechazado' then 'danger' when 'observado' then 'warning'
                    when 'depositado' then 'success' else 'info' end,
    jsonb_build_object('deposit_request_id', new.id)
  );
  return null;
end $$;

-- Atender: el dinero entra a la caja con el comprobante del depósito. El
-- número de operación pasa a ser opcional: lo que pide Elvis es el comprobante.
drop function if exists public.atender_solicitud_deposito(uuid, numeric, text, text);

create or replace function public.atender_solicitud_deposito(
  p_id uuid,
  p_monto numeric,
  p_comprobante text,
  p_operacion text default null,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.deposit_requests;
  v_mov uuid;
begin
  select * into s from public.deposit_requests where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la solicitud no existe'; end if;
  if public.role_in(s.service_id) is distinct from 'admin' then
    raise exception 'SIGOV: solo el administrador atiende los depósitos' using errcode = '42501';
  end if;
  if s.status in ('depositado', 'rechazado') then
    raise exception 'SIGOV: esta solicitud ya está cerrada';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'SIGOV: escribe el monto depositado'; end if;
  if coalesce(trim(p_comprobante), '') = '' then
    raise exception 'SIGOV: adjunta el comprobante del depósito';
  end if;
  if split_part(p_comprobante, '/', 1) <> s.service_id::text then
    raise exception 'SIGOV: el comprobante no es de este contrato';
  end if;

  insert into public.cash_movements (
    service_id, cash_box_id, kind, status, amount, description,
    receipt_kind, receipt_number, storage_path, created_by, reviewed_by, reviewed_at
  ) values (
    s.service_id, s.cash_box_id, 'deposito', 'aprobado', p_monto,
    'Depósito a caja · ' || s.reason, 'recibo', nullif(trim(p_operacion), ''), p_comprobante,
    auth.uid(), auth.uid(), now()
  ) returning id into v_mov;

  update public.deposit_requests
     set status = 'depositado',
         approved_amount = p_monto,
         bank_reference = nullif(trim(p_operacion), ''),
         voucher_path = p_comprobante,
         resolution_note = coalesce(nullif(trim(p_nota), ''), resolution_note),
         movement_id = v_mov
   where id = p_id;

  return json_build_object('movement_id', v_mov);
end $$;

revoke execute on function public.atender_solicitud_deposito(uuid, numeric, text, text, text) from anon, public;
grant execute on function public.atender_solicitud_deposito(uuid, numeric, text, text, text) to authenticated;

-- ─── 4. P17: el visor COVINCA revisa las fotos ───────────────────────
alter table public.evidences
  add column if not exists revision text check (revision in ('conforme', 'observada')),
  add column if not exists revision_nota text,
  add column if not exists revisada_por uuid references public.profiles(id),
  add column if not exists revisada_at timestamptz;
comment on column public.evidences.revision is
  'Conformidad u observación de COVINCA (o del supervisor) sobre la foto; una observada no va en la entrega';

-- Quien sube la foto no puede traerla ya revisada
create or replace function public.t_ev_revision_al_crear()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    new.revision := null;
    new.revision_nota := null;
    new.revisada_por := null;
    new.revisada_at := null;
  end if;
  return new;
end $$;

drop trigger if exists t_ev_revision_al_crear on public.evidences;
create trigger t_ev_revision_al_crear before insert on public.evidences
  for each row execute function public.t_ev_revision_al_crear();

create or replace function public.revisar_foto(p_evidencia uuid, p_conforme boolean, p_nota text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.evidences;
  v_lider uuid;
  v_url text;
  v_que text;
begin
  select * into v from public.evidences where id = p_evidencia and deleted_at is null;
  if not found then raise exception 'SIGOV: esa foto ya no existe'; end if;
  if not (public.can_manage(v.service_id) or public.role_in(v.service_id) = 'visor') then
    raise exception 'SIGOV: solo COVINCA o el supervisor revisan las fotos' using errcode = '42501';
  end if;
  if not p_conforme and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: la cuadrilla necesita saber qué corregir';
  end if;

  update public.evidences
     set revision = case when p_conforme then 'conforme' else 'observada' end,
         revision_nota = nullif(trim(p_nota), ''),
         revisada_por = auth.uid(),
         revisada_at = now()
   where id = v.id;

  -- La cuadrilla se entera para tomarla de nuevo
  if not p_conforme then
    if v.work_entry_id is not null then
      select c.leader_id, '/campo/' || o.id, coalesce(a.name, 'actividad')
        into v_lider, v_url, v_que
        from public.work_entries we
        join public.work_orders o on o.id = we.work_order_id
        join public.crews c on c.id = o.crew_id
        left join public.activities_catalog a on a.id = we.activity_id
       where we.id = v.work_entry_id;
    elsif v.pci_item_id is not null then
      select c.leader_id, '/pci/' || i.pci_id, p.code || ' · ítem ' || i.item_number
        into v_lider, v_url, v_que
        from public.pci_items i
        join public.pcis p on p.id = i.pci_id
        left join public.crews c on c.id = i.assigned_crew_id
       where i.id = v.pci_item_id;
    end if;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v.service_id, v_lider, 'foto_observada', 'Foto observada · ' || v_que, trim(p_nota),
              v_url, 'warning', jsonb_build_object('evidence_id', v.id));
    end if;
  end if;

  return json_build_object('revision', case when p_conforme then 'conforme' else 'observada' end);
end $$;

revoke execute on function public.revisar_foto(uuid, boolean, text) from anon, public;
grant execute on function public.revisar_foto(uuid, boolean, text) to authenticated;

-- La vista de fotos lleva la revisión (la entrega COVINCA deja fuera las observadas)
create or replace view public.v_evidences with (security_invoker = true) as
SELECT e.id,
    e.client_id,
    e.service_id,
    e.phase,
    e.storage_path,
    e.thumb_path,
    e.mime_type,
    e.size_bytes,
    e.width,
    e.height,
    e.lat,
    e.lng,
    e.accuracy_m,
    e.taken_at,
    e.sha256,
    e.watermarked,
    e.caption,
    e.created_at,
    e.created_by,
    p.full_name AS created_by_name,
    e.work_entry_id,
    e.pci_item_id,
        CASE
            WHEN e.work_entry_id IS NOT NULL THEN 'parte'::text
            WHEN e.pci_item_id IS NOT NULL THEN 'pci'::text
            ELSE 'suelta'::text
        END AS origen,
    COALESCE(wo.crew_id, pi.assigned_crew_id) AS crew_id,
    COALESCE(cwo.name, cpi.name) AS crew_name,
    COALESCE(awe.name, api.name) AS activity_name,
    COALESCE(swe.name, spi.name) AS section_name,
    COALESCE(swe.code, spi.code) AS section_code,
    COALESCE(e.section_id, we.section_id, pi.section_id) AS section_id,
    COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m) AS progresiva_m,
    COALESCE(wo.work_date, (COALESCE(e.stamped_at, e.taken_at) AT TIME ZONE 'America/Lima'::text)::date) AS work_date,
    pci.code AS pci_code,
    e.stamped_at,
    COALESCE(e.stamped_at, e.taken_at) AS fecha_sello,
    COALESCE(awe.id, api.id) AS activity_id,
    COALESCE(awe.code, api.code) AS activity_code,
    COALESCE(awe.carpeta_ns, api.carpeta_ns) AS activity_carpeta_ns,
    pi.pci_id,
    pi.item_number AS pci_item_number,
    pi.term_days AS pci_term_days,
    we.work_order_id,
    COALESCE(we.side::text, pi.side::text) AS side,
    COALESCE(cwo.numero, cpi.numero) AS crew_numero,
    COALESCE(cwo.sede, cpi.sede) AS crew_sede,
    e.altitude_m,
    e.device_model,
    sec.code AS sector_code,
    sec.folder AS sector_folder,
    COALESCE(cwo.code, cpi.code) AS crew_code,
    e.master_path,
    e.master_width,
    e.master_height,
    e.master_bytes,
    e.revision,
    e.revision_nota,
    e.revisada_at
   FROM evidences e
     LEFT JOIN work_entries we ON we.id = e.work_entry_id AND we.deleted_at IS NULL
     LEFT JOIN work_orders wo ON wo.id = we.work_order_id AND wo.deleted_at IS NULL
     LEFT JOIN pci_items pi ON pi.id = e.pci_item_id AND pi.deleted_at IS NULL
     LEFT JOIN pcis pci ON pci.id = pi.pci_id
     LEFT JOIN crews cwo ON cwo.id = wo.crew_id
     LEFT JOIN crews cpi ON cpi.id = pi.assigned_crew_id
     LEFT JOIN activities_catalog awe ON awe.id = we.activity_id
     LEFT JOIN activities_catalog api ON api.id = pi.activity_id
     LEFT JOIN road_sections swe ON swe.id = COALESCE(e.section_id, we.section_id)
     LEFT JOIN road_sections spi ON spi.id = pi.section_id
     LEFT JOIN profiles p ON p.id = e.created_by
     LEFT JOIN LATERAL sector_de(COALESCE(e.section_id, we.section_id, pi.section_id), COALESCE(e.progresiva_m, we.prog_start_m, pi.prog_start_m)) sec(id, service_id, section_id, code, folder, prog_start_m, prog_end_m, orden, created_at) ON sec.id IS NOT NULL
  WHERE e.deleted_at IS NULL;
