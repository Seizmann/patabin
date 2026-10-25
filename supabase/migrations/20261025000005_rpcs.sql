create or replace function public.assert_writeable() returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  if not coalesce(public.password_gate(), false) then
    raise exception 'CHANGE_PASSWORD_REQUIRED';
  end if;
end $$;

create or replace function public.available_pcs() returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(remaining), 0) from public.v_batch_stock
$$;

create or replace function public.create_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_kind text := p_sale ->> 'kind';
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_sold_at timestamptz := coalesce((p_sale ->> 'sold_at')::timestamptz, now());
  v_available numeric;
  v_take numeric;
  v_remaining numeric := v_qty;
  v_batch record;
begin
  perform public.assert_writeable();
  if v_kind not in ('external', 'internal') or v_qty is null or v_qty <= 0 then
    raise exception 'SALE_INVALID';
  end if;
  if v_kind = 'internal' then
    if p_sale -> 'partner_id' is null or p_sale -> 'received_by_partner_id' is not null then
      raise exception 'SALE_INVALID';
    end if;
    if not exists (select 1 from public.partners where id = (p_sale ->> 'partner_id')::uuid and deleted_at is null) then
      raise exception 'SALE_INVALID';
    end if;
  else
    if p_sale -> 'received_by_partner_id' is null or p_sale -> 'partner_id' is not null then
      raise exception 'SALE_INVALID';
    end if;
    if not exists (select 1 from public.partners where id = (p_sale ->> 'received_by_partner_id')::uuid and deleted_at is null) then
      raise exception 'SALE_INVALID';
    end if;
  end if;
  if (p_sale ->> 'list_unit_price')::numeric is null or (p_sale ->> 'list_unit_price')::numeric < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if (p_sale ->> 'amount_received')::numeric is null or (p_sale ->> 'amount_received')::numeric < 0 then
    raise exception 'SALE_INVALID';
  end if;
  if p_sale ->> 'payment_method' is not null and p_sale ->> 'payment_method' not in ('cash','bkash','nagad','rocket','bank','other') then
    raise exception 'SALE_INVALID';
  end if;
  v_available := public.available_pcs();
  if v_qty > v_available then
    raise exception 'NO_STOCK';
  end if;
  insert into public.sales (
    sold_at, kind, customer_name, partner_id, received_by_partner_id, qty,
    list_unit_price, amount_received, payment_method, note, created_by
  ) values (
    v_sold_at,
    v_kind,
    p_sale ->> 'customer_name',
    (p_sale ->> 'partner_id')::uuid,
    (p_sale ->> 'received_by_partner_id')::uuid,
    v_qty,
    (p_sale ->> 'list_unit_price')::numeric,
    (p_sale ->> 'amount_received')::numeric,
    p_sale ->> 'payment_method',
    nullif(p_sale ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  for v_batch in
    select bs.batch_id, bs.remaining
    from public.v_batch_stock bs
    join public.batches b on b.id = bs.batch_id
    where b.deleted_at is null and b.status = 'open' and bs.remaining > 0
    order by b.purchase_date, b.created_at
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_batch.remaining);
    insert into public.sale_allocations (sale_id, batch_id, qty) values (v_id, v_batch.batch_id, v_take);
    v_remaining := v_remaining - v_take;
  end loop;
  return v_id;
end $$;

create or replace function public.update_sale(p_id uuid, p_sale jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.sales;
  v_qty integer := (p_sale ->> 'qty')::integer;
  v_freed numeric;
  v_available numeric;
  v_take numeric;
  v_remaining numeric := v_qty;
  v_batch record;
begin
  perform public.assert_writeable();
  select * into v_old from public.sales where id = p_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if exists (select 1 from public.sale_allocations sa join public.batches b on b.id = sa.batch_id where sa.sale_id = p_id and (b.status = 'closed' or b.deleted_at is not null)) then
    raise exception 'BATCH_CLOSED';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'SALE_INVALID';
  end if;
  select sum(qty) into v_freed from public.sale_allocations where sale_id = p_id;
  v_available := public.available_pcs() + coalesce(v_freed, 0);
  if v_qty > v_available then
    raise exception 'NO_STOCK';
  end if;
  update public.sales set
    sold_at = coalesce((p_sale ->> 'sold_at')::timestamptz, v_old.sold_at),
    customer_name = p_sale ->> 'customer_name',
    partner_id = (p_sale ->> 'partner_id')::uuid,
    received_by_partner_id = (p_sale ->> 'received_by_partner_id')::uuid,
    qty = v_qty,
    list_unit_price = coalesce((p_sale ->> 'list_unit_price')::numeric, v_old.list_unit_price),
    amount_received = coalesce((p_sale ->> 'amount_received')::numeric, v_old.amount_received),
    payment_method = p_sale ->> 'payment_method',
    note = p_sale ->> 'note'
  where id = p_id;
  delete from public.sale_allocations where sale_id = p_id;
  for v_batch in
    select bs.batch_id, bs.remaining
    from public.v_batch_stock bs
    join public.batches b on b.id = bs.batch_id
    where b.deleted_at is null and b.status = 'open' and bs.remaining > 0
    order by b.purchase_date, b.created_at
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_batch.remaining);
    insert into public.sale_allocations (sale_id, batch_id, qty) values (p_id, v_batch.batch_id, v_take);
    v_remaining := v_remaining - v_take;
  end loop;
end $$;

create or replace function public.delete_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if exists (select 1 from public.sale_allocations sa join public.batches b on b.id = sa.batch_id where sa.sale_id = p_id and (b.status = 'closed' or b.deleted_at is not null)) then
    raise exception 'BATCH_CLOSED';
  end if;
  delete from public.sale_allocations where sale_id = p_id;
  update public.sales set deleted_at = now() where id = p_id and deleted_at is null;
end $$;

create or replace function public.create_batch(p_batch jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_unit numeric := coalesce((p_batch ->> 'unit_cost')::numeric, (select default_buy_rate from public.settings where id = 1));
  v_next integer;
  c jsonb;
begin
  perform public.assert_writeable();
  perform pg_advisory_xact_lock(hashtext('patabin_batch_code'));
  select coalesce(max(substring(code from 3)::integer), 0) + 1 into v_next
  from public.batches where code ~ '^B-\d{3,}$';
  v_code := 'B-' || lpad(v_next::text, 3, '0');
  insert into public.batches (code, purchase_date, unit_cost, pcs_per_packet, note, created_by)
  values (
    v_code,
    coalesce((p_batch ->> 'purchase_date')::timestamptz, now()),
    v_unit,
    (p_batch ->> 'pcs_per_packet')::integer,
    nullif(p_batch ->> 'note', ''),
    auth.uid()
  ) returning id into v_id;
  if jsonb_typeof(p_batch -> 'contributions') <> 'array' or jsonb_array_length(p_batch -> 'contributions') = 0 then
    raise exception 'BATCH_NO_CONTRIBUTIONS';
  end if;
  for c in select jsonb_array_elements(p_batch -> 'contributions') loop
    if (c ->> 'qty')::integer is null or (c ->> 'qty')::integer <= 0 or not exists (select 1 from public.partners where id = (c ->> 'partner_id')::uuid and deleted_at is null) then
      raise exception 'BATCH_CONTRIBUTION_INVALID';
    end if;
    insert into public.batch_contributions (batch_id, partner_id, qty, amount_paid, created_by)
    values (
      v_id,
      (c ->> 'partner_id')::uuid,
      (c ->> 'qty')::integer,
      coalesce((c ->> 'amount_paid')::numeric, round((c ->> 'qty')::integer * v_unit, 2)),
      auth.uid()
    );
  end loop;
  if coalesce((select sum(qty) from public.batch_contributions where batch_id = v_id), 0) = 0 then
    raise exception 'BATCH_NO_QTY';
  end if;
  if jsonb_typeof(p_batch -> 'expenses') = 'array' then
    for c in select jsonb_array_elements(p_batch -> 'expenses') loop
      if (c ->> 'amount')::numeric is null or (c ->> 'amount')::numeric <= 0
        or coalesce(c ->> 'category', 'other') not in ('transport','packaging','other')
        or coalesce(c ->> 'cost_type', 'operating') not in ('landed','operating')
        or coalesce(c ->> 'funding', 'own_pocket') not in ('own_pocket','sales_cash')
        or not exists (select 1 from public.partners where id = (c ->> 'paid_by_partner_id')::uuid and deleted_at is null) then
        raise exception 'BATCH_EXPENSE_INVALID';
      end if;
      insert into public.expenses (batch_id, spent_on, category, cost_type, amount, paid_by_partner_id, funding, note, created_by)
      values (
        v_id,
        coalesce((c ->> 'spent_on')::timestamptz, (p_batch ->> 'purchase_date')::timestamptz, now()),
        coalesce(c ->> 'category', 'other'),
        coalesce(c ->> 'cost_type', 'operating'),
        (c ->> 'amount')::numeric,
        (c ->> 'paid_by_partner_id')::uuid,
        coalesce(c ->> 'funding', 'own_pocket'),
        nullif(c ->> 'note', ''),
        auth.uid()
      );
    end loop;
  end if;
  return v_id;
end $$;

create or replace function public.close_batch(p_batch_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_remaining numeric;
  v_summary record;
  v_partners jsonb;
  v_payout record;
begin
  perform public.assert_writeable();
  select remaining into v_remaining from public.v_batch_stock where batch_id = p_batch_id;
  if v_remaining is null then
    raise exception 'BATCH_NOT_FOUND';
  end if;
  if v_remaining <> 0 then
    raise exception 'STOCK_LEFT';
  end if;
  update public.batches set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_batch_id and status = 'open';
  if not found then
    raise exception 'BATCH_ALREADY_CLOSED';
  end if;
  select * into v_summary from public.v_batch_summary where batch_id = p_batch_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'partner_id', v_payout.partner_id,
    'partner_name', v_payout.partner_name,
    'contribution', v_payout.contribution,
    'contribution_share', v_payout.contribution_share,
    'personal_value', v_payout.personal_value,
    'payout', v_payout.payout
  )), '[]'::jsonb) into v_partners
  from public.v_partner_batch_payout v_payout
  where v_payout.batch_id = p_batch_id;
  insert into public.batch_close_snapshots (batch_id, closed_at, closed_by, data)
  values (p_batch_id, now(), auth.uid(), jsonb_build_object(
    'summary', to_jsonb(v_summary),
    'partners', v_partners
  ))
  on conflict (batch_id) do update set closed_at = excluded.closed_at, closed_by = excluded.closed_by, data = excluded.data;
