-- ═══════════════════════════════════════════════════════════════════════
-- 0091 · El gasto sin comprobante lleva su justificación (OBS-40)
--
-- Elvis: cuando se permite «Sin comprobante», exigir justificación, la foto
-- es opcional, que quede claramente marcado y vaya a revisión. Hasta ahora
-- el porqué se mezclaba con el detalle del gasto.
--
-- · cash_movements.justification: el porqué, aparte.
-- · Las versiones de la app que no la envían no fallan: si viene vacía se
--   toma el detalle del gasto (la app ya exigía explicarlo ahí).
-- · El jefe puede corregirla mientras el gasto no esté aprobado (0090).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.cash_movements add column if not exists justification text;

create or replace function public.t_cash_movement_justificacion()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.receipt_kind = 'sin_comprobante' then
    if coalesce(trim(new.justification), '') = '' then
      new.justification := nullif(trim(new.description), '');
    end if;
    if new.justification is null then
      raise exception 'SIGOV: un gasto sin comprobante necesita su justificación';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cash_movements_justificacion on public.cash_movements;
create trigger cash_movements_justificacion
  before insert or update on public.cash_movements
  for each row execute function public.t_cash_movement_justificacion();

-- Lo ya registrado sin comprobante toma su detalle como justificación
update public.cash_movements set justification = description
 where receipt_kind = 'sin_comprobante' and justification is null;

-- La regla del jefe (0090), contando también la justificación como corregible
create or replace function public.t_cash_movement_reglas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.can_manage(coalesce(new.service_id, old.service_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.kind not in ('gasto', 'devolucion') then
      raise exception 'SIGOV: desde campo solo se registran gastos y devoluciones; los depósitos los registra administración'
        using errcode = '42501';
    end if;
    new.status := 'registrado';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.created_by := v_uid;
    return new;
  end if;

  -- Lo de administración se conserva tal cual (un reintento del celular no
  -- falla ni pisa la revisión)
  new.service_id  := old.service_id;
  new.cash_box_id := old.cash_box_id;
  new.client_id   := old.client_id;
  new.kind        := old.kind;
  new.status      := old.status;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_note := old.review_note;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  new.deleted_at  := old.deleted_at;

  if (new.amount, new.occurred_on, new.category, new.description, new.supplier, new.supplier_ruc,
      new.receipt_kind, new.receipt_number, new.storage_path, new.storage_sha256, new.justification)
     is distinct from
     (old.amount, old.occurred_on, old.category, old.description, old.supplier, old.supplier_ruc,
      old.receipt_kind, old.receipt_number, old.storage_path, old.storage_sha256, old.justification) then
    if old.created_by is distinct from v_uid then
      raise exception 'SIGOV: solo quien registró el gasto puede corregirlo' using errcode = '42501';
    end if;
    if old.status not in ('registrado', 'observado') then
      raise exception 'SIGOV: el gasto ya fue revisado; no se puede corregir' using errcode = '42501';
    end if;
    if old.status = 'observado' then
      new.status := 'registrado';   -- corregido, vuelve a revisión
    end if;
  end if;
  return new;
end $$;


create or replace view public.v_cash_movements with (security_invoker = on) as
SELECT m.id,
    m.client_id,
    m.service_id,
    m.cash_box_id,
    b.code AS box_code,
    m.kind,
    m.status,
    m.amount,
        CASE
            WHEN (m.kind = ANY (ARRAY['gasto'::cash_movement_kind, 'devolucion'::cash_movement_kind])) THEN (- m.amount)
            ELSE m.amount
        END AS signed_amount,
    m.occurred_on,
    m.category,
    m.description,
    m.supplier,
    m.supplier_ruc,
    m.receipt_kind,
    m.receipt_number,
    m.storage_path,
    m.work_order_id,
    m.section_id,
    s.name AS section_name,
    m.crew_id,
    c.name AS crew_name,
    m.review_note,
    p.full_name AS created_by_name,
    m.created_at,
    m.created_by,
    m.justification
   FROM ((((cash_movements m
     JOIN cash_boxes b ON ((b.id = m.cash_box_id)))
     LEFT JOIN road_sections s ON ((s.id = m.section_id)))
     LEFT JOIN crews c ON ((c.id = m.crew_id)))
     LEFT JOIN profiles p ON ((p.id = m.created_by)))
  WHERE (m.deleted_at IS NULL);
