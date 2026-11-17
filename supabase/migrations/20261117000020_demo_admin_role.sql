-- patabin_demo_admin: public-facing demo account. Read-only + the client
-- serves dummy data; every real write is rejected at the DB level here and at
-- the data-access layer in the app.

alter type public.user_role add value 'patabin_demo_admin';

-- can_write()/assert_writeable() gain the demo check, mirroring
-- patabin_partner (every write RPC calls assert_writeable, every RLS write
-- policy uses can_write()).

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and not must_change_password
      and role <> 'patabin_partner'
      and role <> 'patabin_demo_admin'
  );
$$;

create or replace function public.assert_writeable() returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  if not coalesce(public.password_gate(), false) then
    raise exception 'CHANGE_PASSWORD_REQUIRED';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_partner') then
    raise exception 'PARTNER_READ_ONLY';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_demo_admin') then
    raise exception 'DEMO_READ_ONLY';
  end if;
end $$;

create or replace function public.assert_writeable(p_perm text default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  if not coalesce(public.password_gate(), false) then
    raise exception 'CHANGE_PASSWORD_REQUIRED';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_partner') then
    raise exception 'PARTNER_READ_ONLY';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_demo_admin') then
    raise exception 'DEMO_READ_ONLY';
  end if;
  if p_perm is not null and not coalesce(public.has_permission(p_perm), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
end $$;

grant execute on function public.can_write() to authenticated;
grant execute on function public.assert_writeable() to authenticated;
grant execute on function public.assert_writeable(text) to authenticated;
