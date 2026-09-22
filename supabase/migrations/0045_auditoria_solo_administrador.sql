-- ═══════════════════════════════════════════════════════════════════════
-- 0045 · La auditoría, solo para el Administrador
--
-- El apartado 7.6 la reserva al Administrador, y el 15.1 lo repite:
-- «Debe existir historial / auditoría solo para Administrador». La
-- política vigente la abría a `can_manage()`, que incluye al supervisor.
--
-- No es un detalle de permisos: el supervisor es una de las personas que
-- la bitácora audita. Dejarle ver quién revisó qué y cuándo cambia para
-- qué sirve el registro.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists audit_select on public.audit_log;

create policy audit_select on public.audit_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or (service_id is not null and public.role_in(service_id) = 'admin')
  );
