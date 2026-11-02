-- ═══════════════════════════════════════════════════════════════════════
-- 0113 · REV3-OBS-12 (CRÍTICA): un avance no se duplica al sincronizar
--
-- En la prueba de Elvis (22/10, cuadrilla 2) la misma partida quedó dos
-- veces en el mismo parte: 10 und + 10 und = 20 und. La app ya reutiliza el
-- registro de la partida, pero la base no lo impedía. Ahora, si desde la app
-- llega un segundo registro de la misma partida (o del mismo ítem PCI) en el
-- mismo parte, no suma: queda como copia del primero (duplicado_de), dado de
-- baja, y su metrado reemplaza al del primero (es el mismo trabajo del día,
-- quizá corregido). Lo que cuelga de la copia —fotos, equipos, movimientos—
-- pasa al registro original, también lo que llegue después.
--
-- Solo se mira lo que llega con client_id (desde la app): los avances
-- parciales que el panel registra a mano no se tocan.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.work_entries add column if not exists duplicado_de uuid references public.work_entries(id);

create or replace function public.t_avance_sin_duplicar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_original uuid;
begin
  if new.client_id is null or new.deleted_at is not null
     or (new.plan_item_id is null and new.pci_item_id is null) then
    return new;
  end if;
  -- Dos envíos a la vez de la misma partida se ordenan aquí
  perform pg_advisory_xact_lock(hashtext(new.work_order_id::text || coalesce(new.plan_item_id, new.pci_item_id)::text));

  select we.id into v_original
    from public.work_entries we
   where we.work_order_id = new.work_order_id
     and we.deleted_at is null
     and we.client_id is not null
     and we.client_id <> new.client_id
     and ((new.plan_item_id is not null and we.plan_item_id = new.plan_item_id)
       or (new.plan_item_id is null and new.pci_item_id is not null and we.pci_item_id = new.pci_item_id))
   order by we.created_at
   limit 1;

  if v_original is not null then
    new.duplicado_de := v_original;
    new.deleted_at := now();
    if coalesce(new.quantity, 0) > 0 then
      update public.work_entries set quantity = new.quantity where id = v_original and quantity is distinct from new.quantity;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_avance_sin_duplicar on public.work_entries;
create trigger t_avance_sin_duplicar before insert on public.work_entries
  for each row execute function public.t_avance_sin_duplicar();

-- La corrección que la app haga sobre la copia llega al original
create or replace function public.t_avance_copia_corrige()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.duplicado_de is null then return new; end if;
  new.deleted_at := old.deleted_at;   -- la copia sigue de baja
  if new.quantity is distinct from old.quantity and coalesce(new.quantity, 0) > 0 then
    update public.work_entries set quantity = new.quantity where id = old.duplicado_de;
  end if;
  return new;
end $$;

drop trigger if exists t_avance_copia_corrige on public.work_entries;
create trigger t_avance_copia_corrige before update on public.work_entries
  for each row when (old.duplicado_de is not null)
  execute function public.t_avance_copia_corrige();

-- Lo que cuelga de una copia pasa al original
create or replace function public.t_al_avance_original()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_original uuid;
begin
  if new.work_entry_id is null then return new; end if;
  select duplicado_de into v_original from public.work_entries where id = new.work_entry_id;
  if v_original is not null then new.work_entry_id := v_original; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['evidences', 'parte_recursos', 'movimientos_cuadrilla', 'asset_interventions', 'evidence_links'] loop
    execute format('drop trigger if exists t_al_avance_original on public.%I', t);
    execute format('create trigger t_al_avance_original before insert or update of work_entry_id on public.%I
                      for each row execute function public.t_al_avance_original()', t);
  end loop;
end $$;

-- ─── El caso de la prueba: el segundo 10 und del 22/10 ────────────────
update public.work_entries d
   set duplicado_de = o.id, deleted_at = now()
  from public.work_entries o
 where d.id = 'a40f82bd-d86b-4e1a-ba38-f78372ed77f2'
   and o.id = '07e69ab4-02af-4b12-8717-6d169b051b35'
   and d.deleted_at is null;
update public.evidences set work_entry_id = '07e69ab4-02af-4b12-8717-6d169b051b35'
 where work_entry_id = 'a40f82bd-d86b-4e1a-ba38-f78372ed77f2';
