-- ═══════════════════════════════════════════════════════════════════════
-- 0126 · Permisos según la matriz de funciones del 4.º entregable
--
-- Elvis (14/11) fijó qué hace cada rol. La auditoría encontró que la base
-- dejaba de más: casi todo se leía con ser miembro del contrato (también
-- el Visor COVINCA: caja, vehículos, SSOMA, costos), lo operativo se
-- escribía con can_write (también SSOMA, sin mirar la cuadrilla) y los
-- catálogos, usuarios, tramos y cajas con can_manage (supervisor y
-- residente). Ahora:
--
--   · Cuadrilla: el jefe lee y escribe lo de su cuadrilla; el supervisor,
--     lo de las cuadrillas que supervisa (CASO 27, 38); residente y
--     administrador, todo el contrato.
--   · SSOMA fuera de lo operativo: no escribe partes, avances, metrados,
--     intervenciones ni PCI (CASO 28). Revisa ATS, equipos y documentos.
--   · Visor COVINCA: no lee caja, vehículos, SSOMA interno ni costos
--     (CASO 25, 29).
--   · Solo el administrador: usuarios, catálogos, rendimientos, insumos,
--     almacenes, cuadrillas, tramos, sectores y cajas.
--   · Ejecutar una partida o un ítem PCI: solo el jefe de su cuadrilla.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Ayudantes ──────────────────────────────────────────────────────────
create or replace function public.es_admin(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) = 'admin'
$$;

-- Lo operativo de campo: partes, avances, metrados, intervenciones
create or replace function public.puede_campo(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) in ('admin', 'supervisor', 'residente', 'jefe_cuadrilla')
$$;

-- Las cuadrillas que el usuario ve, en todos sus contratos: todas si es
-- administrador, residente, SSOMA o visor; las suyas si es supervisor o jefe.
-- Sin parámetros: la política la evalúa una sola vez por consulta.
create or replace function public.cuadrillas_visibles()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select c.id
    from public.crews c
   where c.service_id in (select public.mis_servicios())
     and (public.role_in(c.service_id) not in ('supervisor', 'jefe_cuadrilla')
          or c.id = any(coalesce(public.mis_cuadrillas(c.service_id), '{}'::uuid[])))
$$;

