-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0012 · Storage: buckets y políticas
-- Convención de rutas: {bucket}/{service_id}/{yyyy}/{mm}/{archivo}
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidencias', 'evidencias', false, 15728640,
    array['image/webp','image/jpeg','image/png','video/mp4']),
  ('firmas',     'firmas',     false,  1048576, array['image/png','image/webp','image/svg+xml']),
  ('documentos', 'documentos', false, 26214400,
    array['application/pdf','application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg','image/png','text/csv']),
  ('avatars',    'avatars',    true,   2097152, array['image/webp','image/jpeg','image/png']),
  ('respaldos',  'respaldos',  false, 524288000, null)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Helper: el primer segmento de la ruta es el service_id
create or replace function public.storage_service_id(p_name text)
returns uuid language sql immutable as $$
  select nullif(split_part(p_name, '/', 1), '')::uuid
$$;

-- ─── EVIDENCIAS: se leen si perteneces al servicio; se suben si escribes;
--     NO se actualizan ni se borran (evidencia inmutable) ─────────────────
drop policy if exists "evidencias_select" on storage.objects;
create policy "evidencias_select" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and public.is_member(public.storage_service_id(name)));

drop policy if exists "evidencias_insert" on storage.objects;
create policy "evidencias_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and public.can_write(public.storage_service_id(name)));

-- Sin políticas UPDATE/DELETE en 'evidencias' → nadie puede alterar ni borrar.

-- ─── FIRMAS ──────────────────────────────────────────────────────────────
drop policy if exists "firmas_select" on storage.objects;
create policy "firmas_select" on storage.objects for select to authenticated
  using (bucket_id = 'firmas' and public.is_member(public.storage_service_id(name)));

drop policy if exists "firmas_insert" on storage.objects;
create policy "firmas_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'firmas' and public.can_write(public.storage_service_id(name)));

-- ─── DOCUMENTOS ──────────────────────────────────────────────────────────
drop policy if exists "documentos_select" on storage.objects;
create policy "documentos_select" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.is_member(public.storage_service_id(name)));

drop policy if exists "documentos_insert" on storage.objects;
create policy "documentos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.can_write(public.storage_service_id(name)));

drop policy if exists "documentos_update" on storage.objects;
create policy "documentos_update" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.can_manage(public.storage_service_id(name)));

drop policy if exists "documentos_delete" on storage.objects;
create policy "documentos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.can_manage(public.storage_service_id(name)));

-- ─── AVATARS (público de lectura, escritura sobre la carpeta propia) ─────
drop policy if exists "avatars_select" on storage.objects;
create policy "avatars_select" on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_write" on storage.objects;
create policy "avatars_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- ─── RESPALDOS: solo service_role (sin políticas para authenticated) ─────
drop policy if exists "respaldos_admin" on storage.objects;
create policy "respaldos_admin" on storage.objects for select to authenticated
  using (bucket_id = 'respaldos' and public.is_platform_admin());

grant execute on function public.storage_service_id(text) to authenticated;
