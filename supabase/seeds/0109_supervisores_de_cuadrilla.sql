-- Quién supervisa cada cuadrilla.
--
-- Hoy Servicon tiene un solo supervisor de campo registrado, así que las
-- siete cuadrillas del contrato SUR quedan a su cargo. Cuando entre el
-- segundo supervisor basta con repartir esta columna: el panel se acota
-- solo, sin tocar código.

update public.crews c
   set supervisor_id = 'a0000000-0000-4000-8000-000000000002'
  from public.services s
 where s.id = c.service_id
   and s.code = 'SUR'
   and c.deleted_at is null;

update public.crews c
   set supervisor_id = 'a0000000-0000-4000-8000-000000000002'
  from public.services s
 where s.id = c.service_id
   and s.code = 'HUA'
   and c.deleted_at is null;
