-- ═══════════════════════════════════════════════════════════════════════════
-- 0146 · Administrador · Caja, Recursos, Configuración, Alertas y Bitácora
--        (revisión visual 18/11, T8b)
--
-- · Caja presupuestal (uso interno SERVICON, nunca visible a COVINCA):
--   rendiciones RND-NNN que agrupan los gastos de una caja en un periodo y
--   se aprueban u observan con motivo (el jefe no aprueba su propia
--   rendición); conciliaciones CON-NNN con lo declarado por movimiento y su
--   diferencia. Sin conexión bancaria: todo es registro interno.
-- · Recursos: asignación de vehículo a cuadrilla con control de solapes.
-- · Configuración del contrato con versiones y motivo.
-- · Alertas del sistema calculadas (con «atendida» registrada).
-- · Bitácora: resumen y detalle de audit_log + accesos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Rendiciones ──────────────────────────────────────────────────────────
create table if not exists public.rendiciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('RND-' || lpad(numero::text, 3, '0')) stored,
  cash_box_id uuid not null references public.cash_boxes(id),
  crew_id uuid references public.crews(id),
  desde date not null,
  hasta date not null,
  responsable_id uuid references public.profiles(id),
  estado text not null default 'por_revisar' check (estado in ('por_revisar', 'aprobada', 'observada')),
  nota text,
  motivo text,
  creado_por uuid references public.profiles(id),
  creado_at timestamptz not null default clock_timestamp(),
  revisado_por uuid references public.profiles(id),
  revisado_at timestamptz,
  unique (service_id, numero)
);
alter table public.cash_movements add column if not exists rendicion_id uuid references public.rendiciones(id);
alter table public.rendiciones enable row level security;
drop policy if exists rendiciones_select on public.rendiciones;
create policy rendiciones_select on public.rendiciones for select to authenticated
  using ((service_id in (select public.mis_servicios()) and not public.es_visor(service_id) and public.role_in(service_id) <> 'ing_seguridad'
          and (public.role_in(service_id) in ('admin', 'residente', 'supervisor') or crew_id = any(coalesce(public.mis_cuadrillas(service_id), '{}'::uuid[]))))
         or public.is_platform_admin());
grant select on public.rendiciones to authenticated;
drop trigger if exists t_audit_rendiciones on public.rendiciones;
create trigger t_audit_rendiciones after insert or update or delete on public.rendiciones for each row execute function public.audit_trigger();

/** Rendir los gastos de una caja en un periodo (los que aún no están en otra rendición). */
create or replace function public.rendicion_generar(p_box uuid, p_desde date, p_hasta date, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare b public.cash_boxes; v_id uuid; v_cod text; v_n int;
begin
  select * into b from public.cash_boxes where id = p_box and deleted_at is null;
  if not found then raise exception 'SIGOV: la caja no existe'; end if;
  if not (public.role_in(b.service_id) in ('admin', 'residente') or b.holder_id = auth.uid()) then
    raise exception 'SIGOV: la rendición la presenta el responsable de la caja o administración' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'SIGOV: revisa el periodo'; end if;
  select count(*) into v_n from public.cash_movements
   where cash_box_id = b.id and deleted_at is null and kind = 'gasto' and rendicion_id is null and status in ('registrado', 'observado')
     and occurred_on between p_desde and p_hasta;
  if v_n = 0 then raise exception 'SIGOV: no hay gastos por rendir en ese periodo'; end if;
  insert into public.rendiciones (service_id, numero, cash_box_id, crew_id, desde, hasta, responsable_id, nota, creado_por)
  values (b.service_id, public.ssoma_siguiente(b.service_id, 'rendiciones'), b.id, b.crew_id, p_desde, p_hasta, b.holder_id, nullif(trim(p_nota), ''), auth.uid())
  returning id, codigo into v_id, v_cod;
  update public.cash_movements set rendicion_id = v_id
   where cash_box_id = b.id and deleted_at is null and kind = 'gasto' and rendicion_id is null and status in ('registrado', 'observado')
     and occurred_on between p_desde and p_hasta;
  return json_build_object('id', v_id, 'codigo', v_cod, 'gastos', v_n);
end $$;
grant execute on function public.rendicion_generar(uuid, date, date, text) to authenticated;

/** Aprobar u observar una rendición. Solo administración/residente y nunca el propio responsable. */
create or replace function public.rendicion_revisar(p_rend uuid, p_aprobar boolean, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare r public.rendiciones;
begin
  select * into r from public.rendiciones where id = p_rend for update;
  if not found then raise exception 'SIGOV: la rendición no existe'; end if;
  if public.role_in(r.service_id) not in ('admin', 'residente') then
    raise exception 'SIGOV: solo personal autorizado aprueba rendiciones' using errcode = '42501';
  end if;
  if auth.uid() in (r.responsable_id, r.creado_por) then raise exception 'SIGOV: nadie aprueba su propia rendición' using errcode = '42501'; end if;
  if r.estado = 'aprobada' then raise exception 'SIGOV: la rendición ya está aprobada'; end if;
  if not p_aprobar and nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la observación'; end if;
  if length(coalesce(trim(p_motivo), '')) > 500 then raise exception 'SIGOV: el motivo admite hasta 500 caracteres'; end if;
  perform set_config('sigov.motivo', coalesce(trim(p_motivo), ''), true);
  update public.cash_movements set status = case when p_aprobar then 'aprobado'::cash_movement_status else 'observado'::cash_movement_status end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_motivo), '')
   where rendicion_id = r.id and deleted_at is null and status in ('registrado', 'observado');
  update public.rendiciones set estado = case when p_aprobar then 'aprobada' else 'observada' end, motivo = nullif(trim(p_motivo), ''),
         revisado_por = auth.uid(), revisado_at = now()
   where id = r.id;
  perform set_config('sigov.motivo', '', true);
  if r.responsable_id is not null then
    perform public.aviso_vivo(r.service_id, r.responsable_id, 'rendicion_revisada', 'rnd:' || r.id,
      format('Rendición %s %s', r.codigo, case when p_aprobar then 'aprobada' else 'observada' end),
      coalesce(nullif(trim(p_motivo), ''), 'Revisada por administración.'), '/caja', case when p_aprobar then 'info' else 'warning' end, jsonb_build_object('rendicion_id', r.id));
  end if;
  return json_build_object('estado', case when p_aprobar then 'aprobada' else 'observada' end);
