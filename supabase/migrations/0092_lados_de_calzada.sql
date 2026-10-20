-- ═══════════════════════════════════════════════════════════════════════
-- 0092 · Los lados de calzada (Elvis, respuesta 8: «agregar CD/CI»)
--
-- CD = calzada derecha, CI = calzada izquierda. El PCI 55 ya los usa
-- («C.I.», «Calzada»). Los valores nuevos de un enum van solos en su
-- migración: no se pueden usar en la misma transacción en que se crean.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.road_side add value if not exists 'calzada_derecha';
alter type public.road_side add value if not exists 'calzada_izquierda';
