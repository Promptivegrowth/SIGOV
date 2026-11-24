-- ═══════════════════════════════════════════════════════════════════════════
-- 0149 · Centro de reportes (revisión visual 18/11, ADMIN_Reportes_*_V2;
-- guía, función 15)
--
-- · familia_permitida: qué familias de reporte puede sacar cada rol, con el
--   «Ver» del módulo que el Administrador haya apagado en Roles y permisos.
-- · exportaciones: el historial de exportaciones de cada usuario, con sus
--   filtros originales y el archivo tal como salió (bucket privado
--   «exportaciones»). La descarga vuelve a comprobar el permiso: si al
--   usuario le retiraron el acceso, la exportación antigua ya no se baja.
-- · reporte_pci: la misma consulta del Inicio, ítem por ítem, con la
--   ejecución, la evidencia (faltantes por fase) y la conformidad COVINCA
--   por separado. El Visor solo ve lo publicado; el Supervisor, sus
--   cuadrillas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Familias por rol ──────────────────────────────────────────────────────
create or replace function public.familia_permitida(p_service uuid, p_familia text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_rol text := public.role_in(p_service)::text;
  v_modulo text;
  v_ver boolean;
begin
  if v_rol is null then return false; end if;
  if not (case p_familia
      when 'pci'           then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'niveles'       then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'programacion'  then v_rol in ('admin', 'supervisor', 'residente', 'visor')
      when 'diario'        then v_rol in ('admin', 'supervisor', 'residente')
      when 'ssoma'         then v_rol in ('admin', 'residente', 'ing_seguridad')
      when 'caja'          then v_rol in ('admin', 'residente')
      when 'auditoria'     then v_rol = 'admin'
      when 'observaciones' then v_rol in ('admin', 'supervisor', 'residente')
      when 'inventario'    then v_rol in ('admin', 'supervisor', 'residente')
      when 'recursos'      then v_rol in ('admin', 'residente')
      when 'rendimientos'  then v_rol in ('admin', 'supervisor', 'residente')
      when 'materiales'    then v_rol in ('admin', 'supervisor', 'residente')
      else false end) then
    return false;
  end if;
  -- El «Ver» que el Administrador apagó en Roles y permisos también corta la exportación
  if v_rol <> 'admin' then
    select ver into v_ver from public.permisos_rol where service_id = p_service and rol::text = v_rol and modulo = 'reportes';
    if v_ver is false then return false; end if;
    v_modulo := case p_familia when 'pci' then 'pci' when 'programacion' then 'programacion' when 'diario' then 'reporte_diario'
                  when 'ssoma' then 'ssoma' when 'caja' then 'caja' when 'observaciones' then 'observaciones'
                  when 'inventario' then 'inventario' when 'materiales' then 'materiales' end;
    if v_modulo is not null then
      select ver into v_ver from public.permisos_rol where service_id = p_service and rol::text = v_rol and modulo = v_modulo;
      if v_ver is false then return false; end if;
    end if;
  end if;
  return true;
end $$;
revoke all on function public.familia_permitida(uuid, text) from public, anon;
grant execute on function public.familia_permitida(uuid, text) to authenticated;

-- ── Historial de exportaciones ────────────────────────────────────────────
create table if not exists public.exportaciones (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  familia text not null,
  formato text not null check (formato in ('excel', 'pdf', 'jpg', 'mapa')),
  nombre text not null,
  registros integer,
  filtros jsonb not null default '{}'::jsonb,
  filtros_texto text,
  corte timestamptz not null default now(),
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'listo', 'error', 'cancelado')),
  archivo text,
  error text,
  created_at timestamptz not null default now(),
  terminado_at timestamptz
);
create index if not exists exportaciones_usuario_idx on public.exportaciones (user_id, created_at desc);
comment on table public.exportaciones is 'Historial de exportaciones del Centro de reportes: filtros originales y archivo generado (bucket exportaciones).';

alter table public.exportaciones enable row level security;
drop policy if exists exportaciones_select on public.exportaciones;
create policy exportaciones_select on public.exportaciones for select to authenticated
  using (user_id = auth.uid() and public.is_member(service_id));
drop policy if exists exportaciones_insert on public.exportaciones;
create policy exportaciones_insert on public.exportaciones for insert to authenticated
  with check (user_id = auth.uid() and public.familia_permitida(service_id, familia));
drop policy if exists exportaciones_update on public.exportaciones;
create policy exportaciones_update on public.exportaciones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.exportaciones to authenticated;

-- El archivo: carpeta del usuario; solo lo baja quien lo generó y mientras conserve el permiso
insert into storage.buckets (id, name, public, file_size_limit)
values ('exportaciones', 'exportaciones', false, 104857600)
on conflict (id) do nothing;

