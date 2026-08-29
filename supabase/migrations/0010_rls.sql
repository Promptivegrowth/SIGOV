-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0010 · Row Level Security
-- Aislamiento multi-tenant: NADIE ve datos de un servicio al que no pertenece.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Habilitar RLS en TODAS las tablas del esquema public ────────────────
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not in ('spatial_ref_sys')
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Tablas estándar con service_id
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  tables text[] := array[
    'activities_catalog','road_sections','crews',
    'weekly_plans','plan_items','plan_suspensions',
    'work_orders','work_entries',
    'pcis','pci_items',
    'road_assets','asset_interventions',
    'safety_talks','talk_attendance','checklist_templates','checklist_responses',
    'ats_iperc','import_batches','sync_sessions'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);

    execute format($f$
      create policy "%1$s_select" on public.%1$I for select to authenticated
      using (public.is_member(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_insert" on public.%1$I for insert to authenticated
      with check (public.can_write(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_update" on public.%1$I for update to authenticated
      using (public.can_write(service_id)) with check (public.can_write(service_id))$f$, t);

    execute format($f$
      create policy "%1$s_delete" on public.%1$I for delete to authenticated
      using (public.can_manage(service_id))$f$, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Tablas especiales
-- ═══════════════════════════════════════════════════════════════════════════

-- ── organizations ────────────────────────────────────────────────────────
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated
  using (true);
drop policy if exists org_write on public.organizations;
create policy org_write on public.organizations for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── profiles: veo mi perfil y el de quienes comparten un servicio conmigo ─
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.service_members a
      join public.service_members b on b.service_id = a.service_id
      where a.profile_id = auth.uid() and b.profile_id = public.profiles.id
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.is_platform_admin());

-- ── services ─────────────────────────────────────────────────────────────
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to authenticated
  using (public.is_member(id));

drop policy if exists services_write on public.services;
create policy services_write on public.services for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── service_members ──────────────────────────────────────────────────────
drop policy if exists sm_select on public.service_members;
create policy sm_select on public.service_members for select to authenticated
  using (profile_id = auth.uid() or public.is_member(service_id));

drop policy if exists sm_write on public.service_members;
create policy sm_write on public.service_members for all to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

-- ── crew_members (sin service_id: cuelga de crews) ───────────────────────
drop policy if exists cm_select on public.crew_members;
create policy cm_select on public.crew_members for select to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and public.is_member(c.service_id)));

drop policy if exists cm_write on public.crew_members;
create policy cm_write on public.crew_members for all to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and public.can_write(c.service_id)))
  with check (exists (select 1 from public.crews c where c.id = crew_id and public.can_write(c.service_id)));

-- ── ats_signatures ───────────────────────────────────────────────────────
drop policy if exists atssig_select on public.ats_signatures;
create policy atssig_select on public.ats_signatures for select to authenticated
  using (exists (select 1 from public.ats_iperc a where a.id = ats_id and public.is_member(a.service_id)));

drop policy if exists atssig_write on public.ats_signatures;
create policy atssig_write on public.ats_signatures for all to authenticated
  using (exists (select 1 from public.ats_iperc a where a.id = ats_id and public.can_write(a.service_id)))
  with check (exists (select 1 from public.ats_iperc a where a.id = ats_id and public.can_write(a.service_id)));

-- ── EVIDENCIAS: se insertan, NUNCA se borran ni se editan por campo ──────
drop policy if exists ev_select on public.evidences;
create policy ev_select on public.evidences for select to authenticated
  using (public.is_member(service_id));

drop policy if exists ev_insert on public.evidences;
create policy ev_insert on public.evidences for insert to authenticated
  with check (public.can_write(service_id));

-- Solo supervisión puede tocar metadatos NO geográficos (el trigger bloquea el resto)
drop policy if exists ev_update on public.evidences;
create policy ev_update on public.evidences for update to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

-- Sin política de DELETE = nadie borra evidencias. Solo soft-delete por admin:
drop policy if exists ev_delete on public.evidences;
create policy ev_delete on public.evidences for delete to authenticated
  using (public.is_platform_admin());

-- ── units / asset_types: catálogos globales de lectura ───────────────────
drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated using (true);
drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists at_select on public.asset_types;
create policy at_select on public.asset_types for select to authenticated using (true);
drop policy if exists at_write on public.asset_types;
create policy at_write on public.asset_types for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── audit_log: solo lectura para admin/supervisor ────────────────────────
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_platform_admin() or (service_id is not null and public.can_manage(service_id)));

-- ── notificaciones y push: solo lo propio ────────────────────────────────
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated
  with check (public.is_member(service_id));

drop policy if exists push_all on public.push_subscriptions;
create policy push_all on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── backups_log: solo admin ──────────────────────────────────────────────
drop policy if exists backups_select on public.backups_log;
create policy backups_select on public.backups_log for select to authenticated
  using (public.is_platform_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Permisos de ejecución de las funciones RPC
-- ═══════════════════════════════════════════════════════════════════════════
grant execute on function public.apply_pci_suspension(uuid)    to authenticated;
grant execute on function public.preview_pci_suspension(uuid)  to authenticated;
grant execute on function public.revert_pci_suspension(uuid)   to authenticated;
grant execute on function public.evaluate_pci_deadlines()      to authenticated, service_role;
grant execute on function public.pci_item_semaforo(date, smallint, pci_item_status) to authenticated, anon;
grant execute on function public.fmt_progresiva(numeric)       to authenticated, anon;
grant execute on function public.parse_progresiva(text)        to authenticated, anon;
grant execute on function public.progresiva_from_point(uuid, double precision, double precision) to authenticated;
grant execute on function public.is_member(uuid)               to authenticated;
grant execute on function public.role_in(uuid)                 to authenticated;
grant execute on function public.can_write(uuid)               to authenticated;
grant execute on function public.can_manage(uuid)              to authenticated;
grant execute on function public.is_platform_admin()           to authenticated;
grant execute on function public.my_service_ids()              to authenticated;
