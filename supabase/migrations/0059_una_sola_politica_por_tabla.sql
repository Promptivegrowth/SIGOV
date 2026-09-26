-- ═══════════════════════════════════════════════════════════════════════
-- 0059 · Una sola política de lectura en evidencias y sus vínculos
--
-- Con el inventario oficial cargado —7.728 elementos, 4.223 fotos, 7.683
-- vínculos— el mapa del inventario dejó de cargar: «canceling statement
-- due to statement timeout» a los ocho segundos. Sin permisos de por medio
-- la misma consulta tarda 665 ms, así que el tiempo se iba en las
-- políticas.
--
-- La 0053 cambió las políticas de lectura por la forma que se resuelve una
-- vez —pertenencia a un conjunto— en vez de la que llama a is_member() fila
-- por fila. Las creó como «evidences_select» y «evidence_links_select»,
-- pero en estas dos tablas las antiguas se llamaban «ev_select» y
-- «evlink_select», y no se borraron. Dos políticas permisivas se combinan
-- con OR: la antigua seguía evaluándose en cada fila. Con 2.700 elementos
-- de prueba no se notaba; con el inventario real, sí.
--
-- Las dos conceden exactamente lo mismo —is_member() es «administrador de
-- plataforma o miembro del contrato», y la nueva también—, así que borrar
-- la antigua no cambia quién ve qué. Solo cómo se calcula.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists ev_select on public.evidences;
drop policy if exists evlink_select on public.evidence_links;
