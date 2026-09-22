-- ═══════════════════════════════════════════════════════════════════════
-- 0042 · Los ajustes del contrato
--
-- La especificación pide dos cosas que hoy están cableadas en el código:
--
--   · el sello de la fotografía «configurable campo por campo» —fecha,
--     hora, coordenadas, progresiva, cuadrilla, actividad, código de PCI—,
--     porque no todos los clientes aceptan el mismo formato y hay entregas
--     que exigen la foto limpia;
--   · los umbrales de operación: desde cuánto un gasto necesita comprobante
--     y con cuántos días de antelación avisar de un vencimiento.
--
-- Van en una columna jsonb del contrato y no en una tabla aparte porque son
-- ajustes de un contrato, se leen siempre enteros y se cambian de año en
-- año. La app los baja con los catálogos y sella sin consultar nada.
--
-- Lo que no se toca: el SHA-256 de la foto y sus coordenadas se guardan
-- siempre, lleve sello o no. Se configura lo que se *imprime encima*, no lo
-- que se registra; si no, el sello dejaría de valer como sustento.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.services
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.services.settings is
  'Ajustes del contrato: sello de la foto y umbrales de operación. '
  'Lo que falte se resuelve con el valor por omisión de ajustes_del_servicio().';

/**
 * Los ajustes con sus valores por omisión ya aplicados.
 *
 * La app y la web preguntan por aquí y nunca por la columna cruda: así un
 * contrato que nunca se configuró se comporta igual que uno configurado con
 * los valores de siempre, y agregar un ajuste nuevo no obliga a tocar las
 * filas existentes.
 */
create or replace function public.ajustes_del_servicio(p_service_id uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- Qué se imprime sobre la fotografía
    'sello', jsonb_build_object(
      'activo',     true,
      'fecha',      true,
      'hora',       true,
      'geo',        true,
      'progresiva', true,
      'tramo',      true,
      'cuadrilla',  false,
      'actividad',  true,
      'pci',        true,
      'marca',      true
    ) || coalesce(s.settings->'sello', '{}'::jsonb),

    -- Umbrales de operación
    'caja', jsonb_build_object(
      'monto_minimo_comprobante', 20
    ) || coalesce(s.settings->'caja', '{}'::jsonb),

    'alertas', jsonb_build_object(
      'dias_aviso_vencimiento', 30,
      'dias_aviso_pci', 7
    ) || coalesce(s.settings->'alertas', '{}'::jsonb)
  )::json
  from public.services s
  where s.id = p_service_id and s.deleted_at is null
$$;

grant execute on function public.ajustes_del_servicio(uuid) to authenticated;
