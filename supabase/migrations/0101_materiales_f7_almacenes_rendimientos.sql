-- ═══════════════════════════════════════════════════════════════════════
-- 0101 · Materiales: el maestro del F7, las unidades, los almacenes, los
-- rendimientos y el flujo del pedido (Elvis, P12, P13, P16, P38 y P39)
--
-- · P39: se carga la LISTA_MATERIALES del F7 (todos sus materiales están
--   visibles: ninguno oculto ni en amarillo en los F7 recibidos). Los del
--   maestro que ya existían se enlazan con su código COVINCA por nombre.
--   Un material que no esté se sigue pudiendo escribir en el pedido.
-- · P13: emulsión en galones, bolsas por unidad, pernos por pieza, tachas
--   por unidad, detergente en kg y agua en litros.
-- · P38: almacenes principales (peajes de COVINCA): Camaná, El Fiscal,
--   Montalvo (Moquegua no tiene) y Tomasiri; y el almacén base de cada
--   cuadrilla, de stock limitado.
-- · P12: los rendimientos (material por unidad de partida), editables en la
--   configuración; si faltan, al programar se escribe a mano.
-- · P16: el pedido lo aprueba el ing. residente y después el visor COVINCA,
--   que puede observarlo para que se corrija y se reenvíe.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── P39 · El maestro del F7 ─────────────────────────────────────────
alter table public.supplies add column if not exists codigo_covinca text;
comment on column public.supplies.codigo_covinca is 'Código del material en la LISTA_MATERIALES del F7 de COVINCA';

insert into public.units (code, name, symbol) values ('CAJ', 'Caja', 'caja'), ('LB', 'Libra', 'lb')
on conflict do nothing;

do $$
declare
  v_servicio uuid := '22222222-2222-4222-8222-222222222221';
