-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0019 · La auditoría deja de depender de que el servicio siga vivo
--
-- Al borrar un servicio, el borrado en cascada de sus tablas hijas dispara el
-- trigger de auditoría, que intentaba insertar una fila apuntando a un
-- servicio que ya no existía: la operación fallaba entera.
--
-- Un registro de auditoría debe sobrevivir a lo que audita, así que se quita
-- la llave foránea y se conserva el service_id como dato histórico. El índice
-- y las políticas RLS no cambian.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.audit_log
  drop constraint if exists audit_log_service_id_fkey;

comment on column public.audit_log.service_id is
  'Servicio al que pertenecía el registro auditado. Sin FK a propósito: la traza debe sobrevivir al borrado del servicio.';