-- Escribir lo de una cuadrilla: el jefe la suya, el supervisor las que
-- supervisa (y lo que aún no tiene cuadrilla), residente y admin todas.
create or replace function public.cuadrilla_a_mi_cargo(sid uuid, crew uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case public.role_in(sid)
    when 'admin' then true
    when 'residente' then true
    when 'supervisor' then crew is null or crew = any(coalesce(public.mis_cuadrillas(sid), '{}'::uuid[]))
    when 'jefe_cuadrilla' then crew is not null and crew = any(coalesce(public.mis_cuadrillas(sid), '{}'::uuid[]))
    else false
  end
$$;

-- Revisar, validar u observar lo de una cuadrilla: residente y admin todo,
-- el supervisor solo sus cuadrillas (CASO 38)
create or replace function public.revisa_cuadrilla(sid uuid, crew uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case public.role_in(sid)
    when 'admin' then true
    when 'residente' then true
    when 'supervisor' then crew is null or crew = any(coalesce(public.mis_cuadrillas(sid), '{}'::uuid[]))
    else false
  end
$$;

-- El Visor no ve lo interno de SERVICON
create or replace function public.ve_lo_interno(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_member(sid) and public.role_in(sid) is distinct from 'visor'
$$;

-- La caja: ni el Visor ni SSOMA; el jefe solo la de su cuadrilla
create or replace function public.ve_caja(sid uuid, crew uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case public.role_in(sid)
    when 'admin' then true
    when 'residente' then true
    when 'supervisor' then true
    when 'jefe_cuadrilla' then crew = any(coalesce(public.mis_cuadrillas(sid), '{}'::uuid[]))
    else false
  end
$$;

-- La cuadrilla de una foto: la de su parte o la de su ítem PCI
create or replace function public.cuadrilla_de_evidencia(p_evidencia uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select wo.crew_id from public.evidences e
       join public.work_entries we on we.id = e.work_entry_id
       join public.work_orders wo on wo.id = we.work_order_id
      where e.id = p_evidencia),
    (select pi.assigned_crew_id from public.evidences e
       join public.pci_items pi on pi.id = e.pci_item_id
      where e.id = p_evidencia))
$$;

-- SSOMA revisa; ya no el supervisor ni el residente (matriz: monitorean)
create or replace function public.puede_revisar_ssoma(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) in ('admin', 'ing_seguridad')
$$;

-- Registrar formatos SSOMA de campo (ATS, charla, higiene, checklist):
-- el jefe, SSOMA y el administrador
create or replace function public.puede_ssoma_campo(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.role_in(sid) in ('admin', 'ing_seguridad', 'jefe_cuadrilla')
$$;

-- Ejecutar: solo el jefe de la cuadrilla (matriz: «Ejecutar PCI / actividad»)
create or replace function public.puede_atender_item(p_item public.pci_items)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin()
      or (public.role_in(p_item.service_id) = 'jefe_cuadrilla'
          and p_item.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_item.service_id), '{}'::uuid[])))
$$;

create or replace function public.puedo_mover_partida(p_service_id uuid, p_crew_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin()
      or (public.role_in(p_service_id) = 'jefe_cuadrilla'
          and p_crew_id is not null
          and p_crew_id = any(coalesce(public.mis_cuadrillas(p_service_id), '{}'::uuid[])))
$$;

create or replace function public.puede_llevar_parte(p public.work_orders)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.cuadrilla_a_mi_cargo(p.service_id, p.crew_id)
$$;

create or replace function public.puede_llevar_cuadrilla(p_crew uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.crews c
                  where c.id = p_crew and public.cuadrilla_a_mi_cargo(c.service_id, c.id))
$$;

-- El Visor tampoco ve los equipos SSOMA
create or replace function public.equipo_a_mi_alcance(p_service_id uuid, p_crew_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.ve_lo_interno(p_service_id)
     and (public.role_in(p_service_id) is distinct from 'jefe_cuadrilla'
          or p_crew_id = any(coalesce(public.mis_cuadrillas(p_service_id), '{}'::uuid[])))
$$;

-- ─── Un ayudante para reescribir políticas ─────────────────────────────
create or replace function pg_temp.politica(p_tabla text, p_nombre text, p_cmd text, p_using text, p_check text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_nombre, p_tabla);
  execute format('create policy %I on public.%I for %s to authenticated%s%s', p_nombre, p_tabla, p_cmd,
    case when p_using is null then '' else ' using (' || p_using || ')' end,
    case when p_check is null then '' else ' with check (' || p_check || ')' end);
end $$;

-- ─── Lo operativo, por cuadrilla ────────────────────────────────────────
select pg_temp.politica('plan_items', 'plan_items_select', 'select',
  '(service_id in (select public.mis_servicios()) and (crew_id is null or crew_id in (select public.cuadrillas_visibles()))) or public.is_platform_admin()', null);
select pg_temp.politica('plan_items', 'plan_items_update', 'update',
  'public.can_manage(service_id) and public.cuadrilla_a_mi_cargo(service_id, crew_id)',
  'public.can_manage(service_id) and public.cuadrilla_a_mi_cargo(service_id, crew_id)');

select pg_temp.politica('work_orders', 'work_orders_select', 'select',
  '(service_id in (select public.mis_servicios()) and (crew_id is null or crew_id in (select public.cuadrillas_visibles()))) or public.is_platform_admin()', null);
select pg_temp.politica('work_orders', 'work_orders_insert', 'insert', null, 'public.cuadrilla_a_mi_cargo(service_id, crew_id)');
select pg_temp.politica('work_orders', 'work_orders_update', 'update',
  'public.cuadrilla_a_mi_cargo(service_id, crew_id)', 'public.cuadrilla_a_mi_cargo(service_id, crew_id)');
select pg_temp.politica('work_orders', 'work_orders_delete', 'delete', 'public.revisa_cuadrilla(service_id, crew_id)', null);

-- Un avance va en un parte a mi cargo, y si es de un ítem PCI asignado, a la
-- cuadrilla del ítem (CASO 36: la cuadrilla anterior ya no lo toca)
select pg_temp.politica('work_entries', 'work_entries_select', 'select',
  'work_order_id in (select wo.id from public.work_orders wo) or public.is_platform_admin()', null);
select pg_temp.politica('work_entries', 'work_entries_insert', 'insert', null,
  $p$public.puede_campo(service_id)
     and exists (select 1 from public.work_orders wo where wo.id = work_order_id
                  and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id)
                  and (pci_item_id is null or exists (select 1 from public.pci_items pi
                        where pi.id = pci_item_id and (pi.assigned_crew_id is null or pi.assigned_crew_id = wo.crew_id))))$p$);
select pg_temp.politica('work_entries', 'work_entries_update', 'update',
  $p$public.puede_campo(service_id)
     and exists (select 1 from public.work_orders wo where wo.id = work_order_id
                  and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))$p$,
  $p$public.puede_campo(service_id)
     and exists (select 1 from public.work_orders wo where wo.id = work_order_id
                  and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id)
                  and (pci_item_id is null or exists (select 1 from public.pci_items pi
                        where pi.id = pci_item_id and (pi.assigned_crew_id is null or pi.assigned_crew_id = wo.crew_id))))$p$);

