-- ═══════════════════════════════════════════════════════════════════════
-- 0025 · La organización que opera el contrato
--
-- El sistema se armó con los datos de ETS VALERIA, que era el cliente
-- anterior. Quien opera hoy es Grupo Servicon V&D EIRL.
--
-- El nombre se corrige aquí; los datos fiscales NO se inventan. El RUC, la
-- dirección y el teléfono salen impresos en la cabecera de cada PDF que se
-- entrega a COVINCA: un dato equivocado ahí es peor que un dato ausente,
-- porque nadie lo revisa y termina en un expediente. Quedan vacíos hasta que
-- la empresa los confirme, y se cargan desde Configuración › Organización.
-- ═══════════════════════════════════════════════════════════════════════

update public.organizations
   set name       = 'Grupo Servicon V&D EIRL',
       legal_name = 'GRUPO SERVICON V&D E.I.R.L.',
       ruc        = null,
       address    = null,
       phone      = null,
       email      = null,
       updated_at = now()
 where name = 'ETS VALERIA'
    or ruc  = '20600222393';

-- El código de contrato quedó con la nomenclatura del servicio anterior
-- («RV4»), que no corresponde. Igual que el RUC, no se inventa: se deja vacío
-- para que se cargue desde Configuración con el número real del contrato.
update public.services
   set contract_code = null,
       updated_at    = now()
 where code = 'SUR'
   and contract_code like '%RV4%';
