-- Partner card balance: current sell revenue minus personal use minus expenses.
-- Components come from v_partner_chalan_settlement scoped to chalans in [p_start, p_end).

drop function if exists public.partner_sell_summary(timestamptz, timestamptz);

create or replace function public.partner_sell_summary(p_start timestamptz, p_end timestamptz)
returns table (partner_id uuid, partner_name text, sell_revenue numeric, personal_use numeric, khoroch numeric, remaining_pcs bigint, balance numeric)
language sql security definer set search_path = public
as $$
  with sett as (
    select s.partner_id,
           sum(s.ext_rev) as sell,
           sum(s.consumption_due - s.internal_rev) as personal,
           sum(s.expenses_attributed - s.pocket_paid) as khoroch
    from public.v_partner_chalan_settlement s
    join public.chalans c on c.id = s.chalan_id
    where c.deleted_at is null
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  ),
  stock as (
    select pk.owner_partner_id as partner_id,
           sum(coalesce(public.packet_remaining(pk.id), 0)) as pcs
    from public.packets pk
    join public.chalans c on c.id = pk.chalan_id
    where pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      and c.purchase_date >= p_start and c.purchase_date < p_end
    group by 1
  )
  select p.id,
         p.name,
         coalesce(st.sell, 0) as sell_revenue,
         coalesce(st.personal, 0) as personal_use,
         coalesce(st.khoroch, 0) as khoroch,
         coalesce(so.pcs, 0) as remaining_pcs,
         coalesce(st.sell, 0) - coalesce(st.personal, 0) - coalesce(st.khoroch, 0) as balance
  from public.partners p
  left join sett st on st.partner_id = p.id
  left join stock so on so.partner_id = p.id
  where coalesce(st.sell, 0) <> 0 or coalesce(st.personal, 0) <> 0
      or coalesce(st.khoroch, 0) <> 0 or coalesce(so.pcs, 0) <> 0
$$;

grant execute on function public.partner_sell_summary(timestamptz, timestamptz) to authenticated;
