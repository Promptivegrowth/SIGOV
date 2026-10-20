-- ═══════════════════════════════════════════════════════════════════════
-- 0100 · Los estados nuevos del pedido de materiales (Elvis, P16)
--
-- «una vez elaborado los aprueba el ing residente … y posterior llega la
-- solicitud al rol visor COVINCA para la aprobación, los mismos que pueden
-- ser observados para poder enviar nuevamente otro pedido».
-- Van solos: un valor nuevo de un enum no se usa en la misma transacción.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.supply_request_status add value if not exists 'aprobado_residente' after 'solicitado';
alter type public.supply_request_status add value if not exists 'observado' after 'aprobado_residente';
