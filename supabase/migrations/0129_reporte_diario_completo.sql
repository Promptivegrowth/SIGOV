-- ═══════════════════════════════════════════════════════════════════════════
-- 0129 · Reporte diario completo (4.º entregable, OBS 3 y 4, CASOS 14, 15 y 17)
--
-- 1. Recursos con su naturaleza: equipo, herramienta, EPP, EPC, material u
--    otro. El equipo y la herramienta guardan la cantidad física y, aparte,
--    las horas de uso o el % de participación en la actividad: una
--    hidrolavadora usada en dos actividades es 1 und. con 3.5 h, no 1.5 und.
-- 2. Un reporte con actividades sin metrado no se envía ni se valida: queda
--    como borrador incompleto (el PDF lo marca así).
-- 3. Historial de versiones del reporte: cada envío, observación y validación
--    queda registrado con su nota, quién y cuándo, y lo que se envió.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Recursos ────────────────────────────────────────────────────────────
alter table public.parte_recursos drop constraint if exists parte_recursos_tipo_check;
alter table public.parte_recursos
  add constraint parte_recursos_tipo_check
  check (tipo in ('equipo', 'herramienta', 'epp', 'epc', 'material', 'otro'));

alter table public.parte_recursos
  add column if not exists horas_uso numeric check (horas_uso is null or (horas_uso >= 0 and horas_uso <= 24)),
  add column if not exists participacion_pct numeric check (participacion_pct is null or (participacion_pct >= 0 and participacion_pct <= 100));

comment on column public.parte_recursos.cantidad is
  'Equipo, herramienta, EPP y EPC: cantidad física (no se suma entre actividades, se toma la mayor). Material y otro: cantidad usada (se suma).';
comment on column public.parte_recursos.horas_uso is 'Horas de utilización en la actividad (equipos y herramientas). Se suman en el consolidado.';
comment on column public.parte_recursos.participacion_pct is 'Porcentaje de participación en la actividad (herramientas), cuando corresponde.';

-- ── 2 · Sin metrado no hay reporte oficial ─────────────────────────────────
create or replace function public.parte_sin_metrado(p_work_order_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(coalesce(a.name, 'Actividad') order by e.created_at), '{}')
    from public.work_entries e
    left join public.activities_catalog a on a.id = e.activity_id
   where e.work_order_id = p_work_order_id
     and e.deleted_at is null
     and coalesce(e.quantity, 0) <= 0
$$;
revoke all on function public.parte_sin_metrado(uuid) from public, anon;
grant execute on function public.parte_sin_metrado(uuid) to authenticated;

create or replace function public.enviar_parte(p_id uuid, p_crew_id uuid default null, p_fecha date default null)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v public.work_orders;
  v_sup uuid;
  v_cuadrilla text;
  v_faltan text[];
begin
  v := public.parte_por(p_id, p_crew_id, p_fecha);
  if v.id is null then raise exception 'SIGOV: ese parte todavía no llega a la nube'; end if;
  if not public.puede_llevar_parte(v) then
    raise exception 'SIGOV: ese parte es de otra cuadrilla' using errcode = '42501';
  end if;
  if v.status = 'enviado' then return json_build_object('estado', 'enviado'); end if;
  if v.status = 'validado' then raise exception 'SIGOV: el parte ya está validado'; end if;
  if not exists (select 1 from public.work_entries e where e.work_order_id = v.id and e.deleted_at is null) then
    raise exception 'SIGOV: registra al menos una actividad antes de enviar el reporte';
  end if;
  -- CASO 15: con fotos pero sin metrado, el reporte sigue incompleto
  v_faltan := public.parte_sin_metrado(v.id);
  if cardinality(v_faltan) > 0 then
    raise exception 'SIGOV: reporte incompleto: % sin metrado (%). Registra el metrado antes de enviarlo',
      case when cardinality(v_faltan) = 1 then '1 actividad' else cardinality(v_faltan) || ' actividades' end,
      array_to_string(v_faltan, ', ');
  end if;

  update public.work_orders set status = 'enviado', submitted_at = now(), updated_at = now() where id = v.id;

  -- El supervisor de la cuadrilla se entera; si no tiene, los supervisores del contrato
  select c.supervisor_id, c.name into v_sup, v_cuadrilla from public.crews c where c.id = v.crew_id;
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v.service_id, p, 'parte_enviado',
         format('Reporte diario %s · %s', to_char(v.work_date, 'DD/MM/YYYY'), coalesce(v_cuadrilla, '')),
         'Listo para validar', '/campo/' || v.id, 'info', jsonb_build_object('work_order_id', v.id)
    from (select v_sup as p where v_sup is not null
          union
          select m.profile_id from public.service_members m
           where v_sup is null and m.service_id = v.service_id and m.role = 'supervisor') x;

  return json_build_object('estado', 'enviado');
end $function$;

create or replace function public.revisar_parte(p_id uuid, p_validar boolean, p_nota text default null)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v public.work_orders;
  v_lider uuid;
  v_faltan text[];
