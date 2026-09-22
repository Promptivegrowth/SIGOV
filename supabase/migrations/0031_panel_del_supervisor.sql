-- ═══════════════════════════════════════════════════════════════════════
-- 0031 · El panel del supervisor
--
-- La especificación pide un tablero por rol: el Supervisor de campo ve
-- solo sus cuadrillas, no todo el contrato. Hoy todos ven lo mismo, así
-- que el supervisor revisa cifras globales donde casi nada es suyo.
--
-- Falta además la pieza de datos que lo hace posible: nadie registra qué
-- cuadrillas están a cargo de qué supervisor. El jefe de cuadrilla sí
-- está (crews.leader_id), el supervisor no. Se agrega aquí.
--
-- Luego, tres funciones, una por cada bloque de la lámina 5.2:
--   · el resumen de arriba, con los contadores;
--   · las cuadrillas a cargo, con su avance de la semana;
--   · lo último reportado, para ver qué está entrando.
--
-- Ninguna recibe del cliente la lista de cuadrillas: la deducen del rol
-- de quien pregunta. Si el alcance viajara en la llamada, bastaría con
-- editarla para ver las cuadrillas de otro.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Quién supervisa a quién ──────────────────────────────────────────

alter table public.crews
  add column if not exists supervisor_id uuid references public.profiles(id);

comment on column public.crews.supervisor_id is
  'Supervisor de campo responsable de la cuadrilla. Determina qué ve en su panel.';

create index if not exists crews_supervisor_idx
  on public.crews (supervisor_id) where deleted_at is null;

-- ─── El alcance de cada quien ─────────────────────────────────────────
--
-- Admin, ingeniero de seguridad y visor del cliente miran el contrato
-- completo. El supervisor, las cuadrillas que se le asignaron. El jefe
-- de cuadrilla, la suya. Devuelve null cuando no hay que acotar nada:
-- así las consultas de abajo se escriben una sola vez.

create or replace function public.mis_cuadrillas(p_service_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select case public.role_in(p_service_id)
    when 'supervisor' then coalesce(
      (select array_agg(c.id)
         from public.crews c
        where c.service_id = p_service_id
          and c.deleted_at is null
          and c.supervisor_id = auth.uid()),
      '{}'::uuid[])
    when 'jefe_cuadrilla' then coalesce(
      (select array_agg(c.id)
         from public.crews c
        where c.service_id = p_service_id
          and c.deleted_at is null
          and (c.leader_id = auth.uid()
               or exists (select 1 from public.crew_members m
                           where m.crew_id = c.id
                             and m.profile_id = auth.uid()
                             and m.is_active))),
      '{}'::uuid[])
    else null  -- sin acotar: ve el contrato entero
  end
$$;

-- ─── El resumen de arriba ─────────────────────────────────────────────

create or replace function public.panel_resumen(
  p_service_id uuid,
  p_from date,
  p_to date
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids),
  plan as (
    select pi.status
      from public.plan_items pi, alcance a
     where pi.service_id = p_service_id
       and pi.deleted_at is null
       and pi.scheduled_on between p_from and p_to
       and (a.ids is null or pi.crew_id = any(a.ids))
  ),
  pci as (
    select i.status, i.due_date
      from public.pci_items i, alcance a
     where i.service_id = p_service_id
       and i.deleted_at is null
       and (a.ids is null or i.assigned_crew_id = any(a.ids))
  )
  select json_build_object(
    'cuadrillas', (
      select count(*) from public.crews c, alcance a
       where c.service_id = p_service_id and c.deleted_at is null
         and (a.ids is null or c.id = any(a.ids))
    ),
    'asignadas',    (select count(*) from plan),
    'en_ejecucion', (select count(*) from plan where status = 'en_curso'),
    'culminadas',   (select count(*) from plan where status = 'ejecutado'),
    'pendientes',   (select count(*) from plan where status = 'programado'),
    'observadas',   (select count(*) from plan where status in ('suspendido','reprogramado')),
    'avance', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status = 'ejecutado') / count(*), 0)
             end
        from plan
    ),
    'pci_activos',   (select count(*) from pci where status in ('pendiente','en_atencion')),
    'pci_atendidos', (select count(*) from pci where status in ('levantado','validado')),
    'pci_vencidos',  (
      select count(*) from pci
       where status in ('pendiente','en_atencion')
         and due_date < public.hoy_peru()::date
    ),
    'pci_cumplimiento', (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status in ('levantado','validado'))
                        / count(*), 0)
             end
        from pci
    ),
    'materiales', (
      select json_build_object(
        'pendientes', count(*) filter (where r.status = 'solicitado'),
        'aprobadas',  count(*) filter (where r.status = 'aprobado'),
        'parciales',  count(*) filter (where r.status = 'parcial'),
        'entregadas', count(*) filter (where r.status = 'entregado')
      )
      from public.supply_requests r, alcance a
      where r.service_id = p_service_id and r.deleted_at is null
        and (a.ids is null or r.crew_id = any(a.ids))
    )
  )
