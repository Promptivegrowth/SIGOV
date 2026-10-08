-- ═══════════════════════════════════════════════════════════════════════
-- 0070 · El catálogo oficial de partidas COVINCA y los sectores
--
-- La programación, el reporte diario, la estructura documental que pide
-- COVINCA y los formatos oficiales hablan el mismo idioma: las 191 partidas
-- de la «PLANILLA COVINCA» (idéntica a la hoja LISTA_PARTIDAS del formato
-- 7). SIGOV tenía 20 partidas de demostración (MR-01…MR-20). Aquí entran
-- las oficiales, cada una con:
--
-- · su código COV (sin el espacio espurio de «COV- GV-001», que se guarda
--   aparte tal como vino);
-- · su número de partida COVINCA, que NO es correlativo (COV-DV-007 es la
--   114) y es el que se escribe en la programación semanal;
-- · su componente y su unidad;
-- · la carpeta de NIVELES DE SERVICIO a la que van sus fotos, según el
--   cruce que hizo Elvis (imagen del 05-10-2026). 66 partidas no tienen
--   carpeta todavía —túnel, muros, «otros» y algunas de rodadura, berma y
--   drenaje—: quedan sin carpeta hasta que COVINCA diga dónde van.
--
-- Las partidas de demostración no se borran —hay programación vieja que las
-- cita—, se desactivan.
--
-- Y los sectores de nivel de servicio: la estructura aprobada parte cada
-- subtramo en sectores de unos 25 km (SECTOR_1.1_852+335_877+000…). Una
-- foto va al sector que contiene su progresiva.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.activities_catalog
  add column if not exists numero_covinca     integer,
  add column if not exists codigo_original    text,
  add column if not exists carpeta_ns         text;

comment on column public.activities_catalog.numero_covinca is
  'N.º de partida de la PLANILLA COVINCA (columna «Código de Partida» de la programación). No es correlativo.';
comment on column public.activities_catalog.carpeta_ns is
  'Carpeta de NIVELES_DE_SERVICIO donde van las fotos de esta partida, según el cruce aprobado. Nulo si COVINCA no la asignó.';

