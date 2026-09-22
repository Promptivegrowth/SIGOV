-- ═══════════════════════════════════════════════════════════════════════
-- 0035 · Un aviso por PCI, no uno por ítem
--
-- evaluate_pci_deadlines() emitía una notificación por cada ítem vencido
-- y por cada destinatario, todos los días. Con 324 ítems vencidos y dos
-- supervisores, eso son ~650 avisos diarios: la campana y la pantalla de
-- Alertas quedan inservibles, y la tabla ya acumula 9.794 filas que dicen
-- lo mismo veinte veces.
--
-- Un PCI llega como documento y se atiende como documento. El aviso útil
-- es «PCI-2026-047: 187 ítems vencidos», con el enlace al documento; el
-- detalle ítem por ítem ya está en el tablero, que es donde se trabaja.
--
-- Se conserva el mismo antirrebote de 20 horas y la misma clave de datos,
-- solo que ahora apunta al PCI y no al ítem.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.evaluate_pci_deadlines()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_warn int := 0; v_over int := 0;
begin
  -- ── Lo que vence en 48 horas, al responsable de atenderlo ───────────
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select
    x.service_id,
    x.destinatario,
    'pci_por_vencer',
    format('%s · %s ítem%s por vencer', x.code, x.cuantos,
           case when x.cuantos = 1 then '' else 's' end),
    -- Sin citar un ítem de ejemplo: con 62 ítems agrupados, el texto de
    -- uno cualquiera se lee como si fuera el de todos
    format('El primero vence %s. Revisa el detalle en el documento.',
           case when x.primer_vencimiento = current_date then 'hoy'
                when x.primer_vencimiento = current_date + 1 then 'mañana'
                else 'en ' || (x.primer_vencimiento - current_date) || ' días' end),
    '/pci/' || x.pci_id,
    'warning',
    jsonb_build_object('pci_id', x.pci_id, 'items', x.cuantos)
  from (
    select
      i.service_id,
      p.id                              as pci_id,
      p.code                            as code,
      coalesce(i.assigned_to, c.leader_id) as destinatario,
      count(*)                          as cuantos,
      min(i.due_date)                   as primer_vencimiento
    from public.pci_items i
    join public.pcis p on p.id = i.pci_id
    left join public.crews c on c.id = i.assigned_crew_id
    where i.deleted_at is null
      and i.status not in ('levantado','validado')
      and i.due_date between current_date and current_date + 2
      and coalesce(i.assigned_to, c.leader_id) is not null
    group by i.service_id, p.id, p.code, coalesce(i.assigned_to, c.leader_id)
  ) x
  where not exists (
    select 1 from public.notifications n
     where n.type = 'pci_por_vencer'
       and n.data->>'pci_id' = x.pci_id::text
       and n.profile_id = x.destinatario
       and n.created_at > now() - interval '20 hours');
  get diagnostics v_warn = row_count;

  -- ── Lo ya vencido, a quien responde por el contrato ─────────────────
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select
    x.service_id,
    x.destinatario,
    'pci_vencido',
    format('%s · %s ítem%s vencido%s', x.code, x.cuantos,
           case when x.cuantos = 1 then '' else 's' end,
           case when x.cuantos = 1 then '' else 's' end),
    format('El más atrasado lleva %s día%s fuera de plazo.',
           x.dias_max, case when x.dias_max = 1 then '' else 's' end),
    '/pci/' || x.pci_id,
    'danger',
    jsonb_build_object('pci_id', x.pci_id, 'items', x.cuantos)
  from (
    select
      i.service_id,
      p.id                                  as pci_id,
      p.code                                as code,
      m.profile_id                          as destinatario,
      count(*)                              as cuantos,
      max(current_date - i.due_date)        as dias_max
    from public.pci_items i
    join public.pcis p on p.id = i.pci_id
    join public.service_members m
      on m.service_id = i.service_id and m.role in ('admin','supervisor')
    where i.deleted_at is null
      and i.status not in ('levantado','validado')
      and i.due_date < current_date
    group by i.service_id, p.id, p.code, m.profile_id
  ) x
  where not exists (
    select 1 from public.notifications n
     where n.type = 'pci_vencido'
       and n.data->>'pci_id' = x.pci_id::text
       and n.profile_id = x.destinatario
       and n.created_at > now() - interval '20 hours');
  get diagnostics v_over = row_count;

  return jsonb_build_object('por_vencer', v_warn, 'vencidos', v_over, 'evaluated_at', now());
end $$;

-- ─── Y se recoge lo que dejó la versión anterior ──────────────────────
--
-- Son avisos que la propia máquina generó por ítem; no hay nada del
-- usuario que perder. Se borran los que apuntan a un ítem (data->pci_item_id),
-- que son justamente los del esquema viejo.

delete from public.notifications
 where type in ('pci_vencido','pci_por_vencer')
   and data ? 'pci_item_id';
