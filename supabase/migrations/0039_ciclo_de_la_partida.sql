-- ═══════════════════════════════════════════════════════════════════════
-- 0039 · El ciclo de vida de una partida programada
--
-- Hasta ahora la partida solo cambiaba de estado por efecto secundario:
-- el trigger del metrado la ponía en curso y, al llegar a la meta, la
-- daba por ejecutada. La cuadrilla nunca dice «empecé» ni «terminé», y
-- cuando no puede trabajar —no llegó el material, la vía está cerrada,
-- llueve— no tiene dónde decirlo: la partida se queda en pendiente y el
-- supervisor cree que nadie la miró.
--
-- La especificación pide cuatro acciones de campo y cinco estados:
--
--   programado  ──Iniciar──▶  en_curso  ──Finalizar──▶  por_validar
--        │                        │                          │
--        └──Reportar impedimento──┴──▶ suspendido            └──Validar──▶ ejecutado
--
-- Reglas que se respetan aquí y no en la pantalla, porque la pantalla se
-- puede saltar:
--   · nadie finaliza una partida sin haberla empezado;
--   · nadie valida lo que la cuadrilla no ha dado por terminado;
--   · quien ejecuta no valida: el jefe de cuadrilla cierra, el supervisor
--     acepta. Si fueran la misma persona no habría control.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Lo que hay que recordar de cada paso ─────────────────────────────

alter table public.plan_items
  add column if not exists started_at      timestamptz,
  add column if not exists started_by      uuid references public.profiles(id),
  add column if not exists finished_at     timestamptz,
  add column if not exists finished_by     uuid references public.profiles(id),
  add column if not exists validated_at    timestamptz,
  add column if not exists validated_by    uuid references public.profiles(id),
  add column if not exists impedimento     text,
  add column if not exists impedimento_at  timestamptz,
  add column if not exists impedimento_by  uuid references public.profiles(id);

comment on column public.plan_items.impedimento is
  'Por qué la cuadrilla no pudo ejecutar. Sustenta la reprogramación ante el cliente.';

-- ─── El avance ya no cierra la partida por su cuenta ──────────────────
--
-- Que el metrado llegue a la meta es motivo para avisar, no para dar por
-- buena la partida. La cuadrilla la cierra; el supervisor la acepta.

create or replace function public.sync_plan_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item uuid;
  v_hecho numeric;
  v_meta numeric;
  v_estado plan_item_status;
begin
  v_item := coalesce(new.plan_item_id, old.plan_item_id);
  if v_item is null then return coalesce(new, old); end if;

  select coalesce(sum(we.quantity), 0) into v_hecho
    from public.work_entries we
   where we.plan_item_id = v_item and we.deleted_at is null;

  select pi.target_qty, pi.status into v_meta, v_estado
    from public.plan_items pi where pi.id = v_item;

  update public.plan_items pi
     set executed_qty = v_hecho,
         status = case
           -- Lo que ya pasó por manos del supervisor no se toca
           when v_estado in ('ejecutado','cancelado','reprogramado') then v_estado
           -- Tampoco se pisa lo que la cuadrilla ya dio por terminado
           when v_estado = 'por_validar' then v_estado
           -- Un impedimento se levanta registrando avance, no solo
           -- porque llegue un metrado: eso lo decide la cuadrilla
           when v_estado = 'suspendido' then v_estado
           when v_hecho > 0 then 'en_curso'::plan_item_status
           else v_estado
         end,
         started_at = case
           when pi.started_at is null and v_hecho > 0 then now()
           else pi.started_at end
   where pi.id = v_item;

  return coalesce(new, old);
end $$;

-- ─── Iniciar ──────────────────────────────────────────────────────────

create or replace function public.partida_iniciar(p_item uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fila public.plan_items;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.can_write(v_fila.service_id) then
    raise exception 'SIGOV: no tienes permiso sobre este servicio';
  end if;

  if v_fila.status not in ('programado','suspendido') then
    raise exception 'SIGOV: la partida ya está %', v_fila.status;
  end if;

  update public.plan_items
     set status = 'en_curso',
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid()),
         -- Al retomar, el impedimento deja de estar vigente
         impedimento = null, impedimento_at = null, impedimento_by = null
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $$;

