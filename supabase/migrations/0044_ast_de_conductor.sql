-- ═══════════════════════════════════════════════════════════════════════
-- 0044 · El AST del conductor
--
-- La especificación pide dos análisis de seguridad, no uno:
--
--   · el **de cuadrilla**, que ya existe: la tarea del día, la matriz de
--     peligros y controles, los EPP y la firma de cada trabajador;
--   · el **de conductor**, que falta: antes de mover la camioneta, quien
--     maneja declara si durmió, si tomó, si lleva la licencia vigente y
--     cómo encontró el vehículo.
--
-- No son el mismo documento con otro nombre. El del conductor no lleva
-- matriz de riesgos ni firmas de terceros: lo firma uno solo y su valor
-- está en las preguntas, que son siempre las mismas y se responden antes
-- de arrancar. Un accidente de tránsito con un conductor que llevaba
-- cuatro horas de sueño es responsabilidad de la empresa, y este registro
-- es lo que demuestra que se preguntó.
--
-- Se distingue con una columna, no con una tabla aparte: comparten la
-- fecha, la cuadrilla, el tramo, la ubicación y el circuito de firma, y
-- separarlos obligaría a duplicar todo eso.
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ats_kind') then
    create type public.ats_kind as enum ('cuadrilla', 'conductor');
  end if;
end $$;

alter table public.ats_iperc
  add column if not exists kind public.ats_kind not null default 'cuadrilla',
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add column if not exists driver_id uuid references public.profiles(id),
  -- Las respuestas del conductor, tal como se preguntan en el formato
  add column if not exists fit_to_drive jsonb;

comment on column public.ats_iperc.kind is
  'Si es el análisis de la cuadrilla o el del conductor antes de manejar.';
comment on column public.ats_iperc.fit_to_drive is
  'Respuestas del conductor: descanso, alcohol, medicación, licencia y '
  'estado del vehículo. Es lo que demuestra que se preguntó antes de salir.';

create index if not exists ats_iperc_kind_idx
  on public.ats_iperc (service_id, kind, doc_date) where deleted_at is null;

/**
 * Si el conductor está en condiciones de manejar.
 *
 * Lo decide el servidor y no la pantalla: son tres respuestas que, dichas
 * en voz alta, impiden que alguien suba a una camioneta. Dejar ese juicio
 * en el cliente haría que dependiera de qué versión de la app lleve el
 * teléfono.
 */
create or replace function public.conductor_apto(p_respuestas jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    (p_respuestas->>'descanso_suficiente')::boolean, false)
    and not coalesce((p_respuestas->>'consumio_alcohol')::boolean, true)
    and not coalesce((p_respuestas->>'medicacion_que_afecta')::boolean, true)
    and coalesce((p_respuestas->>'licencia_vigente')::boolean, false)
    and coalesce((p_respuestas->>'vehiculo_operativo')::boolean, false)
$$;

-- ─── La vista de AST, para la app y la web ────────────────────────────

create or replace view public.v_ats as
select
  a.id,
  a.service_id,
  a.kind,
  a.doc_date,
  a.crew_id,
  c.name as crew_name,
  a.task,
  a.location,
  a.section_id,
  s.name as section_name,
  a.prog_start_m,
  fmt_progresiva(a.prog_start_m) as prog_start_txt,
  a.max_risk,
  a.hazards,
  a.ppe,
  a.vehicle_id,
  v.plate as vehicle_plate,
  trim(coalesce(v.brand, '') || ' ' || coalesce(v.model, '')) as vehicle_name,
  a.driver_id,
  quien.full_name as driver_name,
  a.fit_to_drive,
  case when a.kind = 'conductor'
       then public.conductor_apto(a.fit_to_drive)
       else null end as apto,
  a.supervisor_id,
  jefe.full_name as supervisor_name,
  a.approved_at,
  (select count(*) from public.ats_signatures f where f.ats_id = a.id) as firmas,
  a.lat,
  a.lng,
  a.created_at
from public.ats_iperc a
left join public.crews c on c.id = a.crew_id
left join public.road_sections s on s.id = a.section_id
left join public.vehicles v on v.id = a.vehicle_id
left join public.profiles quien on quien.id = a.driver_id
left join public.profiles jefe on jefe.id = a.supervisor_id
where a.deleted_at is null;

alter view public.v_ats set (security_invoker = on);
grant select on public.v_ats to authenticated;
grant execute on function public.conductor_apto(jsonb) to authenticated;
