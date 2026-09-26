-- ═══════════════════════════════════════════════════════════════════════
-- 0058 · La foto del inventario es la anterior, no la actual
--
-- La ficha de cada elemento enseña dos fotos para compararlas: cómo estaba
-- y cómo está. Es lo que pidió Elvis —«una el anterior cómo estaba y uno
-- actual»—, y la vista que elige esas dos se escribió pensando en fotos de
-- campo, una visita por día. Con las del Inventario Vial 2024 eso fallaba
-- de tres maneras:
--
-- · Las visitas se ordenaban de la más nueva a la más vieja y PostgreSQL
--   pone los nulos primero al ordenar descendente. En cuanto una cuadrilla
--   fotografiara un elemento, la del inventario seguiría saliendo como
--   «actual» y la de hoy como «anterior». Al revés.
--
-- · Una campaña de levantamiento no es una visita por día. En el subtramo
--   2 fotografiaron aguas arriba de una alcantarilla el 13 de noviembre y
--   aguas abajo el 14: la ficha lo enseñaba como «antes y ahora, un día
--   entre fotos». Es la misma inspección. Ahora todas las fotos de un
--   levantamiento —las que están en inventario-AAAA— cuentan como una sola
--   visita, fechada con la última de sus fotos.
--
-- · De las tres vistas de una alcantarilla salía una cualquiera. Se
--   prefiere la que el inventario cita como oficial —en el subtramo 1, la de
--   entrada, que enseña la estructura— y entre varias citadas la panorámica.
--
-- El «antes y ahora» aparece cuando de verdad hay dos momentos: el
-- inventario y la primera intervención registrada en campo después.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_asset_fotos
with (security_invoker = true) as
with fotos as (
  select
    l.asset_id,
    e.id as evidence_id,
    e.storage_path,
    e.thumb_path,
    e.phase,
    e.taken_at,
    e.caption,
    e.watermarked,
    e.lat,
    e.lng,
    e.service_id,
    -- Un levantamiento de inventario es una visita; una foto de campo, la
    -- del día en que se tomó.
    coalesce(
      substring(e.storage_path from '/(inventario-\d{4})/'),
      ((e.taken_at at time zone 'America/Lima')::date)::text
    ) as lote,
    -- La vista, cuando el vínculo la conoce: «… · vista P».
    substring(l.note from 'vista ([A-Z]+)') as vista,
    -- Si es la foto que el inventario cita para el elemento o una hermana
    -- suya: la citada es la oficial del formato MTC.
    coalesce(l.note like '%· cita%', false) as citada
  from public.evidence_links l
  join public.evidences e on e.id = l.evidence_id
  where l.asset_id is not null
    and e.deleted_at is null
),
con_fecha as (
  select f.*,
         max(f.taken_at) over (partition by f.asset_id, f.lote) as fecha_lote
  from fotos f
),
mejor_de_cada_visita as (
  select distinct on (asset_id, lote)
    asset_id,
    (fecha_lote at time zone 'America/Lima')::date as visita,
    fecha_lote,
    evidence_id, storage_path, thumb_path, phase,
    taken_at, caption, watermarked, lat, lng, service_id
  from con_fecha
  order by
    asset_id,
    lote,
    case phase
      when 'despues' then 1
      when 'general' then 2
      when 'durante' then 3
      else 4
    end,
    -- La que el inventario cita va primero: en el subtramo 1 la oficial de
    -- una alcantarilla es la de entrada, que enseña la estructura; la
    -- panorámica enseña la carretera. Entre varias citadas, la panorámica.
    citada desc,
    case vista when 'P' then 1 when 'E' then 2 when 'AR' then 3 else 4 end,
    taken_at desc nulls last
)
select
  asset_id, visita, evidence_id, storage_path, thumb_path, phase,
  taken_at, caption, watermarked, lat, lng, service_id,
  row_number() over (partition by asset_id order by fecha_lote desc nulls last) as orden
from mejor_de_cada_visita m;

comment on view public.v_asset_fotos is
  'Una foto por visita a cada elemento, de la más reciente a la más antigua. '
  'Un levantamiento de inventario anual cuenta como una sola visita aunque '
  'sus fotos sean de días distintos; al llegar una foto de campo, esa es la '
  'actual y la del inventario la anterior.';
