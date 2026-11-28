-- ═══════════════════════════════════════════════════════════════════════
-- 0181 · Ronda 5 (CP-15): el metrado ejecutado no puede ser negativo ni
-- llevar más de 2 decimales (la web y la app ya lo bloquean; la base es la
-- última barrera). «Sin dato» sigue siendo NULL, distinto de cero.
-- Materiales (qty > 0, aprobado/entregado ≥ 0) y horas de equipo (0 a 24)
-- ya tenían sus restricciones.
-- ═══════════════════════════════════════════════════════════════════════
alter table public.work_entries drop constraint if exists work_entries_quantity_check;
alter table public.work_entries add constraint work_entries_quantity_check
  check (quantity is null or (quantity >= 0 and quantity = round(quantity, 2)));
