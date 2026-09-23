-- ═══════════════════════════════════════════════════════════════════════
-- 0049 · Cada fotografía, a su elemento
--
-- La 0048 enlazaba cada foto con *todos* los elementos que la cuadrilla
-- alcanzó en su tramo de trabajo: 2 156 fotos produjeron 36 867 enlaces. La
-- cuenta da la idea de lo que estaba mal. Si la cuadrilla limpia cunetas de
-- 150+000 a 150+300 y ahí hay doce alcantarillas, la foto del «antes»
-- muestra un punto concreto, no las doce; colgarla de todas hace que la
-- ficha de once elementos enseñe la foto de otro.
--
-- Y eso rompe justamente lo que Elvis quiere mirar: «reviso una alcantarilla
-- y ahí me tiene que aparecer el detalle, una foto y la fecha». La foto
-- tiene que ser de esa alcantarilla.
--
-- Cada evidencia trae su propia progresiva y su coordenada, así que se
-- cuelga del elemento más cercano y de ninguno más.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── El enlace, por cercanía ───────────────────────────────────────────

create or replace function public.enlazar_evidencia_al_activo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_prog numeric;
  v_seccion uuid;
  v_activo uuid;
  v_tolerancia numeric := 60;   -- metros: más lejos ya es otro elemento
begin
  if new.work_entry_id is null then
    return new;
  end if;

  -- La progresiva de la foto manda; si no la trae, la del registro que
  -- sustenta, que es donde dijo el capataz que estaba trabajando.
  v_prog := new.progresiva_m;
  v_seccion := new.section_id;

  if v_prog is null or v_seccion is null then
    select coalesce(v_seccion, w.section_id),
           coalesce(v_prog, (w.prog_start_m + coalesce(w.prog_end_m, w.prog_start_m)) / 2)
      into v_seccion, v_prog
    from public.work_entries w where w.id = new.work_entry_id;
  end if;

  if v_prog is null or v_seccion is null then
    return new;
  end if;

  -- El elemento más cercano de los que esa misma ejecución intervino
  select a.id into v_activo
  from public.asset_interventions i
  join public.road_assets a on a.id = i.asset_id
  where i.work_entry_id = new.work_entry_id
    and a.section_id = v_seccion
    and a.deleted_at is null
    and abs(a.progresiva_m - v_prog) <= v_tolerancia
  order by abs(a.progresiva_m - v_prog)
  limit 1;

  if v_activo is null then
    return new;
  end if;

  insert into public.evidence_links (
    evidence_id, service_id, work_entry_id, asset_id, created_by, note
  )
  select new.id, new.service_id, new.work_entry_id, v_activo, new.created_by,
         'Enlazada desde la ejecución en campo'
  where not exists (
    select 1 from public.evidence_links l
    where l.evidence_id = new.id and l.asset_id = v_activo
  );

  return new;
end $$;

-- ─── Los enlaces ya creados, rehechos con el mismo criterio ────────────

delete from public.evidence_links
where asset_id is not null
  and note in ('Enlazada desde la ejecución en campo',
               'Reconstruido de la ejecución ya registrada');

insert into public.evidence_links (evidence_id, service_id, work_entry_id, asset_id, note)
select e.id, e.service_id, e.work_entry_id, cercano.asset_id,
       'Reconstruido de la ejecución ya registrada'
from public.evidences e
cross join lateral (
  select i.asset_id
  from public.asset_interventions i
  join public.road_assets a on a.id = i.asset_id
  where i.work_entry_id = e.work_entry_id
    and a.deleted_at is null
    and a.section_id = coalesce(
          e.section_id,
          (select w.section_id from public.work_entries w where w.id = e.work_entry_id))
    and abs(a.progresiva_m - coalesce(
          e.progresiva_m,
          (select (w.prog_start_m + coalesce(w.prog_end_m, w.prog_start_m)) / 2
             from public.work_entries w where w.id = e.work_entry_id))) <= 60
  order by abs(a.progresiva_m - coalesce(
          e.progresiva_m,
          (select (w.prog_start_m + coalesce(w.prog_end_m, w.prog_start_m)) / 2
             from public.work_entries w where w.id = e.work_entry_id)))
  limit 1
) cercano
where e.work_entry_id is not null
  and e.deleted_at is null
  and not exists (
    select 1 from public.evidence_links l
    where l.evidence_id = e.id and l.asset_id = cercano.asset_id
  );
