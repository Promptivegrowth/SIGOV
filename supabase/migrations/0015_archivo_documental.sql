-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · 0015 · Archivo documental (Hito 1: "configuración base y archivo")
--
-- Reemplaza las carpetas de Drive: todo documento del contrato vive aquí,
-- clasificado, versionado por fecha, buscable y ligado a lo que documenta.
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type document_kind as enum (
    'contrato','pci','programacion','reporte','ssoma','plano',
    'acta','fotografico','normativa','otro'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  kind          document_kind not null default 'otro',
  title         text not null,
  description   text,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  doc_date      date,
  -- Vínculos opcionales con lo que el documento respalda
  pci_id        uuid references public.pcis(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  section_id    uuid references public.road_sections(id) on delete set null,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz
);

create index if not exists idx_docs_service on public.documents(service_id, created_at desc) where deleted_at is null;
create index if not exists idx_docs_kind on public.documents(service_id, kind) where deleted_at is null;
create index if not exists idx_docs_pci on public.documents(pci_id);
create index if not exists idx_docs_title_trgm on public.documents using gin (title gin_trgm_ops);

drop trigger if exists t_docs_touch on public.documents;
create trigger t_docs_touch before update on public.documents
  for each row execute function public.touch_updated_at();

alter table public.documents enable row level security;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.is_member(service_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_write(service_id));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (public.can_write(service_id)) with check (public.can_write(service_id));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (public.can_manage(service_id));

-- ─── Reutilización de evidencias ─────────────────────────────────────────
-- Permite adjuntar una foto YA capturada a otro registro o ítem de PCI sin
-- duplicar el archivo: la evidencia original queda intacta e inmutable.
create table if not exists public.evidence_links (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references public.evidences(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  work_entry_id uuid references public.work_entries(id) on delete cascade,
  pci_item_id   uuid references public.pci_items(id) on delete cascade,
  asset_id      uuid references public.road_assets(id) on delete cascade,
  talk_id       uuid references public.safety_talks(id) on delete cascade,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  unique (evidence_id, work_entry_id, pci_item_id, asset_id, talk_id)
);
create index if not exists idx_evlink_entry on public.evidence_links(work_entry_id);
create index if not exists idx_evlink_pci on public.evidence_links(pci_item_id);
create index if not exists idx_evlink_ev on public.evidence_links(evidence_id);

alter table public.evidence_links enable row level security;

drop policy if exists evlink_select on public.evidence_links;
create policy evlink_select on public.evidence_links for select to authenticated
  using (public.is_member(service_id));

drop policy if exists evlink_insert on public.evidence_links;
create policy evlink_insert on public.evidence_links for insert to authenticated
  with check (public.can_write(service_id));

drop policy if exists evlink_delete on public.evidence_links;
create policy evlink_delete on public.evidence_links for delete to authenticated
  using (public.can_write(service_id));

-- ─── Galería de evidencias: originales + reutilizadas ────────────────────
create or replace function public.evidence_gallery(
  p_service_id uuid,
  p_from date default (current_date - 90),
  p_to   date default current_date,
  p_search text default null,
  p_limit int default 200
) returns table (
  id uuid, storage_path text, phase evidence_phase, taken_at timestamptz,
  lat double precision, lng double precision, accuracy_m numeric,
  progresiva_txt text, section_name text, activity_name text,
  crew_name text, caption text, sha256 text, size_bytes integer,
  usos bigint
)
language sql stable security invoker set search_path = public as $$
  select
    e.id, e.storage_path, e.phase, e.taken_at,
    e.lat, e.lng, e.accuracy_m,
    public.fmt_progresiva(e.progresiva_m),
    s.name, a.name, c.name, e.caption, e.sha256, e.size_bytes,
    1 + (select count(*) from public.evidence_links l where l.evidence_id = e.id)
  from public.evidences e
  left join public.road_sections s on s.id = e.section_id
  left join public.work_entries we on we.id = e.work_entry_id
  left join public.activities_catalog a on a.id = we.activity_id
  left join public.work_orders wo on wo.id = we.work_order_id
  left join public.crews c on c.id = wo.crew_id
  where e.service_id = p_service_id
    and e.deleted_at is null
    and e.taken_at::date between p_from and p_to
    and (
      p_search is null or p_search = ''
      or a.name ilike '%' || p_search || '%'
      or s.name ilike '%' || p_search || '%'
      or c.name ilike '%' || p_search || '%'
      or e.caption ilike '%' || p_search || '%'
    )
  order by e.taken_at desc
  limit p_limit
$$;

grant execute on function public.evidence_gallery(uuid, date, date, text, int) to authenticated;

-- ─── Búsqueda global optimizada (para el buscador ⌘K y los filtros) ──────
create or replace function public.buscar(
  p_service_id uuid,
  p_q text,
  p_limit int default 8
) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'pci', coalesce((
      select jsonb_agg(x) from (
        select i.id, i.pci_id, i.item_number, left(i.description, 120) as description,
               p.code as pci_code,
               public.pci_item_semaforo(i.due_date, i.term_days, i.status) as semaforo,
               s.name as section_name
          from public.pci_items i
          join public.pcis p on p.id = i.pci_id
          left join public.road_sections s on s.id = i.section_id
         where i.service_id = p_service_id and i.deleted_at is null
           and (i.description ilike '%' || p_q || '%' or p.code ilike '%' || p_q || '%')
         order by i.due_date limit p_limit
      ) x), '[]'::jsonb),

    'inventario', coalesce((
      select jsonb_agg(x) from (
        select a.id, a.code, a.name, t.name as type_name, s.name as section_name,
               public.fmt_progresiva(a.progresiva_m) as progresiva, a.condition
          from public.road_assets a
          join public.asset_types t on t.id = a.type_id
          left join public.road_sections s on s.id = a.section_id
         where a.service_id = p_service_id and a.deleted_at is null
           and (a.code ilike '%' || p_q || '%' or a.name ilike '%' || p_q || '%' or t.name ilike '%' || p_q || '%')
         limit p_limit
      ) x), '[]'::jsonb),

    'actividades', coalesce((
      select jsonb_agg(x) from (
        select ac.id, ac.code, ac.name, ac.category, ac.color
          from public.activities_catalog ac
         where ac.service_id = p_service_id and ac.deleted_at is null and ac.is_active
           and (ac.name ilike '%' || p_q || '%' or ac.code ilike '%' || p_q || '%')
         limit p_limit
      ) x), '[]'::jsonb),

    'cuadrillas', coalesce((
      select jsonb_agg(x) from (
        select c.id, c.code, c.name, c.color
          from public.crews c
         where c.service_id = p_service_id and c.deleted_at is null
           and (c.name ilike '%' || p_q || '%' or c.code ilike '%' || p_q || '%')
         limit p_limit
      ) x), '[]'::jsonb),

    'personas', coalesce((
      select jsonb_agg(x) from (
        select pr.id, pr.full_name, pr.email, m.role
          from public.service_members m
          join public.profiles pr on pr.id = m.profile_id
         where m.service_id = p_service_id
           and (pr.full_name ilike '%' || p_q || '%' or pr.email ilike '%' || p_q || '%')
         limit p_limit
      ) x), '[]'::jsonb),

    'documentos', coalesce((
      select jsonb_agg(x) from (
        select d.id, d.title, d.kind, d.file_name, d.doc_date
          from public.documents d
         where d.service_id = p_service_id and d.deleted_at is null
           and (d.title ilike '%' || p_q || '%' or d.file_name ilike '%' || p_q || '%')
         limit p_limit
      ) x), '[]'::jsonb)
  )
$$;

grant execute on function public.buscar(uuid, text, int) to authenticated;

-- Índices para que las búsquedas por nombre sean instantáneas
create index if not exists idx_assets_code_trgm on public.road_assets using gin (code gin_trgm_ops);
create index if not exists idx_assets_name_trgm on public.road_assets using gin (name gin_trgm_ops);
create index if not exists idx_act_name_trgm on public.activities_catalog using gin (name gin_trgm_ops);
create index if not exists idx_profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists idx_crews_name_trgm on public.crews using gin (name gin_trgm_ops);