begin
  v := public.parte_por(p_id);
  if v.id is null then raise exception 'SIGOV: ese parte ya no existe'; end if;
  if not public.revisa_cuadrilla(v.service_id, v.crew_id) then
    raise exception 'SIGOV: solo el supervisor de la cuadrilla, el residente o el administrador validan u observan este parte' using errcode = '42501';
  end if;
  if v.status <> 'enviado' then
    raise exception 'SIGOV: el parte no está enviado (está %)', v.status;
  end if;
  if not p_validar and nullif(trim(p_nota), '') is null then
    raise exception 'SIGOV: escribe la observación: el jefe de cuadrilla necesita saber qué corregir';
  end if;
  if p_validar then
    v_faltan := public.parte_sin_metrado(v.id);
    if cardinality(v_faltan) > 0 then
      raise exception 'SIGOV: no se puede validar: % sin metrado (%). Obsérvalo para que el jefe lo complete',
        case when cardinality(v_faltan) = 1 then '1 actividad' else cardinality(v_faltan) || ' actividades' end,
        array_to_string(v_faltan, ', ');
    end if;
  end if;

  update public.work_orders
     set status = case when p_validar then 'validado'::public.work_order_status else 'observado'::public.work_order_status end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         review_notes = case when p_validar then review_notes else trim(p_nota) end,
         updated_at = now()
   where id = v.id;

  -- La observación anterior queda resuelta al validar
  if p_validar then
    update public.notifications set read_at = coalesce(read_at, now())
     where type = 'parte_observado' and (data->>'work_order_id')::uuid = v.id;
  end if;

  if not p_validar then
    select c.leader_id into v_lider from public.crews c where c.id = v.crew_id;
    if v_lider is not null then
      insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
      values (v.service_id, v_lider, 'parte_observado',
              format('Reporte diario del %s observado', to_char(v.work_date, 'DD/MM/YYYY')),
              trim(p_nota), '/campo/' || v.id, 'warning', jsonb_build_object('work_order_id', v.id));
    end if;
  end if;
  return json_build_object('estado', case when p_validar then 'validado' else 'observado' end);
end $function$;

-- ── 3 · Historial de versiones (CASO 14) ───────────────────────────────────
create table if not exists public.parte_revisiones (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  service_id uuid not null references public.services(id),
  version smallint not null,
  accion text not null check (accion in ('enviado', 'observado', 'validado')),
  nota text,
  por uuid references public.profiles(id),
  at timestamptz not null default clock_timestamp(),
  actividades integer,
  metrado_total numeric,
  /** Lo que se envió en esa versión: actividad, metrado, unidad y progresivas. */
  detalle jsonb
);
create index if not exists parte_revisiones_wo on public.parte_revisiones (work_order_id, at);

alter table public.parte_revisiones enable row level security;
drop policy if exists parte_revisiones_select on public.parte_revisiones;
-- Lo ve quien ve el parte (work_orders ya acota por cuadrilla y rol)
create policy parte_revisiones_select on public.parte_revisiones for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = parte_revisiones.work_order_id));

create or replace function public.t_parte_revision_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version smallint;
  v_detalle jsonb;
begin
  if new.status is not distinct from old.status
     or new.status::text not in ('enviado', 'observado', 'validado') then
    return new;
  end if;
  select coalesce(max(version), 0) into v_version from public.parte_revisiones where work_order_id = new.id;
  if new.status::text = 'enviado' then v_version := v_version + 1; end if;
  if v_version = 0 then v_version := 1; end if;

  select jsonb_agg(jsonb_build_object(
           'actividad', coalesce(a.name, 'Actividad'), 'codigo', a.code,
           'metrado', e.quantity, 'unidad', u.symbol,
           'prog_inicio', e.prog_start_m, 'prog_fin', e.prog_end_m) order by e.created_at)
    into v_detalle
    from public.work_entries e
    left join public.activities_catalog a on a.id = e.activity_id
    left join public.units u on u.id = a.unit_id
   where e.work_order_id = new.id and e.deleted_at is null;

  insert into public.parte_revisiones (work_order_id, service_id, version, accion, nota, por, at, actividades, metrado_total, detalle)
  values (new.id, new.service_id, v_version, new.status::text,
          case when new.status::text = 'observado' then new.review_notes end,
          auth.uid(), clock_timestamp(),
          coalesce(jsonb_array_length(v_detalle), 0),
          (select sum((x->>'metrado')::numeric) from jsonb_array_elements(coalesce(v_detalle, '[]')) x),
          v_detalle);
  return new;
end $$;

drop trigger if exists t_parte_revision_historial on public.work_orders;
create trigger t_parte_revision_historial after update of status on public.work_orders
  for each row execute function public.t_parte_revision_historial();

-- Lo ya enviado o revisado antes de hoy entra como versión 1
insert into public.parte_revisiones (work_order_id, service_id, version, accion, por, at)
select w.id, w.service_id, 1, 'enviado', w.created_by, w.submitted_at
  from public.work_orders w
 where w.submitted_at is not null and w.deleted_at is null
   and not exists (select 1 from public.parte_revisiones r where r.work_order_id = w.id);
insert into public.parte_revisiones (work_order_id, service_id, version, accion, nota, por, at)
select w.id, w.service_id, 1, w.status::text,
       case when w.status::text = 'observado' then w.review_notes end, w.reviewed_by, w.reviewed_at
  from public.work_orders w
 where w.status::text in ('observado', 'validado') and w.reviewed_at is not null and w.deleted_at is null
   and not exists (select 1 from public.parte_revisiones r where r.work_order_id = w.id and r.accion <> 'enviado');

create or replace function public.parte_historial(p_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'version', r.version, 'accion', r.accion, 'nota', r.nota, 'at', r.at,
           'por', p.full_name, 'actividades', r.actividades,
           'metrado_total', r.metrado_total, 'detalle', r.detalle) order by r.at, r.id), '[]'::json)
    from public.parte_revisiones r
    left join public.profiles p on p.id = r.por
   where r.work_order_id = p_id
$$;
revoke all on function public.parte_historial(uuid) from public, anon;
grant execute on function public.parte_historial(uuid) to authenticated;
