-- ═══════════════════════════════════════════════════════════════════════
-- 0034 · Las alertas operativas
--
-- La especificación pide «Alertas» como sección propia del menú, con su
-- contador. Hoy las alertas están repartidas: unas en el panel, otras en
-- Vencimientos, otras en ninguna parte, y para enterarse hay que recorrer
-- seis pantallas. Esta función las junta en una lista ordenada por
-- gravedad, que es como se atienden.
--
-- No inventa datos: cada alerta es una cuenta sobre lo que ya existe, y
-- lleva la dirección de la pantalla donde se resuelve. Si una alerta no
-- se puede atender desde alguna pantalla, no debería estar aquí.
--
-- El alcance vuelve a salir de mis_cuadrillas(): el supervisor recibe las
-- de sus cuadrillas, el administrador las de todo el contrato.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.alertas_operativas(p_service_id uuid)
returns table (
  clave text,
  severidad text,
  titulo text,
  detalle text,
  cantidad bigint,
  url text,
  orden int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  hoy as (select public.hoy_peru()::date as d),
  lunes as (
    select (select d from hoy) - ((extract(isodow from (select d from hoy))::int) - 1) as ini
  ),
  todas as (

    -- ── PCI que ya pasaron su fecha límite ────────────────────────────
    select
      'pci_vencidos'::text                                             as clave,
      'critica'::text                                                  as severidad,
      'PCI vencidos'::text                                             as titulo,
      'Pasaron la fecha límite pactada con el cliente. Cada día suma penalidad.'::text as detalle,
      count(*)::bigint                                                 as cantidad,
      '/pci/tablero'::text                                             as url,
      1                                                                as orden
    from public.pci_items i, alcance a
    where i.service_id = p_service_id and i.deleted_at is null
      and i.status in ('pendiente','en_atencion')
      and i.due_date < (select d from hoy)
      and (a.ids is null or i.assigned_crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── PCI que vencen esta semana ────────────────────────────────────
    select
      'pci_por_vencer', 'alta',
      'PCI que vencen en 7 días',
      'Todavía se pueden levantar a tiempo si se programan ahora.',
      count(*)::bigint, '/pci/tablero', 2
    from public.pci_items i, alcance a
    where i.service_id = p_service_id and i.deleted_at is null
      and i.status in ('pendiente','en_atencion')
      and i.due_date between (select d from hoy) and (select d from hoy) + 7
      and (a.ids is null or i.assigned_crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Documentos de seguridad y vehículos por vencer ────────────────
    select
      'vencimientos', 'alta',
      'Documentos y equipos por vencer',
      'SOAT, revisiones, pólizas o equipos de seguridad con la fecha encima.',
      count(*)::bigint, '/vencimientos', 3
    from public.v_vencimientos v
    where v.service_id = p_service_id
      and v.alert_level in ('vencido','critico','urgente')
    having count(*) > 0

    union all
    -- ── Partes diarios esperando validación ───────────────────────────
    select
      'partes_por_validar', 'media',
      'Partes diarios por validar',
      'Las cuadrillas ya los enviaron y esperan revisión.',
      count(*)::bigint, '/campo?status=enviado', 4
    from public.work_orders w, alcance a
    where w.service_id = p_service_id and w.deleted_at is null
      and w.status = 'enviado'
      and (a.ids is null or w.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Solicitudes de material sin respuesta ─────────────────────────
    select
      'pedidos_sin_aprobar', 'media',
      'Solicitudes de material sin aprobar',
      'Las cuadrillas no pueden salir a campo hasta que se resuelvan.',
      count(*)::bigint, '/materiales', 5
    from public.supply_requests r, alcance a
    where r.service_id = p_service_id and r.deleted_at is null
      and r.status = 'solicitado'
      and (a.ids is null or r.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Registros que exigen foto y no la tienen ──────────────────────
    select
      'sin_evidencia', 'media',
      'Registros sin la evidencia exigida',
      'La actividad obliga a fotografiar y el registro llegó sin fotos.',
      count(*)::bigint, '/campo', 6
    from public.work_entries we
    join public.activities_catalog ac on ac.id = we.activity_id
    join public.work_orders wo on wo.id = we.work_order_id, alcance a
    where we.service_id = p_service_id and we.deleted_at is null
      and ac.requires_photo
      -- No basta con «sin fotos»: la actividad fija su mínimo y por debajo
      -- de ese número el registro no sustenta nada
      and (select count(*) from public.evidences e
            where e.work_entry_id = we.id and e.deleted_at is null)
          < greatest(coalesce(ac.min_photos, 1), 1)
      and (a.ids is null or wo.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Cuadrillas sin nada programado esta semana ────────────────────
    select
      'sin_programa', 'baja',
      'Cuadrillas sin programa esta semana',
      'No tienen ninguna partida asignada del lunes al domingo.',
      count(*)::bigint, '/programacion', 7
    from public.crews c, alcance a
    where c.service_id = p_service_id and c.deleted_at is null and c.is_active
      and (a.ids is null or c.id = any(a.ids))
      and not exists (
        select 1 from public.plan_items pi
         where pi.crew_id = c.id and pi.deleted_at is null
           and pi.scheduled_on between (select ini from lunes)
                                   and (select ini from lunes) + 6)
    having count(*) > 0

    union all
    -- ── Cajas chicas por debajo de su umbral ──────────────────────────
    select
      'caja_baja', 'media',
      'Cajas chicas con saldo bajo',
      'El saldo cayó por debajo del mínimo fijado para operar.',
      count(*)::bigint, '/caja', 8
    from public.v_cash_boxes b, alcance a
    where b.service_id = p_service_id and b.is_active
      and b.balance < b.low_balance_threshold
      and (a.ids is null or b.crew_id is null or b.crew_id = any(a.ids))
    having count(*) > 0

    union all
    -- ── Gastos observados esperando corrección ────────────────────────
    select
      'gastos_observados', 'baja',
      'Gastos observados',
      'Se devolvieron al responsable y siguen sin subsanar.',
      count(*)::bigint, '/caja', 9
    from public.cash_movements m
    join public.cash_boxes b on b.id = m.cash_box_id, alcance a
    where m.service_id = p_service_id and m.deleted_at is null
      and m.status = 'observado'
      and (a.ids is null or b.crew_id is null or b.crew_id = any(a.ids))
    having count(*) > 0
  )
  select * from todas order by orden
$$;

grant execute on function public.alertas_operativas(uuid) to authenticated;
