-- ═══════════════════════════════════════════════════════════════════════
-- 0120 · Notificaciones (REV3-OBS-46 a 49)
--
-- 46. Un solo aviso vivo por PCI y persona: el cálculo diario de plazos ya
--     no crea «12 ítems PCI por vencer» cada día; actualiza el mismo aviso
--     (y lo vuelve a no leído solo si empeoró). Cuando ya no hay nada que
--     avisar, queda resuelto, como historial.
-- 47. Cada aviso tiene prioridad (urgente / informativa) según su tipo.
-- 48. Y su categoría (PCI, Programación, SSOMA, Reportes, Otros) para filtrar.
-- 49. El aviso de un ítem abre ese ítem: la dirección lleva «?item=».
-- ═══════════════════════════════════════════════════════════════════════

alter table public.notifications
  add column if not exists resuelta_at timestamptz,
  add column if not exists actualizada_at timestamptz;

alter table public.notifications
  add column if not exists prioridad text generated always as (
    case when type in ('pci_publicado', 'pci_prioritario', 'pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo',
                       'pci_vencido', 'pci_observado', 'ssoma_observado', 'documento_observado', 'foto_observada',
                       'vehiculo_no_habilitado', 'error_sincronizacion', 'partida_impedida', 'parte_observado')
         then 'urgente' else 'informativa' end
  ) stored,
  add column if not exists categoria text generated always as (
    case when type like 'pci%' then 'pci'
         when type like 'programacion%' or type like 'partida%' then 'programacion'
         when type like 'ssoma%' or type like 'documento%' or type like 'vehiculo%' or type like 'equipo%' then 'ssoma'
         when type like 'parte%' or type like 'foto%' or type like 'reporte%' then 'reportes'
         else 'otros' end
  ) stored;

-- El aviso de un ítem PCI abre ese ítem, venga de donde venga
create or replace function public.t_aviso_al_registro()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_pci uuid;
begin
  if new.data ? 'pci_item_id' then
    select pci_id into v_pci from public.pci_items where id = (new.data->>'pci_item_id')::uuid;
    if v_pci is not null then
      new.url := '/pci/' || v_pci || '?item=' || (new.data->>'pci_item_id');
      new.data := new.data || jsonb_build_object('pci_id', v_pci);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_aviso_al_registro on public.notifications;
create trigger t_aviso_al_registro before insert on public.notifications
  for each row execute function public.t_aviso_al_registro();

-- Los repetidos que ya había: queda vivo el más reciente de cada PCI y
-- persona; los demás pasan al historial
update public.notifications n
   set resuelta_at = coalesce(n.read_at, now())
 where n.type in ('pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido')
   and n.resuelta_at is null
   and exists (select 1 from public.notifications m
                where m.profile_id = n.profile_id and m.type in ('pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido')
                  and m.data->>'pci_id' = n.data->>'pci_id' and m.resuelta_at is null
                  and (m.created_at > n.created_at or (m.created_at = n.created_at and m.id > n.id)));

create or replace function public.evaluate_pci_deadlines()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_previo int := 0; v_hoy int := 0; v_critico int := 0;
  v_hoy_peru date := public.hoy_peru();