-- ─── Finalizar ────────────────────────────────────────────────────────

create or replace function public.partida_finalizar(p_item uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fila public.plan_items;
  v_registros int;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.can_write(v_fila.service_id) then
    raise exception 'SIGOV: no tienes permiso sobre este servicio';
  end if;

  if v_fila.status not in ('en_curso','programado') then
    raise exception 'SIGOV: la partida está % y no se puede finalizar', v_fila.status;
  end if;

  -- Cerrar sin haber registrado nada dejaría una partida culminada con
  -- cero metrado, que en la valorización no sustenta ni un sol
  select count(*) into v_registros
    from public.work_entries we
   where we.plan_item_id = p_item and we.deleted_at is null;

  if v_registros = 0 then
    raise exception 'SIGOV: registra primero el avance ejecutado';
  end if;

  update public.plan_items
     set status = 'por_validar',
         finished_at = now(),
         finished_by = auth.uid()
   where id = p_item;

  return json_build_object('estado', 'por_validar');
end $$;

-- ─── Reportar impedimento ─────────────────────────────────────────────

create or replace function public.partida_impedimento(p_item uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fila public.plan_items;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'SIGOV: escribe por qué no se pudo ejecutar';
  end if;

  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;
  if not public.can_write(v_fila.service_id) then
    raise exception 'SIGOV: no tienes permiso sobre este servicio';
  end if;

  if v_fila.status in ('ejecutado','cancelado') then
    raise exception 'SIGOV: la partida ya está cerrada';
  end if;

  update public.plan_items
     set status = 'suspendido',
         impedimento = trim(p_motivo),
         impedimento_at = now(),
         impedimento_by = auth.uid()
   where id = p_item;

  -- El supervisor se entera ahora, no cuando revise el parte del día
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select
    v_fila.service_id,
    m.profile_id,
    'partida_impedida',
    format('%s no pudo ejecutarse', coalesce(a.name, 'Una partida')),
    left(trim(p_motivo), 160),
    '/programacion',
    'warning',
    jsonb_build_object('plan_item_id', p_item)
  from public.service_members m
  left join public.activities_catalog a on a.id = v_fila.activity_id
  where m.service_id = v_fila.service_id
    and m.role in ('admin','supervisor');

  return json_build_object('estado', 'suspendido');
end $$;

-- ─── Validar (solo el supervisor) ─────────────────────────────────────

create or replace function public.partida_validar(p_item uuid, p_aceptar boolean default true, p_nota text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_fila public.plan_items;
begin
  select * into v_fila from public.plan_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: esa partida ya no existe'; end if;

  -- Quien ejecuta no valida: si fueran el mismo, el control no existe
  if not public.can_manage(v_fila.service_id) then
    raise exception 'SIGOV: solo el supervisor o el administrador validan partidas';
  end if;

  if v_fila.status <> 'por_validar' then
    raise exception 'SIGOV: la cuadrilla todavía no dio por terminada esta partida';
  end if;

  if p_aceptar then
    update public.plan_items
       set status = 'ejecutado',
           validated_at = now(),
           validated_by = auth.uid(),
           notes = coalesce(nullif(trim(p_nota), ''), notes)
     where id = p_item;
    return json_build_object('estado', 'ejecutado');
  end if;

  -- Devolver a campo: vuelve a estar en curso, con el motivo a la vista
  update public.plan_items
     set status = 'en_curso',
         finished_at = null,
         finished_by = null,
         impedimento = coalesce(nullif(trim(p_nota), ''), 'Devuelta por el supervisor'),
         impedimento_at = now(),
         impedimento_by = auth.uid()
   where id = p_item;

  return json_build_object('estado', 'en_curso');
end $$;

grant execute on function
  public.partida_iniciar(uuid),
  public.partida_finalizar(uuid),
  public.partida_impedimento(uuid, text),
  public.partida_validar(uuid, boolean, text)
to authenticated;
