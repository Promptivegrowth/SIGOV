-- ═══════════════════════════════════════════════════════════════════════
-- 0093 · La carpeta de niveles de servicio de cada partida
--
-- Respuestas de Elvis al cuestionario (13/10/2026):
-- · P11: COV-BER-010 → PARCHADO_SUPERFICIAL_BERMA; COV-OTR-004 → OTROS.
-- · P31: captafaros → REPOSICION_REPARACION_GUARDAVIAS; drenes →
--   LIMPIEZA_ALCANTARILLAS; parchado profundo, imprimación, riego de liga,
--   slurry, micropavimento, fresado y sobrecapa → PARCHADO_SUPERFICIAL_
--   RODADURA o _BERMA según dónde se ejecuten; muros → MUROS; túnel →
--   TUNEL; barreras New Jersey → OTROS.
-- · P32 (cruce confirmado): GV-012 y GV-013 → REPOSICION_REPARACION_GUARDAVIAS.
-- · Sin respuesta expresa (propuesta de SIGOV, a confirmar con Elvis): los
--   obstáculos y el resonador van a la limpieza de su superficie; el
--   reciclado de berma, al parchado de berma; pintado de parapetos,
--   rellenos y anticorrosivo, a la reparación menor de alcantarillas; el
--   resto de «Otros», a OTROS. Así ninguna partida queda sin carpeta y
--   ninguna foto se pierde en la entrega.
-- MUROS, TUNEL y OTROS no estaban en la estructura de COVINCA: se crean
-- (carpetas nuevas dentro de cada sector, solo si tienen fotos).
-- ═══════════════════════════════════════════════════════════════════════

update public.activities_catalog a
   set carpeta_ns = m.carpeta, updated_at = now()
  from (values
    ('COV-BER-010', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-OTR-004', 'OTROS'),
    ('COV-CF-001',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-CF-002',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-CF-003',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-CF-004',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-GV-012',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-GV-013',  'REPOSICION_REPARACION_GUARDAVIAS'),
    ('COV-OD-002',  'LIMPIEZA_ALCANTARILLAS'),
    ('COV-OD-005',  'LIMPIEZA_ALCANTARILLAS'),
    ('COV-SR-006',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-007',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-010',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-011',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-012',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-014',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-SR-015',  'PARCHADO_SUPERFICIAL_RODADURA'),
    ('COV-BER-005', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-BER-006', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-BER-008', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-BER-012', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-BER-013', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-MUR-001', 'MUROS'),
    ('COV-MUR-002', 'MUROS'),
    ('COV-MUR-003', 'OTROS'),
    ('COV-BER-004', 'LIMPIEZA_BERMA'),
    ('COV-BER-009', 'PARCHADO_SUPERFICIAL_BERMA'),
    ('COV-SR-004',  'LIMPIEZA_SUPERFICIE_RODADURA'),
    ('COV-SR-005',  'LIMPIEZA_SUPERFICIE_RODADURA'),
    ('COV-OD-003',  'REPARACION_MENOR_ALCANTARILLAS_CONCRETO'),
    ('COV-OD-006',  'REPARACION_MENOR_ALCANTARILLAS_CONCRETO'),
    ('COV-OD-009',  'REPARACION_MENOR_ALCANTARILLAS_CONCRETO'),
    ('COV-OD-010',  'REPARACION_MENOR_ALCANTARILLAS_CONCRETO'),
    ('COV-OD-011',  'REPARACION_MENOR_ALCANTARILLAS_CONCRETO')
  ) as m(codigo, carpeta)
 where a.code = m.codigo and a.deleted_at is null;

-- Todo el túnel a su carpeta
update public.activities_catalog
   set carpeta_ns = 'TUNEL', updated_at = now()
 where code like 'COV-TUN-%' and deleted_at is null;

-- Lo que quede de «Otros» (charlas, carguío, apoyos, subsanaciones…)
update public.activities_catalog
   set carpeta_ns = 'OTROS', updated_at = now()
 where code like 'COV-OTR-%' and carpeta_ns is null and deleted_at is null;
