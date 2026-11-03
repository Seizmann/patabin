-- patabin_partner (Investor): read-only enforcement.
--
-- Two write channels exist:
--   1. Direct table writes -> guarded by RLS write policies (rewritten below
--      to use the new can_write() helper).
--   2. security definer RPCs (bypass RLS) -> all of them already call
--      public.assert_writeable(); that helper gains the partner check, so
--      every write RPC is blocked centrally without touching each body.
--
-- complete_password_change() deliberately does NOT call assert_writeable(),
-- so partner accounts can still change their own temp password.

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and not must_change_password
      and role <> 'patabin_partner'
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
end $$;

grant execute on function public.can_write() to authenticated;
grant execute on function public.assert_writeable() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS write policies: switch from (is_active_user() and password_gate()) to
-- can_write(), which additionally excludes patabin_partner.
-- Read policies and the su_admin-only policies (settings_update,
-- categories_write, categories_delete) are untouched.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists partners_insert on public.partners;
create policy partners_insert on public.partners for insert to authenticated
  with check (can_write());
drop policy if exists partners_update on public.partners;
create policy partners_update on public.partners for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists wallets_write on public.wallets;
create policy wallets_write on public.wallets for insert to authenticated
  with check (can_write());
drop policy if exists wallets_update on public.wallets;
create policy wallets_update on public.wallets for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists chalans_write on public.chalans;
create policy chalans_write on public.chalans for insert to authenticated
  with check (can_write());
drop policy if exists chalans_update on public.chalans;
create policy chalans_update on public.chalans for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists purchases_write on public.chalan_purchases;
create policy purchases_write on public.chalan_purchases for insert to authenticated
  with check (can_write());
drop policy if exists purchases_update on public.chalan_purchases;
create policy purchases_update on public.chalan_purchases for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists packets_write on public.packets;
create policy packets_write on public.packets for insert to authenticated
  with check (can_write());
drop policy if exists packets_update on public.packets;
create policy packets_update on public.packets for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists personal_write on public.personal_uses;
create policy personal_write on public.personal_uses for insert to authenticated
  with check (can_write());
drop policy if exists personal_update on public.personal_uses;
create policy personal_update on public.personal_uses for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists adjustments_write on public.stock_adjustments;
create policy adjustments_write on public.stock_adjustments for insert to authenticated
  with check (can_write());
drop policy if exists adjustments_update on public.stock_adjustments;
create policy adjustments_update on public.stock_adjustments for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for insert to authenticated
  with check (can_write());
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists withdrawals_write on public.withdrawals;
create policy withdrawals_write on public.withdrawals for insert to authenticated
  with check (can_write());
drop policy if exists withdrawals_update on public.withdrawals;
create policy withdrawals_update on public.withdrawals for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists transfers_write on public.wallet_transfers;
create policy transfers_write on public.wallet_transfers for insert to authenticated
  with check (can_write());
drop policy if exists transfers_update on public.wallet_transfers;
create policy transfers_update on public.wallet_transfers for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for insert to authenticated
  with check (can_write());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (can_write()) with check (can_write());

drop policy if exists payments_write on public.customer_payments;
create policy payments_write on public.customer_payments for insert to authenticated
  with check (can_write());
drop policy if exists payments_update on public.customer_payments;
create policy payments_update on public.customer_payments for update to authenticated
  using (can_write()) with check (can_write());
