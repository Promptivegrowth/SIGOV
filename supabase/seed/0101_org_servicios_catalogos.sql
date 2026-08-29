-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0101 · Organización, servicios, unidades, actividades,
--                     tramos viales (geometría real) y cuadrillas
-- Corredor: Red Vial N.º 4 · Pativilca – Trujillo (Panamericana Norte, Perú)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Organización ────────────────────────────────────────────────────────
insert into public.organizations (id, name, ruc, legal_name, address, phone, email)
values ('11111111-1111-4111-8111-111111111111',
        'ETS VALERIA', '20600222393', 'ETS VALERIA S.A.C.',
        'Av. Los Álamos 421, Barranca – Lima', '+51 987 654 321', 'contacto@etsvaleria.pe')
on conflict (id) do update set name = excluded.name, ruc = excluded.ruc;

-- ─── Servicios (multi-tenant) ────────────────────────────────────────────
insert into public.services (id, org_id, code, name, description, client_name, contract_code,
                             status, starts_on, ends_on, color, modules, is_demo)
values
 ('22222222-2222-4222-8222-222222222221','11111111-1111-4111-8111-111111111111',
  'RV4','Red Vial N.º 4 · Pativilca – Trujillo',
  'Mantenimiento rutinario vial del corredor Panamericana Norte, tramo Pativilca – Trujillo. Contrato completo con atención de PCIs OSITRAN, SSOMA e inventario vial.',
  'AUTOPISTA DEL NORTE S.A.C.','C-2026-RV4-017','activo','2026-01-15','2027-01-14','#1D4ED8',
  '{"programacion":true,"campo":true,"pci":true,"ssoma":true,"inventario":true,"reportes":true,"mapa":true}'::jsonb,
  true),
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  'HUA','Conservación Huaura – Sayán',
  'Servicio simplificado: solo programación semanal y ejecución en campo. Sin PCIs ni módulo SSOMA. Demuestra el multi-servicio con módulos apagados.',
  'GOBIERNO REGIONAL DE LIMA','C-2026-HUA-004','activo','2026-04-01','2026-12-31','#0D9488',
  '{"programacion":true,"campo":true,"pci":false,"ssoma":false,"inventario":true,"reportes":true,"mapa":true}'::jsonb,
  true)
on conflict (id) do update
  set name = excluded.name, modules = excluded.modules, description = excluded.description;

-- ─── Membresías (quién ve qué) ───────────────────────────────────────────
insert into public.service_members (service_id, profile_id, role) values
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000001','admin'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000002','supervisor'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000003','jefe_cuadrilla'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000004','jefe_cuadrilla'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000005','ing_seguridad'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000006','visor'),
 ('22222222-2222-4222-8222-222222222221','a0000000-0000-4000-8000-000000000007','jefe_cuadrilla'),
 ('22222222-2222-4222-8222-222222222222','a0000000-0000-4000-8000-000000000001','admin'),
 ('22222222-2222-4222-8222-222222222222','a0000000-0000-4000-8000-000000000002','supervisor'),
 ('22222222-2222-4222-8222-222222222222','a0000000-0000-4000-8000-000000000008','jefe_cuadrilla')
on conflict (service_id, profile_id) do update set role = excluded.role;

-- ─── Unidades de medida ──────────────────────────────────────────────────
insert into public.units (code, name, symbol) values
 ('M2','Metro cuadrado','m²'), ('M3','Metro cúbico','m³'), ('ML','Metro lineal','m'),
 ('KM','Kilómetro','km'), ('UND','Unidad','und'), ('GLB','Global','glb'),
 ('HH','Hora-hombre','h-h'), ('TN','Tonelada','t'), ('LT','Litro','L'), ('PZA','Pieza','pza')
on conflict (code) do nothing;

