-- ═══════════════════════════════════════════════════════════════════════
-- 0074 · Los estados que faltaban en un ítem PCI (OBS-10, OBS-14)
--
-- Cuando COVINCA revisa un ítem levantado puede darlo conforme u
-- observarlo; observado vuelve a Servicon, que lo subsana y lo presenta
-- otra vez. «rechazado» no decía eso: se reemplaza por «observado».
-- Los valores van en su propia migración: un valor nuevo de un enum no se
-- puede usar en la misma transacción en que se crea.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.pci_item_status add value if not exists 'observado';
alter type public.pci_item_status add value if not exists 'subsanado';