end $$;
grant execute on function public.rendicion_revisar(uuid, boolean, text) to authenticated;

-- ─── Conciliaciones ───────────────────────────────────────────────────────
create table if not exists public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  numero integer not null,
  codigo text generated always as ('CON-' || lpad(numero::text, 3, '0')) stored,
  cash_box_id uuid references public.cash_boxes(id),
  desde date not null,
  hasta date not null,
  fondo numeric(14,2) not null default 0,
  sustentado numeric(14,2) not null default 0,
  pendiente numeric(14,2) not null default 0,
  declarado numeric(14,2) not null default 0,
  diferencia numeric(14,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  motivo text,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp(),
  unique (service_id, numero)
);
alter table public.conciliaciones enable row level security;
drop policy if exists conciliaciones_select on public.conciliaciones;
create policy conciliaciones_select on public.conciliaciones for select to authenticated
  using ((service_id in (select public.mis_servicios()) and public.role_in(service_id) in ('admin', 'residente')) or public.is_platform_admin());
grant select on public.conciliaciones to authenticated;

/** Lo que entra a la conciliación de una caja (o de todas) en un periodo. */
create or replace function public.caja_periodo(p_service uuid, p_box uuid, p_desde date, p_hasta date)
returns json language sql stable security definer set search_path to 'public' as $$
  with m as (
    select m.*, b.name caja, c.name cuadrilla
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id left join public.crews c on c.id = b.crew_id
     where m.service_id = p_service and m.deleted_at is null and m.status <> 'anulado' and (p_box is null or m.cash_box_id = p_box)
       and m.occurred_on between p_desde and p_hasta
       and public.role_in(p_service) in ('admin', 'residente', 'supervisor')
  )
  select json_build_object(
    'fondo', (select coalesce(sum(amount), 0) from m where kind in ('apertura', 'deposito')),
    'sustentado', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status = 'aprobado'),
    'pendiente', (select coalesce(sum(amount), 0) from m where kind = 'gasto' and status in ('registrado', 'observado')),
    'disponible', (select coalesce(sum(balance), 0) from public.v_cash_boxes where service_id = p_service and (p_box is null or id = p_box)),
    'movimientos', (select coalesce(json_agg(json_build_object('id', id, 'fecha', occurred_on, 'caja', caja, 'cuadrilla', cuadrilla, 'tipo', kind, 'concepto', coalesce(category, description),
                      'descripcion', description, 'comprobante', coalesce(receipt_kind::text, 'Interno'), 'numero', receipt_number, 'monto', amount, 'estado', status,
                      'sustentado', case when kind = 'gasto' and status = 'aprobado' then amount else 0 end,
                      'pendiente', case when kind = 'gasto' and status in ('registrado', 'observado') then amount else 0 end,
                      'rendicion_id', rendicion_id, 'archivo', storage_path) order by occurred_on desc, created_at desc), '[]'::json) from m)
  )
