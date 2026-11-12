-- ═══════════════════════════════════════════════════════════════════════
-- 0124 · Quién ejecutó, con la cuenta compartida (Elvis, 12/11)
--
-- «En el Excel de seguimiento de PCI aparecía Augusto para diferenciar qué
-- ítems ejecutó explícitamente él, a diferencia del jefe José Ramos.» Con
-- una sola cuenta por cuadrilla en varios celulares, la cuenta ya no dice
-- quién hizo el trabajo:
--
--   · pci_items.encargado: el ENCARGADO del control del PCI, tal cual se
--     importó (Augusto, José Ramos…). La cuadrilla sigue en assigned_crew_id.
--   · work_entries.ejecutado_por: quién usa el celular que hizo el registro
--     (el jefe o el subjefe, elegido en el celular).
--
-- Y la carpeta del último sector de Tacna: en el Drive de SERVICON es
-- SECTOR_4.2_1314+300_1335+600 (en SIGOV seguía como 4.1, P10).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pci_items add column if not exists encargado text;
comment on column public.pci_items.encargado is
  'ENCARGADO del control del PCI (jefe o subjefe), como vino en el Excel';

alter table public.work_entries add column if not exists ejecutado_por text;
comment on column public.work_entries.ejecutado_por is
  'Quién usaba el celular que hizo el registro: el jefe o el subjefe de la cuadrilla (cuenta compartida)';

update public.service_sectors
   set folder = 'SECTOR_4.2_1314+300_1335+600'
 where service_id = '22222222-2222-4222-8222-222222222221'
   and code = '4.2' and folder = 'SECTOR_4.1_1314+300_1335+600';
