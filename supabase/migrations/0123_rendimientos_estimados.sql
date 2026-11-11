-- ═══════════════════════════════════════════════════════════════════════
-- 0123 · Rendimientos estimados para las pruebas (respuesta 2 de Elvis)
--
-- «Nosotros en Configuración cargaremos esos datos, pero que el aplicativo
-- pueda empezar con un dato estimado para pruebas.» Son valores de
-- referencia por unidad de la partida, para las actividades más comunes del
-- mantenimiento rutinario. Cada uno lleva la nota «Estimado para pruebas»:
-- SERVICON los reemplaza en Configuración → Rendimientos. No pisa ninguno
-- que ya exista.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.rendimientos (service_id, activity_id, supply_id, cantidad, nota)
select distinct on (a.id, s.id)
       a.service_id, a.id, s.id, v.cantidad,
       'Estimado para pruebas: reemplazar por el rendimiento real'
  from (values
    -- Demarcación (por m²)
    ('COV-SH-001', 'PIN-023', 0.10), ('COV-SH-001', 'PIN-030', 0.01),
    ('COV-SH-002', 'PIN-023', 0.10), ('COV-SH-002', 'PIN-030', 0.01),
    ('COV-SH-003', 'PIN-022', 0.10), ('COV-SH-003', 'SEN-012', 0.25), ('COV-SH-003', 'PIN-030', 0.01),
    ('COV-SH-004', 'PIN-021', 0.10), ('COV-SH-004', 'SEN-012', 0.25), ('COV-SH-004', 'PIN-030', 0.01),
    ('COV-SH-005', 'PIN-022', 0.10), ('COV-SH-005', 'SEN-012', 0.25), ('COV-SH-005', 'PIN-030', 0.01),
    ('COV-SH-006', 'PIN-021', 0.10), ('COV-SH-006', 'SEN-012', 0.25), ('COV-SH-006', 'PIN-030', 0.01),
    ('COV-SH-007', 'LIM-002', 0.02), ('COV-SH-007', 'X001', 2),
    ('COV-SH-008', 'LIM-002', 0.02), ('COV-SH-008', 'X001', 2),
    ('COV-SH-009', 'LIM-002', 0.02), ('COV-SH-009', 'X001', 2),
    ('COV-SH-010', 'LIM-002', 0.02), ('COV-SH-010', 'X001', 2),
    -- Tachas y tachones (por unidad)
    ('COV-SH-011', 'SEN-021', 1), ('COV-SH-011', 'ADH-001', 0.01), ('COV-SH-011', 'ADH-002', 0.01),
    ('COV-SH-012', 'SEN-024', 1), ('COV-SH-012', 'ADH-001', 0.03), ('COV-SH-012', 'ADH-002', 0.03),
    -- Calzada y berma (por m², sello por m)
    ('COV-SR-006', 'ASF-003', 0.30), ('COV-BER-005', 'ASF-003', 0.30),
    ('COV-SR-007', 'ASF-003', 0.06), ('COV-BER-006', 'ASF-003', 0.06),
    ('COV-SR-008', 'PAV_06', 0.05), ('COV-SR-008', 'ASF-003', 0.06),
    ('COV-SR-009', 'ASF-004', 0.50), ('COV-SR-009', 'AGR004', 0.04), ('COV-SR-009', 'PVA_005', 0.02),
    ('COV-BER-007', 'ASF-004', 0.50), ('COV-BER-007', 'AGR004', 0.04), ('COV-BER-007', 'PVA_005', 0.02),
    ('COV-SR-010', 'PAV_06', 0.10), ('COV-SR-010', 'AGR001', 0.15), ('COV-SR-010', 'ASF-003', 0.36),
    ('COV-BER-008', 'AGR001', 0.15), ('COV-BER-008', 'ASF-004', 0.80), ('COV-BER-008', 'AGR004', 0.06), ('COV-BER-008', 'PVA_005', 0.03),
    ('COV-SR-011', 'ASF-005', 0.35), ('COV-SR-011', 'AGR-001', 0.006), ('COV-SR-011', 'AGR-003', 0.002), ('COV-SR-011', 'X001', 1),
    ('COV-BER-010', 'ASF-005', 0.35), ('COV-BER-010', 'AGR-001', 0.006), ('COV-BER-010', 'AGR-003', 0.002), ('COV-BER-010', 'X001', 1),
    ('COV-BER-013', 'ASF-005', 0.35), ('COV-BER-013', 'AGR-001', 0.006), ('COV-BER-013', 'AGR-003', 0.002), ('COV-BER-013', 'X001', 1),
    ('COV-SR-013', 'ASF-004', 0.03), ('COV-SR-013', 'AGR-002', 0.0005),
    ('COV-BER-011', 'ASF-004', 0.03), ('COV-BER-011', 'AGR-002', 0.0005),
    -- Señales verticales e hitos (por unidad, relaminado por m²)
    ('COV-SV-001', 'LIM-002', 0.05), ('COV-SV-001', 'X001', 4),
    ('COV-SV-002', 'SEN-014', 1), ('COV-SV-002', 'FER-011', 2), ('COV-SV-002', 'FER-017', 2), ('COV-SV-002', 'FER-003', 2),
    ('COV-SV-003', 'SEN-005', 1.10), ('COV-SV-003', 'SEN-011', 0.30),
    ('COV-SV-004', 'LIM-002', 0.05), ('COV-SV-004', 'X001', 4),
    ('COV-SV-005', 'SEN-015', 1), ('COV-SV-005', 'FER-011', 2), ('COV-SV-005', 'FER-017', 2), ('COV-SV-005', 'FER-003', 2),
    ('COV-SV-006', 'SEN-006', 1.10), ('COV-SV-006', 'SEN-007', 0.30), ('COV-SV-006', 'SEN-011', 0.20),
    ('COV-SV-009', 'FER-011', 1), ('COV-SV-009', 'FER-017', 1), ('COV-SV-009', 'FER-003', 1),
    ('COV-SV-010', 'SEN-020', 1), ('COV-SV-010', 'AGR-003', 0.5), ('COV-SV-010', 'AGRO29', 0.03), ('COV-SV-010', 'AGR017', 0.05), ('COV-SV-010', 'X001', 20),
    ('COV-SV-011', 'PIN-012', 0.05), ('COV-SV-011', 'PIN-030', 0.01),
    ('COV-SV-014', 'LIM-002', 0.15), ('COV-SV-014', 'X001', 10),
    ('COV-SV-015', 'SEN-013', 1), ('COV-SV-015', 'FER-011', 6), ('COV-SV-015', 'FER-017', 6), ('COV-SV-015', 'FER-003', 6),
    ('COV-SV-029', 'LIM-002', 0.03), ('COV-SV-029', 'X001', 3),
    ('COV-SV-030', 'SEN-018', 1), ('COV-SV-030', 'AGR-003', 0.5), ('COV-SV-030', 'AGRO29', 0.03), ('COV-SV-030', 'AGR017', 0.05), ('COV-SV-030', 'X001', 20),
    ('COV-SV-031', 'PIN-012', 0.10), ('COV-SV-031', 'PIN-016', 0.02), ('COV-SV-031', 'PIN-030', 0.02),
    -- Guardavías (por unidad o juego; limpieza por m)
    ('COV-GV-001', 'LIM-002', 0.01), ('COV-GV-001', 'X001', 1),
    ('COV-GV-002', 'SEG-010', 1), ('COV-GV-002', 'FER-010', 8), ('COV-GV-002', 'FER-015', 8), ('COV-GV-002', 'FER-002', 8),
    ('COV-GV-003', 'SEG-005', 1), ('COV-GV-003', 'FER-006', 1),
    ('COV-GV-004', 'FER-010', 1), ('COV-GV-004', 'FER-015', 1), ('COV-GV-004', 'FER-002', 1),
    -- Captafaros y delineadores (por unidad)
    ('COV-CF-001', 'LIM-002', 0.005), ('COV-CF-001', 'X001', 0.5),
    ('COV-CF-002', 'SEN-001', 1), ('COV-CF-002', 'FER-008', 1), ('COV-CF-002', 'FER-014', 1), ('COV-CF-002', 'FER-001', 1),
    ('COV-CF-003', 'FER-008', 1), ('COV-CF-003', 'FER-014', 1), ('COV-CF-003', 'FER-001', 1),
    ('COV-DL-001', 'LIM-002', 0.01), ('COV-DL-001', 'X001', 1),
    ('COV-DL-002', 'SEN-004', 1), ('COV-DL-002', 'AGR-003', 0.3), ('COV-DL-002', 'X001', 10),
    ('COV-DL-004', 'PIN-012', 0.03), ('COV-DL-004', 'PIN-016', 0.01),
    -- Limpieza (bolsas de 220 L)
    ('COV-DV-001', 'LIM-001', 0.02), ('COV-DV-007', 'LIM-001', 5), ('COV-DV-008', 'LIM-001', 5),
    ('COV-SR-001', 'LIM-001', 0.002), ('COV-BER-001', 'LIM-001', 0.002),
    ('COV-OD-001', 'LIM-001', 0.05), ('COV-OD-002', 'LIM-001', 0.03),
    -- Obras de arte (pintado por m², resane de fisuras por m)
    ('COV-OD-003', 'PIN-012', 0.06), ('COV-OD-003', 'PIN-030', 0.01),
    ('COV-OD-006', 'PIN-012', 0.06), ('COV-OD-006', 'PIN-030', 0.01),
    ('COV-MUR-002', 'PIN-012', 0.06), ('COV-MUR-002', 'PIN-030', 0.01),
    ('COV-OD-007', 'AGR-003', 0.02), ('COV-OD-007', 'AGR015', 0.001),
    ('COV-OD-008', 'AGR-003', 0.10), ('COV-OD-008', 'AGR015', 0.01), ('COV-OD-008', 'X001', 5)
  ) as v(actividad, material, cantidad)
  join public.activities_catalog a on a.code = v.actividad and a.deleted_at is null
  join public.supplies s on s.code = v.material and s.deleted_at is null and s.service_id = a.service_id
 order by a.id, s.id
on conflict (activity_id, supply_id) do nothing;
