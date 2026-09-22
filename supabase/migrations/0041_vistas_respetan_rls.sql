-- ═══════════════════════════════════════════════════════════════════════
-- 0041 · Las vistas tienen que respetar las políticas, no saltárselas
--
-- Todas las tablas de SIGOV están protegidas con RLS por `service_id`: un
-- usuario solo ve el contrato al que pertenece. Pero una vista de Postgres
-- se ejecuta, por omisión, con los permisos de **quien la creó**, no de
-- quien la consulta. Eso quiere decir que las once vistas que no declaran
-- `security_invoker` devolvían todo, saltándose las políticas de las
-- tablas que leen.
--
-- En la práctica: el jefe de cuadrilla del contrato de Huaura podía pedir
-- por REST `v_cash_boxes` o `v_plan_items` y ver la caja chica y la
-- programación del contrato del sur. La aplicación nunca lo hace, pero la
-- aplicación no es la frontera de seguridad: el token sí, y con el token
-- se puede consultar cualquier cosa.
--
-- Tres vistas ya lo declaraban —v_pci_items, v_road_assets y
-- v_work_entries—, que es la prueba de que era la intención desde el
-- principio y se fue quedando por el camino.
-- ═══════════════════════════════════════════════════════════════════════

alter view public.v_cash_boxes       set (security_invoker = on);
alter view public.v_cash_movements   set (security_invoker = on);
alter view public.v_evidences        set (security_invoker = on);
alter view public.v_hygiene_today    set (security_invoker = on);
alter view public.v_plan_items       set (security_invoker = on);
alter view public.v_safety_equipment set (security_invoker = on);
alter view public.v_safety_talks     set (security_invoker = on);
alter view public.v_supplies         set (security_invoker = on);
alter view public.v_supply_requests  set (security_invoker = on);
alter view public.v_vehicles         set (security_invoker = on);
alter view public.v_vencimientos     set (security_invoker = on);