begin
  if not exists (select 1 from public.services where id = v_servicio) then return; end if;
  update public.supplies s set codigo_covinca = m.f7, updated_at = now()
    from (values
      ('ADH-001', 'SHEP_001'),
      ('ADH-002', 'SHEP_002'),
      ('ADH-003', 'INV_037'),
      ('ADH-004', 'INV_045'),
      ('ADH-005', 'INV_047'),
      ('ADH-006', 'INV_040'),
      ('AGR-001', 'AGR020'),
      ('AGR-002', 'AGR027'),
      ('AGR-003', 'INV_002'),
      ('AGR-004', 'INV_003'),
      ('ASF-001', 'PVD_001'),
      ('ASF-002', 'PVE_002'),
      ('ASF-003', 'PVE_003'),
      ('ASF-004', 'PVE_004'),
      ('ASF-005', 'PVE_005'),
      ('FER-001', 'ENSAC_001'),
      ('FER-002', 'ENSAG_001'),
      ('FER-003', 'SVEA_001'),
      ('FER-004', 'X019'),
      ('FER-005', 'ENSPB_003'),
      ('FER-006', 'ENSPB_001'),
      ('FER-007', 'ENSPB_002'),
      ('FER-008', 'ENSPC_001'),
      ('FER-009', 'ENDAP_001'),
      ('FER-010', 'ENSPG_001'),
      ('FER-011', 'SVEP_001'),
      ('FER-012', 'EQC_040'),
      ('FER-013', 'X017'),
      ('FER-014', 'ENSTC_001'),
      ('FER-015', 'ENSTG_001'),
      ('FER-016', 'X018'),
      ('FER-017', 'SVET_001'),
      ('LIM-001', 'INV_020'),
      ('LIM-002', 'INV_041'),
      ('LIM-003', 'INV_004'),
      ('LIM-004', 'X024'),
      ('PIN-001', 'INPA_002'),
      ('PIN-002', 'INV_006'),
      ('PIN-003', 'INPX_007'),
      ('PIN-004', 'INPX_003'),
      ('PIN-005', 'INPX_008'),
      ('PIN-006', 'INPX_004'),
      ('PIN-007', 'INPA_001'),
      ('PIN-008', 'INPE_002'),
      ('PIN-009', 'INPE_007'),
      ('PIN-010', 'CVLM_741'),
      ('PIN-011', 'INPE_008'),
      ('PIN-012', 'INPE_001'),
      ('PIN-013', 'INPE_004'),
      ('PIN-014', 'CVLM_742'),
      ('PIN-015', 'INPE_005'),
      ('PIN-016', 'INPE_003'),
      ('PIN-017', 'INPE_006'),
      ('PIN-018', 'INPX_009'),
      ('PIN-019', 'INPX_006'),
      ('PIN-020', 'INPX_011'),
      ('PIN-021', 'SHMP_002'),
      ('PIN-022', 'SHMP_001'),
      ('PIN-023', 'SHMP_003'),
      ('PIN-024', 'INV_033'),
      ('PIN-025', 'INV_017'),
      ('PIN-026', 'INV_015'),
      ('PIN-027', 'INV_016'),
      ('PIN-028', 'INV_024'),
      ('PIN-029', 'INV_025'),
      ('PIN-030', 'INV_001'),
      ('SEG-001', 'ENCV_002'),
      ('SEG-002', 'ENDB_001'),
      ('SEG-003', 'ENDB_002'),
      ('SEG-004', 'ENCP_002'),
      ('SEG-005', 'ENCP_001'),
      ('SEG-006', 'X023'),
      ('SEG-007', 'ENCT_003'),
      ('SEG-008', 'ENCT_001'),
      ('SEG-009', 'ENCT_002'),
      ('SEG-010', 'ENCV_001'),
      ('SEN-001', 'ENCC_002'),
      ('SEN-002', 'ENCC_001'),
      ('SEN-003', 'ENDA_001'),
      ('SEN-004', 'ENDP_001'),
      ('SEN-005', 'CONS_001'),
      ('SEN-006', 'CONS_005'),
      ('SEN-007', 'CONS_006'),
      ('SEN-008', 'ENSD_001'),
      ('SEN-009', 'ENSC_001'),
      ('SEN-010', 'ENSC_002'),
      ('SEN-011', 'CONS_007'),
      ('SEN-012', 'SHMM_001'),
      ('SEN-016', 'X016'),
      ('SEN-017', 'SVSC_001'),
      ('SEN-018', 'SVSK_001'),
      ('SEN-019', 'SVSC_003'),
      ('SEN-020', 'SVSC_002'),
      ('SEN-021', 'SHET_001'),
      ('SEN-022', 'SHET_003'),
      ('SEN-023', 'SHET_002'),
      ('SEN-024', 'SHET_001_1')
    ) as m(codigo, f7)
   where s.service_id = v_servicio and s.code = m.codigo and s.deleted_at is null;
  
  insert into public.supplies (service_id, code, codigo_covinca, name, unit_id, notes, is_active)
  select v_servicio, m.codigo, m.codigo, m.nombre, u.id, 'F7 · LISTA_MATERIALES', true
    from (values
      ('CVLM_590', 'ALAMBRE RECOCIDO # 16', 'KG'),
      ('AGRO29', 'ARENA GRUESA', 'M3'),
      ('AGR015', 'ARENA NATURAL', 'M3'),
      ('PVA_005', 'ARENA PARA ASFALTO', 'M3'),
      ('AGR016', 'ARENA TRITURADA', 'M3'),
      ('AGR002', 'ARENA TRITURADA 1/4"', 'M3'),
      ('PVA_002', 'ASFALTEC DML', 'KG'),
      ('PVA_003', 'ASFALTEC J&E', 'KG'),
      ('PVA_001', 'ASFALTEC TDM', 'KG'),
      ('AGR001', 'BASE GRANULAR', 'M3'),
      ('CVLM_381', 'CAL', 'KG'),
      ('SHEP_004', 'ENDURECEDOR EPÓXICO BONN - (1 GALON)', 'GAL'),
      ('SHEP_003', 'ENDURECEDOR EPÓXICO BONN - (1/4 GALÓN)', 'UND'),
      ('INPX_002', 'ENDURECEDOR EPOXICO UNIVERSAL - (1/4 GALON)', 'UND'),
      ('AGR013', 'GRAVA', 'M3'),
      ('AGR030', 'HORMIGON', 'M3'),
      ('PVA_004', 'MATERIAL BASE', 'M3'),
      ('PAV_06', 'MEZCLA ASFALTICA EN CALIENTE', 'M3'),
      ('AGR014', 'OVER GRANULAR', 'M3'),
      ('SHEP_005', 'PEGAMENTO BITUMINOSO PARA TACHAS X 25 KG', 'CAJ'),
      ('AGR006', 'PIEDRA 17.5 (1)', 'M3'),
      ('AGR008', 'PIEDRA 17.5 (2)', 'M3'),
      ('AGR009', 'PIEDRA 17.5 (3)', 'M3'),
      ('AGR012', 'PIEDRA 17.5 (4)', 'M3'),
      ('AGR010', 'PIEDRA 17.5 CON 15% CHATAS', 'M3'),
      ('AGR023', 'PIEDRA 3/4"', 'M3'),
      ('AGR004', 'PIEDRA CHANCADA 1/2"', 'M3'),
      ('AGR031', 'PIEDRA CHANCADA 1/4"', 'M3'),
      ('AGR017', 'PIEDRA CHANCADA DE 3/4"', 'M3'),
      ('AGR026', 'PIEDRA DE 1/2 (2)', 'M3'),
      ('AGR022', 'PIEDRA DE 1/2"', 'M3'),
      ('AGR018', 'PIEDRA DE 3/8', 'M3'),
      ('INPX_001', 'PINTURA EPOXICA AMARILLA RAL 1023 - (3/4 GALON)', 'UND'),
      ('INPX_010', 'PINTURA EPOXICA DE ALTOS SOLIDOS', 'GAL'),
      ('INPX_005', 'REDUCTOR EPOXICO (1/4 GAL)', 'UND'),
      ('INV_007', 'REMOVEDOR DE OXIDO', 'UND'),
      ('INV_009', 'SACOS TEJIDOS BLANCOS 55 CM x 90 CM', 'UND'),
      ('PVS_002', 'SELLANTE ELASTOMERICO CRAFCO', 'KG'),
      ('PVS_008', 'SELLANTE ELASTOMERICO CRAFCO POLYFLEX 601', 'LB'),
      ('PVS_003', 'SELLANTE ELASTOMERICO PAVCOL', 'KG'),
      ('PVS_001', 'SELLANTE ELASTOMERICO TDM', 'KG'),
      ('SVPI_171', 'SEÑAL INFORMATIVA 2.50 x 0.75 ("PROHIBIDO ECHAR BASURA EN CUERPOS DE AGUA")', 'UND'),
      ('SVPI_169', 'SEÑAL INFORMATIVA 0.45 x 0.45 (I-5)', 'UND'),
      ('SVPI_117', 'SEÑAL INFORMATIVA 2.05 x 0.78( VIA FERREA CRUCE A 300 M)', 'UND'),
      ('SVPI_121', 'SEÑAL INFORMATIVA 2.1026 x 0.60 (TUNEL A 200 M)', 'UND'),
      ('SVPI_183', 'SEÑAL INFORMATIVA 2.45 x 0.81 "MANEJE CON CUIDADO CRUCE DE ANIMALES"', 'UND'),
      ('SVPI_170', 'SEÑAL INFORMATIVA 2.50 x 0.60 ("SHINTARI")', 'UND'),
      ('SVPI_090', 'SEÑAL INFORMATIVA (PEAJE A 600 MTS)', 'UND'),
      ('SVPI_128', 'SEÑAL INFORMATIVA 0.43 x 0.50 (I-2)', 'UND'),
      ('SVPI_123', 'SEÑAL INFORMATIVA 0.43X0.50 (I-1B)', 'UND'),
      ('SVPI_112', 'SEÑAL INFORMATIVA 0.45x0.60 (PARADA DE EMERGENCIA)', 'UND'),
      ('SVPI_184', 'SEÑAL INFORMATIVA 0.45X0.60 (I-19)', 'UND'),
      ('SVPI_133', 'SEÑAL INFORMATIVA 0.60 X 0.80 (“PEAJE TOMASIRI")', 'UND'),
      ('SVPI_122', 'SEÑAL INFORMATIVA 0.60X0.90 (AUTOMOVILES Y MOTOS)', 'UND'),
      ('SVPI_191', 'SEÑAL INFORMATIVA 0.60X0.90 (T-23)', 'UND'),
      ('SVPI_017', 'SEÑAL INFORMATIVA 0.60x1.50 (APLAO)', 'UND'),
      ('SVPI_034', 'SEÑAL INFORMATIVA 0.60x1.50 (BARRIO NUEVO)', 'UND'),
      ('SVPI_022', 'SEÑAL INFORMATIVA 0.60x2.03 (COCACHACRA)', 'UND'),
      ('SVPI_008', 'SEÑAL INFORMATIVA 0.60x2.10 (ILO)', 'UND'),
      ('SVPI_045', 'SEÑAL INFORMATIVA 0.60x2.20 (SANTA RITA)', 'UND'),
      ('SVPI_049', 'SEÑAL INFORMATIVA 0.60x2.30 (AVIS SAN PABLO)', 'UND'),
      ('SVPI_032', 'SEÑAL INFORMATIVA 0.60x2.40 (BOCA DEL RÍO)', 'UND'),
      ('SVPI_041', 'SEÑAL INFORMATIVA 0.60x2.80 (YARAS 6KM)', 'UND'),
      ('SVPI_192', 'SEÑAL INFORMATIVA 0.65X0.75 (I-20)', 'UND'),
      ('SVPI_019', 'SEÑAL INFORMATIVA 0.70x1.70 (TACNA)', 'UND'),
      ('SVPI_161', 'SEÑAL INFORMATIVA 0.75 X 0.65 (I-6)', 'UND'),
      ('SVPI_164', 'SEÑAL INFORMATIVA 0.80 X 0.80 (I-17)', 'UND'),
      ('SVPI_093', 'SEÑAL INFORMATIVA 0.80X0.80 (PARADA DE EMERGENCIA )', 'UND'),
      ('SVPI_175', 'SEÑAL INFORMATIVA 0.80X0.80 (I-11)', 'UND'),
      ('SVPI_047', 'SEÑAL INFORMATIVA 0.80x1.20 (LA JOYA - AZUL)', 'UND'),
      ('SVPI_033', 'SEÑAL INFORMATIVA 0.80x1.20 (SALIDA DE VEHICULOS PESADOS)', 'UND'),
      ('SVPI_038', 'SEÑAL INFORMATIVA 0.83x0.44 (BODEGA DEL ABUELO)', 'UND'),
      ('SVPI_021', 'SEÑAL INFORMATIVA 0.84x2.50 (LAS YARAS - TACNA)', 'UND'),
      ('SVPI_053', 'SEÑAL INFORMATIVA 0.90x0.60 (MOTOS Y BICICLETAS)', 'UND'),
      ('SVPI_193', 'SEÑAL INFORMATIVA 0.90X0.60 (TRANSITO PARTICULARES/COLECTIVOS)', 'UND'),
      ('SVPI_154', 'SEÑAL INFORMATIVA 1.00 X 1.00 (I-17)', 'UND'),
      ('SVPI_173', 'SEÑAL INFORMATIVA 1.00X1.00 (I-11)', 'UND'),
      ('SVPI_145', 'SEÑAL INFORMATIVA 1.00X1.00 (I-24)', 'UND'),
      ('SVPI_176', 'SEÑAL INFORMATIVA 1.00X1.00 (I-9)', 'UND'),
      ('SVPI_044', 'SEÑAL INFORMATIVA 1.00x1.50 (PAN SUR - ASENTAMIENTO 01 - 02)', 'UND'),
      ('SVPI_158', 'SEÑAL INFORMATIVA 1.00x1.50 (VITOR A 500 M)', 'UND'),
      ('SVPI_062', 'SEÑAL INFORMATIVA 1.00x1.80 (CUIDADO ZONA DE NEBLINA)', 'UND'),
      ('SVPI_050', 'SEÑAL INFORMATIVA 1.00x1.80 (DESPACIO CRUCE VEHICULAR)', 'UND'),
      ('SVPI_051', 'SEÑAL INFORMATIVA 1.00x1.80 (DESPACIO CURVAS PELIGROSAS)', 'UND'),
      ('SVPI_039', 'SEÑAL INFORMATIVA 1.00x1.80 (DISTANCIAS SUBTRAMO 01)', 'UND'),
      ('SVPI_014', 'SEÑAL INFORMATIVA 1.00x1.80 (SALIDA DE VEHÍCULOS A 300M)', 'UND'),
      ('SVPI_013', 'SEÑAL INFORMATIVA 1.00x2.00 (ESTACIÓN LA JOYA)', 'UND'),
      ('SVPI_082', 'SEÑAL INFORMATIVA 1.00x2.00 (USE CINTURÓN DE SEGURIDAD)', 'UND'),
      ('SVPI_086', 'SEÑAL INFORMATIVA 1.00x2.00 (VIA FERREA)', 'UND'),
      ('SVPI_190', 'SEÑAL INFORMATIVA 1.00x2.20 (ARICAS LOS PALOS)', 'UND'),
      ('SVPI_023', 'SEÑAL INFORMATIVA 1.00x2.20 (PUENTE SANTA ROSA)', 'UND'),
      ('SVPI_087', 'SEÑAL INFORMATIVA 1.00x2.20 (VIA FERREA - CRUCE A 500 M)', 'UND'),
      ('SVPI_065', 'SEÑAL INFORMATIVA 1.00x2.40 (OBEDEZCA LA SEÑALIZACIÓN)', 'UND'),
      ('SVPI_031', 'SEÑAL INFORMATIVA 1.00x2.60 (TACNA - LOCUMBA)', 'UND'),
      ('SVPI_046', 'SEÑAL INFORMATIVA 1.00x2.85 (SAMA GRANDE - TACNA)', 'UND'),
      ('SVPI_027', 'SEÑAL INFORMATIVA 1.00x3.00 (EL FISCAL - AREQUIPA)', 'UND'),
      ('SVPI_063', 'SEÑAL INFORMATIVA 1.00x3.00 (EN CASO DUDA NO ADELANTE)', 'UND'),
      ('SVPI_009', 'SEÑAL INFORMATIVA 1.00x3.00 (FRONTERA CON CHILE)', 'UND'),
      ('SVPI_024', 'SEÑAL INFORMATIVA 1.00x3.00 (PEAJE A XYZ METROS)', 'UND'),
      ('SVPI_069', 'SEÑAL INFORMATIVA 1.00x3.00 (RESPETE LA SEÑALIZACIÓN)', 'UND'),
      ('SVPI_010', 'SEÑAL INFORMATIVA 1.00x3.00 (TACNA - MOQUEGUA)', 'UND'),
      ('SVPI_028', 'SEÑAL INFORMATIVA 1.00x3.00 (TOQUEPALA)', 'UND'),
      ('SVPI_029', 'SEÑAL INFORMATIVA 1.00x3.30 (MOQUEGUA - TOQUEPALA)', 'UND'),
      ('SVPI_156', 'SEÑAL INFORMATIVA 1.10 X 2.20 (BAJE LAS LUCES AL PASAR LOS VEHICULOS)', 'UND'),
      ('SVPI_083', 'SEÑAL INFORMATIVA 1.10x1.30 (USE LUZ BAJA AL CRUZAR CON OTRO)', 'UND'),
      ('SVPI_081', 'SEÑAL INFORMATIVA 1.10x1.70 (USE CINTURÓN DE SEGURIDAD)', 'UND'),
      ('SVPI_052', 'SEÑAL INFORMATIVA 1.10x2.00 (EVITE ACCIDENTE CUIDE SEÑALIZACIÓN)', 'UND'),
      ('SVPI_055', 'SEÑAL INFORMATIVA 1.10x2.00 (NO ARROJE BASURA)', 'UND'),
      ('SVPI_084', 'SEÑAL INFORMATIVA 1.18x1.43 (DESPACIO ZONA URBANA)', 'UND'),
      ('SVPI_132', 'SEÑAL INFORMATIVA 1.20 X 0.80 (“CUIDADO SALIDA DE VEHICULOS PESADOS A 300 M”)', 'UND'),
      ('SVPI_130', 'SEÑAL INFORMATIVA 1.20X0.80 (AUTOMOVILES Y MOTOS)', 'UND'),
      ('SVPI_131', 'SEÑAL INFORMATIVA 1.20X0.80 (ZONA DE NEBLINA)', 'UND'),
      ('SVPI_015', 'SEÑAL INFORMATIVA 1.20x0.80 (ZONA MILITAR A 500M)', 'UND'),
      ('SVPI_048', 'SEÑAL INFORMATIVA 1.20x1.00 (VEHICULOS PESADOS - LIGEROS)', 'UND'),
      ('SVPI_025', 'SEÑAL INFORMATIVA 1.20x1.50 (LIMITE DEPARTAMENTAL AQP-MOQUEGUA)', 'UND'),
      ('SVPI_059', 'SEÑAL INFORMATIVA 1.20x1.60 (ZONA DE NEBLINA)', 'UND'),
      ('SVPI_018', 'SEÑAL INFORMATIVA 1.20x1.80 (AREQUIPA - PEDREGAL)', 'UND'),
      ('SVPI_066', 'SEÑAL INFORMATIVA 1.20x1.80 (OBLIGATORIO USE CINTURÓN)', 'UND'),
      ('SVPI_088', 'SEÑAL INFORMATIVA 1.20x1.80 (ZONA CURVA PELIGROSA)', 'UND'),
      ('SVPI_085', 'SEÑAL INFORMATIVA 1.20x1.80 (ZONA URBANA - 35 KM/H)', 'UND'),
      ('SVPI_185', 'SEÑAL INFORMATIVA 1.20X1.80 (OVALO TARAPACA)', 'UND'),
      ('SVPI_037', 'SEÑAL INFORMATIVA 1.20x2.00 (SALIDA VEHICULOS PESADOS 100 M)', 'UND'),
      ('SVPI_143', 'SEÑAL INFORMATIVA 1.20x2.00 (SOAPEX)', 'UND'),
      ('SVPI_012', 'SEÑAL INFORMATIVA 1.20x2.20 (FUNDACION SAN CAMILO)', 'UND'),
      ('SVPI_067', 'SEÑAL INFORMATIVA 1.20x2.20 (PLAYA DE ESTACIONAMIENTO)', 'UND'),
      ('SVPI_026', 'SEÑAL INFORMATIVA 1.20x2.40 (LIMITE DEPARTAMENTAL AQP-MOQUEGUA)', 'UND'),
      ('SVPI_011', 'SEÑAL INFORMATIVA 1.20x2.40 (LIMITE DEPARTAMENTAL TACNA MOQUEGUA)', 'UND'),
      ('SVPI_074', 'SEÑAL INFORMATIVA 1.20x3.60 (SOLAMENTE PARE FUERA DE LA PISTA)', 'UND'),
      ('SVPI_076', 'SEÑAL INFORMATIVA 1.21x2.15 (SOLAMENTE PARE FUERA DE LA PISTA)', 'UND'),
      ('SVPI_020', 'SEÑAL INFORMATIVA 1.21x2.40 (PAN SUR - SAN JUAN EL ALTO)', 'UND'),
      ('SVPI_075', 'SEÑAL INFORMATIVA 1.25x2.40 (SOLAMENTE PARE FUERA DE LA PISTA)', 'UND'),
      ('SVPI_080', 'SEÑAL INFORMATIVA 1.26x2.40 (PTE TOMASIRI: CARGA 36TN - LUZ 30 M)', 'UND'),
      ('SVPI_140', 'SEÑAL INFORMATIVA 1.30x0.50 (TOMASIRI)', 'UND'),
      ('SVPI_105', 'SEÑAL INFORMATIVA 1.30x1.10 (USE LUZ BAJA AL CRUZAR CON OTRO VEHICULO )', 'UND'),
      ('SVPI_094', 'SEÑAL INFORMATIVA 1.30x2.10 (BIENVENIDOS A TACNA)', 'UND'),
      ('SVPI_189', 'SEÑAL INFORMATIVA 1.30x2.30 (CONFIE EN LA SEÑALIZACIÓN)', 'UND'),
      ('SVPI_058', 'SEÑAL INFORMATIVA 1.30x2.40 (ZONA DE NEBLINA)', 'UND'),
      ('SVPI_073', 'SEÑAL INFORMATIVA 1.30x2.50 (SOLAMENTE ADELANTE CON SEGURIDAD)', 'UND'),
      ('SVPI_057', 'SEÑAL INFORMATIVA 1.30x3.00 (DESPACIO ZONA NEBLINA)', 'UND'),
      ('SVPI_092', 'SEÑAL INFORMATIVA 1.3340x0.48 (LA JOYA)', 'UND'),
      ('SVPI_078', 'SEÑAL INFORMATIVA 1.35x1.50 (TARIFARIA DE PEAJE)', 'UND'),
      ('SVPI_188', 'SEÑAL INFORMATIVA 1.35x2.40 (SANTUARIO LOCUMBA)', 'UND'),
      ('SVPI_060', 'SEÑAL INFORMATIVA 1.40x2.50 (CUIDADO ZONA DE NEBLINA - CLEMESÍ)', 'UND'),
      ('SVPI_042', 'SEÑAL INFORMATIVA 1.40x2.60 (MOQ - COCACHACRA - MOLLENDO)', 'UND'),
      ('SVPI_061', 'SEÑAL INFORMATIVA 1.40x2.60 (PELIGRO ZONA DE NEBLINA)', 'UND'),
      ('SVPI_016', 'SEÑAL INFORMATIVA 1.49x1.41 (TORO MUERTO 50KM)', 'UND'),
      ('SVPI_120', 'SEÑAL INFORMATIVA 1.50x1(ZONA URBANA)', 'UND'),
      ('SVPI_110', 'SEÑAL INFORMATIVA 1.50X1.00 (TARIFARIO DE PEAJE)', 'UND'),
      ('SVPI_043', 'SEÑAL INFORMATIVA 1.50x2.40 (DISTANCIAS SUBTRAMO 02)', 'UND'),
      ('SVPI_064', 'SEÑAL INFORMATIVA 1.50x2.50 (OBEDEZCA LA SEÑALIZACIÓN)', 'UND'),
      ('SVPI_056', 'SEÑAL INFORMATIVA 1.50x2.50 (ZONA DE NEBLINA)', 'UND'),
      ('SVPI_079', 'SEÑAL INFORMATIVA 1.50x2.70 (TRANSITAR CON LUCES ENCENDIDAS)', 'UND'),
      ('SVPI_054', 'SEÑAL INFORMATIVA 1.50x3.00 (BUEN VIAJE MANEJE CON CUIDADO)', 'UND'),
      ('SVPI_070', 'SEÑAL INFORMATIVA 1.50x3.00 (CURVA PELIGROSA REDUCIR VELOCIDAD)', 'UND'),
      ('SVPI_108', 'SEÑAL INFORMATIVA 1.50x5.00 (AUTOS,BUSES)', 'UND'),
      ('SVPI_109', 'SEÑAL INFORMATIVA 1.50X5.00 (CAMIONES)', 'UND'),
      ('SVPI_136', 'SEÑAL INFORMATIVA 1.57x1.08 (DESPACIO CRUCE VEHICULAR)', 'UND'),
      ('SVPI_040', 'SEÑAL INFORMATIVA 1.57x1.31 (TORO MUERTO)', 'UND'),
      ('SVPI_111', 'SEÑAL INFORMATIVA 1.60X0.60 (TOMASIRI)', 'UND'),
      ('SVPI_147', 'SEÑAL INFORMATIVA 1.67x1.15 (CONDUZCA CON PRUDENCIA ZONA ACCIDENTADA)', 'UND'),
      ('SVPI_095', 'SEÑAL INFORMATIVA 1.69x1.08 (VIA DE TREN CRUCE A 300 m)', 'UND'),
      ('SVPI_151', 'SEÑAL INFORMATIVA 1.75 x 1.08 (USE CINTURON DE SEGURIDAD)', 'UND'),
      ('SVPI_107', 'SEÑAL INFORMATIVA 1.789 x13.60 (PELIGRO ZONA DE NEBLINA)', 'UND'),
      ('SVPI_160', 'SEÑAL INFORMATIVA 1.80 X 0.55 (ZONA MILITAR)', 'UND'),
      ('SVPI_163', 'SEÑAL INFORMATIVA 1.80 X 0.80 (TACNA - MOQUEGUA)', 'UND'),
      ('SVPI_129', 'SEÑAL INFORMATIVA 1.80 x 1.00 ("TACNA")', 'UND'),
      ('SVPI_152', 'SEÑAL INFORMATIVA 1.80 x 1.00 (PELIGRO CRUCE DE TREN A 200M)', 'UND'),
      ('SVPI_172', 'SEÑAL INFORMATIVA 1.80 x 1.10 (PUENTE VITOR)', 'UND'),
      ('SVPI_194', 'SEÑAL INFORMATIVA 1.80x1.00 (DESPACIO CRUCE DE PEATONES)', 'UND'),
      ('SVPI_104', 'SEÑAL INFORMATIVA 1.80x1.00 (DESVIO MOLLENDO , MOQUEGUA, TACNA, ILO, CONCORDIA)', 'UND'),
      ('SVPI_089', 'SEÑAL INFORMATIVA 1.80x2.81 (PROHIBIDO ARROJAR BASURA SOBRE EL SUELO)', 'UND'),
      ('SVPI_077', 'SEÑAL INFORMATIVA 1.86x2.56 (TARIFARIA DE PEAJE)', 'UND'),
      ('SVPI_165', 'SEÑAL INFORMATIVA 1.90 x 0.80 BIENVENIDOS ALTO CAMIARA', 'UND'),
      ('SVPI_146', 'SEÑAL INFORMATIVA 1.90x1.08 BAJO NEBLINA JAMAS ADELANTE', 'UND'),
      ('SVPI_181', 'SEÑAL INFORMATIVA 1.91X1.08 ( BAJO NEBLINA JAMAS ADELANTE)', 'UND'),
      ('SVPI_125', 'SEÑAL INFORMATIVA 1.935X0.90 (PROHIBIDO ESTACIONAR)', 'UND'),
      ('SVPI_101', 'SEÑAL INFORMATIVA 1.995x0.48 (SANTA RITA)', 'UND'),
      ('SVPI_119', 'SEÑAL INFORMATIVA 188.70x1.30 (MANEJE A LA DEFENSIVA)', 'UND'),
      ('SVPI_150', 'SEÑAL INFORMATIVA 2.00 x 1.50 (PROHIBIDO)', 'UND'),
      ('SVPI_137', 'SEÑAL INFORMATIVA 2.00x0.58 (SAN CAMILO)', 'UND'),
      ('SVPI_142', 'SEÑAL INFORMATIVA 2.00x1.13 (PEAJE A 500 M)', 'UND'),
      ('SVPI_127', 'SEÑAL INFORMATIVA 2.04 x 1.08 ("PELIGRO CRUCE DE TREN A 200 M")', 'UND'),
      ('SVPI_124', 'SEÑAL INFORMATIVA 2.08 x 1.27 (AREQUIPA,CHUCARAPI,MOLLENDO)', 'UND'),
      ('SVPI_179', 'SEÑAL INFORMATIVA 2.10 X 0.60 ( YARAS 6 KM)', 'UND'),
      ('SVPI_126', 'SEÑAL INFORMATIVA 2.1240X1.08 (DESPACIO ZONA DE CURVAS)', 'UND'),
      ('SVPI_180', 'SEÑAL INFORMATIVA 2.20 X 1.15 (PEAJE A 1000 MTS)', 'UND'),
      ('SVPI_115', 'SEÑAL INFORMATIVA 2.24X0.48 (BOCA DEL RIO)', 'UND'),
      ('SVPI_178', 'SEÑAL INFORMATIVA 2.30 X 1.20 (EVITE CAPTURAS PAGUE EL PEAJE)', 'UND'),
      ('SVPI_149', 'SEÑAL INFORMATIVA 2.30 x 1.30 (PROTEJA SU VIDA USE CINTURON DE SEGURIDAD)', 'UND'),
      ('SVPI_138', 'SEÑAL INFORMATIVA 2.30x1.25 (TACNA - LA YARADA - BOCA DEL RIO)', 'UND'),
      ('SVPI_103', 'SEÑAL INFORMATIVA 2.35x1.25 (PUENTE CAMIARA)', 'UND'),
      ('SVPI_166', 'SEÑAL INFORMATIVA 2.40 x 0.80 INCLAN CORUCA', 'UND'),
      ('SVPI_144', 'SEÑAL INFORMATIVA 2.40x0.80 (INCLAN 7 KM CORUCA 23KM)', 'UND'),
      ('SVPI_167', 'SEÑAL INFORMATIVA 2.42x1.03 (PUENTE MONTALVO LONGITUD 60MTS)', 'UND'),
      ('SVPI_141', 'SEÑAL INFORMATIVA 2.46x0.80 (MANEJE CON CUIDADO CRUCE DE ANIMALES)', 'UND'),
      ('SVPI_102', 'SEÑAL INFORMATIVA 2.509x0.78 (JUNTA VECINAL VELLA INCLAN)', 'UND'),
      ('SVPI_135', 'SEÑAL INFORMATIVA 2.50x1.50 (CUIDADO CURVA PELIGROSA)', 'UND'),
      ('SVPI_098', 'SEÑAL INFORMATIVA 2.50x1.50 (PEAJE A 1000M)', 'UND'),
      ('SVPI_168', 'SEÑAL INFORMATIVA 2.50x1.50 (VEHICULOS EXONERADOS)', 'UND'),
      ('SVPI_036', 'SEÑAL INFORMATIVA 2.50x3.50 (DISTANCIAS PEAJE FISCAL)', 'UND'),
      ('SVPI_155', 'SEÑAL INFORMATIVA 2.53 X 1.30 (DISMINUYA LA VELOCIDAD CRUCE PEATONAL A XXXM)', 'UND'),
      ('SVPI_116', 'SEÑAL INFORMATIVA 2.53X1.08 (NO ARROJE BASURA DEMUESTRE SU EDUCACIÒN)', 'UND'),
      ('SVPI_071', 'SEÑAL INFORMATIVA 2.56x1.08 (REDUCIR VELOCIDAD DOBLE CALZADA)', 'UND'),
      ('SVPI_072', 'SEÑAL INFORMATIVA 2.56x1.31 (REDUCIR VELOCIDAD PRECAUCION)', 'UND'),
      ('SVPI_091', 'SEÑAL INFORMATIVA 2.60x1.00 (PELIGRO ZONA DE PELIGRO)', 'UND'),
      ('SVPI_099', 'SEÑAL INFORMATIVA 2.70x1.35 (TACNA- ARICA)', 'UND'),
      ('SVPI_134', 'SEÑAL INFORMATIVA 2.78x1.63 (DESPACIO CURVA PELIGROSA)', 'UND'),
      ('SVPI_187', 'SEÑAL INFORMATIVA 2.79 x 1.38 (TACNA-DV. AREQUIPA-ICA-LIMA)', 'UND'),
      ('SVPI_186', 'SEÑAL INFORMATIVA 2.80x1.00 (MOQUEGUA 115 KM - YARAS)', 'UND'),
      ('SVPI_096', 'SEÑAL INFORMATIVA 2.91x0.48 (CONTROL OBLIGATORIO)', 'UND'),
      ('SPVI_118', 'SEÑAL INFORMATIVA 213.10 x 1.20 (ADELANTE SIEMPRE POR LA IZQUIERDA)', 'UND'),
      ('SVPI_177', 'SEÑAL INFORMATIVA 3.00x1.10 (LA CONCORDIA 32 KM LIMITE INTERNACIONAL)', 'UND'),
      ('SVPI_035', 'SEÑAL INFORMATIVA 3.00x3.50 (DISTANCIAS PEAJE FISCAL)', 'UND'),
      ('SVPI_159', 'SEÑAL INFORMATIVA 3.20 X 1.20 (CUIDADO ZONA DE CUERVAS PELIGROSAS)', 'UND'),
      ('SVPI_182', 'SEÑAL INFORMATIVA 3.20x0.95 ( "TACNA - MOQUEGUA")', 'UND'),
      ('SVPI_139', 'SEÑAL INFORMATIVA 3.30x1.00 (SOLAMENTE PARE FUERA DE LA PISTA)', 'UND'),
      ('SVPI_157', 'SEÑAL INFORMATIVA 3.40x0.95 (TACNA-ALTO LA ALIANZA)', 'UND'),
      ('SVPI_068', 'SEÑAL INFORMATIVA 3.50x2.35 (REGLAMENTO NACIONAL DE TRANSITO)', 'UND'),
      ('SVPI_100', 'SEÑAL INFORMATIVA 3.50x2.50 (DISTANCIAS)', 'UND'),
      ('SVPI_097', 'SEÑAL INFORMATIVA 3.52x1.49 (CURVA PELIGROSA DISMINUYA LA VELOCIDAD)', 'UND'),
      ('SVPI_106', 'SEÑAL INFORMATIVA 3.54x2.49 (CURVA PELIGROSA)', 'UND'),
      ('SVPI_153', 'SEÑAL INFORMATIVA 3.60 x 1.10 (DV. AREQUIPA CAMANA)', 'UND'),
      ('SVPI_174', 'SEÑAL INFORMATIVA 3.80x2.00 (RODOLUVIO DESINFECCION OBLIGATORIO)', 'UND'),
      ('SVPI_162', 'SEÑAL INFORMATIVA 4.00 X 2.00 (BALANZA SOLO CAMIONES)', 'UND'),
      ('SVPI_114', 'SEÑAL INFORMATIVA INDICADOR DE DISTANCIAS', 'UND'),
      ('SVPI_148', 'SEÑAL INFORMATIVA 1.00x1.00 (T-20)', 'UND'),
      ('SVPI_030', 'SEÑAL INFORMATIVA1.00x2.85 (CONTROL DE ADUANAS A 2000M)', 'UND'),
      ('SVPI_006', 'SEÑAL PREVENTIVA 0.20x0.45 (I-31)', 'UND'),
      ('SVPP_P-44 (5)', 'SEÑAL PREVENTIVA 0.25x1.47 (P-44)', 'UND'),
      ('SVPI_001', 'SEÑAL PREVENTIVA 0.43x0.50 (I-1B)', 'UND'),
      ('SVPI_004', 'SEÑAL PREVENTIVA 0.50x0.43 (I-2)', 'UND'),
      ('SVPP_P-DESP (1)', 'SEÑAL PREVENTIVA 0.60x0.60 (DESPACIO)', 'UND'),
      ('SVPP_P-33A (1)', 'SEÑAL PREVENTIVA 0.60x0.60 (P-33A)', 'UND'),
      ('SVPP_P-49 (1)', 'SEÑAL PREVENTIVA 0.60x0.60 (P-49)', 'UND'),
      ('SVPP_P-DESP (2)', 'SEÑAL PREVENTIVA 0.75x0.75 (DESPACIO)', 'UND'),
      ('SVPP_P-10A (2)', 'SEÑAL PREVENTIVA 0.75x0.75 (P-10A)', 'UND'),
      ('SVPP_P-11 (2)', 'SEÑAL PREVENTIVA 0.75x0.75 (P-11)', 'UND'),
      ('SVPP_P-2A (2)', 'SEÑAL PREVENTIVA 0.75x0.75 (P-2A)', 'UND'),
      ('SVPP_P-2B (2)', 'SEÑAL PREVENTIVA 0.75x0.75 (P-2B)', 'UND'),
      ('SVPP_P-35C (5)', 'SEÑAL PREVENTIVA 0.80 X 0.80 (P-35C)', 'UND'),
      ('SVPP_P-48(3)', 'SEÑAL PREVENTIVA 0.80 X 0.80 (P-48)', 'UND'),
      ('SVPI_005', 'SEÑAL PREVENTIVA 0.80x0.45 (I-31)', 'UND'),
      ('SVPP_P-10A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-10A)', 'UND'),
      ('SVPP_P-TUN', 'SEÑAL PREVENTIVA 0.80X0.80 ( TUNEL)', 'UND'),
      ('SVPP_P-DESP (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (DESPACIO)', 'UND'),
      ('SVPI_002', 'SEÑAL PREVENTIVA 0.80x0.80 (I-17)', 'UND'),
      ('SVPP_P-10B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-10B)', 'UND'),
      ('SVPP_P-11 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-11)', 'UND'),
      ('SVPP_P-12 (3)', 'SEÑAL PREVENTIVA 0.80X0.80 (P-12)', 'UND'),
      ('SVPP_P-13A (3)', 'SEÑAL PREVENTIVA 0.80X0.80 (P-13A)', 'UND'),
      ('SVPP_P-15 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-15)', 'UND'),
      ('SVPP_P-1A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-1A)', 'UND'),
      ('SVPP_P-1B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-1B)', 'UND'),
      ('SVPP_P-2A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-2A)', 'UND'),
      ('SVPP_P-2B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-2B)', 'UND'),
      ('SVPP_P-33A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-33A)', 'UND'),
      ('SVPP_P-33B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-33B)', 'UND'),
      ('SVPP_P-35 (5)', 'SEÑAL PREVENTIVA 0.80X0.80 (P-35)', 'UND'),
      ('SVPP_P-37 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-37)', 'UND'),
      ('SVPP_P-38 (3)', 'SEÑAL PREVENTIVA 0.80X0.80 (P-38) (4.50)', 'UND'),
      ('SVPP_P-3A(3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-3A)', 'UND'),
      ('SVPP_P-3B (3)', 'SEÑAL PREVENTIVA 0.80X0.80 (P-3B)', 'UND'),
      ('SVPP_P-40 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-40)', 'UND'),
      ('SVPP_P-41 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-41)', 'UND'),
      ('SVPP_P-42 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-42)', 'UND'),
      ('SVPP_P-44A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-44A)', 'UND'),
      ('SVPP_P-47 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-47)', 'UND'),
      ('SVPP_P-49 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-49)', 'UND'),
      ('SVPP_P-4A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-4A)', 'UND'),
      ('SVPP_P-4B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-4B)', 'UND'),
      ('SVPP_P-51 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-51)', 'UND'),
      ('SVPP_P-5-1A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-5-1A)', 'UND'),
      ('SVPP_P-5-2A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-5-2A)', 'UND'),
      ('SVPP_P-5-2B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-5-2B)', 'UND'),
      ('SVPP_P-53 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-53)', 'UND'),
      ('SVPP_P-54 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-54)', 'UND'),
      ('SVPP_P-55 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-55)', 'UND'),
      ('SVPP_P-56 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-56)', 'UND'),
      ('SVPP_P-6 (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-6)', 'UND'),
      ('SVPP_P-9A (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-9A)', 'UND'),
      ('SVPP_P-9B (3)', 'SEÑAL PREVENTIVA 0.80x0.80 (P-9B)', 'UND'),
      ('SVPP_P-48', 'SEÑAL PREVENTIVA 0.810X0.80 (P-48}', 'UND'),
      ('SVPP_P-DESP (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (DESPACIO)', 'UND'),
      ('SVPI_003', 'SEÑAL PREVENTIVA 1.00x1.00 (I-19)', 'UND'),
      ('SVPI_007', 'SEÑAL PREVENTIVA 1.00x1.00 (I-9)', 'UND'),
      ('SVPP_P-10A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-10A)', 'UND'),
      ('SVPP_P-10B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-10B)', 'UND'),
      ('SVPP_P-11 (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-11)', 'UND'),
      ('SVPP_P-13A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-13A)', 'UND'),
      ('SVPP_P-13B (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-13-B)', 'UND'),
      ('SVPP_P-14A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-14A)', 'UND'),
      ('SVPP_P-15 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-15)', 'UND'),
      ('SVPP_P-16A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-16A)', 'UND'),
      ('SVPP_P-16B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-16B)', 'UND'),
      ('SVPP_P-1A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-1A)', 'UND'),
      ('SVPP_P-1B (2)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-1B)', 'UND'),
      ('SVPP_P-20 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-20)', 'UND'),
      ('SVPP_P-23 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-23)', 'UND'),
      ('SVPP_P-2A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-2A)', 'UND'),
      ('SVPP_P-2B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-2B)', 'UND'),
      ('SVPP_P-32 (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-32)', 'UND'),
      ('SVPP_P-33A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-33A)', 'UND'),
      ('SVPP_P-33B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-33B)', 'UND'),
      ('SVPP_P-35 (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-35)', 'UND'),
      ('SVPP_P-35C (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-35C)', 'UND'),
      ('SVPP_P-37 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-37)', 'UND'),
      ('SVPP_P-38 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-38)', 'UND'),
      ('SVPP_P-3A(4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-3A)', 'UND'),
      ('SVPP_P-3B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-3B)', 'UND'),
      ('SVPP_P-40 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-40)', 'UND'),
      ('SVPP_P-41 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-41)', 'UND'),
      ('SVPP_P-42 (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-42)', 'UND'),
      ('SVPP_P-44A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-44A)', 'UND'),
      ('SVPP_P-47 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-47)', 'UND'),
      ('SVPP_P-48 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-48)', 'UND'),
      ('SVPP_P-48A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-48A)', 'UND'),
      ('SVPP_P-49 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-49)', 'UND'),
      ('SVPP_P-4A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-4A)', 'UND'),
      ('SVPP_P-4B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-4B)', 'UND'),
      ('SVPP_P-51 (4)', 'SEÑAL PREVENTIVA 1.00X1.00 (P-51)', 'UND'),
      ('SVPP_P-5-1A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-5-1A)', 'UND'),
      ('SVPP_P-5-2A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-5-2A)', 'UND'),
      ('SVPP_P-5-2B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-5-2B)', 'UND'),
      ('SVPP_P-53 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-53)', 'UND'),
      ('SVPP_P-54 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-54)', 'UND'),
      ('SVPP_P-56 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-56)', 'UND'),
      ('SVPP_P-6 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-6)', 'UND'),
      ('SVPP_P-60 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-60)', 'UND'),
      ('SVPP_P-7 (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-7)', 'UND'),
      ('SVPP_P-9A (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-9A)', 'UND'),
      ('SVPP_P-9B (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (P-9B)', 'UND'),
      ('SVPP_P-PLAZ (4)', 'SEÑAL PREVENTIVA 1.00x1.00 (PLAZOLETA)', 'UND'),
      ('CVLM_662', 'SEÑAL PREVENTIVA 1.20x 0.90 (DISMINUYA VELOCIDAD ATENCIÓN DE EMERGENCIA)', 'UND'),
      ('SVPP_P-61 (6)', 'SEÑAL PREVENTIVA CHEVRON 0.40x0.60 (P-61)', 'UND'),
      ('SVPR_R-(30E)', 'SEÑAL REGLAMENTARIA 0.55x0.85 (R-30 30 Km/h)', 'UND'),
      ('SVPR_R-2 (1)', 'SEÑAL REGLAMENTARIA 0.60x0.60 (R-2)', 'UND'),
      ('SVPR_R-20 (1)', 'SEÑAL REGLAMENTARIA 0.80 X 0.80 (R-20)', 'UND'),
      ('SVPR_R-1 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-1)', 'UND'),
      ('SVPR_R-10 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-10)', 'UND'),
      ('SVPR_R-11 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-11)', 'UND'),
      ('SVPR_R-15 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-15)', 'UND'),
      ('SVPR_R-16 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-16)', 'UND'),
      ('SVPR_R-2 (2)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-2)', 'UND'),
      ('SVPR_R-21 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-21)', 'UND'),
      ('SVPR_R-27 (1)', 'SEÑAL REGLAMENTARIA 0.80X0.80 (R-27)', 'UND'),
      ('SVPR_R-30 (20A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 20Km/h)', 'UND'),
      ('SVPR_R-30 (30A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 30Km/h)', 'UND'),
      ('SVPR_R-30 (35A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 35Km/h)', 'UND'),
      ('SVPR_R-30 (40A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 40Km/h)', 'UND'),
      ('SVPR_R-30 (45A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 45Km/h)', 'UND'),
      ('SVPR_R-30 (60A)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-30 60Km/h)', 'UND'),
      ('SVPR_R-30A (3)', 'SEÑAL REGLAMENTARIA 0.80X0.80 (R-30 80KM/H)', 'UND'),
      ('SVPR_R-30 (90A)', 'SEÑAL REGLAMENTARIA 0.80X0.80 (R-30 90KM/H)', 'UND'),
      ('SVPR_R-38(1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-38) - (4.50M)', 'UND'),
      ('SVPR_R-6 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-6)', 'UND'),
      ('SVPR_R-9(1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-9)', 'UND'),
      ('SVPR_R-41 (1)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (USE SOLO LUCES BAJAS)', 'UND'),
      ('SVPR_R-TLMD(4)', 'SEÑAL REGLAMENTARIA 0.80x0.80 R-TLMD(4)', 'UND'),
      ('SVPR_R-29 (3)', 'SEÑAL REGLAMENTARIA 0.80x0.80 (R-29)', 'UND'),
      ('SVPR_R-29 (1)', 'SEÑAL REGLAMENTARIA 0.90x0.60 (R-29)', 'UND'),
      ('SVPR_R-30 (30D)', 'SEÑAL REGLAMENTARIA 0.90x0.60 (R-30 30Km/h)', 'UND'),
      ('SVPR_R-6 (5)', 'SEÑAL REGLAMENTARIA 0.90x0.60 (R-6)', 'UND'),
      ('SVPR_R-30-4 (6)', 'SEÑAL REGLAMENTARIA 0.90x0.80(R-30-4)', 'UND'),
      ('SVPR_R (4)', 'SEÑAL REGLAMENTARIA 1.00 x 1.00 (R - PROHIBIDO TOMAR FOTOS)', 'UND'),
      ('SVPR_R-38 (4)', 'SEÑAL REGLAMENTARIA 1.00 x 1.00 (R-38)', 'UND'),
      ('SVPR_R-20 (2)', 'SEÑAL REGLAMENTARIA 1.00 X 1.00 (R-20)', 'UND'),
      ('SVPR_R-18-1 (4)', 'SEÑAL REGLAMENTARIA 1.00X0.80 (R-18-1)', 'UND'),
      ('SVPR_R-RV55', 'SEÑAL REGLAMENTARIA 1.00x0.80 (REDUCIR VELOCIDAD 55)', 'UND'),
      ('SVPR_R-30-4 (4)', 'SEÑAL REGLAMENTARIA 1.00X0.80(R-30-4)', 'UND'),
      ('SVPR_R-1 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-1)', 'UND'),
      ('SVPR_R-10 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-10)', 'UND'),
      ('SVPR_R-11 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-11)', 'UND'),
      ('SVPR_R-15 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-15)', 'UND'),
      ('SVPR_R-16 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-16)', 'UND'),
      ('SVPR_R-21 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-21)', 'UND'),
      ('SVPR_R-27', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-27)', 'UND'),
      ('SVPR_R-29 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-29)', 'UND'),
      ('SVPR_R-30 (10B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 10Km/h)', 'UND'),
      ('SVPR_R-30 (30B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 30Km/h)', 'UND'),
      ('SVPR_R-30 (35B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 35Km/h)', 'UND'),
      ('SVPR_R-30 (40B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 40Km/h)', 'UND'),
      ('SVPR_R-30 (45B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 45Km/h)', 'UND'),
      ('SVPR_R-30 (5B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 5 Km/h)', 'UND'),
      ('SVPR_R-30 (50B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 50 Km/h)', 'UND'),
      ('SVPR_R-30 (60B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 60Km/h)', 'UND'),
      ('SVPR_R-30 (70B)', 'SEÑAL REGLAMENTARIA 1.00X1.00 (R-30 70Km/h)', 'UND'),
      ('SVPR_R-30 (80B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 80Km/h)', 'UND'),
      ('SVPR_R-30 (90B)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30 90Km/h)', 'UND'),
      ('SVPR_R-30F (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-30F)', 'UND'),
      ('SVPR_R-4 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-4)', 'UND'),
      ('SVPR_R-53 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-53)', 'UND'),
      ('SVPR_R-9 (2)', 'SEÑAL REGLAMENTARIA 1.00x1.00 (R-9)', 'UND'),
      ('SVPR_R-PTF', 'SEÑAL REGLAMENTARIA 1.20x0.8 (PROHIBIDO TOMAR FOTOS O FILMAR VIDEOS)', 'UND'),
      ('SVPR_R-PQL', 'SEÑAL REGLAMENTARIA 1.20x0.80 (PROHIBIDO QUEMAR LLANTAS)', 'UND'),
      ('SVPR_R-10 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-10)', 'UND'),
      ('SVPR_R-15 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-15)', 'UND'),
      ('SVPR_R-16 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-16)', 'UND'),
      ('SVPR_R-20', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-20)', 'UND'),
      ('SVPR_R-28', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-28) NO DETENERSE', 'UND'),
      ('SVPR_R-30-4 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-30-4)', 'UND'),
      ('SVPR_R-35 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-35)', 'UND'),
      ('SVPR_R-37 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-37)', 'UND'),
      ('SVPR_R-39 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-39)', 'UND'),
      ('SVPR_R-40 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-40)', 'UND'),
      ('SVPR_R-41 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-41)', 'UND'),
      ('SVPR_R-44 (3)', 'SEÑAL REGLAMENTARIA 1.20x0.80 (R-44)', 'UND'),
      ('SVPR_R-NBL', 'SEÑAL REGLAMENTARIA 1.20x0.80 (ZONA NEBLINA BAJAR LUCES)', 'UND'),
      ('SVPR_R-18 (4)', 'SEÑAL REGLAMENTARIA 1.20x1.00 (R-18-1)', 'UND'),
      ('AGR028', 'SUBRASANTE', 'M3'),
      ('AGR011', 'TRATAMIENTO "A"', 'M3'),
      ('AGR003', 'TRATAMIENTO SUPERFICIAL (1)', 'M3'),
      ('AGR005', 'TRATAMIENTO SUPERFICIAL (2)', 'M3'),
      ('AGR007', 'TS "B"', 'M3'),
      ('AGR032', 'TS "B" 1/2', 'M3'),
      ('AGR024', 'TS (1)', 'M3'),
      ('AGR025', 'TS (2)', 'M3'),
      ('AGR021', 'TS (3)', 'M3'),
      ('INV_005', 'TUBO DE 4" x 6M DESAGUE', 'UND'),
      ('X001', 'AGUA', 'LT'),
      ('X003', 'MATERIAL PROPIO', 'M3'),
      ('X004', 'GASOLINA', 'GAL'),
      ('X005', 'PIEDRA CHANCADA', 'M3'),
      ('X006', 'MICROPAVIMENTO', 'M3'),
      ('X007', 'SEÑAL INFORMATIVA I: INFORMATIVA DE MENSAJE GENERALES', 'UND'),
      ('X008', 'SEÑAL INFORMATIVA I-C: INFORMATIVA DE CONFIRMACIÓN DE LUGAR Y DISTANCIAS', 'UND'),
      ('X009', 'SEÑAL INFORMATIVA I-D: INFORMATIVA DE DESTINO', 'UND'),
      ('X010', 'SEÑAL INFORMATIVA I-DA: INFORMATIVA DE DESTINO CON DISTANCIA Y PREVENSIÓN', 'UND'),
      ('X011', 'SEÑAL INFORMATIVA I-DB: INFORMATIVA DE DESTINO CON DISTANCIA', 'UND'),
      ('X012', 'SEÑAL INFORMATIVA I-DT: INFORMATIVA DE DESTINO TURISTICO', 'UND'),
      ('X013', 'SEÑAL INFORMATIVA I-P: INFORMATIVA PREVENTIVA', 'UND'),
      ('X014', 'SEÑAL INFORMATIVA I-SG: INFORMATIVA DE SERVICIOS GENERALES', 'UND'),
      ('X015', 'SEÑAL INFORMATIVA I-ZU: INFORMATIVA EN ZONAS URBANAS', 'UND'),
      ('X020', 'ELECTRODO', 'UND')
    ) as m(codigo, nombre, unidad)
    join public.units u on u.code = m.unidad
   on conflict do nothing;

