-- ═══════════════════════════════════════════════════════════════════════════
-- 0152 · Caja presupuestal completa (revisión visual 18/11, ADMIN_Caja_*_V2,
-- ADMIN_SUB_Caja_Movimientos / Conciliación)
--
-- · Cada movimiento lleva su número (MOV021) y sus tres importes: Solicitado,
--   Aprobado y Ejecutado (el monto del movimiento). Un depósito toma lo
--   solicitado y aprobado de su solicitud de depósito.
-- · Transferencia interna: dos movimientos enlazados (sale de una caja, entra
--   en otra). Reasigna fondos; no es gasto ni fondo nuevo: no se suma dos veces.
-- · Registro de movimiento por administración (fondeo o gasto) con los tres
--   importes y su comprobante; sin conexión bancaria.
-- · Conciliación: saldo declarado − saldo esperado = diferencia. Las
--   aclaraciones explican la diferencia; el cierre del período queda
--   BLOQUEADO mientras quede diferencia sin aclarar. No se fuerza el saldo ni
--   se borran movimientos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cash_movements
  add column if not exists numero integer,
  add column if not exists monto_solicitado numeric(12, 2),
  add column if not exists monto_aprobado numeric(12, 2),
  add column if not exists transferencia_id uuid;
comment on column public.cash_movements.transferencia_id is 'Transferencia interna: enlaza la salida de una caja con la entrada en otra (no es doble gasto).';

-- Numeración por contrato, en el orden en que se registraron
with n as (select id, row_number() over (partition by service_id order by created_at, id) k from public.cash_movements)
update public.cash_movements m set numero = n.k from n where n.id = m.id and m.numero is null;

create or replace function public.t_cash_numero()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('cash:' || new.service_id));
    select coalesce(max(numero), 0) + 1 into new.numero from public.cash_movements where service_id = new.service_id;
  end if;
  return new;
end $$;
drop trigger if exists t_cash_numero on public.cash_movements;
create trigger t_cash_numero before insert on public.cash_movements for each row execute function public.t_cash_numero();

-- ── La caja del período, con los tres importes ────────────────────────────
create or replace function public.caja_periodo(p_service uuid, p_box uuid, p_desde date, p_hasta date)
returns json language sql stable security definer set search_path to 'public' as $$
  with m as (
    select m.*, b.name caja, b.holder_id, c.name cuadrilla, c.code crew_code, hp.full_name responsable,
           dr.amount dr_solicitado, dr.approved_amount dr_aprobado, r.codigo rendicion_codigo, r.estado rendicion_estado,
           cp.full_name creado_por_nombre, rp.full_name revisado_por_nombre
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id
      left join public.crews c on c.id = b.crew_id
      left join public.profiles hp on hp.id = b.holder_id
      left join public.profiles cp on cp.id = m.created_by
      left join public.profiles rp on rp.id = m.reviewed_by
      left join public.deposit_requests dr on dr.movement_id = m.id and dr.deleted_at is null
      left join public.rendiciones r on r.id = m.rendicion_id
     where m.service_id = p_service and m.deleted_at is null and m.status <> 'anulado' and (p_box is null or m.cash_box_id = p_box)
       and m.occurred_on between p_desde and p_hasta
       and public.role_in(p_service) in ('admin', 'residente', 'supervisor')
  )
  select json_build_object(
    -- Las transferencias internas reasignan fondos: no son fondo nuevo ni gasto
    'fondo', (select coalesce(sum(amount), 0) from m where kind in ('apertura', 'deposito') and transferencia_id is null),
    'sustentado', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status = 'aprobado'),
    'pendiente', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status in ('registrado', 'observado')),
    'disponible', (select coalesce(sum(balance), 0) from public.v_cash_boxes where service_id = p_service and (p_box is null or id = p_box)),
    'movimientos', (select coalesce(json_agg(json_build_object(
                      'id', id, 'numero', numero, 'codigo', 'MOV' || lpad(coalesce(numero, 0)::text, 3, '0'), 'fecha', occurred_on,
                      'caja', caja, 'cash_box_id', cash_box_id, 'cuadrilla', coalesce(cuadrilla, caja), 'crew_code', crew_code,
                      'responsable', responsable, 'responsable_id', holder_id,
                      'tipo', case when transferencia_id is not null then 'transferencia' else kind::text end,
                      'concepto', coalesce(category, description), 'descripcion', description,
                      'comprobante', case when transferencia_id is not null then 'Interno' when receipt_kind = 'sin_comprobante' then 'Sin comprobante' else initcap(receipt_kind::text) end,
                      'numero_comprobante', receipt_number, 'proveedor', supplier,
                      'monto', amount,
                      'solicitado', coalesce(monto_solicitado, dr_solicitado, amount),
                      'aprobado', coalesce(monto_aprobado, dr_aprobado, case when status = 'aprobado' or kind <> 'gasto' then amount end),
                      'ejecutado', amount,
                      'estado', status,
                      'estado_ui', case when transferencia_id is not null then 'interno'
                                        when status = 'aprobado' then 'conforme' when status = 'observado' then 'observado'
                                        when kind = 'gasto' then 'pendiente' else 'registrado' end,
                      'nota', review_note, 'justificacion', justification,
                      'sustentado', case when kind = 'gasto' and status = 'aprobado' then amount else 0 end,
                      'pendiente', case when kind = 'gasto' and status in ('registrado', 'observado') then amount else 0 end,
                      'rendicion_id', rendicion_id, 'rendicion_codigo', rendicion_codigo, 'rendicion_estado', rendicion_estado,
                      'archivo', storage_path, 'creado_at', created_at, 'creado_por', creado_por_nombre,
                      'revisado_at', reviewed_at, 'revisado_por', revisado_por_nombre, 'transferencia_id', transferencia_id)
                    order by occurred_on desc, numero desc), '[]'::json) from m)
  )
