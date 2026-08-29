-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0106 · SSOMA (charlas, asistencia, checklists, ATS/IPERC)
--                     + notificaciones + lotes de importación
-- ═══════════════════════════════════════════════════════════════════════════

select setseed(0.63);

-- ─── Charlas de 5 minutos (una por parte diario) ─────────────────────────
insert into public.safety_talks (service_id, crew_id, topic, content, talk_date, start_time,
                                 duration_min, speaker_id, speaker_name, location, lat, lng, created_by)
select
  wo.service_id, wo.crew_id,
  (array[
    'Uso correcto de EPP en vías con tránsito activo',
    'Señalización de zona de trabajo según Manual de Dispositivos MTC',
    'Prevención de atropellos: reglas de oro en la berma',
    'Manipulación segura de herramientas manuales',
    'Riesgo de golpe de calor e hidratación en costa norte',
    'Trabajo en proximidad de maquinaria pesada',
    'Reporte inmediato de actos y condiciones subestándar',
    'Orden y limpieza en el frente de trabajo',
    'Manejo de residuos peligrosos y no peligrosos',
    'Primeros auxilios: qué hacer en los primeros 3 minutos'
  ])[1 + (abs(hashtext(wo.id::text)) % 10)],
  'Charla diaria de seguridad previa al inicio de actividades. Se refuerzan los controles operacionales definidos en el ATS del frente y se verifica el estado del EPP de cada integrante.',
  wo.work_date, time '07:05', 5,
  'a0000000-0000-4000-8000-000000000005', 'Paola Ríos Mendoza',
  'Frente de trabajo · ' || c.name,
  -9.5 + random() * 1.4, -78.5 + random() * 0.7,
  c.leader_id
from public.work_orders wo
join public.crews c on c.id = wo.crew_id
join public.services s on s.id = wo.service_id
where wo.deleted_at is null
  and (s.modules->>'ssoma')::boolean is true;

-- ─── Asistencia con firma digital ────────────────────────────────────────
insert into public.talk_attendance (talk_id, service_id, crew_member_id, profile_id, full_name,
                                    dni, position, signature_path, signed_at)
select
  t.id, t.service_id, cm.id, cm.profile_id, cm.full_name, cm.dni, cm.position,
  t.service_id || '/firmas/' || t.id || '/' || cm.id || '.png',
  t.talk_date + time '07:10'
from public.safety_talks t
join public.crew_members cm on cm.crew_id = t.crew_id and cm.is_active
where t.deleted_at is null
on conflict (talk_id, full_name) do nothing;

-- ─── Plantillas de checklist ─────────────────────────────────────────────
insert into public.checklist_templates (service_id, code, name, category, description, questions, frequency, created_by)
select s.id, x.code, x.name, x.cat, x.descr, x.q::jsonb, x.freq, 'a0000000-0000-4000-8000-000000000005'
from public.services s
cross join (values
 ('CHK-EPP','Verificación de EPP','EPP','Inspección diaria del equipo de protección personal de cada integrante.',
  '[{"id":"casco","label":"Casco de seguridad en buen estado y con barbiquejo","type":"bool","required":true},
    {"id":"chaleco","label":"Chaleco reflectivo clase 2 o superior","type":"bool","required":true},
    {"id":"botas","label":"Botines de seguridad con punta de acero","type":"bool","required":true},
    {"id":"guantes","label":"Guantes adecuados a la tarea","type":"bool","required":true},
    {"id":"lentes","label":"Lentes de protección","type":"bool","required":true},
    {"id":"bloqueador","label":"Bloqueador solar aplicado","type":"bool","required":false},
    {"id":"obs","label":"Observaciones","type":"text","required":false},
    {"id":"foto","label":"Foto del personal equipado","type":"photo","required":true}]','diaria'),
 ('CHK-VEH','Check list de vehículo','Vehículo','Inspección preoperacional de la unidad asignada a la cuadrilla.',
  '[{"id":"luces","label":"Luces y direccionales operativas","type":"bool","required":true},
    {"id":"frenos","label":"Sistema de frenos sin observaciones","type":"bool","required":true},
    {"id":"llantas","label":"Llantas con labrado mínimo reglamentario","type":"bool","required":true},
    {"id":"extintor","label":"Extintor vigente y accesible","type":"bool","required":true},
    {"id":"botiquin","label":"Botiquín completo","type":"bool","required":true},
    {"id":"circulina","label":"Circulina y conos reflectivos","type":"bool","required":true},
    {"id":"km","label":"Kilometraje","type":"number","required":true},
    {"id":"obs","label":"Observaciones","type":"text","required":false}]','diaria'),
 ('CHK-SZT','Señalización de zona de trabajo','Área de trabajo','Verificación del dispositivo de control de tránsito instalado.',
  '[{"id":"preaviso","label":"Señal de preaviso a 150 m","type":"bool","required":true},
    {"id":"conos","label":"Conos de canalización cada 10 m","type":"bool","required":true},
    {"id":"banderillero","label":"Banderillero designado y capacitado","type":"bool","required":true},
    {"id":"tranquera","label":"Tranqueras en buen estado","type":"bool","required":true},
    {"id":"nocturno","label":"Dispositivos luminosos si aplica","type":"bool","required":false},
    {"id":"foto","label":"Foto del dispositivo instalado","type":"photo","required":true}]','diaria'),
 ('CHK-HER','Inspección de herramientas','Herramientas','Estado de herramientas manuales y de poder.',
  '[{"id":"mango","label":"Mangos sin fisuras ni astillas","type":"bool","required":true},
    {"id":"filo","label":"Herramientas de corte con filo adecuado","type":"bool","required":true},
    {"id":"electricas","label":"Herramientas eléctricas con cable íntegro","type":"bool","required":true},
    {"id":"guardas","label":"Guardas de seguridad instaladas","type":"bool","required":true},
    {"id":"obs","label":"Herramientas retiradas de servicio","type":"text","required":false}]','semanal')
) as x(code, name, cat, descr, q, freq)
where s.is_demo and (s.modules->>'ssoma')::boolean is true
on conflict (service_id, code) do nothing;

