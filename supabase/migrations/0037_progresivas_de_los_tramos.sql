-- ═══════════════════════════════════════════════════════════════════════
-- 0037 · Las progresivas de los tramos no cuadran con su contenido
--
-- La app nativa rechazaba registrar avance contra cualquier partida
-- programada: «esa progresiva queda fuera del tramo». La validación estaba
-- bien; el dato estaba mal. Las 230 partidas de la semana caen fuera del
-- rango declarado de su propio tramo, y lo mismo pasa con los PCI, los
-- activos viales y los registros de campo: 3.994 filas en total.
--
-- El origen es mío. La migración 0030 reasignó 1.842 registros que habían
-- quedado huérfanos al retirar T-05 y T-06, y los mandó a AQP-02 y TAC-01
-- sin comprobar que sus progresivas cupieran allí. Los rangos declarados
-- vienen de la 0022 y nunca se ajustaron.
--
-- Aquí se hace lo único que se puede hacer con honestidad sin el dato
-- oficial: **cada tramo pasa a declarar el rango que realmente contiene**,
-- redondeado al kilómetro. Es provisional y se nota, porque quedan
-- solapamientos —TAC-01 y AQP-02 se pisan— que solo se resuelven con las
-- progresivas del contrato, que hay que pedirle a Servicon.
--
-- Mientras tanto, el capataz puede volver a registrar su trabajo, que es
-- lo que importa: un parte no anotado no se recupera.
-- ═══════════════════════════════════════════════════════════════════════

with contenido as (
  select t.sid, min(t.desde) as desde, max(t.hasta) as hasta
  from (
    select pi.section_id as sid, pi.prog_start_m as desde, pi.prog_end_m as hasta
      from public.plan_items pi where pi.deleted_at is null
    union all
    select i.section_id, i.prog_start_m, i.prog_end_m
      from public.pci_items i where i.deleted_at is null
    union all
    select w.section_id, w.prog_start_m, w.prog_end_m
      from public.work_entries w where w.deleted_at is null
    union all
    select r.section_id, r.progresiva_m, r.progresiva_m
      from public.road_assets r where r.deleted_at is null
  ) t
  where t.sid is not null and t.desde is not null
  group by t.sid
)
update public.road_sections s
   set prog_start_m = floor(least(c.desde, coalesce(c.hasta, c.desde)) / 1000.0) * 1000,
       prog_end_m   = ceil (greatest(coalesce(c.hasta, c.desde), c.desde) / 1000.0) * 1000,
       updated_at   = now()   -- length_m es columna generada: se recalcula sola
  from contenido c
 where c.sid = s.id
   and s.deleted_at is null;

comment on column public.road_sections.prog_start_m is
  'Progresiva inicial del tramo, en metros. PROVISIONAL: deducida de los datos '
  'cargados, no del contrato. Pendiente de confirmar con Grupo Servicon.';
