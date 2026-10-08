-- ═══════════════════════════════════════════════════════════════════════
-- 0072 · El origen de cada trabajo registrado
--
-- El reporte diario tiene que decir de dónde nace cada actividad
-- (OBS-28): de la programación, de un PCI, de una emergencia, o es un
-- trabajo no programado que la cuadrilla hizo porque le alcanzó el tiempo
-- (Elvis, reunión del 05-10: «y uno que diga otros»). La base lo deducía de
-- si el registro colgaba de una partida o de un ítem PCI, y «emergencia» y
-- «no programado» quedaban mezclados. Ahora se guarda.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.work_entries
  add column if not exists origen text;

alter table public.work_entries drop constraint if exists work_entries_origen_check;
alter table public.work_entries add constraint work_entries_origen_check
  check (origen is null or origen in ('programacion', 'pci', 'emergencia', 'no_programado'));

-- Lo ya registrado se rotula con lo que se puede saber
update public.work_entries
   set origen = case when plan_item_id is not null then 'programacion'
                     when pci_item_id  is not null then 'pci'
                     else 'emergencia' end
 where origen is null;

comment on column public.work_entries.origen is
  'De dónde nace el trabajo: programacion, pci, emergencia o no_programado («Otros» en la app).';
