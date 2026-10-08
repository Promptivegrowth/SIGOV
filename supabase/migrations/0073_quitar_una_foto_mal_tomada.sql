-- ═══════════════════════════════════════════════════════════════════════
-- 0073 · Quitar una foto mal tomada
--
-- El jefe de cuadrilla debe poder eliminar o reemplazar una foto mientras
-- no se haya validado oficialmente (OBS-21). Editar fotos es de quien
-- administra —la política de UPDATE de evidences lo exige— y no conviene
-- abrirle al jefe la edición general de evidencias. Esta función hace solo
-- eso: dar de baja una foto suya, si nadie la validó, y queda en la
-- auditoría.
--
-- Una foto no se puede quitar si sustenta un ítem PCI ya validado o
-- levantado, o un parte ya validado: ese sustento ya se le presentó al
-- cliente.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.dar_de_baja_evidencia(p_client_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v public.evidences;
  v_pci public.pci_item_status;
  v_parte text;
begin
  select * into v from public.evidences where client_id = p_client_id;
  if v.id is null then return; end if;              -- nunca llegó: nada que hacer
  if v.deleted_at is not null then return; end if;  -- ya estaba dada de baja

  if not (v.created_by = auth.uid() or public.can_manage(v.service_id)) then
    raise exception 'SIGOV: solo quien tomó la foto o el supervisor pueden quitarla'
      using errcode = '42501';
  end if;

  select i.status into v_pci from public.pci_items i where i.id = v.pci_item_id;
  if v_pci in ('levantado', 'validado') then
    raise exception 'SIGOV: esa foto ya sustenta un ítem PCI levantado o validado; no se puede quitar';
  end if;

  select o.status::text into v_parte
    from public.work_entries we join public.work_orders o on o.id = we.work_order_id
   where we.id = v.work_entry_id;
  if v_parte in ('validado', 'aprobado') then
    raise exception 'SIGOV: esa foto es de un parte ya validado; no se puede quitar';
  end if;

  update public.evidences set deleted_at = now() where id = v.id;
end $$;

revoke execute on function public.dar_de_baja_evidencia(uuid) from public, anon;
grant execute on function public.dar_de_baja_evidencia(uuid) to authenticated;

-- Las fotos, a la auditoría: quién la subió, quién la quitó y cuándo
drop trigger if exists t_audit_evidences on public.evidences;
create trigger t_audit_evidences after insert or update or delete on public.evidences
  for each row execute function public.audit_trigger();