select pg_temp.politica('parte_recursos', 'parte_recursos_select', 'select',
  'work_order_id in (select wo.id from public.work_orders wo) or public.is_platform_admin()', null);
select pg_temp.politica('parte_recursos', 'parte_recursos_insert', 'insert', null,
  'public.puede_campo(service_id) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))');
select pg_temp.politica('parte_recursos', 'parte_recursos_update', 'update',
  'public.puede_campo(service_id) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))',
  'public.puede_campo(service_id) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))');

select pg_temp.politica('pci_items', 'pci_items_select', 'select',
  '(pci_id in (select public.pcis_visibles()) and (assigned_crew_id is null or assigned_crew_id in (select public.cuadrillas_visibles()))) or public.is_platform_admin()', null);
select pg_temp.politica('pci_items', 'pci_items_update', 'update',
  'public.can_manage(service_id) and public.cuadrilla_a_mi_cargo(service_id, assigned_crew_id)',
  'public.can_manage(service_id) and public.cuadrilla_a_mi_cargo(service_id, assigned_crew_id)');

select pg_temp.politica('movimientos_cuadrilla', 'movimientos_cuadrilla_select', 'select',
  '(service_id in (select public.mis_servicios()) and (crew_id is null or crew_id in (select public.cuadrillas_visibles()))) or public.is_platform_admin()', null);

-- Fotos: lo de un parte o un ítem PCI, solo quien lo tiene a cargo
select pg_temp.politica('evidences', 'ev_insert', 'insert', null,
  $p$public.can_write(service_id)
     and (work_entry_id is null or (public.puede_campo(service_id) and exists (
           select 1 from public.work_entries we join public.work_orders wo on wo.id = we.work_order_id
            where we.id = work_entry_id and public.cuadrilla_a_mi_cargo(wo.service_id, wo.crew_id))))
     and (pci_item_id is null or (public.puede_campo(service_id) and exists (
           select 1 from public.pci_items pi
            where pi.id = pci_item_id and public.cuadrilla_a_mi_cargo(pi.service_id, pi.assigned_crew_id))))$p$);

select pg_temp.politica('asset_interventions', 'asset_interventions_insert', 'insert', null, 'public.puede_campo(service_id)');
select pg_temp.politica('asset_interventions', 'asset_interventions_update', 'update', 'public.puede_campo(service_id)', 'public.puede_campo(service_id)');