$$;
grant execute on function public.caja_periodo(uuid, uuid, date, date) to authenticated;

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
  insert into public.conciliaciones (service_id, numero, cash_box_id, desde, hasta, fondo, sustentado, pendiente, declarado, diferencia, items, motivo, quien)
  values (p_service, public.ssoma_siguiente(p_service, 'conciliaciones'), p_box, p_desde, p_hasta, (v->>'fondo')::numeric, (v->>'sustentado')::numeric,
          (v->>'pendiente')::numeric, v_decl, round(v_dif, 2), coalesce(p_items, '[]'::jsonb), nullif(trim(p_motivo), ''), auth.uid())
  returning id, codigo into v_id, v_cod;
  return json_build_object('id', v_id, 'codigo', v_cod, 'diferencia', round(v_dif, 2));
end $$;
grant execute on function public.conciliacion_guardar(uuid, uuid, date, date, jsonb, text) to authenticated;

-- ─── Recursos: asignación de vehículo sin solapes ─────────────────────────
create or replace function public.asignacion_verificar(p_vehicle uuid, p_crew uuid, p_desde date, p_hasta date)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'conflictos', (select coalesce(json_agg(json_build_object('cuadrilla', c.name, 'tipo', a.kind, 'desde', a.start_on, 'hasta', a.end_on)), '[]'::json)
                     from public.crew_vehicle_assignments a join public.crews c on c.id = a.crew_id
                    where a.vehicle_id = p_vehicle and a.crew_id is distinct from p_crew
                      and daterange(a.start_on, coalesce(a.end_on, 'infinity'::date), '[]') && daterange(p_desde, coalesce(p_hasta, 'infinity'::date), '[]')),
    'de_la_cuadrilla', (select count(*) from public.crew_vehicle_assignments a where a.crew_id = p_crew and a.end_on is null),
    'vehiculo', (select json_build_object('estado', v.status, 'soat', v.soat_expires_on, 'revision', v.inspection_expires_on, 'poliza', v.policy_expires_on,
                                          'validacion', v.validation_status) from public.vehicles v where v.id = p_vehicle)
  )
$$;
grant execute on function public.asignacion_verificar(uuid, uuid, date, date) to authenticated;

create or replace function public.asignacion_guardar(p_vehicle uuid, p_crew uuid, p_kind text, p_desde date, p_hasta date, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v public.vehicles; c json; v_id uuid;
begin
  select * into v from public.vehicles where id = p_vehicle and deleted_at is null;
  if not found then raise exception 'SIGOV: el vehículo no existe'; end if;
  if not public.es_admin(v.service_id) then raise exception 'SIGOV: las asignaciones de recursos las hace el Administrador' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo de la asignación'; end if;
  if p_desde is null or (p_hasta is not null and p_hasta < p_desde) then raise exception 'SIGOV: revisa las fechas'; end if;
  c := public.asignacion_verificar(p_vehicle, p_crew, p_desde, p_hasta);
  if json_array_length(c->'conflictos') > 0 then
    raise exception 'SIGOV: el vehículo ya está asignado a % en esas fechas (asignación en conflicto)', (c->'conflictos'->0->>'cuadrilla');
  end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  insert into public.crew_vehicle_assignments (service_id, vehicle_id, crew_id, kind, start_on, end_on, reason)
  values (v.service_id, p_vehicle, p_crew, coalesce(p_kind, 'titular'), p_desde, p_hasta, trim(p_motivo))
  returning id into v_id;
  update public.vehicles set crew_id = p_crew, updated_at = now() where id = p_vehicle and (p_hasta is null or p_hasta >= public.hoy_peru());
  perform set_config('sigov.motivo', '', true);
  return json_build_object('id', v_id);
end $$;
grant execute on function public.asignacion_guardar(uuid, uuid, text, date, date, text) to authenticated;

-- ─── Configuración del contrato con versiones ─────────────────────────────
create table if not exists public.contrato_versiones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  version integer not null,
  datos jsonb not null,
  motivo text not null,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default clock_timestamp(),
  unique (service_id, version)
);
alter table public.contrato_versiones enable row level security;
drop policy if exists contrato_versiones_select on public.contrato_versiones;
create policy contrato_versiones_select on public.contrato_versiones for select to authenticated using (public.es_admin(service_id) or public.is_platform_admin());
grant select on public.contrato_versiones to authenticated;
insert into public.contrato_versiones (service_id, version, datos, motivo, quien, cuando)
select s.id, 1, jsonb_build_object('name', s.name, 'code', s.code, 'client_name', s.client_name, 'contract_code', s.contract_code, 'description', s.description,
       'starts_on', s.starts_on, 'ends_on', s.ends_on, 'status', s.status, 'zona_horaria', coalesce(s.settings->>'zona_horaria', 'America/Lima'),
       'operador', s.settings->>'operador'), 'Versión inicial', null, s.created_at
  from public.services s where not exists (select 1 from public.contrato_versiones v where v.service_id = s.id);

