-- custom packet allocation: sale payloads may carry allocations = [{packet_id, qty}]
-- when absent the priority-based auto allocation (allocate_by_priority) is used as before.

create or replace function public.create_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_price numeric := (p_sale ->> 'list_unit_price')::numeric;
  v_wallet uuid := (p_sale ->> 'wallet_account_id')::uuid;
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
  v_received numeric := (p_sale ->> 'amount_received')::numeric;
  v_sum numeric := 0;
  r jsonb;
begin
  perform public.assert_writeable();
  if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0
    or v_received is null or v_received < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_due < 0 or v_due + v_received > v_qty * v_price then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
  end if;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      v_sum := v_sum + coalesce((r ->> 'amount')::numeric, 0);
      if not exists (select 1 from public.wallets where id = (r ->> 'wallet_account_id')::uuid and is_active) then
        raise exception 'SALE_WALLET_INVALID';
      end if;
    end loop;
    if v_sum <> v_received then
      raise exception 'RECEIVE_SPLIT_MISMATCH';
    end if;
  elsif not exists (select 1 from public.wallets where id = v_wallet and is_active) then
    raise exception 'SALE_WALLET_INVALID';
  end if;
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    if (
      select sum((x ->> 'qty')::numeric)
      from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is not null and (x ->> 'qty')::numeric is not null and (x ->> 'qty')::numeric > 0
    ) <> v_qty
    or exists (
      select 1 from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is null or (x ->> 'qty')::numeric is null or (x ->> 'qty')::numeric <= 0
    ) then
      raise exception 'ALLOC_MISMATCH';
    end if;
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      if not exists (
        select 1 from public.packets pk join public.chalans c on c.id = pk.chalan_id
        where pk.id = r.pid and pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      ) then
        raise exception 'PACKET_NOT_FOUND';
      end if;
      if r.q > public.packet_remaining(r.pid) then
        raise exception 'NO_STOCK';
      end if;
    end loop;
  end if;
  insert into public.sales (sold_at, qty, list_unit_price, amount_received, due_amount, customer_id, customer_name, customer_phone, wallet_account_id, note, created_by)
  values (
    coalesce((p_sale ->> 'sold_at')::timestamptz, now()),
    v_qty, v_price, v_received, v_due,
    (p_sale ->> 'customer_id')::uuid,
    nullif(p_sale ->> 'customer_name', ''),
    nullif(p_sale ->> 'customer_phone', ''),
    v_wallet,
    nullif(p_sale ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
      values (v_id, (r ->> 'wallet_account_id')::uuid, (r ->> 'amount')::numeric, auth.uid());
    end loop;
  else
    insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
    values (v_id, v_wallet, v_received, auth.uid());
  end if;
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      insert into public.sale_allocations (sale_id, packet_id, qty) values (v_id, r.pid, r.q);
    end loop;
  else
    perform public.allocate_by_priority(v_id, v_qty);
  end if;
  return v_id;
end $$;

create or replace function public.update_sale(p_id uuid, p_sale jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.sales;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_due numeric := coalesce((p_sale ->> 'due_amount')::numeric, 0);
  v_received numeric := coalesce((p_sale ->> 'amount_received')::numeric, v_old.amount_received);
  v_freed numeric;
  v_avail numeric;
  v_sum numeric := 0;
  r jsonb;
begin
  perform public.assert_writeable();
  select * into v_old from public.sales where id = p_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_due < 0 or v_due + v_received > v_qty * coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price) then
    raise exception 'SALE_INVALID';
  end if;
  if v_due > 0 and (p_sale ->> 'customer_id')::uuid is null and v_old.customer_id is null then
    raise exception 'SALE_DUE_NEEDS_CUSTOMER';
  end if;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      v_sum := v_sum + coalesce((r ->> 'amount')::numeric, 0);
      if not exists (select 1 from public.wallets where id = (r ->> 'wallet_account_id')::uuid and is_active) then
        raise exception 'SALE_WALLET_INVALID';
      end if;
    end loop;
    if v_sum <> v_received then
      raise exception 'RECEIVE_SPLIT_MISMATCH';
    end if;
  end if;
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    if (
      select sum((x ->> 'qty')::numeric)
      from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is not null and (x ->> 'qty')::numeric is not null and (x ->> 'qty')::numeric > 0
    ) <> v_qty
    or exists (
      select 1 from jsonb_array_elements(p_sale -> 'allocations') x
      where (x ->> 'packet_id') is null or (x ->> 'qty')::numeric is null or (x ->> 'qty')::numeric <= 0
    ) then
      raise exception 'ALLOC_MISMATCH';
    end if;
  end if;
  if exists (
    select 1 from public.sale_allocations sa
    join public.packets pk on pk.id = sa.packet_id
    join public.chalans c on c.id = pk.chalan_id
    where sa.sale_id = p_id and (c.status = 'closed' or c.deleted_at is not null or pk.deleted_at is not null)
  ) then
    raise exception 'CHALAN_CLOSED';
  end if;
  select sum(qty) into v_freed from public.sale_allocations where sale_id = p_id;
  v_freed := coalesce(v_freed, 0);
  delete from public.sale_allocations where sale_id = p_id;
  select coalesce(sum(public.packet_remaining(pk.id)), 0) into v_avail from public.packets pk
  join public.chalans c on c.id = pk.chalan_id
  where pk.deleted_at is null and c.deleted_at is null and c.status = 'open';
  if v_qty > v_avail + v_freed then
    raise exception 'NO_STOCK';
  end if;
  update public.sales set
    sold_at = coalesce((p_sale ->> 'sold_at')::timestamptz, v_old.sold_at),
    qty = v_qty,
    list_unit_price = coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price),
    amount_received = v_received,
    due_amount = v_due,
    customer_id = (p_sale ->> 'customer_id')::uuid,
    customer_name = nullif(p_sale ->> 'customer_name', ''),
    customer_phone = nullif(p_sale ->> 'customer_phone', ''),
    wallet_account_id = coalesce(v_old.wallet_account_id, (select wallet_account_id from public.sale_receives where sale_id = p_id limit 1)),
    note = nullif(p_sale ->> 'note', '')
  where id = p_id;
  delete from public.sale_receives where sale_id = p_id;
  if jsonb_typeof(p_sale -> 'receives') = 'array' then
    for r in select jsonb_array_elements(p_sale -> 'receives') loop
      insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
      values (p_id, (r ->> 'wallet_account_id')::uuid, (r ->> 'amount')::numeric, auth.uid());
    end loop;
  else
    insert into public.sale_receives (sale_id, wallet_account_id, amount, created_by)
    values (p_id, coalesce(v_old.wallet_account_id, (select wallet_account_id from public.sale_receives where sale_id = p_id limit 1)), v_received, auth.uid());
  end if;
  if jsonb_typeof(p_sale -> 'allocations') = 'array' then
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      if not exists (
        select 1 from public.packets pk join public.chalans c on c.id = pk.chalan_id
        where pk.id = r.pid and pk.deleted_at is null and c.deleted_at is null and c.status = 'open'
      ) then
        raise exception 'PACKET_NOT_FOUND';
      end if;
      if r.q > public.packet_remaining(r.pid) then
        raise exception 'NO_STOCK';
      end if;
    end loop;
    for r in
      select (x ->> 'packet_id')::uuid as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_sale -> 'allocations') x
      group by 1
    loop
      insert into public.sale_allocations (sale_id, packet_id, qty) values (p_id, r.pid, r.q);
    end loop;
  else
    perform public.allocate_by_priority(p_id, v_qty);
  end if;
end $$;