-- ─── Caja: ni el Visor ni SSOMA; la administra el administrador ────────
select pg_temp.politica('cash_boxes', 'cash_boxes_select', 'select', 'public.ve_caja(service_id, crew_id) or public.is_platform_admin()', null);
select pg_temp.politica('cash_boxes', 'cash_boxes_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('cash_boxes', 'cash_boxes_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('cash_boxes', 'cash_boxes_delete', 'delete', 'public.es_admin(service_id)', null);

select pg_temp.politica('cash_movements', 'cash_movements_select', 'select',
  'cash_box_id in (select b.id from public.cash_boxes b) or public.is_platform_admin()', null);
select pg_temp.politica('cash_movements', 'cash_movements_insert', 'insert', null,
  $p$public.es_admin(service_id)
     or (public.role_in(service_id) = 'jefe_cuadrilla' and cash_box_id in (select b.id from public.cash_boxes b))$p$);
select pg_temp.politica('cash_movements', 'cash_movements_update', 'update',
  'public.es_admin(service_id) or (created_by = auth.uid() and public.role_in(service_id) = ''jefe_cuadrilla'')',
  'public.es_admin(service_id) or (created_by = auth.uid() and public.role_in(service_id) = ''jefe_cuadrilla'')');
select pg_temp.politica('cash_movements', 'cash_movements_delete', 'delete', 'public.es_admin(service_id)', null);

-- Los depósitos los piden el jefe y el supervisor; los atiende el administrador (P47)
select pg_temp.politica('deposit_requests', 'deposit_requests_select', 'select',
  'public.es_admin(service_id) or created_by = auth.uid() or public.role_in(service_id) in (''supervisor'', ''residente'')', null);
select pg_temp.politica('deposit_requests', 'deposit_requests_insert', 'insert', null,
  'public.role_in(service_id) in (''admin'', ''supervisor'', ''jefe_cuadrilla'')');
select pg_temp.politica('deposit_requests', 'deposit_requests_update', 'update',
  'public.es_admin(service_id) or created_by = auth.uid()', 'public.es_admin(service_id) or created_by = auth.uid()');
select pg_temp.politica('deposit_requests', 'deposit_requests_delete', 'delete', 'public.es_admin(service_id)', null);

-- ─── Vehículos y SSOMA: no son del Visor ────────────────────────────────
select pg_temp.politica('vehicles', 'vehicles_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('vehicles', 'vehicles_delete', 'delete', 'public.es_admin(service_id)', null);
select pg_temp.politica('vehicle_checks', 'vehicle_checks_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('vehicle_checks', 'vehicle_checks_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('vehicle_checks', 'vehicle_checks_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('crew_vehicle_assignments', 'asignaciones_select', 'select', 'public.ve_lo_interno(service_id)', null);

select pg_temp.politica('ats_iperc', 'ats_iperc_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('ats_iperc', 'ats_iperc_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('ats_iperc', 'ats_iperc_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('ats_iperc', 'ats_iperc_delete', 'delete', 'public.puede_revisar_ssoma(service_id)', null);
select pg_temp.politica('ats_signatures', 'atssig_select', 'select',
  'exists (select 1 from public.ats_iperc a where a.id = ats_signatures.ats_id and public.ve_lo_interno(a.service_id))', null);
select pg_temp.politica('ats_signatures', 'atssig_write', 'all',
  'exists (select 1 from public.ats_iperc a where a.id = ats_signatures.ats_id and public.puede_ssoma_campo(a.service_id))',
  'exists (select 1 from public.ats_iperc a where a.id = ats_signatures.ats_id and public.puede_ssoma_campo(a.service_id))');

select pg_temp.politica('checklist_responses', 'checklist_responses_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('checklist_responses', 'checklist_responses_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('checklist_responses', 'checklist_responses_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('checklist_templates', 'checklist_templates_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('checklist_templates', 'checklist_templates_delete', 'delete', 'public.puede_revisar_ssoma(service_id)', null);

select pg_temp.politica('hygiene_checks', 'hygiene_checks_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('hygiene_checks', 'hygiene_checks_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('hygiene_checks', 'hygiene_checks_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');

select pg_temp.politica('safety_talks', 'safety_talks_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('safety_talks', 'safety_talks_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('safety_talks', 'safety_talks_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('talk_attendance', 'talk_attendance_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('talk_attendance', 'talk_attendance_insert', 'insert', null, 'public.puede_ssoma_campo(service_id)');
select pg_temp.politica('talk_attendance', 'talk_attendance_update', 'update', 'public.puede_ssoma_campo(service_id)', 'public.puede_ssoma_campo(service_id)');

select pg_temp.politica('documentos_del_dia', 'documentos_del_dia_select', 'select', 'public.ve_lo_interno(service_id)', null);
select pg_temp.politica('documento_paginas', 'documento_paginas_select', 'select', 'public.ve_lo_interno(service_id)', null);

-- ─── Materiales: costos y almacén son internos ─────────────────────────
select pg_temp.politica('stock_movements', 'stock_movements_select', 'select',
  'public.ve_lo_interno(service_id) and public.role_in(service_id) is distinct from ''ing_seguridad''', null);
select pg_temp.politica('stock_movements', 'stock_movements_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('stock_movements', 'stock_movements_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('stock_movements', 'stock_movements_delete', 'delete', 'public.es_admin(service_id)', null);

-- El costo unitario sale de la tabla de insumos a una propia, que el Visor
-- y SSOMA no leen (información económica interna, CASO 29)
create table if not exists public.supply_costs (
  supply_id uuid primary key references public.supplies(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  unit_cost numeric(12,2),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
alter table public.supply_costs enable row level security;
select pg_temp.politica('supply_costs', 'supply_costs_select', 'select',
  'public.ve_lo_interno(service_id) and public.role_in(service_id) is distinct from ''ing_seguridad''', null);
select pg_temp.politica('supply_costs', 'supply_costs_write', 'all', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
grant select, insert, update, delete on public.supply_costs to authenticated;

insert into public.supply_costs (supply_id, service_id, unit_cost)
select id, service_id, unit_cost from public.supplies where unit_cost is not null and service_id is not null
on conflict (supply_id) do update set unit_cost = excluded.unit_cost;

-- Lo que llegue a supplies.unit_cost pasa a supply_costs y no se guarda ahí
create or replace function public.t_costo_a_su_tabla()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.unit_cost is not null and new.service_id is not null then
    insert into public.supply_costs (supply_id, service_id, unit_cost, updated_by)
    values (new.id, new.service_id, new.unit_cost, auth.uid())
    on conflict (supply_id) do update set unit_cost = excluded.unit_cost, updated_at = now(), updated_by = auth.uid();
  end if;
  new.unit_cost := null;
  return new;
end $$;
drop trigger if exists t_costo_a_su_tabla on public.supplies;
create trigger t_costo_a_su_tabla before insert or update on public.supplies
  for each row execute function public.t_costo_a_su_tabla();
update public.supplies set unit_cost = null where unit_cost is not null;

-- ─── Solo el administrador ──────────────────────────────────────────────
select pg_temp.politica('service_members', 'sm_write', 'all', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('activities_catalog', 'activities_catalog_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('activities_catalog', 'activities_catalog_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('activities_catalog', 'activities_catalog_delete', 'delete', 'public.es_admin(service_id)', null);
select pg_temp.politica('rendimientos', 'rendimientos_escribir', 'all', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('supplies', 'supplies_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('supplies', 'supplies_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('supplies', 'supplies_delete', 'delete', 'public.es_admin(service_id)', null);
select pg_temp.politica('almacenes', 'almacenes_escribir', 'all', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('crews', 'crews_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('crews', 'crews_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('crews', 'crews_delete', 'delete', 'public.es_admin(service_id)', null);
select pg_temp.politica('crew_members', 'crew_members_write', 'all',
  'exists (select 1 from public.crews c where c.id = crew_members.crew_id and public.es_admin(c.service_id))',
  'exists (select 1 from public.crews c where c.id = crew_members.crew_id and public.es_admin(c.service_id))');
select pg_temp.politica('road_sections', 'road_sections_insert', 'insert', null, 'public.es_admin(service_id)');
select pg_temp.politica('road_sections', 'road_sections_update', 'update', 'public.es_admin(service_id)', 'public.es_admin(service_id)');
select pg_temp.politica('road_sections', 'road_sections_delete', 'delete', 'public.es_admin(service_id)', null);
select pg_temp.politica('service_sectors', 'service_sectors_write', 'all', 'public.es_admin(service_id)', 'public.es_admin(service_id)');

-- ─── Revisar: el supervisor solo sus cuadrillas (CASO 38); caja y SSOMA ─
CREATE OR REPLACE FUNCTION public.t_cash_movement_reglas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_uid uuid := auth.uid();

begin

  if v_uid is null or public.es_admin(coalesce(new.service_id, old.service_id)) then

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

end $function$;
CREATE OR REPLACE FUNCTION public.revisar_parte(p_id uuid, p_validar boolean, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.work_orders;
  v_lider uuid;
begin
  v := public.parte_por(p_id);
  if v.id is null then raise exception 'SIGOV: ese parte ya no existe'; end if;
  if not public.revisa_cuadrilla(v.service_id, v.crew_id) then
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente o el administrador validan u observan este parte' using errcode = '42501';
  end if;
  if v.status <> 'enviado' then
    raise exception 'SIGOV: el parte no está enviado (está %)', v.status;
  end if;
  if not p_validar and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;

  update public.work_orders
     set status = case when p_validar then 'validado'::public.work_order_status else 'observado'::public.work_order_status end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         review_notes = case when p_validar then review_notes else trim(p_nota) end,
         updated_at = now()
   where id = v.id;

  if not p_validar then
    select c.leader_id into v_lider from public.crews c where c.id = v.crew_id;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v.service_id, v_lider, 'parte_observado',
              format('Reporte diario del %s observado', to_char(v.work_date, 'DD/MM/YYYY')),
              trim(p_nota), '/campo/' || v.id, 'warning', jsonb_build_object('work_order_id', v.id));
    end if;
  end if;
  return json_build_object('estado', case when p_validar then 'validado' else 'observado' end);
end $function$;
CREATE OR REPLACE FUNCTION public.partida_validar(p_item uuid, p_aceptar boolean DEFAULT true, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila public.plan_items;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;

  -- Quien ejecuta no valida: si fueran el mismo, el control no existe
  if not public.revisa_cuadrilla(v_fila.service_id, v_fila.crew_id) then
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente o el administrador validan esta partida';
  end if;

  if v_fila.status <> 'por_validar' then
    raise exception 'SIGOV: la cuadrilla todavía no dio por terminada esta partida';
  end if;

  if p_aceptar then
    update public.plan_items
       set status = 'ejecutado',
           validated_at = now(),
           validated_by = auth.uid(),
           notes = coalesce(nullif(trim(p_nota), ''), notes)
     where id = p_item;
    return json_build_object('estado', 'ejecutado');
  end if;

  -- Devolver a campo: vuelve a estar en curso, con el motivo a la vista
  update public.plan_items
     set status = 'en_curso',
         finished_at = null,
         finished_by = null,
         impedimento = coalesce(nullif(trim(p_nota), ''), 'Devuelta por el supervisor'),
         impedimento_at = now(),
         impedimento_by = auth.uid()
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $function$;
CREATE OR REPLACE FUNCTION public.revisar_foto(p_evidencia uuid, p_conforme boolean, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v public.evidences;

  v_lider uuid;

  v_url text;

  v_que text;

begin

  select * into v from public.evidences where id = p_evidencia and deleted_at is null;

  if not found then raise exception 'SIGOV: esa foto ya no existe'; end if;

  if not (public.revisa_cuadrilla(v.service_id, public.cuadrilla_de_evidencia(v.id)) or public.role_in(v.service_id) = 'visor') then

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

end $function$;
CREATE OR REPLACE FUNCTION public.revisar_inspeccion_equipo(p_id uuid, p_estado text, p_nota text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  k public.safety_equipment_checks;

begin

  select * into k from public.safety_equipment_checks where id = p_id and deleted_at is null;

  if k.id is null then raise exception 'SIGOV: esa inspección ya no existe'; end if;

  if not public.puede_revisar_ssoma(k.service_id) then

    raise exception 'SIGOV: solo el Ingeniero SSOMA revisa las inspecciones' using errcode = '42501';

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

end $function$;