create or replace function public.contrato_guardar(p_service uuid, p_datos jsonb, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_ver int; s public.services;
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador edita el contrato' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo: el cambio se guarda como nueva versión'; end if;
  if (p_datos->>'ends_on')::date < (p_datos->>'starts_on')::date then raise exception 'SIGOV: el fin de la vigencia no puede ser anterior al inicio'; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.services set
    name = coalesce(nullif(trim(p_datos->>'name'), ''), name), client_name = coalesce(nullif(trim(p_datos->>'client_name'), ''), client_name),
    contract_code = coalesce(nullif(trim(p_datos->>'contract_code'), ''), contract_code), description = coalesce(p_datos->>'description', description),
    starts_on = coalesce((p_datos->>'starts_on')::date, starts_on), ends_on = coalesce((p_datos->>'ends_on')::date, ends_on),
    settings = coalesce(settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('zona_horaria', p_datos->>'zona_horaria', 'operador', p_datos->>'operador')),
    updated_at = now()
   where id = p_service returning * into s;
  perform set_config('sigov.motivo', '', true);
  select coalesce(max(version), 0) + 1 into v_ver from public.contrato_versiones where service_id = p_service;
  insert into public.contrato_versiones (service_id, version, datos, motivo, quien)
  values (p_service, v_ver, jsonb_build_object('name', s.name, 'code', s.code, 'client_name', s.client_name, 'contract_code', s.contract_code, 'description', s.description,
          'starts_on', s.starts_on, 'ends_on', s.ends_on, 'status', s.status, 'zona_horaria', coalesce(s.settings->>'zona_horaria', 'America/Lima'), 'operador', s.settings->>'operador'),
          trim(p_motivo), auth.uid());
  return json_build_object('version', v_ver);
end $$;
grant execute on function public.contrato_guardar(uuid, jsonb, text) to authenticated;

-- ─── Alertas del sistema ──────────────────────────────────────────────────
create table if not exists public.alertas_atendidas (
  service_id uuid not null references public.services(id) on delete cascade,
  clave text not null,
  quien uuid references public.profiles(id),
  cuando timestamptz not null default now(),
  nota text,
  primary key (service_id, clave)
);
alter table public.alertas_atendidas enable row level security;
drop policy if exists alertas_atendidas_select on public.alertas_atendidas;
create policy alertas_atendidas_select on public.alertas_atendidas for select to authenticated using (public.es_admin(service_id));
grant select on public.alertas_atendidas to authenticated;

create or replace function public.alertas_sistema(p_service uuid)
returns json language sql stable security definer set search_path to 'public', 'auth' as $$
  with a as (
    -- Sincronización fallida (último envío con error, 48 h)
    select 'sync:' || s.profile_id || ':' || s.device_id clave, 'critica' severidad, 'Sincronización fallida' titulo,
           format('El equipo de %s no pudo enviar %s registros.', p.full_name, s.failed_count) descripcion, s.finished_at cuando, 'Sincronización' tipo,
           coalesce(s.device_label, s.device_id) referencia, 'Reintentar' accion, '/sincronizacion' url
      from (select distinct on (profile_id, device_id) * from public.sync_sessions where service_id = p_service and started_at > now() - interval '48 hours'
             order by profile_id, device_id, started_at desc) s join public.profiles p on p.id = s.profile_id where s.failed_count > 0
    union all
    -- Usuario bloqueado (vigente)
    select 'bloq:' || u.id, 'critica', 'Usuario bloqueado', format('%s superó el número de intentos de acceso y fue bloqueado.', p.full_name),
           (select max(cuando) from public.accesos x where x.profile_id = u.id and x.evento = 'bloqueado'), 'Usuario', split_part(p.email, '@', 1), 'Desbloquear', '/gestion/usuarios'
      from auth.users u join public.profiles p on p.id = u.id join public.service_members m on m.profile_id = u.id and m.service_id = p_service
     where u.banned_until > now() and p.is_active
    union all
    -- Saldo bajo en caja
    select 'caja:' || b.id, 'critica', 'Saldo bajo en caja presupuestal', format('La caja %s tiene saldo S/ %s, bajo el umbral S/ %s.', b.name, round(b.balance, 2), b.low_balance_threshold),
           b.last_movement_on::timestamptz, 'Presupuesto', b.name, 'Escalar', '/caja'
      from public.v_cash_boxes b where b.service_id = p_service and b.is_active and b.low_balance_threshold is not null and b.balance < b.low_balance_threshold
    union all
    -- Cuadrilla sin supervisor
    select 'sup:' || c.id, 'pendiente', 'Cuadrilla sin supervisor asignado', format('La cuadrilla %s no tiene supervisor asignado.', c.name), c.updated_at, 'Cuadrilla', c.code, 'Asignar', '/gestion/cuadrillas'
      from public.crews c where c.service_id = p_service and c.deleted_at is null and c.is_active and c.supervisor_id is null
    union all
    -- Ítems PCI vencidos (resumen)
    select 'pci:venc', 'pendiente', 'Ítems PCI vencidos', format('Existen %s ítems del PCI con fecha de vencimiento superada.', count(*)), max(i.due_date)::timestamptz, 'PCI', count(*) || ' ítems', 'Actualizar', '/pci'
      from public.pci_items i where i.service_id = p_service and i.deleted_at is null and i.due_date < public.hoy_peru() and i.status in ('pendiente', 'en_atencion', 'observado')
    having count(*) > 0
    union all
    -- Evidencia incompleta en ítems atendidos
    select 'ev:' || i.id, 'pendiente', 'Evidencia incompleta', format('El ítem %s del %s no cuenta con las tres fases de foto.', i.item_number, p.code), i.updated_at, 'Actividad',
           p.code || ' / ítem ' || i.item_number, 'Completar', '/pci/' || i.pci_id || '/item/' || i.id
      from public.pci_items i join public.pcis p on p.id = i.pci_id
     where i.service_id = p_service and i.deleted_at is null and i.status in ('levantado', 'subsanado') and cardinality(public.pci_item_fases_faltantes(i.id)) > 0
    union all
    -- Mantenimiento de vehículo próximo
    select 'mant:' || v.id, 'informativa', 'Mantenimiento pendiente de vehículo', format('El vehículo %s tiene mantenimiento preventivo el %s.', coalesce(v.code, v.plate), to_char(v.next_service_on, 'DD/MM/YYYY')),
           v.next_service_on::timestamptz, 'Vehículo', coalesce(v.code, v.plate), 'Programar', '/vencimientos'
      from public.vehicles v where v.service_id = p_service and v.deleted_at is null and v.next_service_on between public.hoy_peru() - 30 and public.hoy_peru() + 7
    union all
    -- Gastos sin rendición hace más de 7 días
    select 'rend:' || b.id, 'informativa', 'Ausencia de rendición', format('La caja %s tiene %s gastos de más de 7 días sin rendición.', b.name, count(*)), min(m.occurred_on)::timestamptz,
           'Rendición', b.name, 'Registrar', '/caja?tab=rendiciones'
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id
     where m.service_id = p_service and m.deleted_at is null and m.kind = 'gasto' and m.rendicion_id is null and m.status = 'registrado' and m.occurred_on < public.hoy_peru() - 7
     group by b.id, b.name
  )
  select coalesce(json_agg(json_build_object('clave', a.clave, 'severidad', case when t.clave is not null then 'resuelta' else a.severidad end, 'titulo', a.titulo,
           'descripcion', a.descripcion, 'cuando', a.cuando, 'tipo', a.tipo, 'referencia', a.referencia, 'accion', a.accion, 'url', a.url,
           'atendida_at', t.cuando) order by (t.clave is not null), case a.severidad when 'critica' then 0 when 'pendiente' then 1 else 2 end, a.cuando desc nulls last), '[]'::json)
    from a left join public.alertas_atendidas t on t.service_id = p_service and t.clave = a.clave
   where public.es_admin(p_service)
$$;
grant execute on function public.alertas_sistema(uuid) to authenticated;

create or replace function public.alerta_atender(p_service uuid, p_clave text, p_nota text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.es_admin(p_service) then raise exception 'SIGOV: solo el Administrador' using errcode = '42501'; end if;
  insert into public.alertas_atendidas (service_id, clave, quien, nota) values (p_service, p_clave, auth.uid(), nullif(trim(p_nota), ''))
  on conflict (service_id, clave) do update set quien = auth.uid(), cuando = now(), nota = excluded.nota;
  return json_build_object('ok', true);
end $$;
grant execute on function public.alerta_atender(uuid, text, text) to authenticated;
