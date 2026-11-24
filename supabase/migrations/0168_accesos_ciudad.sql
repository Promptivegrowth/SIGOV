-- 0168 · Historial de accesos (A05): ciudad aproximada del ingreso, tomada de la cabecera
-- del hosting (sin servicios externos de geolocalización).
alter table public.accesos add column if not exists ciudad text;
notify pgrst, 'reload schema';