-- ─── Las 191 partidas, en el contrato sur ─────────────────────────────
with servicio as (
  select id from public.services where code = 'SUR' or id = '22222222-2222-4222-8222-222222222221' limit 1
),
partidas (code, codigo_original, numero, componente, nombre, unidad, carpeta, color) as (
  values
  ('COV-SR-001', 'COV-SR-001', 1, 'Superficie de Rodadura', 'Limpieza de superficie de rodadura', 'M2', 'LIMPIEZA_SUPERFICIE_RODADURA', '#334155'),
  ('COV-SR-002', 'COV-SR-002', 2, 'Superficie de Rodadura', 'Limpieza de Derrumbes y Huaycos Menores (<15 m3) en superficie de rodadura', 'M3', 'LIMPIEZA_DERRUMBES_HUAYCOS_MENORES', '#334155'),
  ('COV-SR-003', 'COV-SR-003', 3, 'Superficie de Rodadura', 'Limpieza de Derrumbes y Huaycos Mayores (>15 m3) en superficie de rodadura', 'M3', 'LIMPIEZA_DERRUMBES_HUAYCOS_MAYORES', '#334155'),
  ('COV-SR-004', 'COV-SR-004', 4, 'Superficie de Rodadura', 'Limpieza de Resonador', 'M2', null, '#334155'),
  ('COV-SR-005', 'COV-SR-005', 5, 'Superficie de Rodadura', 'Eliminación de Obstáculos en superficie de rodadura', 'M3', null, '#334155'),
  ('COV-SR-006', 'COV-SR-006', 6, 'Superficie de Rodadura', 'Imprimación Asfáltica en superficie de rodadura (Base Granular - Material Bituminoso)', 'M2', null, '#334155'),
  ('COV-SR-007', 'COV-SR-007', 7, 'Superficie de Rodadura', 'Riego de Liga en superficie de rodadura (Material Bituminoso - Material Bituminoso)', 'M2', null, '#334155'),
  ('COV-SR-008', 'COV-SR-008', 8, 'Superficie de Rodadura', 'Parchado Superficial en superficie de rodadura con MAC (especificar espesor)', 'M2', 'PARCHADO_SUPERFICIAL_RODADURA', '#334155'),
  ('COV-SR-009', 'COV-SR-009', 9, 'Superficie de Rodadura', 'Parchado Superficial en superficie de rodadura con MAF (especificar espesor)', 'M2', 'PARCHADO_SUPERFICIAL_RODADURA', '#334155'),
  ('COV-SR-010', 'COV-SR-010', 10, 'Superficie de Rodadura', 'Parchado Profundo en superficie de rodadura con MAC (especificar espesor) - Incluye capas granulares', 'M2', null, '#334155'),
  ('COV-SR-011', 'COV-SR-011', 11, 'Superficie de Rodadura', 'Slurry Seal Manual en superficie de rodadura', 'M2', null, '#334155'),
  ('COV-SR-012', 'COV-SR-012', 12, 'Superficie de Rodadura', 'Micropavimento con Equipo', 'M2', null, '#334155'),
  ('COV-SR-013', 'COV-SR-013', 13, 'Superficie de Rodadura', 'Sello de Fisuras y grietas', 'ML', 'SELLO_FISURAS_RODADURA', '#334155'),
  ('COV-SR-014', 'COV-SR-014', 14, 'Superficie de Rodadura', 'Fresado en superficie de rodadura (especificar espesor)', 'M2', null, '#334155'),
  ('COV-SR-015', 'COV-SR-015', 15, 'Superficie de Rodadura', 'Instalación de Sobrecapa (e: 8 -10 cm) en superficie de rodadura', 'M2', null, '#334155'),
  ('COV-BER-001', 'COV-BER-001', 16, 'Berma', 'Limpieza en Berma', 'M2', 'LIMPIEZA_BERMA', '#78716C'),
  ('COV-BER-002', 'COV-BER-002', 17, 'Berma', 'Limpieza de Derrumbes y Huaycos Menores (<15 m3) en Berma', 'M3', 'LIMPIEZA_DERRUMBES_HUAYCOS_MENORES', '#78716C'),
  ('COV-BER-003', 'COV-BER-003', 18, 'Berma', 'Limpieza de Derrumbes y Huaycos Mayores (>15 m3) en Berma', 'M3', 'LIMPIEZA_DERRUMBES_HUAYCOS_MAYORES', '#78716C'),
  ('COV-BER-004', 'COV-BER-004', 19, 'Berma', 'Eliminación de Obstáculos en Berma', 'M3', null, '#78716C'),
  ('COV-BER-005', 'COV-BER-005', 20, 'Berma', 'Imprimación Asfáltica en Berma (Base Granular - Material Bituminoso)', 'M2', null, '#78716C'),
  ('COV-BER-006', 'COV-BER-006', 21, 'Berma', 'Riego de Liga en Berma (Material Bituminoso - Material Bituminoso)', 'M2', null, '#78716C'),
  ('COV-BER-007', 'COV-BER-007', 22, 'Berma', 'Parchado Superficial en Berma con MAF (especificar espesor)', 'M2', 'PARCHADO_SUPERFICIAL_BERMA', '#78716C'),
  ('COV-BER-008', 'COV-BER-008', 23, 'Berma', 'Parchado Profundo en Berma (especificar Tratamiento asfáltico y espesor) - Incluye capas granulares', 'M2', null, '#78716C'),
  ('COV-BER-009', 'COV-BER-009', 24, 'Berma', 'Reconformación de Bermas (Reciclado en frío)', 'M2', null, '#78716C'),
  ('COV-BER-010', 'COV-BER-010', 25, 'Berma', 'Slurry Seal Manual en Berma', 'M2', null, '#78716C'),
  ('COV-BER-011', 'COV-BER-011', 26, 'Berma', 'Sello de Fisuras y grietas en Berma', 'ML', 'SELLO_FISURAS_BERMA', '#78716C'),
  ('COV-BER-012', 'COV-BER-012', 27, 'Berma', 'Fresado en Berma (especificar espesor)', 'M2', null, '#78716C'),
  ('COV-BER-013', 'COV-BER-013', 28, 'Berma', 'Reparación de Borde de Berma - Slurry Seal Manual', 'M2', null, '#78716C'),
  ('COV-OD-001', 'COV-OD-001', 29, 'Obras de Drenaje', 'Limpieza manual y desbroce de Alcantarilla', 'ML', 'LIMPIEZA_ALCANTARILLAS', '#0EA5E9'),
  ('COV-OD-002', 'COV-OD-002', 30, 'Obras de Drenaje', 'Limpieza manual y desbroce de Drenes', 'ML', null, '#0EA5E9'),
  ('COV-OD-003', 'COV-OD-003', 31, 'Obras de Drenaje', 'Pintado de Parapetos de Alcantarilla', 'M2', null, '#0EA5E9'),
  ('COV-OD-004', 'COV-OD-004', 32, 'Obras de Drenaje', 'Descolmatación de Alcantarilla', 'M3', 'LIMPIEZA_ALCANTARILLAS', '#0EA5E9'),
  ('COV-OD-005', 'COV-OD-005', 33, 'Obras de Drenaje', 'Descolmatación de Drenes', 'M3', null, '#0EA5E9'),
  ('COV-OD-006', 'COV-OD-006', 34, 'Obras de Drenaje', 'Pintado de Parapetos de Alcantarilla', 'M2', null, '#0EA5E9'),
  ('COV-OD-007', 'COV-OD-007', 35, 'Obras de Drenaje', 'Resane de fisuras y grietas en concreto', 'ML', 'REPARACION_MENOR_ALCANTARILLAS_CONCRETO', '#0EA5E9'),
  ('COV-OD-008', 'COV-OD-008', 36, 'Obras de Drenaje', 'Resane de parapetos y cabezales de alcantarilla', 'M2', 'REPARACION_MENOR_ALCANTARILLAS_CONCRETO', '#0EA5E9'),
  ('COV-OD-009', 'COV-OD-009', 37, 'Obras de Drenaje', 'Relleno con Material Propio en Alcantarilla', 'M3', null, '#0EA5E9'),
  ('COV-OD-010', 'COV-OD-010', 38, 'Obras de Drenaje', 'Relleno con Material Granular de Préstamo en Alcantarilla', 'M3', null, '#0EA5E9'),
  ('COV-OD-011', 'COV-OD-011', 180, 'Obras de Drenaje', 'Tratamiento Anticorrosivo en Alcantarilla TMC', 'M2', null, '#0EA5E9'),
  ('COV-SH-001', 'COV-SH-001', 39, 'Señalización Horizontal', 'Correción de Demarcación - Líneas con Pintura Tráfico Negro', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-002', 'COV-SH-002', 40, 'Señalización Horizontal', 'Correción de Demarcación - Letras y Símbolos con Pintura Tráfico Negro', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-003', 'COV-SH-003', 41, 'Señalización Horizontal', 'Pintado de Demarcación - Líneas (Blanco) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-004', 'COV-SH-004', 42, 'Señalización Horizontal', 'Pintado de Demarcación - Líneas (Amarillo) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-005', 'COV-SH-005', 43, 'Señalización Horizontal', 'Pintado de Demarcación - Letras y Símbolos (Blanco) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-006', 'COV-SH-006', 44, 'Señalización Horizontal', 'Pintado de Demarcación - Letras y Símbolos (Amarillo) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-007', 'COV-SH-007', 45, 'Señalización Horizontal', 'Limpieza y lavado de Demarcación - Líneas (Blanco) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-008', 'COV-SH-008', 46, 'Señalización Horizontal', 'Limpieza y lavado de Demarcación - Letras y Símbolos (Blanco) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-009', 'COV-SH-009', 47, 'Señalización Horizontal', 'Limpieza y lavado de Demarcación - Líneas (Amarillo) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-010', 'COV-SH-010', 48, 'Señalización Horizontal', 'Limpieza y lavado de Demarcación - Letras y Símbolos (Amarillo) en el Pavimento', 'M2', 'CONSERVACION_MARCAS_HORIZONTALES', '#F59E0B'),
  ('COV-SH-011', 'COV-SH-011', 49, 'Señalización Horizontal', 'Reposición de tachas bidireccionales', 'UND', 'REPOSICION_TACHAS', '#F59E0B'),
  ('COV-SH-012', 'COV-SH-012', 50, 'Señalización Horizontal', 'Reposición de reductores de velocidad (tachones)', 'UND', 'REPOSICION_TACHAS', '#F59E0B'),
  ('COV-SV-001', 'COV-SV-001', 51, 'Señalización Vertical', 'Limpieza de Señal Preventiva (soporte + panel)', 'UND', 'LIMPIEZA_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-002', 'COV-SV-002', 52, 'Señalización Vertical', 'Reposición de panel de Señal Preventiva', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-003', 'COV-SV-003', 53, 'Señalización Vertical', 'Relaminado de panel de Señal Preventiva', 'M2', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-004', 'COV-SV-004', 54, 'Señalización Vertical', 'Limpieza de Señal Reglamentaria (soporte + panel)', 'UND', 'LIMPIEZA_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-005', 'COV-SV-005', 55, 'Señalización Vertical', 'Reposición de panel de Señal Reglamentaria', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-006', 'COV-SV-006', 56, 'Señalización Vertical', 'Relaminado de panel de Señal Reglamentaria', 'M2', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-007', 'COV-SV-007', 57, 'Señalización Vertical', 'Reparación (Enderezamiento) de panel de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-008', 'COV-SV-008', 58, 'Señalización Vertical', 'Ajuste de panel de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-009', 'COV-SV-009', 59, 'Señalización Vertical', 'Reposición de pernos, tuercas y arandelas (P/R)', 'JGO', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-010', 'COV-SV-010', 60, 'Señalización Vertical', 'Reposición de postes de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_POSTES', '#EAB308'),
  ('COV-SV-011', 'COV-SV-011', 61, 'Señalización Vertical', 'Pintado de poste de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_POSTES', '#EAB308'),
  ('COV-SV-012', 'COV-SV-012', 62, 'Señalización Vertical', 'Reparación (Resane) de poste de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_POSTES', '#EAB308'),
  ('COV-SV-013', 'COV-SV-013', 63, 'Señalización Vertical', 'Reparación (Alineamiento) de poste de Señal Vertical (P/R)', 'UND', 'REPOSICION_REPARACION_POSTES', '#EAB308'),
  ('COV-SV-014', 'COV-SV-014', 64, 'Señalización Vertical', 'Limpieza de Señal Informativa (soporte + pórtico + panel)', 'UND', 'LIMPIEZA_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-015', 'COV-SV-015', 65, 'Señalización Vertical', 'Reposición de panel de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-016', 'COV-SV-016', 66, 'Señalización Vertical', 'Relaminado de panel de Señal Informativa', 'M2', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-017', 'COV-SV-017', 67, 'Señalización Vertical', 'Reparación (Enderezamiento) de panel de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-018', 'COV-SV-018', 68, 'Señalización Vertical', 'Reposición de pórtico de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-019', 'COV-SV-019', 69, 'Señalización Vertical', 'Reposición de pernos, tuercas y arandelas de Señal Informativa', 'JGO', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-020', 'COV-SV-020', 70, 'Señalización Vertical', 'Reposición de soporte (dado de concreto) de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-021', 'COV-SV-021', 71, 'Señalización Vertical', 'Pintado de pórtico de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-022', 'COV-SV-022', 72, 'Señalización Vertical', 'Pintado de soporte (dado de concreto) de Señal Informativa', 'M2', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-023', 'COV-SV-023', 73, 'Señalización Vertical', 'Pintado de elementos de fijación (ante oxidaciones) de Señal Informativa', 'GLB', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-024', 'COV-SV-024', 74, 'Señalización Vertical', 'Soldado de elementos de fijación (ante oxidaciones) de Señal Informativa', 'GLB', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-025', 'COV-SV-025', 75, 'Señalización Vertical', 'Ajuste de panel de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-026', 'COV-SV-026', 76, 'Señalización Vertical', 'Reparación (Resane) de soporte (dado de concreto) de Señal Informativa', 'M2', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-027', 'COV-SV-027', 77, 'Señalización Vertical', 'Reparación (Soldado y enderezamiento) de pórtico de Señal Informativa', 'UND', 'REPOSICION_REPARACION_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-028', 'COV-SV-028', 78, 'Señalización Vertical', 'Desbroce de vegetación que impida visibilidad de Señal Vertical (P/R/I)', 'ML', 'LIMPIEZA_SENALES_VERTICALES', '#EAB308'),
  ('COV-SV-029', 'COV-SV-029', 79, 'Señalización Vertical', 'Limpieza de Hitos Kilométricos', 'UND', 'LIMPIEZA_HITOS_KILOMETRICOS', '#EAB308'),
  ('COV-SV-030', 'COV-SV-030', 80, 'Señalización Vertical', 'Reposición de Hitos Kilométricos', 'UND', 'REPOSICION_REPARACION_HITOS', '#EAB308'),
  ('COV-SV-031', 'COV-SV-031', 81, 'Señalización Vertical', 'Pintado de Hitos Kilométricos', 'UND', 'REPOSICION_REPARACION_HITOS', '#EAB308'),
  ('COV-SV-032', 'COV-SV-032', 82, 'Señalización Vertical', 'Reparación (Resane) de Hitos Kilométricos', 'UND', 'REPOSICION_REPARACION_HITOS', '#EAB308'),
  ('COV-SV-033', 'COV-SV-033', 83, 'Señalización Vertical', 'Alineamiento de Hitos Kilométricos', 'UND', 'REPOSICION_REPARACION_HITOS', '#EAB308'),
  ('COV-SV-034', 'COV-SV-034', 84, 'Señalización Vertical', 'Desbroce de vegetación que impida visibilidad de Hitos Kilométricos', 'UND', 'REPOSICION_REPARACION_HITOS', '#EAB308'),
  ('COV-GV-001', 'COV- GV-001', 85, 'Encarrilamiento', 'Limpieza de Guardavia', 'ML', 'LIMPIEZA_GUARDAVIA', '#64748B'),
  ('COV-GV-002', 'COV- GV-002', 86, 'Encarrilamiento', 'Reposición de Vigas de Guardavías', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-003', 'COV- GV-003', 87, 'Encarrilamiento', 'Reposición de postes de Guardavías', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-004', 'COV- GV-004', 88, 'Encarrilamiento', 'Reposición de pernos, tuercas y arandelas de Guardavías', 'JGO', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-005', 'COV- GV-005', 89, 'Encarrilamiento', 'Reposición de terminal de salida de Guardavías', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-006', 'COV- GV-006', 90, 'Encarrilamiento', 'Reposición de terminal de ingreso de Guardavías', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-007', 'COV- GV-007', 91, 'Encarrilamiento', 'Pintado de Guardavías', 'M2', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-008', 'COV- GV-008', 92, 'Encarrilamiento', 'Limpieza de Barrera Metálica', 'ML', 'LIMPIEZA_GUARDAVIA', '#64748B'),
  ('COV-GV-009', 'COV- GV-009', 93, 'Encarrilamiento', 'Reposición de Vigas de Barreras Metálicas', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-010', 'COV- GV-010', 94, 'Encarrilamiento', 'Reposición de postes de Barreras Metálicas', 'UND', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-011', 'COV- GV-011', 95, 'Encarrilamiento', 'Reposición de pernos, tuercas y arandelas de Barreras Metálicas (Viga - Viga / Viga - Terminal)', 'JGO', 'REPOSICION_REPARACION_GUARDAVIAS', '#64748B'),
  ('COV-GV-012', 'COV- GV-012', 96, 'Encarrilamiento', 'Reposición de piastrina, pernos, tuercas y arandelas de Barreras Metálicas (Poste - Viga)', 'JGO', null, '#64748B'),
  ('COV-GV-013', 'COV- GV-013', 97, 'Encarrilamiento', 'Reposición de terminal de Barreras Metálicas', 'UND', null, '#64748B'),
  ('COV-CF-001', 'COV- CF-001', 98, 'Encarrilamiento', 'Limpieza de captafaros', 'UND', null, '#64748B'),
  ('COV-CF-002', 'COV- CF-002', 99, 'Encarrilamiento', 'Reposición de captafaros', 'UND', null, '#64748B'),
  ('COV-CF-003', 'COV- CF-003', 100, 'Encarrilamiento', 'Reposición de pernos, tuercas y arandelas de Captafaros', 'UND', null, '#64748B'),
  ('COV-CF-004', 'COV- CF-004', 101, 'Encarrilamiento', 'Reposición de lámina reflectiva en Captafaros', 'UND', null, '#64748B'),
  ('COV-DL-001', 'COV- DL-001', 102, 'Encarrilamiento', 'Limpieza de delineadores', 'UND', 'LIMPIEZA_POSTES_DELINEADORES', '#64748B'),
  ('COV-DL-002', 'COV- DL-002', 103, 'Encarrilamiento', 'Reposición de delineadores', 'UND', 'REPOSICION_REPARACION_POSTES', '#64748B'),
  ('COV-DL-003', 'COV- DL-003', 104, 'Encarrilamiento', 'Alineamiento de delineadores', 'UND', 'REPOSICION_REPARACION_POSTES', '#64748B'),
  ('COV-DL-004', 'COV- DL-004', 105, 'Encarrilamiento', 'Pintado de delineadores', 'UND', 'REPOSICION_REPARACION_POSTES', '#64748B'),
  ('COV-DL-005', 'COV- DL-005', 106, 'Encarrilamiento', 'Reposición de lámina reflectiva en delineador', 'UND', 'REPOSICION_REPARACION_POSTES', '#64748B'),
  ('COV-DL-006', 'COV-DL-006', 107, 'Encarrilamiento', 'Desbroce de vegetación que impida visibilidad de Poste delineadores', 'UND', 'LIMPIEZA_POSTES_DELINEADORES', '#64748B'),
  ('COV-DV-001', 'COV-DV-001', 108, 'Derecho de Vía', 'Desbroce de vegetación en Derecho de Vía', 'ML', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-002', 'COV-DV-002', 109, 'Derecho de Vía', 'Eliminación de Obstáculo en Derecho de Vía', 'ML', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-003', 'COV-DV-003', 110, 'Derecho de Vía', 'Remoción de arena (Carguío y Eliminación) en Derecho de Vía c/Equipo', 'M3', 'REMOCION_ARENA_MANUAL_EQUIPOS', '#16A34A'),
  ('COV-DV-004', 'COV-DV-004', 111, 'Derecho de Vía', 'Remoción de arena (Empuje Lateral) en Derecho de Vía c/Equipo', 'ML', 'REMOCION_ARENA_MANUAL_EQUIPOS', '#16A34A'),
  ('COV-DV-005', 'COV-DV-005', 112, 'Derecho de Vía', 'Conformación de erosiones y sedimentos', 'ML', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-006', 'COV-DV-006', 113, 'Derecho de Vía', 'Eliminación de Aguas empozadas', 'M2', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-007', 'COV-DV-007', 114, 'Derecho de Vía', 'Limpieza manual de residuos en Derecho de Vía (Cantidad de Bolsa de 200 litros/0.2 m3)', 'M3', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-008', 'COV-DV-008', 115, 'Derecho de Vía', 'Eliminación Manual de Montículos pequeños o escombros', 'M3', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-009', 'COV-DV-009', 116, 'Derecho de Vía', 'Eliminación de Montículos o escombros con Equipo', 'M3', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-010', 'COV-DV-010', 117, 'Derecho de Vía', 'Retiro de Propaganda instalada', 'UND', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-011', 'COV-DV-011', 118, 'Derecho de Vía', 'Retiro de Propaganda pintada', 'M2', 'DERECHO_VIA_LIMPIEZA_DESBROCE', '#16A34A'),
  ('COV-DV-012', 'COV-DV-012', 181, 'Derecho de Vía', 'Remoción de arena con herramientas manuales', 'M3', 'REMOCION_ARENA_MANUAL_EQUIPOS', '#16A34A'),
  ('COV-PP-001', 'COV-PP-001', 119, 'Puentes y Pontones', 'Limpieza de cara superior de tablero de Puentes y pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-002', 'COV-PP-002', 120, 'Puentes y Pontones', 'Desobstrucción de drenes en Puentes y pontones', 'UND', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-003', 'COV-PP-003', 121, 'Puentes y Pontones', 'Eliminación de nidos de pájaros o colonias de insectos en Puentes y pontones', 'GLB', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-004', 'COV-PP-004', 122, 'Puentes y Pontones', 'Desbroce de vegetación en grietas en Puentes y pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-005', 'COV-PP-005', 123, 'Puentes y Pontones', 'Imprimación Asfáltica (Base Granular - Material Bituminoso) en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-006', 'COV-PP-006', 124, 'Puentes y Pontones', 'Riego de Liga (Material Bituminoso - Material Bituminoso) en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-007', 'COV-PP-007', 125, 'Puentes y Pontones', 'Parchado Superficial con MAC (especificar espesor) en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-008', 'COV-PP-008', 126, 'Puentes y Pontones', 'Parchado Superficial con MAF (especificar espesor) en superficie de rodadura Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-009', 'COV-PP-009', 127, 'Puentes y Pontones', 'Parchado Profundo con MAC en superficie de rodadura (especificar espesor) de Puentes y Pontones - Incluye capas granulares', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-010', 'COV-PP-010', 128, 'Puentes y Pontones', 'Slurry Seal Manual en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-011', 'COV-PP-011', 129, 'Puentes y Pontones', 'Micropavimento con Equipo (especificar espesor) en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-012', 'COV-PP-012', 130, 'Puentes y Pontones', 'Instalación de Sobrecapa (e: 8 -10 cm) en superficie de rodadura de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-013', 'COV-PP-013', 131, 'Puentes y Pontones', 'Fresado en superficie de rodadura (especificar espesor) de Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-014', 'COV-PP-014', 132, 'Puentes y Pontones', 'Sello de Fisuras y grietas en superficie de rodadura de Puentes y Pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-015', 'COV-PP-015', 133, 'Puentes y Pontones', 'Sello de Fisuras y grietas en berma de Puentes y Pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-016', 'COV-PP-016', 134, 'Puentes y Pontones', 'Limpieza en sistema de apoyo en Puentes y Pontones', 'GLB', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-017', 'COV-PP-017', 135, 'Puentes y Pontones', 'Limpieza de cauce y descolmatación en Puentes y Pontones', 'M3', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-018', 'COV-PP-018', 136, 'Puentes y Pontones', 'Limpieza de barandas y parapetos en Puentes y Pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-019', 'COV-PP-019', 137, 'Puentes y Pontones', 'Pintado de barandas metálicas en Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-020', 'COV-PP-020', 138, 'Puentes y Pontones', 'Pintado de barandas de concreto en Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-021', 'COV-PP-021', 139, 'Puentes y Pontones', 'Reparación de barandas metálicas en Puentes y Pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-022', 'COV-PP-022', 140, 'Puentes y Pontones', 'Reparación de barandas de concreto en Puentes y Pontones', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-023', 'COV-PP-023', 141, 'Puentes y Pontones', 'Pintado de Parapetos de Barandas en Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-024', 'COV-PP-024', 142, 'Puentes y Pontones', 'Limpieza de Veredas en Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-025', 'COV-PP-025', 143, 'Puentes y Pontones', 'Pintado de Veredas en Puentes y Pontones', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-026', 'COV-PP-026', 182, 'Puentes y Pontones', 'Sellado de fisuras (e≥0.3mm) en superficies de concreto (subestructura y superestructura)', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-027', 'COV-PP-027', 183, 'Puentes y Pontones', 'Resanes en Superficies de Concreto', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-028', 'COV-PP-028', 184, 'Puentes y Pontones', 'Solaqueo de Superficies de Concreto', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-029', 'COV-PP-029', 185, 'Puentes y Pontones', 'Bruña rompe aguas', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-030', 'COV-PP-030', 186, 'Puentes y Pontones', 'Reparación/Sustitución/Sellado de Juntas extremas o intermedias', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-031', 'COV-PP-031', 187, 'Puentes y Pontones', 'Reparación y Resanes en bordes de juntas de dilatación', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-032', 'COV-PP-032', 188, 'Puentes y Pontones', 'Hidrolavado de estructuras (super y subestructura)', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-033', 'COV-PP-033', 189, 'Puentes y Pontones', 'Desbroce alrededor de las estructuras', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-034', 'COV-PP-034', 190, 'Puentes y Pontones', 'Sellado de fisuras (e≥0.3mm) en veredas', 'ML', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-PP-035', 'COV-PP-035', 191, 'Puentes y Pontones', 'Solaqueo de Superficies de veredas', 'M2', 'ACTIVIDADES_PUENTES_PONTONES', '#7C3AED'),
  ('COV-TUN-001', 'COV-TUN-001', 144, 'Túnel', 'Limpieza en superficie de rodadura de Tunel', 'M2', null, '#57534E'),
  ('COV-TUN-002', 'COV-TUN-002', 145, 'Túnel', 'Limpieza en bema de Tunel', 'M2', null, '#57534E'),
  ('COV-TUN-003', 'COV-TUN-003', 146, 'Túnel', 'Eliminación de Obstáculos en superficie de rodadura de Túnel', 'M3', null, '#57534E'),
  ('COV-TUN-004', 'COV-TUN-004', 147, 'Túnel', 'Eliminación de Obstáculos en Berma de Túnel', 'M3', null, '#57534E'),
  ('COV-TUN-005', 'COV-TUN-005', 148, 'Túnel', 'Imprimación Asfáltica (Base Granular - Material Bituminoso) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-006', 'COV-TUN-006', 149, 'Túnel', 'Riego de Liga (Material Bituminoso - Material Bituminoso) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-007', 'COV-TUN-007', 150, 'Túnel', 'Parchado Superficial con MAC (especificar espesor) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-008', 'COV-TUN-008', 151, 'Túnel', 'Parchado Superficial con MAF (especificar espesor) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-009', 'COV-TUN-009', 152, 'Túnel', 'Parchado Profundo (especificar espesor) con MAC en superficie de rodadura de Túnel - Incluye capas granulares', 'M2', null, '#57534E'),
  ('COV-TUN-010', 'COV-TUN-010', 153, 'Túnel', 'Slurry Seal Manual en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-011', 'COV-TUN-011', 154, 'Túnel', 'Micropavimento con Equipo (especificar espesor) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-012', 'COV-TUN-012', 155, 'Túnel', 'Instalación de Sobrecapa (e: 8 -10 cm) en superficie de rodadura de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-013', 'COV-TUN-013', 156, 'Túnel', 'Imprimación Asfáltica (Base Granular - Material Bituminoso) en Berma de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-014', 'COV-TUN-014', 157, 'Túnel', 'Riego de Liga (Material Bituminoso - Material Bituminoso) en Berma de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-015', 'COV-TUN-015', 158, 'Túnel', 'Parchado Superficial con MAF (especificar espesor) en Berma de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-016', 'COV-TUN-016', 159, 'Túnel', 'Parchado Profundo (especificar Tratamiento asfáltico y espesor) en Berma de Túnel - Incluye capas granulares', 'M2', null, '#57534E'),
  ('COV-TUN-017', 'COV-TUN-017', 160, 'Túnel', 'Reconformación en Berma de Túnel (Reciclado en frío)', 'M2', null, '#57534E'),
  ('COV-TUN-018', 'COV-TUN-018', 161, 'Túnel', 'Slurry Seal Manual en Berma de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-019', 'COV-TUN-019', 162, 'Túnel', 'Sello de Fisuras y grietas en superficie de rodadura de Túnel', 'ML', null, '#57534E'),
  ('COV-TUN-020', 'COV-TUN-020', 163, 'Túnel', 'Sello de Fisuras y grietas en Berma de Túnel', 'ML', null, '#57534E'),
  ('COV-TUN-021', 'COV-TUN-021', 164, 'Túnel', 'Fresado en superficie de rodadura (especificar espesor) de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-022', 'COV-TUN-022', 165, 'Túnel', 'Fresado en berma (especificar espesor) de Túnel', 'M2', null, '#57534E'),
  ('COV-TUN-023', 'COV-TUN-023', 166, 'Túnel', 'Resane de Fisuras y grietas en conreto de revestimiento de Tunel', 'ML', null, '#57534E'),
  ('COV-TUN-024', 'COV-TUN-024', 167, 'Túnel', 'Pintado de la estructura del Túnel', 'M2', null, '#57534E'),
  ('COV-MUR-001', 'COV-MUR-001', 168, 'Muros de Contención', 'Limpieza de Muros de Contención', 'ML', null, '#A16207'),
  ('COV-MUR-002', 'COV-MUR-002', 169, 'Muros de Contención', 'Pintado de Muros de Conteción', 'M2', null, '#A16207'),
  ('COV-MUR-003', 'COV-MUR-003', 170, 'Muros de Contención', 'Reposición de barreras New Jersey', 'ML', null, '#A16207'),
  ('COV-OTR-001', 'COV-OTR-001', 171, 'Otros', 'Charla de Seguridad', 'HH', null, '#94A3B8'),
  ('COV-OTR-002', 'COV-OTR-002', 172, 'Otros', 'Charla de Inducción', 'HH', null, '#94A3B8'),
  ('COV-OTR-003', 'COV-OTR-003', 173, 'Otros', 'Carguío de Material', 'HH', null, '#94A3B8'),
  ('COV-OTR-004', 'COV-OTR-004', 174, 'Otros', 'Verificación y recorrido del Tramo', 'KM', null, '#94A3B8'),
  ('COV-OTR-005', 'COV-OTR-005', 175, 'Otros', 'Apoyo en Inspección Semestral', 'KM', null, '#94A3B8'),
  ('COV-OTR-006', 'COV-OTR-006', 176, 'Otros', 'Apoyo en Limpieza y ordenamiento de Almacén', 'HH', null, '#94A3B8'),
  ('COV-OTR-007', 'COV-OTR-007', 177, 'Otros', 'Fabricación de Postes delineadores', 'UND', null, '#94A3B8'),
  ('COV-OTR-008', 'COV-OTR-008', 178, 'Otros', 'Subsanación de fotos de PCI', 'HH', null, '#94A3B8'),
  ('COV-OTR-009', 'COV-OTR-009', 179, 'Otros', 'Otros', 'GLB', null, '#94A3B8')
)
insert into public.activities_catalog
  (service_id, code, codigo_original, numero_covinca, category, name, unit_id, carpeta_ns, color,
   requires_photo, min_photos, is_active)
select s.id, p.code, p.codigo_original, p.numero, p.componente, p.nombre,
       (select u.id from public.units u where u.code = p.unidad limit 1),
       p.carpeta, p.color, true, 2, true
from partidas p cross join servicio s
on conflict (service_id, code) do update set
  codigo_original = excluded.codigo_original,
  numero_covinca  = excluded.numero_covinca,
  category        = excluded.category,
  name            = excluded.name,
  unit_id         = excluded.unit_id,
  carpeta_ns      = excluded.carpeta_ns,
  color           = excluded.color,
  is_active       = true,
  deleted_at      = null,
  updated_at      = now();

-- Las de demostración dejan de ofrecerse
update public.activities_catalog
   set is_active = false, updated_at = now()
 where service_id = '22222222-2222-4222-8222-222222222221'
   and code like 'MR-%'
   and is_active;

-- ─── Los sectores de nivel de servicio ────────────────────────────────
create table if not exists public.service_sectors (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  section_id  uuid not null references public.road_sections(id) on delete cascade,
  code        text not null,               -- 1.1, 1.2 … 4.2, OA
  folder      text not null,               -- nombre exacto de la carpeta COVINCA
  prog_start_m numeric not null,
  prog_end_m   numeric not null,
  orden       smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint service_sectors_rango check (prog_end_m > prog_start_m),
  constraint service_sectors_unico unique (service_id, code)
);

comment on table public.service_sectors is
  'Sectores de NIVELES_DE_SERVICIO: cada subtramo partido en tramos de ~25 km, con el nombre exacto de su carpeta en la estructura aprobada por COVINCA.';

alter table public.service_sectors enable row level security;
drop policy if exists service_sectors_select on public.service_sectors;
create policy service_sectors_select on public.service_sectors for select to authenticated
  using (service_id in (select public.mis_servicios()) or public.is_platform_admin());
drop policy if exists service_sectors_write on public.service_sectors;
create policy service_sectors_write on public.service_sectors for all to authenticated
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));

