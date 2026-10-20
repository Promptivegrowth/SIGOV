-- ═══════════════════════════════════════════════════════════════════════
-- 0102 · El ATS del conductor y el PETAR, por foto (Elvis, P43 y P44)
--
-- P43: el ATS es uno por día y se fotografía, «ya no digital, lo mismo con
-- el del conductor». P44: el PETAR también va con foto, si ese día lo hay;
-- no es obligatorio. Los valores nuevos del enum van solos en su migración.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.documento_tipo add value if not exists 'ats_conductor' after 'ats';
alter type public.documento_tipo add value if not exists 'petar' after 'inspeccion_equipos';
