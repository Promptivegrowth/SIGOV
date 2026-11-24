-- 0172 · Catálogos › Materiales: cambiar el consumo referencial (coeficiente) pide motivo y queda en la bitácora.
create or replace function public.rendimiento_material_guardar(p_id uuid, p_cantidad numeric, p_motivo text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare r public.rendimientos;
begin
  select * into r from public.rendimientos where id = p_id for update;
  if not found then raise exception 'SIGOV: el consumo no existe'; end if;
  if not public.es_admin(r.service_id) then raise exception 'SIGOV: el catálogo lo mantiene el Administrador' using errcode = '42501'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'SIGOV: el consumo debe ser mayor que cero'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'SIGOV: escribe el motivo del cambio'; end if;
  perform set_config('sigov.motivo', trim(p_motivo), true);
  update public.rendimientos set cantidad = p_cantidad, nota = trim(p_motivo), updated_by = auth.uid(), updated_at = now() where id = p_id;
  perform set_config('sigov.motivo', '', true);
  return json_build_object('ok', true);
end $$;
revoke all on function public.rendimiento_material_guardar(uuid, numeric, text) from public, anon;
grant execute on function public.rendimiento_material_guardar(uuid, numeric, text) to authenticated;
notify pgrst, 'reload schema';
