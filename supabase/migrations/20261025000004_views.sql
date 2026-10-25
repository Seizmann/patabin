alter table public.sales
  add column discount numeric(12,2)
  generated always as (qty * list_unit_price - amount_received) stored;

create or replace view public.v_batch_stock with (security_invoker = true) as
select
  b.id as batch_id,
  coalesce((select sum(c.qty) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null), 0) as total_pcs,
  coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'external' and s.deleted_at is null), 0) as sold_ext,
  coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'internal' and s.deleted_at is null), 0) as personal,
  coalesce((select sum(a.qty) from public.stock_adjustments a where a.batch_id = b.id and a.deleted_at is null), 0) as damaged,
  coalesce((select sum(c.qty) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null), 0)
    - coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'external' and s.deleted_at is null), 0)
    - coalesce((select sum(sa.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'internal' and s.deleted_at is null), 0)
    - coalesce((select sum(a.qty) from public.stock_adjustments a where a.batch_id = b.id and a.deleted_at is null), 0) as remaining
from public.batches b
where b.deleted_at is null;

create or replace view public.v_batch_summary with (security_invoker = true) as
select
  b.id as batch_id,
  v.total_pcs,
  v.sold_ext,
  v.personal,
  v.damaged,
  v.remaining,
  coalesce((select sum(c.amount_paid) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null), 0)
    + coalesce((select sum(e.amount) from public.expenses e where e.batch_id = b.id and e.deleted_at is null and e.cost_type = 'landed'), 0) as landed_pool,
  case
    when (select sum(c.qty) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null) = 0 then 0
    else
      (coalesce((select sum(c.amount_paid) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null), 0)
        + coalesce((select sum(e.amount) from public.expenses e where e.batch_id = b.id and e.deleted_at is null and e.cost_type = 'landed'), 0))
      / (select sum(c.qty) from public.batch_contributions c where c.batch_id = b.id and c.deleted_at is null)
  end as landed_cost_per_pc,
  coalesce((select sum(s.amount_received * sa.qty / s.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'external' and s.deleted_at is null), 0) as revenue_external,
  coalesce((select sum(s.amount_received * sa.qty / s.qty) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id where sa.batch_id = b.id and s.kind = 'internal' and s.deleted_at is null), 0) as revenue_internal,
  coalesce((select sum(e.amount) from public.expenses e where e.batch_id = b.id and e.deleted_at is null and e.cost_type = 'operating'), 0) as operating_expenses
from public.batches b
join public.v_batch_stock v on v.batch_id = b.id
where b.deleted_at is null;

create or replace view public.v_batch_profit with (security_invoker = true) as
select
  bs.batch_id,
  bs.revenue_external + bs.revenue_internal as revenue,
  bs.landed_cost_per_pc * (bs.sold_ext + bs.personal + bs.damaged) as realized_cost,
  bs.landed_cost_per_pc * bs.remaining as unsold_cost,
  bs.operating_expenses,
  bs.revenue_external + bs.revenue_internal - bs.landed_cost_per_pc * (bs.sold_ext + bs.personal + bs.damaged) - bs.operating_expenses as profit
from public.v_batch_summary bs;

create or replace view public.v_partner_batch_payout with (security_invoker = true) as
with contributions as (
  select
    c.batch_id,
    c.partner_id,
    c.amount_paid + coalesce((select sum(e.amount) from public.expenses e where e.batch_id = c.batch_id and e.deleted_at is null and e.funding = 'own_pocket' and e.paid_by_partner_id = c.partner_id), 0) as contribution
  from public.batch_contributions c
  where c.deleted_at is null
),
totals as (
  select batch_id, sum(contribution) as total_contribution from contributions group by batch_id
)
select
  b.id as batch_id,
  con.partner_id,
  pr.name as partner_name,
  con.contribution as contribution,
  con.contribution / nullif(t.total_contribution, 0) as contribution_share,
  coalesce((select sum(s.amount_received * sa.qty / s.qty) from public.sales s join public.sale_allocations sa on sa.sale_id = s.id and sa.batch_id = b.id where s.kind = 'internal' and s.partner_id = con.partner_id and s.deleted_at is null), 0) as personal_value,
  con.contribution
    - (con.contribution / nullif(t.total_contribution, 0)) * vp.unsold_cost
    + (con.contribution / nullif(t.total_contribution, 0)) * vp.profit
    - coalesce((select sum(s.amount_received * sa.qty / s.qty) from public.sales s join public.sale_allocations sa on sa.sale_id = s.id and sa.batch_id = b.id where s.kind = 'internal' and s.partner_id = con.partner_id and s.deleted_at is null), 0) as payout
from public.batches b
join contributions con on con.batch_id = b.id
join totals t on t.batch_id = b.id
join public.partners pr on pr.id = con.partner_id
join public.v_batch_profit vp on vp.batch_id = b.id
where b.status = 'open' and b.deleted_at is null
union all
select
  cs.batch_id,
  (el ->> 'partner_id')::uuid,
  el ->> 'partner_name',
  (el ->> 'contribution')::numeric(12,2),
  (el ->> 'contribution_share')::numeric,
  (el ->> 'personal_value')::numeric(12,2),
  (el ->> 'payout')::numeric(12,2)
from public.batch_close_snapshots cs
cross join lateral jsonb_array_elements(cs.data -> 'partners') el
join public.batches b on b.id = cs.batch_id and b.status = 'closed' and b.deleted_at is null;

create or replace view public.v_partner_balance with (security_invoker = true) as
select
  p.id as partner_id,
  p.name as partner_name,
  coalesce((select sum(vp.payout) from public.v_partner_batch_payout vp where vp.partner_id = p.id), 0) as entitlement,
  coalesce((select sum(s.amount_received) from public.sales s where s.kind = 'external' and s.deleted_at is null and s.received_by_partner_id = p.id), 0)
    - coalesce((select sum(e.amount) from public.expenses e join public.batches b on b.id = e.batch_id where e.funding = 'sales_cash' and e.deleted_at is null and b.deleted_at is null and e.paid_by_partner_id = p.id), 0)
    - coalesce((select sum(t.amount) from public.transfers t where t.from_partner_id = p.id and t.deleted_at is null), 0)
    + coalesce((select sum(t.amount) from public.transfers t where t.to_partner_id = p.id and t.deleted_at is null), 0) as cash_held,
  coalesce((select sum(vp.payout) from public.v_partner_batch_payout vp where vp.partner_id = p.id), 0)
    - coalesce((select sum(s.amount_received) from public.sales s where s.kind = 'external' and s.deleted_at is null and s.received_by_partner_id = p.id), 0)
    + coalesce((select sum(e.amount) from public.expenses e join public.batches b on b.id = e.batch_id where e.funding = 'sales_cash' and e.deleted_at is null and b.deleted_at is null and e.paid_by_partner_id = p.id), 0)
    + coalesce((select sum(t.amount) from public.transfers t where t.from_partner_id = p.id and t.deleted_at is null), 0)
    - coalesce((select sum(t.amount) from public.transfers t where t.to_partner_id = p.id and t.deleted_at is null), 0) as balance
from public.partners p
where p.deleted_at is null;

create or replace view public.v_sales_enriched with (security_invoker = true) as
select
  s.id,
  s.sold_at,
  s.kind,
  s.customer_name,
  cp.name as customer_partner_name,
  rp.name as received_by_name,
  s.qty,
  s.list_unit_price,
  s.amount_received,
  s.discount,
  s.discount * 100.0 / nullif(s.qty * s.list_unit_price, 0) as discount_pct,
  s.payment_method,
  s.note,
  s.created_at,
  coalesce((select string_agg(distinct b.code, ', ') from public.sale_allocations sa join public.batches b on b.id = sa.batch_id where sa.sale_id = s.id), '') as batch_codes,
  coalesce((select sum(sa.qty) from public.sale_allocations sa where sa.sale_id = s.id), 0) = s.qty as allocation_complete
from public.sales s
left join public.partners cp on cp.id = s.partner_id
left join public.partners rp on rp.id = s.received_by_partner_id
where s.deleted_at is null;

create or replace view public.v_dashboard_day with (security_invoker = true) as
select
  date_trunc('day', s.sold_at at time zone 'Asia/Dhaka') as day,
  coalesce(sum(s.amount_received), 0) as income
from public.sales s
where s.deleted_at is null
group by date_trunc('day', s.sold_at at time zone 'Asia/Dhaka');

create or replace function public.dashboard_totals(
  p_start timestamptz default '-infinity'::timestamptz,
  p_end timestamptz default 'infinity'::timestamptz
)
returns table (
  income numeric,
  expenses numeric,
  landed_expenses numeric,
  discount_total numeric,
  sold_cost numeric,
  realized_profit numeric,
  list_value numeric,
  cash_received numeric,
  stock_current numeric
)
language sql stable security invoker set search_path = public, extensions
as $$
  select
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.cost_type = 'operating' and e.spent_on >= p_start and e.spent_on < p_end),
    (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.cost_type = 'landed' and e.spent_on >= p_start and e.spent_on < p_end),
    (select coalesce(sum(s.discount), 0) from public.sales s where s.deleted_at is null and s.kind = 'external' and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(sa.qty * coalesce(bs.landed_cost_per_pc, 0)), 0) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end join public.v_batch_summary bs on bs.batch_id = sa.batch_id)
      + (select coalesce(sum(a.qty * coalesce(bs.landed_cost_per_pc, 0)), 0) from public.stock_adjustments a join public.v_batch_summary bs on bs.batch_id = a.batch_id where a.deleted_at is null and a.adjusted_on >= p_start and a.adjusted_on < p_end),
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end)
      - (select coalesce(sum(sa.qty * coalesce(bs.landed_cost_per_pc, 0)), 0) from public.sale_allocations sa join public.sales s on s.id = sa.sale_id and s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end join public.v_batch_summary bs on bs.batch_id = sa.batch_id)
      - (select coalesce(sum(a.qty * coalesce(bs.landed_cost_per_pc, 0)), 0) from public.stock_adjustments a join public.v_batch_summary bs on bs.batch_id = a.batch_id where a.deleted_at is null and a.adjusted_on >= p_start and a.adjusted_on < p_end)
      - (select coalesce(sum(e.amount), 0) from public.expenses e where e.deleted_at is null and e.cost_type = 'operating' and e.spent_on >= p_start and e.spent_on < p_end),
    (select coalesce(sum(s.qty * s.list_unit_price), 0) from public.sales s where s.deleted_at is null and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(s.amount_received), 0) from public.sales s where s.deleted_at is null and s.kind = 'external' and s.sold_at >= p_start and s.sold_at < p_end),
    (select coalesce(sum(remaining), 0) from public.v_batch_stock)
$$;

create or replace function public.income_by_period_breakdown(p_start timestamptz, p_end timestamptz)
returns table (
  slice text,
  amount numeric
)
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(s.payment_method, 'unspecified') as slice, coalesce(sum(s.amount_received), 0) as amount
  from public.sales s
  where s.deleted_at is null and s.kind = 'external' and s.sold_at >= p_start and s.sold_at < p_end
  group by coalesce(s.payment_method, 'unspecified')
  union all
  select 'personal' as slice, coalesce(sum(s.amount_received), 0) as amount
  from public.sales s
  where s.deleted_at is null and s.kind = 'internal' and s.sold_at >= p_start and s.sold_at < p_end
  having coalesce(sum(s.amount_received), 0) <> 0
$$;

grant execute on function public.dashboard_totals(timestamptz, timestamptz) to authenticated;
grant execute on function public.income_by_period_breakdown(timestamptz, timestamptz) to authenticated;
