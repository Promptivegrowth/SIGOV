-- ═══════════════════════════════════════════════════════════════════════
-- 0176 · Ronda 5 (JEF-01): el Jefe consulta en la app el parte de su
-- cuadrilla tal como está en la nube.
--
-- La app solo miraba el teléfono: en un parte registrado desde otro equipo
-- o cargado en el sistema (27 y 28/08 de Camaná) el Jefe veía el estado,
-- pero 0 actividades y ningún motivo. Esta función devuelve el parte del
-- día de su cuadrilla con sus actividades (con su client_id, para que una
-- corrección actualice la misma fila y no cree otra), las fotos por fase,
-- el estado y lo observado. Solo lectura; solo para quien es de la cuadrilla.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.parte_del_jefe(p_crew uuid, p_fecha date)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'id', o.id, 'client_id', o.client_id, 'status', o.status, 'review_notes', o.review_notes,
    'reviewed_at', o.reviewed_at, 'revisor', pr.full_name, 'publicacion_version', o.publicacion_version,
    'entries', (
      select coalesce(json_agg(json_build_object(
               'id', w.id, 'client_id', w.client_id, 'activity_id', w.activity_id, 'activity_name', a.name,
               'section_id', w.section_id, 'section_name', s.name, 'prog_start_m', w.prog_start_m, 'prog_end_m', w.prog_end_m,
               'side', w.side, 'quantity', w.quantity, 'unit', coalesce(u2.symbol, u.symbol), 'observation', w.observation,
               'origen', w.origen, 'plan_item_id', w.plan_item_id, 'pci_item_id', w.pci_item_id, 'pci_code', pc.code,
               'antes', (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null and e.phase = 'antes'),
               'durante', (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null and e.phase = 'durante'),
               'despues', (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null and e.phase = 'despues'),
               'general', (select count(*) from public.evidences e where e.work_entry_id = w.id and e.deleted_at is null and coalesce(e.phase::text, 'general') not in ('antes', 'durante', 'despues'))
             ) order by w.created_at), '[]'::json)
        from public.work_entries w
        join public.activities_catalog a on a.id = w.activity_id
        left join public.road_sections s on s.id = w.section_id
        left join public.units u on u.id = a.unit_id
        left join public.units u2 on u2.id = w.unit_id
        left join public.pci_items pi on pi.id = w.pci_item_id
        left join public.pcis pc on pc.id = pi.pci_id
       where w.work_order_id = o.id and w.deleted_at is null)
  )
  from public.work_orders o
  join public.crews c on c.id = o.crew_id
  left join public.profiles pr on pr.id = o.reviewed_by
  where o.crew_id = p_crew and o.work_date = p_fecha and o.deleted_at is null
    and (c.leader_id = auth.uid()
         or exists (select 1 from public.crew_members m where m.crew_id = c.id and m.profile_id = auth.uid() and m.is_active)
         or public.revisa_cuadrilla(c.service_id, c.id))
  limit 1
$$;
revoke execute on function public.parte_del_jefe(uuid, date) from anon, public;
grant execute on function public.parte_del_jefe(uuid, date) to authenticated;
