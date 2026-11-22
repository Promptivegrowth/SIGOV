-- ═══════════════════════════════════════════════════════════════════════════
-- 0147 · App: ítems de apoyo temporal para el jefe (revisión visual, T9)
--
-- La app del jefe pide sus ítems por cuadrilla; los de un apoyo vigente
-- (otra cuadrilla titular) se piden aparte con esta lista. Caduca sola.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.apoyo_items_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select x from public.apoyo_items_activos() x
$$;
revoke all on function public.apoyo_items_ids() from public, anon;
grant execute on function public.apoyo_items_ids() to authenticated;
