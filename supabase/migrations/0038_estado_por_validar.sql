-- ═══════════════════════════════════════════════════════════════════════
-- 0038 · Falta un estado entre «la cuadrilla terminó» y «está aceptado»
--
-- La especificación pide cinco estados para la partida: pendiente, en
-- ejecución, culminada, observada y **pendiente de validación**. Ese
-- último no existe, y su ausencia se nota: hoy la partida salta sola a
-- «ejecutado» en cuanto el metrado alcanza la meta, sin que nadie la haya
-- mirado. El supervisor se entera de que una partida se dio por buena
-- cuando ya figura como buena.
--
-- Va en migración aparte porque Postgres no deja usar un valor de enum
-- recién agregado dentro de la misma transacción que lo agrega. El resto
-- del ciclo —iniciar, finalizar, reportar impedimento, validar— viene en
-- la 0039.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.plan_item_status add value if not exists 'por_validar' after 'en_curso';
