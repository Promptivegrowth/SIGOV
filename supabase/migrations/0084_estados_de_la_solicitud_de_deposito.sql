-- ═══════════════════════════════════════════════════════════════════════
-- 0084 · Los estados que faltaban en la solicitud de depósito (OBS-41)
--
-- Elvis pide seis: Solicitado, En evaluación, Aprobado, Atendido, Observado
-- y Rechazado. «Atendido» es el `depositado` que ya existía. Los valores
-- nuevos de un enum van solos en su migración: no se pueden usar en la
-- misma transacción en que se crean.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.deposit_request_status add value if not exists 'en_evaluacion' after 'solicitado';
alter type public.deposit_request_status add value if not exists 'observado' after 'aprobado';
