-- Ampliar el PCI-2026-047 a más de 300 ítems (cunetas + badenes)
select setseed(0.55);

insert into public.pci_items (pci_id, service_id, item_number, description, section_id,
                              prog_start_m, prog_end_m, side, activity_id, quantity, unit_id,
                              term_days, due_date, status, assigned_crew_id, created_by)
select
  'c1000000-0000-4000-8000-000000000001', ra.service_id,
  (select coalesce(max(item_number),0) from public.pci_items where pci_id='c1000000-0000-4000-8000-000000000001')
    + row_number() over (order by ra.section_id, ra.progresiva_m),
  'Limpieza y descolmatación de ' || ra.name || ' — acumulación de material que impide la evacuación de aguas hacia la alcantarilla más próxima.',
  ra.section_id, ra.progresiva_m, ra.progresiva_m + 120, ra.side,
  (select id from public.activities_catalog a where a.service_id = ra.service_id and a.code = 'MR-06'),
  120, (select id from public.units where code = 'ML'),
  t.days, (current_date - 4) + t.days,
  'pendiente'::pci_item_status,
  (select id from public.crews c where c.service_id = ra.service_id and c.code = 'CUA-A'),
  'a0000000-0000-4000-8000-000000000002'
from (
  select ra.*, row_number() over (order by md5(ra.id::text || 'cun')) as rn
  from public.road_assets ra
  join public.asset_types at on at.id = ra.type_id
  where at.code = 'CUN' and ra.service_id = '22222222-2222-4222-8222-222222222221'
    and ra.deleted_at is null
  limit 62
) ra
cross join lateral (select (array[7,10,15,20,30])[1 + (ra.rn % 5)]::smallint as days) t
on conflict (pci_id, item_number) do nothing;

select count(*) as items_pci_047 from public.pci_items where pci_id='c1000000-0000-4000-8000-000000000001';
