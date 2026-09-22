-- ═══════════════════════════════════════════════════════════════════════
-- 0043 · La atención de un ítem de PCI
--
-- Un PCI no se «marca como hecho»: se atiende, se fotografía el antes y el
-- después, y el cliente lo acepta o lo rechaza. Hoy la app enseña la lista
-- con su semáforo pero no deja hacer nada con ella, y el ítem solo cambia
-- de estado si alguien lo edita desde la web.
--
--   pendiente ──Iniciar──▶ en_atencion ──Levantar──▶ levantado
--                                                        │
--                                              OSITRAN ──┴──▶ validado
--                                                        └──▶ rechazado
--
-- La regla dura: **un ítem que exige evidencia no se levanta sin la foto
-- del después**. Es lo que sustenta el levantamiento ante el cliente, y sin
-- ella el ítem vuelve rechazado y el plazo sigue corriendo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pci_items
  add column if not exists started_at timestamptz,
  add column if not exists started_by uuid references public.profiles(id);

comment on column public.pci_items.started_at is
  'Cuándo la cuadrilla empezó a atenderlo. Mide el tiempo real de respuesta.';

-- ─── Iniciar la atención ──────────────────────────────────────────────

create or replace function public.pci_iniciar_atencion(p_item uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fila public.pci_items;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.can_write(v_fila.service_id) then
    raise exception 'SIGOV: no tienes permiso sobre este servicio';
  end if;

  if v_fila.status <> 'pendiente' then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  update public.pci_items
     set status = 'en_atencion',
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;

  return json_build_object('estado', 'en_atencion');
end $$;

-- ─── Dar por levantado ────────────────────────────────────────────────

create or replace function public.pci_levantar(p_item uuid, p_nota text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fila public.pci_items;
  v_despues int;
  v_total int;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.can_write(v_fila.service_id) then
    raise exception 'SIGOV: no tienes permiso sobre este servicio';
  end if;

  if v_fila.status not in ('pendiente','en_atencion','rechazado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  -- La evidencia del después es lo que sustenta el levantamiento: sin ella
  -- el cliente lo rechaza y el plazo sigue corriendo contra la empresa
  if v_fila.requires_evidence then
    select
      count(*) filter (where e.phase = 'despues'),
      count(*)
    into v_despues, v_total
    from public.evidences e
    where e.pci_item_id = p_item and e.deleted_at is null;

    if v_total = 0 then
      raise exception 'SIGOV: este ítem exige fotografía y no tiene ninguna';
    end if;
    if v_despues = 0 then
      raise exception 'SIGOV: falta la fotografía del «después», que es la que sustenta el levantamiento';
    end if;
  end if;

  update public.pci_items
     set status = 'levantado',
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(trim(p_nota), ''), notes)
   where id = p_item;

  -- Quien lleva el contrato se entera de que hay algo que presentar
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select
    v_fila.service_id, m.profile_id, 'pci_levantado',
    format('%s · ítem %s levantado', p.code, v_fila.item_number),
    left(v_fila.description, 160),
    '/pci/' || v_fila.pci_id,
    'info',
    jsonb_build_object('pci_item_id', p_item)
  from public.service_members m
  join public.pcis p on p.id = v_fila.pci_id
  where m.service_id = v_fila.service_id and m.role in ('admin','supervisor');

  return json_build_object('estado', 'levantado');
end $$;

grant execute on function
  public.pci_iniciar_atencion(uuid),
  public.pci_levantar(uuid, text)
to authenticated;

-- ─── La vista dice qué fotos tiene y de qué fase ──────────────────────
--
-- Sin esto la app no puede decir «te falta la del después» antes de que el
-- servidor lo rechace, y el capataz se entera cuando ya guardó el equipo.

create or replace view public.v_pci_items as
select
  i.id,
  i.pci_id,
  i.service_id,
  i.item_number,
  i.description,
  i.section_id,
  s.name as section_name,
  s.code as section_code,
  i.prog_start_m,
  i.prog_end_m,
  i.side,
  fmt_progresiva(i.prog_start_m) as prog_start_txt,
  fmt_progresiva(i.prog_end_m) as prog_end_txt,
  i.activity_id,
  a.name as activity_name,
  i.quantity,
  u.symbol as unit_symbol,
  i.term_days,
  i.due_date,
  i.due_date - public.hoy_peru()::date as days_left,
  public.pci_item_semaforo(i.due_date, i.term_days, i.status) as semaforo,
  i.status,
  i.assigned_crew_id,
  c.name as crew_name,
  i.assigned_to,
  p.full_name as assignee_name,
  i.requires_evidence,
  i.closed_at,
  i.validated_at,
  i.notes,
  (select count(*) from public.evidences e
    where e.pci_item_id = i.id and e.deleted_at is null) as evidence_count,
  pc.code as pci_code,
  pc.title as pci_title,
  pc.priority as pci_priority,
  i.created_at,
  i.updated_at,

  -- Columnas nuevas al final: «create or replace view» no admite otra cosa.
  -- Las fotos por fase permiten avisar «te falta la del después» antes de
  -- que el servidor lo rechace, cuando el capataz todavía está en el sitio.
  i.started_at,
  (select count(*) from public.evidences e
    where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'antes')
    as fotos_antes,
  (select count(*) from public.evidences e
    where e.pci_item_id = i.id and e.deleted_at is null and e.phase = 'despues')
    as fotos_despues
from public.pci_items i
join public.pcis pc on pc.id = i.pci_id
left join public.road_sections s on s.id = i.section_id
left join public.activities_catalog a on a.id = i.activity_id
left join public.units u on u.id = i.unit_id
left join public.crews c on c.id = i.assigned_crew_id
left join public.profiles p on p.id = i.assigned_to
where i.deleted_at is null;

alter view public.v_pci_items set (security_invoker = on);
