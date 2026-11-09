-- Scope remaining stock in partner_sell_summary to the selected chalan period.

create or replace function public.partner_sell_summary(p_start timestamptz, p_end timestamptz)
returns table (partner_id uuid, partner_name text, sell_revenue numeric, remaining_pcs bigint, remaining_cost numeric, balance numeric)
language sql security definer set search_path = public
as $$
  with rev_rows as (
    select t.partner_id,
           t.share + (case when t.rn = 1 then t.amount_received - sum(t.share) over (partition by t.sale_id) else 0 end) as share
    from (
      select s.id as sale_id, pk.owner_partner_id as partner_id,
             round(s.amount_received * sum(sa.qty) / s.qty, 2) as share,
             s.amount_received,
             row_number() over (partition by s.id order by sum(sa.qty) desc, pk.owner_partner_id) as rn
      from public.sale_allocations sa
      join public.sales s on s.id = sa.sale_id and s.deleted_at is null
      join public.packets pk on pk.id = sa.packet_id
      join public.chalans c on c.id = pk.chalan_id
      where c.deleted_at is null
        and c.purchase_date >= p_start and c.purchase_date < p_end
      group by s.id, s.amount_received, s.qty, pk.owner_partner_id
    ) t
  ),
  rev as (
    select partner_id, sum(share) as amt from rev_rows group by 1
  ),
  stock as (
    select pk.owner_partner_id as partner_id,
           sum(coalesce(public.packet_remaining(pk.id), 0)) as pcs,
           sum(c.buy_rate * coalesce(public.packet_remaining(pk.id), 0)) as cost
    from public.packets pk
    join public.chalans c on c.id = pk.chalan_id
    where pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  )
  select p.id,
         p.name,
         coalesce(r.amt, 0) as sell_revenue,
         coalesce(st.pcs, 0) as remaining_pcs,
         coalesce(st.cost, 0) as remaining_cost,
         coalesce(r.amt, 0) - coalesce(st.cost, 0) as balance
  from public.partners p
  left join rev r on r.partner_id = p.id
  left join stock st on st.partner_id = p.id
  where coalesce(r.amt, 0) <> 0 or coalesce(st.pcs, 0) <> 0
$$;

grant execute on function public.partner_sell_summary(timestamptz, timestamptz) to authenticated;
