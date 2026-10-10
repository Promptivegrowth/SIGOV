-- ═══════════════════════════════════════════════════════════════════════
-- 0088 · Los equipos de seguridad: los administra SSOMA (OBS-61 a OBS-63)
--
-- Hasta ahora cualquier usuario con escritura (también el jefe de cuadrilla)
-- podía crear, editar o «renovar» un extintor por API, y veía e inspeccionaba
-- los de todo el contrato. Elvis: el jefe ve solo los de su cuadrilla, con
-- sus vencimientos; el inventario, las fechas y las bajas son de SSOMA.
--
-- · Ver: el jefe de cuadrilla, solo los equipos de su cuadrilla y sus
--   inspecciones; los demás roles, todo el contrato.
-- · Inspeccionar: el jefe, solo equipos de su cuadrilla; SSOMA, cualquiera.
-- · Alta, edición, renovación y baja: admin, supervisor e ing. de seguridad.
-- ═══════════════════════════════════════════════════════════════════════

-- ¿Este usuario puede ver/inspeccionar el equipo? (para las políticas)
create or replace function public.equipo_a_mi_alcance(p_service_id uuid, p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_member(p_service_id)
     and (public.role_in(p_service_id) is distinct from 'jefe_cuadrilla'
          or p_crew_id = any(coalesce(public.mis_cuadrillas(p_service_id), '{}'::uuid[])))
$$;

grant execute on function public.equipo_a_mi_alcance(uuid, uuid) to authenticated;

-- ─── Equipos ───────────────────────────────────────────────────────────
drop policy if exists safety_equipment_select on public.safety_equipment;
create policy safety_equipment_select on public.safety_equipment for select to authenticated
  using (public.equipo_a_mi_alcance(service_id, crew_id));

drop policy if exists safety_equipment_insert on public.safety_equipment;
create policy safety_equipment_insert on public.safety_equipment for insert to authenticated
  with check (public.puede_revisar_ssoma(service_id));

drop policy if exists safety_equipment_update on public.safety_equipment;
create policy safety_equipment_update on public.safety_equipment for update to authenticated
  using (public.puede_revisar_ssoma(service_id)) with check (public.puede_revisar_ssoma(service_id));

drop policy if exists safety_equipment_delete on public.safety_equipment;
create policy safety_equipment_delete on public.safety_equipment for delete to authenticated
  using (public.puede_revisar_ssoma(service_id));

-- ─── Inspecciones ──────────────────────────────────────────────────────
drop policy if exists safety_equipment_checks_select on public.safety_equipment_checks;
create policy safety_equipment_checks_select on public.safety_equipment_checks for select to authenticated
  using (exists (select 1 from public.safety_equipment e
                  where e.id = equipment_id and public.equipo_a_mi_alcance(e.service_id, e.crew_id)));

drop policy if exists safety_equipment_checks_insert on public.safety_equipment_checks;
create policy safety_equipment_checks_insert on public.safety_equipment_checks for insert to authenticated
  with check (public.can_write(service_id)
              and exists (select 1 from public.safety_equipment e
                           where e.id = equipment_id and e.service_id = service_id
                             and public.equipo_a_mi_alcance(e.service_id, e.crew_id)));

-- Cerrar observaciones o corregir una inspección es de SSOMA
drop policy if exists safety_equipment_checks_update on public.safety_equipment_checks;
create policy safety_equipment_checks_update on public.safety_equipment_checks for update to authenticated
  using (public.puede_revisar_ssoma(service_id)) with check (public.puede_revisar_ssoma(service_id));

drop policy if exists safety_equipment_checks_delete on public.safety_equipment_checks;
create policy safety_equipment_checks_delete on public.safety_equipment_checks for delete to authenticated
  using (public.puede_revisar_ssoma(service_id));
