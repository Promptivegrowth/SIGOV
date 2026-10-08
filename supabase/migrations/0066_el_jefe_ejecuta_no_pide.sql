-- ═══════════════════════════════════════════════════════════════════════
-- 0066 · El jefe de cuadrilla ejecuta, no pide materiales
--
-- Regla 1.2 de las observaciones del cliente (y OBS-42): la solicitud de
-- materiales es del supervisor o del residente, no del jefe de cuadrilla.
-- La web ya no le muestra el apartado ni el botón «Nuevo pedido», pero eso
-- es solo la pantalla: la base le dejaba crear pedidos con su sesión, por
-- la API o por crear_pedido(), porque todo se medía con can_write(), que
-- incluye al jefe. Aquí se cierra en la base: crear un pedido o sus
-- renglones pide can_manage() (administrador o supervisor).
--
-- El cabo suelto son los celulares. La app guardaba el pedido en una cola
-- local y lo sube cuando hay señal, con la sesión del jefe y por inserción
-- directa (no por crear_pedido). Un jefe que pidió sin señal ayer tiene el
-- pedido todavía en el teléfono; si la base lo rechaza hoy, la cola se
-- queda reintentando un pedido que el almacén nunca verá y el jefe cree
-- que lo pidió. Rechazarlo en silencio es peor que recibirlo.
--
-- Decisión: un periodo de transición con fecha de caducidad escrita aquí.
-- Hasta el 07-11-2026 (un mes, tiempo para que todos los celulares tengan
-- la versión sin el módulo de materiales) la base acepta del jefe solo lo
-- que la app vieja manda tal cual: un pedido en estado «solicitado», a su
-- nombre, y renglones de un pedido suyo que siga «solicitado» y sin nada
-- aprobado ni entregado. Lo que entra así cae en «Por revisar» como
-- cualquier pedido: no se aprueba solo, y el supervisor decide. Pasada la
-- fecha la vía se apaga sola —la condición deja de cumplirse— y una
-- migración posterior puede borrar las dos funciones sin cambiar nada.
--
-- crear_pedido() —la vía de la web— no entra en la transición: ningún
-- celular la usa, así que desde ya exige can_manage().
-- ═══════════════════════════════════════════════════════════════════════

-- ─── La vía de transición de los celulares ────────────────────────────
-- Fin de la transición: medianoche del 07-11-2026 en Lima (UTC-5).
create or replace function public.pedido_de_campo_en_transicion(
  p_service_id uuid,
  p_status     public.supply_request_status,
  p_created_by uuid
) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select now() < timestamptz '2026-11-08 00:00:00-05'
     and public.role_in(p_service_id) = 'jefe_cuadrilla'
     and p_status = 'solicitado'
     and p_created_by = auth.uid()
$$;

comment on function public.pedido_de_campo_en_transicion(uuid, public.supply_request_status, uuid) is
  'Transición de la regla 1.2 (0066): deja subir hasta el 07-11-2026 los pedidos que los celulares de los jefes de cuadrilla tenían en cola. Después siempre devuelve false.';

-- El renglón no trae ni estado ni autor: se mira el pedido al que cuelga.
create or replace function public.renglon_de_campo_en_transicion(
  p_service_id   uuid,
  p_request_id   uuid,
  p_qty_approved numeric
) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select now() < timestamptz '2026-11-08 00:00:00-05'
     and p_qty_approved is null
     and exists (
       select 1 from public.supply_requests r
        where r.id = p_request_id
          and r.service_id = p_service_id
          and r.status = 'solicitado'
          and r.created_by = auth.uid()
          and r.deleted_at is null
          and public.role_in(r.service_id) = 'jefe_cuadrilla'
     )
$$;

comment on function public.renglon_de_campo_en_transicion(uuid, uuid, numeric) is
  'Transición de la regla 1.2 (0066): renglones de un pedido en cola del celular, mientras siga solicitado. Después del 07-11-2026 siempre devuelve false.';

revoke all on function public.pedido_de_campo_en_transicion(uuid, public.supply_request_status, uuid) from public, anon;
revoke all on function public.renglon_de_campo_en_transicion(uuid, uuid, numeric) from public, anon;
grant execute on function public.pedido_de_campo_en_transicion(uuid, public.supply_request_status, uuid) to authenticated;
grant execute on function public.renglon_de_campo_en_transicion(uuid, uuid, numeric) to authenticated;

-- ─── Crear pedidos y renglones: administrador o supervisor ────────────
-- Leer, actualizar (anular el propio, p. ej.) y borrar no cambian.
drop policy if exists supply_requests_insert on public.supply_requests;
create policy supply_requests_insert on public.supply_requests
  for insert to authenticated
  with check (
    public.can_manage(service_id)
    or public.pedido_de_campo_en_transicion(service_id, status, created_by)
  );

drop policy if exists supply_request_items_insert on public.supply_request_items;
create policy supply_request_items_insert on public.supply_request_items
  for insert to authenticated
  with check (
    public.can_manage(service_id)
    or public.renglon_de_campo_en_transicion(service_id, request_id, qty_approved)
  );

-- ─── crear_pedido: igual que en la 0064, salvo quién puede ────────────
create or replace function public.crear_pedido(
  p_service_id   uuid,
  p_crew_id      uuid default null,
  p_needed_on    date default null,
  p_reason       text default null,
  p_section_id   uuid default null,
  p_plan_item_id uuid default null,
  p_items        jsonb default '[]'::jsonb,  -- [{supply_id, qty, notes} | {other_name, other_unit_id, qty, notes}]
  p_aprobar      boolean default true
) returns uuid
language plpgsql security invoker set search_path to 'public' as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  -- Regla 1.2: pide el supervisor o el residente. El jefe de cuadrilla
  -- ejecuta con lo que le entregan.
  if not public.can_manage(p_service_id) then
    raise exception 'Solo el supervisor o el administrador pueden pedir materiales.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  insert into public.supply_requests
    (service_id, crew_id, status, needed_on, reason, section_id, plan_item_id, created_by)
  values
    (p_service_id, p_crew_id,
     case when p_aprobar then 'aprobado' else 'solicitado' end::public.supply_request_status,
     coalesce(p_needed_on, (now() at time zone 'America/Lima')::date),
     nullif(btrim(p_reason), ''), p_section_id, p_plan_item_id, auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, qty_approved, notes)
    values (
      p_service_id, v_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      case when p_aprobar then (v_item->>'qty')::numeric end,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  return v_id;
end $$;

grant execute on function public.crear_pedido(uuid, uuid, date, text, uuid, uuid, jsonb, boolean) to authenticated;