-- ─── Respuestas de checklist ─────────────────────────────────────────────
insert into public.checklist_responses (template_id, service_id, crew_id, work_order_id, responded_on,
                                        answers, score, has_findings, findings, lat, lng, signature_path, created_by)
select
  ct.id, wo.service_id, wo.crew_id, wo.id, wo.work_date,
  (select jsonb_object_agg(q->>'id',
      case q->>'type'
        when 'bool'   then to_jsonb(random() > 0.07)
        when 'number' then to_jsonb(floor(45000 + random()*90000))
        when 'photo'  then to_jsonb(wo.service_id || '/checklist/' || wo.id || '/' || (q->>'id') || '.webp')
        else to_jsonb(''::text) end)
   from jsonb_array_elements(ct.questions) q),
  round((88 + random()*12)::numeric, 1),
  random() < 0.14,
  case when random() < 0.14 then
    (array['Chaleco reflectivo con desgaste, se solicitó reposición.',
           'Extintor con presión al límite, se envió a recarga.',
           'Conos con baja retroreflectividad en horario nocturno.',
           'Mango de pala con astilla, herramienta retirada de servicio.'])[1+floor(random()*4)]
  else null end,
  -9.5 + random() * 1.4, -78.5 + random() * 0.7,
  wo.service_id || '/firmas/checklist/' || wo.id || '.png',
  (select leader_id from public.crews where id = wo.crew_id)
from public.work_orders wo
join public.checklist_templates ct on ct.service_id = wo.service_id and ct.is_active
where wo.deleted_at is null and ct.frequency = 'diaria'
  and wo.work_date >= current_date - 30;

-- ─── ATS / IPERC ─────────────────────────────────────────────────────────
insert into public.ats_iperc (service_id, crew_id, work_order_id, doc_date, task, location,
                              section_id, prog_start_m, hazards, max_risk, ppe,
                              supervisor_id, supervisor_signature_path, approved_at, lat, lng, created_by)
select
  wo.service_id, wo.crew_id, wo.id, wo.work_date,
  a.name, 'Tramo ' || rs.name || ' · ' || public.fmt_progresiva(we.prog_start_m),
  we.section_id, we.prog_start_m,
  jsonb_build_array(
    jsonb_build_object('peligro','Tránsito vehicular en la vía','riesgo','Atropello / colisión',
      'probabilidad', 2 + floor(random()*2), 'severidad', 4,
      'nivel','importante',
      'controles','Señalización preventiva a 150 m, banderillero permanente, chaleco clase 3, conos cada 10 m.',
      'responsable','Jefe de cuadrilla'),
    jsonb_build_object('peligro','Radiación solar prolongada','riesgo','Golpe de calor / quemadura',
      'probabilidad', 3, 'severidad', 2, 'nivel','moderado',
      'controles','Hidratación cada 45 min, bloqueador FPS 50+, cortafríos y pausas en sombra.',
      'responsable','Ing. de Seguridad'),
    jsonb_build_object('peligro','Manipulación de herramientas manuales','riesgo','Corte / golpe',
      'probabilidad', 2, 'severidad', 2, 'nivel','tolerable',
      'controles','Inspección preuso, guantes anticorte, técnica correcta de uso.',
      'responsable','Operario')
  ),
  'importante'::risk_level,
  '["Casco","Chaleco reflectivo clase 3","Botines punta de acero","Guantes anticorte","Lentes de seguridad","Protector solar"]'::jsonb,
  'a0000000-0000-4000-8000-000000000005',
  wo.service_id || '/firmas/ats/' || wo.id || '.png',
  wo.work_date + time '07:20',
  -9.5 + random() * 1.4, -78.5 + random() * 0.7,
  (select leader_id from public.crews where id = wo.crew_id)
