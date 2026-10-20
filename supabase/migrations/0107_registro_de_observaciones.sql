-- ═══════════════════════════════════════════════════════════════════════
-- 0107 · Registro de observaciones de campo (video de Elvis, 14/10/2026)
--
-- Lo que el jefe de cuadrilla o el supervisor encuentran en la vía y no está
-- en el inventario: un desmonte, basura acumulada, una señal caída… Se
-- registra con su progresiva (el punto se ubica solo sobre la vía), el lado,
-- la observación y de una a tres fotos. Sirve para programar: el supervisor
-- la marca «programada» y luego «atendida», y la lista se exporta a PDF.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.observaciones_campo (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid unique,
  service_id     uuid not null references public.services(id) on delete cascade,
  crew_id        uuid references public.crews(id),
  section_id     uuid references public.road_sections(id),
  progresiva_m   numeric(12, 2),
  side           text,
  descripcion    text not null check (length(trim(descripcion)) > 0),
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'programada', 'atendida')),
  lat            double precision,
  lng            double precision,
  observado_on   date not null default (now() at time zone 'America/Lima')::date,
  programada_on  date,
  atendida_at    timestamptz,
  atendida_por   uuid references public.profiles(id),
  nota_atencion  text,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
comment on table public.observaciones_campo is 'Hallazgos de campo fuera del inventario (desmonte, basura…), con progresiva, fotos y estado para programarlos';
create index if not exists observaciones_campo_servicio on public.observaciones_campo (service_id, estado) where deleted_at is null;

alter table public.observaciones_campo enable row level security;
drop policy if exists observaciones_campo_select on public.observaciones_campo;
create policy observaciones_campo_select on public.observaciones_campo for select using (public.is_member(service_id));
drop policy if exists observaciones_campo_insert on public.observaciones_campo;
create policy observaciones_campo_insert on public.observaciones_campo for insert with check (public.can_write(service_id));
-- El estado lo cambia quien programa (supervisor, residente, administrador);
-- quien la registró puede corregir su descripción mientras siga pendiente
drop policy if exists observaciones_campo_update on public.observaciones_campo;
create policy observaciones_campo_update on public.observaciones_campo for update
  using (public.can_manage(service_id) or (created_by = auth.uid() and estado = 'pendiente'))
  with check (public.can_manage(service_id) or (created_by = auth.uid() and estado = 'pendiente'));
grant select, insert, update on public.observaciones_campo to authenticated;

-- Las fotos de la observación (una a tres) son evidencias como las demás
alter table public.evidences add column if not exists observacion_id uuid references public.observaciones_campo(id) on delete set null;
create index if not exists evidences_observacion on public.evidences (observacion_id) where observacion_id is not null;

-- ─── El punto sobre la vía, por la progresiva ────────────────────────
create or replace function public.t_observacion_ubicar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  s public.road_sections;
  p extensions.geometry;
begin
  -- La cuadrilla escribe el km; el mapa lo ubica (Elvis: «en el mapa
  -- automáticamente se localice»). Si el GPS mandó un punto, se respeta.
  if new.lat is null or new.lng is null or tg_op = 'UPDATE' and new.progresiva_m is distinct from old.progresiva_m then
    select * into s from public.road_sections where id = new.section_id;
    if s.id is not null and s.geom is not null and new.progresiva_m is not null and s.prog_end_m > s.prog_start_m then
      p := extensions.ST_LineInterpolatePoint(s.geom,
             least(0.999, greatest(0.001, (new.progresiva_m - s.prog_start_m) / (s.prog_end_m - s.prog_start_m))));
      new.lat := extensions.ST_Y(p);
      new.lng := extensions.ST_X(p);
    end if;
  end if;
  if new.estado = 'atendida' and (tg_op = 'INSERT' or old.estado <> 'atendida') then
    new.atendida_at := now();
    new.atendida_por := auth.uid();
  end if;
  if new.estado = 'programada' and new.programada_on is null then
    new.programada_on := (now() at time zone 'America/Lima')::date;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists t_observacion_ubicar on public.observaciones_campo;
create trigger t_observacion_ubicar before insert or update on public.observaciones_campo
  for each row execute function public.t_observacion_ubicar();

-- ─── La vista: con su tramo, cuadrilla, autor y fotos ────────────────
create or replace view public.v_observaciones_campo with (security_invoker = true) as
select o.id, o.client_id, o.service_id, o.crew_id, c.name as crew_name,
       o.section_id, s.code as section_code, s.name as section_name, s.numero as section_numero,
       o.progresiva_m, public.fmt_progresiva(o.progresiva_m) as progresiva_txt, o.side,
       o.descripcion, o.estado, o.lat, o.lng, o.observado_on, o.programada_on,
       o.atendida_at, o.nota_atencion, o.created_by, pr.full_name as created_by_name, o.created_at,
       coalesce((select array_agg(e.storage_path order by e.taken_at)
                   from public.evidences e
                  where e.observacion_id = o.id and e.deleted_at is null), '{}') as fotos
  from public.observaciones_campo o
  left join public.crews c on c.id = o.crew_id
  left join public.road_sections s on s.id = o.section_id
  left join public.profiles pr on pr.id = o.created_by
 where o.deleted_at is null;

grant select on public.v_observaciones_campo to authenticated;
