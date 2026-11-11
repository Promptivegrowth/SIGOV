-- ═══════════════════════════════════════════════════════════════════════
-- 0121 · Cuentas compartidas por cuadrilla (respuestas de Elvis, 11/11)
--
-- El jefe y el subjefe de una cuadrilla entran con el mismo usuario desde
-- dos celulares («con el usuario de José Ramos ingresan José Ramos y
-- Augusto»), y lo mismo varios usuarios de COVINCA con el del visor.
--
-- 1. El subjefe figura en la cuadrilla: el control del PCI lo pone como
--    ENCARGADO (Augusto en el PCI 55) y el importador debe reconocerlo.
--
-- 2. El candado de 0113 tomaba como copia el segundo avance de una partida
--    en el mismo parte. Con dos celulares en la misma cuenta, ese segundo
--    avance puede ser trabajo distinto (el subjefe avanzó otro tramo de la
--    misma partida) y su metrado reemplazaba al del primero. Ahora cada
--    registro trae el celular que lo hizo, y solo es copia lo que repite un
--    mismo celular, que es el caso del 22/10. Un ítem PCI sigue siendo uno
--    solo aunque lo registren dos celulares: es un mismo defecto.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.crews add column if not exists subjefe_nombre text;
comment on column public.crews.subjefe_nombre is
  'Subjefe de cuadrilla como figura en el control del PCI (ENCARGADO); comparte la cuenta del jefe y asigna la cuadrilla al importar';

update public.crews set subjefe_nombre = 'Augusto'
 where service_id = '22222222-2222-4222-8222-222222222221' and numero = 4
   and deleted_at is null and subjefe_nombre is null;

alter table public.work_entries add column if not exists dispositivo text;
comment on column public.work_entries.dispositivo is
  'Instalación de la app que hizo el registro: dos celulares con la misma cuenta no se toman como duplicado';

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
     and ((new.plan_item_id is not null and we.plan_item_id = new.plan_item_id
           and we.dispositivo is not distinct from new.dispositivo)
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
