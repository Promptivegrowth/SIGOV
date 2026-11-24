-- ═══════════════════════════════════════════════════════════════════════════
-- 0166 · Caja › Movimientos (ADMIN_SUB_Caja_Movimientos §3, repaso 18/11 p.10):
-- editar un movimiento ya registrado, con motivo y bitácora. No se edita lo
-- aprobado, lo ya rendido, las transferencias (se anulan con su contrapartida)
-- ni lo que cae en un período cerrado.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.caja_movimiento_editar(
  p_id uuid, p_fecha date, p_concepto text, p_solicitado numeric, p_aprobado numeric, p_ejecutado numeric,
  p_numero_comprobante text, p_proveedor text, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare m public.cash_movements;
begin
  select * into m from public.cash_movements where id = p_id and deleted_at is null for update;
  if not found then raise exception 'SIGOV: el movimiento no existe'; end if;
  perform public.exigir_accion(m.service_id, 'caja', 'editar');
  if public.role_in(m.service_id) not in ('admin', 'residente') then
    raise exception 'SIGOV: los movimientos de la caja presupuestal los edita administración' using errcode = '42501';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio: queda en el historial del movimiento'; end if;
  if m.transferencia_id is not null then raise exception 'SIGOV: una transferencia interna no se edita; regístrala de nuevo con el monto correcto y anula la anterior'; end if;
  if m.status = 'aprobado' then raise exception 'SIGOV: el movimiento ya está aprobado; para corregirlo, registra un ajuste con su motivo'; end if;
  if m.rendicion_id is not null then raise exception 'SIGOV: el movimiento ya forma parte de una rendición'; end if;
  if coalesce(p_ejecutado, 0) <= 0 then raise exception 'SIGOV: el monto ejecutado debe ser mayor que cero'; end if;
  if nullif(trim(p_concepto), '') is null then raise exception 'SIGOV: el concepto es obligatorio'; end if;
  if exists (select 1 from public.caja_cierres c where c.service_id = m.service_id and (c.cash_box_id is null or c.cash_box_id = m.cash_box_id)
              and (m.occurred_on between c.desde and c.hasta or coalesce(p_fecha, m.occurred_on) between c.desde and c.hasta)) then
    raise exception 'SIGOV: la fecha cae en un período de caja cerrado; no se edita';
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.cash_movements set occurred_on = coalesce(p_fecha, occurred_on), description = trim(p_concepto),
         monto_solicitado = p_solicitado, monto_aprobado = p_aprobado, amount = p_ejecutado,
         receipt_number = nullif(trim(p_numero_comprobante), ''), supplier = nullif(trim(p_proveedor), ''), updated_at = now()
   where id = m.id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
revoke all on function public.caja_movimiento_editar(uuid, date, text, numeric, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.caja_movimiento_editar(uuid, date, text, numeric, numeric, numeric, text, text, text) to authenticated;
notify pgrst, 'reload schema';
