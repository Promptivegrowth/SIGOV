-- ═══════════════════════════════════════════════════════════════════════
-- 0177 · Ronda 5 (CP-01): el intento de abrir un módulo sin permiso queda
-- registrado. La web ya redirigía (y el servidor ya negaba los datos por
-- RLS y exigir_accion); ahora el historial de accesos anota quién, qué
-- ruta y cuándo, como «denegado».
-- ═══════════════════════════════════════════════════════════════════════
alter table public.accesos drop constraint if exists accesos_evento_check;
alter table public.accesos add constraint accesos_evento_check check (evento = any (array[
  'ingreso', 'salida', 'fallido', 'bloqueado', 'desbloqueo', 'restablecimiento', 'cambio_dispositivo', 'denegado']));
alter table public.accesos drop constraint if exists accesos_resultado_check;
alter table public.accesos add constraint accesos_resultado_check check (resultado = any (array['exitoso', 'fallido', 'bloqueado', 'denegado']));
