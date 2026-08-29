-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0104 · Partes diarios, ejecución en campo y evidencias GPS
-- ═══════════════════════════════════════════════════════════════════════════

select setseed(0.31);

-- ─── Partes diarios (uno por cuadrilla y día trabajado) ──────────────────
insert into public.work_orders (service_id, crew_id, work_date, status, weather, start_time, end_time,
                                headcount, notes, submitted_at, reviewed_at, reviewed_by, device_id, created_by)
select distinct on (pi.service_id, pi.crew_id, pi.scheduled_on)
  pi.service_id, pi.crew_id, pi.scheduled_on,
  case
    when pi.scheduled_on < current_date - 2 then 'validado'::work_order_status
    when pi.scheduled_on < current_date then (array['validado','enviado','observado'])[1+floor(random()*3)]::work_order_status
    else 'borrador'::work_order_status end,
  (array['Despejado','Parcialmente nublado','Nublado','Neblina costera','Ventoso'])[1+floor(random()*5)],
  (array['07:00','07:30','06:45'])[1+floor(random()*3)]::time,
  (array['16:30','17:00','17:30'])[1+floor(random()*3)]::time,
  (3 + floor(random()*4))::smallint,
  null,
  pi.scheduled_on + interval '17 hours',
  case when pi.scheduled_on < current_date - 1 then pi.scheduled_on + interval '1 day 9 hours' else null end,
  case when pi.scheduled_on < current_date - 1 then 'a0000000-0000-4000-8000-000000000002'::uuid else null end,
  'DEV-' || upper(substr(md5(pi.crew_id::text), 1, 8)),
  c.leader_id
from public.plan_items pi
join public.crews c on c.id = pi.crew_id
where pi.deleted_at is null
  and pi.scheduled_on <= current_date
  and pi.crew_id is not null
order by pi.service_id, pi.crew_id, pi.scheduled_on, pi.sort_order
on conflict (service_id, crew_id, work_date) do nothing;

-- ─── Registros de ejecución ──────────────────────────────────────────────
insert into public.work_entries (work_order_id, service_id, plan_item_id, activity_id, section_id,
                                 prog_start_m, prog_end_m, side, quantity, unit_id, observation,
                                 started_at, finished_at, geom, created_by)
select
  wo.id, pi.service_id, pi.id, pi.activity_id, pi.section_id,
  pi.prog_start_m + (seg.n - 1) * ((pi.prog_end_m - pi.prog_start_m) / 3.0),
  pi.prog_start_m + seg.n * ((pi.prog_end_m - pi.prog_start_m) / 3.0),
  (array['derecho','izquierdo','ambos'])[1+floor(random()*3)]::road_side,
  round((pi.target_qty / 3.0 * (0.75 + random() * 0.5))::numeric, 1),
  pi.unit_id,
  case when random() < 0.28 then
    (array[
      'Se encontró acumulación de material fino en la zona intervenida.',
      'Tramo con tránsito intenso, se aplicó señalización preventiva adicional.',
      'Se requiere retorno para completar el metrado pendiente.',
      'Trabajo culminado conforme a especificación técnica.',
      'Se coordinó con la unidad de peaje para el corte parcial de carril.',
      'Presencia de vendedores ambulantes en la berma, se comunicó a supervisión.'
    ])[1+floor(random()*6)] else null end,
  pi.scheduled_on + time '08:00' + (seg.n * interval '2 hours'),
  pi.scheduled_on + time '09:30' + (seg.n * interval '2 hours'),
  extensions.ST_LineInterpolatePoint(rs.geom,
    least(0.999, greatest(0.001,
      ((pi.prog_start_m + (seg.n - 0.5) * ((pi.prog_end_m - pi.prog_start_m)/3.0)) - rs.prog_start_m)
      / nullif(rs.prog_end_m - rs.prog_start_m, 0)))),
  c.leader_id
from public.plan_items pi
join public.work_orders wo on wo.service_id = pi.service_id
                          and wo.crew_id = pi.crew_id
                          and wo.work_date = pi.scheduled_on
join public.road_sections rs on rs.id = pi.section_id
join public.crews c on c.id = pi.crew_id
cross join generate_series(1, 3) as seg(n)
where pi.deleted_at is null
  and pi.scheduled_on <= current_date
  and (pi.scheduled_on < current_date or seg.n <= 2);   -- el día de hoy va a medias

-- ─── Evidencias georreferenciadas (antes / durante / después) ────────────
insert into public.evidences (service_id, work_entry_id, phase, storage_path, thumb_path,
                              mime_type, size_bytes, width, height,
                              lat, lng, accuracy_m, altitude_m, heading,
                              section_id, progresiva_m, taken_at, sha256,
                              watermarked, device_id, device_model, caption, created_by)
select
  we.service_id, we.id, ph.phase::evidence_phase,
  we.service_id || '/' || to_char(wo.work_date,'YYYY') || '/' || to_char(wo.work_date,'MM')
    || '/' || we.id || '_' || ph.phase || '.webp',
  we.service_id || '/' || to_char(wo.work_date,'YYYY') || '/' || to_char(wo.work_date,'MM')
    || '/' || we.id || '_' || ph.phase || '_thumb.webp',
  'image/webp',
  (140000 + floor(random() * 190000))::int, 1600, 1200,
  extensions.ST_Y(we.geom) + (random() - 0.5) * 0.00035,
  extensions.ST_X(we.geom) + (random() - 0.5) * 0.00035,
  round((3.5 + random() * 9)::numeric, 1),
  round((15 + random() * 260)::numeric, 1),
  round((random() * 360)::numeric, 1),
  we.section_id, we.prog_start_m,
  we.started_at + (ph.ord * interval '35 minutes'),
  encode(extensions.digest(we.id::text || ph.phase, 'sha256'), 'hex'),
  true,
  'DEV-' || upper(substr(md5(wo.crew_id::text), 1, 8)),
  (array['Samsung Galaxy A34','Xiaomi Redmi Note 12','Motorola Moto G84','Samsung Galaxy A15'])[1+floor(random()*4)],
  case ph.phase
    when 'antes'   then 'Estado inicial del área de trabajo'
    when 'durante' then 'Ejecución de la actividad en curso'
    else 'Condición final entregada' end,
  we.created_by
from public.work_entries we
join public.work_orders wo on wo.id = we.work_order_id
cross join (values ('antes',0),('durante',1),('despues',2)) as ph(phase, ord)
where we.deleted_at is null
  and we.geom is not null
  and not (ph.phase = 'despues' and wo.work_date = current_date and random() < 0.5);

select
 (select count(*) from public.work_orders)  as partes,
 (select count(*) from public.work_entries) as registros,
 (select count(*) from public.evidences)    as evidencias,
 (select round(sum(quantity)) from public.work_entries) as metrado_total;
