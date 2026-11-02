-- Withdrawal guards: block over-withdraw and block withdrawals while any chalan is open.
-- Also fixes v_partner_balance row multiplication from multiple chalan close snapshots.

create or replace view public.v_partner_balance with (security_invoker = true) as
with live as (
  select s.partner_id, sum(s.entitlement) as amount
  from public.v_partner_chalan_settlement s
  join public.chalans c on c.id = s.chalan_id
  where c.status = 'open' and c.deleted_at is null
  group by s.partner_id
), closed as (
  select (el.value ->> 'partner_id')::uuid as partner_id,
         sum((el.value ->> 'entitlement')::numeric(12,2)) as amount
  from public.chalan_close_snapshots cs
  join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
  cross join lateral jsonb_array_elements(cs.data -> 'partners') el(value)
  group by 1
), charges as (
  select wallet_transfers.attributed_to_partner_id as partner_id, sum(wallet_transfers.charge) as amount
  from public.wallet_transfers
  where wallet_transfers.deleted_at is null
  group by 1
), unlinked_exp as (
  select expenses.attributed_to_partner_id as partner_id, sum(expenses.amount) as amount
  from public.expenses
  where expenses.deleted_at is null and expenses.chalan_id is null
  group by 1
), unlinked_pocket as (
  select expenses.paid_by_partner_id as partner_id, sum(expenses.amount) as amount
  from public.expenses
  where expenses.deleted_at is null and expenses.chalan_id is null and expenses.wallet_account_id is null
  group by 1
), taken as (
  select withdrawals.partner_id, sum(withdrawals.amount) as amount
  from public.withdrawals
  where withdrawals.deleted_at is null
  group by 1
)
select p.id as partner_id,
  p.name as partner_name,
  coalesce(li.amount, 0) + coalesce(cl.amount, 0) - coalesce(ch.amount, 0) - coalesce(ux.amount, 0) + coalesce(uxp.amount, 0) - coalesce(tk.amount, 0) as balance,
  coalesce(li.amount, 0) as balance_open,
  coalesce(cl.amount, 0) as balance_closed
from public.partners p
left join live li on li.partner_id = p.id
left join closed cl on cl.partner_id = p.id
left join charges ch on ch.partner_id = p.id
left join unlinked_exp ux on ux.partner_id = p.id
left join unlinked_pocket uxp on uxp.partner_id = p.id
left join taken tk on tk.partner_id = p.id;

grant select on public.v_partner_balance to authenticated;

create or replace function public.create_withdrawal(p_w jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_wallet uuid := (p_w ->> 'wallet_account_id')::uuid;
  v_partner uuid := (p_w ->> 'partner_id')::uuid;
  v_amount numeric := (p_w ->> 'amount')::numeric;
  v_balance numeric(12,2);
begin
  perform public.assert_writeable();
  if v_amount is null or v_amount <= 0
    or not exists (select 1 from public.partners where id = v_partner and deleted_at is null)
    or not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'WITHDRAWAL_INVALID';
  end if;

  if exists (select 1 from public.chalans where status = 'open' and deleted_at is null) then
    raise exception 'WITHDRAWAL_CHALAN_OPEN';
  end if;

  select coalesce(li.amount, 0) + coalesce(cl.amount, 0) - coalesce(ch.amount, 0)
         - coalesce(ux.amount, 0) + coalesce(uxp.amount, 0) - coalesce(tk.amount, 0)
  into v_balance
  from public.partners p
  left join (select s.partner_id, sum(s.entitlement) as amount
             from public.v_partner_chalan_settlement s
             join public.chalans c on c.id = s.chalan_id
             where c.status = 'open' and c.deleted_at is null
             group by s.partner_id) li on li.partner_id = v_partner
  left join (select (el.value ->> 'partner_id')::uuid as partner_id,
                    sum((el.value ->> 'entitlement')::numeric(12,2)) as amount
             from public.chalan_close_snapshots cs
             join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
             cross join lateral jsonb_array_elements(cs.data -> 'partners') el(value)
             group by 1) cl on cl.partner_id = v_partner
  left join (select wallet_transfers.attributed_to_partner_id as partner_id, sum(wallet_transfers.charge) as amount
             from public.wallet_transfers where wallet_transfers.deleted_at is null group by 1) ch on ch.partner_id = v_partner
  left join (select expenses.attributed_to_partner_id as partner_id, sum(expenses.amount) as amount
             from public.expenses where expenses.deleted_at is null and expenses.chalan_id is null group by 1) ux on ux.partner_id = v_partner
  left join (select expenses.paid_by_partner_id as partner_id, sum(expenses.amount) as amount
             from public.expenses where expenses.deleted_at is null and expenses.chalan_id is null and expenses.wallet_account_id is null group by 1) uxp on uxp.partner_id = v_partner
  left join (select withdrawals.partner_id, sum(withdrawals.amount) as amount
             from public.withdrawals where withdrawals.deleted_at is null group by 1) tk on tk.partner_id = v_partner
  where p.id = v_partner;

  if v_amount > coalesce(v_balance, 0) then
    raise exception 'WITHDRAWAL_EXCEEDS_BALANCE';
  end if;

  insert into public.withdrawals (at, partner_id, wallet_account_id, amount, note, created_by)
  values (
    coalesce((p_w ->> 'at')::timestamptz, now()),
    v_partner,
    v_wallet,
    v_amount,
    nullif(p_w ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;