$$;
grant execute on function public.caja_periodo(uuid, uuid, date, date) to authenticated;

-- ── Registro de movimiento por administración ─────────────────────────────
create or replace function public.caja_movimiento_registrar(
  p_box uuid, p_tipo text, p_fecha date, p_concepto text, p_solicitado numeric, p_aprobado numeric, p_ejecutado numeric,
  p_comprobante text default null, p_numero_comprobante text default null, p_proveedor text default null, p_ruta text default null,
  p_justificacion text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare b public.cash_boxes; v_id uuid; v_num int;
begin
  select * into b from public.cash_boxes where id = p_box and deleted_at is null;
  if not found then raise exception 'SIGOV: elige la caja de la cuadrilla'; end if;
  if public.role_in(b.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: los movimientos de la caja presupuestal los registra administración' using errcode = '42501'; end if;
  if p_tipo not in ('deposito', 'gasto') then raise exception 'SIGOV: tipo de movimiento no válido (fondeo o gasto; la transferencia tiene su propio registro)'; end if;
  if nullif(trim(p_concepto), '') is null then raise exception 'SIGOV: escribe el concepto'; end if;
  if coalesce(p_ejecutado, 0) <= 0 then raise exception 'SIGOV: el importe ejecutado debe ser mayor que cero'; end if;
  if p_aprobado is not null and p_solicitado is not null and p_aprobado > p_solicitado then raise exception 'SIGOV: lo aprobado no puede superar lo solicitado'; end if;
  if p_tipo = 'gasto' and p_ruta is null and nullif(trim(p_justificacion), '') is null then
    raise exception 'SIGOV: adjunta el comprobante (PDF, JPG o PNG) o justifica por qué no hay';
  end if;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on,
                                     category, description, receipt_kind, receipt_number, supplier, storage_path, justification, created_by)
  values (b.service_id, p_box, b.crew_id, p_tipo::public.cash_movement_kind, 'registrado', p_ejecutado, p_solicitado, p_aprobado, coalesce(p_fecha, public.hoy_peru()),
          trim(p_concepto), trim(p_concepto),
          coalesce(nullif(p_comprobante, '')::public.receipt_kind, case when p_ruta is null then 'sin_comprobante' else 'boleta' end::public.receipt_kind),
          nullif(trim(p_numero_comprobante), ''), nullif(trim(p_proveedor), ''), p_ruta,
          coalesce(nullif(trim(p_justificacion), ''), case when p_ruta is null then trim(p_concepto) end), auth.uid())
  returning id, numero into v_id, v_num;
  return json_build_object('id', v_id, 'codigo', 'MOV' || lpad(v_num::text, 3, '0'));
end $$;
revoke all on function public.caja_movimiento_registrar(uuid, text, date, text, numeric, numeric, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.caja_movimiento_registrar(uuid, text, date, text, numeric, numeric, numeric, text, text, text, text, text) to authenticated;

-- ── Transferencia interna entre cajas ─────────────────────────────────────
create or replace function public.caja_transferir(p_desde_box uuid, p_hacia_box uuid, p_monto numeric, p_fecha date, p_concepto text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare a public.cash_boxes; b public.cash_boxes; t uuid := gen_random_uuid(); v1 int; v2 int; saldo numeric;
begin
  select * into a from public.cash_boxes where id = p_desde_box and deleted_at is null;
  select * into b from public.cash_boxes where id = p_hacia_box and deleted_at is null;
  if a.id is null or b.id is null then raise exception 'SIGOV: elige la caja de origen y la de destino'; end if;
  if a.id = b.id then raise exception 'SIGOV: el origen y el destino deben ser cajas distintas'; end if;
  if a.service_id <> b.service_id then raise exception 'SIGOV: las cajas son de contratos distintos'; end if;
  if public.role_in(a.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: las transferencias internas las registra administración' using errcode = '42501'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'SIGOV: el monto debe ser mayor que cero'; end if;
  select balance into saldo from public.v_cash_boxes where id = a.id;
  if saldo < p_monto then raise exception 'SIGOV: la caja de origen tiene S/ % disponible; no alcanza para transferir S/ %', round(saldo, 2), round(p_monto, 2); end if;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on, category, description, transferencia_id, receipt_kind, justification, created_by, reviewed_by, reviewed_at)
  values (a.service_id, a.id, a.crew_id, 'devolucion', 'aprobado', p_monto, p_monto, p_monto, coalesce(p_fecha, public.hoy_peru()), 'Transferencia',
          'Transferencia a ' || b.name || coalesce(' · ' || nullif(trim(p_concepto), ''), ''), t, 'sin_comprobante', 'Transferencia interna entre cajas', auth.uid(), auth.uid(), now())
  returning numero into v1;
  insert into public.cash_movements (service_id, cash_box_id, crew_id, kind, status, amount, monto_solicitado, monto_aprobado, occurred_on, category, description, transferencia_id, receipt_kind, justification, created_by, reviewed_by, reviewed_at)
  values (b.service_id, b.id, b.crew_id, 'deposito', 'aprobado', p_monto, p_monto, p_monto, coalesce(p_fecha, public.hoy_peru()), 'Transferencia',
          'Transferencia desde ' || a.name || coalesce(' · ' || nullif(trim(p_concepto), ''), ''), t, 'sin_comprobante', 'Transferencia interna entre cajas', auth.uid(), auth.uid(), now())
  returning numero into v2;
  return json_build_object('transferencia_id', t, 'salida', 'MOV' || lpad(v1::text, 3, '0'), 'entrada', 'MOV' || lpad(v2::text, 3, '0'));
end $$;
revoke all on function public.caja_transferir(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.caja_transferir(uuid, uuid, numeric, date, text) to authenticated;

-- ── Conciliación: saldos, aclaraciones y cierre ───────────────────────────
alter table public.conciliaciones
  add column if not exists saldo_esperado numeric(12, 2),
  add column if not exists saldo_declarado numeric(12, 2);

create table if not exists public.conciliacion_aclaraciones (
  id uuid primary key default gen_random_uuid(),
  conciliacion_id uuid not null references public.conciliaciones(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  monto numeric(12, 2) not null,
  texto text not null,
  adjunto text,
  quien uuid references public.profiles(id) default auth.uid(),
  cuando timestamptz not null default now()
);
alter table public.conciliacion_aclaraciones enable row level security;
drop policy if exists conciliacion_aclaraciones_select on public.conciliacion_aclaraciones;
create policy conciliacion_aclaraciones_select on public.conciliacion_aclaraciones for select to authenticated
  using (public.role_in(service_id) in ('admin', 'residente'));
grant select on public.conciliacion_aclaraciones to authenticated;

create table if not exists public.caja_cierres (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  cash_box_id uuid references public.cash_boxes(id),
  desde date not null,
  hasta date not null,
  conciliacion_id uuid references public.conciliaciones(id),
  saldo numeric(12, 2),
  quien uuid references public.profiles(id) default auth.uid(),
  cuando timestamptz not null default now(),
  nota text
);
alter table public.caja_cierres enable row level security;
drop policy if exists caja_cierres_select on public.caja_cierres;
create policy caja_cierres_select on public.caja_cierres for select to authenticated using (public.role_in(service_id) in ('admin', 'residente'));
grant select on public.caja_cierres to authenticated;

create or replace function public.conciliacion_guardar(p_service uuid, p_box uuid, p_desde date, p_hasta date, p_items jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v json; v_decl numeric := 0; v_dif numeric := 0; i jsonb; v_id uuid; v_cod text; esp numeric;
begin
  if public.role_in(p_service) not in ('admin', 'residente') then raise exception 'SIGOV: la conciliación la registra administración' using errcode = '42501'; end if;
  v := public.caja_periodo(p_service, p_box, p_desde, p_hasta);
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select coalesce((x->>'sustentado')::numeric, 0) + coalesce((x->>'pendiente')::numeric, 0) into esp
      from json_array_elements(v->'movimientos') x where x->>'id' = i->>'movement_id';
    v_decl := v_decl + coalesce((i->>'declarado')::numeric, 0);
    v_dif := v_dif + coalesce((i->>'declarado')::numeric, 0) - coalesce(esp, 0);
  end loop;
  if round(v_dif, 2) <> 0 and nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: hay diferencia de S/ %: escribe el motivo', round(v_dif, 2); end if;
  insert into public.conciliaciones (service_id, numero, cash_box_id, desde, hasta, fondo, sustentado, pendiente, declarado, diferencia, items, motivo, quien,
                                     saldo_esperado, saldo_declarado)
  values (p_service, public.ssoma_siguiente(p_service, 'conciliaciones'), p_box, p_desde, p_hasta, (v->>'fondo')::numeric, (v->>'sustentado')::numeric,
          (v->>'pendiente')::numeric, v_decl, round(v_dif, 2), coalesce(p_items, '[]'::jsonb), nullif(trim(p_motivo), ''), auth.uid(),
          (v->>'disponible')::numeric, (v->>'disponible')::numeric + round(v_dif, 2))
  returning id, codigo into v_id, v_cod;
  return json_build_object('id', v_id, 'codigo', v_cod, 'diferencia', round(v_dif, 2));
end $$;
grant execute on function public.conciliacion_guardar(uuid, uuid, date, date, jsonb, text) to authenticated;

-- Lo que falta aclarar de una conciliación (con el signo de la diferencia)
create or replace function public.conciliacion_pendiente(p_id uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select round(c.diferencia - sign(c.diferencia) * least(abs(c.diferencia), coalesce((select sum(abs(a.monto)) from public.conciliacion_aclaraciones a where a.conciliacion_id = c.id), 0)), 2)
    from public.conciliaciones c where c.id = p_id
$$;

create or replace function public.conciliacion_aclarar(p_id uuid, p_monto numeric, p_texto text, p_adjunto text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare c public.conciliaciones;
begin
  select * into c from public.conciliaciones where id = p_id;
  if not found then raise exception 'SIGOV: la conciliación no existe'; end if;
  if public.role_in(c.service_id) not in ('admin', 'residente') then raise exception 'SIGOV: las aclaraciones las registra administración' using errcode = '42501'; end if;
  if nullif(trim(p_texto), '') is null then raise exception 'SIGOV: explica la diferencia'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'SIGOV: indica el monto que aclara (mayor que cero)'; end if;
  if abs(public.conciliacion_pendiente(p_id)) = 0 then raise exception 'SIGOV: esa conciliación ya no tiene diferencia por aclarar'; end if;
  insert into public.conciliacion_aclaraciones (conciliacion_id, service_id, monto, texto, adjunto) values (p_id, c.service_id, abs(p_monto), trim(p_texto), p_adjunto);
  return json_build_object('pendiente', public.conciliacion_pendiente(p_id));
end $$;
revoke all on function public.conciliacion_aclarar(uuid, numeric, text, text) from public, anon;
grant execute on function public.conciliacion_aclarar(uuid, numeric, text, text) to authenticated;

-- ¿Se puede cerrar el período? La última conciliación del período manda
create or replace function public.caja_cierre_estado(p_service uuid, p_box uuid, p_desde date, p_hasta date)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare c public.conciliaciones; v_pend numeric; k public.caja_cierres;
begin
  if public.role_in(p_service) not in ('admin', 'residente') then raise exception 'SIGOV: solo administración' using errcode = '42501'; end if;
  select * into k from public.caja_cierres where service_id = p_service and cash_box_id is not distinct from p_box and desde = p_desde and hasta = p_hasta order by cuando desc limit 1;
  select * into c from public.conciliaciones where service_id = p_service and cash_box_id is not distinct from p_box and desde = p_desde and hasta = p_hasta order by cuando desc limit 1;
  v_pend := case when c.id is null then null else public.conciliacion_pendiente(c.id) end;
  return json_build_object(
    'cerrado', k.id is not null, 'cerrado_at', k.cuando,
    'conciliacion', case when c.id is null then null else json_build_object('id', c.id, 'codigo', c.codigo, 'diferencia', c.diferencia, 'pendiente', v_pend,
        'saldo_esperado', c.saldo_esperado, 'saldo_declarado', c.saldo_declarado, 'cuando', c.cuando, 'motivo', c.motivo, 'items', c.items,
        'aclaraciones', (select coalesce(json_agg(json_build_object('monto', a.monto, 'texto', a.texto, 'adjunto', a.adjunto, 'cuando', a.cuando,
                           'quien', (select full_name from public.profiles p where p.id = a.quien)) order by a.cuando), '[]'::json)
                           from public.conciliacion_aclaraciones a where a.conciliacion_id = c.id)) end,
    'bloqueado', c.id is null or abs(v_pend) > 0,
    'motivo_bloqueo', case when c.id is null then 'Registra la conciliación del período antes de cerrarlo.'
                           when abs(v_pend) > 0 then format('Existe una diferencia de S/ %s pendiente de aclaración.', to_char(abs(v_pend), 'FM999G999G990D00'))
                           else null end);
end $$;
revoke all on function public.caja_cierre_estado(uuid, uuid, date, date) from public, anon;
grant execute on function public.caja_cierre_estado(uuid, uuid, date, date) to authenticated;

create or replace function public.caja_cerrar(p_service uuid, p_box uuid, p_desde date, p_hasta date, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare e json; v_id uuid;
begin
  e := public.caja_cierre_estado(p_service, p_box, p_desde, p_hasta);
  if (e->>'cerrado')::boolean then raise exception 'SIGOV: ese período ya está cerrado'; end if;
  if (e->>'bloqueado')::boolean then raise exception 'SIGOV: cierre bloqueado. %', e->>'motivo_bloqueo'; end if;
  insert into public.caja_cierres (service_id, cash_box_id, desde, hasta, conciliacion_id, saldo, nota)
  values (p_service, p_box, p_desde, p_hasta, (e->'conciliacion'->>'id')::uuid, (e->'conciliacion'->>'saldo_declarado')::numeric, nullif(trim(p_nota), ''))
  returning id into v_id;
  return json_build_object('id', v_id);
end $$;
revoke all on function public.caja_cerrar(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.caja_cerrar(uuid, uuid, date, date, text) to authenticated;
