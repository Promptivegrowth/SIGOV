-- 0167 · Alertas del sistema (A09, repaso 18/11 p.23): programación duplicada o con cruce, datos inconsistentes, y área/origen para filtrar.
CREATE OR REPLACE FUNCTION public.alertas_sistema(p_service uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with a as (
    select 'sync:' || s.profile_id || ':' || s.device_id clave, 'critica' severidad, 'Sincronización fallida' titulo,
           format('El equipo de %s no pudo enviar %s registros.', p.full_name, s.failed_count) descripcion, s.finished_at cuando, 'Sincronización' tipo,
           coalesce(s.device_label, s.device_id) referencia, 'Reintentar' accion, '/sincronizacion' url
      from (select distinct on (profile_id, device_id) * from public.sync_sessions where service_id = p_service
              and started_at > now() - make_interval(hours => public.alerta_regla(p_service, 'sync', 'horas', '48')::int)
             order by profile_id, device_id, started_at desc) s join public.profiles p on p.id = s.profile_id
     where s.failed_count > 0 and public.alerta_regla(p_service, 'sync', 'activo', 'true')::boolean
    union all
    select 'conf:' || k.id, 'critica', 'Conflicto de sincronización', format('%s: versión local %s frente a servidor %s; no se sobrescribió.', coalesce(k.referencia, 'Avance'), k.version_local, k.version_servidor),
           k.carga_at, 'Sincronización', coalesce(k.referencia, ''), 'Comparar versiones', '/sincronizacion'
      from public.sync_conflictos k where k.service_id = p_service and k.estado = 'abierto' and public.alerta_regla(p_service, 'sync', 'activo', 'true')::boolean
    union all
    select 'bloq:' || u.id, 'critica', 'Usuario bloqueado', format('%s superó el número de intentos de acceso y fue bloqueado.', p.full_name),
           (select max(cuando) from public.accesos x where x.profile_id = u.id and x.evento = 'bloqueado'), 'Usuario', split_part(p.email, '@', 1), 'Desbloquear', '/gestion/usuarios'
      from auth.users u join public.profiles p on p.id = u.id join public.service_members m on m.profile_id = u.id and m.service_id = p_service
     where u.banned_until > now() and p.is_active
    union all
    select 'caja:' || b.id, 'critica', 'Saldo bajo en caja presupuestal', format('La caja %s tiene saldo S/ %s, bajo el umbral S/ %s.', b.name, round(b.balance, 2), b.low_balance_threshold),
           b.last_movement_on::timestamptz, 'Presupuesto', b.name, 'Escalar', '/caja'
      from public.v_cash_boxes b where b.service_id = p_service and b.is_active and b.low_balance_threshold is not null and b.balance < b.low_balance_threshold
       and public.alerta_regla(p_service, 'caja', 'activo', 'true')::boolean
    union all
    select 'sup:' || c.id, 'pendiente', 'Cuadrilla sin supervisor asignado', format('La cuadrilla %s no tiene supervisor asignado.', c.name), c.updated_at, 'Cuadrilla', c.code, 'Asignar', '/gestion/cuadrillas'
      from public.crews c where c.service_id = p_service and c.deleted_at is null and c.is_active and c.supervisor_id is null
    union all
    select 'pci:venc', 'pendiente', 'Ítems PCI vencidos', format('Existen %s ítems del PCI con fecha de vencimiento superada.', count(*)), max(i.due_date)::timestamptz, 'PCI', count(*) || ' ítems', 'Actualizar', '/pci'
      from public.pci_items i where i.service_id = p_service and i.deleted_at is null and i.due_date < public.hoy_peru() and i.status in ('pendiente', 'en_atencion', 'observado')
       and public.alerta_regla(p_service, 'pci', 'activo', 'true')::boolean
    having count(*) > 0
    union all
    -- Por vencer: un aviso agrupado por PCI con la anticipación configurada
    select 'pci:porvencer:' || p.id, 'pendiente', 'Ítems PCI por vencer', format('%s ítems del %s vencen en los próximos %s días.', count(*), p.code, public.alerta_regla(p_service, 'pci', 'anticipacion', '2')),
           min(i.due_date)::timestamptz, 'PCI', p.code, 'Revisar', '/pci/' || p.id
      from public.pci_items i join public.pcis p on p.id = i.pci_id
     where i.service_id = p_service and i.deleted_at is null and i.status in ('pendiente', 'en_atencion', 'observado')
       and i.due_date between public.hoy_peru() and public.hoy_peru() + public.alerta_regla(p_service, 'pci', 'anticipacion', '2')::int
       and public.alerta_regla(p_service, 'pci', 'activo', 'true')::boolean
     group by p.id, p.code
    union all
    select 'ev:' || i.id, 'pendiente', 'Evidencia incompleta', format('El ítem %s del %s no cuenta con las tres fases de foto.', i.item_number, p.code), i.updated_at, 'Actividad',
           p.code || ' / ítem ' || i.item_number, 'Completar', '/pci/' || i.pci_id || '/item/' || i.id
      from public.pci_items i join public.pcis p on p.id = i.pci_id
     where i.service_id = p_service and i.deleted_at is null and i.status in ('levantado', 'subsanado') and cardinality(public.pci_item_fases_faltantes(i.id)) > 0
       and public.alerta_regla(p_service, 'evidencia', 'activo', 'true')::boolean
    union all
    select 'mant:' || v.id, 'informativa', 'Mantenimiento pendiente de vehículo', format('El vehículo %s tiene mantenimiento preventivo el %s.', coalesce(v.code, v.plate), to_char(v.next_service_on, 'DD/MM/YYYY')),
           v.next_service_on::timestamptz, 'Vehículo', coalesce(v.code, v.plate), 'Programar', '/recursos'
      from public.vehicles v where v.service_id = p_service and v.deleted_at is null
       and v.next_service_on between public.hoy_peru() - 30 and public.hoy_peru() + public.alerta_regla(p_service, 'mantenimiento', 'anticipacion', '7')::int
       and public.alerta_regla(p_service, 'mantenimiento', 'activo', 'true')::boolean
    union all
    select 'meq:' || e.id, 'informativa', 'Mantenimiento de equipo', format('El equipo %s (%s) tiene mantenimiento el %s.', e.codigo, e.nombre, to_char(e.mantenimiento_on, 'DD/MM/YYYY')),
           e.mantenimiento_on::timestamptz, 'Equipo', e.codigo, 'Programar', '/recursos?tab=equipos'
      from public.equipos e where e.service_id = p_service and e.deleted_at is null
       and e.mantenimiento_on between public.hoy_peru() - 30 and public.hoy_peru() + public.alerta_regla(p_service, 'mantenimiento', 'anticipacion', '7')::int
       and public.alerta_regla(p_service, 'mantenimiento', 'activo', 'true')::boolean
    union all
    select 'rend:' || b.id, 'informativa', 'Ausencia de rendición', format('La caja %s tiene %s gastos de más de %s días sin rendición.', b.name, count(*), public.alerta_regla(p_service, 'rendicion', 'dias', '7')), min(m.occurred_on)::timestamptz,
           'Rendición', b.name, 'Registrar', '/caja?tab=rendiciones'
      from public.cash_movements m join public.cash_boxes b on b.id = m.cash_box_id
     where m.service_id = p_service and m.deleted_at is null and m.kind = 'gasto' and m.rendicion_id is null and m.status = 'registrado'
       and m.occurred_on < public.hoy_peru() - public.alerta_regla(p_service, 'rendicion', 'dias', '7')::int
       and public.alerta_regla(p_service, 'rendicion', 'activo', 'true')::boolean
     group by b.id, b.name
    union all
    -- Programación duplicada: misma cuadrilla, día, partida y progresiva más de una vez
    select 'dup:' || x.crew_id || ':' || x.scheduled_on || ':' || x.activity_id || ':' || coalesce(x.prog_start_m::text, ''), 'pendiente', 'Programación duplicada',
           format('%s programó %s veces «%s» el %s en %s.', x.crew, x.n, x.actividad, to_char(x.scheduled_on, 'DD/MM/YYYY'), coalesce(x.prog, 'la misma progresiva')),
           x.scheduled_on::timestamptz, 'Programación', x.crew_code || ' · ' || to_char(x.scheduled_on, 'DD/MM'), 'Revisar', '/programacion?fecha=' || x.scheduled_on
      from (select i.crew_id, i.scheduled_on, i.activity_id, i.prog_start_m, c.name crew, c.code crew_code, a.name actividad, count(*) n,
                   max(round(i.prog_start_m)::text) prog
              from public.plan_items i join public.crews c on c.id = i.crew_id join public.activities_catalog a on a.id = i.activity_id
             where i.service_id = p_service and i.deleted_at is null and i.status <> 'cancelado' and i.scheduled_on >= public.hoy_peru() - 7
             group by i.crew_id, i.scheduled_on, i.activity_id, i.prog_start_m, c.name, c.code, a.name having count(*) > 1) x
     where public.alerta_regla(p_service, 'programacion', 'activo', 'true')::boolean
    union all
    -- Cruce: dos cuadrillas el mismo día en tramos de progresiva que se superponen
    select 'cruce:' || least(a.id, b.id) || ':' || greatest(a.id, b.id), 'pendiente', 'Programación con cruce',
           format('%s y %s trabajan el %s en progresivas que se cruzan (%s).', ca.name, cb.name, to_char(a.scheduled_on, 'DD/MM/YYYY'), coalesce(a.section_code, 'mismo tramo')),
           a.scheduled_on::timestamptz, 'Programación', ca.code || ' / ' || cb.code, 'Revisar', '/programacion?fecha=' || a.scheduled_on
      from public.v_plan_items a
      join public.v_plan_items b on b.service_id = a.service_id and b.scheduled_on = a.scheduled_on and b.section_id = a.section_id
                                and a.id < b.id and a.crew_id <> b.crew_id
                                and a.prog_start_m <= coalesce(b.prog_end_m, b.prog_start_m) and b.prog_start_m <= coalesce(a.prog_end_m, a.prog_start_m)
      join public.crews ca on ca.id = a.crew_id join public.crews cb on cb.id = b.crew_id
     where a.service_id = p_service and a.status <> 'cancelado' and b.status <> 'cancelado' and a.scheduled_on >= public.hoy_peru() - 7
       and public.alerta_regla(p_service, 'programacion', 'activo', 'true')::boolean
    union all
    -- Datos inconsistentes: registros que contradicen sus propias reglas
    select 'inc:' || x.k, 'pendiente', 'Datos inconsistentes', x.t, now(), 'Datos', x.ref, 'Corregir', x.url
      from (
        select 'prog' k, format('%s partidas programadas con progresiva final menor que la inicial.', count(*)) t, count(*) || ' partidas' ref, '/programacion' url
          from public.plan_items i where i.service_id = p_service and i.deleted_at is null and i.prog_end_m < i.prog_start_m having count(*) > 0
        union all
        select 'parte_vacio', format('%s reportes enviados sin actividades.', count(*)), count(*) || ' reportes', '/campo'
          from public.work_orders w where w.service_id = p_service and w.deleted_at is null and w.status in ('enviado', 'validado')
           and not exists (select 1 from public.work_entries e where e.work_order_id = w.id and e.deleted_at is null) having count(*) > 0
        union all
        select 'caja_negativa', format('%s cajas con saldo negativo.', count(*)), string_agg(b.name, ', '), '/caja'
          from public.v_cash_boxes b where b.service_id = p_service and b.is_active and b.balance < 0 having count(*) > 0
        union all
        select 'jefe_doble', format('%s jefes lideran más de una cuadrilla.', count(*)), count(*) || ' jefes', '/gestion/cuadrillas'
          from (select leader_id from public.crews where service_id = p_service and deleted_at is null and leader_id is not null group by leader_id having count(*) > 1) y having count(*) > 0
      ) x
     where public.alerta_regla(p_service, 'datos', 'activo', 'true')::boolean
  )
  select coalesce(json_agg(json_build_object('clave', a.clave, 'severidad', case when t.clave is not null then 'resuelta' else a.severidad end, 'titulo', a.titulo,
           'descripcion', a.descripcion, 'cuando', a.cuando, 'tipo', a.tipo, 'referencia', a.referencia, 'accion', a.accion, 'url', a.url,
           'atendida_at', t.cuando,
           'area', case when a.tipo in ('PCI', 'Actividad', 'Programación') then 'Operación' when a.tipo = 'Sincronización' then 'Sincronización'
                        when a.tipo in ('Vehículo', 'Equipo') then 'Recursos' when a.tipo = 'Datos' then 'Datos' else 'Administración' end,
           'origen', case when a.tipo in ('PCI', 'Actividad', 'Programación') then 'Supervisor' when a.tipo = 'Sincronización' then 'Jefe de cuadrilla (app)'
                          when a.tipo in ('Vehículo', 'Equipo') then 'SSOMA / Administración' when a.tipo = 'Datos' then 'Sistema' else 'Administrador' end) order by (t.clave is not null), case a.severidad when 'critica' then 0 when 'pendiente' then 1 else 2 end, a.cuando desc nulls last), '[]'::json)
    from a left join public.alertas_atendidas t on t.service_id = p_service and t.clave = a.clave
   where public.es_admin(p_service)
$function$;

notify pgrst, 'reload schema';
