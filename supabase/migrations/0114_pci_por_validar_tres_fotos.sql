-- ═══════════════════════════════════════════════════════════════════════
-- 0114 · REV3-OBS-03: un ítem PCI no pasa a «Por validar» sin sus tres fotos
--
-- El levantamiento automático ya pedía antes, durante y después
-- (t_pci_item_por_fotos); el botón «Levantar ítem» del panel pedía solo el
-- antes y el después, y así nacía un «atendido» con D 0/1. Ahora pide las
-- tres, como el automático.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.pci_levantar(p_item uuid, p_nota text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fila    public.pci_items;
  v_antes   int;
  v_durante int;
  v_despues int;
  v_metrado numeric;
  v_nuevo   public.pci_item_status;
begin
  select * into v_fila from public.pci_items where id = p_item and deleted_at is null;
  if not found then raise exception 'SIGOV: ese ítem ya no existe'; end if;
  if not public.puede_atender_item(v_fila) then
    raise exception 'SIGOV: ese ítem es de otra cuadrilla' using errcode = '42501';
  end if;
  if v_fila.status not in ('pendiente', 'en_atencion', 'observado') then
    raise exception 'SIGOV: el ítem ya está %', v_fila.status;
  end if;

  if v_fila.requires_evidence then
    select count(*) filter (where e.phase = 'antes'),
           count(*) filter (where e.phase = 'durante'),
           count(*) filter (where e.phase = 'despues')
      into v_antes, v_durante, v_despues
      from public.evidences e
     where e.pci_item_id = p_item and e.deleted_at is null;
    if v_antes = 0 then
      raise exception 'SIGOV: falta la foto del antes';
    end if;
    if v_durante = 0 then
      raise exception 'SIGOV: falta la foto del durante: con las tres fotos el ítem pasa a «Por validar»';
    end if;
    if v_despues = 0 then
      raise exception 'SIGOV: falta la foto del después, que es la que sustenta el levantamiento';
    end if;
  end if;

  -- El metrado lo registra la cuadrilla; quien administra puede levantar
  -- desde la oficina un ítem que no se mide
  if not public.can_manage(v_fila.service_id) then
    select coalesce(sum(w.quantity), 0) into v_metrado
      from public.work_entries w
     where w.pci_item_id = p_item and w.deleted_at is null;
    if v_metrado <= 0 then
      raise exception 'SIGOV: registra primero el metrado ejecutado de este ítem';
    end if;
  end if;

  v_nuevo := case when v_fila.status = 'observado' then 'subsanado' else 'levantado' end;

  update public.pci_items
     set status = v_nuevo,
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(trim(p_nota), ''), notes)
   where id = p_item;

  -- Quien lleva el contrato se entera de que hay algo que validar, y el
  -- aviso abre ese ítem (REV3-OBS-49)
  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select v_fila.service_id, m.profile_id, 'pci_levantado',
         format('%s · ítem %s %s', p.code, v_fila.item_number,
                case when v_nuevo = 'subsanado' then 'subsanado, por validar' else 'por validar' end),
         left(v_fila.description, 160), '/pci/' || v_fila.pci_id || '?item=' || p_item, 'info',
         jsonb_build_object('pci_item_id', p_item, 'pci_id', v_fila.pci_id)
    from public.service_members m
    join public.pcis p on p.id = v_fila.pci_id
   where m.service_id = v_fila.service_id and m.role in ('admin', 'supervisor', 'residente', 'visor');

  return json_build_object('estado', v_nuevo);
end $$;