from public.work_orders wo
join public.services s on s.id = wo.service_id
join lateral (select we.* from public.work_entries we where we.work_order_id = wo.id limit 1) we on true
join public.activities_catalog a on a.id = we.activity_id
join public.road_sections rs on rs.id = we.section_id
where wo.deleted_at is null and (s.modules->>'ssoma')::boolean is true
  and wo.work_date >= current_date - 30;

-- Firmas del ATS
insert into public.ats_signatures (ats_id, full_name, dni, signature_path, signed_at)
select ai.id, cm.full_name, cm.dni,
       ai.service_id || '/firmas/ats/' || ai.id || '/' || cm.id || '.png',
       ai.doc_date + time '07:25'
from public.ats_iperc ai
join public.crew_members cm on cm.crew_id = ai.crew_id and cm.is_active
where ai.deleted_at is null;

-- ─── Lotes de importación (histórico del módulo 02) ──────────────────────
insert into public.import_batches (service_id, kind, file_name, total_rows, ok_rows, error_rows,
                                   status, mapping, errors, created_at, finished_at, created_by)
values
 ('22222222-2222-4222-8222-222222222221','programacion','Programacion_Semanal_RV4_S34.xlsx',186,186,0,'completado',
  '{"Actividad":"activity_code","Tramo":"section_code","Progresiva Inicio":"prog_start","Progresiva Fin":"prog_end","Cuadrilla":"crew_code","Fecha":"scheduled_on","Meta":"target_qty"}'::jsonb,
  '[]'::jsonb, now() - interval '9 days', now() - interval '9 days' + interval '42 seconds',
  'a0000000-0000-4000-8000-000000000002'),
 ('22222222-2222-4222-8222-222222222221','pci','PCI-2026-047_Alcantarillas_OSITRAN.xlsx',300,300,0,'completado',
  '{"Item":"item_number","Descripcion":"description","Tramo":"section_code","Progresiva":"prog_start","Plazo (dias)":"term_days"}'::jsonb,
  '[]'::jsonb, now() - interval '4 days', now() - interval '4 days' + interval '1 minute 18 seconds',
  'a0000000-0000-4000-8000-000000000002'),
 ('22222222-2222-4222-8222-222222222221','inventario','Inventario_Vial_RV4_2026.xlsx',3632,3618,14,'completado',
  '{"Codigo":"code","Tipo":"type_code","Tramo":"section_code","Progresiva":"progresiva","Lado":"side","Estado":"condition"}'::jsonb,
  '[{"fila":417,"error":"Progresiva fuera del rango del tramo T-02"},{"fila":1893,"error":"Tipo de elemento no reconocido: BARANDA"},{"fila":2740,"error":"Código duplicado T-05-SEV-041"}]'::jsonb,
  now() - interval '21 days', now() - interval '21 days' + interval '3 minutes 6 seconds',
  'a0000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ─── Notificaciones (bandeja viva) ───────────────────────────────────────
select public.evaluate_pci_deadlines();

insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data, read_at)
select '22222222-2222-4222-8222-222222222221', p.id, x.type, x.title, x.body, x.url, x.sev, '{}'::jsonb,
       case when random() < 0.4 then now() - interval '2 hours' else null end
from public.profiles p
cross join (values
 ('programacion_publicada','Programación semanal publicada','La programación de la semana en curso ya está disponible para tu cuadrilla.','/programacion','info'),
 ('parte_validado','Parte diario validado','Tu parte del día anterior fue validado por el supervisor.','/campo','success'),
 ('pci_prioritario','PCI-2026-047 ingresado · prioridad alta','300 ítems de drenaje transversal con plazos de 7 a 30 días. Requiere reordenar la programación.','/pci','danger')
) as x(type, title, body, url, sev)
where p.is_demo and p.role in ('supervisor','jefe_cuadrilla','admin');

select
 (select count(*) from public.safety_talks) as charlas,
 (select count(*) from public.talk_attendance) as asistencias,
 (select count(*) from public.checklist_responses) as checklists,
 (select count(*) from public.ats_iperc) as ats,
 (select count(*) from public.ats_signatures) as firmas_ats,
 (select count(*) from public.notifications) as notificaciones;
