-- ═══════════════════════════════════════════════════════════════════════
-- 0076 · Iniciar la atención de un ítem PCI, con el tipo correcto
--
-- En 0075 el CASE que fija el estado devolvía text y Postgres no lo
-- convierte solo a pci_item_status: «Iniciar atención» fallaba siempre.
-- Lo encontró la prueba en el emulador. Se devuelve además el estado real:
-- un ítem observado que se retoma sigue observado (vuelve a la bandeja de
-- la cuadrilla) hasta que se subsana.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.pci_iniciar_atencion(p_item uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila  public.pci_items;
  v_nuevo public.pci_item_status;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status = 'en_atencion' then
    return json_build_object('estado', 'en_atencion');
  end if;
  if v_fila.status not in ('pendiente', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  v_nuevo := case when v_fila.status = 'observado'
                  then 'observado'::public.pci_item_status
                  else 'en_atencion'::public.pci_item_status end;

  update public.pci_items
     set status = v_nuevo,
         started_at = coalesce(started_at, now()),
         started_by = coalesce(started_by, auth.uid())
   where id = p_item;
  return json_build_object('estado', v_nuevo);
end $$;

grant execute on function public.pci_iniciar_atencion(uuid) to authenticated;
revoke execute on function public.pci_iniciar_atencion(uuid) from anon;
