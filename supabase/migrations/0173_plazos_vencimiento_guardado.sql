-- ═══════════════════════════════════════════════════════════════════════
-- 0173 · Ronda 5 (TR-02): el vencimiento que se muestra es el que tienen
-- los ítems.
--
-- La tarjeta «Plazos del PCI» del Supervisor recalculaba «fecha base + N»
-- (02/09 a 7 días en el PCI 47) mientras los ítems, el tablero del
-- Residente y la app guardan 01/09. Ahora la tarjeta muestra la fecha
-- guardada en los ítems (la oficial que usa todo el sistema) y, si la
-- regla de cálculo daría otra, lo dice para que el Supervisor la contraste
-- con el oficio. No se cambia ninguna fecha histórica.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.pci_plazos_resumen(p_pci uuid)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'modo', p.modo_plazos, 'fecha_base', p.registered_on, 'version', p.plazos_version,
    'contrastado_at', p.oficio_contrastado_at,
    'plazos', (select coalesce(json_agg(json_build_object(
                         'plazo', t.term_days, 'items', t.n,
                         -- la fecha que llevan los ítems (la más frecuente) y cuántas distintas hay
                         'vencimiento', coalesce(t.guardado, public.vencimiento_pci(p.id, t.term_days)),
                         'fechas_distintas', t.distintas,
                         'regla', public.vencimiento_pci(p.id, t.term_days),
                         'difiere', t.guardado is not null and t.guardado is distinct from public.vencimiento_pci(p.id, t.term_days),
                         'vencidos', t.vencidos,
                         'oficial', p.vencimientos ? t.term_days::text)
                       order by t.term_days), '[]'::json)
                 from (select i.term_days, count(*) n,
                              mode() within group (order by i.due_date) guardado,
                              count(distinct i.due_date) distintas,
                              count(*) filter (where i.due_date < public.hoy_peru()
                                               and i.status in ('pendiente', 'en_atencion', 'observado')) vencidos
                         from public.pci_items i
                        where i.pci_id = p.id and i.deleted_at is null and i.term_days is not null group by i.term_days) t),
    'versiones', (select coalesce(json_agg(json_build_object('version', v.version, 'modo', v.modo, 'fecha_base', v.fecha_base,
                           'vencimientos', v.vencimientos, 'motivo', v.motivo, 'items', v.items_actualizados,
                           'quien', pr.full_name, 'cuando', v.cuando) order by v.version desc), '[]'::json)
                    from public.pci_plazos_versiones v left join public.profiles pr on pr.id = v.quien where v.pci_id = p.id))
    from public.pcis p
   where p.id = p_pci and p.deleted_at is null and public.is_member(p.service_id) and not public.es_visor(p.service_id)
$$;
grant execute on function public.pci_plazos_resumen(uuid) to authenticated;
