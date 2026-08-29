-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0105 · PCIs OSITRAN (incluye uno de ALTO VOLUMEN: 300 ítems)
-- ═══════════════════════════════════════════════════════════════════════════

select setseed(0.19);

insert into public.pcis (id, service_id, code, title, description, source, notified_on, received_on,
                         priority, status, default_days, created_by)
values
 ('c1000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222221',
  'PCI-2026-047','Deficiencias en el sistema de drenaje transversal',
  'Se identifican alcantarillas con obstrucción superior al 40% de su sección en diversos puntos del corredor, comprometiendo la evacuación de aguas ante el periodo de lluvias. Se requiere descolmatación y limpieza integral con evidencia fotográfica por elemento.',
  'OSITRAN', current_date - 4, current_date - 3, 'alta', 'abierto', 15,
  'a0000000-0000-4000-8000-000000000002'),

 ('c1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222221',
  'PCI-2026-044','Señalización vertical deteriorada e ilegible',
  'Señales verticales con pérdida de retroreflectividad, paneles abollados y postes con corrosión avanzada. Se requiere reposición o mantenimiento según corresponda por cada elemento observado.',
  'OSITRAN', current_date - 12, current_date - 11, 'alta', 'en_atencion', 30,
  'a0000000-0000-4000-8000-000000000002'),

 ('c1000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222221',
  'PCI-2026-041','Guardavías metálicas con daño estructural',
  'Tramos de guardavía con deformación por impacto vehicular, postes desplazados y terminales sin abocinamiento reglamentario. Riesgo alto para la seguridad vial.',
  'OSITRAN', current_date - 26, current_date - 25, 'critica', 'en_atencion', 20,
  'a0000000-0000-4000-8000-000000000002'),

 ('c1000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222221',
  'PCI-2026-038','Vegetación invasiva en derecho de vía',
  'Crecimiento de vegetación que reduce la visibilidad en curvas y obstruye la señalización informativa. Se requiere roce y desbroce.',
  'OSITRAN', current_date - 41, current_date - 40, 'media', 'levantado', 30,
  'a0000000-0000-4000-8000-000000000002'),

 ('c1000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222221',
  'PCI-2026-033','Residuos sólidos acumulados en bermas',
  'Presencia de residuos sólidos y escombros en bermas y zona de dominio, principalmente en accesos a centros poblados.',
  'Concesionario', current_date - 58, current_date - 57, 'baja', 'levantado', 45,
  'a0000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- ─── Ítems del PCI-2026-047 · ALTO VOLUMEN (300 ítems sobre alcantarillas) ─
insert into public.pci_items (pci_id, service_id, item_number, description, section_id,
                              prog_start_m, prog_end_m, side, activity_id, quantity, unit_id,
                              term_days, due_date, status, assigned_crew_id, created_by)
select
  'c1000000-0000-4000-8000-000000000001', ra.service_id,
  row_number() over (order by ra.section_id, ra.progresiva_m),
  'Descolmatación y limpieza de ' || ra.name || ' — obstrucción registrada '
    || coalesce(ra.attributes->>'obstruccion','40') || '%. Retirar material, verificar salida y registrar evidencia antes/después.',
  ra.section_id, ra.progresiva_m, ra.progresiva_m + 6, ra.side,
  (select id from public.activities_catalog a where a.service_id = ra.service_id and a.code = 'MR-05'),
  1, (select id from public.units where code = 'UND'),
  t.days, (current_date - 4) + t.days,
  'pendiente'::pci_item_status,
  (select id from public.crews c where c.service_id = ra.service_id and c.code = 'CUA-A'),
  'a0000000-0000-4000-8000-000000000002'
from (
  select ra.*, row_number() over (order by md5(ra.id::text)) as rn
  from public.road_assets ra
  join public.asset_types at on at.id = ra.type_id
  where at.code = 'ALC' and ra.service_id = '22222222-2222-4222-8222-222222222221'
    and ra.deleted_at is null
  limit 300
) ra
cross join lateral (
  select (array[7,10,15,20,30])[1 + (ra.rn % 5)]::smallint as days
) t
on conflict (pci_id, item_number) do nothing;

-- ─── Ítems del PCI-2026-044 · señalización (120 ítems, plazos mixtos) ─────
insert into public.pci_items (pci_id, service_id, item_number, description, section_id,
                              prog_start_m, prog_end_m, side, activity_id, quantity, unit_id,
                              term_days, due_date, status, assigned_crew_id, closed_at, created_by)
select
  'c1000000-0000-4000-8000-000000000002', ra.service_id,
  row_number() over (order by ra.section_id, ra.progresiva_m),
  'Reposición de señal ' || coalesce(ra.attributes->>'codigo_mtc','P-1A') || ' (' || ra.name
    || '). Retroreflectividad actual ' || coalesce(ra.attributes->>'retroreflectividad','Tipo I')
    || ', se exige mínimo Tipo IV.',
  ra.section_id, ra.progresiva_m, ra.progresiva_m + 2, ra.side,
  (select id from public.activities_catalog a where a.service_id = ra.service_id and a.code = 'MR-10'),
  1, (select id from public.units where code = 'UND'),
  t.days, (current_date - 12) + t.days,
  st.s::pci_item_status,
  (select id from public.crews c where c.service_id = ra.service_id and c.code = 'CUA-B'),
  case when st.s in ('levantado','validado') then now() - (random() * interval '8 days') else null end,
  'a0000000-0000-4000-8000-000000000002'
from (
  select ra.*, row_number() over (order by md5(ra.id::text || 'sev')) as rn
  from public.road_assets ra
  join public.asset_types at on at.id = ra.type_id
  where at.code = 'SEV' and ra.service_id = '22222222-2222-4222-8222-222222222221'
    and ra.deleted_at is null
  limit 120
) ra
cross join lateral (select (array[10,15,20,30,45])[1 + (ra.rn % 5)]::smallint as days) t
cross join lateral (
  select case
    when ra.rn % 10 < 4 then 'levantado'
    when ra.rn % 10 < 5 then 'validado'
    when ra.rn % 10 < 7 then 'en_atencion'
    else 'pendiente' end as s
) st
on conflict (pci_id, item_number) do nothing;

-- ─── Ítems del PCI-2026-041 · guardavías (crítico, 48 ítems) ─────────────
insert into public.pci_items (pci_id, service_id, item_number, description, section_id,
                              prog_start_m, prog_end_m, side, activity_id, quantity, unit_id,
                              term_days, due_date, status, assigned_crew_id, closed_at, created_by)
select
  'c1000000-0000-4000-8000-000000000003', ra.service_id,
  row_number() over (order by ra.section_id, ra.progresiva_m),
  'Reparación de ' || ra.name || ' — ' || coalesce(ra.attributes->>'longitud','40')
    || ' m con deformación por impacto. Reemplazar postes dañados y verificar terminal '
    || coalesce(ra.attributes->>'terminal','abocinado') || '.',
  ra.section_id, ra.progresiva_m, ra.progresiva_m + coalesce((ra.attributes->>'longitud')::numeric, 40), ra.side,
  (select id from public.activities_catalog a where a.service_id = ra.service_id and a.code = 'MR-13'),
  coalesce((ra.attributes->>'longitud')::numeric, 40), (select id from public.units where code = 'ML'),
  t.days, (current_date - 26) + t.days,
  st.s::pci_item_status,
  (select id from public.crews c where c.service_id = ra.service_id and c.code = 'CUA-D'),
  case when st.s in ('levantado','validado') then now() - (random() * interval '14 days') else null end,
  'a0000000-0000-4000-8000-000000000002'
from (
  select ra.*, row_number() over (order by md5(ra.id::text || 'gua')) as rn
  from public.road_assets ra
  join public.asset_types at on at.id = ra.type_id
  where at.code = 'GUA' and ra.service_id = '22222222-2222-4222-8222-222222222221'
    and ra.deleted_at is null and ra.condition in ('malo','critico','regular')
  limit 48
) ra
cross join lateral (select (array[7,10,15,20])[1 + (ra.rn % 4)]::smallint as days) t
cross join lateral (
  select case when ra.rn % 10 < 5 then 'levantado'
              when ra.rn % 10 < 7 then 'en_atencion'
              else 'pendiente' end as s
) st
on conflict (pci_id, item_number) do nothing;

-- ─── PCI-2026-038 y 033: cerrados (histórico) ────────────────────────────
insert into public.pci_items (pci_id, service_id, item_number, description, section_id,
                              prog_start_m, prog_end_m, activity_id, quantity, unit_id,
                              term_days, due_date, status, closed_at, validated_at, validated_by, created_by)
select
  p.id, p.service_id, g.n,
  case p.code
    when 'PCI-2026-038' then 'Roce y desbroce en curva de visibilidad reducida, sector ' || rs.name || ' km ' || round(rs.prog_start_m/1000 + g.n * 3)
    else 'Retiro de residuos sólidos acumulados en berma, sector ' || rs.name || ' km ' || round(rs.prog_start_m/1000 + g.n * 4)
  end,
  rs.id,
  rs.prog_start_m + g.n * 2200, rs.prog_start_m + g.n * 2200 + 800,
  (select id from public.activities_catalog a where a.service_id = p.service_id
     and a.code = case p.code when 'PCI-2026-038' then 'MR-16' else 'MR-17' end),
  round((80 + random()*400)::numeric, 0),
  (select id from public.units where code = case p.code when 'PCI-2026-038' then 'M2' else 'M3' end),
  p.default_days, p.notified_on + p.default_days,
  'validado'::pci_item_status,
  p.notified_on + (p.default_days - 3) + interval '15 hours',
  p.notified_on + (p.default_days - 1) + interval '10 hours',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000002'
from public.pcis p
join lateral (
  select rs.* from public.road_sections rs
   where rs.service_id = p.service_id order by md5(rs.id::text || p.code) limit 1
) rs on true
cross join generate_series(1, case when p.code = 'PCI-2026-038' then 34 else 22 end) as g(n)
where p.code in ('PCI-2026-038','PCI-2026-033')
on conflict (pci_id, item_number) do nothing;

-- ─── Evidencias de los ítems levantados ──────────────────────────────────
insert into public.evidences (service_id, pci_item_id, phase, storage_path, thumb_path, mime_type,
                              size_bytes, width, height, lat, lng, accuracy_m,
                              section_id, progresiva_m, taken_at, sha256, watermarked,
                              device_id, device_model, caption, created_by)
select
  i.service_id, i.id, ph.phase::evidence_phase,
  i.service_id || '/pci/' || i.pci_id || '/' || i.id || '_' || ph.phase || '.webp',
  i.service_id || '/pci/' || i.pci_id || '/' || i.id || '_' || ph.phase || '_thumb.webp',
  'image/webp', (150000 + floor(random()*180000))::int, 1600, 1200,
  extensions.ST_Y(extensions.ST_LineInterpolatePoint(rs.geom,
    least(0.999, greatest(0.001, (i.prog_start_m - rs.prog_start_m)/nullif(rs.prog_end_m - rs.prog_start_m,0))))),
  extensions.ST_X(extensions.ST_LineInterpolatePoint(rs.geom,
    least(0.999, greatest(0.001, (i.prog_start_m - rs.prog_start_m)/nullif(rs.prog_end_m - rs.prog_start_m,0))))),
  round((4 + random()*7)::numeric, 1),
  i.section_id, i.prog_start_m,
  coalesce(i.closed_at, now() - interval '3 days') - (ph.ord * interval '40 minutes'),
  encode(extensions.digest(i.id::text || ph.phase || 'pci', 'sha256'), 'hex'),
  true,
  'DEV-PCI' || upper(substr(md5(i.id::text), 1, 5)),
  (array['Samsung Galaxy A34','Xiaomi Redmi Note 12','Motorola Moto G84'])[1+floor(random()*3)],
  case ph.phase when 'antes' then 'Condición observada en el PCI' else 'Levantamiento ejecutado' end,
  'a0000000-0000-4000-8000-000000000003'
from public.pci_items i
join public.road_sections rs on rs.id = i.section_id
cross join (values ('antes',1),('despues',0)) as ph(phase, ord)
where i.status in ('levantado','validado') and i.deleted_at is null and rs.geom is not null;

-- ─── Historial: aplicar la suspensión del PCI crítico ya atendido ────────
-- (deja el PCI-2026-047 SIN aplicar para demostrar el motor en vivo)
select public.apply_pci_suspension('c1000000-0000-4000-8000-000000000003') as suspension_historica;

select
 (select count(*) from public.pcis) as pcis,
 (select count(*) from public.pci_items) as items_pci,
 (select count(*) from public.pci_items where status in ('levantado','validado')) as levantados,
 (select count(*) from public.pci_items where due_date < current_date and status not in ('levantado','validado')) as vencidos,
 (select count(*) from public.evidences where pci_item_id is not null) as evidencias_pci;
