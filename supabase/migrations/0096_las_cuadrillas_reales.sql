-- ═══════════════════════════════════════════════════════════════════════
-- 0096 · Las 7 cuadrillas reales (Elvis, P1 y tabla del 13/10/2026)
--
-- Se identifican por su sede y se numeran CUA_01 … CUA_07. La sede queda
-- como la escribe la estructura de COVINCA (CUADRILLA_7_CONCORDIA). Cada
-- cuadrilla pertenece a un subtramo (1 a 4). Los jefes y supervisores de
-- la tabla (Jorge, Santos, Gustavo, José, Huver, Miguel, Junior; Ing. Juan,
-- Ing. Jesús, Ing. Jorge) se asignan cuando tengan su usuario: «los nombres
-- de personas pueden cambiar».
-- ═══════════════════════════════════════════════════════════════════════

alter table public.crews add column if not exists subtramo smallint check (subtramo between 1 and 9);
comment on column public.crews.subtramo is 'Subtramo del contrato al que pertenece la cuadrilla (proyecto del F7)';

update public.crews c
   set code = m.codigo, name = m.nombre, sede = m.sede, subtramo = m.subtramo, updated_at = now()
  from (values
    (1, 'CUA_01', 'Cuadrilla 1 · Camaná',       'CAMANA',    1),
    (2, 'CUA_02', 'Cuadrilla 2 · Pedregal',     'PEDREGAL',  1),
    (3, 'CUA_03', 'Cuadrilla 3 · Vítor',        'VITOR',     1),
    (4, 'CUA_04', 'Cuadrilla 4 · El Fiscal',    'FISCAL',    2),
    (5, 'CUA_05', 'Cuadrilla 5 · Moquegua',     'MOQUEGUA',  2),
    (6, 'CUA_06', 'Cuadrilla 6 · Tacna',        'TACNA',     3),
    (7, 'CUA_07', 'Cuadrilla 7 · La Concordia', 'CONCORDIA', 4)
  ) as m(numero, codigo, nombre, sede, subtramo)
 where c.service_id = '22222222-2222-4222-8222-222222222221'
   and c.numero = m.numero
   and c.deleted_at is null;
