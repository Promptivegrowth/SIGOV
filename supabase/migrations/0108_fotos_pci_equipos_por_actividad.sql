-- ═══════════════════════════════════════════════════════════════════════
-- 0108 · Videos de Elvis del 21/10 (PCI y reporte diario)
--
-- 1. El encargado ve todas las fotos que tomó del ítem y puede quitar la
--    que salió mal mientras COVINCA no la valide. Con las tres etapas el
--    ítem pasa solo a «levantado» (atendido, por revisar): eso ya no impide
--    quitar una foto. Si al quitarla falta una etapa, el ítem vuelve a
--    ejecución (lo hace t_pci_item_por_fotos).
-- 2. Los equipos se anotan por actividad, como los materiales, y el reporte
--    los acumula: parte_recursos gana work_entry_id y toma el parte de su
--    actividad cuando llega sin él.
-- 3. Los ítems PCI de demostración apuntaban a partidas «MR-xx» que se
--    desactivaron al cargar el catálogo COVINCA: el reporte salía sin
--    código. Se pasan a su partida COV equivalente.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Quitar una foto de un ítem atendido, no validado ─────────────
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

  -- Atendido (con sus tres fotos) todavía se corrige; validado por COVINCA, no
  select i.status into v_pci from public.pci_items i where i.id = v.pci_item_id;
  if v_pci = 'validado' then
    raise exception 'SIGOV: esa foto ya sustenta un ítem PCI validado por COVINCA; no se puede quitar';
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

-- ─── 2. Equipos por actividad ────────────────────────────────────────
alter table public.parte_recursos
  add column if not exists work_entry_id uuid references public.work_entries(id) on delete set null;
create index if not exists parte_recursos_actividad on public.parte_recursos (work_entry_id) where work_entry_id is not null;

create or replace function public.t_parte_recurso_de_su_actividad()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Anotado en una actividad: el parte es el de esa actividad
  if new.work_entry_id is not null then
    select we.work_order_id into new.work_order_id from public.work_entries we where we.id = new.work_entry_id;
  end if;
  return new;
end $$;

drop trigger if exists t_parte_recurso_de_su_actividad on public.parte_recursos;
create trigger t_parte_recurso_de_su_actividad before insert or update of work_entry_id on public.parte_recursos
  for each row execute function public.t_parte_recurso_de_su_actividad();

-- ─── 3. Partidas COV para los PCI de demostración ────────────────────
do $$
declare
  m record;
begin
  for m in
    select s.id as viejo, n.id as nuevo, x.patron
      from (values
        ('MR-05', 'COV-OD-004', null),      -- Limpieza de alcantarillas → Descolmatación de alcantarilla
        ('MR-06', 'COV-OD-005', null),      -- Limpieza de cunetas → Descolmatación de drenes
        ('MR-10', 'COV-SV-005', 'R-'),      -- Señal reglamentaria
        ('MR-10', 'COV-SV-002', 'P-'),      -- Señal preventiva
        ('MR-10', 'COV-SV-015', 'I-'),      -- Señal informativa
        ('MR-13', 'COV-GV-003', null),      -- Guardavías: postes
        ('MR-16', 'COV-DV-001', null),      -- Desbroce en derecho de vía
        ('MR-17', 'COV-DV-007', null)       -- Residuos en derecho de vía
      ) as x(de, a, patron)
      join public.activities_catalog s on s.code = x.de and not s.is_active and s.deleted_at is null
      join public.activities_catalog n on n.code = x.a and n.service_id = s.service_id and n.is_active and n.deleted_at is null
  loop
    update public.pci_items i set activity_id = m.nuevo, updated_at = now()
     where i.activity_id = m.viejo
       and (m.patron is null or i.description ~* ('señal\s+' || m.patron));
    update public.work_entries e set activity_id = m.nuevo, updated_at = now()
     where e.activity_id = m.viejo and e.pci_item_id is not null
       and exists (select 1 from public.pci_items i where i.id = e.pci_item_id and i.activity_id = m.nuevo);
  end loop;
end $$;

-- Lo de MR-10 que no dice qué señal es: la reglamentaria, la más común
update public.pci_items i set activity_id = n.id, updated_at = now()
  from public.activities_catalog s, public.activities_catalog n
 where i.activity_id = s.id and s.code = 'MR-10' and not s.is_active and s.deleted_at is null
   and n.code = 'COV-SV-005' and n.service_id = s.service_id and n.is_active and n.deleted_at is null;
update public.work_entries e set activity_id = i.activity_id, updated_at = now()
  from public.pci_items i, public.activities_catalog s
 where e.pci_item_id = i.id and e.activity_id = s.id and not s.is_active and s.code like 'MR-%'
   and e.activity_id <> i.activity_id;