end $$;

-- ─── P13 · Las unidades de control ───────────────────────────────────
update public.supplies set unit_id = (select id from public.units where code = 'GAL'), updated_at = now()
 where upper(name) like 'EMULSION ASFALTICA%' and deleted_at is null;
update public.supplies set unit_id = (select id from public.units where code = 'UND'), updated_at = now()
 where upper(name) like 'BOLSA DE 220%' and deleted_at is null;
update public.supplies set unit_id = (select id from public.units where code = 'PZA'), updated_at = now()
 where upper(name) like 'PERNO%' and deleted_at is null;
update public.supplies set unit_id = (select id from public.units where code = 'UND'), updated_at = now()
 where upper(name) like 'TACHA%' and deleted_at is null;
update public.supplies set unit_id = (select id from public.units where code = 'KG'), updated_at = now()
 where upper(name) like 'DETERGENTE%' and deleted_at is null;
update public.supplies set unit_id = (select id from public.units where code = 'LT'), updated_at = now()
 where upper(btrim(name)) = 'AGUA' and deleted_at is null;

-- ─── P38 · Los almacenes ─────────────────────────────────────────────
create table if not exists public.almacenes (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  codigo     text not null,
  nombre     text not null,
  tipo       text not null check (tipo in ('principal', 'cuadrilla')),
  crew_id    uuid references public.crews(id),
  nota       text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (service_id, codigo)
);
comment on table public.almacenes is 'Almacenes principales (peajes de COVINCA) y el almacén base de cada cuadrilla (Elvis, P38)';
alter table public.almacenes enable row level security;
drop policy if exists almacenes_select on public.almacenes;
create policy almacenes_select on public.almacenes for select using (public.is_member(service_id));
drop policy if exists almacenes_escribir on public.almacenes;
create policy almacenes_escribir on public.almacenes for all
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));
grant select, insert, update, delete on public.almacenes to authenticated;

