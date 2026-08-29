-- ═══════════════════════════════════════════════════════════════════════════
-- SIGOV · SEED 0100 · Usuarios demo (acceso rápido en login)
-- Contraseña única: Sigov2026!
-- UUIDs fijos → el seed es idempotente y re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  u record;
  v_pass text := 'Sigov2026!';
  usuarios jsonb := '[
    {"id":"a0000000-0000-4000-8000-000000000001","email":"admin@sigov.dev",      "name":"Luis Bravo Camus",       "role":"admin",         "pos":"Director de Operaciones"},
    {"id":"a0000000-0000-4000-8000-000000000002","email":"supervisor@sigov.dev", "name":"Elvis Dueñas Cabrera",   "role":"supervisor",    "pos":"Coordinador de Contrato"},
    {"id":"a0000000-0000-4000-8000-000000000003","email":"cuadrilla1@sigov.dev", "name":"Marco Quispe Ramos",     "role":"jefe_cuadrilla","pos":"Jefe de Cuadrilla A"},
    {"id":"a0000000-0000-4000-8000-000000000004","email":"cuadrilla2@sigov.dev", "name":"Rosa Huamán Ticona",     "role":"jefe_cuadrilla","pos":"Jefe de Cuadrilla B"},
    {"id":"a0000000-0000-4000-8000-000000000005","email":"ssoma@sigov.dev",      "name":"Paola Ríos Mendoza",     "role":"ing_seguridad", "pos":"Ing. de Seguridad y Salud"},
    {"id":"a0000000-0000-4000-8000-000000000006","email":"visor@sigov.dev",      "name":"Supervisión OSITRAN",    "role":"visor",         "pos":"Visor externo"},
    {"id":"a0000000-0000-4000-8000-000000000007","email":"cuadrilla3@sigov.dev", "name":"Julio Cárdenas Vega",    "role":"jefe_cuadrilla","pos":"Jefe de Cuadrilla C"},
    {"id":"a0000000-0000-4000-8000-000000000008","email":"cuadrilla4@sigov.dev", "name":"Nélida Sánchez Poma",    "role":"jefe_cuadrilla","pos":"Jefe de Cuadrilla D"}
  ]'::jsonb;
begin
  for u in select * from jsonb_to_recordset(usuarios)
      as x(id uuid, email text, name text, role text, pos text)
  loop
    -- auth.users
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt(v_pass, extensions.gen_salt('bf')),
      now(), null, null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.name, 'role', u.role, 'is_demo', true),
      now() - interval '60 days', now(), '', '', '', ''
    )
    on conflict (id) do update
      set encrypted_password = excluded.encrypted_password,
          raw_user_meta_data = excluded.raw_user_meta_data,
          email_confirmed_at = excluded.email_confirmed_at;

    -- auth.identities (necesario para login con email/password)
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;

    -- profiles (el trigger ya lo crea; aquí completamos datos)
    insert into public.profiles (id, full_name, email, role, position, is_demo, is_active)
    values (u.id, u.name, u.email, u.role::user_role, u.pos, true, true)
    on conflict (id) do update
      set full_name = excluded.full_name,
          role = excluded.role,
          position = excluded.position,
          is_demo = true,
          is_active = true;
  end loop;
end $$;

-- Teléfonos y DNI para que la ficha se vea completa
update public.profiles set phone = '+51 9' || lpad((abs(hashtext(email)) % 100000000)::text, 8, '0'),
                           dni = lpad((abs(hashtext(email)) % 90000000 + 10000000)::text, 8, '0')
 where is_demo and (phone is null or dni is null);

select count(*) as usuarios_demo from public.profiles where is_demo;
