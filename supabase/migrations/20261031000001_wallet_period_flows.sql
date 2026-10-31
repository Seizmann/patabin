-- per-wallet money flow inside a period (used by dashboard wallet tiles)
create or replace function public.wallet_flows(p_start timestamptz, p_end timestamptz)
returns table (wallet_id uuid, type text, name text, label text, is_active boolean, amount numeric)
language sql security definer set search_path = public
as $$
  select
    w.id,
    w.type,
    w.name,
    w.label,
    w.is_active,
    coalesce((select sum(sr.amount) from public.sale_receives sr join public.sales s on s.id = sr.sale_id
      where sr.wallet_account_id = w.id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end), 0)
    + coalesce((select sum(p.amount) from public.customer_payments p
      where p.wallet_account_id = w.id and p.deleted_at is null and p.at >= p_start and p.at < p_end), 0)
    - coalesce((select sum(e.amount) from public.expenses e
      where e.wallet_account_id = w.id and e.deleted_at is null and e.spent_at >= p_start and e.spent_at < p_end), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd
      where wd.wallet_account_id = w.id and wd.deleted_at is null and wd.at >= p_start and wd.at < p_end), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t
      where t.from_wallet_id = w.id and t.deleted_at is null and t.at >= p_start and t.at < p_end), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t
      where t.to_wallet_id = w.id and t.deleted_at is null and t.at >= p_start and t.at < p_end), 0) as amount
  from public.wallets w
  where w.type = 'cash' or w.is_active
  order by w.type, w.created_at;
$$;

grant execute on function public.wallet_flows(timestamptz, timestamptz) to authenticated;
