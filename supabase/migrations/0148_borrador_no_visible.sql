-- ═══════════════════════════════════════════════════════════════════════════
-- 0148 · La programación en borrador no se muestra a la cuadrilla ni al
--        Visor (revisión visual 18/11, repaso final: MRPCI_01 «No publicado
--        a cuadrilla», J02). Supervisor, Residente y Administrador sí la ven.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.semana_publicada(p_plan uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select status <> 'borrador' from public.weekly_plans where id = p_plan), true)
$$;
grant execute on function public.semana_publicada(uuid) to authenticated;

drop policy if exists plan_items_select on public.plan_items;
create policy plan_items_select on public.plan_items for select to authenticated
  using (((service_id in (select public.mis_servicios()))
          and ((crew_id is null) or (crew_id in (select public.cuadrillas_visibles())))
          and (public.role_in(service_id) not in ('jefe_cuadrilla', 'visor') or plan_id is null or public.semana_publicada(plan_id)))
         or public.is_platform_admin());

drop policy if exists weekly_plans_select on public.weekly_plans;
create policy weekly_plans_select on public.weekly_plans for select to authenticated
  using (public.is_member(service_id) and (public.role_in(service_id) not in ('jefe_cuadrilla', 'visor') or status <> 'borrador'));