drop policy if exists "exportaciones_select" on storage.objects;
create policy "exportaciones_select" on storage.objects for select to authenticated
  using (bucket_id = 'exportaciones' and exists (
    select 1 from public.exportaciones e
     where e.archivo = storage.objects.name and e.user_id = auth.uid()
       and public.familia_permitida(e.service_id, e.familia)));
drop policy if exists "exportaciones_insert" on storage.objects;
create policy "exportaciones_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'exportaciones' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Reporte PCI ítem por ítem ─────────────────────────────────────────────
create or replace function public.reporte_pci(
  p_service uuid, p_pci uuid default null, p_desde date default null, p_hasta date default null,
  p_crew uuid default null, p_plazo integer default null, p_sector text default null)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_visor boolean := public.es_visor(p_service); v_res json;
begin
  if not public.familia_permitida(p_service, 'pci') then
    raise exception 'SIGOV: tu rol no puede sacar el reporte PCI' using errcode = '42501';
  end if;
  select coalesce(json_agg(x order by x->>'pci' desc, (x->>'item')::int), '[]'::json) into v_res from (
    select json_build_object(
             'item_id', i.id, 'pci_id', i.pci_id, 'pci', p.code, 'item', i.item_number, 'plazo', i.term_days,
             'vencimiento', i.due_date, 'notificado', p.notified_on, 'crew_id', i.assigned_crew_id, 'crew', c.name,
             'sector', (select s.code from public.sector_de(i.section_id, i.prog_start_m) s),
             'prog_inicio', i.prog_start_m, 'prog_fin', i.prog_end_m, 'actividad', a.name, 'description', i.description,
             'estado', i.status,
             'ejecucion', case when (case when v_visor then i.publicacion_version > 0
                                          else i.closed_at is not null and i.status not in ('pendiente', 'en_atencion') end)
                               then 'atendido' else 'sin_atencion' end,
             'requiere_evidencia', i.requires_evidence,
             'faltantes', to_json(public.pci_item_fases_faltantes(i.id, v_visor)),
             'conformidad', case i.covinca_estado when 'conforme' then 'conforme' when 'observado' then 'observado' else 'pendiente' end,
             'publicacion_version', i.publicacion_version,
             'fotos', (select count(*) from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null
                         and not e.autorizacion_pendiente and (not v_visor or e.publicada_version is not null)),
             'con_coordenadas', exists (select 1 from public.evidences e where e.pci_item_id = i.id and e.deleted_at is null
                         and e.lat is not null and (not v_visor or e.publicada_version is not null))) x
      from public.pci_items i
      join public.pcis p on p.id = i.pci_id
      left join public.crews c on c.id = i.assigned_crew_id
      left join public.activities_catalog a on a.id = i.activity_id
     where i.service_id = p_service and i.deleted_at is null and p.deleted_at is null
       and i.pci_id in (select public.pcis_visibles())
       and (i.assigned_crew_id is null or i.assigned_crew_id in (select public.cuadrillas_visibles()))
       and (public.role_in(p_service) not in ('supervisor', 'jefe_cuadrilla')
            or i.assigned_crew_id = any(coalesce(public.mis_cuadrillas(p_service), '{}'::uuid[])))
       and (p_pci is null or i.pci_id = p_pci)
       and (p_desde is null or coalesce(p.notified_on, p.received_on, p.created_at::date) >= p_desde)
       and (p_hasta is null or coalesce(p.notified_on, p.received_on, p.created_at::date) <= p_hasta)
       and (p_crew is null or i.assigned_crew_id = p_crew)
       and (p_plazo is null or i.term_days = p_plazo)
       and (p_sector is null or (select s.code from public.sector_de(i.section_id, i.prog_start_m) s) = p_sector)
  ) z;
  return v_res;
end $$;
revoke all on function public.reporte_pci(uuid, uuid, date, date, uuid, integer, text) from public, anon;
grant execute on function public.reporte_pci(uuid, uuid, date, date, uuid, integer, text) to authenticated;

-- Las familias que la pantalla muestra: las mismas que el servidor deja exportar
create or replace function public.familias_permitidas(p_service uuid)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(f order by o), '{}')
    from unnest(array['pci', 'niveles', 'programacion', 'diario', 'ssoma', 'caja', 'auditoria',
                      'observaciones', 'inventario', 'recursos', 'rendimientos', 'materiales']) with ordinality t(f, o)
   where public.familia_permitida(p_service, f)
$$;
revoke all on function public.familias_permitidas(uuid) from public, anon;
grant execute on function public.familias_permitidas(uuid) to authenticated;