insert into public.almacenes (service_id, codigo, nombre, tipo, nota)
select '22222222-2222-4222-8222-222222222221', a.codigo, a.nombre, 'principal', 'Peaje de COVINCA'
  from (values ('CAMANA', 'Almacén Camaná'), ('EL_FISCAL', 'Almacén El Fiscal'),
               ('MONTALVO', 'Almacén Montalvo'), ('TOMASIRI', 'Almacén Tomasiri')) as a(codigo, nombre)
 where exists (select 1 from public.services where id = '22222222-2222-4222-8222-222222222221')
on conflict (service_id, codigo) do nothing;

insert into public.almacenes (service_id, codigo, nombre, tipo, crew_id, nota)
select c.service_id, 'BASE_' || c.code, 'Base ' || c.name, 'cuadrilla', c.id, 'Stock limitado de la cuadrilla'
  from public.crews c
 where c.service_id = '22222222-2222-4222-8222-222222222221' and c.deleted_at is null
on conflict (service_id, codigo) do nothing;

-- El pedido dice de qué almacén se retira (F7: «Almacén de retiro»)
alter table public.supply_requests add column if not exists almacen_id uuid references public.almacenes(id);

-- ─── P12 · Los rendimientos ──────────────────────────────────────────
create table if not exists public.rendimientos (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  activity_id uuid not null references public.activities_catalog(id) on delete cascade,
  supply_id   uuid not null references public.supplies(id) on delete cascade,
  cantidad    numeric(14, 6) not null check (cantidad > 0),
  nota        text,
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (activity_id, supply_id)
);
comment on table public.rendimientos is 'Cuánto material lleva cada unidad de una partida (Elvis, P12): Pre-cantidad = metrado × rendimiento';
alter table public.rendimientos enable row level security;
drop policy if exists rendimientos_select on public.rendimientos;
create policy rendimientos_select on public.rendimientos for select using (public.is_member(service_id));
drop policy if exists rendimientos_escribir on public.rendimientos;
create policy rendimientos_escribir on public.rendimientos for all
  using (public.can_manage(service_id)) with check (public.can_manage(service_id));
