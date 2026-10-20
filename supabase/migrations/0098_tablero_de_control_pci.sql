-- ═══════════════════════════════════════════════════════════════════════
-- 0098 · El tablero de control del PCI (Elvis, parte C del cuestionario)
--
-- «Lo importante es que se tenga la data, y el aplicativo ya muestre datos
-- estadísticos y gráficos de control». Su Excel de control (PCI 55) se lee
-- por defecto, sector, encargado, atendido y fotos observadas. Al tablero
-- se le suma:
-- · p_pci: un PCI en particular (todos sus ítems, sin importar el periodo)
-- · por_defecto y por_sector
-- · fotos_observadas: las que COVINCA observó y hay que volver a tomar
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  antes text := pg_get_functiondef('public.pci_tablero(uuid, date, date, integer, uuid, uuid)'::regprocedure);
  despues text := antes;
  cambio record;
begin
  for cambio in select * from (values
    ('p_crew uuid DEFAULT NULL::uuid)',
     'p_crew uuid DEFAULT NULL::uuid, p_pci uuid DEFAULT NULL::uuid)'),
    ('and i.created_at::date between p_from and p_to',
     'and (p_pci is null or i.pci_id = p_pci)
       and (p_pci is not null or i.created_at::date between p_from and p_to)'),
    ('''cumplimiento'', case',
     '''fotos_observadas'', (select count(*) from public.evidences e
                               where e.pci_item_id in (select b.id from base b)
                                 and e.deleted_at is null and e.revision = ''observada''),
        ''cumplimiento'', case'),
    ('''ultimos'', (',
     '''por_defecto'', (
      select coalesce(json_agg(x order by x.total desc), ''[]''::json) from (
        select
          left(regexp_replace(trim(description), ''\s+'', '' '', ''g''), 80)    as defecto,
          count(*)                                                        as total,
          count(*) filter (where status in (''levantado'',''validado''))       as atendidos,
          count(*) filter (where semaforo = ''vencido'')                     as vencidos,
          case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where status in (''levantado'',''validado''))
                          / count(*), 0) end                               as cumplimiento
        from base
        group by 1
        order by 2 desc
        limit 16
      ) x
    ),

    ''por_sector'', (
      select coalesce(json_agg(x order by x.sector), ''[]''::json) from (
        select
          coalesce(s.code, ''Sin sector'')                                  as sector,
          count(*)                                                        as total,
          count(*) filter (where b.status in (''levantado'',''validado''))     as atendidos,
          count(*) filter (where b.semaforo = ''vencido'')                   as vencidos,
          case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where b.status in (''levantado'',''validado''))
                          / count(*), 0) end                               as cumplimiento
        from base b
        left join lateral public.sector_de(b.section_id, b.prog_start_m) s on true
        group by 1
      ) x
    ),

    ''ultimos'', (')
  ) as t(viejo, nuevo) loop
    if position(cambio.viejo in despues) = 0 then
      raise exception 'SIGOV 0098: no se encontró «%»', cambio.viejo;
    end if;
    despues := replace(despues, cambio.viejo, cambio.nuevo);
  end loop;

  drop function public.pci_tablero(uuid, date, date, integer, uuid, uuid);
  execute despues;
end $$;

revoke execute on function public.pci_tablero(uuid, date, date, integer, uuid, uuid, uuid) from anon, public;
grant execute on function public.pci_tablero(uuid, date, date, integer, uuid, uuid, uuid) to authenticated;
