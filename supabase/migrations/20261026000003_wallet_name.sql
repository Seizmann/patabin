alter table public.wallets add column if not exists name text not null default '';
update public.wallets set name = label where name = '';

drop view if exists public.v_wallet_balance;

create or replace view public.v_wallet_balance with (security_invoker = true) as
select
  w.id as wallet_id,
  w.type,
  w.name,
  w.label,
  w.is_active,
  coalesce((select sum(s.amount_received) from public.sales s where s.wallet_account_id = w.id and s.deleted_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.wallet_account_id = w.id and e.deleted_at is null), 0)
    - coalesce((select sum(wd.amount) from public.withdrawals wd where wd.wallet_account_id = w.id and wd.deleted_at is null), 0)
    - coalesce((select sum(t.amount) from public.wallet_transfers t where t.from_wallet_id = w.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount - t.charge) from public.wallet_transfers t where t.to_wallet_id = w.id and t.deleted_at is null), 0) as balance
from public.wallets w
where w.type = 'cash' or w.is_active
order by w.type, w.created_at;

drop view if exists public.v_sales_enriched;

create or replace view public.v_sales_enriched with (security_invoker = true) as
select
  s.id,
  s.sold_at,
  s.qty,
  s.list_unit_price,
  s.amount_received,
  s.discount,
  s.discount * 100.0 / nullif(s.qty * s.list_unit_price, 0) as discount_pct,
  s.customer_id,
  cu.name as customer_name,
  cu.phone as customer_phone,
  s.wallet_account_id,
  w.type as wallet_type,
  w.name as wallet_name,
  w.label as wallet_label,
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct c.code || '/' || pk.code, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.chalans c on c.id = pk.chalan_id where sa.sale_id = s.id), '') as packet_codes,
  coalesce((select string_agg(distinct p.name, ', ') from public.sale_allocations sa join public.packets pk on pk.id = sa.packet_id join public.partners p on p.id = pk.owner_partner_id where sa.sale_id = s.id), '') as owner_names
from public.sales s
join public.wallets w on w.id = s.wallet_account_id
left join public.customers cu on cu.id = s.customer_id
where s.deleted_at is null;

create or replace function public.income_by_period_breakdown(p_start timestamptz, p_end timestamptz)
returns table (
  slice text,
  amount numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(w.type, 'unknown') || '|' || coalesce(w.name, '') as slice, coalesce(sum(s.amount_received), 0) as amount
  from public.sales s
  join public.wallets w on w.id = s.wallet_account_id
  where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end
  group by coalesce(w.type, 'unknown'), coalesce(w.name, '')
  union all
  select 'personal' as slice, coalesce(sum(pu.qty * pu.unit_value), 0) as amount
  from public.personal_uses pu
  where pu.deleted_at is null and pu.at >= p_start and pu.at < p_end
  having coalesce(sum(pu.qty * pu.unit_value), 0) <> 0
$$;

grant execute on function public.income_by_period_breakdown(timestamptz, timestamptz) to authenticated;
grant select on public.v_wallet_balance, public.v_sales_enriched to authenticated;
