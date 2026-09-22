-- ═══════════════════════════════════════════════════════════════════════
-- 0032 · La unidad del metrado no se pregunta dos veces
--
-- El parte que llega de la app nativa trae la cantidad pero no la unidad,
-- y en el panel el registro aparece como «400.0» a secas: no se sabe si
-- son metros, metros cuadrados o unidades. La app se puede corregir, pero
-- el hueco seguiría abierto para cualquier otro cliente que escriba.
--
-- La unidad es una propiedad de la actividad, no algo que el capataz deba
-- escoger: «limpieza de cunetas» se mide en metros siempre. Así que si el
-- registro llega sin unidad, se toma la de la actividad.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.unidad_por_defecto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.unit_id is null then
    select a.unit_id into new.unit_id
      from public.activities_catalog a
     where a.id = new.activity_id;
  end if;
  return new;
end $$;

drop trigger if exists t_we_unidad on public.work_entries;
create trigger t_we_unidad
  before insert or update of activity_id, unit_id on public.work_entries
  for each row execute function public.unidad_por_defecto();

-- Y lo ya registrado sin unidad se completa igual
update public.work_entries we
   set unit_id = a.unit_id
  from public.activities_catalog a
 where a.id = we.activity_id
   and we.unit_id is null
   and a.unit_id is not null;