$$;

-- ─── Las cuadrillas a cargo ───────────────────────────────────────────

create or replace function public.panel_cuadrillas(
  p_service_id uuid,
  p_from date,
  p_to date
)
returns table (
  crew_id uuid,
  code text,
  name text,
  color text,
  leader_name text,
  actividades bigint,
  ejecutadas bigint,
  avance numeric,
  pci_abiertos bigint,
  estado text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids)
  select
    c.id,
    c.code,
    c.name,
    c.color,
    p.full_name,
    count(pi.id)                                        as actividades,
    count(pi.id) filter (where pi.status = 'ejecutado')  as ejecutadas,
    case when count(pi.id) = 0 then 0
         else round(100.0 * count(pi.id) filter (where pi.status = 'ejecutado')
                    / count(pi.id), 0)
    end                                                 as avance,
    (select count(*) from public.pci_items i
      where i.assigned_crew_id = c.id
        and i.deleted_at is null
        and i.status in ('pendiente','en_atencion'))     as pci_abiertos,
    -- El estado se dice como lo diría el supervisor al mirar la fila
    case
      when count(pi.id) = 0 then 'sin_programa'
      when count(pi.id) filter (where pi.status in ('suspendido','reprogramado')) > 0
        then 'con_retraso'
      when count(pi.id) filter (where pi.status = 'ejecutado') = count(pi.id)
        then 'culminada'
      when count(pi.id) filter (where pi.status = 'en_curso') > 0 then 'en_ejecucion'
      else 'normal'
    end                                                 as estado
  from public.crews c
  cross join alcance a
  left join public.profiles p on p.id = c.leader_id
  left join public.plan_items pi
         on pi.crew_id = c.id
        and pi.deleted_at is null
        and pi.scheduled_on between p_from and p_to
  where c.service_id = p_service_id
    and c.deleted_at is null
    and (a.ids is null or c.id = any(a.ids))
  group by c.id, c.code, c.name, c.color, p.full_name
  order by c.code
$$;

-- ─── Lo último reportado ──────────────────────────────────────────────

create or replace function public.panel_ultimas(
  p_service_id uuid,
  p_limite int default 12
)
returns table (
  id uuid,
  reportado_en timestamptz,
  work_date date,
  crew_name text,
  crew_color text,
  activity_name text,
  progresiva text,
  cantidad numeric,
  unidad text,
  evidencias bigint,
  estado text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alcance as (select public.mis_cuadrillas(p_service_id) as ids)
  select
    w.id,
    w.created_at,
    w.work_date,
    w.crew_name,
    w.crew_color,
    w.activity_name,
    coalesce(
      nullif(trim(coalesce(w.prog_start_txt, '') ||
        case when w.prog_end_txt is not null and w.prog_end_txt <> w.prog_start_txt
             then ' - ' || w.prog_end_txt else '' end), ''),
      '—'),
    w.quantity,
    w.unit_symbol,
    coalesce(w.evidence_count, 0)::bigint,
    w.order_status::text
  from public.v_work_entries w, alcance a
  where w.service_id = p_service_id
    and (a.ids is null or w.crew_id = any(a.ids))
  order by w.created_at desc
  limit greatest(p_limite, 1)
$$;

grant execute on function
  public.mis_cuadrillas(uuid),
  public.panel_resumen(uuid, date, date),
  public.panel_cuadrillas(uuid, date, date),
  public.panel_ultimas(uuid, int)
to authenticated;