-- ─── Catálogo de actividades (mantenimiento rutinario vial) ──────────────
insert into public.activities_catalog (service_id, code, name, category, unit_id, yield_per_day, min_photos, color, icon)
select s.id, x.code, x.name, x.category, u.id, x.yield, x.minp, x.color, x.icon
from public.services s
cross join (values
 ('MR-01','Limpieza de calzada y bermas','Calzada','M2',4500,2,'#0EA5E9','brush'),
 ('MR-02','Bacheo superficial en frío','Calzada','M2',180,3,'#F97316','construction'),
 ('MR-03','Sellado de fisuras y grietas','Calzada','ML',900,2,'#EF4444','waves'),
 ('MR-04','Parchado profundo','Calzada','M2',95,3,'#DC2626','hammer'),
 ('MR-05','Limpieza de alcantarillas','Drenaje','UND',14,3,'#0891B2','droplets'),
 ('MR-06','Limpieza de cunetas','Drenaje','ML',1200,2,'#06B6D4','waves'),
 ('MR-07','Descolmatación de badenes','Drenaje','M3',65,2,'#0E7490','shovel'),
 ('MR-08','Limpieza de zanjas de coronación','Drenaje','ML',800,2,'#155E75','ruler'),
 ('MR-09','Pintado de marcas en el pavimento','Señalización','ML',2200,2,'#FACC15','paintbrush'),
 ('MR-10','Reposición de señales verticales','Señalización','UND',12,3,'#EAB308','signpost'),
 ('MR-11','Limpieza de señales verticales','Señalización','UND',85,2,'#CA8A04','sparkles'),
 ('MR-12','Reposición de postes delineadores','Señalización','UND',40,2,'#A16207','milestone'),
 ('MR-13','Reparación de guardavías metálicas','Seguridad vial','ML',55,3,'#64748B','shield'),
 ('MR-14','Limpieza de guardavías','Seguridad vial','ML',700,2,'#475569','shield-check'),
 ('MR-15','Mantenimiento de postes SOS','Seguridad vial','UND',10,3,'#7C3AED','phone-call'),
 ('MR-16','Roce y desbroce en derecho de vía','Derecho de vía','M2',3200,2,'#16A34A','trees'),
 ('MR-17','Retiro de residuos sólidos','Derecho de vía','M3',35,2,'#65A30D','trash-2'),
 ('MR-18','Control de erosión en taludes','Derecho de vía','M2',280,3,'#84CC16','mountain'),
 ('MR-19','Atención de emergencias viales','Emergencias','GLB',1,4,'#E11D48','siren'),
 ('MR-20','Señalización de zona de trabajo','Emergencias','GLB',2,3,'#F43F5E','triangle-alert')
) as x(code, name, category, unit, yield, minp, color, icon)
join public.units u on u.code = x.unit
where s.is_demo
on conflict (service_id, code) do nothing;

-- ─── Tramos viales con geometría real (Panamericana Norte) ───────────────
insert into public.road_sections (service_id, code, name, route_code, prog_start_m, prog_end_m, surface, lanes, geom, color)
values
 ('22222222-2222-4222-8222-222222222221','T-01','Pativilca – Huarmey','PE-1N',0,96000,'Asfalto',4,
  extensions.ST_GeomFromText('LINESTRING(-77.7730 -10.7030, -77.8420 -10.5610, -77.9350 -10.4180, -78.0180 -10.2740, -78.0960 -10.1720, -78.1530 -10.0670)',4326),'#2563EB'),
 ('22222222-2222-4222-8222-222222222221','T-02','Huarmey – Casma','PE-1N',96000,168000,'Asfalto',4,
  extensions.ST_GeomFromText('LINESTRING(-78.1530 -10.0670, -78.1920 -9.9280, -78.2350 -9.7850, -78.2740 -9.6300, -78.3000 -9.4730)',4326),'#7C3AED'),
 ('22222222-2222-4222-8222-222222222221','T-03','Casma – Chimbote','PE-1N',168000,222000,'Asfalto',4,
  extensions.ST_GeomFromText('LINESTRING(-78.3000 -9.4730, -78.3620 -9.3510, -78.4480 -9.2410, -78.5310 -9.1500, -78.5930 -9.0750)',4326),'#0891B2'),
 ('22222222-2222-4222-8222-222222222221','T-04','Chimbote – Santa','PE-1N',222000,236000,'Asfalto',4,
  extensions.ST_GeomFromText('LINESTRING(-78.5930 -9.0750, -78.6100 -9.0330, -78.6250 -9.0050, -78.6330 -8.9770)',4326),'#059669'),
 ('22222222-2222-4222-8222-222222222221','T-05','Santa – Virú','PE-1N',236000,304000,'Asfalto',4,
  extensions.ST_GeomFromText('LINESTRING(-78.6330 -8.9770, -78.6620 -8.8420, -78.6910 -8.7050, -78.7220 -8.5680, -78.7520 -8.4150)',4326),'#D97706'),
 ('22222222-2222-4222-8222-222222222221','T-06','Virú – Trujillo','PE-1N',304000,356000,'Asfalto',6,
  extensions.ST_GeomFromText('LINESTRING(-78.7520 -8.4150, -78.8100 -8.3350, -78.8760 -8.2540, -78.9480 -8.1780, -79.0280 -8.1120)',4326),'#DC2626'),
 ('22222222-2222-4222-8222-222222222222','H-01','Huaura – Sayán','LM-112',0,42000,'Asfalto',2,
  extensions.ST_GeomFromText('LINESTRING(-77.6050 -11.0730, -77.4980 -11.1050, -77.3910 -11.1320, -77.2820 -11.1560)',4326),'#0D9488'),
 ('22222222-2222-4222-8222-222222222222','H-02','Sayán – Churín','LM-112',42000,78000,'Afirmado',2,
  extensions.ST_GeomFromText('LINESTRING(-77.2820 -11.1560, -77.1950 -11.0820, -77.1230 -10.9950, -77.0640 -10.8930)',4326),'#14B8A6')