grant select, insert, update, delete on public.rendimientos to authenticated;
drop trigger if exists t_audit_rendimientos on public.rendimientos;
create trigger t_audit_rendimientos after insert or update or delete on public.rendimientos
  for each row execute function public.audit_trigger();

-- ─── P16 · El flujo del pedido ───────────────────────────────────────
-- Quién mueve cada estado
create or replace function public.t_supply_request_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.supply_request_status := case when tg_op = 'UPDATE' then old.status end;
  v_rol public.user_role;
begin
  if v_uid is null or new.status is not distinct from v_old then
    return new;
  end if;
  v_rol := public.role_in(new.service_id);

  if new.status in ('aprobado_residente', 'rechazado') and v_rol not in ('residente', 'admin') then
    raise exception 'SIGOV: el pedido lo aprueba o rechaza el ingeniero residente' using errcode = '42501';
  end if;
  if new.status in ('aprobado', 'observado') and v_rol not in ('visor', 'admin') then
    raise exception 'SIGOV: la aprobación final del pedido es del visor COVINCA' using errcode = '42501';
  end if;
  if new.status in ('parcial', 'entregado') and not public.can_manage(new.service_id) then
    raise exception 'SIGOV: solo el residente, el supervisor o el administrador registran una entrega' using errcode = '42501';
  end if;

  if new.status = 'anulado' then
    if not public.can_manage(new.service_id)
       and not (new.created_by = v_uid and v_old in ('borrador', 'solicitado', 'observado')) then
      raise exception 'SIGOV: un pedido ya revisado solo lo puede anular el residente o el supervisor' using errcode = '42501';
    end if;
    new.cancelled_by := v_uid;
    new.cancelled_at := now();
  end if;

  if new.status in ('aprobado_residente', 'aprobado', 'observado', 'rechazado') then
    new.reviewed_by := v_uid;
    new.reviewed_at := now();
  elsif tg_op = 'UPDATE' then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;

