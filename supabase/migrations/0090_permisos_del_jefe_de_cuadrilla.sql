-- ═══════════════════════════════════════════════════════════════════════
-- 0090 · Lo que el jefe de cuadrilla puede escribir, cerrado en la base
--
-- La web ya oculta estas acciones a quien no administra, pero las políticas
-- usaban `can_write` (que incluye al jefe de cuadrilla): con el token de la
-- app se podían hacer por API. Se cierran en la base, como se hizo con la
-- caja (0085) y los equipos (0088):
--
-- · Catálogos y estructura del contrato (actividades, cuadrillas y sus
--   integrantes, tramos, inventario vial, plantillas de checklist, cajas,
--   suspensiones de programación, importaciones): solo quien administra.
-- · Vehículos: quien administra y SSOMA (el jefe usa las funciones de
--   reemplazo y alta temporal, que validan por su cuenta).
-- · Gastos de caja: el jefe registra gastos y devoluciones y corrige los
--   suyos mientras no estén aprobados; el estado y la revisión son de
--   administración (antes podía aprobarse su propio gasto o anotar un
--   «depósito» a su caja).
-- · Pedidos de materiales: lo aprobado y lo entregado no lo toca el jefe.
-- · Avisos: nadie le crea avisos a otro usuario desde la app.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Catálogos y estructura: solo quien administra ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['activities_catalog', 'crews', 'road_sections', 'road_assets',
                           'cash_boxes', 'plan_suspensions', 'import_batches'] loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated
                     with check (public.can_manage(service_id))$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated
                     using (public.can_manage(service_id)) with check (public.can_manage(service_id))$f$, t);
  end loop;
end $$;

-- Plantillas de checklist y vehículos: también SSOMA
do $$
declare t text;
begin
  foreach t in array array['checklist_templates', 'vehicles'] loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated
                     with check (public.puede_revisar_ssoma(service_id))$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated
                     using (public.puede_revisar_ssoma(service_id)) with check (public.puede_revisar_ssoma(service_id))$f$, t);
  end loop;
end $$;

-- Los integrantes de una cuadrilla (la política era para todo, con can_write)
do $$
declare p record;
begin
  for p in select polname from pg_policy where polrelid = 'public.crew_members'::regclass loop
    execute format('drop policy %I on public.crew_members', p.polname);
  end loop;
end $$;
create policy crew_members_select on public.crew_members for select to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and public.is_member(c.service_id)));
create policy crew_members_write on public.crew_members for all to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and public.can_manage(c.service_id)))
  with check (exists (select 1 from public.crews c where c.id = crew_id and public.can_manage(c.service_id)));

-- ─── Gastos de caja ────────────────────────────────────────────────────
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
      new.receipt_kind, new.receipt_number, new.storage_path, new.storage_sha256)
     is distinct from
     (old.amount, old.occurred_on, old.category, old.description, old.supplier, old.supplier_ruc,
      old.receipt_kind, old.receipt_number, old.storage_path, old.storage_sha256) then
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

drop trigger if exists cash_movements_reglas on public.cash_movements;
create trigger cash_movements_reglas
  before insert or update on public.cash_movements
  for each row execute function public.t_cash_movement_reglas();

-- ─── Pedidos de materiales: lo aprobado y lo entregado ─────────────────
create or replace function public.t_supply_item_reglas()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.can_manage(old.service_id) then
    return new;
  end if;
  new.qty_approved  := old.qty_approved;
  new.qty_delivered := old.qty_delivered;
  new.request_id    := old.request_id;
  new.service_id    := old.service_id;
  return new;
end $$;

drop trigger if exists supply_request_items_reglas on public.supply_request_items;
create trigger supply_request_items_reglas
  before update on public.supply_request_items
  for each row execute function public.t_supply_item_reglas();

-- ─── Avisos: cada uno solo se crea los suyos ───────────────────────────
drop policy if exists notifications_insert on public.notifications;
do $$
declare p record;
begin
  for p in select polname from pg_policy
            where polrelid = 'public.notifications'::regclass and polcmd = 'a' loop
    execute format('drop policy %I on public.notifications', p.polname);
  end loop;
end $$;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (profile_id = auth.uid() or public.can_manage(service_id));

-- ─── Corrección de 0088: la inspección es del mismo contrato que el equipo ──
drop policy if exists safety_equipment_checks_insert on public.safety_equipment_checks;
create policy safety_equipment_checks_insert on public.safety_equipment_checks for insert to authenticated
  with check (public.can_write(safety_equipment_checks.service_id)
              and exists (select 1 from public.safety_equipment e
                           where e.id = safety_equipment_checks.equipment_id
                             and e.service_id = safety_equipment_checks.service_id
                             and public.equipo_a_mi_alcance(e.service_id, e.crew_id)));
