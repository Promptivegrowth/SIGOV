-- ═══════════════════════════════════════════════════════════════════════
-- 0071 · La programación como la lleva COVINCA
--
-- La programación semanal de Servicon (formato «PROGRAMACION SEMANAL»,
-- C07, semana 05–11/10/2026) trae por partida datos que SIGOV no guardaba,
-- y sin ellos ni el jefe recibe la actividad completa (OBS-02) ni el Excel
-- sale igual al formato:
--
-- · el LADO tal como se escribe en campo: LI, LD, LD/LI, LD/EJE/LI, LD-CD…
-- · el ORIGEN de la partida: MR (mantenimiento rutinario), PCI o E
--   (emergencia), y el ítem PCI cuando corresponde;
-- · si es una partida subcontratada.
-- Y por semana: residente, supervisor, inspector, n.º de semana del
-- contrato y fecha de emisión, que van en la cabecera del formato.
--
-- Las cuadrillas reciben su número y su sede tal como los nombra la
-- estructura documental aprobada por COVINCA (CUADRILLA_1_CAMANA … C07), y
-- el subtramo al que pertenecen: el reporte diario lo precarga (Elvis:
-- «si es Santos, del tramo 1, ya le debe aparecer Dv. Quilca – Arequipa»).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.crews
  add column if not exists numero     smallint,
  add column if not exists sede       text,
  add column if not exists section_id uuid references public.road_sections(id);

comment on column public.crews.numero is 'N.º de la cuadrilla en la estructura documental COVINCA (CUADRILLA_<n>_<SEDE>, C0<n>).';
comment on column public.crews.sede is 'Sede de la cuadrilla en la estructura documental, en mayúsculas sin tildes: CAMANA, PEDREGAL…';
comment on column public.crews.section_id is 'Subtramo al que pertenece la cuadrilla: se precarga en el reporte diario.';

-- Las siete de la estructura aprobada, en su orden. Solo si nadie las fijó.
with sedes (n, sede) as (
  values (1, 'CAMANA'), (2, 'PEDREGAL'), (3, 'VITOR'), (4, 'FISCAL'),
         (5, 'MOQUEGUA'), (6, 'TACNA'), (7, 'CONCORDIA')
)
update public.crews c
   set numero = s.n, sede = s.sede, updated_at = now()
  from sedes s
 where c.service_id = '22222222-2222-4222-8222-222222222221'
   and c.code = 'CUA-0' || s.n
   and c.numero is null;

alter table public.plan_items
  add column if not exists lado         text,
  add column if not exists origen       text not null default 'MR',
  add column if not exists pci_item_id  uuid references public.pci_items(id) on delete set null,
  add column if not exists subcontratada boolean not null default false;

alter table public.plan_items drop constraint if exists plan_items_origen_check;
alter table public.plan_items add constraint plan_items_origen_check
  check (origen in ('MR', 'PCI', 'E'));

comment on column public.plan_items.lado is 'Lado como se escribe en la programación: LI, LD, LD/LI, LD/EJE/LI, LD-CD…';
comment on column public.plan_items.origen is 'Origen de la partida: MR (mantenimiento rutinario), PCI o E (emergencia).';

alter table public.weekly_plans
  add column if not exists residente      text,
  add column if not exists supervisor     text,
  add column if not exists inspector      text,
  add column if not exists semana_contrato integer,
  add column if not exists emitido_on     date;

-- ─── La vista, con lo nuevo al final (la app de campo la lee) ──────────
create or replace view public.v_plan_items
with (security_invoker = true) as
select
  pi.id,
  pi.plan_id,
  pi.service_id,
  pi.scheduled_on,
  wp.year,
  wp.week,
  wp.status as plan_status,
  pi.activity_id,
  a.name as activity_name,
  a.code as activity_code,
  a.category as activity_category,
  a.color as activity_color,
  pi.section_id,
  s.name as section_name,
  s.code as section_code,
  pi.prog_start_m,
  pi.prog_end_m,
  public.fmt_progresiva(pi.prog_start_m) as prog_start_txt,
  public.fmt_progresiva(pi.prog_end_m) as prog_end_txt,
  pi.crew_id,
  c.name as crew_name,
  c.color as crew_color,
  pi.target_qty,
  pi.executed_qty,
  case when pi.target_qty > 0
       then round(least(pi.executed_qty / pi.target_qty, 1) * 100, 1)
       else 0 end as progress_pct,
  u.symbol as unit_symbol,
  pi.status,
  pi.priority,
  pi.sort_order,
  pi.notes,
  pi.suspended_by_pci_id,
  pi.original_date,
  pi.rescheduled_to,
  pci.code as pci_code,
  pi.created_at,
  pi.updated_at,
  pi.started_at,
  pi.finished_at,
  pi.validated_at,
  pi.impedimento,
  pi.impedimento_at,
  quien_inicio.full_name as started_by_name,
  quien_cerro.full_name as finished_by_name,
  quien_valido.full_name as validated_by_name,
  -- Lo nuevo
  a.numero_covinca as activity_numero,
  a.carpeta_ns as activity_carpeta_ns,
  pi.lado,
  pi.origen,
  pi.pci_item_id,
  pit.item_number as pci_item_number,
  pci_del_item.code as pci_item_pci_code,
  pi.subcontratada,
  c.numero as crew_numero,
  c.sede as crew_sede,
  sup.full_name as supervisor_name,
  (public.sector_de(pi.section_id, pi.prog_start_m)).code as sector_code
from public.plan_items pi
join public.weekly_plans wp on wp.id = pi.plan_id
join public.activities_catalog a on a.id = pi.activity_id
join public.road_sections s on s.id = pi.section_id
left join public.crews c on c.id = pi.crew_id
left join public.units u on u.id = pi.unit_id
left join public.pcis pci on pci.id = pi.suspended_by_pci_id
left join public.profiles quien_inicio on quien_inicio.id = pi.started_by
left join public.profiles quien_cerro on quien_cerro.id = pi.finished_by
left join public.profiles quien_valido on quien_valido.id = pi.validated_by
left join public.pci_items pit on pit.id = pi.pci_item_id
left join public.pcis pci_del_item on pci_del_item.id = pit.pci_id
left join public.profiles sup on sup.id = c.supervisor_id
where pi.deleted_at is null;
