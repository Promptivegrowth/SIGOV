-- ═══════════════════════════════════════════════════════════════════════
-- 0182 · Ronda 5 (CP-20): la vista de ítems del PCI suma el metrado y los
-- ejecutores de cada ítem; sin índice, con muchos registros de campo, cada
-- fila recorría work_entries entera.
-- ═══════════════════════════════════════════════════════════════════════
create index if not exists idx_we_pci_item on public.work_entries (pci_item_id) where deleted_at is null;
