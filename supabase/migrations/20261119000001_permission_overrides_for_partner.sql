-- Permission overrides must win over the partner read-only hard block.
--
-- Bug: a patabin_partner with a per-user override (e.g. sales=true set from
-- the users page) still hit PARTNER_READ_ONLY, because assert_writeable()
-- raised before the permission check and every module policy required
-- can_write(), which excludes partners outright. The users page shows the
-- toggles as effective (my_permissions() honours overrides), so the UI said
-- "you may write" while the DB refused.
--
-- Fix: the per-module permission check (has_permission) is the authority for
-- both partners and regular roles. assert_writeable(p_perm) only hard-blocks
-- demo_admin and the p_perm-less form; can_write() keeps excluding partners
-- for legacy policy pairs (partners table, self profile update) but the
-- module tables move to has_permission() with can_write() OR'd in for
-- non-partners. Demo admin stays read-only unconditionally.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

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
  -- demo admin: hard read-only, overrides never apply
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_demo_admin') then
    raise exception 'DEMO_READ_ONLY';
  end if;
  -- no module key: legacy strict form, partners stay blocked
  if p_perm is null then
    if exists (select 1 from public.profiles where id = auth.uid() and role = 'patabin_partner') then
      raise exception 'PARTNER_READ_ONLY';
    end if;
    return;
  end if;
  -- module form: the permission (override or role default) decides.
  if not coalesce(public.has_permission(p_perm), false) then
    raise exception 'PERMISSION_DENIED';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: module tables gate on has_permission; non-partner non-demo role check
-- folded into has_permission (role defaults are empty for partner), so the
-- policy is simply: active user with password set and permission granted.
-- ---------------------------------------------------------------------------

drop policy if exists chalans_write on public.chalans;
create policy chalans_write on public.chalans for insert to authenticated
  with check (has_permission('chalans'));
drop policy if exists chalans_update on public.chalans;
create policy chalans_update on public.chalans for update to authenticated
  using (has_permission('chalans')) with check (has_permission('chalans'));

drop policy if exists purchases_write on public.chalan_purchases;
create policy purchases_write on public.chalan_purchases for insert to authenticated
  with check (has_permission('chalans'));
drop policy if exists purchases_update on public.chalan_purchases;
create policy purchases_update on public.chalan_purchases for update to authenticated
  using (has_permission('chalans')) with check (has_permission('chalans'));

drop policy if exists packets_write on public.packets;
create policy packets_write on public.packets for insert to authenticated
  with check (has_permission('packets'));
drop policy if exists packets_update on public.packets;
create policy packets_update on public.packets for update to authenticated
  using (has_permission('packets')) with check (has_permission('packets'));

drop policy if exists personal_write on public.personal_uses;
create policy personal_write on public.personal_uses for insert to authenticated
  with check (has_permission('personal_use'));
drop policy if exists personal_update on public.personal_uses;
create policy personal_update on public.personal_uses for update to authenticated
  using (has_permission('personal_use')) with check (has_permission('personal_use'));

drop policy if exists adjustments_write on public.stock_adjustments;
create policy adjustments_write on public.stock_adjustments for insert to authenticated
  with check (has_permission('adjustments'));
drop policy if exists adjustments_update on public.stock_adjustments;
create policy adjustments_update on public.stock_adjustments for update to authenticated
  using (has_permission('adjustments')) with check (has_permission('adjustments'));

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for insert to authenticated
  with check (has_permission('expenses'));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (has_permission('expenses')) with check (has_permission('expenses'));

drop policy if exists wallets_write on public.wallets;
create policy wallets_write on public.wallets for insert to authenticated
  with check (has_permission('wallets'));
drop policy if exists wallets_update on public.wallets;
create policy wallets_update on public.wallets for update to authenticated
  using (has_permission('wallets')) with check (has_permission('wallets'));

drop policy if exists transfers_write on public.wallet_transfers;
create policy transfers_write on public.wallet_transfers for insert to authenticated
  with check (has_permission('wallets'));
drop policy if exists transfers_update on public.wallet_transfers;
create policy transfers_update on public.wallet_transfers for update to authenticated
  using (has_permission('wallets')) with check (has_permission('wallets'));

drop policy if exists withdrawals_write on public.withdrawals;
create policy withdrawals_write on public.withdrawals for insert to authenticated
  with check (has_permission('wallets'));
drop policy if exists withdrawals_update on public.withdrawals;
create policy withdrawals_update on public.withdrawals for update to authenticated
  using (has_permission('wallets')) with check (has_permission('wallets'));

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for insert to authenticated
  with check (has_permission('customers'));
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (has_permission('customers')) with check (has_permission('customers'));

drop policy if exists payments_write on public.customer_payments;
create policy payments_write on public.customer_payments for insert to authenticated
  with check (has_permission('customers'));
drop policy if exists payments_update on public.customer_payments;
create policy payments_update on public.customer_payments for update to authenticated
  using (has_permission('customers')) with check (has_permission('customers'));

-- ---------------------------------------------------------------------------
-- Re-verify: nothing else needed for the RPCs; they all call the new
-- assert_writeable(text) body above.
-- ---------------------------------------------------------------------------

grant execute on function public.can_write() to authenticated;
grant execute on function public.assert_writeable(text) to authenticated;