end $$;

create or replace function public.reopen_batch(p_batch_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_writeable();
  if not exists (select 1 from public.batches where id = p_batch_id and status = 'closed') then
    raise exception 'BATCH_NOT_CLOSED';
  end if;
  delete from public.batch_close_snapshots where batch_id = p_batch_id;
  update public.batches set status = 'open', closed_at = null, closed_by = null where id = p_batch_id;
end $$;

create or replace function public.complete_password_change() returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hash text;
  v_snapshot text;
begin
  if not coalesce(public.is_active_user(), false) then
    raise exception 'NOT_ACTIVE';
  end if;
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  select password_hash_snapshot into v_snapshot from public.profiles where id = auth.uid();
  if v_hash is not distinct from v_snapshot then
    raise exception 'PASSWORD_CHANGE_REQUIRED';
  end if;
  update public.profiles set must_change_password = false, password_hash_snapshot = v_hash where id = auth.uid();
end $$;

grant execute on function public.assert_writeable() to authenticated;
grant execute on function public.available_pcs() to authenticated;
grant execute on function public.create_sale(jsonb) to authenticated;
grant execute on function public.update_sale(uuid, jsonb) to authenticated;
grant execute on function public.delete_sale(uuid) to authenticated;
grant execute on function public.create_batch(jsonb) to authenticated;
grant execute on function public.close_batch(uuid) to authenticated;
grant execute on function public.reopen_batch(uuid) to authenticated;
grant execute on function public.complete_password_change() to authenticated;
