drop function public.dashboard_totals(timestamptz, timestamptz);

create or replace function public.dashboard_totals(
  p_start timestamptz default '-infinity'::timestamptz,
  p_end timestamptz default 'infinity'::timestamptz
)
returns table (
  income numeric,
  expenses numeric,
  landed_expenses numeric,
  discount_total numeric,
  realized_cost numeric,
  net_profit numeric,
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

grant execute on function public.dashboard_totals(timestamptz, timestamptz) to authenticated;