begin
  create temp table if not exists _avisos_pci (
    service_id uuid, pci_id uuid, code text, profile_id uuid, nivel text,
    cuantos int, primer date, dias_max int
  ) on commit drop;
  delete from _avisos_pci;

  insert into _avisos_pci
  select x.service_id, x.pci_id, x.code, d.profile_id, x.nivel,
         count(*), min(x.due_date), max(v_hoy_peru - x.due_date)
    from (
      select i.service_id, p.id as pci_id, p.code, i.due_date, i.assigned_crew_id, i.assigned_to,
             p.published_at is not null as publicado,
             case
               when v_hoy_peru - i.due_date > coalesce(((public.ajustes_del_servicio(i.service_id)::jsonb)->'pci'->>'tolerancia')::int, 1)
                 then 'critico'
               when i.due_date = v_hoy_peru then 'hoy'
               when i.due_date > v_hoy_peru
                and i.due_date - v_hoy_peru <= coalesce(((public.ajustes_del_servicio(i.service_id)::jsonb)->'alertas'->>'dias_aviso_pci')::int, 2)
                 then 'previo'
             end as nivel
        from public.pci_items i
        join public.pcis p on p.id = i.pci_id and p.deleted_at is null
       where i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
    ) x
    join lateral (
      -- El jefe (o el asignado), solo si el PCI ya se le publicó
      select coalesce(x.assigned_to, c.leader_id) as profile_id
        from public.crews c where c.id = x.assigned_crew_id and x.publicado
      union
      select m.profile_id from public.service_members m
       where m.service_id = x.service_id and m.role in ('admin', 'supervisor', 'residente') and x.nivel in ('hoy', 'critico')
    ) d on d.profile_id is not null
   where x.nivel is not null
   group by x.service_id, x.pci_id, x.code, d.profile_id, x.nivel;

  -- Una persona y un PCI: el nivel más grave del día
  create temp table if not exists _textos_pci (
    service_id uuid, profile_id uuid, pci_id uuid, nivel text, type text, title text, body text, url text, severity text, data jsonb
  ) on commit drop;
  delete from _textos_pci;
  insert into _textos_pci
  select distinct on (a.profile_id, a.pci_id)
         a.service_id, a.profile_id, a.pci_id, a.nivel,
         case a.nivel when 'critico' then 'pci_fuera_de_plazo' when 'hoy' then 'pci_vence_hoy' else 'pci_por_vencer' end,
         case a.nivel
           when 'critico' then format('🔴 ALERTA URGENTE – PCI FUERA DE PLAZO · %s', a.code)
           when 'hoy' then format('%s · %s ítem%s vence%s hoy', a.code, a.cuantos,
                                  case when a.cuantos = 1 then '' else 's' end, case when a.cuantos = 1 then '' else 'n' end)
           else format('%s · %s ítem%s PCI por vencer', a.code, a.cuantos, case when a.cuantos = 1 then '' else 's' end)
         end,
         case a.nivel
           when 'critico' then format('%s ítem%s fuera de plazo; el más atrasado lleva %s día%s.', a.cuantos,
                                      case when a.cuantos = 1 then '' else 's' end, a.dias_max, case when a.dias_max = 1 then '' else 's' end)
           when 'hoy' then 'Atiéndelos hoy: mañana ya están fuera de plazo.'
           else format('El primero vence %s.', case when a.primer = v_hoy_peru + 1 then 'mañana'
                                                    else 'en ' || (a.primer - v_hoy_peru) || ' días' end)
         end,
         '/pci/' || a.pci_id,
         case a.nivel when 'critico' then 'danger' when 'hoy' then 'warning' else 'info' end,
         jsonb_build_object('pci_id', a.pci_id, 'items', a.cuantos, 'nivel', a.nivel)
    from _avisos_pci a
   order by a.profile_id, a.pci_id, case a.nivel when 'critico' then 0 when 'hoy' then 1 else 2 end;

  -- El aviso que ya existe se actualiza; vuelve a «no leído» solo si cambió de nivel
  update public.notifications n
     set type = t.type, title = t.title, body = t.body, url = t.url, severity = t.severity, data = t.data,
         actualizada_at = now(),
         read_at = case when n.data->>'nivel' is distinct from t.nivel then null else n.read_at end,
         pushed_at = case when n.data->>'nivel' is distinct from t.nivel then null else n.pushed_at end
    from _textos_pci t
   where n.profile_id = t.profile_id
     and n.type in ('pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido')
     and n.resuelta_at is null
     and n.data->>'pci_id' = t.pci_id::text;

  insert into public.notifications (service_id, profile_id, type, title, body, url, severity, data)
  select t.service_id, t.profile_id, t.type, t.title, t.body, t.url, t.severity, t.data
    from _textos_pci t
   where not exists (
     select 1 from public.notifications n
      where n.profile_id = t.profile_id
        and n.type in ('pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido')
        and n.resuelta_at is null
        and n.data->>'pci_id' = t.pci_id::text);

  -- Lo que ya no hay que avisar queda resuelto, como historial
  update public.notifications n
     set resuelta_at = now()
   where n.type in ('pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido')
     and n.resuelta_at is null
     and not exists (select 1 from _textos_pci t where t.profile_id = n.profile_id and t.pci_id::text = n.data->>'pci_id');

  select count(*) filter (where nivel = 'previo'), count(*) filter (where nivel = 'hoy'), count(*) filter (where nivel = 'critico')
    into v_previo, v_hoy, v_critico from _avisos_pci;

  return jsonb_build_object('previo', v_previo, 'hoy', v_hoy, 'critico', v_critico, 'evaluated_at', now());
end $$;
