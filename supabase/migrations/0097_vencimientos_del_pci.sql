-- ═══════════════════════════════════════════════════════════════════════
-- 0097 · El vencimiento del PCI (Elvis, P2) y el encargado de cada cuadrilla
--
-- P2: los plazos (1, 2, 3, 7 y 14 días) «cuentan a partir del día
-- siguiente, cuando registra en el aplicativo el supervisor o
-- administrador», y al registrar debe poder fijarse la fecha de
-- vencimiento de cada plazo, «para que el aplicativo cuantifique en base a
-- lo que se estableció desde un principio».
--
-- · pcis.registered_on: el día en que se registró en SIGOV. El plazo de N
--   días vence el registro + N (el día 1 es el siguiente al registro).
-- · pcis.vencimientos: las fechas fijadas a mano, {"1": "2026-10-08", …}.
--   Si un plazo no tiene fecha fijada, se calcula.
--
-- Encargado: el Excel de control del PCI (PCI 55) nombra al jefe, no a la
-- cuadrilla («JOSE RAMOS», «HUVER»…). crews.jefe_nombre es ese nombre, para
-- que el importador asigne la cuadrilla aunque el jefe no tenga usuario.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pcis
  add column if not exists registered_on date,
  add column if not exists vencimientos jsonb not null default '{}'::jsonb;

-- Los que ya existían conservan su cuenta (desde la recepción o la notificación)
update public.pcis set registered_on = coalesce(received_on, notified_on, created_at::date)
 where registered_on is null;
alter table public.pcis alter column registered_on set default public.hoy_peru();
alter table public.pcis alter column registered_on set not null;

comment on column public.pcis.registered_on is 'Día en que se registró en SIGOV: los plazos cuentan desde el día siguiente (Elvis, P2)';
comment on column public.pcis.vencimientos is 'Fecha de vencimiento fijada para cada plazo, {"7": "2026-10-14"}; sin fecha, registro + plazo';

/** El vencimiento de un plazo en un PCI: la fecha fijada o el registro + plazo. */
create or replace function public.vencimiento_pci(p_pci uuid, p_plazo integer)
returns date
language sql
stable
set search_path to 'public'
as $$
  select coalesce((p.vencimientos ->> p_plazo::text)::date, p.registered_on + p_plazo)
    from public.pcis p where p.id = p_pci
$$;

create or replace function public.pci_item_before_write()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.due_date is null then
    if new.term_days is null then
      select coalesce(p.default_days, 7) into new.term_days from public.pcis p where p.id = new.pci_id;
    end if;
    new.due_date := coalesce(public.vencimiento_pci(new.pci_id, new.term_days), public.hoy_peru() + new.term_days);
  end if;
  return new;
end $$;

-- Fijar el plazo de varios ítems: su vencimiento sale de la tabla del PCI
do $$
declare
  antes text := pg_get_functiondef('public.pci_fijar_plazo(uuid[], integer, text)'::regprocedure);
  despues text;
begin
  despues := replace(antes, 'due_date = coalesce(p.received_on, p.notified_on) + p_plazo,',
                            'due_date = public.vencimiento_pci(p.id, p_plazo),');
  if despues = antes then raise exception 'SIGOV 0097: pci_fijar_plazo cambió'; end if;
  execute despues;
end $$;

/**
 * Fija las fechas de vencimiento de cada plazo de un PCI y las aplica a sus
 * ítems abiertos. Una fecha vacía vuelve al cálculo (registro + plazo).
 */
create or replace function public.pci_fijar_vencimientos(p_pci uuid, p_fechas jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.pcis;
  v_plazos jsonb;
  v_limpias jsonb := '{}'::jsonb;
  k text;
  v text;
  v_n int;
begin
  select * into p from public.pcis where id = p_pci and deleted_at is null;
  if not found then raise exception 'SIGOV: el PCI no existe'; end if;
  if not public.can_manage(p.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador fija los vencimientos' using errcode = '42501';
  end if;
  v_plazos := (public.ajustes_del_servicio(p.service_id)::jsonb)->'pci'->'plazos';

  for k, v in select key, value from jsonb_each_text(coalesce(p_fechas, '{}'::jsonb)) loop
    if not (v_plazos @> to_jsonb(k::int)) then
      raise exception 'SIGOV: % días no es un plazo del contrato', k;
    end if;
    if nullif(trim(v), '') is null then continue; end if;
    if v::date <= p.registered_on then
      raise exception 'SIGOV: el vencimiento de % días debe ser posterior al registro (%)', k, to_char(p.registered_on, 'DD/MM/YYYY');
    end if;
    v_limpias := v_limpias || jsonb_build_object(k, v::date);
  end loop;

  update public.pcis set vencimientos = v_limpias, updated_at = now() where id = p.id;

  update public.pci_items i
     set due_date = public.vencimiento_pci(p.id, i.term_days), updated_at = now()
   where i.pci_id = p.id and i.deleted_at is null and i.term_days is not null
     and i.status in ('pendiente', 'en_atencion', 'observado')
     and i.due_date is distinct from public.vencimiento_pci(p.id, i.term_days);
  get diagnostics v_n = row_count;

  return json_build_object('items', v_n, 'vencimientos', v_limpias);
end $$;

revoke execute on function public.pci_fijar_vencimientos(uuid, jsonb) from anon, public;
grant execute on function public.pci_fijar_vencimientos(uuid, jsonb) to authenticated;
grant execute on function public.vencimiento_pci(uuid, integer) to authenticated;

-- ─── El encargado de cada cuadrilla, como lo escribe el control del PCI ─
alter table public.crews add column if not exists jefe_nombre text;
comment on column public.crews.jefe_nombre is 'Nombre del jefe como figura en el control del PCI (ENCARGADO); asigna la cuadrilla al importar';

update public.crews c set jefe_nombre = m.jefe
  from (values (1, 'Jorge'), (2, 'Santos'), (3, 'Gustavo'), (4, 'José Ramos'),
               (5, 'Huver'), (6, 'Miguel'), (7, 'Junior')) as m(numero, jefe)
 where c.service_id = '22222222-2222-4222-8222-222222222221' and c.numero = m.numero
   and c.deleted_at is null and c.jefe_nombre is null;
