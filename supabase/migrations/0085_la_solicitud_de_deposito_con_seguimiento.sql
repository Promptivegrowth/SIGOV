-- ═══════════════════════════════════════════════════════════════════════
-- 0085 · La solicitud de depósito, con prioridad, reglas y seguimiento
--
-- OBS-41: el jefe de cuadrilla pedía depósito y solo veía «Solicitud
-- enviada»; después, nada. Ahora la solicitud lleva prioridad, tiene un
-- estado que solo cambia administración y avisa en los dos sentidos.
--
-- Además se cierra un hueco: la política de UPDATE era `can_write`, así que
-- el propio jefe podía marcar su solicitud como aprobada o depositada por
-- API. El estado y la respuesta ahora son solo de quien administra.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.deposit_requests
  add column if not exists priority text not null default 'normal';

do $$ begin
  alter table public.deposit_requests
    add constraint deposit_requests_priority_check check (priority in ('normal', 'urgente'));
exception when duplicate_object then null; end $$;

-- ─── Quién puede tocar qué ─────────────────────────────────────────────
--
-- Quien administra responde: estado, monto aprobado, nota, operación.
-- El que pidió solo corrige su pedido (monto, motivo, prioridad, fecha)
-- mientras nadie lo atendió o después de que se lo observaron; al
-- corregir una observada, vuelve a «solicitado».
--
-- Lo protegido no se rechaza, se conserva: el celular reenvía la solicitud
-- completa si no supo que llegó, y ese reintento no debe fallar ni pisar
-- la respuesta de administración.
create or replace function public.t_deposit_request_reglas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new;   -- tareas del sistema
  end if;

  if tg_op = 'INSERT' then
    if not public.can_manage(new.service_id) then
      new.status := 'solicitado';
      new.approved_amount := null;
      new.resolved_by := null;
      new.resolved_at := null;
      new.resolution_note := null;
      new.bank_reference := null;
      new.movement_id := null;
      new.created_by := v_uid;
    end if;
    return new;
  end if;

  if public.can_manage(old.service_id) then
    if new.status is distinct from old.status then
      if new.status in ('observado', 'rechazado') and coalesce(trim(new.resolution_note), '') = '' then
        raise exception 'SIGOV: escribe el motivo; el jefe de cuadrilla necesita saber qué corregir';
      end if;
      if new.status <> 'solicitado' then
        new.resolved_by := v_uid;
        new.resolved_at := now();
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- El jefe de cuadrilla: lo de administración se queda como estaba
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

drop trigger if exists deposit_requests_reglas on public.deposit_requests;
create trigger deposit_requests_reglas
  before insert or update on public.deposit_requests
  for each row execute function public.t_deposit_request_reglas();

-- ─── Los avisos ────────────────────────────────────────────────────────
--
-- Pedido nuevo o corregido → a quien administra. Respuesta → a quien pidió.
create or replace function public.t_deposit_request_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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

  if new.status = 'solicitado' then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select new.service_id, m.profile_id, 'deposito_solicitado',
           case when new.priority = 'urgente' then '🔴 Depósito URGENTE · ' else 'Solicitud de depósito · ' end
             || coalesce(v_caja, 'caja') || ' · S/ ' || to_char(new.amount, 'FM999G999G990D00'),
           case when tg_op = 'UPDATE' then 'Corregida: ' else '' end || new.reason,
           '/caja', case when new.priority = 'urgente' then 'warning' else 'info' end,
           jsonb_build_object('deposit_request_id', new.id)
      from public.service_members m
     where m.service_id = new.service_id and m.role in ('admin', 'supervisor')
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
             case when new.status = 'depositado' and new.bank_reference is not null
                  then 'Operación ' || new.bank_reference end,
             new.reason),
    '/caja',
    case new.status when 'rechazado' then 'danger' when 'observado' then 'warning'
                    when 'depositado' then 'success' else 'info' end,
    jsonb_build_object('deposit_request_id', new.id)
  );
  return null;
end $$;

drop trigger if exists deposit_requests_avisos on public.deposit_requests;
create trigger deposit_requests_avisos
  after insert or update on public.deposit_requests
  for each row execute function public.t_deposit_request_avisos();

-- ─── Atender: el depósito y su ingreso a caja, juntos ──────────────────
--
-- Antes la web hacía dos escrituras sueltas (movimiento y solicitud); si la
-- segunda fallaba quedaba plata en la caja con la solicitud abierta.
create or replace function public.atender_solicitud_deposito(
  p_id uuid, p_monto numeric, p_operacion text, p_nota text default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  s public.deposit_requests;
  v_mov uuid;
begin
  select * into s from public.deposit_requests where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: la solicitud no existe'; end if;
  if not public.can_manage(s.service_id) then
    raise exception 'SIGOV: solo administración registra depósitos' using errcode = '42501';
  end if;
  if s.status in ('depositado', 'rechazado') then
    raise exception 'SIGOV: esta solicitud ya está cerrada';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'SIGOV: escribe el monto depositado'; end if;
  if coalesce(trim(p_operacion), '') = '' then raise exception 'SIGOV: falta el número de operación del abono'; end if;

  insert into public.cash_movements (
    service_id, cash_box_id, kind, status, amount, description,
    receipt_kind, receipt_number, created_by, reviewed_by, reviewed_at
  ) values (
    s.service_id, s.cash_box_id, 'deposito', 'aprobado', p_monto,
    'Depósito a caja · ' || s.reason, 'recibo', trim(p_operacion),
    auth.uid(), auth.uid(), now()
  ) returning id into v_mov;

  update public.deposit_requests
     set status = 'depositado',
         approved_amount = p_monto,
         bank_reference = trim(p_operacion),
         resolution_note = coalesce(nullif(trim(p_nota), ''), resolution_note),
         movement_id = v_mov
   where id = p_id;

  return json_build_object('movement_id', v_mov);
end $$;

grant execute on function public.atender_solicitud_deposito(uuid, numeric, text, text) to authenticated;
revoke execute on function public.atender_solicitud_deposito(uuid, numeric, text, text) from anon;

-- ─── Corregir una solicitud observada (desde el celular, con o sin señal) ──
create or replace function public.corregir_solicitud_deposito(
  p_id uuid, p_monto numeric, p_motivo text, p_prioridad text default 'normal'
) returns void language plpgsql security invoker set search_path to 'public' as $$
begin
  if p_monto is null or p_monto <= 0 then raise exception 'SIGOV: escribe cuánto necesitas'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'SIGOV: di para qué es el depósito'; end if;
  -- Las reglas (quién, en qué estado) las aplica el trigger
  update public.deposit_requests
     set amount = p_monto, reason = trim(p_motivo), priority = coalesce(p_prioridad, 'normal')
   where id = p_id and deleted_at is null;
  if not found then raise exception 'SIGOV: la solicitud no existe'; end if;
end $$;

grant execute on function public.corregir_solicitud_deposito(uuid, numeric, text, text) to authenticated;
revoke execute on function public.corregir_solicitud_deposito(uuid, numeric, text, text) from anon;
