-- ═══════════════════════════════════════════════════════════════════════
-- 0094 · El rol «residente» (Elvis, P17)
--
-- El ingeniero residente es el coordinador del contrato: jefe inmediato de
-- los supervisores, no uno más de ellos. Va solo en su migración: un valor
-- nuevo de un enum no se puede usar en la misma transacción.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.user_role add value if not exists 'residente' after 'supervisor';
