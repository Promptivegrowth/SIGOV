-- ═══════════════════════════════════════════════════════════════════════
-- 0065 · Nadie se da permisos a sí mismo
--
-- La política de perfiles deja que cada usuario edite su propia fila —su
-- nombre, su teléfono—, pero no distinguía columnas: la misma fila guarda
-- el rol y si la cuenta está activa. Con la llave pública de la app, que
-- va dentro de cualquier APK, un capataz o un visor podía escribir
-- role = 'admin' en su perfil y pasar a administrar todos los contratos.
--
-- Y dos cabos sueltos del mismo tema:
-- · un supervisor podía dar el rol «admin» dentro de su contrato;
-- · desactivar a un usuario no le quitaba nada: seguía entrando y viendo.
--
-- Aquí: el rol y el estado de una cuenta solo los cambia un administrador
-- de plataforma (o el servidor, con su llave propia, que hace sus propias
-- comprobaciones); el rol «admin» de un contrato, igual; y una cuenta
-- desactivada deja de ser miembro de nada.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── El perfil: lo personal sí, los permisos no ────────────────────────
create or replace function public.t_perfil_sin_escalada()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Sin usuario es el servidor (la API de usuarios, los scripts): pasa.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Solo un administrador crea perfiles.' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'El rol, el correo y el estado de una cuenta solo los cambia un administrador.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists t_perfil_sin_escalada on public.profiles;
create trigger t_perfil_sin_escalada
  before insert or update on public.profiles
  for each row execute function public.t_perfil_sin_escalada();

-- ─── La membresía: el rol «admin» solo lo da un administrador ─────────
create or replace function public.t_membresia_sin_escalada()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.role = 'admin' then
    raise exception 'Solo un administrador de la plataforma puede dar el rol de administrador.'
      using errcode = '42501';
  end if;

  -- Nadie cambia su propio rol en un contrato
  if tg_op = 'UPDATE' and old.profile_id = auth.uid() and new.role is distinct from old.role then
    raise exception 'No puedes cambiar tu propio rol.' using errcode = '42501';
  end if;

  -- Ni toca la membresía de un administrador
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'admin' then
    raise exception 'La membresía de un administrador solo la cambia otro administrador.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists t_membresia_sin_escalada on public.service_members;
create trigger t_membresia_sin_escalada
  before insert or update or delete on public.service_members
  for each row execute function public.t_membresia_sin_escalada();

-- ─── Una cuenta desactivada no es miembro de nada ─────────────────────
create or replace function public.estoy_activo()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

grant execute on function public.estoy_activo() to authenticated;

create or replace function public.is_member(sid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_platform_admin()
      or (public.estoy_activo()
          and exists (select 1 from public.service_members m
                      where m.service_id = sid and m.profile_id = auth.uid()))
$$;

create or replace function public.role_in(sid uuid)
returns public.user_role language sql stable security definer set search_path to 'public' as $$
  select case when public.is_platform_admin() then 'admin'::public.user_role
    when not public.estoy_activo() then null
    else (select m.role from public.service_members m
          where m.service_id = sid and m.profile_id = auth.uid() limit 1)
  end
$$;

create or replace function public.mis_servicios()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select m.service_id
  from public.service_members m
  where m.profile_id = auth.uid()
    and public.estoy_activo()
$$;

create or replace function public.my_service_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select s.id from public.services s
    where s.deleted_at is null and public.is_platform_admin()
  union
  select m.service_id from public.service_members m
    where m.profile_id = auth.uid() and public.estoy_activo()
$$;

-- ─── Y todo esto, a la auditoría ───────────────────────────────────────
-- profiles y service_members ya tienen su trigger de auditoría (0008).
