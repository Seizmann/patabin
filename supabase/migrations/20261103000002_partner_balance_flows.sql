-- Period-scoped partner balances for the dashboard donut.
-- Mirrors v_partner_balance but scoped to chalans/flows inside [p_start, p_end).

create or replace function public.partner_balance_flows(p_start timestamptz, p_end timestamptz)
returns table (partner_id uuid, partner_name text, balance numeric)
language sql security definer set search_path = public
as $$
  with live as (
    select s.partner_id, sum(s.entitlement) as amt
    from public.v_partner_chalan_settlement s
    join public.chalans c on c.id = s.chalan_id
    where c.status = 'open' and c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  ), closed as (
    select (el.value ->> 'partner_id')::uuid as partner_id,
           sum((el.value ->> 'entitlement')::numeric(12,2)) as amt
    from public.chalan_close_snapshots cs
    join public.chalans c on c.id = cs.chalan_id and c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    cross join lateral jsonb_array_elements(cs.data -> 'partners') el(value)
    group by 1
  ), charges as (
    select wt.attributed_to_partner_id as partner_id, sum(wt.charge) as amt
    from public.wallet_transfers wt
    where wt.deleted_at is null and wt.at >= p_start and wt.at < p_end
    group by 1
  ), unlinked_exp as (
    select e.attributed_to_partner_id as partner_id, sum(e.amount) as amt
    from public.expenses e
    where e.deleted_at is null and e.chalan_id is null
      and e.spent_at >= p_start and e.spent_at < p_end
    group by 1
  ), unlinked_pocket as (
    select e.paid_by_partner_id as partner_id, sum(e.amount) as amt
    from public.expenses e
    where e.deleted_at is null and e.chalan_id is null and e.wallet_account_id is null
      and e.spent_at >= p_start and e.spent_at < p_end
    group by 1
  ), taken as (
    select wd.partner_id, sum(wd.amount) as amt
    from public.withdrawals wd
    where wd.deleted_at is null and wd.at >= p_start and wd.at < p_end
    group by 1
  )
  select p.id,
         p.name,
         coalesce(li.amt, 0) + coalesce(cl.amt, 0) - coalesce(ch.amt, 0)
         - coalesce(ux.amt, 0) + coalesce(uk.amt, 0) - coalesce(tk.amt, 0) as balance
  from public.partners p
  left join live li on li.partner_id = p.id
  left join closed cl on cl.partner_id = p.id
  left join charges ch on ch.partner_id = p.id
  left join unlinked_exp ux on ux.partner_id = p.id
  left join unlinked_pocket uk on uk.partner_id = p.id
  left join taken tk on tk.partner_id = p.id
  where coalesce(li.amt, 0) + coalesce(cl.amt, 0) - coalesce(ch.amt, 0)
        - coalesce(ux.amt, 0) + coalesce(uk.amt, 0) - coalesce(tk.amt, 0) <> 0
$$;

grant execute on function public.partner_balance_flows(timestamptz, timestamptz) to authenticated;
