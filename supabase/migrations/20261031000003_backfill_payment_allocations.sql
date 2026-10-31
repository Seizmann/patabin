-- backfill packet-level allocation for due payments recorded before due tracking existed
do $$
declare
  p record;
  r record;
  a record;
  v_left numeric;
  v_take numeric;
  v_total_qty numeric;
  v_alloc_sum numeric;
  v_part numeric;
  v_cnt integer;
  v_i integer;
begin
  for p in
    select cp.id, cp.customer_id, cp.amount
    from public.customer_payments cp
    where cp.deleted_at is null
      and not exists (select 1 from public.customer_payment_allocations cpa where cpa.payment_id = cp.id)
    order by cp.at, cp.created_at, cp.id
  loop
    v_left := p.amount;
    for r in
      select s.id,
        s.due_amount - coalesce((
          select sum(cpa.amount)
          from public.customer_payment_allocations cpa
          join public.customer_payments cp2 on cp2.id = cpa.payment_id
          where cpa.sale_id = s.id and cp2.deleted_at is null
        ), 0) as due
      from public.sales s
      where s.customer_id = p.customer_id
        and s.deleted_at is null
        and s.due_amount > 0
        and exists (select 1 from public.sale_allocations sa where sa.sale_id = s.id)
      order by s.sold_at, s.created_at
    loop
      exit when v_left <= 0;
      v_take := least(v_left, greatest(r.due, 0));
      if v_take > 0 then
        select coalesce(sum(sa.qty), 0), count(*) into v_total_qty, v_cnt
        from public.sale_allocations sa where sa.sale_id = r.id;
        if v_cnt > 0 and v_total_qty > 0 then
          v_alloc_sum := 0;
          v_i := 0;
          for a in
            select sa.packet_id, sa.qty from public.sale_allocations sa
            where sa.sale_id = r.id order by sa.packet_id
          loop
            v_i := v_i + 1;
            if v_i = v_cnt then
              v_part := round(v_take - v_alloc_sum, 2);
            else
              v_part := round(v_take * a.qty / v_total_qty, 2);
            end if;
            if v_part > 0 then
              insert into public.customer_payment_allocations (payment_id, sale_id, packet_id, amount)
              values (p.id, r.id, a.packet_id, v_part);
              v_alloc_sum := v_alloc_sum + v_part;
            end if;
          end loop;
        end if;
      end if;
      v_left := v_left - v_take;
    end loop;
  end loop;
end $$;