-- La segunda carpeta del subtramo 4 viene como «SECTOR_4.1» en la estructura
-- aprobada aunque cubre 1314+300 a 1335+600: se guarda con el código 4.2 y el
-- nombre de carpeta tal como lo aprobó COVINCA, hasta que Elvis confirme.
with servicio as (
  select id from public.services where id = '22222222-2222-4222-8222-222222222221'
),
sectores (tramo, code, folder, ini, fin, orden) as (
  values
  ('AQP-01', '1.1', 'SECTOR_1.1_852+335_877+000', 852335, 877000, 1),
  ('AQP-01', '1.2', 'SECTOR_1.2_877+000_902+000', 877000, 902000, 2),
  ('AQP-01', '1.3', 'SECTOR_1.3_902+000_927+000', 902000, 927000, 3),
  ('AQP-01', '1.4', 'SECTOR_1.4_927+000_952+000', 927000, 952000, 4),
  ('AQP-01', '1.5', 'SECTOR_1.5_952+000_973+884', 952000, 973884, 5),
  ('AQP-02', '2.1', 'SECTOR_2.1_988+529_1015+000', 988529, 1015000, 6),
  ('AQP-02', '2.2', 'SECTOR_2.2_1015+000_1041+500', 1015000, 1041500, 7),
  ('AQP-02', '2.3', 'SECTOR_2.3_1041+500_1068+000', 1041500, 1068000, 8),
  ('AQP-02', '2.4', 'SECTOR_2.4_1068+000_1094+500', 1068000, 1094500, 9),
  ('AQP-02', '2.5', 'SECTOR_2.5_1094+500_1121+000', 1094500, 1121000, 10),
  ('AQP-02', '2.6', 'SECTOR_2.6_1121+000_1146+763', 1121000, 1146763, 11),
  ('TAC-01', '3.1', 'SECTOR_3.1_1184+683_1212+000', 1184683, 1212000, 12),
  ('TAC-01', '3.2', 'SECTOR_3.2_1212+000_1238+000', 1212000, 1238000, 13),
  ('TAC-01', '3.3', 'SECTOR_3.3_1238+000_1264+000', 1238000, 1264000, 14),
  ('TAC-01', '3.4', 'SECTOR_3.4_1264+000_1297+993', 1264000, 1297993, 15),
  ('TAC-02', '4.1', 'SECTOR_4.1_1300+080_1314+300', 1300080, 1314300, 16),
  ('TAC-02', '4.2', 'SECTOR_4.1_1314+300_1335+600', 1314300, 1335600, 17),
  ('VA-01', 'OA', 'SECTOR_OBRA_ADICIONAL_LA_OREJA_0+000_1+380', 0, 1380, 18)
)
insert into public.service_sectors (service_id, section_id, code, folder, prog_start_m, prog_end_m, orden)
select s.id, t.id, x.code, x.folder, x.ini, x.fin, x.orden
from sectores x
cross join servicio s
join public.road_sections t on t.service_id = s.id and t.code = x.tramo and t.deleted_at is null
on conflict (service_id, code) do update set
  section_id = excluded.section_id, folder = excluded.folder,
  prog_start_m = excluded.prog_start_m, prog_end_m = excluded.prog_end_m, orden = excluded.orden;

-- El sector de una progresiva en un tramo: [inicio, fin), con el último
-- sector del tramo cerrado por arriba.
create or replace function public.sector_de(p_section_id uuid, p_prog_m numeric)
returns public.service_sectors
language sql stable set search_path to 'public' as $$
  select s.* from public.service_sectors s
  where s.section_id = p_section_id
    and p_prog_m >= s.prog_start_m
    and (p_prog_m < s.prog_end_m
         or (p_prog_m = s.prog_end_m and s.prog_end_m = (
               select max(z.prog_end_m) from public.service_sectors z where z.section_id = p_section_id)))
  order by s.orden
  limit 1
$$;

grant execute on function public.sector_de(uuid, numeric) to authenticated;