-- Crear: queda «solicitado» para el residente. Solo el administrador puede
-- registrarlo ya aprobado (un pedido urgente fuera del flujo).
create or replace function public.crear_pedido(
  p_service_id uuid, p_crew_id uuid default null, p_needed_on date default null, p_reason text default null,
  p_section_id uuid default null, p_plan_item_id uuid default null, p_items jsonb default '[]'::jsonb,
  p_aprobar boolean default false
)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_id   uuid;
  v_item jsonb;
  v_aprobado boolean := p_aprobar and public.role_in(p_service_id) = 'admin';
begin
  if not public.can_manage(p_service_id) then
    raise exception 'Solo el supervisor, el residente o el administrador piden materiales.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  insert into public.supply_requests
    (service_id, crew_id, status, needed_on, reason, section_id, plan_item_id, created_by)
  values
    (p_service_id, p_crew_id,
     case when v_aprobado then 'aprobado' else 'solicitado' end::public.supply_request_status,
     coalesce(p_needed_on, public.hoy_peru()),
     nullif(btrim(p_reason), ''), p_section_id, p_plan_item_id, auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, qty_approved, notes)
    values (
      p_service_id, v_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      case when v_aprobado then (v_item->>'qty')::numeric end,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  return v_id;
end $$;

-- A quién le toca: el residente lo solicitado, el visor lo aprobado por el
-- residente, y quien pidió lo que se resolvió
create or replace function public.avisar_pedido(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.supply_requests;
  v_roles public.user_role[];
  v_titulo text;
begin
  select * into r from public.supply_requests where id = p_id;
  if not found then return; end if;
  v_roles := case r.status
    when 'solicitado' then array['residente']::public.user_role[]
    when 'aprobado_residente' then array['visor']::public.user_role[]
    else null end;
  v_titulo := case r.status
    when 'solicitado' then 'Pedido por aprobar · ' || coalesce(r.code, '')
    when 'aprobado_residente' then 'Pedido aprobado por el residente · ' || coalesce(r.code, '')
    when 'aprobado' then 'Pedido aprobado por COVINCA · ' || coalesce(r.code, '')
    when 'observado' then 'Pedido observado por COVINCA · ' || coalesce(r.code, '')
    when 'rechazado' then 'Pedido rechazado · ' || coalesce(r.code, '')
    else null end;
  if v_titulo is null then return; end if;

  if v_roles is not null then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    select r.service_id, m.profile_id, 'pedido_' || r.status, v_titulo, coalesce(r.reason, 'Pedido de materiales'),
           '/materiales', 'info', jsonb_build_object('supply_request_id', r.id)
      from public.service_members m
     where m.service_id = r.service_id and m.role = any(v_roles) and m.profile_id is distinct from auth.uid();
  elsif r.created_by is not null and r.created_by is distinct from auth.uid() then
    insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
    values (r.service_id, r.created_by, 'pedido_' || r.status, v_titulo,
            coalesce(r.review_note, r.reason, 'Pedido de materiales'), '/materiales',
            case r.status when 'observado' then 'warning' when 'rechazado' then 'danger' else 'success' end,
            jsonb_build_object('supply_request_id', r.id));
  end if;
end $$;

drop function if exists public.revisar_pedido(uuid, boolean, text, jsonb);
create or replace function public.revisar_pedido(p_request_id uuid, p_aprobar boolean, p_nota text, p_cantidades jsonb default '{}'::jsonb)
returns public.supply_request_status
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_r public.supply_requests;
  v_rol public.user_role;
  v_nuevo public.supply_request_status;
begin
  select * into v_r from public.supply_requests where id = p_request_id and deleted_at is null for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  v_rol := public.role_in(v_r.service_id);

  if v_r.status = 'solicitado' then
    -- Primera revisión: el residente (o el administrador)
    if v_rol not in ('residente', 'admin') then
      raise exception 'SIGOV: este pedido lo revisa primero el ingeniero residente' using errcode = '42501';
    end if;
    if not p_aprobar and nullif(btrim(p_nota), '') is null then
      raise exception 'Escribe por qué se rechaza: quien lo pidió necesita saberlo.';
    end if;
    v_nuevo := case when p_aprobar then 'aprobado_residente' else 'rechazado' end;
    if p_aprobar then
      update public.supply_request_items i
         set qty_approved = coalesce((p_cantidades->>(i.id::text))::numeric, i.qty_requested), updated_at = now()
       where i.request_id = p_request_id and i.deleted_at is null;
    end if;
  elsif v_r.status = 'aprobado_residente' then
    -- Aprobación final: el visor COVINCA (o el administrador), que puede observarlo
    if v_rol not in ('visor', 'admin') then
      raise exception 'SIGOV: la aprobación final del pedido es del visor COVINCA' using errcode = '42501';
    end if;
    if not p_aprobar and nullif(btrim(p_nota), '') is null then
      raise exception 'Escribe la observación: quien lo pidió necesita saber qué corregir.';
    end if;
    v_nuevo := case when p_aprobar then 'aprobado' else 'observado' end;
  else
    raise exception 'El pedido % ya no está por revisar: está %.', v_r.code, v_r.status;
  end if;

  update public.supply_requests
     set status = v_nuevo, review_note = nullif(btrim(p_nota), ''), updated_at = now()
   where id = p_request_id;
  return v_nuevo;
end $$;

-- Un pedido observado se corrige y se reenvía: vuelve al residente
create or replace function public.reenviar_pedido(p_request_id uuid, p_items jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_r public.supply_requests;
  v_item jsonb;
begin
  select * into v_r from public.supply_requests where id = p_request_id and deleted_at is null for update;
  if v_r.id is null then raise exception 'El pedido no existe.'; end if;
  if v_r.status <> 'observado' then
    raise exception 'Solo se reenvía un pedido observado (este está %).', v_r.status;
  end if;
  if not (v_r.created_by = auth.uid() or public.can_manage(v_r.service_id)) then
    raise exception 'SIGOV: solo quien pidió o quien administra reenvía el pedido' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'El pedido no tiene ningún insumo.';
  end if;

  update public.supply_request_items set deleted_at = now(), updated_at = now()
   where request_id = p_request_id and deleted_at is null;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.supply_request_items
      (service_id, request_id, supply_id, other_name, other_unit_id, qty_requested, notes)
    values (
      v_r.service_id, p_request_id,
      nullif(v_item->>'supply_id', '')::uuid,
      nullif(btrim(v_item->>'other_name'), ''),
      nullif(v_item->>'other_unit_id', '')::uuid,
      (v_item->>'qty')::numeric,
      nullif(btrim(v_item->>'notes'), '')
    );
  end loop;

  -- El motivo se conserva; lo que se corrigió queda en la trazabilidad
  update public.supply_requests
     set status = 'solicitado',
         review_note = nullif(btrim(p_nota), ''), reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_request_id;
end $$;

-- Entregar: solo lo aprobado por COVINCA (o lo ya entregado en parte)
do $$
declare
  antes text := pg_get_functiondef('public.entregar_pedido(uuid, jsonb, text, date)'::regprocedure);
  despues text;
begin
  despues := replace(antes, 'if v_r.status not in (''solicitado'', ''aprobado'', ''parcial'') then',
                            'if v_r.status not in (''aprobado'', ''parcial'') then');
  if despues = antes then raise exception 'SIGOV 0101: entregar_pedido cambió'; end if;
  execute despues;
end $$;

revoke execute on function public.revisar_pedido(uuid, boolean, text, jsonb) from anon, public;
grant execute on function public.revisar_pedido(uuid, boolean, text, jsonb) to authenticated;
revoke execute on function public.reenviar_pedido(uuid, jsonb, text) from anon, public;
grant execute on function public.reenviar_pedido(uuid, jsonb, text) to authenticated;
revoke execute on function public.avisar_pedido(uuid) from anon, public, authenticated;

-- Los avisos salen solos al cambiar de estado
create or replace function public.t_supply_request_aviso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.avisar_pedido(new.id);
  end if;
  return null;
end $$;

drop trigger if exists t_supply_request_aviso on public.supply_requests;
create trigger t_supply_request_aviso after insert or update of status on public.supply_requests
  for each row execute function public.t_supply_request_aviso();

-- La trazabilidad: cada revisión del pedido queda registrada (la doble
-- aprobación y las observaciones no caben en un solo «reviewed_by»)
create table if not exists public.revisiones_de_pedido (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  request_id uuid not null references public.supply_requests(id) on delete cascade,
  paso       text not null,
  nota       text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists revisiones_de_pedido_pedido on public.revisiones_de_pedido (request_id);
alter table public.revisiones_de_pedido enable row level security;
drop policy if exists revisiones_de_pedido_select on public.revisiones_de_pedido;
create policy revisiones_de_pedido_select on public.revisiones_de_pedido for select using (public.is_member(service_id));
grant select on public.revisiones_de_pedido to authenticated;

create or replace function public.t_supply_request_aviso()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and (new.status in ('aprobado_residente', 'observado', 'aprobado', 'rechazado')
          or (old.status = 'observado' and new.status = 'solicitado')) then
    insert into public.revisiones_de_pedido (service_id, request_id, paso, nota, created_by)
    values (new.service_id, new.id,
            case when new.status = 'solicitado' then 'reenviado' else new.status::text end,
            new.review_note,
            auth.uid());
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.avisar_pedido(new.id);
  end if;
  return null;
end $$;

create or replace view public.v_historial_de_pedido with (security_invoker = true) as
 SELECT r.id AS request_id, r.service_id, r.created_at AS ocurrio, 'solicitado'::text AS paso,
        p.full_name AS quien, r.reason AS detalle, NULL::numeric AS cantidad, NULL::text AS insumo
   FROM supply_requests r LEFT JOIN profiles p ON p.id = r.created_by
  WHERE r.deleted_at IS NULL
UNION ALL
 SELECT v.request_id, v.service_id, v.created_at, v.paso, p.full_name, v.nota, NULL::numeric, NULL::text
   FROM revisiones_de_pedido v LEFT JOIN profiles p ON p.id = v.created_by
UNION ALL
 -- Lo revisado antes de la doble aprobación (sin registro de revisiones)
 SELECT r.id, r.service_id, r.reviewed_at,
        CASE WHEN r.status = 'rechazado'::supply_request_status THEN 'rechazado'::text ELSE 'aprobado'::text END,
        p.full_name, r.review_note, NULL::numeric, NULL::text
   FROM supply_requests r LEFT JOIN profiles p ON p.id = r.reviewed_by
  WHERE r.deleted_at IS NULL AND r.reviewed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM revisiones_de_pedido v WHERE v.request_id = r.id)
UNION ALL
 SELECT m.request_id, m.service_id, m.created_at,
        CASE m.kind WHEN 'salida'::stock_movement_kind THEN 'entregado'::text ELSE m.kind::text END,
        p.full_name, m.notes, m.qty, s.name
   FROM stock_movements m JOIN supplies s ON s.id = m.supply_id LEFT JOIN profiles p ON p.id = m.created_by
  WHERE m.request_id IS NOT NULL AND m.deleted_at IS NULL
UNION ALL
 SELECT r.id, r.service_id, r.cancelled_at, 'anulado'::text, p.full_name, NULL::text, NULL::numeric, NULL::text
   FROM supply_requests r LEFT JOIN profiles p ON p.id = r.cancelled_by
  WHERE r.deleted_at IS NULL AND r.cancelled_at IS NOT NULL;