on conflict (service_id, code) do nothing;

-- ─── Cuadrillas ──────────────────────────────────────────────────────────
insert into public.crews (service_id, code, name, leader_id, vehicle, plate, color) values
 ('22222222-2222-4222-8222-222222222221','CUA-A','Cuadrilla A · Calzada y Drenaje',
  'a0000000-0000-4000-8000-000000000003','Camión baranda Hino 500','B7K-842','#0EA5E9'),
 ('22222222-2222-4222-8222-222222222221','CUA-B','Cuadrilla B · Señalización',
  'a0000000-0000-4000-8000-000000000004','Camioneta Toyota Hilux 4x4','C2M-119','#F59E0B'),
 ('22222222-2222-4222-8222-222222222221','CUA-C','Cuadrilla C · Derecho de vía',
  'a0000000-0000-4000-8000-000000000007','Camión volquete Volvo FMX','A9T-507','#16A34A'),
 ('22222222-2222-4222-8222-222222222221','CUA-D','Cuadrilla D · Emergencias 24/7',
  null,'Camioneta Nissan Frontier','D4R-663','#E11D48'),
 ('22222222-2222-4222-8222-222222222222','HUA-A','Cuadrilla Huaura 1',
  'a0000000-0000-4000-8000-000000000008','Camioneta Mitsubishi L200','F1P-228','#0D9488')
on conflict (service_id, code) do nothing;

-- ─── Integrantes de cuadrilla ────────────────────────────────────────────
insert into public.crew_members (crew_id, full_name, dni, position)
select c.id, x.name, x.dni, x.pos
from public.crews c
join (values
 ('CUA-A','Marco Quispe Ramos','43128907','Jefe de cuadrilla'),
 ('CUA-A','Yerson Palomino Ríos','72910384','Operario'),
 ('CUA-A','Edwin Chávez Loayza','40881725','Operario'),
 ('CUA-A','Braulio Ñahui Ccora','71209463','Peón'),
 ('CUA-A','Luis Ordoñez Sivipaucar','45907213','Conductor'),
 ('CUA-B','Rosa Huamán Ticona','44012876','Jefe de cuadrilla'),
 ('CUA-B','Katia Melgar Zúñiga','73418290','Operario'),
 ('CUA-B','Fredy Ataucusi León','41996305','Operario'),
 ('CUA-B','Jorge Ccahuana Puma','70338914','Peón'),
 ('CUA-C','Julio Cárdenas Vega','42307781','Jefe de cuadrilla'),
 ('CUA-C','Wilfredo Mamani Apaza','71852049','Operario'),
 ('CUA-C','Sonia Ipanaqué Chero','46120983','Operario'),
 ('CUA-C','Denis Rojas Ayala','74501628','Peón'),
 ('CUA-C','Óscar Bermúdez Farfán','40774512','Conductor'),
 ('CUA-D','Ítalo Ferreyra Bazán','43665029','Jefe de turno'),
 ('CUA-D','Nayeli Torres Guevara','75209341','Operario'),
 ('CUA-D','Percy Aguilar Bustamante','41338705','Operario'),
 ('HUA-A','Nélida Sánchez Poma','44718230','Jefe de cuadrilla'),
 ('HUA-A','Renzo Vílchez Coronado','72640185','Operario'),
 ('HUA-A','Miguel Salazar Ruiz','40592718','Peón')
) as x(crew_code, name, dni, pos) on x.crew_code = c.code
on conflict do nothing;

-- Vincular jefes de cuadrilla a su crew_member
update public.crew_members cm set profile_id = c.leader_id
  from public.crews c where cm.crew_id = c.id and cm.position like 'Jefe%' and c.leader_id is not null;

select
 (select count(*) from public.services where is_demo) as servicios,
 (select count(*) from public.activities_catalog) as actividades,
 (select count(*) from public.road_sections) as tramos,
 (select count(*) from public.crews) as cuadrillas,
 (select count(*) from public.crew_members) as integrantes;
